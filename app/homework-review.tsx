"use client";
import {useRef,useState} from "react";
import {MessageSquare} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {groupFetch} from "@/lib/group-client";
import {getLanguage,t} from "@/lib/i18n";
import {readApiJson,showActionToast} from "@/lib/action-feedback";
import {FileLinks,uploadPdf} from "./learning-portal";
import {SubmissionVersion} from "./learning-content-actions";

type Submission={id:string;fileId:string;filename:string;submittedAt:string;late:boolean|number;homeworkRevision:number|null;dueAtSubmission:string|null;authorizedGrantId:string|null};
type Feedback={id:string;submissionId:string;comment:string;fileId:string|null;createdAt:string;teacherName:string};
type Grade={id:string;submissionId:string|null;score:number|null;maxScore:number|null;changedAt:string;reason:string};
type Grant={id:string;baseSubmissionId:string;grantedAt:string;usedAt:string|null;revokedAt:string|null};
type Review={homework:{id:string;title:string;revision:number;classroomId:string|null;maxScore:number|null};studentName:string;currentScore:number|null;grantRevision:number;activeGrantId:string|null;submissions:Submission[];feedback:Feedback[];grades:Grade[];grants:Grant[]};
const date=(iso:string)=>new Date(Date.parse(iso)+8*3600_000).toISOString().slice(0,16).replace("T"," ");
export function HomeworkReview({homeworkId,studentName,editable=false,onChanged,maxBytes=10*1024*1024}:{homeworkId:string;studentName?:string;editable?:boolean;onChanged?:()=>Promise<unknown>|void;maxBytes?:number}) {
  const [open,setOpen]=useState(false),[data,setData]=useState<Review|null>(null),[ready,setReady]=useState(false),[selected,setSelected]=useState(""),[comment,setComment]=useState(""),[file,setFile]=useState<File|null>(null),[uploaded,setUploaded]=useState(""),[fileKey,setFileKey]=useState(0),[working,setWorking]=useState(false),[error,setError]=useState("");
  const loadSequence=useRef(0),inFlight=useRef(false),operation=useRef<{body:string;id:string}|null>(null);
  async function load(){const sequence=++loadSequence.current;setReady(false);setError("");try{const response=await groupFetch(`/api/learning/review?homeworkId=${encodeURIComponent(homeworkId)}${studentName?`&studentName=${encodeURIComponent(studentName)}`:""}&lang=${getLanguage()}`,{cache:"no-store"});const result=await readApiJson<Review & {error?:string}>(response);if(!response.ok)throw new Error(t(result.error||"提交与反馈加载失败，请重试"));if(sequence!==loadSequence.current)return;setData(result);setSelected(id=>result.submissions.some(s=>s.id===id)?id:result.submissions[0]?.id||"");setReady(true);}catch(caught){if(sequence===loadSequence.current)setError(caught instanceof Error?caught.message:t("提交与反馈加载失败，请重试"));}}
  async function act(action:"publishFeedback"|"grantResubmission"|"revokeResubmission") {
    if(inFlight.current||!data)return;inFlight.current=true;setWorking(true);setError("");
    try{
      let fileId=uploaded;if(action==="publishFeedback"&&file&&!fileId){fileId=await uploadPdf(file,"feedback",undefined,maxBytes,data.homework.classroomId||undefined,selected);setUploaded(fileId);}
      const body={action,homeworkId,studentName:data.studentName,submissionId:action==="publishFeedback"?selected:data.submissions[0]?.id,revision:data.homework.revision,grantRevision:data.grantRevision,grantId:data.activeGrantId,comment:action==="publishFeedback"?comment:"",fileId:action==="publishFeedback"?fileId:""};
      const fingerprint=JSON.stringify(body);if(operation.current?.body!==fingerprint)operation.current={body:fingerprint,id:crypto.randomUUID()};
      const response=await groupFetch(`/api/learning/review?lang=${getLanguage()}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,requestId:operation.current.id}),cache:"no-store"});const result=await readApiJson<{error?:string}>(response);if(!response.ok)throw new Error(t(result.error||"反馈操作未能确认，请重新载入检查后重试"));
      if(action==="publishFeedback"){setComment("");setFile(null);setUploaded("");setFileKey(n=>n+1);}operation.current=null;await load();await onChanged?.();showActionToast("success",action==="publishFeedback"?"评语与批改资料已发布":action==="grantResubmission"?"已允许该学生重新提交一次":"已撤销重交权限");
    }catch(caught){setError(caught instanceof Error?caught.message:t("反馈操作未能确认，请重新载入检查后重试"));}
    finally{inFlight.current=false;setWorking(false);}
  }
  const submission=data?.submissions.find(s=>s.id===selected),grades=data?.grades.filter(g=>g.submissionId===selected&&g.score!=null)||[],feedback=data?.feedback.filter(f=>f.submissionId===selected)||[];
  return <><Button size="sm" variant="outline" onClick={()=>{setOpen(true);setSelected("");setComment("");setFile(null);setUploaded("");operation.current=null;void load();}}><MessageSquare size={16}/>{t("提交与反馈")}</Button>
    <Dialog open={open} onOpenChange={value=>{if(!working){setOpen(value);if(!value)loadSequence.current++;}}}><DialogContent className="content-edit-dialog homework-review-dialog" overlayClassName="content-edit-overlay" showCloseButton={!working} onInteractOutside={event=>{if(working||editable)event.preventDefault();}} onEscapeKeyDown={event=>{if(working)event.preventDefault();}}><DialogTitle>{t("提交与反馈")}</DialogTitle><DialogDescription>{data?`${data.homework.title} · ${data.studentName}`:t("查看学生每次提交、成绩及老师反馈。")}</DialogDescription>
      {error&&<div className="notice" role="alert">{error}<Button type="button" variant="outline" disabled={working} onClick={()=>void load()}>{t("重新载入")}</Button></div>}
      {!ready?<p role="status">{error?"":t("正在加载…")}</p>:!data?.submissions.length?<p>{t("学生尚未提交功课")}</p>:<div className="homework-review-body">
        <label>{t("选择提交记录")}<select aria-label={t("选择提交记录")} disabled={working} value={selected} onChange={event=>{setSelected(event.target.value);setComment("");setFile(null);setUploaded("");setFileKey(n=>n+1);operation.current=null;}}>{data.submissions.map((s,index)=><option key={s.id} value={s.id}>{index===0?t("当前提交"):t("历史提交")} · {date(s.submittedAt)}{s.homeworkRevision?` · ${t("版本")} ${s.homeworkRevision}`:""}</option>)}</select></label>
        {submission&&<section className="review-submission"><strong>{selected===data.submissions[0]?.id?t("当前提交"):t("历史提交")}</strong><span>{date(submission.submittedAt)} · {t(submission.late?"迟交":"按时提交")}{submission.authorizedGrantId?` · ${t("授权后重交")}`:""}</span><FileLinks fileId={submission.fileId}/><SubmissionVersion revision={submission.homeworkRevision} dueAt={submission.dueAtSubmission}/>
          {selected===data.submissions[0]?.id&&<strong>{data.currentScore==null?t("当前提交尚未评分"):`${t("当前成绩")} ${data.currentScore}${data.homework.maxScore!=null?` / ${data.homework.maxScore}`:""}`}</strong>}
          {grades.map(g=><small key={g.id}>{t("评分记录")} · {g.score}{g.maxScore!=null?` / ${g.maxScore}`:` · ${t("当时满分未记录")}`} · {date(g.changedAt)}</small>)}
        </section>}
        <section className="review-feedback"><h3>{t("老师评语与批改资料")}</h3>{feedback.length?feedback.map(f=><article className="review-feedback-item" key={f.id}><small>{f.teacherName} · {date(f.createdAt)}</small>{f.comment&&<p>{f.comment}</p>}{f.fileId&&<><strong>{t("批改后的 PDF")}</strong><FileLinks fileId={f.fileId}/></>}</article>):<p className="muted">{t("这次提交暂无老师反馈")}</p>}
          {editable&&<form className="learning-form" onSubmit={event=>{event.preventDefault();void act("publishFeedback");}}><label>{t("老师评语")}<textarea maxLength={4000} value={comment} onChange={event=>setComment(event.target.value)} placeholder={t("指出需要修改的地方或下一步练习。")}/></label>{data.homework.classroomId?<label>{t("批改后的 PDF（可选）")} · {t("最多")} {Math.round(maxBytes/1048576)} MB<input key={fileKey} type="file" accept="application/pdf,.pdf" onChange={event=>{setFile(event.target.files?.[0]||null);setUploaded("");operation.current=null;}}/></label>:<small>{t("请先将旧内容整理到有效班级，再上传批改 PDF。")}</small>}{uploaded&&<small>{t("批改 PDF 已上传，发布反馈后学生才会看到。")}</small>}<Button disabled={working||(!comment.trim()&&!file&&!uploaded)}>{t(working?"正在发布…":"发布反馈")}</Button></form>}
        </section>
        <section className="review-grants"><h3>{t("重新提交权限")}</h3><p>{t(data.activeGrantId?"已授权一次，重新提交后自动失效":"目前没有额外重交权限")}</p>{editable&&<Button variant="outline" disabled={working} onClick={()=>void act(data.activeGrantId?"revokeResubmission":"grantResubmission")}>{t(data.activeGrantId?"撤销重交权限":"允许重新提交一次")}</Button>}{data.grants.length>0&&<details><summary>{t("授权记录")}</summary>{data.grants.map(g=><p key={g.id}>{date(g.grantedAt)} · {t(g.usedAt?"已使用":g.revokedAt?"已撤销":"待使用")}</p>)}</details>}</section>
        {data.grades.some(g=>!g.submissionId)&&<details><summary>{t("早期评分记录（未关联具体提交）")}</summary>{data.grades.filter(g=>!g.submissionId).map(g=><p key={g.id}>{g.score==null?t("等待评分"):g.score} · {date(g.changedAt)}</p>)}</details>}
        <Button type="button" variant="outline" disabled={working} onClick={()=>setOpen(false)}>{t("关闭")}</Button>
      </div>}
    </DialogContent></Dialog>
  </>;
}
