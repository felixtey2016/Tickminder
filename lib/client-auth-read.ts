import {groupFetch,setClientGroup} from './group-client';
import {readApiJson} from './action-feedback';
import {t} from './i18n';
import {workspaceIdentityKey} from './workspace-page-data';
import type {Account} from './workspace-client-types';
import {beginPrivateAuthCheck,completePrivateAuthCheck,getPrivateReadSnapshot,failPrivateAuthCheck} from './private-read-lifecycle';
import {privateReadFlight,PrivateReadInvalidatedError} from './private-read-flight';
type Auth={account:Account|null;clientId:string|null};
export function acceptClientAuth(value:Auth,expectedEpoch=getPrivateReadSnapshot().authEpoch){
  if(expectedEpoch!==getPrivateReadSnapshot().authEpoch)return false;
  setClientGroup(value.account?.groupId);
  return completePrivateAuthCheck(value.account?workspaceIdentityKey(value.account):'anonymous',value.account?.groupId,expectedEpoch);
}
/** Every invocation is a live check; only overlapping checks share a transport. */
export async function readClientAuth(signal?:AbortSignal):Promise<Auth>{
  if(getPrivateReadSnapshot().deferredAuth)throw new PrivateReadInvalidatedError();
  const epoch=beginPrivateAuthCheck(),identity=getPrivateReadSnapshot().identity;
  try{
  const value=await privateReadFlight.read({kind:'auth',identity,url:'/api/auth',signal,load:async sharedSignal=>{
    const response=await groupFetch('/api/auth',{cache:'no-store',signal:sharedSignal});
    const data=await readApiJson<Auth&{error?:string}>(response);
    if(!response.ok)throw Object.assign(new Error(t(data.error||'请求失败')),{status:response.status});
    return data;
  },validate:(data:unknown)=>{
    if(!data||typeof data!=='object'||!('account'in data)||!('clientId'in data))throw Error(t('服务器未返回有效响应，请稍后重试'));
    return data as Auth;
  }});
  if(!acceptClientAuth(value,epoch))throw new PrivateReadInvalidatedError(true);
  return value;
  }catch(error){
    if(!(error instanceof PrivateReadInvalidatedError)&&!privateReadFlight.hasPending('auth'))failPrivateAuthCheck(epoch,t('页面加载失败'));
    throw error;
  }
}
