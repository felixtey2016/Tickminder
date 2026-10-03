"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, BellOff, Check, Settings, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { alertActionFailure, readApiJson, showActionToast } from "@/lib/action-feedback";
import { useDialogState } from "@/lib/use-dialog-state";
import { t, type Language } from "@/lib/i18n";

type Item={id:string;minutes:number;dueAt:string;readAt:string|null;subject:string;teacherName:string;plannedStart:string;plannedEnd:string};
type State={items:Item[];configured:boolean;publicKey:string|null;schedulerReady:boolean;lastDispatchAt:string|null};
type Device={accountId:string;id:string};
const DEVICE_KEY="tickminder-push-device";
// A dismissal is intentionally not persisted: a full new entry offers again.
let offeredThisEntry=false;
let pushPaused=false;
let deviceQueue:Promise<unknown>=Promise.resolve();
function withDeviceLock<T>(operation:()=>Promise<T>):Promise<T> {
  const result=deviceQueue.then(operation);deviceQueue=result.catch(()=>{});return result;
}
function readDevice():Device|null {try {return JSON.parse(localStorage.getItem(DEVICE_KEY)||"null");}catch{return null;}}
function writeDevice(value:Device|null) {try{if(value)localStorage.setItem(DEVICE_KEY,JSON.stringify(value));else localStorage.removeItem(DEVICE_KEY);}catch{/* browser privacy settings */}}
async function api(body:Record<string,unknown>) {
  const response=await fetch("/api/notifications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
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

export function NotificationsProvider({accountId,language,children}:{accountId:string;language:Language;children:ReactNode}) {
  const [state,setState]=useState<State|null>(null),[loadError,setLoadError]=useState(""),[deviceId,setDeviceId]=useState<string|null>(null),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false);
  const [prompt,setPrompt]=useDialogState<true|null>("notification-permission",null);
  const inFlight=useRef(false),configured=useRef<State|null>(null);
  useEffect(()=>{pushPaused=false;},[accountId]);
  const refresh=useCallback(async()=>{
    const response=await fetch("/api/notifications",{cache:"no-store"});
    const result=await readApiJson<State & {error?:string}>(response);
    if(!response.ok || result.error) throw new Error(result.error||"通知中心暂时无法载入，请稍后重试");
    configured.current=result;setState(result);setLoadError("");
  },[]);
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
        if(!offeredThisEntry && alive) {offeredThisEntry=true;setPrompt(true);}
      } catch(error) {if(alive)setLoadError(error instanceof Error?t(error.message):t("通知中心暂时无法载入，请稍后重试"));}
    });
    void sync();
    const visible=()=>{if(document.visibilityState==="visible") void sync();};
    const returning=(event:PageTransitionEvent)=>{if(event.persisted){offeredThisEntry=false;void sync();}};
    const message=(event:MessageEvent)=>{if(event.data?.type==="tickminder:notifications")window.dispatchEvent(new Event("tickminder:open-notifications"));};
    const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh().catch(()=>setLoadError(t("通知中心暂时无法载入，请稍后重试")));},60_000);
    document.addEventListener("visibilitychange",visible);window.addEventListener("pageshow",returning);navigator.serviceWorker?.addEventListener("message",message);
    return()=>{alive=false;clearInterval(timer);document.removeEventListener("visibilitychange",visible);window.removeEventListener("pageshow",returning);navigator.serviceWorker?.removeEventListener("message",message);};
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
      const permission=await Notification.requestPermission();
      if(permission!=="granted") {setEnabled(false);return;}
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
      <div className="notification-actions"><Button variant="outline" onClick={()=>setPrompt(null)}>{t("稍后再说")}</Button>{!ios&&!denied&&<Button onClick={()=>void enable()} disabled={busy||!state?.configured}>{t("开启通知")}</Button>}</div>
    </DialogContent></Dialog>
  </Context.Provider>;
}
export function NotificationCentre({onLesson,language}:{onLesson:()=>void;language:Language}) {
  const value=useContext(Context);if(!value)return null;
  const {state,loadError,enabled,busy,enable,disable,test,refresh,read,showHelp}=value;
  const date=(input:string)=>new Intl.DateTimeFormat(language==="en"?"en-GB":"zh-CN",{timeZone:"Asia/Kuala_Lumpur",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(input));
  return <div className="notification-page"><section className="panel notification-settings"><div className="notification-heading"><Bell size={22}/><h2>{t("上课提醒")}</h2></div><p>{t("在上课前 30 分钟、5 分钟及开始时接收提醒。")}</p><p className="notification-status">{enabled?<Check size={18}/>:<BellOff size={18}/>} {t(enabled?"此设备已开启通知":"此设备尚未开启通知")}</p>
    <div className="notification-actions">{enabled?<><Button variant="outline" onClick={()=>void test()} disabled={busy}>{t("发送测试提醒")}</Button><Button variant="outline" onClick={()=>void disable()} disabled={busy}>{t("关闭此设备通知")}</Button></>:<Button onClick={()=>void enable()} disabled={busy||!state?.configured}>{t("开启通知")}</Button>}<Button variant="outline" onClick={showHelp}>{t("通知设置说明")}</Button></div>
    {!state?.schedulerReady&&<p className="notice">{t("自动上课提醒暂未连接。你仍可在通知中心查看提醒，请以课程时间为准。")}</p>}<p className="notification-muted">{t("每个设备需要分别开启。提醒可能受网络或系统设置影响，请以课程时间为准。")}</p></section>
    <section className="panel"><div className="notification-list-heading"><h2>{t("通知中心")}</h2><Button variant="outline" disabled={busy||!state?.items.some(item=>!item.readAt)} onClick={()=>void read()}>{t("全部标记已读")}</Button></div>
      {loadError?<div className="error" role="alert">{loadError}<Button variant="outline" onClick={()=>void refresh().catch(alertActionFailure)}>{t("重试")}</Button></div>:!state?<p>{t("正在载入…")}</p>:!state.items.length?<p className="empty">{t("暂无上课提醒。课程临近时，提醒会显示在这里。")}</p>:<div className="notification-list">{state.items.map(item=><article key={item.id} className={"notification-item"+(item.readAt?"":" unread")}><div><span className="notification-kicker">{t(item.minutes===0?"课程已到开始时间":item.minutes===5?"课前 5 分钟提醒":"课前 30 分钟提醒")}</span><h3>{item.subject}</h3><p>{date(item.plannedStart)} · {item.teacherName}</p></div><div className="notification-actions"><Button variant="outline" onClick={onLesson}>{t("查看课程")}</Button>{!item.readAt&&<Button variant="outline" disabled={busy} onClick={()=>void read(item.id)}>{t("标记已读")}</Button>}</div></article>)}</div>}
    </section></div>;
}
