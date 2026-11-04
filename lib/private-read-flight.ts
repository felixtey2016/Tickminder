import {getPrivateReadSnapshot,subscribePrivateReadLifecycle} from './private-read-lifecycle';

export class PrivateReadInvalidatedError extends Error{
  constructor(public clear=false){super('Private read invalidated');this.name='PrivateReadInvalidatedError';}
}
type Kind='workspace'|'courses'|'auth'|'navigation';
type Options<T>={kind:Kind;identity:string;url:string;signal?:AbortSignal;load:(signal:AbortSignal)=>Promise<unknown>;validate:(value:unknown)=>T};
type Subscriber={resolve:(value:unknown)=>void;reject:(error:unknown)=>void;cleanup:()=>void};
type Entry={controller:AbortController;subscribers:Set<Subscriber>;epoch:number;clearEpoch:number;auth:boolean;kind:Kind;timer:ReturnType<typeof setTimeout>};
const paths:Record<Kind,string>={workspace:'/api/workspace-data',courses:'/api/courses',auth:'/api/auth',navigation:'/api/home-summary'};
const abortError=()=>new DOMException('The read was cancelled','AbortError');
export function createPrivateReadFlight({timeoutMs=30_000,maxPending=32}:{timeoutMs?:number;maxPending?:number}={}){
  const entries=new Map<string,Entry>();
  function end(key:string,entry:Entry,error?:unknown,value?:unknown){
    if(entries.get(key)!==entry)return;
    entries.delete(key);clearTimeout(entry.timer);
    for(const subscriber of entry.subscribers){subscriber.cleanup();if(error)subscriber.reject(error);else{try{subscriber.resolve(structuredClone(value));}catch(copyError){subscriber.reject(copyError);}}}
    entry.subscribers.clear();
  }
  const unsubscribe=subscribePrivateReadLifecycle(()=>{
    const state=getPrivateReadSnapshot();
    for(const [key,entry] of entries){if(entry.epoch!==(entry.auth?state.authEpoch:state.epoch)){
      end(key,entry,new PrivateReadInvalidatedError(state.clearEpoch!==entry.clearEpoch));entry.controller.abort();
    }}
  });
  function read<T>(options:Options<T>):Promise<T>{
    const state=getPrivateReadSnapshot(),auth=options.kind==='auth';
    if(options.signal?.aborted)return Promise.reject(abortError());
    const url=new URL(options.url,'https://private-read.invalid');
    if(url.origin!=='https://private-read.invalid'||url.pathname!==paths[options.kind]||url.hash||(auth&&url.search))return Promise.reject(new Error('Unsupported private read contract'));
    if(!auth&&(state.blocked||options.identity!==state.identity))return Promise.reject(new PrivateReadInvalidatedError(options.identity!==state.identity));
    const epoch=auth?state.authEpoch:state.epoch,key=JSON.stringify([options.kind,options.identity,state.groupId,epoch,url.pathname+url.search]);
    let entry=entries.get(key),start=false;
    if(!entry){
      if(entries.size>=maxPending)return Promise.reject(new Error('Too many pending reads'));
      const controller=new AbortController();
      entry={controller,subscribers:new Set(),epoch,clearEpoch:state.clearEpoch,auth,kind:options.kind,timer:setTimeout(()=>{},0)};
      clearTimeout(entry.timer);
      const created=entry;entry.timer=setTimeout(()=>{end(key,created,new Error('Request timed out'));controller.abort();},Math.max(1,timeoutMs));
      entries.set(key,entry);start=true;
    }
    const current=entry;
    const result=new Promise<T>((resolve,reject)=>{
      const subscriber:Subscriber={resolve:value=>resolve(value as T),reject,cleanup:()=>options.signal?.removeEventListener('abort',cancel)};
      const cancel=()=>{subscriber.cleanup();current.subscribers.delete(subscriber);reject(abortError());if(!current.subscribers.size){end(key,current,abortError());current.controller.abort();}};
      current.subscribers.add(subscriber);options.signal?.addEventListener('abort',cancel,{once:true});
    });
    if(start){
      // Start synchronously: the transport captures the same group/context as its key.
      let loaded:Promise<unknown>;try{loaded=options.load(current.controller.signal);}catch(error){loaded=Promise.reject(error);}
      void loaded.then(value=>{
        if(entries.get(key)!==current)return;
        const now=getPrivateReadSnapshot();
        if(epoch!==(auth?now.authEpoch:now.epoch))throw new PrivateReadInvalidatedError(now.clearEpoch!==current.clearEpoch);
        return options.validate(value);
      }).then(value=>end(key,current,undefined,value),error=>end(key,current,error));
    }
    return result;
  }
  return{read,hasPending(kind:Kind){return [...entries.values()].some(entry=>entry.kind===kind);},dispose(){unsubscribe();for(const [key,entry] of entries){end(key,entry,abortError());entry.controller.abort();}}};
}
export const privateReadFlight=createPrivateReadFlight();
