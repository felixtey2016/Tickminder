"use client";
import {DateInput} from '@/components/date-time-input';
import {MonthInput} from '@/components/month-input';
import {usePageHistoryState} from '@/lib/page-history';

import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {groupFetch} from '@/lib/group-client';
import {readApiJson,showActionToast} from '@/lib/action-feedback';
import {getLanguage,t} from '@/lib/i18n';
import {formatDurationSeconds} from '@/lib/duration-format';
import type {BillingLine,BillingPreview,BillingSummary} from '@/lib/billing';
import {billingModeLabel,billingMoney} from './billing-rate-editor';
import {FinanceHelp,financeLabel} from './finance-layout-tools';
import {financeGet,financeMonth,FinanceModal,FinancePagination} from './finance-round2-shared';
import StudentTuitionCard,{type TuitionStudent} from './student-tuition-card';
import StudentAdvanceDialog,{type StudentAdvancePermissions} from './student-advance-dialog';
import StudentTuitionRates from './student-tuition-rates';
import StudentStatementsWorkspace from './student-statements-workspace';
import './student-tuition.css';

const warningLabels:Record<string,string>={missing_policy:'尚未确认计费规则',missing_rate:'未设置该日期的费率',subject_unmatched:'课程科目尚未对应收费设置',attendance_unreviewed:'考勤尚未复核',attendance_pending:'考勤尚未登记',teaching_incomplete:'授课情况尚未确认',invalid_attendance_duration:'实际授课时长需要核对',charge_decision_pending:'本课是否收费尚未确认',replacement_pending:'原课或补课尚未完成复核',replacement_charge_conflict:'原课与补课收费需要核对',monthly_attendance_pending:'本月尚有考勤或收费决定待核对',monthly_partial_review:'月中加入、暂停或退课，请确认整月费用或调整金额',monthly_enrolment_unconfirmed:'本月在读期间需要人工确认',included_in_monthly:'已包含在固定月费',adjustment_stale:'计费依据已改变，请重新核对调整金额',adjustment_requires_review:'调整金额需要重新核对'};
const attendanceLabels:Record<string,string>={present:'出席',late:'迟到',early_leave:'早退',late_early:'迟到并早退',late_early_leave:'迟到并早退',absent:'学生缺席',student_absent:'学生缺席',teacher_absent:'老师缺席',pending:'未登记',scheduled:'未登记',cancelled:'已取消',completed:'已上课',monthly:'固定月费'};
warningLabels.monthly_exception_review='本月有老师缺席或已确认免收费的课次，请核对固定月费金额';
const warningText=(code:string)=>t(warningLabels[code]||'此项计费依据需要核对');
function today(){return new Date(Date.now()+8*3600000).toISOString().slice(0,10);}
function displayDate(value:string){return new Intl.DateTimeFormat(getLanguage()==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
type Operation={signature:string;id:string}|null;
function requestBody(value:Record<string,unknown>,pending:{current:Operation}){const signature=JSON.stringify(value);if(pending.current?.signature!==signature)pending.current={signature,id:crypto.randomUUID()};return {...value,operationId:pending.current.id};}
async function post(value:Record<string,unknown>){const response=await groupFetch('/api/billing',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});const result=await readApiJson<{error?:string}>(response);if(!response.ok)throw Error(t(result.error||'收费资料未能保存'));return result;}
function FeeSummary({summary,compact=false}:{summary:BillingSummary;compact?:boolean}){const total=summary.estimatedSubtotalCents??summary.subtotalCents;return <><strong>{!compact&&<span>{t('当前预计费用')} · </span>}{total===0&&summary.pendingCount>0?t('待核对'):billingMoney(total)}</strong>{summary.pendingCount>0&&total>0&&<small>{t('其中已核算')} · {billingMoney(summary.subtotalCents)}</small>}</>;}

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
function FeeLine({line,month,onChanged,canManageFees}:{line:BillingLine;month:string;onChanged:()=>void;canManageFees:boolean}){
 const status=line.status==='pending'?'待核对':line.status==='exempt'?'免另收费':'已核算';
 return <article className="billing-line"><div className="billing-line-body">
  <span className={'billing-status billing-status-'+line.status}>{t(status)}</span><strong>{line.subject} · {line.date}</strong>
  <div className="billing-line-meta">{line.teacherName&&<span>{line.teacherName}</span>}{line.classroomTitle&&<span>{line.classroomTitle}</span>}<span>{t(attendanceLabels[line.attendanceStatus]||'待核对')}</span></div>
  {line.mode&&<div className="billing-line-meta"><span>{t(billingModeLabel[line.mode])} · {billingMoney(line.unitAmountCents)}</span>{line.mode==='hour'&&<><span>{t(line.durationBasis==='early_leave'?'早退后的时长':line.durationBasis==='personal'?'记录出席时长':'课程预设时长')} · {formatDurationSeconds(line.durationSeconds,getLanguage())}</span><span>{t('计费时长')} · {formatDurationSeconds(line.billableSeconds,getLanguage())}</span></>}{line.mode==='lesson'&&line.quantity>0&&<span>{t('计费堂数')} · {line.quantity}</span>}</div>}
  {line.warnings.length>0&&<ul className="billing-warning-list">{line.warnings.map(code=><li key={code}>{warningText(code)}</li>)}</ul>}
  {line.adjustment&&<div className="billing-adjustment-history"><p>{t('系统原金额')} · {billingMoney(line.originalAmountCents)}<br/>{t('最近调整')} · {line.adjustment.reason}</p><small>{displayDate(line.adjustment.createdAt)}</small></div>}
  {Boolean(line.adjustmentHistory?.length)&&<details className="billing-source"><summary>{t('调整记录（最近20条）')}</summary><ol className="billing-history">{line.adjustmentHistory!.map(item=><li key={item.id}><strong>{item.amountCents==null?t('恢复系统计算'):billingMoney(item.amountCents)}</strong><span>{item.reason}</span><small>{displayDate(item.createdAt)}</small></li>)}</ol></details>}
  <details className="billing-source"><summary>{t('核算依据')}</summary><div className="billing-line-meta">{line.lessonId&&<span>{t('课程记录')} · {line.lessonId}</span>}{line.sessionId&&<span>{t('课次记录')} · {line.sessionId}</span>}{line.rateVersionId&&<span>{t('费率版本')} · {line.rateVersionId}</span>}{line.policyVersionId&&<span>{t('计费规则版本')} · {line.policyVersionId}</span>}{line.reviewedAt&&<span>{t('考勤复核日期')} · {displayDate(line.reviewedAt)}</span>}</div></details>
 </div><div className="billing-line-amount">{line.amountCents==null&&line.estimatedAmountCents!=null&&<small>{t('预计费用')}</small>}<strong>{billingMoney(line.amountCents??line.estimatedAmountCents)}</strong>{canManageFees&&<Adjustment key={line.id+':'+line.basisHash+':'+line.adjustmentRevision} line={line} month={month} onChanged={onChanged}/>}</div></article>;
}

export default function BillingWorkspace({scopeKey,onCourses,canManageFees=false,onInvoice,canAccounts=false,canCreateInvoice=false,prepaymentPermissions={view:false,manage:false,record:false}}:{scopeKey:string;onCourses:()=>void;canManageFees?:boolean;canAccounts?:boolean;canCreateInvoice?:boolean;prepaymentPermissions?:StudentAdvancePermissions;onInvoice?:(studentId:string,month:string,studentName?:string,action?:'create'|'list',billingScope?:'monthly'|'hourly')=>void}){
 const [month,setMonth]=usePageHistoryState('billing.month',today().slice(0,7)),[query,setQuery]=usePageHistoryState('billing.search',''),[search,setSearch]=useState(query.trim()),[page,setPage]=useState(1),[revision,setRevision]=useState(0),[tick,setTick]=useState(0),[studentId,setStudentId]=usePageHistoryState('billing.student','');
 const [result,setResult]=useState<{key:string;value:BillingPreview}|null>(null),[error,setError]=useState(''),[detail,setDetail]=useState<BillingPreview['detail']>(),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState('');
 const [advance,setAdvance]=useState<TuitionStudent|null>(null),[rateStudent,setRateStudent]=useState<TuitionStudent|null>(null),[historyStudent,setHistoryStudent]=useState<TuitionStudent|null>(null);
 const [policyDate,setPolicyDate]=useState(month+'-01'),[policyBusy,setPolicyBusy]=useState(false),[policyError,setPolicyError]=useState('');const policyOperation=useRef<Operation>(null);
 const key=JSON.stringify([scopeKey,month,search,page,revision]),preview=result?.key===key?result.value:null,loading=!preview&&!error;
 useEffect(()=>{if(query.trim()===search)return;const timer=setTimeout(()=>{setSearch(query.trim());setPage(1);setStudentId('');},250);return()=>clearTimeout(timer);},[query,search]);
 useEffect(()=>{const controller=new AbortController();setError('');void financeGet<BillingPreview>('/api/billing?'+new URLSearchParams({view:'preview',month,page:String(page),pageSize:'6',q:search}),controller.signal).then(value=>{if(!controller.signal.aborted){if(value.page!==page){setPage(value.page);return;}setResult({key,value});}}).catch(reason=>{if(!controller.signal.aborted)setError((reason as Error).message);});return()=>controller.abort();},[key,tick]);
 useEffect(()=>{const controller=new AbortController();setDetail(undefined);setDetailError('');if(!studentId){setDetailLoading(false);return;}setDetailLoading(true);void financeGet<BillingPreview>('/api/billing?'+new URLSearchParams({view:'preview',month,studentId}),controller.signal).then(value=>{if(!controller.signal.aborted)setDetail(value.detail);}).catch(reason=>{if(!controller.signal.aborted)setDetailError((reason as Error).message);}).finally(()=>{if(!controller.signal.aborted)setDetailLoading(false);});return()=>controller.abort();},[scopeKey,studentId,month,revision]);
 const changed=()=>{setError('');setRevision(value=>value+1);};
 useEffect(()=>{let last=0;const refresh=()=>{if(document.visibilityState!=='visible'||document.querySelector('dialog[open],.billing-adjustment')||Date.now()-last<5000)return;last=Date.now();setTick(value=>value+1);};const visible=()=>{if(document.visibilityState==='visible')refresh();};const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visible);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);};},[]);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible'&&!document.querySelector('dialog[open],.billing-adjustment'))changed();};window.addEventListener('tickminder:data-changed',refresh);return()=>window.removeEventListener('tickminder:data-changed',refresh);},[]);
 async function savePolicy(event:React.FormEvent){event.preventDefault();if(!canManageFees||!preview||policyBusy)return;setPolicyBusy(true);setPolicyError('');try{await post(requestBody({action:'savePolicy',revision:preview.policyRevision,currency:'MYR',hourRounding:'minute',attendanceBasis:'teaching',monthlyPartial:'manual',effectiveFrom:policyDate},policyOperation));policyOperation.current=null;showActionToast('success','计费规则已确认');changed();}catch(reason){setPolicyError((reason as Error).message);}finally{setPolicyBusy(false);}}
 const canAdvance=canAccounts&&prepaymentPermissions.view&&(prepaymentPermissions.manage||prepaymentPermissions.record);
 return <div className="billing-workspace student-tuition-workspace" data-testid="student-tuition-workspace">
  <section className="panel"><div className="section-head"><h2>{financeLabel('学生学费','Student tuition')}</h2><div className="billing-actions">{canManageFees&&<Button type="button" variant="outline" onClick={onCourses}>{financeLabel('课程设置','Course setup')}</Button>}<Button type="button" variant="outline" disabled={loading} onClick={changed}>{t('刷新')}</Button></div></div>
   <div className="tuition-filters"><label>{financeLabel('月份','Month')}<MonthInput aria-label={financeLabel('月份','Month')} type="month" value={month} onChange={event=>{if(/^20\d\d-(0[1-9]|1[0-2])$/.test(event.target.value)){setMonth(event.target.value);setPage(1);setStudentId('');setPolicyDate(event.target.value+'-01');setError('');}}}/></label><label>{financeLabel('搜索学生姓名','Search student name')}<input type="search" maxLength={150} value={query} onChange={event=>setQuery(event.target.value)}/></label></div>
   <FinanceHelp title={financeLabel('费用与余额说明','Fees and balances')}><p>{financeLabel('排课预计费用按所选月份已排课程计算，方便预收；已确认费用按考勤及收费决定核算。当前可用余额仅用于小时学费，固定月费直接在账单登记收款。','The schedule estimate follows lessons booked for the selected month. Confirmed tuition follows attendance and charge decisions. Current available balance is for hourly tuition; record monthly tuition against invoices.')}</p></FinanceHelp>
  </section>
  <details className="panel billing-policy"><summary>{t('计费规则')}{preview?.policy&&<span className="billing-status">{t('已确认')}</span>}</summary><div className="billing-policy-content"><p>{financeLabel('马币 MYR','Currency · MYR')}</p><ul className="billing-policy-rules"><li>{financeLabel('普通打卡及迟到：按课程预设时长计费。','Regular attendance and lateness: charge for the scheduled lesson duration.')}</li><li>{financeLabel('明确标记早退：按记录的离开时间调整。','Explicit early departure: adjust using the recorded departure time.')}</li><li>{financeLabel('按整分钟核算，每条费用四舍五入到分。','Calculate whole minutes; round each fee line to the nearest cent.')}</li><li>{financeLabel('缺席：按已复核的收费决定处理。','Absences: follow the reviewed charge decision.')}</li><li>{financeLabel('月中加入、暂停或退课：列为待核对，由管理员确认整月收费或调整金额。','Joining, pausing or leaving mid-month: an administrator reviews the full monthly fee or adjusts the amount.')}</li></ul>
   {preview?.policy?<p className="muted">{t('已确认')} · {t('生效日期')} {preview.policy.effectiveFrom} · {t('版本')} {preview.policy.revision}</p>:preview&&preview.policyRevision>0?<p className="notice">{t('已设置将来生效的计费规则；生效前的课程仍需核对。')}</p>:preview&&(canManageFees?<form className="billing-form" onSubmit={savePolicy}><label>{t('规则生效日期')}<DateInput type="date" required value={policyDate} onChange={e=>setPolicyDate(e.target.value)}/></label>{policyError&&<p role="alert" className="error">{policyError}</p>}<div className="billing-actions"><Button disabled={policyBusy}>{t(policyBusy?'正在保存…':'确认以上计费规则')}</Button></div></form>:<p className="notice">{t('尚未设置计费规则，请联系本集团最高管理员。')}</p>)}
  </div></details>
  {loading?<section className="panel" role="status">{t('正在核算费用…')}</section>:error&&!preview?<section className="panel" role="alert"><p>{error}</p><Button type="button" variant="outline" onClick={changed}>{t('重试')}</Button></section>:preview&&<>
   <div className="tuition-student-list">{preview.items.map(item=><StudentTuitionCard key={scopeKey+':'+month+':'+revision+':'+item.studentId} item={item} month={month} canAccounts={canAccounts} canAdvance={canAdvance} canCreate={canCreateInvoice&&Boolean(onInvoice)} expanded={studentId===item.studentId} onExpand={()=>setStudentId(studentId===item.studentId?'':item.studentId)} onAdvance={setAdvance} onInvoice={(student,scope)=>onInvoice?.(student.studentId,month,student.student,'create',scope)}>
    <div className="tuition-detail-actions">{canManageFees&&<Button type="button" variant="outline" onClick={()=>setRateStudent(item)}>{financeLabel('收费与费率','Tuition rates')}</Button>}{onInvoice&&<Button type="button" variant="outline" onClick={()=>onInvoice(item.studentId,month,item.student,'list')}>{financeLabel('账单与收据','Invoices & receipts')}</Button>}{canAccounts&&month<=financeMonth()&&<Button type="button" variant="outline" onClick={()=>setHistoryStudent(item)}>{financeLabel('月结与收款记录','Statement & payments')}</Button>}</div>
    <h4>{financeLabel('课程费用明细','Lesson charge details')}</h4>{detailLoading?<p role="status">{t('正在加载费用明细…')}</p>:detailError?<div role="alert"><p>{detailError}</p><Button type="button" variant="outline" onClick={changed}>{t('重试')}</Button></div>:detail&&<>{detail.lines.map(line=><FeeLine key={line.id} line={line} month={month} onChanged={changed} canManageFees={canManageFees}/>)}{!detail.lines.length&&<p>{t('本月暂无费用明细')}</p>}</>}
   </StudentTuitionCard>)}</div>
   {!preview.items.length&&<section className="panel"><p>{t('没有符合条件的学生')}</p></section>}
   <FinancePagination page={preview.page} pages={preview.pages} onChange={value=>{setPage(value);setStudentId('');}}/>
  </>}
  {advance&&<StudentAdvanceDialog student={advance} initialMonth={month} permissions={prepaymentPermissions} onClose={()=>setAdvance(null)} onSaved={changed} onMonthlyInvoice={selectedMonth=>{onInvoice?.(advance.studentId,selectedMonth,advance.student,canCreateInvoice?'create':'list','monthly');setAdvance(null);}}/>}
  {rateStudent&&<StudentTuitionRates student={rateStudent} onClose={()=>setRateStudent(null)} onSaved={()=>{setRateStudent(null);changed();}}/>}
  {historyStudent&&onInvoice&&<FinanceModal title={financeLabel('月结与收款记录','Statement & payments')} onClose={()=>setHistoryStudent(null)}><StudentStatementsWorkspace scopeKey={scopeKey} initialStudent={historyStudent} initialMonth={month} embedded canCreateInvoice={canCreateInvoice} prepaymentPermissions={prepaymentPermissions} onInvoice={(id,m,name,action,scope)=>onInvoice(id,m,name,action,scope)} onTuition={()=>setHistoryStudent(null)}/></FinanceModal>}
 </div>;
}
