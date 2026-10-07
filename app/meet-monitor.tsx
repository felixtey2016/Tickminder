"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { Video,RefreshCw } from "lucide-react";
import { getLanguage,t } from "@/lib/i18n";
import { alertActionFailure,readApiJson,showActionToast } from "@/lib/action-feedback";
import { Button } from "@/components/ui/button";
import { meetCode } from "@/lib/meet";
type Observation={id:string;plannedStart:string;plannedEnd:string;error:string|null;summary:{status:string;observedAt:string;activeCount:number;teacherSeconds:number|null;studentSeconds:number|null;commonSeconds:number|null;matchedTeacher:boolean;matchedStudent:boolean}|null;
 participants:Array<{displayName:string;role:string;sessions:Array<{startTime:string;endTime:string|null}>}>};
type State={supported:boolean;connected:boolean;configured:boolean;canSync:boolean;current:Observation|null;history:Observation[]};
type Settings={configured:boolean;clockActive:boolean;connection:{email:string;connectedAt:string;error:string|null}|null};
type Lesson={id:string;student:string;subject:string;teacherName:string;plannedStart:string;plannedEnd:string;onlineLink?:string|null;status:string};
const statusText:Record<string,string>={stale:"记录待更新",in_class:"会议进行中",ended:"会议已结束",not_observed:"尚未读取到会议记录"};
const errorText:Record<string,string>={denied:"此 Google 账号无权读取会议，请连接创建会议的账号",reconnect:"Google Meet 授权已失效，请重新连接",network:"无法连接 Google Meet，请稍后重试",quota:"Google Meet 请求过多，请稍后再试",provider:"Google Meet 暂未提供完整记录，请稍后重试",busy:"会议记录正在更新，请稍后查看",unavailable:"会议记录暂时无法载入，请稍后重试",api_disabled:"Google Meet API 尚未启用，请联系管理员完成配置"};
const date=(iso:string)=>new Intl.DateTimeFormat(getLanguage()==="zh"?"zh-CN":"en-GB",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date(iso));
const duration=(seconds:number|null)=>seconds===null?"—":`${Math.floor(seconds/60)} ${t("分钟")} ${seconds%60} ${t("秒")}`;
function Evidence({observation:o}:{observation:Observation}){
 return <div className="meet-evidence">
  {o.error && <p role="status" className="meet-notice">{t(errorText[o.error]||errorText.unavailable)}</p>}
  {o.summary && <><p><strong>{t(statusText[o.summary.status]||"记录待更新")}</strong> · {o.summary.activeCount} {t("人在线（最近检测）")}</p>
   <dl className="meet-times"><div><dt>{t("老师在线时长")}</dt><dd>{duration(o.summary.teacherSeconds)}</dd></div><div><dt>{t("学生在线时长")}</dt><dd>{duration(o.summary.studentSeconds)}</dd></div><div><dt>{t("共同在线时长")}</dt><dd>{duration(o.summary.commonSeconds)}</dd></div></dl>
   {(!o.summary.matchedTeacher||!o.summary.matchedStudent) && <p className="muted">{t("身份未完全匹配。请使用已连接的 Google 账号进入会议；匿名或其他账号无法确认身份。")}</p>}
   <p className="muted">{t("时长仅计算本堂课计划时段内的在线记录，不改变打卡或计费。")}</p>
   <small>{t("最近检测")} · {date(o.summary.observedAt)}</small>
   {!!o.participants.length && <details className="meet-sessions"><summary>{t("加入与离开记录")}</summary>{o.participants.map((p,i)=><div key={i}><strong>{p.displayName||t("未识别参与者")}</strong><small> · {t(p.role==="teacher"?"老师":p.role==="student"?"学生":"身份未匹配")}</small>{p.sessions.map((s,j)=><p key={j}>{date(s.startTime)} → {s.endTime?date(s.endTime):t("尚未离开（最近检测）")}</p>)}</div>)}</details>}
  </>}
 </div>;
}
export function LessonMeet({lessonId,onlineLink}:{lessonId:string;onlineLink?:string|null}){
 const [open,setOpen]=useState(false),[state,setState]=useState<State|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const inFlight=useRef(false);
 const load=useCallback(async(manual=false)=>{
  if(inFlight.current)return;inFlight.current=true;setBusy(true);
  try{
   const response=await fetch(manual?"/api/meet":`/api/meet?lessonId=${encodeURIComponent(lessonId)}`,manual?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"sync",lessonId})}:{cache:"no-store"});
   const data=await readApiJson<State&{error?:string}>(response);if(!response.ok)throw new Error(data.error||"会议记录暂时无法载入，请稍后重试");
   setState(data);setError("");if(manual)showActionToast("success","会议记录已更新");
  }catch(e){const message=e instanceof Error?t(e.message):t("会议记录暂时无法载入，请稍后重试");setError(message);if(manual)alertActionFailure(e);}
  finally{inFlight.current=false;setBusy(false);}
 },[lessonId]);
 useEffect(()=>{if(!open)return;const timer=setInterval(()=>{if(document.visibilityState==="visible")void load();},30_000);return()=>clearInterval(timer);},[open,load]);
 if(!meetCode(onlineLink))return null;
 return <details className="lesson-history meet-detail" open={open} onToggle={e=>{const next=e.currentTarget.open;setOpen(next);if(next)void load();}}><summary><Video size={16} aria-hidden/> {t("Meet 上课记录")}</summary>{open && <div className="lesson-history-body">
  {busy&&!state && <p role="status">{t("正在载入…")}</p>}{error && <p role="alert">{error} <Button size="sm" variant="outline" onClick={()=>void load()} disabled={busy}>{t("重试")}</Button></p>}
  {state && <>{!state.configured?<p>{t("Google Meet 检测尚未配置，请联系管理员")}</p>:!state.connected?<p>{t("老师尚未连接创建会议的 Google 账号")}</p>:!state.current?.summary?<p>{t("尚未读取到会议记录")}</p>:null}
   {state.current && <Evidence observation={state.current}/>}
   {state.canSync && <Button size="sm" variant="outline" disabled={busy} onClick={()=>void load(true)}><RefreshCw size={16} aria-hidden/>{t(busy?"正在更新…":"更新会议记录")}</Button>}
   {!!state.history.length && <details><summary>{t("此前时段的检测记录")}</summary>{state.history.map(o=><div key={o.id}><h4>{date(o.plannedStart)} – {date(o.plannedEnd)}</h4><Evidence observation={o}/></div>)}</details>}
  </>}
 </div>}</details>;
}
export function MeetMonitor({role,lessons}:{role:string;lessons:Lesson[]}){
 const [settings,setSettings]=useState<Settings|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");const flight=useRef(false);
 async function refresh(){try{const r=await fetch("/api/meet",{cache:"no-store"}),s=await readApiJson<Settings&{error?:string}>(r);if(!r.ok)throw Error(s.error||"会议记录暂时无法载入，请稍后重试");setSettings(s);setError("");}catch(e){setError(e instanceof Error?t(e.message):t("会议记录暂时无法载入，请稍后重试"));}}
 useEffect(()=>{void Promise.resolve().then(refresh);const url=new URL(window.location.href),result=url.searchParams.get("meetResult");if(result){if(result==="connected")showActionToast("success","Google Meet 已连接");else alertActionFailure(Error(errorText[result]||"Google Meet 授权未完成，请重新连接"));url.searchParams.delete("meetResult");window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);}},[]);
 async function act(action:"connect"|"disconnect"){
  if(flight.current)return;flight.current=true;setBusy(true);
  try{const r=await fetch("/api/meet",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})}),data=await readApiJson<{url?:string;error?:string}>(r);if(!r.ok)throw Error(data.error||"Google Meet 授权未完成，请重新连接");
   if(action==="connect" && data.url){const u=new URL(data.url);if(u.origin!=="https://accounts.google.com")throw Error("Google Meet 授权未完成，请重新连接");window.location.assign(u.href);}else{await refresh();showActionToast("success","Google Meet 已断开连接");}
  }catch(e){alertActionFailure(e);}finally{flight.current=false;setBusy(false);}
 }
 const eligible=lessons.filter(l=>l.status!=="cancelled"&&meetCode(l.onlineLink)).sort((a,b)=>b.plannedStart.localeCompare(a.plannedStart));
 return <section className="panel meet-monitor"><h2>{t("Meet 上课记录")}</h2>
  {error && <p role="alert">{error} <Button onClick={()=>void refresh()} variant="outline">{t("重试")}</Button></p>}
  {!settings&&!error && <p>{t("正在载入…")}</p>}
  {settings && <>{!settings.configured && <p className="meet-notice">{t("Google Meet 检测尚未配置，请联系管理员")}</p>}
   {role==="teacher" && <div className="meet-connection"><h3>{t("会议账号")}</h3><p>{settings.connection?.email||t("尚未连接")}</p><p className="muted">{t("连接创建上课会议的 Google 账号，允许读取加入和离开时间。不会读取录像或 Google Drive 文件。")}</p>
    {settings.connection?.error && <p role="status">{t(errorText[settings.connection.error]||errorText.unavailable)}</p>}
    <div className="portal-actions"><Button disabled={busy||!settings.configured} onClick={()=>void act("connect")}>{t(settings.connection?"重新连接 Google Meet":"连接 Google Meet")}</Button>{settings.connection && <Button variant="outline" disabled={busy} onClick={()=>void act("disconnect")}>{t("断开连接")}</Button>}</div>
   </div>}
   {settings.configured && !settings.clockActive && <p className="meet-notice">{t("后台检测尚未连接，老师或管理员可手动更新会议记录。")}</p>}
  </>}
  <p className="muted">{t("会议数据可能延迟。没有记录不代表缺席；上课打卡仍按原流程确认。")}</p>
  {eligible.length?eligible.map(l=><article className="portal-card" key={`${l.id}:${l.onlineLink}:${l.plannedStart}`}><div><strong>{role==="student"?l.subject:`${l.student} · ${l.subject}`}</strong><p>{date(l.plannedStart)} – {date(l.plannedEnd)}</p><p className="muted">{l.teacherName}</p></div><LessonMeet lessonId={l.id} onlineLink={l.onlineLink}/></article>):<p>{t("暂无已绑定 Google Meet 链接的课程")}</p>}
 </section>;
}
