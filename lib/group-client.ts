import {observeApiResponse,observeApiFailure} from "./diagnostics-client";
import {beginPrivateMutation,beginPrivateQuizMutation,invalidatePrivateReads,getPrivateReadSnapshot} from './private-read-lifecycle';
import {PrivateReadInvalidatedError} from './private-read-flight';
let currentGroupId: string | null = null;
export function setClientGroup(id: string | null | undefined) { currentGroupId = id || null; }
export function groupFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (currentGroupId) headers.set("x-tickminder-group",currentGroupId);
  const method=(init?.method||(typeof Request!=='undefined'&&input instanceof Request?input.method:'GET')).toUpperCase();
  const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  const base=typeof location==='undefined'?'https://tickminder.invalid':location.origin,url=new URL(raw,base),local=url.origin===base;
  const write=local&&url.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(method);
  const authRead=local&&url.pathname==='/api/auth'&&method==='GET',authEpoch=getPrivateReadSnapshot().authEpoch;
  // Narrow allowlist: only the known quiz & quiz-image contracts are independent.
  // Unknown routes/methods keep the conservative global mutation path.
  const quizWrite=write&&((url.pathname==='/api/quiz-images'&&method==='POST'&&!url.search)||(url.pathname==='/api/quizzes'&&['POST','PUT','PATCH','DELETE'].includes(method)));
  const quizRead=local&&(url.pathname==='/api/quiz-images'||url.pathname==='/api/quizzes')&&method==='GET';
  const quizContext=getPrivateReadSnapshot('quizzes');
  if(quizRead&&quizContext.blocked)return Promise.reject(new PrivateReadInvalidatedError());
  if(quizWrite&&getPrivateReadSnapshot().blocked)return Promise.reject(new PrivateReadInvalidatedError());
  let quizChanged=true; // Network/5xx outcome can have committed; never replay it.
  const endQuiz=quizWrite?beginPrivateQuizMutation():undefined;
  const finish=endQuiz?()=>endQuiz({changed:quizChanged}):write?beginPrivateMutation({auth:['/api/auth','/api/password','/api/account-setup','/api/groups'].includes(url.pathname)}):undefined;
  let response:Promise<Response>;
  try{response=fetch(input,{...init,headers});}catch(error){finish?.();observeApiFailure(input,error,method);throw error;}
  return response.then(value=>{
    if(quizWrite)quizChanged=value.ok||value.status>=500;
    if(authRead){
      const current=()=>{if(authEpoch!==getPrivateReadSnapshot().authEpoch)throw new PrivateReadInvalidatedError(true);};
      current();
      // Other existing auth callers also parse through json(); fence the body,
      // not just arrival of its headers. This does not share their transport.
      const json=value.json.bind(value);value.json=async()=>{const data=await json();current();return data;};
    }
    if(local&&url.pathname!=='/api/auth'&&(value.status===401||value.status===403)){
      invalidatePrivateReads('denied',{auth:true,clear:true,broadcast:true});
      if(typeof window!=='undefined')queueMicrotask(()=>window.dispatchEvent(new Event('timelyo:auth-refresh')));
    }
    if(quizRead){
      const current=()=>{const now=getPrivateReadSnapshot('quizzes');if(now.epoch!==quizContext.epoch)throw new PrivateReadInvalidatedError(now.clearEpoch!==quizContext.clearEpoch);};
      current();fenceImageBody(value,current);
    }
    if(quizWrite){
      const current=()=>{if(getPrivateReadSnapshot().authEpoch!==authEpoch)throw new PrivateReadInvalidatedError(true);};
      current();fenceImageBody(value,current);
    }
    observeApiResponse(input,value,method);return value;
  },error=>{observeApiFailure(input,error,method);throw error;}).finally(()=>finish?.());
}

/** Fence decoded bodies and clones, not just the response headers. */
function fenceImageBody(response:Response,current:()=>void){
  for(const method of ['json','text','blob','arrayBuffer','formData'] as const){
    const read=response[method].bind(response);
    Object.defineProperty(response,method,{value:async()=>{const value=await read();current();return value;}});
  }
  const clone=response.clone.bind(response);
  Object.defineProperty(response,'clone',{value:()=>{current();const copy=clone();fenceImageBody(copy,current);return copy;}});
}
