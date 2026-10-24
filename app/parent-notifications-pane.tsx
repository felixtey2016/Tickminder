"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {alertActionFailure,readApiJson} from '@/lib/action-feedback';
import {groupFetch} from '@/lib/group-client';
import {usePageHistoryState} from '@/lib/page-history';
import {PR} from '@/lib/parents-i18n';
import {PN} from '@/lib/parent31-i18n';
import type {ParentNotificationItem,ParentNotificationList,ParentNotificationTarget} from '@/lib/parent-notification-types';
import {useNotificationControls} from './notifications';
import {ParentApiError,ParentLoadState,ParentPagination,parentDate,useParentFocusReload} from './parents-ui-shared';
import './parents.css';
import './parent31.css';

export type ParentNoticeNavigation=ParentNotificationTarget&{navigationId:string};
export async function parentNoticeApi<T>(params:Record<string,string>,body?:Record<string,unknown>,signal?:AbortSignal):Promise<T>{
 const query=new URLSearchParams(params).toString(),response=await groupFetch('/api/parent-notifications'+(query?'?'+query:''),{cache:'no-store',signal,...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
 let result:T&{error?:string};try{result=await readApiJson<T&{error?:string}>(response);}catch(error){if([401,403,404].includes(response.status))throw new ParentApiError(response.status,PN('invalid'));throw error;}if(!response.ok)throw new ParentApiError(response.status,result.error||PN('failed'));return result;
}
function NoticeCard({notice,busy,opening,onOpen}:{notice:ParentNotificationItem;busy:boolean;opening:boolean;onOpen:()=>void}){
 const resolved=notice.state==='resolved';return <article className="parents-record parent-notification-card" data-unread={!notice.readAt&&!resolved}>
  <div className="parents-record-head"><h3>{PN('kind_'+notice.kind)}</h3><div className="parent-notification-state"><span className="parents-badge" data-status={resolved?'completed':notice.readAt?'inactive':'pending'}>{PN(resolved?'resolved':notice.readAt?'read':'new')}</span></div></div>
  <p className="parents-row-meta"><strong>{notice.student}</strong><span>{parentDate(notice.createdAt,true)}</span></p>{notice.invoiceNumber&&<p className="parents-row-meta"><span>{notice.invoiceNumber}</span>{notice.invoiceDueDate&&<span>{PN('due')} · {parentDate(notice.invoiceDueDate)}</span>}</p>}{notice.lessonStart&&<p className="parents-row-meta"><span>{notice.subject}</span><span>{parentDate(notice.lessonStart,true)}</span></p>}
  {resolved&&notice.resolution&&<p className="parents-notice">{PN('resolution_'+notice.resolution)}</p>}
  <Button type="button" variant="outline" className="parent-notification-open" disabled={busy} onClick={onOpen}>{PN(opening?'opening':'open')}</Button>
 </article>;
}
function DeviceControls(){
 const controls=useNotificationControls();useEffect(()=>{if(controls?.loadError)alertActionFailure(new Error(controls.loadError),'parent31.failed');},[controls?.loadError]);return <details className="parent-compact-disclosure parent-notification-device"><summary><strong>{PN('device')}</strong>{controls?.state&&<span className="parents-badge" data-status={controls.enabled?'active':'pending'}>{PN(controls.enabled?'enabled':'disabled')}</span>}</summary><div className="parent-compact-disclosure-body"><p className="parents-muted">{PN('deviceHint')}</p>{!controls?.state?<><p className="parents-muted">{PN(controls?.loadError?'deviceUnavailable':'deviceLoading')}</p>{controls?.loadError&&<Button type="button" variant="outline" onClick={()=>void controls.refresh().catch(error=>alertActionFailure(error,'parent31.failed'))}>{PR('retry')}</Button>}</>:<div className="parents-actions"><Button type="button" disabled={controls.busy} onClick={()=>void (controls.enabled?controls.disable():controls.enable())}>{PN(controls.enabled?'disable':'enable')}</Button><Button type="button" variant="outline" disabled={controls.busy} onClick={controls.showHelp}>{PN('help')}</Button></div>}<p className="parents-muted">{PN('rules')}</p></div></details>;
}
export default function ParentNotificationsPane({onOpen,onAuthorityLost,pendingNotice,onPendingHandled}:{onOpen:(target:ParentNoticeNavigation)=>void;onAuthorityLost:()=>void;pendingNotice?:string;onPendingHandled:()=>void}){
 const controls=useNotificationControls(),[unreadOnly,setUnreadOnly]=usePageHistoryState('parents.notices.unreadOnly',false),[page,setPage]=usePageHistoryState('parents.notices.page',1),[version,setVersion]=useState(0),[state,setState]=useState<{key:string;data:ParentNotificationList|null;loading:boolean;failed:boolean}>({key:'',data:null,loading:true,failed:false}),[busy,setBusy]=useState(''),request=useRef<AbortController|null>(null),opening=useRef(false),authority=useRef(onAuthorityLost),openCallback=useRef(onOpen),handled=useRef(onPendingHandled),pendingSeen=useRef('');
 authority.current=onAuthorityLost;openCallback.current=onOpen;handled.current=onPendingHandled;
 const refresh=useCallback(()=>setVersion(value=>value+1),[]);useParentFocusReload(refresh,30000);
 const badgeCount=controls?.state?.unreadCount,lastBadge=useRef<number|undefined>(undefined);useEffect(()=>{if(lastBadge.current!==undefined&&badgeCount!==undefined&&lastBadge.current!==badgeCount)refresh();lastBadge.current=badgeCount;},[badgeCount,refresh]);
 const key=JSON.stringify({page:String(page),unreadOnly:unreadOnly?'1':'0'});
 useEffect(()=>{const controller=new AbortController();setState({key,data:null,loading:true,failed:false});void parentNoticeApi<ParentNotificationList>(JSON.parse(key),undefined,controller.signal).then(data=>{if(!controller.signal.aborted)setState({key,data,loading:false,failed:false});}).catch(error=>{if(controller.signal.aborted)return;setState({key,data:null,loading:false,failed:true});alertActionFailure(error,'parent31.failed');if(error instanceof ParentApiError&&[401,403,404].includes(error.status))authority.current();});return()=>controller.abort();},[key,version]);
 useEffect(()=>()=>request.current?.abort(),[]);
 const open=useCallback(async(id:string)=>{
  if(opening.current)return;opening.current=true;setBusy(id);const controller=new AbortController();request.current=controller;
  try{const {target}=await parentNoticeApi<{ok:true;target:ParentNotificationTarget}>({}, {action:'open',id},controller.signal);if(controller.signal.aborted)return;void controls?.refresh().catch(()=>{});openCallback.current({...target,navigationId:crypto.randomUUID()});}
  catch(error){if(!controller.signal.aborted){alertActionFailure(error,'parent31.failed');refresh();void controls?.refresh().catch(()=>{});if(error instanceof ParentApiError&&error.status===401)authority.current();}}
  finally{if(!controller.signal.aborted){opening.current=false;setBusy('');}if(request.current===controller)request.current=null;}
 },[controls,refresh]);
 useEffect(()=>{if(!pendingNotice||pendingSeen.current===pendingNotice)return;pendingSeen.current=pendingNotice;handled.current();void open(pendingNotice);},[pendingNotice,open]);
 async function markAll(){if(opening.current)return;opening.current=true;setBusy('all');const controller=new AbortController();request.current=controller;try{await parentNoticeApi({}, {action:'readAll'},controller.signal);if(controller.signal.aborted)return;refresh();await controls?.refresh();}catch(error){if(!controller.signal.aborted){alertActionFailure(error,'parent31.failed');if(error instanceof ParentApiError&&[401,403,404].includes(error.status))authority.current();}}finally{if(!controller.signal.aborted){opening.current=false;setBusy('');}if(request.current===controller)request.current=null;}}
 const current=state.key===key?state:{data:null,loading:true,failed:false};
 useEffect(()=>{if(current.data&&current.data.page>current.data.pages)setPage(current.data.pages);},[current.data,setPage]);
 return <div className="parent-notifications" data-testid="parent-notifications"><section className="panel"><div className="parents-head"><span className="parents-muted">{PN('title')}</span><Button type="button" variant="outline" disabled={current.loading||!!busy} onClick={()=>{refresh();void controls?.refresh().catch(error=>alertActionFailure(error,'parent31.failed'));}}>{PR('refresh')}</Button></div><nav className="parents-actions parents-tabs" aria-label={PN('title')}><Button type="button" variant={!unreadOnly?'default':'outline'} aria-pressed={!unreadOnly} disabled={!!busy} onClick={()=>{setUnreadOnly(false);setPage(1);}}>{PN('all')}</Button><Button type="button" variant={unreadOnly?'default':'outline'} aria-pressed={unreadOnly} disabled={!!busy} onClick={()=>{setUnreadOnly(true);setPage(1);}}>{PN('unread')}</Button></nav><div className="parents-section"><ParentLoadState loading={current.loading} failed={current.failed} onRetry={refresh}>{current.data&&<><div className="parent-notification-toolbar"><p className="parent-notification-inbox-count">{PN('unreadCount').replace('{count}',String(current.data.unreadCount))}</p><Button type="button" variant="outline" disabled={!!busy||!current.data.unreadCount} onClick={()=>void markAll()}>{PN('markAll')}</Button></div><div className="parents-records">{current.data.items.map(notice=><NoticeCard key={notice.id} notice={notice} busy={!!busy} opening={busy===notice.id} onOpen={()=>void open(notice.id)}/>)}{!current.data.items.length&&<p className="parents-empty">{PN(unreadOnly?'noneUnread':'none')}</p>}</div><ParentPagination page={current.data.page} pages={current.data.pages} disabled={!!busy} onChange={setPage}/></>}</ParentLoadState></div></section><DeviceControls/></div>;
}
