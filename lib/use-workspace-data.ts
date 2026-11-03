'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {groupFetch} from './group-client';
import {actionFailureMessage, readApiJson} from './action-feedback';
import {t} from './i18n';
import {workspaceIdentityKey, type WorkspaceReadIdentity} from './workspace-page-data';
import type {WorkspaceDataMap, WorkspaceDataResponse, WorkspaceDataView} from './workspace-data-types';
export type {WorkspaceReadIdentity} from './workspace-page-data';

/** One active projection, with no cross-page cache. Identity changes reject old reads immediately. */
export function useWorkspaceData<V extends WorkspaceDataView>(view: V | null, account: WorkspaceReadIdentity, params: Record<string, string> = {}) {
  const identity = workspaceIdentityKey(account), query = new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b))).toString();
  const key = JSON.stringify([identity, view, query]);
  const latest = useRef(key); latest.current = key;
  const [version, setVersion] = useState(0), epoch = useRef(0);
  const [state, setState] = useState<{key: string; data: WorkspaceDataMap[V] | null; loading: boolean; error: string; revision?: number}>({key: '', data: null, loading: Boolean(view), error: ''});
  const reload = useCallback(() => {epoch.current++; setVersion(value => value + 1);}, []);
  useEffect(() => {window.addEventListener('tickminder:data-changed', reload); return () => window.removeEventListener('tickminder:data-changed', reload);}, [reload]);
  useEffect(() => {
    const controller = new AbortController(), current = ++epoch.current;
    if (!view) {setState({key, data: null, loading: false, error: ''}); return () => controller.abort();}
    setState(previous => ({key, data: previous.key === key ? previous.data : null, revision: previous.key === key ? previous.revision : undefined, loading: true, error: ''}));
    void groupFetch('/api/workspace-data?' + new URLSearchParams({view}) + (query ? '&' + query : ''), {cache: 'no-store', signal: controller.signal}).then(async response => {
      const result = await readApiJson<WorkspaceDataResponse<V> & {error?: string}>(response);
      if (controller.signal.aborted || current !== epoch.current || latest.current !== key) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) window.dispatchEvent(new Event('timelyo:auth-refresh'));
        throw Object.assign(new Error(result.error || t('页面加载失败')), {clear: response.status === 401 || response.status === 403});
      }
      if (!result.account || workspaceIdentityKey(result.account) !== identity) {
        window.dispatchEvent(new Event('timelyo:auth-refresh')); throw Object.assign(new Error(t('账号权限已改变，请刷新后重试')), {clear: true});
      }
      if (result.view !== view || !result.data || !Number.isSafeInteger(result.revision)) throw new Error(t('页面加载失败'));
      setState({key, data: result.data as WorkspaceDataMap[V], loading: false, error: '', revision: result.revision});
    }).catch(error => {
      if (!controller.signal.aborted && current === epoch.current && latest.current === key) setState(previous => {
        const retain = !(error as Error & {clear?: boolean}).clear && previous.key === key;
        return {key, data: retain ? previous.data : null, revision: retain ? previous.revision : undefined, loading: false, error: actionFailureMessage(error)};
      });
    });
    return () => controller.abort();
  }, [key, identity, view, query, version]);
  return {...(state.key === key ? state : {key, data: null, loading: Boolean(view), error: '', revision: undefined}), reload};
}
