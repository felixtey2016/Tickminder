"use client";
import {useRef,useState,type FormEvent} from 'react';
import {DateInput,DateTimeInput} from '@/components/date-time-input';
import {Button} from '@/components/ui/button';
import {MonthInput} from '@/components/month-input';
import {PAYMENT_METHODS,type PaymentMethod} from '@/lib/invoice-finance';
import type {PrepaymentAccountSummary,PrepaymentPreview,PrepaymentOverview,PrepaymentResult,PrepaymentRequestDetail,PrepaymentReceiptDocument} from '@/lib/prepayments';
import {P} from '@/lib/prepayments-i18n';
import {financeCents,financeGet,financeInstant,financeMoney,financeMonth,financePost,FinanceModal,localFinanceTime,type PendingOperation} from './finance-round2-shared';
import {PrepaymentPrintButton,PrepaymentLoadState,prepaymentUrl,usePrepaymentResource} from './prepayments-ui-shared';
import {financeLabel as L} from './finance-layout-tools';
import './finance-student-flow.css';

export type StudentAdvancePermissions={view:boolean;manage:boolean;record:boolean};
type AdvanceStudent={studentId:string;student:string};
type Attempt={kind:'request'|'received';basis:'planned'|'amount';month:string;sourceHash?:string;amountCents:number;notes:string;dueDate:string;paidAt:string;method:PaymentMethod;reference:string;saved?:PrepaymentResult;issued?:PrepaymentResult;paymentBody?:Record<string,unknown>;result?:PrepaymentResult};

