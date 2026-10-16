"use client";
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {groupFetch} from '@/lib/group-client';
import {readApiJson,showActionToast} from '@/lib/action-feedback';
import {getLanguage,t} from '@/lib/i18n';
import {formatDurationSeconds} from '@/lib/duration-format';
import type {BillingLine,BillingPreview,BillingSummary} from '@/lib/billing';
import {billingModeLabel,billingMoney} from './billing-rate-editor';

const warningLabels:Record<string,string>={missing_policy:'尚未确认计费规则',missing_rate:'未设置该日期的费率',subject_unmatched:'课程科目尚未对应收费设置',attendance_unreviewed:'考勤尚未复核',attendance_pending:'考勤尚未登记',teaching_incomplete:'授课情况尚未确认',invalid_attendance_duration:'实际授课时长需要核对',charge_decision_pending:'本课是否收费尚未确认',replacement_pending:'原课或补课尚未完成复核',replacement_charge_conflict:'原课与补课收费需要核对',monthly_attendance_pending:'本月尚有考勤或收费决定待核对',monthly_partial_review:'月中加入、暂停或退课，请确认整月费用或调整金额',monthly_enrolment_unconfirmed:'本月在读期间需要人工确认',included_in_monthly:'已包含在固定月费',adjustment_stale:'计费依据已改变，请重新核对调整金额',adjustment_requires_review:'调整金额需要重新核对'};
const attendanceLabels:Record<string,string>={present:'出席',late:'迟到',early_leave:'早退',late_early:'迟到并早退',late_early_leave:'迟到并早退',absent:'学生缺席',student_absent:'学生缺席',teacher_absent:'老师缺席',pending:'未登记',scheduled:'未登记',cancelled:'已取消',completed:'已上课',monthly:'固定月费'};
warningLabels.monthly_exception_review='本月有老师缺席或已确认免收费的课次，请核对固定月费金额';
const warningText=(code:string)=>t(warningLabels[code]||'此项计费依据需要核对');
function today(){return new Date(Date.now()+8*3600000).toISOString().slice(0,10);}
function displayDate(value:string){return new Intl.DateTimeFormat(getLanguage()==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
type Operation={signature:string;id:string}|null;
function requestBody(value:Record<string,unknown>,pending:{current:Operation}){const signature=JSON.stringify(value);if(pending.current?.signature!==signature)pending.current={signature,id:crypto.randomUUID()};return {...value,operationId:pending.current.id};}
async function post(value:Record<string,unknown>){const response=await groupFetch('/api/billing',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});const result=await readApiJson<{error?:string}>(response);if(!response.ok)throw Error(t(result.error||'收费资料未能保存'));return result;}
function FeeSummary({summary}:{summary:BillingSummary}){const total=summary.estimatedSubtotalCents??summary.subtotalCents;return <><strong>{t('当前预计费用')} · {total===0&&summary.pendingCount>0?t('待核对'):billingMoney(total)}</strong>{summary.pendingCount>0&&total>0&&<small>{t('其中已核算')} · {billingMoney(summary.subtotalCents)}</small>}</>;}

function Adjustment({line,month,onChanged}:{line:BillingLine;month:string;onChanged:()=>void}){
 const [open,setOpen]=useState(false),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const pending=useRef<Operation>(null);
 async function save(clear=false){if(busy||!reason.trim())return;setBusy(true);setError('');try{await post(requestBody({action:clear?'clearAdjustment':'saveAdjustment',month,studentId:line.studentId,lineId:line.id,expectedBasis:line.basisHash,revision:line.adjustmentRevision||0,...(!clear?{amount}:{}),reason:reason.trim()},pending));pending.current=null;showActionToast('success',clear?'已恢复系统计算并保留调整记录':'费用调整已保存');setOpen(false);setReason('');onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!line.basisHash)return null;
 return <div className="billing-adjustment-controls"><Button type="button" size="sm" variant="outline" onClick={()=>{setOpen(x=>!x);setAmount(((line.amountCents??line.estimatedAmountCents??line.unitAmountCents??0)/100).toFixed(2));setReason('');setError('');}}>{t(open?'收起调整':'调整金额')}</Button>
  {open&&<form className="billing-adjustment" onSubmit={event=>{event.preventDefault();void save();}}>
   <p className="muted">{t('调整会保留原金额与原因。考勤、费率或计费规则改变后，需要重新核对。')}</p>
   <label>{t('调整后金额')} · MYR<input type="text" inputMode="decimal" required maxLength={11} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
   <label>{t('调整原因')}<textarea required maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   {error&&<div role="alert" className="billing-error"><p className="error">{error}</p><Button type="button" variant="outline" disabled={busy} onClick={onChanged}>{t('重新载入')}</Button></div>}
   <div className="billing-actions"><Button disabled={busy||!reason.trim()}>{t(busy?'正在保存…':'保存调整')}</Button>{line.adjustment&&<Button type="button" variant="outline" disabled={busy||!reason.trim()} onClick={()=>void save(true)}>{t('恢复系统计算')}</Button>}<Button type="button" variant="outline" disabled={busy} onClick={()=>setOpen(false)}>{t('取消')}</Button></div>
  </form>}
 </div>;
}
function FeeLine({line,month,onChanged}:{line:BillingLine;month:string;onChanged:()=>void}){
 const status=line.status==='pending'?'待核对':line.status==='exempt'?'免另收费':'已核算';
 return <article className="billing-line"><div className="billing-line-body">
  <span className={'billing-status billing-status-'+line.status}>{t(status)}</span><strong>{line.subject} · {line.date}</strong>
  <div className="billing-line-meta">{line.teacherName&&<span>{line.teacherName}</span>}{line.classroomTitle&&<span>{line.classroomTitle}</span>}<span>{t(attendanceLabels[line.attendanceStatus]||'待核对')}</span></div>
  {line.mode&&<div className="billing-line-meta"><span>{t(billingModeLabel[line.mode])} · {billingMoney(line.unitAmountCents)}</span>{line.mode==='hour'&&<><span>{t(line.durationBasis==='early_leave'?'早退后的时长':line.durationBasis==='personal'?'记录出席时长':'课程预设时长')} · {formatDurationSeconds(line.durationSeconds,getLanguage())}</span><span>{t('计费时长')} · {formatDurationSeconds(line.billableSeconds,getLanguage())}</span></>}{line.mode==='lesson'&&line.quantity>0&&<span>{t('计费堂数')} · {line.quantity}</span>}</div>}
  {line.warnings.length>0&&<ul className="billing-warning-list">{line.warnings.map(code=><li key={code}>{warningText(code)}</li>)}</ul>}
  {line.adjustment&&<div className="billing-adjustment-history"><p>{t('系统原金额')} · {billingMoney(line.originalAmountCents)}<br/>{t('最近调整')} · {line.adjustment.reason}</p><small>{displayDate(line.adjustment.createdAt)}</small></div>}
  {Boolean(line.adjustmentHistory?.length)&&<details className="billing-source"><summary>{t('调整记录（最近20条）')}</summary><ol className="billing-history">{line.adjustmentHistory!.map(item=><li key={item.id}><strong>{item.amountCents==null?t('恢复系统计算'):billingMoney(item.amountCents)}</strong><span>{item.reason}</span><small>{displayDate(item.createdAt)}</small></li>)}</ol></details>}
  <details className="billing-source"><summary>{t('核算依据')}</summary><div className="billing-line-meta">{line.lessonId&&<span>{t('课程记录')} · {line.lessonId}</span>}{line.sessionId&&<span>{t('课次记录')} · {line.sessionId}</span>}{line.rateVersionId&&<span>{t('费率版本')} · {line.rateVersionId}</span>}{line.policyVersionId&&<span>{t('计费规则版本')} · {line.policyVersionId}</span>}{line.reviewedAt&&<span>{t('考勤复核日期')} · {displayDate(line.reviewedAt)}</span>}</div></details>
 </div><div className="billing-line-amount">{line.amountCents==null&&line.estimatedAmountCents!=null&&<small>{t('预计费用')}</small>}<strong>{billingMoney(line.amountCents??line.estimatedAmountCents)}</strong><Adjustment key={line.id+':'+line.basisHash+':'+line.adjustmentRevision} line={line} month={month} onChanged={onChanged}/></div></article>;
}

export default function BillingWorkspace({students,onCourses}:{students:string[];onCourses:()=>void}){
 const [month,setMonth]=useState(today().slice(0,7)),[student,setStudent]=useState(''),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
 const [preview,setPreview]=useState<BillingPreview|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [studentId,setStudentId]=useState(''),[detail,setDetail]=useState<BillingPreview['detail']>(),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState('');
 const [policyDate,setPolicyDate]=useState(today().slice(0,7)+'-01'),[policyBusy,setPolicyBusy]=useState(false),[policyError,setPolicyError]=useState('');
 const detailSection=useRef<HTMLElement>(null),policyOperation=useRef<Operation>(null),previewKey=useRef(''),detailKey=useRef('');
 useEffect(()=>{let last=0;const refresh=()=>{if(document.visibilityState!=='visible'||policyBusy||document.querySelector('.billing-adjustment')||Date.now()-last<5000)return;last=Date.now();setRevision(x=>x+1);};const visible=()=>{if(document.visibilityState==='visible')refresh();};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visible);const timer=window.setInterval(refresh,60000);return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);window.clearInterval(timer);};},[policyBusy]);
 useEffect(()=>{if(studentId){detailSection.current?.scrollIntoView({behavior:'smooth',block:'start'});detailSection.current?.focus({preventScroll:true});}},[studentId]);
 useEffect(()=>{const controller=new AbortController(),key=JSON.stringify([month,student,page]),changed=previewKey.current!==key;previewKey.current=key;if(changed){setLoading(true);setPreview(null);}setError('');void(async()=>{try{const response=await groupFetch('/api/billing?'+new URLSearchParams({view:'preview',month,page:String(page),pageSize:'20',...(student?{student}:{}),}),{cache:'no-store',signal:controller.signal});const data=await readApiJson<BillingPreview&{error?:string}>(response);if(!response.ok)throw Error(t(data.error||'费用预览暂时无法载入'));if(!controller.signal.aborted){setPreview(data);if(data.pages>0&&page>data.pages)setPage(data.pages);}}catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted)setLoading(false);}})();return()=>controller.abort();},[month,student,page,revision]);
 useEffect(()=>{const controller=new AbortController(),key=JSON.stringify([month,studentId]),changed=detailKey.current!==key;detailKey.current=key;if(changed)setDetail(undefined);setDetailError('');if(!studentId){setDetailLoading(false);return;}if(changed)setDetailLoading(true);void(async()=>{try{const response=await groupFetch('/api/billing?'+new URLSearchParams({view:'preview',month,studentId}),{cache:'no-store',signal:controller.signal});const data=await readApiJson<BillingPreview&{error?:string}>(response);if(!response.ok)throw Error(t(data.error||'费用明细暂时无法载入'));if(!controller.signal.aborted&&(changed||!document.querySelector('.billing-adjustment')))setDetail(data.detail);}catch(e){if(!controller.signal.aborted)setDetailError((e as Error).message);}finally{if(!controller.signal.aborted)setDetailLoading(false);}})();return()=>controller.abort();},[studentId,month,revision]);
 async function savePolicy(event:React.FormEvent){event.preventDefault();if(!preview||policyBusy)return;setPolicyBusy(true);setPolicyError('');try{await post(requestBody({action:'savePolicy',revision:preview.policyRevision,currency:'MYR',hourRounding:'minute',attendanceBasis:'teaching',monthlyPartial:'manual',effectiveFrom:policyDate},policyOperation));policyOperation.current=null;showActionToast('success','计费规则已确认');setRevision(x=>x+1);}catch(e){setPolicyError((e as Error).message);}finally{setPolicyBusy(false);}}
 const changed=()=>setRevision(x=>x+1);
 return <div className="billing-workspace">
  <section className="panel"><div className="section-head"><h2>{t('学费预览')}</h2><Button variant="outline" onClick={onCourses}>{t('设置学生收费')}</Button></div><p>{t('普通打卡按该堂课的预设时长累计预计费用；明确标记早退时才调整时长。开单前可再核对。')}</p><p className="billing-pilot-note">{t('收费设置仅对平台最高管理员开放。')}</p>
   <div className="billing-filters"><label>{t('核算月份')}<input aria-label={t('核算月份')} type="month" required value={month} onChange={e=>{if(/^20\d\d-\d\d$/.test(e.target.value)){setMonth(e.target.value);setPage(1);setStudentId('');setPolicyDate(e.target.value+'-01');}}}/></label><label>{t('学生')}<select value={student} onChange={e=>{setStudent(e.target.value);setPage(1);setStudentId('');}}><option value="">{t('全部学生')}</option>{[...new Set(students)].sort().map(name=><option key={name}>{name}</option>)}</select></label></div><p className="muted">{t('按实际授课开始日期归属月份；未登记课程按计划日期显示提醒。')}</p>
  </section>
  <section className="panel billing-policy"><h3>{t('计费规则')}</h3><p>{t('马币 MYR；普通打卡及迟到按课程预设时长计费；明确标记早退时按记录的离开时间调整。时长按整分钟核算，每条费用四舍五入到分。')}</p><p>{t('缺席按已复核的收费决定处理；月中加入、暂停或退课列为待核对，由管理员确认整月收费或调整金额。')}</p>
   {preview?.policy?<p className="muted">{t('已确认')} · {t('生效日期')} {preview.policy.effectiveFrom} · {t('版本')} {preview.policy.revision}</p>:preview&&preview.policyRevision>0?<p className="notice">{t('已设置将来生效的计费规则；生效前的课程仍需核对。')}</p>:preview&&<form className="billing-form" onSubmit={savePolicy}><label>{t('规则生效日期')}<input type="date" required value={policyDate} onChange={e=>setPolicyDate(e.target.value)}/></label>{policyError&&<p role="alert" className="error">{policyError}</p>}<div className="billing-actions"><Button disabled={policyBusy}>{t(policyBusy?'正在保存…':'确认以上计费规则')}</Button></div></form>}
  </section>
  <section className="panel" aria-busy={loading}><div className="section-head"><h3>{t('学生费用')}</h3><Button variant="outline" disabled={loading} onClick={changed}>{t('刷新')}</Button></div>
   {loading?<p role="status">{t('正在核算费用…')}</p>:error?<div className="billing-error" role="alert"><p>{error}</p><Button variant="outline" onClick={changed}>{t('重试')}</Button></div>:preview&&<>
    {preview.warnings.length>0&&<ul className="billing-warning-list">{preview.warnings.map(code=><li key={code}>{warningText(code)}</li>)}</ul>}
    <p className="muted">{t('已打卡的普通课程可先查看预计费用。待复核项目保留提醒；缺少费率等依据时显示待核对，不代表零收费。')}</p><p className="muted">{t('页面可随时查看累计费用，返回页面或停留时会自动更新，无需等到月尾。')}</p>
    <div className="billing-students">{preview.items.map(item=><article className="billing-student-row" key={item.studentId}><div><strong>{item.student}</strong><FeeSummary summary={item}/><small>{t('待核对')} · {item.pendingCount} · {t('费用明细')} · {item.lineCount}</small></div><div className="billing-actions"><Button variant="outline" onClick={()=>setStudentId(item.studentId)}>{t('查看费用明细')}</Button></div></article>)}</div>
    {!preview.items.length&&<p className="empty">{t('没有符合条件的学生')}</p>}
    {preview.pages>1&&<div className="billing-pagination"><Button variant="outline" disabled={page<=1} onClick={()=>{setPage(x=>x-1);setStudentId('');}}>{t('上一页')}</Button><span>{page} / {preview.pages}</span><Button variant="outline" disabled={page>=preview.pages} onClick={()=>{setPage(x=>x+1);setStudentId('');}}>{t('下一页')}</Button></div>}
   </>}
  </section>
  {studentId&&<section ref={detailSection} tabIndex={-1} className="panel billing-detail-panel" aria-label={t('费用明细')} aria-busy={detailLoading}><div className="billing-detail-heading"><div><h3>{detail?.student||t('费用明细')}</h3><span>{month}</span>{detail&&<FeeSummary summary={detail}/>}</div><Button variant="outline" onClick={()=>setStudentId('')}>{t('收起明细')}</Button></div>{detailLoading?<p role="status">{t('正在加载费用明细…')}</p>:detailError?<div className="billing-error" role="alert"><p>{detailError}</p><Button variant="outline" onClick={changed}>{t('重试')}</Button></div>:detail&&<>{detail.lines.map(line=><FeeLine key={line.id} line={line} month={month} onChanged={changed}/>)}{!detail.lines.length&&<p className="empty">{t('本月暂无费用明细')}</p>}</>}</section>}
 </div>;
}
