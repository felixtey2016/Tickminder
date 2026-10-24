"use client";

import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {alertActionFailure} from '@/lib/action-feedback';
import {formatDurationSeconds} from '@/lib/duration-format';
import {getLanguage} from '@/lib/i18n';
import {canNavigateBack,usePageHistoryState} from '@/lib/page-history';
import {F2} from '@/lib/finance-round2-i18n';
import type {FinanceBasis,FinanceDetailKind,FinanceOptions,FinancePage,FinanceReportRow,FinanceSummary} from '@/lib/finance-reporting';
import {financeGet,financeMonth,financeMoney,financeDate,FinancePagination,FinanceCsvButton} from './finance-round2-shared';
import './finance-round2.css';
import './finance-overview-compact.css';

type ExportKind='invoices'|'payments'|'arrears'|'payroll'|'expenses';
export type FinanceOverviewPermissions={payroll:boolean;expenses:boolean;export:boolean;invoices?:boolean;prepayments?:boolean};
type DetailQuery={kind:FinanceDetailKind;month:string;basis:FinanceBasis;page:number;teacher:string;subject:string;classroomId:string};
type Metric={label:string;value:number|null|undefined;kind?:FinanceDetailKind;hint?:string};
const compactLabel=(zh:string,en:string)=>getLanguage()==='en'?en:zh;

const serviceKinds:FinanceDetailKind[]=['unbilled','attendance','makeups','missingFees','missingPayRates','pendingChanges','monthlyPayReviews'];
const debtKinds:FinanceDetailKind[]=['arrears','overdue','arrearsAll','overdueAll'];
const payrollKinds:FinanceDetailKind[]=['payroll','unpaidPayroll','payrollCash','missingPayRates','monthlyPayReviews'];
const reminderKind:Record<string,FinanceDetailKind>={unbilled:'unbilled',attendance:'attendance',makeups:'makeups',makeup:'makeups',missingFees:'missingFees',missingFee:'missingFees',missingPayRates:'missingPayRates',missingPayrate:'missingPayRates',overdue:'overdue',unpaidPayroll:'unpaidPayroll',payroll:'unpaidPayroll',pendingChanges:'pendingChanges',monthlyPayReviews:'monthlyPayReviews'};
const reminderLabel:Record<string,string>={unbilled:'unbilled',attendance:'attendance',makeups:'makeup',makeup:'makeup',missingFees:'missingFee',missingFee:'missingFee',missingPayRates:'missingPayrate',missingPayrate:'missingPayrate',overdue:'overdue',unpaidPayroll:'unpaidPayroll',payroll:'unpaidPayroll',pendingChanges:'pendingChanges',monthlyPayReviews:'monthlyPayReviews'};
const detailLabels:Record<FinanceDetailKind,string>={invoices:'exportInvoices',payments:'netReceiptDetails',receivedPayments:'received',refunds:'refunds',paymentReversals:'paymentReversals',arrears:'exportArrears',overdue:'overdue',arrearsAll:'allMonthArrears',overdueAll:'allMonthOverdue',payroll:'exportPayroll',unpaidPayroll:'unpaidPayroll',payrollCash:'salaryPaid',expenses:'exportExpenses',expenseCash:'expensePaid',unbilled:'unbilled',attendance:'attendance',makeups:'makeup',missingFees:'missingFee',missingPayRates:'missingPayrate',pendingChanges:'pendingChanges',monthlyPayReviews:'monthlyPayReviews',prepaymentCash:'prepaymentCash',prepaymentSettlements:'prepaymentSettlements',prepaymentBalances:'prepaymentBalances'};
function rowStatus(row:FinanceReportRow,kind:FinanceDetailKind){
 if(row.status==='payment'&&kind==='payrollCash')return F2('payRecord');
 return ({prepayment_payment:F2('prepaymentReceived'),prepayment_refund:F2('prepaymentRefund'),prepayment_reverse:F2('prepaymentReverse'),prepayment_apply:F2('prepaymentApply'),prepayment_release:F2('prepaymentRelease'),prepayment_balance:F2('prepaymentBalance'),draft:F2('draft'),issued:F2('invoiceIssued'),unpaid:F2('invoiceUnpaid'),partially_paid:F2('invoicePartPaid'),paid:F2('paid'),confirmed:F2('confirmed'),void:F2('void'),reversed:F2('reversed'),active:F2('active'),scheduled:F2('teachingPending'),pending:F2('pending'),completed:F2('confirmed'),payment:F2('received'),refund:F2('refunds'),record:F2('expenseRecord'),unbilled:F2('unbilledStatus'),attendance_pending:F2('attendance'),makeup_pending:F2('makeup'),missing_fee:F2('missingFee'),missing_pay_rate:F2('missingPayrate'),change_pending:F2('pendingChanges'),monthly_review_pending:F2('monthlyPayReviews'),pending_change:F2('pendingChanges'),monthly_pay_review:F2('monthlyPayReviews'),reverse:F2('reversed'),charge:F2('bonus'),credit:F2('deduction')} as Record<string,string>)[row.status]||row.status;
}
function invoiceScope(month:string,basis:FinanceBasis){
 return F2(basis==='service'?'serviceInvoiceScope':'issuedInvoiceScope').replace('{month}',month);
}
function detailScope(query:DetailQuery){
 if(query.kind==='prepaymentBalances')return F2('prepaymentBalanceHint');
 if(query.kind==='prepaymentCash')return query.month+' · '+F2('cash');
 if(query.kind==='arrearsAll'||query.kind==='overdueAll')return F2('allMonthDebtScope');
 if(debtKinds.includes(query.kind)||query.kind==='invoices')return invoiceScope(query.month,query.basis);
 if(serviceKinds.includes(query.kind)||query.kind==='unpaidPayroll'||query.kind==='payroll')return query.month+' · '+F2('service');
 return query.month+' · '+F2(query.kind==='expenseCash'||query.kind==='expenses'?'cash':query.basis);
}