/** A student's direct action stays in the tuition page; the student cannot change mid-payment. */
export default function StudentAdvanceDialog({student,permissions,initialKind,initialBasis,initialAmountCents,initialMonth,onClose,onSaved,onMonthlyInvoice}:{student:AdvanceStudent;permissions:StudentAdvancePermissions;initialKind?:'request'|'received';initialBasis?:'planned'|'amount';initialAmountCents?:number;initialMonth?:string;onClose:()=>void;onSaved:()=>void;onMonthlyInvoice?:(month:string)=>void}){
 const [kind,setKind]=useState<'request'|'received'>(initialKind==='received'&&permissions.record?'received':permissions.manage?'request':'received');
 const [basis,setBasis]=useState<'planned'|'amount'>(initialBasis||'planned'),[month,setMonth]=useState(initialMonth||financeMonth),[amount,setAmount]=useState(initialAmountCents? (initialAmountCents/100).toFixed(2):''),[notes,setNotes]=useState(''),[dueDate,setDueDate]=useState(''),[when,setWhen]=useState(localFinanceTime),[method,setMethod]=useState<PaymentMethod>('bank_transfer'),[reference,setReference]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[locked,setLocked]=useState(false),[done,setDone]=useState<{kind:'request'|'received';amountCents:number;number?:string;url:string}|null>(null);
 const attempt=useRef<Attempt|null>(null),pending=useRef<PendingOperation>(null);
 const [accountVersion,setAccountVersion]=useState(0),account=usePrepaymentResource<PrepaymentAccountSummary>({view:'account',studentId:student.studentId},accountVersion);
 const preview=usePrepaymentResource<PrepaymentPreview>(basis==='planned'&&account.data?.advanceEligible?{view:'preview',studentId:student.studentId,month,billingMode:'hour'}:null,accountVersion);
 const planned=preview.data?.document.month===month?preview.data:null;
 const canSubmit=permissions.view&&account.data?.advanceEligible===true&&(kind==='request'?permissions.manage:permissions.record)&&(basis==='amount'||Boolean(planned&&!planned.blockers.length&&planned.document.totalCents>0));
 async function submit(event:FormEvent){
  event.preventDefault();if(busy||!canSubmit)return;setError('');
  try{
   if(!attempt.current)attempt.current={kind,basis,month,sourceHash:planned?.document.sourceHash,amountCents:basis==='planned'?planned!.document.totalCents:financeCents(amount),notes:notes.trim(),dueDate,paidAt:kind==='received'?financeInstant(when):'',method,reference:reference.trim()};
   const current=attempt.current;setBusy(true);setLocked(true);
   if(current.kind==='request'||current.basis==='planned'&&permissions.manage){
    if(!current.saved)current.saved=await financePost<PrepaymentResult>('/api/prepayments',{action:'saveRequest',requestKind:current.basis,studentId:student.studentId,...(current.basis==='planned'?{billingMode:'hour',month:current.month,expectedSourceHash:current.sourceHash}:{amountCents:current.amountCents}),notes:current.notes,...(current.dueDate?{dueDate:current.dueDate}:{})},pending);
    if(!current.saved.requestId||current.saved.revision==null)throw Error(L('缴费通知编号缺失，请关闭后核对历史记录。','The payment request reference is missing. Close and check the history.'));
    if(!current.issued)current.issued=await financePost<PrepaymentResult>('/api/prepayments',{action:'issueRequest',requestId:current.saved.requestId,revision:current.saved.revision},pending);
   }
   if(current.kind==='received'){
    if(!current.paymentBody){const overview=await financeGet<PrepaymentOverview>(prepaymentUrl({view:'overview',studentId:student.studentId}));current.paymentBody={action:'recordPayment',balanceMode:'hourly',studentId:student.studentId,revision:overview.balance.revision,amountCents:current.amountCents,paidAt:current.paidAt,method:current.method,reference:current.reference,notes:current.notes,...(current.issued?{requestId:current.issued.requestId||current.saved!.requestId}:{})};}
    if(!current.result)current.result=await financePost<PrepaymentResult>('/api/prepayments',current.paymentBody,pending);
   }else current.result=current.issued;
   if(!current.result)throw Error(P('requestFailed'));
   // The mutation is confirmed before fetching an optional print link. A print failure must not repeat payment.
   const result=current.result;let url='';
   try{if(current.kind==='request'){const detail=await financeGet<PrepaymentRequestDetail>(prepaymentUrl({view:'request',requestId:result.requestId||current.saved!.requestId!}));url=detail.printUrl||detail.request.printUrl;}else if(result.receiptId){const receipt=await financeGet<PrepaymentReceiptDocument>(prepaymentUrl({view:'receipt',receiptId:result.receiptId}));url=receipt.printUrl;}}catch{/* The confirmed record remains available in history. */}
   setDone({kind:current.kind,amountCents:current.amountCents,number:result.number,url});onSaved();
  }catch(reason){
   setError(reason instanceof Error?reason.message:L('操作未完成，请重试。','The action could not be completed. Try again.'));
   // Read/validation failures can be edited. Once a POST is attempted, preserve its body and operation ID.
   if(!pending.current&&!attempt.current?.saved&&!attempt.current?.paymentBody){attempt.current=null;setLocked(false);}
  }finally{setBusy(false);}
 }
 const monthControl=<label>{L('收款月份','Tuition month')}<MonthInput type="month" value={month} disabled={busy||locked} onChange={event=>{if(/^20\d\d-(0[1-9]|1[0-2])$/.test(event.target.value))setMonth(event.target.value);}}/></label>;
 return <FinanceModal title={kind==='received'?L('登记收款','Record payment'):L('提前收款','Advance payment')} busy={busy} onClose={onClose}>
  <p className="student-advance-student"><strong>{student.student}</strong></p>
  {done?<div className="student-advance-result" role="status"><p>{done.kind==='request'?L('缴费通知已生成，尚未登记收款，余额未增加。请打印或保存后交给家长；系统不会自动发送。','Payment request created. No payment has been recorded and the balance has not increased. Print or save it to share with the parent; it is not sent automatically.'):L('实收已登记，已生成收据并增加学生余额。','Payment recorded. A receipt has been created and the student balance increased.')}</p><strong>{financeMoney(done.amountCents)}</strong>{done.number&&<p>{done.number}</p>}<div className="finance2-actions">{done.url&&<PrepaymentPrintButton url={done.url} receipt={done.kind==='received'}/>}<Button type="button" onClick={onClose}>{L('完成','Done')}</Button></div></div>:<PrepaymentLoadState loading={account.loading} failed={account.failed} onRetry={()=>setAccountVersion(value=>value+1)}>{account.data?.advanceEligible!==true?<div className="student-advance-result">{monthControl}<p>{L('该学生目前没有按小时扣费的收费设置。固定月费请开月费账单并在账单登记收款；原预收记录仍保留。','This student has no current hourly tuition rate. Create a monthly invoice and record monthly tuition against it. Existing prepayment records are retained.')}</p><div className="finance2-actions">{onMonthlyInvoice&&<Button type="button" onClick={()=>onMonthlyInvoice(month)}>{L('处理本月账单','Open this month’s invoice')}</Button>}<Button type="button" variant="outline" onClick={onClose}>{P('close')}</Button></div></div>:<form className="student-advance-form" noValidate onSubmit={submit}>
   <fieldset disabled={busy||locked}>{basis==='planned'&&monthControl}
    <label>{L('本次操作','Action')}<select aria-label={L('本次操作','Action')} value={kind} onChange={event=>setKind(event.target.value as 'request'|'received')}>{permissions.manage&&<option value="request">{L('生成缴费通知（未收款）','Create payment request')}</option>}{permissions.record&&<option value="received">{L('登记已收到款项','Record received payment')}</option>}</select></label>
    {basis==='planned'?<PrepaymentLoadState loading={preview.loading||!planned&&!preview.failed} failed={preview.failed} onRetry={()=>setAccountVersion(value=>value+1)}>{planned&&<div className="student-planned-summary"><p>{L('按已排小时课计算','Based on scheduled hourly lessons')}</p><strong>{financeMoney(planned.document.totalCents)}</strong>{planned.document.lines.map((line,index)=><p key={line.subjectKey+':'+index}>{line.subject} · {line.lessonCount} {L('堂','lessons')} · {financeMoney(line.amountCents)}</p>)}{planned.blockers.map(blocker=><p className="finance2-notice" key={blocker}>{P('blocker.'+blocker)}</p>)}</div>}</PrepaymentLoadState>:<label>{P('amount')}<input autoFocus inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)} maxLength={11}/></label>}
    <p className="student-advance-hint">{kind==='request'?L('按本月已排小时课计算，月费不包含在内。缴费通知可打印或保存交给家长，不会自动发送或增加余额；实际到账后才生成收据和余额。','Calculated from this month’s scheduled hourly lessons, excluding monthly tuition. Print or save the request to share with the parent. It is not sent automatically and does not add balance. Record money after it arrives to create a receipt and credit the balance.'):L('用于按小时扣费的学费余额。请核对实际到账金额；固定月费请在对应账单登记收款。','For the tuition balance used by hourly charges. Check the money actually received. Record fixed monthly tuition against its invoice.')}</p>
    {kind==='request'?<label>{P('dueDate')}<DateInput type="date" value={dueDate} onChange={event=>setDueDate(event.target.value)}/></label>:<><label>{P('paidAt')}<DateTimeInput type="datetime-local" value={when} onChange={event=>setWhen(event.target.value)}/></label><label>{P('method')}<select value={method} onChange={event=>setMethod(event.target.value as PaymentMethod)}>{PAYMENT_METHODS.map(value=><option key={value} value={value}>{P('method.'+value)}</option>)}</select></label><label>{P('reference')}<input value={reference} onChange={event=>setReference(event.target.value)} maxLength={160}/></label></>}
    {account.data?.hasMonthly&&onMonthlyInvoice&&<div className="student-advance-hint"><p>{L('此学生也有固定月费，以上金额不包含月费。','This student also has fixed monthly tuition, which is excluded above.')}</p><Button type="button" variant="outline" onClick={()=>onMonthlyInvoice(month)}>{L('处理本月月费','Open monthly tuition invoice')}</Button></div>}
<details className="student-advance-secondary"><summary>{L('其他收款方式','Other collection options')}</summary><Button type="button" variant="outline" onClick={()=>setBasis(value=>value==='planned'?'amount':'planned')}>{basis==='planned'?L('改为手工金额','Enter an amount manually'):L('返回按排课计算','Use scheduled lessons')}</Button></details>
<label>{P('notes')}<textarea value={notes} onChange={event=>setNotes(event.target.value)} maxLength={1000}/></label>
   </fieldset>
   {error&&<div role="alert"><p>{error}</p>{locked&&<p className="student-advance-hint">{L('请重试同一笔操作。金额与学生已锁定，避免重复登记；也可关闭后查看该学生历史记录。','Retry this same operation. The student and amount are locked to prevent duplicate entries. You can also close and check this student’s history.')}</p>}</div>}
   <div className="finance2-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{P('cancel')}</Button><Button type="submit" disabled={busy||!canSubmit}>{busy?P('saving'):locked?L('重试同一笔操作','Retry same operation'):kind==='request'?L('生成缴费通知','Create payment request'):L('确认实收并生成收据','Confirm receipt of payment')}</Button></div>
  </form>}</PrepaymentLoadState>}
 </FinanceModal>;
}
