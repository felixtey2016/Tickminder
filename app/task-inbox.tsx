"use client";
import {useCallback,useEffect,useId,useRef,useState} from "react";
import {ClipboardCheck,RefreshCw,ArrowRight} from "lucide-react";
import {Button} from "@/components/ui/button";
import {groupFetch} from "@/lib/group-client";
import {actionFailureMessage,readApiJson} from "@/lib/action-feedback";
import type {ClassroomTaskInbox} from "@/lib/classroom-tasks";
import {taskLabel as label,taskStatusLabel} from "@/lib/classroom-tasks-i18n";
import "./task-inbox.css";

export function TaskInbox({role,onOpen}:{role:"teacher"|"student"|"admin";onOpen:(classroomId:string,taskId:string)=>void}){
  const heading=useId(),[data,setData]=useState<ClassroomTaskInbox|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[denied,setDenied]=useState(false);
  const [filter,setFilter]=useState("all");
  const controller=useRef<AbortController|null>(null),sequence=useRef(0),alive=useRef(false);
  const load=useCallback(async(cursor:string|null=null,reset=false)=>{
    if(reset){setData(null);setDenied(false);}
    const current=++sequence.current,request=new AbortController();controller.current?.abort();controller.current=request;setBusy(true);setError("");
    try{
      const response=await groupFetch("/api/classroom-tasks?"+new URLSearchParams({view:"inbox",...(role==="student"?{status:filter}:{}),...(cursor?{cursor}:{})}),{cache:"no-store",signal:request.signal});
      const value=await readApiJson<ClassroomTaskInbox&{error?:string}>(response);
      if(!response.ok)throw Object.assign(new Error(value.error||label("任务暂时无法载入。","Tasks could not load.")),{status:response.status});
      if(!Array.isArray(value.items))throw new Error(label("任务响应无效。","Invalid task response."));
      if(!alive.current||current!==sequence.current)return;
      setDenied(false);setData(previous=>cursor&&previous?{...value,items:[...new Map([...previous.items,...value.items].map(item=>[item.classroomId+":"+item.taskId,item])).values()]}:value);
    }catch(reason){
      if(!alive.current||request.signal.aborted||current!==sequence.current)return;
      const status=(reason as {status?:number})?.status;
      if(status===401||status===403){setData(null);setDenied(true);}else setError(actionFailureMessage(reason,label("任务暂时无法载入，请重试。","Tasks could not load. Please retry.")));
    }finally{if(alive.current&&current===sequence.current)setBusy(false);}
  },[filter,role]);
  useEffect(()=>{
    // A changed role/filter starts a new external request and clears old results.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    alive.current=true;void load(null,true);
    const refresh=()=>{if(document.visibilityState==="visible")void load();};
    window.addEventListener("focus",refresh);window.addEventListener("classroom-tasks-changed",refresh);
    return()=>{alive.current=false;controller.current?.abort();window.removeEventListener("focus",refresh);window.removeEventListener("classroom-tasks-changed",refresh);};
  },[load,role]);
  if(denied)return null;
  const items=data?.items.filter(item=>filter==="all"||item.status===filter)||[];
  return <section className="panel task-inbox" data-error-popup-ignore aria-labelledby={heading} data-testid="task-inbox"><header><h2 id={heading}><ClipboardCheck size={20} aria-hidden="true"/>{role==="student"?label("我的任务","My tasks"):label("待我确认的任务","Tasks awaiting my review")}</h2><Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>void load()}><RefreshCw size={16} aria-hidden="true"/>{label("刷新","Refresh")}</Button></header>
    {role==="student"&&(filter!=="all"||Boolean(data?.items.length)||Boolean(data?.nextCursor))&&<div className="task-inbox-filters">{[["all",label("全部","All")],["pending",label("待完成","To do")],["needs_redo",label("需重做","Try again")],["awaiting_review",label("待确认","Awaiting review")]].map(([value,text])=><Button key={value} type="button" size="sm" variant={filter===value?"default":"outline"} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{text}</Button>)}</div>}
    {error&&<p role="alert">{error}</p>}{busy&&!data&&<p role="status">{label("正在载入任务…","Loading tasks…")}</p>}
    <ul aria-busy={busy}>{items.map(item=><li key={item.classroomId+":"+item.taskId}><button type="button" onClick={()=>onOpen(item.classroomId,item.taskId)}><span className="task-inbox-text"><strong>{item.title}</strong><span>{item.classroomTitle}</span></span><span className="task-inbox-status">{role==="student"?taskStatusLabel(item.status):`${item.awaitingReview} ${label("位待确认","awaiting review")}`}</span><ArrowRight size={18} aria-hidden="true"/></button></li>)}</ul>
    {data&&!items.length&&!error&&<p className="task-inbox-empty">{role==="student"?label("没有符合条件的任务","No matching tasks"):label("目前没有待确认的任务","No tasks awaiting review")}</p>}
    {data?.nextCursor&&<Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>void load(data.nextCursor)}>{label("加载更多","Load more")}</Button>}
  </section>;
}
