"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {DateInput} from '@/components/date-time-input';
import {Button} from '@/components/ui/button';
import {useAdminAction,useAdminPermissionAccount} from './admin-permission-context';
import {actionFailureMessage,showActionToast} from '@/lib/action-feedback';
import {getLanguage} from '@/lib/i18n';
import {coursePayTargets,type CourseSetupPair,type CoursePayClassroom} from '@/lib/course-setup-flow';
import type {PayrollClassroomResponse,PayrollRateMode,PayrollResult} from '@/lib/payroll';
import {financeCents,financeGet,financePost,financeMoney,type PendingOperation} from './finance-round2-shared';

const text=(zh:string,en:string)=>getLanguage()==='zh'?zh:en;
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const modeText=(mode:PayrollRateMode)=>mode==='hour'?text('按小时','Hourly'):mode==='month'?text('固定月薪','Fixed monthly pay'):text('按堂','Per lesson');

/** Pair selection narrows existing authorized classroom payroll scopes only. */
export function TeacherPayRateEditor({pair,onSaved,onBusyChange,onDirtyChange}:{pair:CourseSetupPair;onSaved?:()=>void;onBusyChange?:(busy:boolean)=>void;onDirtyChange?:(dirty:boolean)=>void}){
 const account=useAdminPermissionAccount(),can=useAdminAction(),allowed=account?.role==='admin'&&can('payroll.view')&&can('payroll.rates')&&can('classrooms.view');
 const [targets,setTargets]=useState<CoursePayClassroom[]>([]),[classroomId,setClassroomId]=useState(''),[data,setData]=useState<PayrollClassroomResponse|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0),[busy,setBusy]=useState(false);
 const [mode,setMode]=useState<PayrollRateMode>('hour'),[amount,setAmount]=useState(''),[date,setDate]=useState(today);
 const pending=useRef<PendingOperation>(null),inFlight=useRef(false);
 useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
 const pairKey=JSON.stringify([pair.key,pair.teacherName,pair.subjectId,pair.syllabusId,pair.grade,pair.active]);
 useEffect(()=>{
  const controller=new AbortController();setTargets([]);setClassroomId('');setData(null);setError('');setLoading(allowed);pending.current=null;
  if(allowed)void financeGet<{classrooms:CoursePayClassroom[]}>('/api/state?scope=classrooms',controller.signal).then(value=>{
   if(controller.signal.aborted)return;const found=coursePayTargets(pair,value.classrooms||[]);setTargets(found);setClassroomId(found.length===1?found[0].id:'');
  }).catch(error=>{if(!controller.signal.aborted)setError(actionFailureMessage(error));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[pairKey,allowed,reload]);
 useEffect(()=>{
  const controller=new AbortController();setData(null);pending.current=null;onDirtyChange?.(false);
  if(!allowed||!classroomId)return()=>controller.abort();
  setLoading(true);setError('');void financeGet<PayrollClassroomResponse>('/api/payroll?'+new URLSearchParams({view:'classroom',classroomId}),controller.signal).then(value=>{
   if(controller.signal.aborted)return;
   if(value.classroom.id!==classroomId||value.classroom.teacherName!==pair.teacherName)throw Error(text('班级任教关系已改变，请重新载入。','The classroom teaching assignment changed. Reload to continue.'));
   const person=value.teachers.find(item=>item.teacherName===pair.teacherName);if(!person)throw Error(text('此老师已不在该班工资名单，请重新核对。','This teacher is no longer available for this classroom.'));
   const rates=value.rates.filter(item=>item.teacherId===person.teacherId&&item.classroomId===classroomId).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||b.revision-a.revision),latest=rates[0];
   setData(value);setMode(latest?.mode||'hour');setAmount(latest?(latest.amountCents/100).toFixed(2):'');
   setDate(latest?new Date(Date.parse((latest.effectiveFrom>today()?latest.effectiveFrom:today())+'T00:00:00Z')+86400000).toISOString().slice(0,10):today());
  }).catch(error=>{if(!controller.signal.aborted)setError(actionFailureMessage(error));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[classroomId,allowed,pairKey]);
 const person=data?.teachers.find(item=>item.teacherName===pair.teacherName),rates=data?.rates.filter(item=>item.teacherId===person?.teacherId&&item.classroomId===classroomId)||[];
 async function save(event:FormEvent){
  event.preventDefault();if(!allowed||!person?.active||!pair.active||!data||inFlight.current)return;
  inFlight.current=true;setBusy(true);setError('');
  try{
   await financePost<PayrollResult>('/api/payroll',{action:'saveRate',teacherId:person.teacherId,classroomId,revision:Math.max(0,...rates.map(rate=>rate.scopeRevision)),mode,amountCents:financeCents(amount),effectiveFrom:date},pending);
   onDirtyChange?.(false);showActionToast('success',text('老师薪资设置已保存','Teacher pay settings saved'));if(onSaved)onSaved();else setReload(value=>value+1);
  }catch(error){setError(actionFailureMessage(error));}finally{inFlight.current=false;setBusy(false);}
 }
 if(!allowed)return <p role="status">{text('你没有班级工资设置权限；已保存的配对与学费保留，请授权管理员稍后设置。','You cannot edit classroom pay. Saved pairings and fees are retained; an authorized administrator can complete this later.')}</p>;
 return <div className="billing-rate-editor course-pay-editor" aria-busy={busy}>
  <div className="billing-context"><strong>{pair.student} · {pair.subject} · {pair.teacherName}</strong><p className="muted">{text('老师工资独立设置，不会复制学生学费。沿用现有班级计薪规则，整班工资只计算一次。','Teacher pay is set separately from student fees. Existing classroom pay rules apply; each class is paid once.')}</p></div>
  {loading&&<p role="status">{text('正在读取匹配班级与工资…','Loading matching classrooms and pay…')}</p>}
  {!loading&&!error&&!targets.length&&<p className="notice" data-testid="course-pay-no-target">{text('此配对尚未匹配有效班级，工资尚未配置。配对与已保存学费不会丢失；请在班级加入该学生后，从这里或班级的老师报酬入口继续。','This pairing has no matching active classroom, so pay has not been configured. The pairing and saved fees remain. Add the student to a matching classroom, then return here or use its Teacher remuneration entry.')}</p>}
  {targets.length>1&&<label>{text('选择本次设置工资的班级','Choose the classroom for this pay rate')}<select disabled={busy} value={classroomId} onChange={event=>setClassroomId(event.target.value)}><option value="">{text('请选择班级','Choose a classroom')}</option>{targets.map(room=><option key={room.id} value={room.id}>{room.title}</option>)}</select></label>}
  {data&&!loading&&<><p className="notice">{text('本次工资适用于班级：','This pay rate applies to classroom: ')}<strong>{data.classroom.title}</strong>{text('。该班其他学生不产生重复工资。','; other students in this class do not create duplicate pay.')}</p>
   {person?.active&&pair.active?<form onSubmit={save} className="billing-form"><div className="billing-form-grid">
    <label>{text('计薪方式','Pay method')}<select value={mode} disabled={busy} onChange={event=>{setMode(event.target.value as PayrollRateMode);onDirtyChange?.(true);}}>{(['hour','lesson','month'] as const).map(value=><option key={value} value={value}>{modeText(value)}</option>)}</select></label>
    <label>{text('老师薪资金额','Teacher pay amount')} · MYR<input aria-label={text('老师薪资金额','Teacher pay amount')} required inputMode="decimal" maxLength={11} value={amount} disabled={busy} onChange={event=>{setAmount(event.target.value);onDirtyChange?.(true);}}/></label>
    <label>{text('生效日期','Effective date')}<DateInput required value={date} disabled={busy} onChange={event=>{setDate(event.target.value);onDirtyChange?.(true);}}/></label>
   </div><p className="muted">{text('保存新增费率版本，保留原有效日期与历史工资。','Saving adds a rate version and retains earlier effective dates and payroll history.')}</p><div className="billing-actions"><Button disabled={busy}>{text(busy?'正在保存…':'保存老师薪资',busy?'Saving…':'Save teacher pay')}</Button></div></form>:<p role="status">{text('老师或配对已停用，工资历史只读。','The teacher or pairing is inactive. Pay history is read-only.')}</p>}
   <section className="billing-rate-history"><h3>{text('工资费率历史','Pay rate history')}</h3>{rates.length?<ol>{rates.map(rate=><li key={rate.id}><strong>{financeMoney(rate.amountCents)} · {modeText(rate.mode)}</strong><span>{rate.effectiveFrom}</span></li>)}</ol>:<p className="muted">{text('尚未配置该老师的本班工资。','This teacher has no pay rate for this classroom yet.')}</p>}</section>
  </>}
  {error&&<div role="alert" data-error-popup-ignore className="billing-error"><p>{error}</p><p>{text('已保存的配对与学费保留；工资保存结果不明确时，请重试同一保存或重新载入核对。','Saved pairing and fees are retained. If a pay save is unconfirmed, retry the same save or reload to verify it.')}</p><Button type="button" variant="outline" disabled={busy} onClick={()=>setReload(value=>value+1)}>{text('重新载入','Reload')}</Button></div>}
 </div>;
}
