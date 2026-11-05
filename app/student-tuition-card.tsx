"use client";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {BillingSummary} from '@/lib/billing';
import type {PrepaymentAccountSummary} from '@/lib/prepayments';
import type {ScheduledTuition} from '@/lib/student-tuition';
import {financeGet,financeMoney} from './finance-round2-shared';
import {financeLabel as L} from './finance-layout-tools';

export type TuitionStudent={studentId:string;student:string};
export default function StudentTuitionCard({item,month,canAccounts,canAdvance,canCreate,expanded,onExpand,onAdvance,onInvoice,children}:{item:BillingSummary;month:string;canAccounts:boolean;canAdvance:boolean;canCreate:boolean;expanded:boolean;onExpand:()=>void;onAdvance:(student:TuitionStudent)=>void;onInvoice:(student:TuitionStudent,scope?:'monthly'|'hourly')=>void;children?:ReactNode}){
 const ref=useRef<HTMLElement>(null),[visible,setVisible]=useState(false),[retry,setRetry]=useState(0),[account,setAccount]=useState<PrepaymentAccountSummary|null>(null),[scheduled,setScheduled]=useState<ScheduledTuition|null>(null),[accountError,setAccountError]=useState(false),[scheduleError,setScheduleError]=useState(false);
 useEffect(()=>{const element=ref.current;if(!element)return;if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'80px'});observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  if(!visible)return;const controller=new AbortController();setAccount(null);setScheduled(null);setAccountError(false);setScheduleError(false);
  void financeGet<ScheduledTuition>('/api/billing?'+new URLSearchParams({view:'scheduled',studentId:item.studentId,month}),controller.signal).then(value=>{if(!controller.signal.aborted&&value.studentId===item.studentId&&value.month===month)setScheduled(value);}).catch(()=>{if(!controller.signal.aborted)setScheduleError(true);});
  if(canAccounts)void financeGet<PrepaymentAccountSummary>('/api/prepayments?'+new URLSearchParams({view:'account',studentId:item.studentId}),controller.signal).then(value=>{if(!controller.signal.aborted&&value.studentId===item.studentId)setAccount(value);}).catch(()=>{if(!controller.signal.aborted)setAccountError(true);});
  return()=>controller.abort();
 },[visible,item.studentId,month,canAccounts,retry]);
 const refreshedBoundary=useRef('');
 useEffect(()=>{const boundary=account?.nextBoundary;if(!boundary||refreshedBoundary.current===boundary)return;const delay=Date.parse(boundary)-Date.now();if(!Number.isFinite(delay)||delay>2147483647)return;const timer=setTimeout(()=>{refreshedBoundary.current=boundary;setRetry(value=>value+1);},Math.max(5000,delay+250));return()=>clearTimeout(timer);},[account?.nextBoundary]);
 const due=account?.invoiceDueCents,unavailable=L('待核对','Needs review');
 return <article ref={ref} className="tuition-student-card" data-student-id={item.studentId} data-testid="tuition-student-card">
  <div className="tuition-card-heading"><h3>{item.student}</h3>{item.pendingCount>0&&<span className="billing-status billing-status-pending">{L('待核对','Needs review')} · {item.pendingCount}</span>}</div>
  <div className="tuition-schedule-estimate" aria-label={L('按排课预计费用','Scheduled tuition estimate')}>
   <div><span>{L('按排课预计费用','Scheduled tuition estimate')}</span><strong>{scheduleError?L('暂时无法计算','Unavailable'):!scheduled?'—':!scheduled.complete?unavailable:!scheduled.lessonCount?L('暂无排课','No scheduled lessons'):financeMoney(scheduled.totalCents)}</strong></div>
   {scheduled?.lessonCount? <p>{scheduled.lessonCount} {L('堂已排课程','scheduled lessons')}{scheduled.complete&&<>{scheduled.hourlyCents>0&&<> · {L('小时学费','Hourly')} {financeMoney(scheduled.hourlyCents)}</>}{scheduled.monthlyCents>0&&<> · {L('月费基础金额','Base monthly fee')} {financeMoney(scheduled.monthlyCents)}</>}{scheduled.lessonCents>0&&<> · {L('旧按堂收费','Legacy per-lesson fee')} {financeMoney(scheduled.lessonCents)}</>}</>}</p>:null}
   {scheduled&&!scheduled.complete&&<p>{L('排课或费率有待核对，暂不显示完整预计金额。','Lessons or rates need review before a complete estimate can be shown.')}</p>}
   {scheduled?.needsMonthlyReview&&<p>{L('月费额外课次及特殊调整未计入，确认后另行收费。','Monthly extra sessions and special adjustments are excluded until reviewed.')}</p>}
  </div>
  <dl className="tuition-card-metrics"><div><dt>{L('当月已确认费用','Confirmed tuition this month')}</dt><dd>{financeMoney(item.subtotalCents)}</dd></div>{canAccounts&&<><div><dt>{L('当前账单待缴','Current invoices due')}</dt><dd>{accountError?unavailable:financeMoney(due)}</dd></div><div><dt>{L('当前可用余额','Current available balance')}</dt><dd>{accountError||account?.availableBalanceCents===null?unavailable:financeMoney(account?.availableBalanceCents)}</dd></div></>}</dl>
  {account?.reviewRequired&&<p className="tuition-card-note" role="status">{L('部分费用待核对，可用余额暂不显示。','Some charges need review; available balance is withheld.')}</p>}
  {(scheduleError||accountError)&&<Button type="button" variant="outline" onClick={()=>setRetry(value=>value+1)}>{L('重试金额核对','Retry amounts')}</Button>}
  <div className="tuition-card-actions">{canAdvance&&account?.advanceEligible&&<Button type="button" onClick={()=>onAdvance(item)}>{L('提前收款','Advance payment')}</Button>}{canCreate&&<Button type="button" variant="outline" disabled={canAccounts&&!account} onClick={()=>onInvoice(item,account?(account.hasMonthly?'monthly':'hourly'):undefined)}>{L('开单','Create invoice')}</Button>}<Button type="button" variant="outline" aria-expanded={expanded} onClick={onExpand}>{L(expanded?'收起明细':'查看明细',expanded?'Hide details':'View details')}<ChevronDown size={18} strokeWidth={2.2} className={expanded?'is-open':undefined} aria-hidden="true"/></Button></div>
  {expanded&&<div className="tuition-card-detail">{children}</div>}
 </article>;
}
