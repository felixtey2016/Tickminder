"use client";

import {useCallback,useEffect,useId,useRef,useState,type FormEvent,type ReactNode} from "react";
import {Archive,Check,CheckCircle2,ClipboardCheck,Plus,RefreshCw} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {MascotNote,PageState} from "@/components/page-state";
import {groupFetch} from "@/lib/group-client";
import {actionFailureMessage,readApiJson} from "@/lib/action-feedback";
import {getLanguage} from "@/lib/i18n";
import type {ClassroomTask,ClassroomTasksState,ClassroomTaskStudent} from "@/lib/classroom-tasks";
import {taskStatusLabel,taskHistoryLabel} from "@/lib/classroom-tasks-i18n";
import {useAdminAction} from "./admin-permission-context";
import "./classroom-tasks.css";

type Role="admin"|"teacher"|"student";
type Action="create"|"submit"|"approve"|"return"|"archive";
type TaskClassroom={id:string;title:string;archived:number|boolean};
type WriteBody={action:Action;classroomId:string;id?:string;title?:string;description?:string;studentName?:string;expectedEventId?:string|null;reason?:string};
type PendingOperation={signature:string;id:string};
type Confirmation={action:Action;id:string;refreshFailed:boolean};
const label=(zh:string,en:string)=>getLanguage()==="zh"?zh:en;
const aborted=(error:unknown)=>error instanceof DOMException&&error.name==="AbortError";
function completedDate(value:string){
  const date=new Date(value);
  return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(getLanguage()==="zh"?"zh-CN":"en-GB",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(date):"";
}

type Props={classroom:TaskClassroom;role:Role;focusTaskId?:string};
function TaskProgress({hasPending,children}:{hasPending:boolean;children:ReactNode}){
  const [open,setOpen]=useState(hasPending);
  return <details className="classroom-task-progress" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>{children}</details>;
}
export function ClassroomTasks(props:Props){return <TaskSelection key={[props.classroom.id,props.role,props.focusTaskId,Boolean(props.classroom.archived)].join(":")} {...props}/>;}
function TaskSelection({classroom,role,focusTaskId}:Props){
  const [selectedTask,setSelectedTask]=useState(focusTaskId||"");
  return <ClassroomTasksContent key={selectedTask} classroom={classroom} role={role} selectedTask={selectedTask} onViewAll={()=>setSelectedTask("")}/>;
}
function ClassroomTasksContent({classroom,role,selectedTask,onViewAll}:{classroom:TaskClassroom;role:Role;selectedTask:string;onViewAll:()=>void}){
  const can=useAdminAction();
  const formId=useId(),scope=classroom.id+":"+role+":"+Boolean(classroom.archived)+":"+selectedTask,scopeRef=useRef(scope);
  const [data,setData]=useState<ClassroomTasksState|null>(null),[loading,setLoading]=useState(true),[loadingMore,setLoadingMore]=useState(false),[loadError,setLoadError]=useState("");
  const [editorOpen,setEditorOpen]=useState(false),[title,setTitle]=useState(""),[description,setDescription]=useState("");
  const [busy,setBusy]=useState(""),[writeError,setWriteError]=useState(""),[confirmation,setConfirmation]=useState<Confirmation|null>(null);
  const [reviewFilter,setReviewFilter]=useState(false),[returnTarget,setReturnTarget]=useState<{task:ClassroomTask;student:ClassroomTaskStudent}|null>(null),[reason,setReason]=useState("");
  const mounted=useRef(false),readSequence=useRef(0),readController=useRef<AbortController|null>(null),writeController=useRef<AbortController|null>(null),inFlight=useRef(false);
  const operations=useRef(new Map<string,PendingOperation>()),[confirmed,setConfirmed]=useState(new Set<string>());

  const loadPage=useCallback(async(cursor:string|null=null,append=false,preserveConfirmation=false)=>{
    const requestScope=scope,sequence=++readSequence.current,controller=new AbortController();
    readController.current?.abort();readController.current=controller;
    if(append)setLoadingMore(true);else setLoading(true);
    setLoadError("");
    try{
      const query=new URLSearchParams({classroomId:classroom.id,...(selectedTask?{taskId:selectedTask}:cursor?{cursor}:{})});
      const response=await groupFetch("/api/classroom-tasks?"+query,{cache:"no-store",signal:controller.signal});
      const result=await readApiJson<ClassroomTasksState&{error?:string}>(response);
      if(!response.ok)throw Object.assign(new Error(result.error||label("任务暂时无法载入，请重试。","Tasks could not load. Please retry.")),{status:response.status});
      if(result.classroomId!==classroom.id||!Array.isArray(result.tasks))throw new Error(label("任务响应无效，请重新载入。","The task response was invalid. Reload tasks."));
      if(!mounted.current||scopeRef.current!==requestScope||controller.signal.aborted||sequence!==readSequence.current)return false;
      setData(previous=>append&&previous?.classroomId===result.classroomId?{...result,tasks:[...new Map([...previous.tasks,...result.tasks].map(task=>[task.id,task])).values()]}:result);
      setConfirmation(previous=>preserveConfirmation&&previous?{...previous,refreshFailed:false}:null);
      return true;
    }catch(error){
      if(!mounted.current||scopeRef.current!==requestScope||controller.signal.aborted||sequence!==readSequence.current||aborted(error))return false;
      if([401,403,404].includes((error as {status?:number})?.status||0))setData(null);
      setLoadError(actionFailureMessage(error,label("任务暂时无法载入，请重试。","Tasks could not load. Please retry.")));
      return false;
    }finally{
      if(mounted.current&&scopeRef.current===requestScope&&sequence===readSequence.current){setLoading(false);setLoadingMore(false);}
    }
  },[classroom.id,scope,selectedTask]);

  useEffect(()=>{
    mounted.current=true;
    // This keyed scope owns an external request and its loading lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPage();
    return()=>{mounted.current=false;readController.current?.abort();writeController.current?.abort();};
  },[loadPage]);
  useEffect(()=>{const refresh=()=>{if(document.visibilityState==="visible"&&!inFlight.current)void loadPage();};window.addEventListener("focus",refresh);return()=>window.removeEventListener("focus",refresh);},[loadPage]);

  const readOnly=Boolean(classroom.archived)||Boolean(data?.readOnly);
  const staff=role==="teacher"||role==="admin";
  const canCreate=staff&&can("tasks.create")&&Boolean(data?.canCreate)&&!readOnly;
  const canComplete=role==="student"&&Boolean(data?.canComplete)&&!readOnly;
  const canArchive=staff&&can("tasks.archive")&&Boolean(data?.canArchive)&&!readOnly;
  const canReview=staff&&can("tasks.review")&&Boolean(data?.canReview)&&!readOnly;
  const operationKey=(body:WriteBody)=>[body.action,body.id||"new",body.studentName||"",body.expectedEventId||"initial"].join(":");

  async function mutate(body:WriteBody){
    if(inFlight.current)return;
    const action=body.action,key=operationKey(body),requestScope=scope;
    if(action==="create"?!canCreate:action==="submit"?!canComplete:action==="archive"?!canArchive:!canReview)return;
    if(confirmed.has(key))return;
    const signature=JSON.stringify(body);
    if(operations.current.get(key)?.signature!==signature)operations.current.set(key,{signature,id:crypto.randomUUID()});
    const operationId=operations.current.get(key)!.id,controller=new AbortController();
    writeController.current?.abort();writeController.current=controller;
    readController.current?.abort();++readSequence.current;setLoading(false);setLoadingMore(false);
    inFlight.current=true;setBusy(key);setWriteError("");setConfirmation(null);
    try{
      const response=await groupFetch("/api/classroom-tasks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,operationId}),signal:controller.signal});
      const result=await readApiJson<{ok:boolean;id:string;error?:string}>(response);
      if(!response.ok||result.ok!==true||typeof result.id!=="string")throw Object.assign(new Error(result.error||label("任务结果尚未确认，请重试。","The task result could not be confirmed. Please retry.")),{status:response.status});
      if(!mounted.current||scopeRef.current!==requestScope||controller.signal.aborted)return;
      operations.current.delete(key);
      if(action!=="create")setConfirmed(previous=>new Set(previous).add(key));
      if(action==="create"){setTitle("");setDescription("");setEditorOpen(false);}
      if(action==="return"){setReturnTarget(null);setReason("");}
      window.dispatchEvent(new Event("classroom-tasks-changed"));
      setConfirmation({action,id:result.id,refreshFailed:false});
      const refreshed=await loadPage(null,false,true);
      if(!mounted.current||scopeRef.current!==requestScope)return;
      if(!refreshed)setConfirmation({action,id:result.id,refreshFailed:true});
    }catch(error){
      if(!mounted.current||scopeRef.current!==requestScope||controller.signal.aborted||aborted(error))return;
      if([401,403,404].includes((error as {status?:number})?.status||0))setData(null);
      setWriteError(actionFailureMessage(error,label("任务结果尚未确认，请重试。","The task result could not be confirmed. Please retry.")));
    }finally{
      if(mounted.current&&scopeRef.current===requestScope){inFlight.current=false;setBusy("");}
    }
  }

  function publish(event:FormEvent){
    event.preventDefault();
    if(!title.trim()||title.trim().length>120||description.trim().length>2000||!canCreate)return;
    void mutate({action:"create",classroomId:classroom.id,title:title.trim(),description:description.trim()});
  }

  const confirmedText=confirmation?.action==="create"?label("任务已发布。","Task published."):confirmation?.action==="submit"?label("已申请，等待老师确认。","Requested. Waiting for teacher confirmation."):confirmation?.action==="approve"?label("已确认学生完成任务。","Student completion confirmed."):confirmation?.action==="return"?label("已要求重做，原因已发送给学生。","Another attempt requested. The student can see your reason."):label("任务已关闭，完成记录已保留。","Task closed. Completion records are retained.");
  function history(student:ClassroomTaskStudent){return student.history.length>0&&<details className="classroom-task-history"><summary>{label("最近记录","Recent history")}</summary><ol>{student.history.map(event=><li key={event.eventId}><div>{taskHistoryLabel(event.action)}{event.actorName&&<> · {event.actorName}</>}<time dateTime={event.at}>{completedDate(event.at)}</time></div>{event.reason&&<p>{event.reason}</p>}</li>)}</ol></details>;}
  function taskCard(task:ClassroomTask){
    const own=task.studentState,taskArchived=task.archived||confirmed.has(operationKey({action:"archive",id:task.id,classroomId:classroom.id}));
    const submit:WriteBody={action:"submit",classroomId:classroom.id,id:task.id,expectedEventId:own?.stateVersion||null};
    const actionable=own&&["pending","needs_redo"].includes(own.status)&&!confirmed.has(operationKey(submit));
    return <article className={`classroom-task-card${taskArchived?" is-closed":""}`} key={task.id} id={`class-task-${task.id}`} tabIndex={-1} data-task-id={task.id}>
      <div className="classroom-task-card-heading"><h3>{task.title}</h3><span className="classroom-task-badge" data-status={taskArchived?"closed":own?.status||"open"}>{taskArchived?label("已关闭","Closed"):own?taskStatusLabel(own.status):label("进行中","Open")}</span></div>
      {task.description&&<p className="classroom-task-description">{task.description}</p>}
      {own?.reason&&<p className="classroom-task-reason">{label("重做原因：","Try again: ")}{own.reason}</p>}
      {own&&history(own)}
      {staff&&task.progress&&<TaskProgress hasPending={task.progress.awaitingReview>0}><summary><span>{label("查看完成情况","View completion")}</span><strong>{task.progress.completed} / {task.progress.total} {label("已确认","confirmed")}</strong></summary>
        <div className="classroom-task-counts"><span>{label("待确认","Awaiting review")} {task.progress.awaitingReview}</span>{task.progress.needsRedo>0&&<span>{label("需重做","Needs another attempt")} {task.progress.needsRedo}</span>}{task.progress.legacyCompleted>0&&<span>{label("此前自行完成","Previously self-completed")} {task.progress.legacyCompleted}</span>}</div>
        <ul>{task.progress.students.filter(student=>!reviewFilter||student.status==="awaiting_review").map(student=>{
          const approve:WriteBody={action:"approve",classroomId:classroom.id,id:task.id,studentName:student.studentName,expectedEventId:student.stateVersion};
          return <li key={student.studentName} className="classroom-task-student"><div className="classroom-task-student-head"><strong>{student.studentName}</strong><span className="classroom-task-badge" data-status={student.status}>{taskStatusLabel(student.status)}</span></div>
            {student.reason&&<p className="classroom-task-reason">{student.reason}</p>}
            {canReview&&!taskArchived&&student.status==="awaiting_review"&&<div className="classroom-task-review-actions"><Button type="button" size="sm" disabled={Boolean(busy)||confirmed.has(operationKey(approve))} onClick={()=>void mutate(approve)}><Check size={16} aria-hidden="true"/>{label("确认完成","Confirm completion")}</Button><Button type="button" size="sm" variant="outline" disabled={Boolean(busy)||confirmed.has(operationKey(approve))} onClick={()=>{setReturnTarget({task,student});setReason("");setWriteError("");}}>{label("要求重做","Request another attempt")}</Button></div>}{history(student)}</li>;
        })}</ul>{!task.progress.students.length&&<p>{label("此任务暂时没有可显示的学生。","There are no students to display for this task.")}</p>}</TaskProgress>}
      <div className="classroom-task-card-actions">
        {role==="student"&&!taskArchived&&canComplete&&actionable&&<Button type="button" size="sm" disabled={Boolean(busy)} onClick={()=>void mutate(submit)}><Check size={17} aria-hidden="true"/>{busy===operationKey(submit)?label("正在保存…","Saving…"):own.status==="needs_redo"?label("重新申请确认","Request confirmation again"):label("申请老师确认","Request teacher confirmation")}</Button>}
        {canArchive&&!taskArchived&&<Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={()=>void mutate({action:"archive",classroomId:classroom.id,id:task.id})}><Archive size={16} aria-hidden="true"/>{label("关闭任务","Close task")}</Button>}
      </div>
    </article>;
  }

  return <section className="panel classroom-tasks" data-error-popup-ignore data-testid="classroom-tasks" aria-labelledby={formId+"-heading"}>
    <div className="classroom-task-heading"><div><h2 id={formId+"-heading"}><ClipboardCheck size={21} aria-hidden="true"/>{label("班级任务","Class tasks")}</h2><p>{role==="student"?label("完成活动后，申请老师确认。","Finish the activity, then request teacher confirmation."):label("布置任务并确认学生的完成情况。","Assign tasks and confirm students’ completion.")}</p></div><div className="classroom-task-heading-actions"><Button type="button" size="sm" variant="outline" disabled={Boolean(busy)||loading||loadingMore} onClick={()=>void loadPage()}><RefreshCw size={16} aria-hidden="true"/>{label("刷新","Refresh")}</Button>{canCreate&&<Button type="button" size="sm" disabled={Boolean(busy)} aria-expanded={editorOpen} aria-controls={formId+"-form"} onClick={()=>setEditorOpen(value=>!value)}><Plus size={17} aria-hidden="true"/>{label("新增任务","New task")}</Button>}</div></div>
    {readOnly&&<p className="classroom-task-readonly">{classroom.archived?label("此班级已封存，任务和完成记录仅供查看。","This classroom is archived. Tasks and completion records are read-only."):label("当前任务和完成记录仅供查看。","These tasks and completion records are read-only.")}</p>}
    {confirmation&&<div role="status" className="classroom-task-success"><CheckCircle2 size={18} aria-hidden="true"/><p>{confirmedText}{confirmation.refreshFailed&&<> {label("列表暂未更新，请重新载入；无需重新提交这次操作。","The list could not refresh. Reload tasks; this operation does not need to be submitted again.")}</>}</p></div>}
    {writeError&&<div role="alert" className="classroom-task-action-error"><p>{writeError}</p><small>{label("请再次点击对应按钮重试；若已显示成功，请重新载入列表。","Try the action again. If a success message is shown, reload the list instead.")}</small></div>}
    {editorOpen&&canCreate&&<form id={formId+"-form"} className="classroom-task-form" onSubmit={publish}><label htmlFor={formId+"-title"}>{label("任务标题","Task title")}<input id={formId+"-title"} required maxLength={120} value={title} disabled={Boolean(busy)} onChange={event=>{setTitle(event.target.value);setWriteError("");}}/></label><label htmlFor={formId+"-description"}>{label("任务说明（可选）","Instructions (optional)")}<textarea id={formId+"-description"} rows={3} maxLength={2000} value={description} disabled={Boolean(busy)} onChange={event=>{setDescription(event.target.value);setWriteError("");}}/></label><div className="classroom-task-form-actions"><Button type="button" variant="outline" disabled={Boolean(busy)} onClick={()=>setEditorOpen(false)}>{label("取消","Cancel")}</Button><Button type="submit" disabled={Boolean(busy)||!title.trim()}>{busy.startsWith("create:new:")?label("正在发布…","Publishing…"):label("发布任务","Publish task")}</Button></div></form>}
    {loadError&&<div className="classroom-task-load-error" role="alert"><p>{loadError}</p><Button type="button" size="sm" variant="outline" disabled={Boolean(busy)||loading||loadingMore} onClick={()=>void loadPage()}>{data?label("重新载入","Reload tasks"):label("重试","Retry")}</Button></div>}
    <div className="classroom-task-filters">{selectedTask&&<Button type="button" variant="outline" size="sm" disabled={Boolean(busy)} onClick={onViewAll}>{label("查看全部班级任务","View all class tasks")}</Button>}{canReview&&<Button type="button" variant={reviewFilter?"default":"outline"} size="sm" aria-pressed={reviewFilter} onClick={()=>setReviewFilter(value=>!value)}>{label("待我确认","Awaiting my review")} {data?.tasks.reduce((sum,task)=>sum+(task.archived?0:task.progress?.awaitingReview||0),0)||0}</Button>}</div>
    {loading&&!data?<PageState kind="loading" title={label("正在载入任务…","Loading tasks…")}/>:data&&<>
      {data.tasks.length?<div className="classroom-task-list" aria-busy={loading||loadingMore}>{data.tasks.filter(task=>!reviewFilter||Boolean(task.progress?.awaitingReview)).map(taskCard)}</div>:!loadError&&<MascotNote pose={role==="student"?"sleepy":"ready"} title={label("暂无班级任务","No class tasks yet")} description={role==="student"?label("老师布置任务后会显示在这里。","Tasks will appear here when your teacher assigns them."):label("发布任务后，可在这里查看完成情况。","Publish a task to view completion here.")} className="classroom-task-empty"/>}
      <div className="classroom-task-pagination"><p>{label("已载入","Loaded")} {data.tasks.length} {label("个任务","tasks")}</p>{data.nextCursor&&<Button type="button" variant="outline" disabled={Boolean(busy)||loading||loadingMore} onClick={()=>void loadPage(data.nextCursor,true)}>{loadingMore?label("正在加载…","Loading…"):label("加载更多","Load more")}</Button>}</div>
    </>}
    <Dialog open={Boolean(returnTarget)} onOpenChange={open=>{if(!open&&!busy)setReturnTarget(null);}}><DialogContent><DialogTitle>{label("要求重做","Request another attempt")}</DialogTitle><DialogDescription>{returnTarget?.student.studentName} · {returnTarget?.task.title}</DialogDescription><form className="classroom-task-return-form" data-error-popup-ignore onSubmit={event=>{event.preventDefault();if(returnTarget&&reason.trim())void mutate({action:"return",classroomId:classroom.id,id:returnTarget.task.id,studentName:returnTarget.student.studentName,expectedEventId:returnTarget.student.stateVersion,reason:reason.trim()});}}><label htmlFor={formId+"-reason"}>{label("重做原因","Reason")}<textarea id={formId+"-reason"} required maxLength={1000} rows={3} value={reason} disabled={Boolean(busy)} onChange={event=>setReason(event.target.value)}/></label>{writeError&&<p role="alert">{writeError}</p>}<div className="classroom-task-form-actions"><Button type="button" variant="outline" disabled={Boolean(busy)} onClick={()=>setReturnTarget(null)}>{label("取消","Cancel")}</Button><Button type="submit" disabled={Boolean(busy)||!reason.trim()}>{label("发送给学生","Send to student")}</Button></div></form></DialogContent></Dialog>
  </section>;
}
