"use client";
import {groupFetch} from "@/lib/group-client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, BellOff, Check, Settings, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { alertActionFailure, readApiJson, showActionToast } from "@/lib/action-feedback";
import { useDialogState } from "@/lib/use-dialog-state";
import { t, type Language } from "@/lib/i18n";

type Item={id:string;contentKind?:"material"|"homework"|"quiz";recordId?:string;title?:string;kind?:string;minutes?:number;dueAt:string;readAt:string|null;subject:string;teacherName:string;plannedStart:string;plannedEnd:string;previousStart?:string};
type State={groupId?:string;accountId?:string;unreadCount:number;unreadQuizCount?:number;items:Item[];configured:boolean;publicKey:string|null;schedulerReady:boolean;lastDispatchAt:string|null};
type Device={accountId:string;id:string};
const DEVICE_KEY="tickminder-push-device";
let pushPaused=false;
let deviceQueue:Promise<unknown>=Promise.resolve();
function withDeviceLock<T>(operation:()=>Promise<T>):Promise<T> {
  const result=deviceQueue.then(operation);deviceQueue=result.catch(()=>{});return result;
}
function readDevice():Device|null {try {return JSON.parse(localStorage.getItem(DEVICE_KEY)||"null");}catch{return null;}}
function writeDevice(value:Device|null) {try{if(value)localStorage.setItem(DEVICE_KEY,JSON.stringify(value));else localStorage.removeItem(DEVICE_KEY);}catch{/* browser privacy settings */}}
async function api(body:Record<string,unknown>) {
  const response=await groupFetch("/api/notifications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const result=await readApiJson<{ok?:boolean;error?:string;id?:string}>(response);
  if(!response.ok || result.error) throw new Error(result.error||"操作失败，请重试");return result;
}
export async function detachPushOnLogout(forgetDevice=false) {
  pushPaused=true;
  await withDeviceLock(async()=>{
    const device=readDevice();
    // Stop server delivery before invalidating the login. Keep the browser's
    // permission/subscription for automatic reconnection by the same account.
    // A different account rotates the subscription before attaching its own.
    if(device) await api({action:"unsubscribe",id:device.id});
    if(forgetDevice) {
      if("serviceWorker" in navigator) {
        const registration=await navigator.serviceWorker.getRegistration("/");
        const subscription=await registration?.pushManager?.getSubscription();
        if(subscription) await subscription.unsubscribe();
      }
      writeDevice(null);
    }
  });
}
function supported() {return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;}
function needsHomeScreen() {
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
  return ios && !window.matchMedia("(display-mode: standalone)").matches && !(navigator as Navigator & {standalone?:boolean}).standalone;
}
function applicationKey(key:string) {const raw=atob(key.replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
type ContextValue={state:State|null;loadError:string;deviceId:string|null;enabled:boolean;busy:boolean;enable:()=>Promise<void>;disable:()=>Promise<void>;test:()=>Promise<void>;refresh:()=>Promise<void>;read:(id?:string)=>Promise<void>;showHelp:()=>void};
const Context=createContext<ContextValue|null>(null);

export function MenuBadge({count=0,includeUnread=false,quizOnly=false,header=false}:{count?:number;includeUnread?:boolean;quizOnly?:boolean;header?:boolean}) {
  const context=useContext(Context);
  const unread=context?.state?.unreadCount ?? context?.state?.items.filter(item=>!item.readAt).length ?? 0;
  const quizUnread=context?.state?.unreadQuizCount ?? context?.state?.items.filter(item=>item.contentKind==='quiz'&&!item.readAt).length ?? 0;
  const total=count+(quizOnly?quizUnread:includeUnread?unread:0);
  if(total<=0)return null;
  return <span className={"menu-count"+(header?" menu-count-header":"")} aria-label={`${total} ${t("项待查看或处理")}`}>{total>99?"99+":total}</span>;
}

export function NotificationsProvider({accountId,groupId,language,children}:{accountId:string;groupId:string;language:Language;children:ReactNode}) {
  const [state,setState]=useState<State|null>(null),[loadError,setLoadError]=useState(""),[deviceId,setDeviceId]=useState<string|null>(null),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false);
  // Only explicit notification controls open this guide. Do not restore a
  // legacy automatically opened permission dialog from navigation history.
  const [prompt,setPrompt]=useDialogState<true|null>("notification-help",null);
  const inFlight=useRef(false),configured=useRef<State|null>(null),latestRefresh=useRef(0);
  useEffect(()=>{pushPaused=false;},[accountId]);
  const refresh=useCallback(async()=>{
    const requestId=++latestRefresh.current;
    const response=await groupFetch("/api/notifications",{cache:"no-store"});
    const result=await readApiJson<State & {error?:string}>(response);
    if(!response.ok || result.error) throw new Error(result.error||"通知中心暂时无法载入，请稍后重试");
    if((result.accountId && result.accountId!==accountId)||(result.groupId && result.groupId!==groupId))throw new Error("登录已过期，请重新登录");
    if(requestId!==latestRefresh.current)return;
    configured.current=result;setState(result);setLoadError("");
  },[accountId]);
  useEffect(()=>{
    let alive=true;
    const sync=()=>withDeviceLock(async()=>{
      if(!alive || pushPaused)return;
      try {
        await refresh();if(!alive || pushPaused)return;
        if(supported()) {
          const registration=await navigator.serviceWorker.register("/notifications-sw.js",{scope:"/"});
          let subscription=await registration.pushManager.getSubscription();const saved=readDevice();
          if(!alive || pushPaused)return;
          if(subscription && saved && saved.accountId!==accountId) {await subscription.unsubscribe();subscription=null;writeDevice(null);}
          if(subscription && Notification.permission==="granted" && configured.current?.configured) {
            const result=await api({action:"subscribe",subscription:subscription.toJSON(),language});
            writeDevice({accountId,id:result.id!});if(!alive || pushPaused)return;setDeviceId(result.id!);setEnabled(true);return;
          }
        }
        setDeviceId(null);setEnabled(false);
        // A missing subscription is not a reason to interrupt the page. The
        // Notification Centre retains explicit enable/help controls.
      } catch(error) {if(alive)setLoadError(error instanceof Error?t(error.message):t("通知中心暂时无法载入，请稍后重试"));}
    });
    void sync();
    const visible=()=>{if(document.visibilityState==="visible") void sync();};
    const returning=(event:PageTransitionEvent)=>{if(event.persisted)void sync();};
    const changed=()=>{if(alive && document.visibilityState==="visible")void refresh().catch(()=>setLoadError(t("通知中心暂时无法载入，请稍后重试")));};
    const message=(event:MessageEvent)=>{if(event.data?.type==="tickminder:notifications"){changed();window.dispatchEvent(new Event("tickminder:open-notifications"));}};
    const timer=window.setInterval(changed,30_000);
    document.addEventListener("visibilitychange",visible);window.addEventListener("pageshow",returning);navigator.serviceWorker?.addEventListener("message",message);
    window.addEventListener("tickminder:data-changed",changed);
    return()=>{alive=false;latestRefresh.current++;clearInterval(timer);document.removeEventListener("visibilitychange",visible);window.removeEventListener("pageshow",returning);window.removeEventListener("tickminder:data-changed",changed);navigator.serviceWorker?.removeEventListener("message",message);};
  },[accountId,language,refresh,setPrompt]);
  const enable=async()=>{
    if(inFlight.current)return;
    if(needsHomeScreen() || !supported()) {setPrompt(true);return;}
    if(!configured.current?.configured || !configured.current.publicKey) {alertActionFailure(new Error("通知服务尚未配置，请稍后重试"));return;}
    if(Notification.permission==="denied") {setPrompt(true);return;}
    inFlight.current=true;setBusy(true);
    pushPaused=false;
    try {
      // Request immediately within the user's click, before any asynchronous IO.
      const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
      if(permission!=="granted") {setEnabled(false);setPrompt(null);return;}
      await withDeviceLock(async()=>{
        if(pushPaused)return;
        const registration=await navigator.serviceWorker.ready;
        let subscription=await registration.pushManager.getSubscription();
        if(!subscription) subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(configured.current!.publicKey!)});
        if(pushPaused)return;
        const result=await api({action:"subscribe",subscription:subscription.toJSON(),language});
        writeDevice({accountId,id:result.id!});if(pushPaused)return;setDeviceId(result.id!);setEnabled(true);setPrompt(null);showActionToast("success","此设备已开启通知");
      });
    } catch(error) {alertActionFailure(error);}finally{inFlight.current=false;setBusy(false);}
  };
  const perform=async(operation:()=>Promise<void>,message:string)=>{
    if(inFlight.current)return;inFlight.current=true;setBusy(true);
    try {await operation();showActionToast("success",message);}catch(error){alertActionFailure(error);}finally{inFlight.current=false;setBusy(false);}
  };
  const disable=()=>perform(async()=>{await detachPushOnLogout(true);setEnabled(false);setDeviceId(null);},"此设备已关闭通知");
  const test=()=>perform(async()=>{if(!deviceId)throw new Error("请先开启此设备通知");await api({action:"test",id:deviceId});},"测试提醒已发送，请检查设备通知");
  const read=(id?:string)=>perform(async()=>{await api(id?{action:"read",id}:{action:"readAll"});await refresh();},"通知已标记为已读");
  const ios=typeof navigator!=="undefined"&&needsHomeScreen(),denied=typeof Notification!=="undefined"&&Notification.permission==="denied";
  return <Context.Provider value={{state,loadError,deviceId,enabled,busy,enable,disable,test,refresh,read,showHelp:()=>setPrompt(true)}}>{children}
    <Dialog open={Boolean(prompt)} onOpenChange={open=>{if(!open)setPrompt(null);}}><DialogContent className="notification-dialog"><DialogHeader><DialogTitle>{t("开启上课提醒")}</DialogTitle></DialogHeader>
      <div className="notification-symbol"><Bell size={28}/></div><p>{t("在上课前 30 分钟、5 分钟及开始时接收提醒。")}</p>
      {ios?<div className="notification-help"><Smartphone size={20}/><p>{t("iPhone／iPad：请用 Safari 打开网站，点击分享 → 添加到主屏幕，再从主屏幕图标进入并开启通知。")}</p></div>:denied?<div className="notification-help"><Settings size={20}/><p>{t("浏览器已禁止通知。请在网站设置或设备通知设置中改为允许，然后回到 Tickminder 开启提醒。")}</p></div>:typeof navigator!=="undefined"&&!supported()?<p className="notice">{t("此浏览器暂不支持推送通知。请使用支持通知的浏览器；你仍可查看通知中心。")}</p>:null}
      <p className="notification-muted">{t("每个设备需要分别开启。提醒可能受网络或系统设置影响，请以课程时间为准。")}</p>
      {!state?.configured && <p className="notice">{t("自动上课提醒正在配置，通知中心仍可查看。")}</p>}
      <div className="notification-actions"><Button variant="outline" onClick={()=>setPrompt(null)}>{t("暂不开启")}</Button>{!ios&&!denied&&<Button onClick={()=>void enable()} disabled={busy||!state?.configured}>{t("开启此设备通知")}</Button>}</div>
    </DialogContent></Dialog>
  </Context.Provider>;
}
export function NotificationCentre({onLesson,onLearning,onQuiz,language}:{onLesson:()=>void;onLearning?:(kind:"material"|"homework")=>void;onQuiz?:()=>void;language:Language}) {
  const value=useContext(Context);if(!value)return null;
  const {state,loadError,enabled,busy,enable,disable,test,refresh,read,showHelp}=value;
  const date=(input:string)=>new Intl.DateTimeFormat(language==="en"?"en-GB":"zh-CN",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(input));
  const messageTitle=(item:Item)=>item.kind==="quiz_assigned"?"收到新的 Quiz 安排":item.kind==="quiz_updated"?"Quiz 安排已更新":item.kind==="quiz_retake_granted"?"Quiz 作答权限已更新":item.kind==="quiz_pending_marking"?"Quiz 有待批改的提交":item.kind==="group_reschedule_requested"?"老师申请整班改期":item.kind==="feedback_published"?"老师已发布批改反馈":item.kind==="resubmission_granted"?"老师已授予一次重交权限":item.kind==="homework_updated"?"功课已更新":item.kind==="material_updated"?"教学资料已更新":item.kind==="cancel"?"课程已取消":item.kind==="rejectReschedule"?"改期申请已被拒绝":item.kind==="reschedule"||item.kind==="acceptReschedule"?"课程时间已变更":item.minutes===0?"课程时间已到":item.minutes===5?"课前 5 分钟提醒":"课前 30 分钟提醒";
  return <div className="notification-page"><section className="panel notification-settings"><div className="notification-heading"><Bell size={22}/><h2>{t("上课提醒")}</h2></div><p>{t("在上课前 30 分钟、5 分钟及开始时接收提醒。")}</p><p className="notification-status">{enabled?<Check size={18}/>:<BellOff size={18}/>} {t(enabled?"此设备已开启通知":"此设备尚未开启通知")}</p>
    <div className="notification-actions">{enabled?<><Button variant="outline" onClick={()=>void test()} disabled={busy}>{t("发送测试通知")}</Button><Button variant="outline" onClick={()=>void disable()} disabled={busy}>{t("关闭此设备通知")}</Button></>:<Button onClick={()=>void enable()} disabled={busy||!state?.configured}>{t("开启此设备通知")}</Button>}<Button variant="outline" onClick={showHelp}>{t("通知开启指南")}</Button></div>
    {!state?.schedulerReady&&<p className="notice">{t("自动提醒服务暂不可用。你仍可查看通知中心，请以课表时间为准。")}</p>}<p className="notification-muted">{t("每个设备需要分别开启。提醒可能受网络或系统设置影响，请以课程时间为准。")}</p></section>
    <section className="panel"><div className="notification-list-heading"><h2>{t("通知中心")}</h2><Button variant="outline" disabled={busy||!state?.items.some(item=>!item.readAt)} onClick={()=>void read()}>{t("全部标为已读")}</Button></div>
      {loadError?<div className="error" role="alert">{loadError}<Button variant="outline" onClick={()=>void refresh().catch(alertActionFailure)}>{t("重试")}</Button></div>:!state?<p>{t("正在加载…")}</p>:!state.items.length?<p className="empty">{t("暂无新通知。课程变更、功课更新、Quiz 安排和批改反馈会显示在这里。")}</p>:<div className="notification-list">{state.items.map(item=><article key={item.id} className={"notification-item"+(item.readAt?"":" unread")}><div><span className="notification-kicker">{t(messageTitle(item))}</span><h3>{item.title||item.subject}</h3>{item.contentKind&&<p>{item.subject} · {date(item.dueAt)}</p>}{(item.kind==="reschedule"||item.kind==="acceptReschedule")&&item.previousStart&&<p>{t("原时间：")}{date(item.previousStart)}</p>}{!item.contentKind&&<p>{(item.kind==="reschedule"||item.kind==="acceptReschedule")?t("新时间："):""}{date(item.plannedStart)} · {item.teacherName}</p>}</div><div className="notification-actions">{item.contentKind?<Button variant="outline" onClick={()=>{void read(item.id);if(item.contentKind==="quiz")onQuiz?.();else onLearning?.(item.contentKind!);}}>{t(item.contentKind==="quiz"?"查看 Quiz":item.contentKind==="homework"?"查看功课":"查看教学资料")}</Button>:<Button variant="outline" onClick={onLesson}>{t("前往课表")}</Button>}{!item.readAt&&<Button variant="outline" disabled={busy} onClick={()=>void read(item.id)}>{t("标为已读")}</Button>}</div></article>)}</div>}
    </section></div>;
}
