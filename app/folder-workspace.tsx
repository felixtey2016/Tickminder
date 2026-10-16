"use client";
import {usePageHistoryState} from '@/lib/page-history';

import { useAdminAction } from "./admin-permission-context";
import { useCallback,useEffect,useRef,useState,type ReactNode } from "react";
import { ArrowLeft,Folder,FolderPlus,ChevronRight,MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogTitle,DialogDescription } from "@/components/ui/dialog";
import { groupFetch } from "@/lib/group-client";
import { readApiJson,alertActionFailure,showActionToast } from "@/lib/action-feedback";
import { t } from "@/lib/i18n";
import type { LearningState,Material,Homework } from "./learning-portal";

export type FolderClass = {id:string;title?:string;teacherName?:string;subject:string;members?:string[];archived?:number|boolean};
type Node={id:string;parentId:string|null;name:string};
type Preview={name:string;folders:number;materials:number;homework:number;submissions:number;scores:number;versions?:number;scoreHistory?:number;feedback?:number;grants?:number;revision:number;token:string};
type Editor={action:"create"|"rename"|"move"|"delete"|"placeContent";id:string;name?:string;kind?:"material"|"homework"};
async function send(body:Record<string,unknown>) {
  const response=await groupFetch("/api/folders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
  const result=await readApiJson<{error?:string;preview?:Preview;warning?:string}>(response);
  if(!response.ok) throw new Error(t(result.error || "文件夹操作失败，请稍后重试"));
  return result;
}
function pathLabel(nodes:Node[],id:string|null):string {
  const parts:string[]=[]; const seen=new Set<string>(); let cursor=id;
  while(cursor && !seen.has(cursor)) {seen.add(cursor);const n=nodes.find(f=>f.id===cursor);if(!n) break;parts.unshift(n.name);cursor=n.parentId;}
  return [t("班级根目录"),...parts].join(" / ");
}
function descendant(nodes:Node[],candidate:string,id:string):boolean {
  let cursor:string|null=candidate;const seen=new Set<string>();
  while(cursor && !seen.has(cursor)) {if(cursor===id) return true;seen.add(cursor);cursor=nodes.find(f=>f.id===cursor)?.parentId||null;} return false;
}
export function FolderWorkspace({classroom,role,learning,view,onChanged,children}:{classroom:FolderClass;role:"teacher"|"admin"|"student";learning:LearningState;view:"materials"|"homework";onChanged?:()=>Promise<unknown>|void;children:(filtered:LearningState,folderId:string,materials:Material[])=>ReactNode}) {
  const can=useAdminAction();
  const canRead=can("folders.view");
  const [tree,setTree]=useState<Node[]>([]),[revision,setRevision]=useState(0),[ready,setReady]=useState(false),[error,setError]=useState("");
  const [current,setCurrent]=usePageHistoryState("folder.current:"+classroom.id,""),[editor,setEditor]=useState<Editor|null>(null),[name,setName]=useState(""),[target,setTarget]=useState(""),[preview,setPreview]=useState<Preview|null>(null),[working,setWorking]=useState(false),[editError,setEditError]=useState("");
  const latestLoad=useRef(0),[editorRevision,setEditorRevision]=useState(0);
  const canManage=role!=="student" && !classroom.archived;
  const load=useCallback(async()=>{
    if(!canRead)return null;
    const requestId=++latestLoad.current;
    try {
      const response=await groupFetch(`/api/folders?classroomId=${encodeURIComponent(classroom.id)}`,{cache:"no-store"});
      const result=await readApiJson<{folders?:Node[];revision?:number;error?:string}>(response);
      if(!response.ok || !result.folders) throw new Error(t(result.error||"文件夹加载失败，请重试"));
      if(requestId===latestLoad.current) {setTree(result.folders);setRevision(result.revision||0);setReady(true);setError("");setCurrent(id=>id && !result.folders!.some(f=>f.id===id)?"":id);}
      return result;
    } catch(caught) {if(requestId===latestLoad.current)setError(caught instanceof Error?caught.message:t("文件夹加载失败，请重试"));return null;}
  },[classroom.id,canRead]);
  useEffect(()=>{setReady(false);setCurrent("");},[load]);
  const contentStamp=JSON.stringify([learning.materials.map(m=>[m.id,m.folderId]),learning.homework.map(h=>[h.id,h.folderId,h.scores]),learning.submissions.map(s=>s.id)]);
  useEffect(()=>{void load();},[load,contentStamp]);
  useEffect(()=>{const refresh=()=>{if(document.visibilityState==="visible") void load();};const timer=window.setInterval(refresh,20000);window.addEventListener("focus",refresh);return()=>{window.clearInterval(timer);window.removeEventListener("focus",refresh);};},[load]);
  const folders=tree.filter(f=>(f.parentId||"")===current);
  const materials=learning.materials.filter(m=>m.classroomId===classroom.id),homework=learning.homework.filter(h=>h.classroomId===classroom.id);
  const filtered={...learning,materials:materials.filter(m=>(m.folderId||"")===current),homework:homework.filter(h=>(h.folderId||"")===current)};
  const records=view==="materials"?filtered.materials:filtered.homework;
  const crumbs:Node[]=[];let cursor=current;while(cursor){const n=tree.find(f=>f.id===cursor);if(!n || crumbs.some(f=>f.id===n.id)) break;crumbs.unshift(n);cursor=n.parentId||"";}
  async function openEditor(next:Editor) {
    if(working) return;
    setEditor(next);setName(next.name||"");setTarget(next.action==="create"?current:tree.find(f=>f.id===next.id)?.parentId||"");setPreview(null);setEditError("");
    setWorking(true);
    try {if(next.action==="delete") {const result=await send({action:"previewDelete",classroomId:classroom.id,id:next.id});setPreview(result.preview!);} else {const result=await load();if(!result)throw new Error(t("文件夹加载失败，请重试"));setEditorRevision(result.revision||0);}}
    catch(e){setEditError(e instanceof Error?e.message:t("文件夹操作失败，请稍后重试"));} finally {setWorking(false);}
  }
  async function save(event:React.FormEvent) {
    event.preventDefault();if(!editor || working) return;setWorking(true);setEditError("");
    try {
      const result=await send({action:editor.action,classroomId:classroom.id,id:editor.id,name,parentId:target,folderId:target,kind:editor.kind,revision:editor.action==="delete"?preview?.revision:editorRevision,confirmed:editor.action==="delete",token:preview?.token});
      await load();await onChanged?.();setEditor(null);
      showActionToast("success",editor.action==="delete"?"文件夹已删除":"文件夹更改已保存");if(result.warning) showActionToast("error",result.warning);
    } catch(e) {setEditError(e instanceof Error?e.message:t("文件夹操作失败，请稍后重试"));const fresh=await load();if(fresh)setEditorRevision(fresh.revision||0);if(editor.action==="delete")setPreview(null);} finally {setWorking(false);}
  }
  if(!canRead)return <div className="folder-learning-content">{children({...learning,materials,homework},"",materials)}</div>;
  if(!ready) return <section className="panel folder-status" role={error?"alert":"status"}><p>{error||t("正在加载文件夹…")}</p>{error && <Button variant="outline" onClick={()=>void load()}>{t("重试")}</Button>}</section>;
  return <div className="folder-workspace">
    <section className="panel folder-browser learning-content-surface">
      <div className="folder-toolbar"><h3>{t("班级文件夹")}</h3><div className="folder-toolbar-actions learning-action-row">{current && <Button size="sm" variant="outline" onClick={()=>setCurrent(tree.find(f=>f.id===current)?.parentId||"")}><ArrowLeft size={16}/>{t("返回上层")}</Button>}{canManage && <Button adminGrant="folders.create" size="sm" onClick={()=>void openEditor({action:"create",id:""})}><FolderPlus size={16}/>{t("新建文件夹")}</Button>}</div></div>
      <nav className="folder-breadcrumb" aria-label={t("文件夹路径")}><button type="button" onClick={()=>setCurrent("")}>{t("班级根目录")}</button>{crumbs.map(n=><span key={n.id}><ChevronRight size={14}/><button type="button" aria-current={n.id===current?"location":undefined} onClick={()=>setCurrent(n.id)}>{n.name}</button></span>)}</nav>
      {error && <div className="notice teaching-notice-actions" role="alert"><span>{error}</span><Button size="sm" variant="outline" onClick={()=>void load()}>{t("刷新")}</Button></div>}
      {Boolean(classroom.archived) && <p className="muted">{t("班级已封存，文件夹仅供查看")}</p>}
      <div className="folder-grid">{folders.map(n=><div key={n.id} className="folder-entry"><button type="button" className="folder-open" onClick={()=>setCurrent(n.id)}><Folder size={22}/><span>{n.name}</span><ChevronRight size={16}/></button>{canManage && (can("folders.edit")||can("folders.delete")) && <details className="folder-options"><summary aria-label={`${t("文件夹选项")} · ${n.name}`}><MoreHorizontal size={20}/></summary><div>{(["rename","move","delete"] as const).map(action=><Button adminGrant={action==="delete"?"folders.delete":"folders.edit"} key={action} size="sm" variant="outline" onClick={()=>void openEditor({action,id:n.id,name:n.name})}>{t(action==="rename"?"重命名":action==="move"?"移动文件夹":"删除文件夹")}</Button>)}</div></details>}</div>)}</div>
      {!folders.length && !records.length && <p className="muted folder-empty-hint">{t("此位置没有子文件夹")}</p>}
      {canManage && can("folders.placeContent") && records.length>0 && <details className="folder-organize"><summary className="folder-organize-heading"><span>{t("整理本层内容")}</span><span className="learning-record-count">{records.length}</span></summary>{records.map(item=><div className="folder-content-row" key={item.id}><span>{item.title}</span><Button adminGrant="folders.placeContent" size="sm" variant="outline" onClick={()=>void openEditor({action:"placeContent",id:item.id,name:item.title,kind:view==="materials"?"material":"homework"})}>{t("移动到文件夹")}</Button></div>)}</details>}
    </section>
    <div className="folder-learning-content">{children(filtered,current,materials)}</div>
    <Dialog open={Boolean(editor)} onOpenChange={open=>{if(!open && !working)setEditor(null);}}><DialogContent className="folder-dialog"><DialogTitle>{t(editor?.action==="delete"?"删除文件夹":editor?.action==="create"?"新建文件夹":editor?.action==="rename"?"重命名":editor?.action==="placeContent"?"移动到文件夹":"移动文件夹")}</DialogTitle><DialogDescription>{editor?.action==="delete"?t("将永久删除此文件夹及其全部内容。共用 PDF 会保留，此操作无法恢复。"):editor?.name||t("按科目、章节或资料类型命名")}</DialogDescription>
      <form className="learning-form" onSubmit={save}>
        {(editor?.action==="create" || editor?.action==="rename") && <label>{t("文件夹名称")}<input autoFocus required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>}
        {(editor?.action==="move" || editor?.action==="placeContent") && <label>{t("目标文件夹")}<select aria-label={t("目标文件夹")} value={target} onChange={e=>setTarget(e.target.value)}><option value="">{t("班级根目录")}</option>{tree.filter(f=>editor.action!=="move" || !descendant(tree,f.id,editor.id)).map(f=><option key={f.id} value={f.id}>{pathLabel(tree,f.id)}</option>)}</select></label>}
        {editor?.action==="delete" && (preview?<><strong>{preview.name}</strong><dl className="folder-impact">{([["子文件夹",preview.folders],["教学资料",preview.materials],["功课",preview.homework],["学生提交",preview.submissions],["已录入分数",preview.scores],["内容历史版本",preview.versions||0],["历史评分记录",preview.scoreHistory||0],["老师批改反馈",preview.feedback||0],["重交授权记录",preview.grants||0]] as const).map(([label,count])=><div key={label}><dt>{t(label)}</dt><dd>{count}</dd></div>)}</dl></>:!editError?<p role="status">{t("正在读取删除范围…")}</p>:<Button type="button" variant="outline" onClick={()=>void openEditor(editor)}>{t("重新读取删除范围")}</Button>)}
        {editError && <p className="notice" role="alert">{editError}</p>}
        <div className="learning-card-actions"><Button type="button" variant="outline" disabled={working} onClick={()=>setEditor(null)}>{t("取消")}</Button><Button adminGrant={editor?.action==="delete"?"folders.delete":editor?.action==="create"?"folders.create":editor?.action==="placeContent"?"folders.placeContent":"folders.edit"} variant={editor?.action==="delete"?"destructive":"default"} disabled={working || (editor?.action==="delete" && !preview)}>{t(working?"处理中…":editor?.action==="delete"?"确认永久删除":"保存")}</Button></div>
      </form>
    </DialogContent></Dialog>
  </div>;
}

export function useTeachingClasses(enabled=true) {
  const [classes,setClasses]=useState<FolderClass[]>([]),[ready,setReady]=useState(false),[error,setError]=useState("");
  const load=useCallback(async()=>{try {const response=await groupFetch("/api/state?scope=classrooms",{cache:"no-store"});const result=await readApiJson<{classrooms?:FolderClass[];error?:string}>(response);if(!response.ok || !result.classrooms)throw new Error(t(result.error||"班级加载失败，请重试"));setClasses(result.classrooms.filter(c=>!c.archived));setError("");setReady(true);}catch(e){setError(e instanceof Error?e.message:t("班级加载失败，请重试"));}},[]);
  useEffect(()=>{if(enabled)void load();},[load,enabled]);return {classes,ready,error,load};
}
export function LegacyOrganizer({item,kind,classes,onChanged}:{item:Material|Homework;kind:"material"|"homework";classes:FolderClass[];onChanged:()=>Promise<unknown>|void}) {
  const [open,setOpen]=useState(false),[classId,setClassId]=useState(""),[tree,setTree]=useState<Node[]>([]),[revision,setRevision]=useState<number|null>(null),[folderId,setFolderId]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  const subject=kind==="material"?(item as Material).recipients?.[0]?.subject:(item as Homework).subject;
  const recipientNames=kind==="material"?(item as Material).recipients?.map(r=>r.studentName)||[]:(item as Homework).recipients||[];
  const matchingClasses=classes.filter(c=>c.subject===subject && (!item.teacherName || c.teacherName===item.teacherName) && recipientNames.every(student=>c.members?.includes(student)));
  useEffect(()=>{let active=true;setRevision(null);setTree([]);setFolderId("");setError("");if(!open || !classId)return;void(async()=>{try {const response=await groupFetch(`/api/folders?classroomId=${encodeURIComponent(classId)}`,{cache:"no-store"});const result=await readApiJson<{folders?:Node[];revision:number;error?:string}>(response);if(!response.ok || !result.folders)throw new Error(t(result.error||"文件夹加载失败，请重试"));if(active){setTree(result.folders);setRevision(result.revision);}}catch(e){if(active)setError(e instanceof Error?e.message:t("文件夹加载失败，请重试"));}})();return()=>{active=false;};},[open,classId,retry]);
  return <><Button adminGrant="folders.placeContent" size="sm" variant="outline" onClick={()=>{setClassId("");setOpen(true);}}>{t("整理到班级")}</Button><Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="folder-dialog"><DialogTitle>{t("整理到班级")}</DialogTitle><DialogDescription>{t("保留原资料 ID、分配对象、提交记录及分数；目标班级必须覆盖原分配对象。")}</DialogDescription><form className="learning-form" onSubmit={async e=>{e.preventDefault();setBusy(true);try {await send({action:"placeContent",classroomId:classId,folderId,id:item.id,kind,revision});setOpen(false);showActionToast("success","内容已整理到班级");await onChanged();}catch(caught){setError(alertActionFailure(caught));setRevision(null);}finally{setBusy(false);}}}><strong>{item.title}</strong><label>{t("班级")}<select aria-label={t("班级")} required value={classId} onChange={e=>setClassId(e.target.value)}><option value="">{t("请选择有效班级")}</option>{matchingClasses.map(c=><option key={c.id} value={c.id}>{c.title} · {c.subject}</option>)}</select></label>{classId && <label>{t("目标文件夹")}<select aria-label={t("目标文件夹")} value={folderId} disabled={revision===null} onChange={e=>setFolderId(e.target.value)}><option value="">{t("班级根目录")}</option>{tree.map(f=><option key={f.id} value={f.id}>{pathLabel(tree,f.id)}</option>)}</select></label>}{error && <div className="notice teaching-notice-actions" role="alert"><span>{error}</span>{classId && <Button type="button" variant="outline" disabled={busy} onClick={()=>setRetry(x=>x+1)}>{t("刷新")}</Button>}</div>}<div className="learning-card-actions"><Button variant="outline" type="button" disabled={busy} onClick={()=>setOpen(false)}>{t("取消")}</Button><Button adminGrant="folders.placeContent" disabled={busy || revision===null}>{t("确认整理")}</Button></div></form></DialogContent></Dialog></>;
}
