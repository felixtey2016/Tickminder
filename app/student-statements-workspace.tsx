"use client";
import {MonthInput} from '@/components/month-input';
import {useEffect,useState,type ReactNode} from 'react';
import {Button} from '@/components/ui/button';
import {alertActionFailure} from '@/lib/action-feedback';
import {completeStudentStatement,statementMonthOffset,type StudentStatement,type StudentStatementPage} from '@/lib/student-statements';
import type {PrepaymentList,PrepaymentStudent,PrepaymentAccountSummary} from '@/lib/prepayments';
import {financeGet,financeMoney,financeMonth,FinancePagination,FinanceModal} from './finance-round2-shared';
import StudentAdvanceDialog,{type StudentAdvancePermissions} from './student-advance-dialog';
import {PrepaymentLoadState,usePrepaymentResource} from './prepayments-ui-shared';
import {FinanceHelp,financeLabel as L} from './finance-layout-tools';
import './student-statements.css';

function StatementStudentPicker({value,onChange,monthControl,refreshVersion,onAdvance}:{value:PrepaymentStudent|null;onChange:(student:PrepaymentStudent)=>void;monthControl:ReactNode;refreshVersion:number;onAdvance?:(student:PrepaymentStudent)=>void}){
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[version,setVersion]=useState(0);
 useEffect(()=>{const timer=setTimeout(()=>{setSearch(query.trim());setPage(1);},250);return()=>clearTimeout(timer);},[query]);
 const {data,loading,failed}=usePrepaymentResource<PrepaymentList<PrepaymentStudent>>({view:'students',q:search,page:String(page)},version+refreshVersion);
 return <div className="statement-student-picker">
  <div className="statement-filters">{monthControl}<label>{L('搜索学生姓名','Search student name')}<input type="search" value={query} onChange={event=>setQuery(event.target.value)}/></label></div>
  <PrepaymentLoadState loading={loading} failed={failed} onRetry={()=>setVersion(n=>n+1)}>{data&&<>
   {data.items.length>0&&<div className="statement-student-cards">{data.items.map(item=><article key={item.studentId} data-selected={value?.studentId===item.studentId}><Button className="statement-student-name" type="button" variant="ghost" aria-pressed={value?.studentId===item.studentId} onClick={()=>onChange(item)}><strong>{item.student}</strong><span>{L('查看余额','View balance')} ›</span></Button>{onAdvance&&<div className="finance2-actions"><Button type="button" variant="outline" onClick={()=>onAdvance(item)}>{L('提前收款','Advance payment')}</Button></div>}</article>)}</div>}
   {!data.items.length&&<p className="finance2-empty">{L('没有找到学生','No students found')}</p>}
   {data.pages>1&&<FinancePagination page={data.page} pages={data.pages} disabled={loading} onChange={setPage}/>}
  </>}</PrepaymentLoadState>
  <p className="statement-selection-hint">{L('点选学生查看可用余额、待缴和待核对。','Select a student to view the available balance, amount due and records needing review.')}</p>
 </div>;
}

