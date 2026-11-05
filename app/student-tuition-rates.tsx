"use client";
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {BillingRateEditor} from './billing-rate-editor';
import {financeGet,FinanceModal} from './finance-round2-shared';
import {financeLabel as L} from './finance-layout-tools';
import type {TuitionStudent} from './student-tuition-card';
type RateOption={planKey:string;subject:string;teacherName:string};
export default function StudentTuitionRates({student,onClose,onSaved}:{student:TuitionStudent;onClose:()=>void;onSaved:()=>void}){
 const [items,setItems]=useState<RateOption[]|null>(null),[selected,setSelected]=useState(''),[error,setError]=useState(false),[reload,setReload]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{const controller=new AbortController();setItems(null);setError(false);void financeGet<{studentId:string;items:RateOption[]}>('/api/billing?'+new URLSearchParams({view:'studentRates',studentId:student.studentId}),controller.signal).then(value=>{if(!controller.signal.aborted&&value.studentId===student.studentId){setItems(value.items);setSelected(value.items[0]?.planKey||'');}}).catch(()=>{if(!controller.signal.aborted)setError(true);});return()=>controller.abort();},[student.studentId,reload]);
 return <FinanceModal title={L('收费与费率','Tuition rates')} busy={busy} onClose={onClose}><p><strong>{student.student}</strong></p>{error?<div role="alert"><p>{L('费率暂时无法载入。','Rates could not be loaded.')}</p><Button variant="outline" onClick={()=>setReload(value=>value+1)}>{L('重试','Retry')}</Button></div>:!items?<p role="status">{L('正在载入…','Loading…')}</p>:!items.length?<p>{L('没有启用的课程配对，请先设置学生课程。','No active course pairings. Set up this student’s courses first.')}</p>:<><label className="tuition-rate-picker">{L('科目与老师','Subject and teacher')}<select value={selected} disabled={busy} onChange={event=>setSelected(event.target.value)}>{items.map(item=><option key={item.planKey} value={item.planKey}>{item.subject} · {item.teacherName}</option>)}</select></label>{selected&&<BillingRateEditor key={selected} planKey={selected} onBusyChange={setBusy} onSaved={onSaved}/>}</>}</FinanceModal>;
}
