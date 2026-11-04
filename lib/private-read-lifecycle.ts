/** In-memory request fences only. This module never stores a response or credential. */
export type PrivateReadSnapshot = Readonly<{identity:string; groupId:string|null; epoch:number; authEpoch:number; clearEpoch:number; blocked:boolean;authError:string;deferredAuth:boolean}>;
let snapshot:PrivateReadSnapshot=Object.freeze({identity:'',groupId:null,epoch:0,authEpoch:0,clearEpoch:0,blocked:false,authError:'',deferredAuth:false});
let writes=0,authPending=false;
const listeners=new Set<()=>void>();
export function getPrivateReadSnapshot(){return snapshot;}
export function subscribePrivateReadLifecycle(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
function publish(update:Partial<PrivateReadSnapshot>={}){
  snapshot=Object.freeze({...snapshot,...update,blocked:authPending||writes>0});
  for(const listener of [...listeners])listener();
}
export function invalidatePrivateReads(_reason:string,{auth=false,clear=false,authFence=false}:{auth?:boolean;clear?:boolean;authFence?:boolean}={}){
  if(auth)authPending=true;
  publish({epoch:snapshot.epoch+1,authEpoch:snapshot.authEpoch+(auth||authFence?1:0),clearEpoch:snapshot.clearEpoch+(clear?1:0)});
}
export function setPrivateReadIdentity(identity:string,groupId:string|null|undefined){
  const group=groupId||null;
  if(identity===snapshot.identity&&group===snapshot.groupId)return;
  authPending=false;
  publish({identity,groupId:group,epoch:snapshot.epoch+1,authEpoch:snapshot.authEpoch+1,clearEpoch:snapshot.clearEpoch+1,authError:'',deferredAuth:false});
}
export function beginPrivateAuthCheck(){
  if(!authPending)invalidatePrivateReads('auth-check',{auth:true});
  if(snapshot.authError)publish({authError:''});
  return snapshot.authEpoch;
}
export function completePrivateAuthCheck(identity:string,groupId:string|null|undefined,expectedEpoch=snapshot.authEpoch){
  if(expectedEpoch!==snapshot.authEpoch)return false;
  const group=groupId||null,changed=identity!==snapshot.identity||group!==snapshot.groupId;
  const wasPending=authPending;authPending=false;
  if(changed||wasPending)publish({identity,groupId:group,epoch:snapshot.epoch+1,clearEpoch:snapshot.clearEpoch+(changed?1:0),authError:'',deferredAuth:false});
  return true;
}
export function failPrivateAuthCheck(expectedEpoch:number,message:string){
  if(expectedEpoch===snapshot.authEpoch&&authPending)publish({authError:message});
}
let channel:BroadcastChannel|null=null,eventUsers=0,removeEvents:(()=>void)|null=null;
function broadcast(auth:boolean){channel?.postMessage({type:auth?'auth':'write'});}
export function beginPrivateMutation({auth=false,deferAuth=false}:{auth?:boolean;deferAuth?:boolean}={}){
  if(auth)snapshot=Object.freeze({...snapshot,deferredAuth:deferAuth,authError:''});
  writes++;invalidatePrivateReads('write-start',{auth,authFence:true,clear:auth});broadcast(auth);
  let finished=false;
  return({resumeAuth=false}:{resumeAuth?:boolean}={})=>{if(finished)return;finished=true;
    if(resumeAuth)snapshot=Object.freeze({...snapshot,deferredAuth:false});
    writes=Math.max(0,writes-1);invalidatePrivateReads('write-end',{auth,authFence:true,clear:auth});broadcast(auth);
    if(authPending&&!snapshot.deferredAuth&&typeof window!=='undefined')queueMicrotask(()=>window.dispatchEvent(new Event('timelyo:auth-refresh')));
  };
}
/** Ref-counted installation; events carry invalidation only, never private data. */
export function installPrivateReadEvents(){
  if(typeof window==='undefined')return()=>{};
  eventUsers++;
  let released=false;
  const release=()=>{if(released)return;released=true;if(--eventUsers===0){removeEvents?.();removeEvents=null;}};
  if(eventUsers>1)return release;
  const changed=()=>invalidatePrivateReads('data-changed');
  const auth=()=>{if(!snapshot.deferredAuth)beginPrivateAuthCheck();};
  let lastForeground=0;
  const foreground=()=>{
    if(snapshot.deferredAuth||document.visibilityState==='hidden'||Date.now()-lastForeground<300)return;
    lastForeground=Date.now();invalidatePrivateReads('foreground',{auth:true});window.dispatchEvent(new Event('timelyo:auth-refresh'));
  };
  const message=(event:MessageEvent)=>{
    if(event.data?.type==='auth'){invalidatePrivateReads('cross-tab-auth',{auth:true,clear:true});window.dispatchEvent(new Event('timelyo:auth-refresh'));}
    else if(event.data?.type==='write'){invalidatePrivateReads('cross-tab-write',{authFence:true});window.dispatchEvent(new Event('tickminder:data-changed'));if(authPending&&!snapshot.deferredAuth)window.dispatchEvent(new Event('timelyo:auth-refresh'));}
  };
  channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('tickminder-private-read-lifecycle');channel?.addEventListener('message',message);
  window.addEventListener('tickminder:data-changed',changed,true);window.addEventListener('timelyo:auth-refresh',auth,true);
  window.addEventListener('focus',foreground,true);document.addEventListener('visibilitychange',foreground,true);
  removeEvents=()=>{
    channel?.close();channel=null;
    window.removeEventListener('tickminder:data-changed',changed,true);window.removeEventListener('timelyo:auth-refresh',auth,true);
    window.removeEventListener('focus',foreground,true);document.removeEventListener('visibilitychange',foreground,true);
  };
  return release;
}
