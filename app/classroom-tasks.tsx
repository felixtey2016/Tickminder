"use client";

import {useCallback,useEffect,useId,useRef,useState,type FormEvent} from "react";
import {Archive,Check,CheckCircle2,ClipboardCheck,Plus,RefreshCw} from "lucide-react";
import {Button} from "@/components/ui/button";
import {MascotNote,PageState} from "@/components/page-state";
import {groupFetch} from "@/lib/group-client";
import {actionFailureMessage,readApiJson} from "@/lib/action-feedback";
import {getLanguage} from "@/lib/i18n";
import type {ClassroomTask,ClassroomTasksState} from "@/lib/classroom-tasks";
import {useAdminAction} from "./admin-permission-context";
import "./classroom-tasks.css";

type Role="admin"|"teacher"|"student";
type Action="create"|"complete"|"archive";
type TaskClassroom={id:string;title:string;archived:number|boolean};
type WriteBody={action:Action;classroomId:string;id?:string;title?:string;description?:string};
type PendingOperation={signature:string;id:string};
type Confirmation={action:Action;id:string;refreshFailed:boolean};
const label=(zh:string,en:string)=>getLanguage()==="zh"?zh:en;
const aborted=(error:unknown)=>error instanceof DOMException&&error.name==="AbortError";
function completedDate(value:string){
  const date=new Date(value);
  return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(getLanguage()==="zh"?"zh-CN":"en-GB",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(date):"";
}

export function ClassroomTasks({classroom,role}:{classroom:TaskClassroom;role:Role}){
  const can=useAdminAction();
  const formId=useId(),scope=classroom.id+":"+role+":"+Boolean(classroom.archived),scopeRef=useRef(scope);scopeRef.current=scope;
  const [data,setData]=useState<ClassroomTasksState|null>(null),[loading,setLoading]=useState(true),[loadingMore,setLoadingMore]=useState(false),[loadError,setLoadError]=useState("");
  const [editorOpen,setEditorOpen]=useState(false),[title,setTitle]=useState(""),[description,setDescription]=useState("");
  const [busy,setBusy]=useState(""),[writeError,setWriteError]=useState(""),[confirmation,setConfirmation]=useState<Confirmation|null>(null);
  const mounted=useRef(false),readSequence=useRef(0),readController=useRef<AbortController|null>(null),writeController=useRef<AbortController|null>(null),inFlight=useRef(false);
  const operations=useRef(new Map<string,PendingOperation>()),confirmed=useRef(new Set<string>());

  const loadPage=useCallback(async(cursor:string|null=null,append=false)=>{
    const requestScope=scope,sequence=++readSequence.current,controller=new AbortController();
    readController.current?.abort();readController.current=controller;
    if(append)setLoadingMore(true);else setLoading(true);
    setLoadError("");
    try{
      const query=new URLSearchParams({classroomId:classroom.id,...(cursor?{cursor}:{})});
      const response=await groupFetch("/api/classroom-tasks?"+query,{cache:"no-store",signal:controller.signal});
      const result=await readApiJson<ClassroomTasksState&{error?:string}>(response);
      if(!response.ok)throw Object.assign(new Error(result.error||label("任务暂时无法载入，请重试。","Tasks could not load. Please retry.")),{status:response.status});
      if(result.classroomId!==classroom.id||!Array.isArray(result.tasks))throw new Error(label("任务响应无效，请重新载入。","The task response was invalid. Reload tasks."));
      if(!mounted.current||scopeRef.current!==requestScope||controller.signal.aborted||sequence!==readSequence.current)return false;
      setData(previous=>append&&previous?.classroomId===result.classroomId?{...result,tasks:[...new Map([...previous.tasks,...result.tasks].map(task=>[task.id,task])).values()]}:result);
      setConfirmation(previous=>previous?{...previous,refreshFailed:false}:null);
      return true;
    }catch(error){
      if(!mounted.current||scopeRef.current!==requestScope||controller.signal.aborted||sequence!==readSequence.current||aborted(error))return false;
      if([401,403,404].includes((error as {status?:number})?.status||0))setData(null);
      setLoadError(actionFailureMessage(error,label("任务暂时无法载入，请重试。","Tasks could not load. Please retry.")));
      return false;
    }finally{
      if(mounted.current&&scopeRef.current===requestScope&&sequence===readSequence.current){setLoading(false);setLoadingMore(false);}
    }
  },[classroom.id,scope]);

  useEffect(()=>{
    mounted.current=true;operations.current.clear();confirmed.current.clear();inFlight.current=false;
    setData(null);setEditorOpen(false);setTitle("");setDescription("");setWriteError("");setConfirmation(null);setBusy("");
    void loadPage();
    return()=>{mounted.current=false;++readSequence.current;readController.current?.abort();writeController.current?.abort();};
  },[loadPage]);

  const readOnly=Boolean(classroom.archived)||Boolean(data?.readOnly);
  const staff=role==="teacher"||role==="admin";
  const canCreate=staff&&can("tasks.create")&&Boolean(data?.canCreate)&&!readOnly;
  const canComplete=role==="student"&&Boolean(data?.canComplete)&&!readOnly;
  const canArchive=staff&&can("tasks.archive")&&Boolean(data?.canArchive)&&!readOnly;

  async function mutate(body:WriteBody){
    if(inFlight.current)return;
    const action=body.action,key=action+":"+(body.id||"new"),requestScope=scope;
    if(action==="create"?!canCreate:action==="complete"?!canComplete:!canArchive)return;
    if(confirmed.current.has(key))return;
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
      if(action!=="create")confirmed.current.add(key);
      if(action==="create"){setTitle("");setDescription("");setEditorOpen(false);}
      setConfirmation({action,id:result.id,refreshFailed:false});
      const refreshed=await loadPage();
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

  const confirmedText=confirmation?.action==="create"?label("任务已发布。","Task published."):confirmation?.action==="complete"?label("任务已完成。","Task completed."):label("任务已关闭，完成记录已保留。","Task closed. Completion records are retained.");
  function taskCard(task:ClassroomTask){
    const completionConfirmed=confirmed.current.has("complete:"+task.id),isComplete=Boolean(task.completedAt)||completionConfirmed;
    const taskArchived=Boolean(task.archived)||confirmed.current.has("archive:"+task.id);
    return <article className={`classroom-task-card${taskArchived?" is-closed":""}`} key={task.id} data-task-id={task.id}>
      <div className="classroom-task-card-heading"><h3>{task.title}</h3><span className={`classroom-task-badge${taskArchived?" is-closed":isComplete?" is-complete":""}`}>{taskArchived?label("已关闭","Closed"):role==="student"?(isComplete?label("已完成","Completed"):label("未完成","Not completed")):label("进行中","Open")}</span></div>
      {task.description&&<p className="classroom-task-description">{task.description}</p>}
      {role==="student"&&isComplete&&<p className="classroom-task-completed"><CheckCircle2 size={17} aria-hidden="true"/>{task.completedAt?<><span>{label("完成时间","Completed at")}</span><time dateTime={task.completedAt}>{completedDate(task.completedAt)}</time></>:<span>{label("完成已确认，重新载入可查看完成时间。","Completion is confirmed. Reload tasks to see the completion time.")}</span>}</p>}
      {staff&&task.progress&&<details className="classroom-task-progress"><summary><span>{label("查看完成情况","View completion")}</span><strong>{task.progress.completed} / {task.progress.total} {label("已完成","completed")}</strong></summary><ul>{task.progress.students.map(student=><li key={student.studentName}><span>{student.studentName}</span><span>{student.completedAt?<><Check size={15} aria-hidden="true"/>{label("已完成","Completed")}<time dateTime={student.completedAt}>{completedDate(student.completedAt)}</time></>:label("未完成","Not completed")}</span></li>)}</ul>{!task.progress.students.length&&<p>{label("此任务暂时没有可显示的学生。","There are no students to display for this task.")}</p>}</details>}
      <div className="classroom-task-card-actions">
        {role==="student"&&!taskArchived&&(canComplete||isComplete)&&<Button type="button" size="sm" disabled={Boolean(busy)||isComplete||readOnly||!canComplete} onClick={()=>void mutate({action:"complete",classroomId:classroom.id,id:task.id})}><Check size={17} aria-hidden="true"/>{busy==="complete:"+task.id?label("正在保存…","Saving…"):label("完成任务","Complete")}</Button>}
        {canArchive&&!taskArchived&&<Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={()=>void mutate({action:"archive",classroomId:classroom.id,id:task.id})}><Archive size={16} aria-hidden="true"/>{busy==="archive:"+task.id?label("正在关闭…","Closing…"):label("关闭任务","Close task")}</Button>}
      </div>
    </article>;
  }

  return <section className="panel classroom-tasks" data-testid="classroom-tasks" aria-labelledby={formId+"-heading"}>
    <div className="classroom-task-heading"><div><h2 id={formId+"-heading"}><ClipboardCheck size={21} aria-hidden="true"/>{label("班级任务","Class tasks")}</h2><p>{role==="student"?label("完成老师布置的活动后，点击完成任务。","Choose Complete after finishing an activity your teacher assigned."):label("发布班级任务，查看每位学生的完成情况。","Assign class tasks and view each student's completion.")}</p></div><div className="classroom-task-heading-actions"><Button type="button" size="sm" variant="outline" disabled={Boolean(busy)||loading||loadingMore} onClick={()=>void loadPage()}><RefreshCw size={16} aria-hidden="true"/>{label("刷新","Refresh")}</Button>{canCreate&&<Button type="button" size="sm" disabled={Boolean(busy)} aria-expanded={editorOpen} aria-controls={formId+"-form"} onClick={()=>setEditorOpen(value=>!value)}><Plus size={17} aria-hidden="true"/>{label("新增任务","New task")}</Button>}</div></div>
    {readOnly&&<p className="classroom-task-readonly">{classroom.archived?label("此班级已封存，任务和完成记录仅供查看。","This classroom is archived. Tasks and completion records are read-only."):label("当前任务和完成记录仅供查看。","These tasks and completion records are read-only.")}</p>}
    {confirmation&&<div role="status" className="classroom-task-success"><CheckCircle2 size={18} aria-hidden="true"/><p>{confirmedText}{confirmation.refreshFailed&&<> {label("列表暂未更新，请重新载入；无需重新提交这次操作。","The list could not refresh. Reload tasks; this operation does not need to be submitted again.")}</>}</p></div>}
    {writeError&&<div role="alert" className="classroom-task-action-error"><p>{writeError}</p><small>{label("请再次点击对应按钮重试；若已显示成功，请重新载入列表。","Try the action again. If a success message is shown, reload the list instead.")}</small></div>}
    {editorOpen&&canCreate&&<form id={formId+"-form"} className="classroom-task-form" onSubmit={publish}><label htmlFor={formId+"-title"}>{label("任务标题","Task title")}<input id={formId+"-title"} required maxLength={120} value={title} disabled={Boolean(busy)} onChange={event=>{setTitle(event.target.value);setWriteError("");}}/></label><label htmlFor={formId+"-description"}>{label("任务说明（可选）","Instructions (optional)")}<textarea id={formId+"-description"} rows={3} maxLength={2000} value={description} disabled={Boolean(busy)} onChange={event=>{setDescription(event.target.value);setWriteError("");}}/></label><div className="classroom-task-form-actions"><Button type="button" variant="outline" disabled={Boolean(busy)} onClick={()=>setEditorOpen(false)}>{label("取消","Cancel")}</Button><Button type="submit" disabled={Boolean(busy)||!title.trim()}>{busy==="create:new"?label("正在发布…","Publishing…"):label("发布任务","Publish task")}</Button></div></form>}
    {loadError&&<div className="classroom-task-load-error" role="alert"><p>{loadError}</p><Button type="button" size="sm" variant="outline" disabled={Boolean(busy)||loading||loadingMore} onClick={()=>void loadPage()}>{data?label("重新载入","Reload tasks"):label("重试","Retry")}</Button></div>}
    {loading&&!data?<PageState kind="loading" title={label("正在载入任务…","Loading tasks…")}/>:data&&<>
      {data.tasks.length?<div className="classroom-task-list" aria-busy={loading||loadingMore}>{data.tasks.map(taskCard)}</div>:!loadError&&<MascotNote pose={role==="student"?"sleepy":"ready"} title={label("暂无班级任务","No class tasks yet")} description={role==="student"?label("老师布置任务后会显示在这里。","Tasks will appear here when your teacher assigns them."):label("发布任务后，可在这里查看完成情况。","Publish a task to view completion here.")} className="classroom-task-empty"/>}
      <div className="classroom-task-pagination"><p>{label("已载入","Loaded")} {data.tasks.length} {label("个任务","tasks")}</p>{data.nextCursor&&<Button type="button" variant="outline" disabled={Boolean(busy)||loading||loadingMore} onClick={()=>void loadPage(data.nextCursor,true)}>{loadingMore?label("正在加载…","Loading…"):label("加载更多","Load more")}</Button>}</div>
    </>}
  </section>;
}