export default function FinanceOverview({permissions,onInvoice,onPayroll,onPayrollMonth}:{permissions:FinanceOverviewPermissions;onInvoice:(id:string)=>void;onPayroll:(id:string)=>void;onPayrollMonth?:(month:string)=>void}){
 const [month,,setMonth]=usePageHistoryState('finance.overview.month',financeMonth());
 const [basis,,setBasis]=usePageHistoryState<FinanceBasis>('finance.overview.basis','cash');
 const [version,setVersion]=useState(0);
 const [summaryResult,setSummaryResult]=useState<{key:string;value:FinanceSummary}|null>(null),[summaryFailure,setSummaryFailure]=useState('');
 const [query,setQuery,replaceQuery]=usePageHistoryState<DetailQuery|null>('finance.overview.detail',null);
 const [detailResult,setDetailResult]=useState<{key:string;value:FinancePage}|null>(null),[detailFailure,setDetailFailure]=useState('');
 const [options,setOptions]=useState<FinanceOptions|null>(null),[exportKind,setExportKind]=useState<ExportKind>('invoices');
 const detailHeading=useRef<HTMLHeadingElement>(null);
 const detailReturn=useRef<{element:HTMLElement|null;scrollY:number}|null>(null);
 const hadDetail=useRef(false);
 const summaryKey=JSON.stringify([month,basis,version]),detailKey=JSON.stringify([query,version]);
 const summary=summaryResult?.key===summaryKey?summaryResult.value:null,failed=!summary&&summaryFailure===summaryKey,loading=!summary&&!failed;
 const detail=detailResult?.key===detailKey?detailResult.value:null,detailFailed=!detail&&detailFailure===detailKey,detailLoading=Boolean(query&&!detail&&!detailFailed);
 useEffect(()=>{
  const controller=new AbortController();
  void financeGet<FinanceSummary>('/api/finance-reports?'+new URLSearchParams({view:'summary',month,basis}),controller.signal)
   .then(value=>{if(!controller.signal.aborted)setSummaryResult({key:summaryKey,value});})
   .catch(error=>{if(!controller.signal.aborted){setSummaryFailure(summaryKey);alertActionFailure(error);}});
  return()=>controller.abort();
 },[month,basis,summaryKey]);
 useEffect(()=>{
  if(!query)return;
  const controller=new AbortController(),{kind,month,basis,page,teacher,subject,classroomId}=query;
  const params=new URLSearchParams({view:'details',kind,month,basis,page:String(page),...(serviceKinds.includes(kind)?{teacher,subject,classroomId}:{})});
  void financeGet<FinancePage>('/api/finance-reports?'+params,controller.signal)
   .then(value=>{if(!controller.signal.aborted)setDetailResult({key:detailKey,value});})
   .catch(error=>{if(!controller.signal.aborted){setDetailFailure(detailKey);alertActionFailure(error);}});
  return()=>controller.abort();
 },[query,detailKey]);
 useEffect(()=>{
  if(!query||!serviceKinds.includes(query.kind)||options)return;
  const controller=new AbortController();
  void financeGet<FinanceOptions>('/api/finance-reports?view=options',controller.signal)
   .then(value=>{if(!controller.signal.aborted)setOptions(value);})
   .catch(error=>{if(!controller.signal.aborted)alertActionFailure(error);});
  return()=>controller.abort();
 },[query?.kind,options]);
 useEffect(()=>{
  const restore=hadDetail.current;hadDetail.current=Boolean(query);
  const frame=requestAnimationFrame(()=>{
   if(query){detailHeading.current?.focus({preventScroll:true});detailHeading.current?.scrollIntoView({block:'start'});}
   else if(restore){detailReturn.current?.element?.focus({preventScroll:true});window.scrollTo({top:detailReturn.current?.scrollY||0,behavior:'instant'});}
  });
  return()=>cancelAnimationFrame(frame);
 },[query?.kind,query?.month,query?.basis]);
 function changeKind(kind:FinanceDetailKind,targetMonth=month,targetBasis=basis){
  if(!query)detailReturn.current={element:document.activeElement instanceof HTMLElement?document.activeElement:null,scrollY:window.scrollY};
  setDetailResult(null);setDetailFailure('');
  setQuery({kind,month:targetMonth,basis:serviceKinds.includes(kind)?'service':targetBasis,page:1,teacher:'',subject:'',classroomId:''});
  window.history.replaceState({...window.history.state,timelyoFinanceOverviewDetail:true},'');
 }
 function closeDetails(){
  if(window.history.state?.timelyoFinanceOverviewDetail&&canNavigateBack())window.history.back();
  else replaceQuery(null);
 }
 function detailFilter(key:'teacher'|'subject'|'classroomId',value:string){
  replaceQuery(current=>current?{...current,[key]:value,page:1}:null);
 }
 const metrics=summary?.metrics;
 const coreMetrics:Metric[]=[
  {label:'netReceived',value:metrics?.netReceivedCents,kind:'payments',hint:F2('netReceiptFormula')},
  {label:'remaining',value:metrics?.remainingCents,kind:'arrears',hint:invoiceScope(month,basis)},
  {label:'overdue',value:metrics?.overdueCents,kind:'overdue',hint:invoiceScope(month,basis)},
  ...(permissions.payroll&&permissions.expenses&&basis==='cash'?[{label:'cashSurplus',value:metrics?.cashSurplusCents,hint:F2('cashSurplusShortHint')}]:[]),
 ];
 const tuitionMetrics:Metric[]=[
  {label:'issuedAmount',value:metrics?.issuedCents,kind:'invoices',hint:invoiceScope(month,basis)},
  {label:'received',value:metrics?.receivedCents,kind:'receivedPayments'},
  ...(basis!=='cash'?[{label:'settledAmount',value:metrics?.settledCents,kind:'invoices' as const,hint:F2('settledHint')}]:[]),
  ...(permissions.prepayments&&summary?.capabilities.prepayments?[{label:'prepaymentBalance',value:metrics?.prepaymentBalanceCents,kind:'prepaymentBalances' as const,hint:F2('prepaymentBalanceHint')},...(basis!=='cash'?[{label:'prepaymentApplied',value:metrics?.prepaymentAppliedCents,kind:'prepaymentSettlements' as const,hint:F2('prepaymentSettlementHint')}]:[])]:[]),
  {label:'refunds',value:metrics?.refundedCents,kind:'refunds'},
  {label:'paymentReversals',value:metrics?.reversedCents,kind:'paymentReversals'},
 ];
 const reminders=(summary?.reminders||[]).filter(item=>permissions.payroll||!payrollKinds.includes(reminderKind[item.key]));
 const activeReminders=reminders.filter(item=>item.count>0),otherReminders=reminders.filter(item=>item.count===0);
 const detailTotal=(query&&debtKinds.includes(query.kind))||query?.kind==='unpaidPayroll'?detail?.totals?.remainingCents:detail?.totals?.amountCents;
 function metricLines(items:Metric[]){
  return <dl className="finance2-metric-lines">{items.map(metric=><div className="finance2-metric-line" key={metric.label}>
   <dt><span>{F2(metric.label)}</span>{metric.hint&&<small className="finance2-muted">{metric.hint}</small>}</dt>
   <dd><strong>{financeMoney(metric.value)}</strong>{metric.kind&&metric.value!=null&&<Button variant="outline" type="button" onClick={()=>changeKind(metric.kind!)} aria-label={F2(metric.label)+' · '+F2('details')}>{F2('details')}</Button>}</dd>
  </div>)}</dl>;
 }
 function reminderRows(items:typeof reminders){
  return <div className="finance2-reminder-list">{items.map(reminder=><article className="finance2-reminder" key={reminder.key}>
   <div><h3>{F2(reminderLabel[reminder.key]||reminder.key)}</h3><span className="finance2-reminder-count">{F2('taskCount').replace('{count}',String(reminder.count))}</span></div>
   {reminderKind[reminder.key]&&<Button variant="outline" type="button" onClick={()=>changeKind(reminderKind[reminder.key])} aria-label={F2(reminderLabel[reminder.key]||reminder.key)+' · '+F2('details')}>{compactLabel('查看','View')}</Button>}
  </article>)}</div>;
 }
 return <div className="finance2-workspace finance2-overview" data-testid="finance-overview">
 <div className="finance-overview-home" hidden={Boolean(query)}>
  <section className="panel finance-overview-controls">
   <div className="finance2-filters finance-overview-toolbar">
    <label>{F2('month')}<input type="month" value={month} onChange={event=>{if(/^20\d\d-(0[1-9]|1[0-2])$/.test(event.target.value)){setMonth(event.target.value);setQuery(null);}}}/></label>
    <label>{F2('basis')}<select value={basis} onChange={event=>{setBasis(event.target.value as FinanceBasis);setQuery(null);}}>{(['cash','service','issued'] as const).map(value=><option key={value} value={value}>{F2(value)}</option>)}</select></label>
   </div>
   <div className="finance-overview-controls-actions">
   <details className="finance-overview-help"><summary>{compactLabel('怎么算？','How is this calculated?')}</summary><div>
    <p>{F2(basis==='cash'?'cashHint':basis==='service'?'serviceHint':'issuedHint')}</p>
    <p>{F2('dimensionHint')}</p>
    <p>{F2('netReceived')}：{F2('netReceiptFormula')}</p>
    <p>{F2('remaining')} / {F2('overdue')}：{invoiceScope(month,basis)}</p>
    {permissions.payroll&&permissions.expenses&&<p>{F2('cashSurplusHint')}</p>}
   </div></details>
    <Button className="finance-overview-refresh" type="button" variant="outline" disabled={loading} onClick={()=>setVersion(v=>v+1)}>{F2('refresh')}</Button>
   </div>
  </section>
  {loading?<p role="status" className="finance2-loading">{F2('loading')}</p>:failed?<div className="finance2-error-state"><p>{F2('loadFailed')}</p><Button variant="outline" onClick={()=>setVersion(v=>v+1)}>{F2('reload')}</Button></div>:summary&&<>
   <section className="finance2-core" aria-labelledby="finance2-core-title">
    <div className="finance2-section-head"><h2 id="finance2-core-title">{F2('coreSummary')}</h2><span className="finance2-scope">{month} · {F2(basis)}</span></div>
    <dl className="finance2-kpis finance2-core-kpis">{coreMetrics.map(metric=><div className="finance2-kpi" key={metric.label}>
     <dt>{F2(metric.label)}</dt><dd><strong>{financeMoney(metric.value)}</strong></dd>
     {['remaining','overdue'].includes(metric.label)&&<small className="finance-overview-metric-scope">{compactLabel(basis==='service'?'本月课程 · 当前欠款':'本月开单 · 当前欠款',basis==='service'?'This service month · current balance':'Issued this month · current balance')}</small>}
     {metric.label==='cashSurplus'&&<small className="finance-overview-metric-scope">{compactLabel('已登记现金 · 非利润','Recorded cash · not profit')}</small>}
     {metric.value==null&&metric.label!=='cashSurplus'&&<small className="finance2-muted">{F2('metricUnavailable')}</small>}
     {metric.kind&&metric.value!=null&&<Button className="finance-overview-kpi-link" variant="ghost" type="button" onClick={()=>changeKind(metric.kind!)} aria-label={F2(metric.label)+' · '+F2('details')}>{compactLabel('查看明细 →','View details →')}</Button>}
    </div>)}</dl>
   </section>
   <section className="panel finance-overview-tasks" aria-labelledby="finance2-reminders-title">
    <div className="finance2-section-head"><h2 id="finance2-reminders-title">{F2('reminders')}</h2><span className="finance2-scope">{month}</span></div>
    {activeReminders.length?reminderRows(activeReminders):<p className="finance-overview-no-tasks">{compactLabel('本月暂无待处理事项','No action required for this month')}</p>}
    <details className="finance-overview-help"><summary>{compactLabel('全部类别与范围','All categories & scope')}</summary><div><p>{F2('reminderScopeHint')}</p>{reminderRows(otherReminders)}</div></details>
   </section>
   <details className="panel finance-overview-section">
    <summary><h2 id="finance2-tuition-title">{F2('tuitionCollections')}</h2><span className="finance2-scope">{compactLabel('收款、退款与欠费','Receipts, refunds & balances')}</span></summary>
    <div className="finance-overview-section-body">
    {metricLines(tuitionMetrics)}
    {permissions.prepayments&&summary.capabilities.prepayments&&<div className="finance2-actions"><Button variant="outline" onClick={()=>changeKind('prepaymentCash',month,'cash')}>{F2('prepaymentCash')}</Button><Button variant="outline" onClick={()=>changeKind('prepaymentSettlements')}>{F2('prepaymentSettlements')}</Button></div>}
    <div className="finance2-debt-tools"><div><h3>{F2('allMonthDebtTitle')}</h3><p className="finance2-muted">{F2('allMonthDebtScope')}</p></div><div className="finance2-actions"><Button variant="outline" type="button" onClick={()=>changeKind('arrearsAll')}>{F2('allMonthArrears')}</Button><Button variant="outline" type="button" onClick={()=>changeKind('overdueAll')}>{F2('allMonthOverdue')}</Button></div></div>
    </div>
   </details>
   {(permissions.payroll||permissions.expenses)&&<details className="panel finance-overview-section"><summary><h2>{compactLabel('薪资与支出','Pay & expenses')}</h2><span className="finance2-scope">{month}</span></summary><div className="finance-overview-section-body finance2-outflow-grid">
    {permissions.payroll&&<section className="panel" aria-labelledby="finance2-pay-title">
     <div className="finance2-section-head"><h2 id="finance2-pay-title">{F2('payroll')}</h2></div>
     {basis==='issued'?<p className="finance2-notice">{F2('payrollIssuedUnavailable')}</p>:metricLines([{label:'salaryDue',value:metrics?.payrollOwedCents,kind:'unpaidPayroll',hint:month+' · '+F2('service')},{label:'salaryPaid',value:metrics?.payrollPaidCents,kind:'payrollCash',hint:month+' · '+F2(basis)}])}
     <details className="finance-overview-help"><summary>{compactLabel('薪资统计说明','Pay reporting notes')}</summary><div><p>{F2('payrollCashHint')}</p></div></details>
    </section>}
    {permissions.expenses&&<section className="panel" aria-labelledby="finance2-expenses-title">
     <div className="finance2-section-head"><h2 id="finance2-expenses-title">{F2('expensePaid')}</h2></div>
     {basis!=='cash'?<p className="finance2-notice">{F2('expenseCashOnly')}</p>:metricLines([{label:'expensePaid',value:metrics?.expensesCents,kind:'expenseCash',hint:month+' · '+F2('cash')}])}
    </section>}
   </div></details>}
   {summary.trend.length>0&&<details className="panel finance-overview-section">
    <summary><h2 id="finance2-trend-title">{F2('trend')}</h2><span className="finance2-scope">{F2(basis)}</span></summary>
    <div className="finance-overview-section-body">
    <details className="finance-overview-help"><summary>{compactLabel('统计范围','Reporting scope')}</summary><div><p>{F2('trendScopeHint')}</p></div></details>
    <div className="finance2-trend">{summary.trend.map(item=><div className="finance2-trend-row" key={item.month}>
     <strong>{item.month}</strong><div className="finance2-trend-values"><span>{F2('netReceived')}</span><strong>{financeMoney(item.netReceivedCents)}</strong></div>
     <Button type="button" variant="outline" onClick={()=>changeKind('payments',item.month,basis)} aria-label={item.month+' · '+F2('netReceiptDetails')}>{F2('details')}</Button>
    </div>)}</div>
    </div>
   </details>}
  </>}
  {permissions.export&&<details className="panel finance-overview-section">
   <summary><h2>{F2('exports')}</h2><span className="finance2-scope">{month} · {F2(basis)}</span></summary>
   <div className="finance-overview-section-body"><div className="finance2-export-controls"><label>{F2('exportKind')}<select value={exportKind} onChange={event=>setExportKind(event.target.value as ExportKind)}>{(['invoices','payments','arrears',...(permissions.payroll?['payroll']:[]),...(permissions.expenses?['expenses']:[])] as ExportKind[]).map(value=><option key={value} value={value}>{F2('export'+value[0].toUpperCase()+value.slice(1))}</option>)}</select></label><FinanceCsvButton params={{kind:exportKind,month,basis}}/></div>
   <p className="finance2-muted">{F2('exportHint')}</p></div>
  </details>}
 </div>
  {query&&(!['prepaymentCash','prepaymentSettlements','prepaymentBalances'].includes(query.kind)||permissions.prepayments)&&(!payrollKinds.includes(query.kind)||permissions.payroll)&&(!['expenses','expenseCash'].includes(query.kind)||permissions.expenses)&&<section className="panel finance2-drilldown" aria-busy={detailLoading} aria-labelledby="finance2-detail-title">
   <div className="finance2-section-head"><div><h2 ref={detailHeading} tabIndex={-1} id="finance2-detail-title">{F2(detailLabels[query.kind])}</h2><p className="finance2-scope">{detailScope(query)}</p></div><Button type="button" variant="outline" onClick={closeDetails}>{compactLabel('返回总览','Back to overview')}</Button></div>
   {query.kind==='prepaymentBalances'&&<p className="finance2-notice">{F2('prepaymentBalanceHint')}</p>}
   {query.kind==='prepaymentSettlements'&&<p className="finance2-notice">{F2('prepaymentSettlementHint')}</p>}
   {query.kind==='prepaymentCash'&&<p className="finance2-notice">{F2('prepaymentCashOnly')}</p>}
   {query.kind==='payments'&&<p className="finance2-notice">{F2('netReceiptDetailHint')}</p>}
   {query.kind==='unbilled'&&<p className="finance2-notice">{F2('unbilledDetailHint')}</p>}
   {query.kind==='pendingChanges'&&<p className="finance2-notice">{F2('pendingChangeDetailHint')}</p>}
   {query.kind==='monthlyPayReviews'&&<p className="finance2-notice">{F2('monthlyReviewDetailHint')}</p>}
   {serviceKinds.includes(query.kind)&&<div className="finance2-filters finance2-spaced-actions">
    <label>{F2('teacher')}<select value={query.teacher} disabled={!options} onChange={event=>detailFilter('teacher',event.target.value)}><option value="">{F2('allTeachers')}</option>{options?.teachers.map(item=><option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
    <label>{F2('subject')}<select value={query.subject} disabled={!options} onChange={event=>detailFilter('subject',event.target.value)}><option value="">{F2('allSubjects')}</option>{options?.subjects.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
    <label>{F2('classroom')}<select value={query.classroomId} disabled={!options} onChange={event=>detailFilter('classroomId',event.target.value)}><option value="">{F2('allClasses')}</option>{options?.classrooms.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
   </div>}
   {detailLoading?<p role="status" className="finance2-loading">{F2('loading')}</p>:detailFailed?<div className="finance2-error-state finance2-spaced-actions"><p>{F2('loadFailed')}</p><Button variant="outline" onClick={()=>setVersion(v=>v+1)}>{F2('reload')}</Button></div>:detail&&<>
    <div className="finance2-detail-summary">
     <span>{F2('total').replace('{count}',String(detail.total))}</span>
     {detailTotal!=null&&<strong>{F2(query.kind==='unpaidPayroll'?'unpaidAmount':debtKinds.includes(query.kind)?'remaining':'filterAmountTotal')} · {financeMoney(detailTotal)}</strong>}
     {detail.totals?.durationSeconds!=null&&<span>{F2(query.kind==='unbilled'?'unbilledDurationTotal':'filterDurationTotal')} · {formatDurationSeconds(detail.totals.durationSeconds,getLanguage())}</span>}
    </div>
    <div className="finance2-records">{!detail.items.length?<p className="finance2-empty">{F2('empty')}</p>:detail.items.map(row=><article className="finance2-record" key={row.id}>
     <div className="finance2-record-head"><h3>{row.label}</h3><span className="finance2-badge" data-status={row.status}>{rowStatus(row,query.kind)}</span></div>
     <dl>
      <div><dt>{F2(query.kind==='pendingChanges'?'originalStart':'date')}</dt><dd>{financeDate(query.kind==='pendingChanges'?row.originalStart||row.date:row.date,true)}</dd></div>
      {query.kind==='pendingChanges'&&row.originalEnd&&<div><dt>{F2('originalEnd')}</dt><dd>{financeDate(row.originalEnd,true)}</dd></div>}
      {row.month&&<div><dt>{F2('period')}</dt><dd>{row.month}</dd></div>}
      {row.subject&&<div><dt>{F2('subject')}</dt><dd>{row.subject}</dd></div>}
      {row.teacher&&<div><dt>{F2('teacher')}</dt><dd>{row.teacher}</dd></div>}
      {row.classroom&&<div><dt>{F2('classroom')}</dt><dd>{row.classroom}</dd></div>}
      {row.proposedStart&&<div><dt>{F2('proposedStart')}</dt><dd>{financeDate(row.proposedStart,true)}</dd></div>}
      {row.proposedEnd&&<div><dt>{F2('proposedEnd')}</dt><dd>{financeDate(row.proposedEnd,true)}</dd></div>}
      {row.durationSeconds!=null&&<div><dt>{F2('duration')}</dt><dd>{formatDurationSeconds(row.durationSeconds,getLanguage())}</dd></div>}
      {row.method&&<div><dt>{F2('method')}</dt><dd>{F2(row.method==='cash'?'cashMethod':row.method)}</dd></div>}
      {row.reference&&<div><dt>{F2('reference')}</dt><dd>{row.reference}</dd></div>}
      {row.amountCents!=null&&<div><dt>{F2('amount')}</dt><dd>{financeMoney(row.amountCents)}</dd></div>}
      {row.remainingCents!==undefined&&<div><dt>{F2(query.kind==='unpaidPayroll'?'unpaidAmount':'remaining')}</dt><dd>{financeMoney(row.remainingCents)}</dd></div>}
     </dl>
     {row.reason&&<p className="finance2-muted">{F2('reason')} · {row.reason}</p>}
     {row.invoiceId&&permissions.invoices!==false?<div className="finance2-actions"><Button type="button" variant="outline" onClick={()=>onInvoice(row.invoiceId!)}>{F2('openInvoice')}</Button></div>:row.payrollId&&permissions.payroll?<div className="finance2-actions"><Button type="button" variant="outline" onClick={()=>onPayroll(row.payrollId!)}>{F2('openPayroll')}</Button></div>:query.kind==='monthlyPayReviews'&&permissions.payroll&&onPayrollMonth?<div className="finance2-actions"><Button type="button" variant="outline" onClick={()=>onPayrollMonth(row.month||query.month)}>{F2('openMonthPayroll')}</Button></div>:null}
    </article>)}</div>
    <FinancePagination page={detail.page} pages={detail.pages} onChange={page=>replaceQuery(current=>current?{...current,page}:null)}/>
   </>}
  </section>}
 </div>;
}
