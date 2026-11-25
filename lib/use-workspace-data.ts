'use client';

import {useCallback, useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {groupFetch} from './group-client';
import {actionFailureMessage, readApiJson} from './action-feedback';
import {t} from './i18n';
import {workspaceIdentityKey, type WorkspaceReadIdentity} from './workspace-page-data';
import type {WorkspaceDataMap, WorkspaceDataResponse, WorkspaceDataView} from './workspace-data-types';
import {getPrivateReadSnapshot,subscribePrivateReadLifecycle,invalidatePrivateReads} from './private-read-lifecycle';
import {privateReadFlight,PrivateReadInvalidatedError} from './private-read-flight';
export type {WorkspaceReadIdentity} from './workspace-page-data';

/** One active projection, with no cross-page cache. Identity changes reject old reads immediately. */
export function useWorkspaceData<V extends WorkspaceDataView>(view: V | null, account: WorkspaceReadIdentity, params: Record<string, string> = {}) {
  const identity = workspaceIdentityKey(account), query = new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b))).toString();
  const context=useSyncExternalStore(subscribePrivateReadLifecycle,getPrivateReadSnapshot,getPrivateReadSnapshot);
  const key = JSON.stringify([identity, view, query,context.clearEpoch]);
  const latest = useRef(key); latest.current = key;
  const epoch = useRef(0);
  const [state, setState] = useState<{key: string; data: WorkspaceDataMap[V] | null; loading: boolean; error: string; revision?: number}>({key: '', data: null, loading: Boolean(view), error: ''});
  const reload = useCallback(() => {epoch.current++;if(getPrivateReadSnapshot().blocked)window.dispatchEvent(new Event('timelyo:auth-refresh'));else invalidatePrivateReads('manual-refresh');}, []);
  useEffect(() => {
    const controller = new AbortController(), current = ++epoch.current;
    if (!view) {setState({key, data: null, loading: false, error: ''}); return () => controller.abort();}
    setState(previous => ({key, data: previous.key === key ? previous.data : null, revision: previous.key === key ? previous.revision : undefined, loading: !context.authError, error: context.authError}));
    if(context.blocked||context.identity!==identity)return()=>controller.abort();
    const url='/api/workspace-data?' + new URLSearchParams({view}) + (query ? '&' + query : '');
    void privateReadFlight.read({kind:'workspace',identity,url,signal:controller.signal,load:async signal=>{
      const response=await groupFetch(url,{cache:'no-store',signal});
      const result=await readApiJson<WorkspaceDataResponse<V>&{error?:string}>(response);
      if(!response.ok)throw Object.assign(new Error(result.error||t('页面加载失败')),{clear:response.status===401||response.status===403});
      return result;
    },validate:(value:unknown)=>{
      const result=value as WorkspaceDataResponse<V>;
      if (!result.account || workspaceIdentityKey(result.account) !== identity) {
        invalidatePrivateReads('response-identity',{auth:true,clear:true});
        window.dispatchEvent(new Event('timelyo:auth-refresh')); throw Object.assign(new Error(t('账号权限已改变，请刷新后重试')), {clear: true});
      }
      if (result.view !== view || !result.data || !Number.isSafeInteger(result.revision)) throw new Error(t('页面加载失败'));
      return result;
    }}).then(result=>{
      if(controller.signal.aborted||current!==epoch.current||latest.current!==key||getPrivateReadSnapshot().epoch!==context.epoch)return;
      setState({key, data: result.data as WorkspaceDataMap[V], loading: false, error: '', revision: result.revision});
    }).catch(error => {
      if(error instanceof PrivateReadInvalidatedError)return;
      if (!controller.signal.aborted && current === epoch.current && latest.current === key) setState(previous => {
        const retain = !(error as Error & {clear?: boolean}).clear && previous.key === key;
        return {key, data: retain ? previous.data : null, revision: retain ? previous.revision : undefined, loading: false, error: actionFailureMessage(error)};
      });
    });
    return () => controller.abort();
  }, [key, identity, view, query, context]);
  return {...(state.key === key ? state : {key, data: null, loading: Boolean(view), error: '', revision: undefined}), reload};
}
