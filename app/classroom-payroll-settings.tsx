"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {alertActionFailure,showActionToast} from '@/lib/action-feedback';
import {F2} from '@/lib/finance-round2-i18n';
import {getLanguage} from '@/lib/i18n';
import type {PayrollClassroomResponse,PayrollRate,PayrollResult} from '@/lib/payroll';
import {financeCents,financeDate,financeGet,financeMoney,financeMonth,financePost,FinanceModal,type PendingOperation} from './finance-round2-shared';
import './finance-round2.css';
import './payroll-compact.css';

type ClassroomRates=PayrollClassroomResponse;
type PayMode='hour'|'lesson'|'month';
const rateUnit=(mode:PayMode)=>F2(mode==='month'?'monthUnit':mode==='lesson'?'lessonUnit':'hour');
const payLabel=(zh:string,en:string)=>getLanguage()==='en'?en:zh;
function newestRate(rates:PayrollRate[],teacherId:string){return rates.filter(rate=>rate.teacherId===teacherId).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||b.revision-a.revision)[0];}

export default function ClassroomPayrollSettings({classroomId,canEdit}:{classroomId:string;canEdit:boolean}){
 const [data,setData]=useState<ClassroomRates|null>(null),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[version,setVersion]=useState(0),[visible,setVisible]=useState(20);
 const [teacherId,setTeacherId]=useState(''),[mode,setMode]=useState<PayMode>('hour'),[amount,setAmount]=useState(''),[effectiveFrom,setEffectiveFrom]=useState(()=>financeMonth()+'-01'),[suggested,setSuggested]=useState(false),[busy,setBusy]=useState(false);
 const [editing,setEditing]=useState(false);
 const pending=useRef<PendingOperation>(null);
 function fill(next:ClassroomRates,id:string){const own=newestRate(next.rates,id),suggestion=own?undefined:newestRate(next.suggestions,id),rate=own||suggestion;setTeacherId(id);setMode(own?.mode||'hour');setAmount(rate?(rate.amountCents/100).toFixed(2):'');setSuggested(Boolean(suggestion));setEffectiveFrom(financeMonth()+'-01');pending.current=null;}
 useEffect(()=>{const controller=new AbortController();setLoading(true);setFailed(false);setData(null);void financeGet<ClassroomRates>('/api/payroll?'+new URLSearchParams({view:'classroom',classroomId}),controller.signal).then(next=>{if(controller.signal.aborted)return;setData(next);setVisible(20);const selected=next.teachers.find(item=>item.teacherId===teacherId)||next.teachers.find(item=>item.teacherName===next.classroom.teacherName)||next.teachers[0];if(selected)fill(next,selected.teacherId);else setTeacherId('');}).catch(error=>{if(!controller.signal.aborted){setFailed(true);alertActionFailure(error);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[classroomId,version]);
 const person=data?.teachers.find(item=>item.teacherId===teacherId),scopeRates=data?.rates.filter(item=>item.teacherId===teacherId)||[],revision=Math.max(0,...scopeRates.map(item=>item.scopeRevision));
 async function save(event:FormEvent){event.preventDefault();if(busy||!data||!person||!canEdit)return;setBusy(true);try{if(!/^20\d\d-\d\d-\d\d$/.test(effectiveFrom))throw Error(F2('invalidDate'));await financePost<PayrollResult>('/api/payroll',{action:'saveRate',teacherId,classroomId,revision,mode,amountCents:financeCents(amount),effectiveFrom},pending);setEditing(false);setVersion(value=>value+1);showActionToast('success','finance2.saved');}catch(error){if((error as {status?:number}).status===409)setVersion(value=>value+1);alertActionFailure(error);}finally{setBusy(false);}}
 useEffect(()=>setEditing(false),[classroomId]);
 return <div className="finance2-workspace classroom-payroll-settings payroll-compact" data-testid="classroom-payroll-settings"><section className="panel">
  <div className="finance2-section-head"><h2>{F2('classroomPay')}</h2><Button type="button" variant="outline" disabled={loading||busy} onClick={()=>setVersion(value=>value+1)}>{F2('refresh')}</Button></div>
  <p className="payroll-rate-location">{payLabel('本班独立计薪，整班报酬只算一次。','Pay is set for this classroom and counted once per class.')}</p>
  <details className="payroll-help"><summary>{payLabel('报酬设置说明','About classroom pay')}</summary><div><p>{F2('classroomPayHint')}</p><p>{F2('classRateHint')}</p></div></details>
  {loading?<p className="finance2-loading" role="status">{F2('loading')}</p>:failed?<div className="finance2-error-state finance2-spaced-actions"><p>{F2('loadFailed')}</p><Button type="button" variant="outline" onClick={()=>setVersion(value=>value+1)}>{F2('reload')}</Button></div>:data&&<>
   {!data.teachers.length?<p className="finance2-notice finance2-spaced-actions">{F2('classTeacherMissing')}</p>:<>
    <div className="finance2-records payroll-class-rates">{data.teachers.map(item=>{const rate=newestRate(data.rates,item.teacherId);return <article className="finance2-record" key={item.teacherId}><div className="finance2-record-head"><h3>{item.teacherName}{!item.active&&<span className="finance2-badge">{F2('inactive')}</span>}</h3>{rate&&<strong>{financeMoney(rate.amountCents)} / {rateUnit(rate.mode||'hour')}</strong>}</div>{rate?<p className="payroll-rate-effective">{payLabel('最新设置','Latest setting')} · {F2('effectiveFrom')} {financeDate(rate.effectiveFrom)}</p>:<p className="finance2-line-warning">{F2('noClassRates')}</p>}{canEdit&&<div className="finance2-actions"><Button type="button" variant={rate?'outline':'default'} disabled={busy} onClick={()=>{fill(data,item.teacherId);setEditing(true);}}>{rate?payLabel('更改报酬','Change pay rate'):payLabel('设置报酬','Set pay rate')}</Button></div>}</article>;})}</div>
    {!canEdit&&<p className="finance2-muted finance2-spaced-actions">{F2('payRatesReadOnly')}</p>}
   </>}
  </>}
 </section>{data&&<details className="panel payroll-history"><summary><span>{F2('rateHistory')}</span><span className="finance2-muted">{F2('total').replace('{count}',String(data.rates.length))}</span></summary><div className="payroll-history-body">
  {!data.rates.length?<p className="finance2-empty">{F2('noClassRates')}</p>:<div className="finance2-records">{data.rates.slice(0,visible).map(rate=><article className="finance2-record" key={rate.id}><div className="finance2-record-head"><h3>{data.teachers.find(item=>item.teacherId===rate.teacherId)?.teacherName||F2('teacher')}</h3><strong>{financeMoney(rate.amountCents)} / {rateUnit(rate.mode||'hour')}</strong></div><p className="payroll-rate-effective">{F2('effectiveFrom')} · {financeDate(rate.effectiveFrom)}</p><details className="payroll-help"><summary>{payLabel('记录详情','Record details')}</summary><div><dl><div><dt>{F2('payMode')}</dt><dd>{F2(rate.mode==='month'?'payByMonth':rate.mode==='lesson'?'payByLesson':'payByHour')}</dd></div><div><dt>{F2('date')}</dt><dd>{financeDate(rate.createdAt,true)}</dd></div></dl></div></details></article>)}</div>}
  {visible<data.rates.length&&<div className="finance2-actions finance2-spaced-actions"><Button type="button" variant="outline" onClick={()=>setVisible(value=>value+20)}>{F2('loadMore')}</Button></div>}
 </div></details>}
 {editing&&data&&canEdit&&<FinanceModal title={F2('classroomPay')} description={data.classroom.title} busy={busy} onClose={()=>{setEditing(false);pending.current=null;}}>
    <form className="finance2-payroll-form payroll-rate-editor" noValidate onSubmit={save}><fieldset disabled={busy}><div className="finance2-form-grid">
     <label>{F2('teacher')}<select value={teacherId} onChange={event=>fill(data,event.target.value)}>{data.teachers.map(item=><option key={item.teacherId} value={item.teacherId}>{item.teacherName}{!item.active?' · '+F2('inactive'):''}</option>)}</select></label>
     <label>{F2('payMode')}<select value={mode} onChange={event=>{setMode(event.target.value as PayMode);pending.current=null;}}><option value="hour">{F2('payByHour')}</option><option value="lesson">{F2('payByLesson')}</option><option value="month">{F2('payByMonth')}</option></select></label>
     <label>{F2(mode==='hour'?'hourlyRate':mode==='lesson'?'lessonRate':'monthlyRate')}<input inputMode="decimal" maxLength={11} value={amount} onChange={event=>{setAmount(event.target.value);setSuggested(false);pending.current=null;}} placeholder="0.00"/></label>
     <label>{F2('effectiveFrom')}<input type="date" value={effectiveFrom} onChange={event=>{setEffectiveFrom(event.target.value);pending.current=null;}}/></label>
    </div></fieldset>
    {suggested&&<p className="finance2-notice">{F2('prefillRateHint')}</p>}
    <details className="payroll-help"><summary>{payLabel('计算说明','How pay is calculated')}</summary><div><p>{F2(mode==='month'?'monthlyPayHint':mode==='lesson'?'lessonPayHint':'hourlyPayHint')}</p></div></details>
    <div className="finance2-actions"><Button type="button" variant="outline" disabled={busy} onClick={()=>{setEditing(false);pending.current=null;}}>{F2('cancel')}</Button><Button type="submit" disabled={busy||!person}>{F2(busy?'saving':'saveClassRate')}</Button></div></form>
 </FinanceModal>}</div>;
}
