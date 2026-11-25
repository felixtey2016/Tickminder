import {observeApiResponse,observeApiFailure} from "./diagnostics-client";
import {beginPrivateMutation,invalidatePrivateReads,getPrivateReadSnapshot} from './private-read-lifecycle';
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
  const finish=write?beginPrivateMutation({auth:['/api/auth','/api/password','/api/account-setup','/api/groups'].includes(url.pathname)}):undefined;
  let response:Promise<Response>;
  try{response=fetch(input,{...init,headers});}catch(error){finish?.();observeApiFailure(input,error,method);throw error;}
  return response.then(value=>{
    if(authRead){
      const current=()=>{if(authEpoch!==getPrivateReadSnapshot().authEpoch)throw new PrivateReadInvalidatedError(true);};
      current();
      // Other existing auth callers also parse through json(); fence the body,
      // not just arrival of its headers. This does not share their transport.
      const json=value.json.bind(value);value.json=async()=>{const data=await json();current();return data;};
    }
    if(local&&url.pathname!=='/api/auth'&&(value.status===401||value.status===403)){
      invalidatePrivateReads('denied',{auth:true,clear:true});
      if(typeof window!=='undefined')queueMicrotask(()=>window.dispatchEvent(new Event('timelyo:auth-refresh')));
    }
    observeApiResponse(input,value,method);return value;
  },error=>{observeApiFailure(input,error,method);throw error;}).finally(()=>finish?.());
}
