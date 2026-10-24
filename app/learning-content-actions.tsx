"use client";
import { useRef, useState } from "react";
import { History, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { groupFetch } from "@/lib/group-client";
import { readApiJson, showActionToast } from "@/lib/action-feedback";
import { getLanguage, t } from "@/lib/i18n";
import { FileLinks, uploadPdf, type Material } from "./learning-portal";
import {SharedFilePicker} from './shared-file-picker';

type Snapshot={title:string;description:string|null;fileId:string|null;startsAt?:string;dueAt?:string;maxScore?:number|null;subject?:string};
type RecordData=Snapshot & {id:string;revision:number;classroomId:string|null};
type Version={revision:number;fileId:string|null;changedAt:string;actorName:string;reason:string;snapshot:Snapshot};
type Grade={id:string;studentName:string;score:number|null;previousScore:number|null;maxScore:number|null;changedAt:string;actorName:string;reason:string;homeworkRevision:number|null};
type HistoryData={record:RecordData;versions:Version[];scores:Grade[]};
const local=(iso:string)=>new Date(Date.parse(iso)+8*3600_000).toISOString().slice(0,16);
const date=(iso:string)=>local(iso).replace("T"," ");
const labels:Record<string,string>={title:"标题",description:"完成要求与说明",startsAt:"开始日期与时间",dueAt:"截止日期与时间",maxScore:"满分",fileId:"PDF 文件"};
function HistoryRows({data,kind}:{data:HistoryData;kind:"material"|"homework"}) {
  return <div className="content-history">
    <h3>{t("内容版本")}</h3>
    {data.versions.map((version,index)=>{
      const prior=data.versions[index+1]?.snapshot;
      const changed=Object.keys(labels).filter(key=>key in version.snapshot && (!prior || JSON.stringify(version.snapshot[key as keyof Snapshot])!==JSON.stringify(prior[key as keyof Snapshot])));
      return <details key={version.revision} className="content-version"><summary><strong>{t("版本")} {version.revision}{index===0?` · ${t("当前版本")}`:""}</strong><small>{date(version.changedAt)} · {version.actorName}</small><span>{t(version.reason==="baseline"?"现存内容基线":version.reason==="created"?"首次发布":"内容修改")}</span></summary>
        {version.reason==="baseline" && <p className="muted">{t("此前的内容修改未记录版本；此处保留启用版本记录时的内容。")}</p>}
        {changed.map(key=><div className="content-change" key={key}><strong>{t(labels[key])}</strong>{key==="fileId"? version.fileId?<FileLinks fileId={version.fileId}/>:<span>{t("无附件")}</span>:<span>{key==="startsAt"||key==="dueAt"?date(String(version.snapshot[key])):version.snapshot[key as keyof Snapshot] == null || version.snapshot[key as keyof Snapshot]===""?t("未设置"):String(version.snapshot[key as keyof Snapshot])}</span>}</div>)}
        {!changed.length && <p>{t("内容未改变")}</p>}
      </details>;
    })}
    {kind==="homework" && <><h3>{t("评分记录")}</h3>{data.scores.length?data.scores.map(grade=><div className="content-grade" key={grade.id}><strong>{grade.studentName}</strong><span>{grade.score==null?t("重新提交，等待评分"):`${t("得分")} ${grade.score}${grade.maxScore!=null?` / ${grade.maxScore}`:` · ${t("当时满分未记录")}`}`}</span>{grade.previousScore!=null && <small>{t("原得分")} {grade.previousScore}</small>}<small>{date(grade.changedAt)}{grade.score!=null?` · ${grade.actorName}`:""}{grade.homeworkRevision?` · ${t("版本")} ${grade.homeworkRevision}`:""}</small></div>):<p className="muted">{t("暂无评分记录")}</p>}</>}
  </div>;
}
export function ContentActions({kind,id,editable=false,onChanged,maxBytes=10*1024*1024,materials=[]}:{kind:"material"|"homework";id:string;editable?:boolean;onChanged?:()=>Promise<unknown>|void;maxBytes?:number;materials?:Material[]}) {
  const [mode,setMode]=useState<"edit"|"history"|null>(null),[data,setData]=useState<HistoryData|null>(null),[ready,setReady]=useState(false),[error,setError]=useState(""),[working,setWorking]=useState(false),[conflict,setConflict]=useState(false),[latestVisible,setLatestVisible]=useState(false);
  const [draft,setDraft]=useState<RecordData|null>(null),[scoreEnabled,setScoreEnabled]=useState(false),[maxScore,setMaxScore]=useState(""),[attachment,setAttachment]=useState("keep"),[file,setFile]=useState<File|null>(null),[uploaded,setUploaded]=useState(""),[materialId,setMaterialId]=useState("");
  const [notifyStudents,setNotifyStudents]=useState(true);
  const [resourceId,setResourceId]=useState('');
  const sequence=useRef(0),inFlight=useRef(false),saveOperation=useRef<{body:string;id:string}|null>(null);
  function fill(record:RecordData){setDraft({...record,startsAt:record.startsAt?local(record.startsAt):undefined,dueAt:record.dueAt?local(record.dueAt):undefined});setScoreEnabled(record.maxScore!=null);setMaxScore(record.maxScore==null?"":String(record.maxScore));setAttachment("keep");setFile(null);setUploaded("");setMaterialId("");setResourceId("");setConflict(false);setNotifyStudents(true);saveOperation.current=null;}
  async function load(nextMode:"edit"|"history",retainDraft=false){
    const requestId=++sequence.current;setMode(nextMode);setReady(false);setError("");
    try{
      const response=await groupFetch(`/api/learning/versions?kind=${kind}&id=${encodeURIComponent(id)}&lang=${getLanguage()}`,{cache:"no-store"});const result=await readApiJson<HistoryData & {error?:string}>(response);
      if(!response.ok)throw new Error(t(result.error||"内容加载失败，请重试"));
      if(sequence.current!==requestId)return;setData(result);if(!retainDraft)fill(result.record);setReady(true);
    }catch(caught){if(sequence.current===requestId)setError(caught instanceof Error?caught.message:t("内容加载失败，请重试"));}
  }
  async function save(event:React.FormEvent){
    event.preventDefault();if(inFlight.current||!draft)return;inFlight.current=true;setWorking(true);setError("");setConflict(false);
    try{
      let fileId="";if(attachment==="upload"){if(!file && !uploaded)throw new Error(t("请选择 PDF 文件"));fileId=uploaded||await uploadPdf(file!,kind,undefined,maxBytes,draft.classroomId||undefined);setUploaded(fileId);}
      if(attachment==="material"&&!materialId)throw new Error(t("请选择教学资料"));
      if(attachment==='resource'&&!resourceId)throw new Error(t('请选择集团共享 PDF'));
      const body={...draft,kind,scoreEnabled,maxScore,fileId,resourceId:attachment==='resource'?resourceId:'',materialId:attachment==="material"?materialId:"",removeAttachment:attachment==="remove",notifyStudents};
      const fingerprint=JSON.stringify(body);if(saveOperation.current?.body!==fingerprint)saveOperation.current={body:fingerprint,id:crypto.randomUUID()};
      const response=await groupFetch(`/api/learning/versions?lang=${getLanguage()}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,requestId:saveOperation.current.id}),cache:"no-store"});
      const result=await readApiJson<{error?:string}>(response);if(!response.ok){setConflict(response.status===409);throw new Error(t(result.error||"内容操作失败，请稍后重试"));}
      await onChanged?.();showActionToast("success","修改已保存");setMode(null);
    }catch(caught){setError(caught instanceof Error?caught.message:t("内容操作失败，请稍后重试"));}
    finally{inFlight.current=false;setWorking(false);}
  }
  const available=materials.filter(item=>item.classroomId===draft?.classroomId);
  return <><span className="content-actions">{editable && <Button size="sm" variant="outline" onClick={()=>{setLatestVisible(false);void load("edit");}}><Pencil size={16}/>{t(kind==="homework"?"编辑功课":"编辑资料")}</Button>}<Button size="sm" variant="outline" onClick={()=>void load("history")}><History size={16}/>{t("版本与记录")}</Button></span>
    <Dialog open={mode!==null} onOpenChange={open=>{if(!open&&!working){sequence.current++;setMode(null);}}}><DialogContent className="content-edit-dialog" overlayClassName="content-edit-overlay" showCloseButton={!working} onEscapeKeyDown={event=>{if(working)event.preventDefault();}} onInteractOutside={event=>{if(working || mode==="edit")event.preventDefault();}}><DialogTitle>{t(mode==="edit"?kind==="homework"?"编辑功课":"编辑教学资料":"版本与记录")}</DialogTitle><DialogDescription>{t(mode==="edit"?"修改内容会保留原分配对象、提交及评分记录。":"查看已发布内容的版本及修改记录。")}</DialogDescription>
      {error && <div className="notice" role="alert">{error}{conflict && <div className="content-actions"><Button variant="outline" disabled={working} onClick={()=>{setLatestVisible(true);void load("edit",true);}}>{t("查看最新版本")}</Button><Button variant="outline" disabled={working} onClick={()=>{if(window.confirm(t("重新载入会替换尚未保存的输入，确定继续？")))void load("edit");}}>{t("重新载入最新内容")}</Button></div>}</div>}
      {!ready?<div role="status">{error?<Button variant="outline" onClick={()=>void load(mode||"history",mode==="edit"&&Boolean(draft))}>{t("重试")}</Button>:t("正在加载…")}</div>:mode==="history"&&data?<HistoryRows data={data} kind={kind}/>:draft&&<form className="learning-form" onSubmit={save}>
        <label>{t(kind==="homework"?"功课标题":"资料标题")}<input required maxLength={120} value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})}/></label>
        <label>{t(kind==="homework"?"完成要求（可选）":"说明（可选）")}<textarea maxLength={kind==="homework"?4000:2000} value={draft.description||""} onChange={event=>setDraft({...draft,description:event.target.value})}/></label>
        {kind==="homework"&&<><div className="form-pair"><label>{t("开始日期与时间")}<input type="datetime-local" aria-label={t("开始日期与时间")} required value={draft.startsAt||""} onChange={event=>setDraft({...draft,startsAt:event.target.value})}/><small>{draft.startsAt?.replace("T"," ")}</small></label><label>{t("截止日期与时间")}<input type="datetime-local" aria-label={t("截止日期与时间")} required min={draft.startsAt} value={draft.dueAt||""} onChange={event=>setDraft({...draft,dueAt:event.target.value})}/><small>{draft.dueAt?.replace("T"," ")}</small></label></div><small>{t("马来西亚时间（GMT+8）")}</small><p className="muted">{t("已有提交保留当时的迟交判断；新提交按新的截止日期判断。")}</p><label className="learning-score-toggle"><input type="checkbox" checked={scoreEnabled} onChange={event=>setScoreEnabled(event.target.checked)}/>{t("记录分数（适用于历年试题等）")}</label>{scoreEnabled&&<label>{t("满分")}<input type="number" required min="0.01" max="10000" step="0.01" value={maxScore} onChange={event=>setMaxScore(event.target.value)}/></label>}</>}
        <label>{t("PDF 文件")}<select value={attachment} onChange={event=>{setAttachment(event.target.value);setFile(null);setUploaded("");}}><option value="keep">{t("保留当前附件")}</option>{draft.classroomId&&<><option value="upload">{t("上传新 PDF 替换")}</option><option value="resource">{t("使用集团共享 PDF")}</option></>}{kind==="homework"&&draft.classroomId&&available.length>0&&<option value="material">{t("使用已有教学资料")}</option>}{kind==="homework"&&draft.fileId&&<option value="remove">{t("移除当前附件（保留历史文件）")}</option>}</select></label>
        {attachment==="upload"&&<label>{t("新的 PDF")} · {t("最多")} {Math.round(maxBytes/1048576)} MB<input type="file" required={!uploaded} accept="application/pdf,.pdf" onChange={event=>{setFile(event.target.files?.[0]||null);setUploaded("");}}/></label>}
        {attachment==="resource"&&<SharedFilePicker value={resourceId} onChange={setResourceId} disabled={working}/>}
        {attachment==="material"&&<label>{t("教学资料")}<select required value={materialId} onChange={event=>setMaterialId(event.target.value)}><option value="">{t("请选择")}</option>{available.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
        {attachment==="keep"&&draft.fileId&&<FileLinks fileId={draft.fileId}/>}{!draft.classroomId&&<small>{t("请先将旧内容整理到有效班级，再替换 PDF")}</small>}
        {uploaded&&<small>{t("新 PDF 已上传，保存修改后才会替换当前附件。")}</small>}
        <label className="learning-score-toggle"><input type="checkbox" checked={notifyStudents} onChange={event=>setNotifyStudents(event.target.checked)}/>{t("通知已分配且仍有访问权限的学生")}</label><div className="content-actions"><Button disabled={working}>{t(working?"正在保存…":"保存修改")}</Button><Button type="button" variant="outline" disabled={working} onClick={()=>setMode(null)}>{t("取消")}</Button></div>
        {latestVisible&&data&&<HistoryRows data={data} kind={kind}/ >}
      </form>}
    </DialogContent></Dialog>
  </>;
}
export function SubmissionVersion({revision,dueAt}:{revision?:number|null;dueAt?:string|null}) {
  return <small className="submission-version">{revision?`${t("提交时版本")} ${revision}${dueAt?` · ${t("当时截止")} ${date(dueAt)}`:""}`:t("旧提交：当时版本及截止日期未记录")}</small>;
}
