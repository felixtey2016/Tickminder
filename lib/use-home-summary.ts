"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import type {HomeSummary,HomeNavigationSummary} from './home-summary-types';
import {groupFetch} from './group-client';
import {actionFailureMessage,readApiJson} from './action-feedback';
import {privateReadFlight,PrivateReadInvalidatedError} from './private-read-flight';
import {getPrivateReadSnapshot,invalidatePrivateReads,subscribePrivateReadLifecycle} from './private-read-lifecycle';
import {createReadRefresh} from './read-refresh';
import {t} from './i18n';

export function useHomeSummary<T extends HomeSummary|HomeNavigationSummary>({identity,accountId,groupId,home,enabled=true}:{identity:string;accountId:string;groupId:string|null;home:boolean;enabled?:boolean}) {
  const key=JSON.stringify([identity,home]),[state,setState]=useState<{key:string;data:T|null;loading:boolean;error:string;updatedAt:number|null}>({key,data:null,loading:enabled,error:'',updatedAt:null});
  const reloadRef=useRef<()=>void>(()=>{}),reload=useCallback(()=>reloadRef.current(),[]);
  useEffect(()=>{
    if(!enabled){reloadRef.current=()=>{};return;}
    let alive=true,context=getPrivateReadSnapshot(),clearEpoch=context.clearEpoch,dataEpoch=context.dataEpoch,authFailed=Boolean(context.authError);
    const controller=new AbortController(),url=home?'/api/home-summary':'/api/home-summary?scope=navigation';
    setState({key,data:null,loading:true,error:'',updatedAt:null});
    const schedule=createReadRefresh({
      canRun:()=>{const live=getPrivateReadSnapshot();return alive&&document.visibilityState!=='hidden'&&!live.blocked&&live.identity===identity;},
      cancelled:error=>error instanceof PrivateReadInvalidatedError||(error instanceof Error&&error.name==='AbortError'),
      onError:error=>{if(alive)setState(previous=>({...previous,loading:false,error:actionFailureMessage(error)}));},
      load:async()=>{
        const epoch=getPrivateReadSnapshot().epoch;
        setState(previous=>({...previous,loading:true}));
        const value=await privateReadFlight.read({kind:'navigation',identity,url,signal:controller.signal,
          load:async signal=>{
            const response=await groupFetch(url,{cache:'no-store',signal}),data=await readApiJson<T&{error?:string}>(response);
            if(!response.ok)throw Object.assign(new Error(data.error||t('页面加载失败')),{status:response.status});return data;
          },
          validate:(data:unknown)=>{
            const result=data as T;
            if(result?.accountId!==accountId||result?.groupId!==groupId){invalidatePrivateReads('summary-identity',{auth:true,clear:true});window.dispatchEvent(new Event('timelyo:auth-refresh'));throw new PrivateReadInvalidatedError(true);}
            if(!result.navigationCounts||Object.values(result.navigationCounts).some(count=>!Number.isSafeInteger(count)||count<0))throw Error(t('页面加载失败'));
            if(home){const full=result as HomeSummary;if(!Array.isArray(full.today?.items)||full.today.items.length>3||!Number.isSafeInteger(full.today.total))throw Error(t('页面加载失败'));}
            return result;
          }});
        if(epoch!==getPrivateReadSnapshot().epoch)throw new PrivateReadInvalidatedError();
        if(alive)setState({key,data:value,loading:false,error:'',updatedAt:Date.now()});
        const boundary=Date.parse(value.nextRefreshAt);return Number.isFinite(boundary)?boundary:undefined;
      },
    });
    const invalidated=()=>{
      const next=getPrivateReadSnapshot(),cleared=next.clearEpoch!==clearEpoch,changed=next.dataEpoch!==dataEpoch;
      clearEpoch=next.clearEpoch;dataEpoch=next.dataEpoch;
      if(cleared)setState({key,data:null,loading:true,error:'',updatedAt:null});
      if(next.authError){authFailed=true;setState(previous=>({...previous,loading:false,error:next.authError}));}
      const recovered=authFailed&&!next.authError&&!next.blocked;if(recovered)authFailed=false;
      // A successful identity recheck alone must not leave an earlier auth
      // outage visible for five minutes, or erase a separate summary failure.
      schedule.request(cleared||changed||recovered?'change':'resume');
    };
    const unsubscribe=subscribePrivateReadLifecycle(invalidated),foreground=()=>schedule.request('foreground');
    const changed=()=>schedule.request('change');
    reloadRef.current=()=>{if(getPrivateReadSnapshot().blocked)window.dispatchEvent(new Event('timelyo:auth-refresh'));schedule.request('manual');};
    window.addEventListener('focus',foreground);document.addEventListener('visibilitychange',foreground);
    window.addEventListener('tickminder:data-changed',changed);
    schedule.request('change');
    return()=>{alive=false;schedule.stop();unsubscribe();controller.abort();window.removeEventListener('focus',foreground);document.removeEventListener('visibilitychange',foreground);window.removeEventListener('tickminder:data-changed',changed);};
  },[key,identity,accountId,groupId,home,enabled]);
  return {...(state.key===key?state:{key,data:null,loading:enabled,error:'',updatedAt:null}),reload};
}