type Props={scopeKey:string;canCreateInvoice?:boolean;canRecordInvoice?:boolean;prepaymentPermissions:StudentAdvancePermissions;onInvoice:(studentId:string,month:string,studentName:string,action?:'create'|'list',billingScope?:'monthly'|'hourly')=>void;onTuition:()=>void};
export default function StudentStatementsWorkspace({scopeKey,canCreateInvoice=false,canRecordInvoice=false,prepaymentPermissions,onInvoice,onTuition}:Props){
 const [student,setStudent]=useState<PrepaymentStudent|null>(null),[choosing,setChoosing]=useState(true),[month,setMonth]=useState(financeMonth),[version,setVersion]=useState(0);
 const [advance,setAdvance]=useState<{student:PrepaymentStudent;kind?:'request'|'received'}|null>(null),[recordStudent,setRecordStudent]=useState<PrepaymentStudent|null>(null);
 const [result,setResult]=useState<{key:string;statement:StudentStatement}|null>(null),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[checked,setChecked]=useState(0);
 const studentId=student?.studentId||'',key=JSON.stringify([scopeKey,studentId,month,version]);
 const account=usePrepaymentResource<PrepaymentAccountSummary>(studentId?{view:'account',studentId}:null,version);
 const canAdvance=prepaymentPermissions.view&&(prepaymentPermissions.manage||prepaymentPermissions.record);
 const invoiceFor=(item:PrepaymentStudent,action:'create'|'list'='list')=>onInvoice(item.studentId,month,item.student,action,action==='create'?(account.data?.hasMonthly?'monthly':'hourly'):undefined);
 useEffect(()=>{
  setResult(null);setFailed(false);setChecked(0);
  if(!studentId){setLoading(false);return;}
  const controller=new AbortController();setLoading(true);
  void (async()=>{
   const pages:StudentStatementPage[]=[],seen=new Set<string>();let before:string|null=null,token='';
   do{
    const params:URLSearchParams=new URLSearchParams({studentId,month,...(before?{before,token}:{})});
    const page:StudentStatementPage=await financeGet<StudentStatementPage>('/api/student-statements?'+params,controller.signal);
    if(controller.signal.aborted)return;
    pages.push(page);token=pages[0].token;before=page.nextBefore;
    setChecked(pages.reduce((n,item)=>n+item.rows.length,0));
    if(before){if(seen.has(before))throw Error(L('月份资料发生变化，请刷新重试','Statement history changed. Refresh and try again.'));seen.add(before);}
   }while(before);
   const statement=completeStudentStatement(pages);
   if(!controller.signal.aborted)setResult({key,statement});
  })().catch(error=>{if(!controller.signal.aborted){setFailed(true);alertActionFailure(error);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[key,studentId,month]);
 const data=result?.key===key?result.statement:null;
 const status=data?data.status==='review'?L('待核对','Needs review'):data.status==='in_progress'?L('本月暂计','Month in progress'):L('按已确认记录结算','Reconciled records'):'';
 const signed=(value:number)=>value<0?L('欠款 ','Owing ')+financeMoney(-value):value>0?L('结余 ','Credit ')+financeMoney(value):financeMoney(0);
 const monthControl=<label className="statement-month">{L('结算月份','Statement month')}<MonthInput type="month" value={month} min="2000-01" max={financeMonth()} onChange={event=>{if(/^20\d\d-(0[1-9]|1[0-2])$/.test(event.target.value)&&event.target.value<=financeMonth())setMonth(event.target.value);}}/></label>;
 return <div className="finance2-workspace student-statements-workspace" data-testid="student-statements-workspace">
  <section className="panel statement-selection">
   <div className="finance2-section-head"><h2>{L('学生学费','Student tuition')}</h2><Button type="button" variant="outline" disabled={loading} onClick={()=>setVersion(n=>n+1)}>{L('刷新','Refresh')}</Button></div>
   {student&&<div className="statement-student"><strong>{student.student}</strong><Button type="button" variant="outline" aria-expanded={choosing} onClick={()=>setChoosing(value=>!value)}>{L('选择学生','Choose student')}</Button></div>}
   {(choosing||!student)?<StatementStudentPicker value={student} onChange={value=>{setStudent(value);setChoosing(false);}} monthControl={monthControl} refreshVersion={version} onAdvance={canAdvance?value=>setAdvance({student:value}):undefined}/>:<>{monthControl}<div className="finance2-actions statement-primary-actions">{canCreateInvoice&&<Button type="button" variant="outline" onClick={()=>invoiceFor(student,'create')}>{L('开单','Create invoice')}</Button>}{(canRecordInvoice||prepaymentPermissions.record&&account.data?.advanceEligible)&&<Button type="button" variant="outline" onClick={()=>setRecordStudent(student)}>{L('登记收款','Record payment')}</Button>}{canAdvance&&<Button type="button" onClick={()=>setAdvance({student})}>{L('提前收款','Advance payment')}</Button>}</div></>}
  </section>
  {studentId&&<section className="panel statement-current-account" aria-label={L('当前学生账户','Current student account')}><PrepaymentLoadState loading={account.loading} failed={account.failed} onRetry={()=>setVersion(value=>value+1)}>{account.data&&<><dl className="statement-account-kpis"><div><dt>{L('可用余额','Available balance')}</dt><dd>{account.data.availableBalanceCents===null?L('待核对','Needs review'):financeMoney(account.data.availableBalanceCents)}</dd></div><div><dt>{L('账单待缴','Invoices due')}</dt><dd>{data?financeMoney(data.invoiceDueCents):'—'}</dd></div><div><dt>{L('待核对','Needs review')}</dt><dd>{Math.max(account.data.pendingCount,(data?.pendingCount||0)+(data?.changedInvoiceCount||0))}{L(' 项',' records')}</dd></div></dl><p className="finance2-muted">{L('已确认小时学费占用','Confirmed hourly tuition held')} · {financeMoney(account.data.heldHourlyCents)}</p>{account.data.reviewRequired&&<p className="finance2-notice" role="status">{L('有未核对费用，暂不显示可用余额；先核对课程与收费记录。','Some charges need review. The available balance is withheld until the lessons and fee records are checked.')}</p>}<p className="statement-selection-hint">{L('可用余额用于小时学费。固定月费直接在账单收款；月结净额仅供核对，不作为钱包余额。','Available balance is for hourly tuition. Monthly tuition is paid directly against invoices. The statement net is for reconciliation and is not the wallet balance.')}</p></>}</PrepaymentLoadState></section>}
  {studentId&&(loading||!data&&!failed)&&<section className="panel" role="status" aria-live="polite"><p>{L('正在核对收款与课程…','Checking payments and lessons…')}{checked>0&&<> · {checked} {L('个月','months')}</>}</p></section>}
  {failed&&!loading&&<section className="panel"><p>{L('暂时无法完成核对，请刷新重试。','The statement could not be completed. Please refresh and try again.')}</p><Button type="button" variant="outline" onClick={()=>setVersion(n=>n+1)}>{L('重试','Retry')}</Button></section>}
  {data&&<>
   <details className="panel statement-summary" aria-label={L('月结与结转','Monthly balance and carry-forward')}>
    <summary className="finance2-section-head"><h3>{month} · {L('月结','Monthly statement')}</h3><span className="finance2-badge" data-status={data.status}>{status}</span></summary><div className="statement-month-details">
    <dl className="statement-ledger">
     <div><dt>{L('月初结转','Opening balance')}</dt><dd>{signed(data.openingCents)}</dd></div>
     <div><dt>{L('本月收款','Payments received')}</dt><dd>+ {financeMoney(data.receivedCents)}</dd></div>
     {data.refundedCents>0&&<div><dt>{L('本月退款','Refunds')}</dt><dd>− {financeMoney(data.refundedCents)}</dd></div>}
     {data.reversedCents>0&&<div><dt>{L('撤销误登记收款','Payment reversals')}</dt><dd>− {financeMoney(data.reversedCents)}</dd></div>}
     <div><dt>{L('本月已确认费用','Confirmed tuition')}</dt><dd>− {financeMoney(data.chargeCents)}</dd></div>
    </dl>
    <div className="statement-closing"><span>{data.status==='reconciled'?L('下月结转','Carry forward'):L('下月结转（暂计）','Carry forward (provisional)')} · {statementMonthOffset(month,1)}</span><strong>{signed(data.closingCents)}</strong></div>
    {data.status==='review'&&<p className="finance2-notice" role="status">{L('仍有记录待核对，结余暂不能作为最终可用余额。','Some records need review. Credit is provisional until they are resolved.')}</p>}
    {data.status==='in_progress'&&<p className="finance2-muted">{L('本月尚未结束；后续课程与收款会继续更新。','This month is in progress. Later lessons and payments will update this balance.')}</p>}
    <div className="finance2-actions"><Button type="button" variant="outline" onClick={()=>onInvoice(studentId,month,data.student.name,'list')}>{L('查看账单','View invoices')}</Button>{data.status==='review'&&<Button type="button" variant="outline" onClick={onTuition}>{L('核对课程费用','Review tuition')}</Button>}</div></div>
   </details>
   <section className="panel">
    <FinanceHelp title={L('月份明细与核对','Monthly details and review')}>
     <p>{L('按当前记录自动重算。漏考勤、费率缺失和已开单课程变动须先核对；原账单和收据保留。','Recalculated from current records. Missing attendance, pricing gaps and changed invoiced lessons need review. Original invoices and receipts are retained.')}</p>
     <div className="statement-history">{data.months.map(row=><article key={row.month}><div><strong>{row.month}</strong><span>{L('费用','Charges')} · {financeMoney(row.chargeCents)}</span></div><p>{L('已开单','Invoiced')} {financeMoney(row.invoiceCents)} · {L('未开单已确认','Confirmed, unbilled')} {financeMoney(row.unbilledCents)}</p>{(row.pendingCount>0||row.changedInvoiceCount>0)&&<p className="statement-review">{row.pendingCount>0&&<span>{L('待核对记录','Pending records')} {row.pendingCount}</span>}{row.changedInvoiceCount>0&&<span>{L('账单课程有变动','Changed invoiced lessons')} {row.changedInvoiceCount}</span>}</p>}<Button type="button" variant="outline" onClick={()=>onInvoice(studentId,row.month,data.student.name,'list')}>{L('查看账单','View invoices')}</Button></article>)}</div>
    </FinanceHelp>
    <FinanceHelp title={L('收款与余额说明','Payments and balance details')}>
     <p>{L('管理员登记实际到账金额；旧收款自动沿用。预收款抵扣属于内部结算，不会重复计作收款。','Record the actual payment received. Existing payments are included automatically. Allocations do not count as new cash received.')}</p>
     <dl className="statement-ledger"><div><dt>{L('当前未抵扣预收款','Current unallocated prepayments')}</dt><dd>{financeMoney(data.walletBalanceCents)}</dd></div><div><dt>{L('当前账单尚欠','Current invoice amount due')}</dt><dd>{financeMoney(data.invoiceDueCents)}</dd></div><div><dt>{L('当前账单多付','Current invoice credits')}</dt><dd>{financeMoney(data.invoiceCreditCents)}</dd></div></dl>
     <p>{L('以上是当前单据余额。月结净额包含未开单课程，不会自动修改原账单、抵扣或退款。','These are current document balances. The monthly net also includes unbilled tuition; it does not alter invoices, allocate money or issue refunds.')}</p>
    </FinanceHelp>
   </section>
  </>}
  {recordStudent&&<FinanceModal title={L('登记收款','Record payment')} onClose={()=>setRecordStudent(null)}><p><strong>{recordStudent.student}</strong></p><p>{L('选择这笔到账的用途。固定月费及已开账单直接登记到对应账单；小时学费预存款加入余额。','Choose what this payment covers. Record monthly tuition and invoice payments against their invoice. Hourly tuition deposits add to the balance.')}</p><div className="finance2-actions">{canRecordInvoice&&<Button type="button" onClick={()=>{invoiceFor(recordStudent);setRecordStudent(null);}}>{L('支付账单 / 月费','Pay invoice / monthly tuition')}</Button>}{prepaymentPermissions.record&&account.data?.advanceEligible&&<Button type="button" variant="outline" onClick={()=>{setAdvance({student:recordStudent,kind:'received'});setRecordStudent(null);}}>{L('小时学费充值','Hourly tuition deposit')}</Button>}</div></FinanceModal>}
  {advance&&<StudentAdvanceDialog student={advance.student} initialKind={advance.kind} initialMonth={month} permissions={prepaymentPermissions} onClose={()=>{setAdvance(null);setVersion(value=>value+1);}} onSaved={()=>setVersion(value=>value+1)} onMonthlyInvoice={selectedMonth=>{onInvoice(advance.student.studentId,selectedMonth,advance.student.student,canCreateInvoice?'create':'list','monthly');setAdvance(null);}}/>}
 </div>;
}
