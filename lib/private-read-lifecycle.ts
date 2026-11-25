/** In-memory request fences only. This module never stores a response or credential. */
export type PrivateReadSnapshot = Readonly<{identity:string; groupId:string|null; epoch:number; authEpoch:number; clearEpoch:number; dataEpoch:number; blocked:boolean;authError:string;deferredAuth:boolean}>;
let snapshot:PrivateReadSnapshot=Object.freeze({identity:'',groupId:null,epoch:0,authEpoch:0,clearEpoch:0,dataEpoch:0,blocked:false,authError:'',deferredAuth:false});
let writes=0,authPending=false;
export type PrivateReadDomain='global'|'quiz-images';
const listeners=new Set<()=>void>(),imageListeners=new Set<()=>void>();
let imageSnapshot=snapshot,imageWrites=0,imageDirty=false;
export function getPrivateReadSnapshot(domain:PrivateReadDomain='global'){return domain==='quiz-images'?imageSnapshot:snapshot;}
export function subscribePrivateReadLifecycle(listener:()=>void,domain:PrivateReadDomain='global'){
  const target=domain==='quiz-images'?imageListeners:listeners;
  target.add(listener);return()=>{target.delete(listener);};
}
function publishImages(changed=false){
  imageSnapshot=Object.freeze({...snapshot,epoch:imageSnapshot.epoch+1,dataEpoch:imageSnapshot.dataEpoch+(changed?1:0),blocked:snapshot.blocked||imageWrites>0});
  for(const listener of [...imageListeners])listener();
}
function publish(update:Partial<PrivateReadSnapshot>={}){
  if(update.clearEpoch!==undefined&&update.clearEpoch!==snapshot.clearEpoch)imageDirty=false;
  snapshot=Object.freeze({...snapshot,...update,blocked:authPending||writes>0});
  publishImages(true); // Global/security boundaries always fence every domain.
  for(const listener of [...listeners])listener();
}
/** Local barriers nest: a batch owns one barrier until every upload has drained.
 * Only settled successful/unknown outcomes produce one cross-tab domain change. */
export function beginPrivateImageMutation(){
  const context=snapshot;
  if(imageWrites++===0)publishImages();
  let finished=false;
  return({changed=true}:{changed?:boolean}={})=>{
    if(finished)return;finished=true;
    if(changed&&context.clearEpoch===snapshot.clearEpoch)imageDirty=true;
    if(--imageWrites===0){
      const dirty=imageDirty;imageDirty=false;publishImages(dirty);
      if(dirty)broadcastImages();
    }
  };
}
export function invalidatePrivateReads(reason:string,{auth=false,clear=false,authFence=false}:{auth?:boolean;clear?:boolean;authFence?:boolean}={}){
  if(auth)authPending=true;
  const changed=['data-changed','write-start','write-end','cross-tab-write','manual-refresh'].includes(reason);
  publish({epoch:snapshot.epoch+1,authEpoch:snapshot.authEpoch+(auth||authFence?1:0),clearEpoch:snapshot.clearEpoch+(clear?1:0),dataEpoch:snapshot.dataEpoch+(changed?1:0)});
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
function broadcastImages(){channel?.postMessage({type:'domain-write',version:1,domain:'quiz-images',groupId:snapshot.groupId,id:crypto.randomUUID()});}
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
  const foreground=(event:Event)=>{
    // Capture also receives focus on inputs/buttons. Only the window itself
    // returning to the foreground requires the cookie/authority check.
    if(event.type==='focus'&&event.target!==window)return;
    if(snapshot.deferredAuth||document.visibilityState==='hidden'||Date.now()-lastForeground<300)return;
    lastForeground=Date.now();invalidatePrivateReads('foreground',{auth:true});window.dispatchEvent(new Event('timelyo:auth-refresh'));
  };
  // Bounded replay window; invalidation envelopes contain no private payload.
  const seen=new Set<string>();
  const message=(event:MessageEvent)=>{
    const data=event.data;
    if(data?.type==='domain-write'&&data.version===1&&data.domain==='quiz-images'){
      if(data.groupId!==snapshot.groupId||typeof data.id!=='string'||!/^[a-f0-9-]{36}$/.test(data.id)||seen.has(data.id))return;
      seen.add(data.id);if(seen.size>256)seen.delete(seen.values().next().value!);
      publishImages(true);return;
    }
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
