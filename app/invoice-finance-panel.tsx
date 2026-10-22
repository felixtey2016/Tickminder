"use client";

import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {Button} from '@/components/ui/button';
import {groupFetch} from '@/lib/group-client';
import {alertActionFailure,readApiJson,showActionToast} from '@/lib/action-feedback';
import {getLanguage,t,registerTranslations} from '@/lib/i18n';
import {invoiceFinanceZh,invoiceFinanceEn} from '@/lib/invoice-finance-i18n';
import {PAYMENT_METHODS,type InvoiceFinanceDetail,type InvoicePayment,type PaymentMethod} from '@/lib/invoice-finance';
import './invoice-finance.css';
import InvoiceAttendanceCorrection from './invoice-attendance-correction';

registerTranslations(invoiceFinanceZh,invoiceFinanceEn);
export type InvoiceFinancePermissions={view:boolean;record:boolean;reverse:boolean;refund:boolean;adjust:boolean;void:boolean;correctAttendance?:boolean};
export const noInvoiceFinancePermissions:InvoiceFinancePermissions={view:false,record:false,reverse:false,refund:false,adjust:false,void:false};
type Action='recordPayment'|'reversePayment'|'refund'|'adjust'|'void';
type DialogAction={kind:Action;payment?:InvoicePayment};
type Pending={signature:string;operationId:string}|null;
const F=(key:string)=>t('invoiceFinance.'+key);
export const financeMoney=(cents:number)=>new Intl.NumberFormat(getLanguage()==='zh'?'zh-MY':'en-MY',{style:'currency',currency:'MYR'}).format(cents/100);
const localTime=()=>new Date(Date.now()+8*3600_000).toISOString().slice(0,16);
const stamp=(value:string)=>{const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat(getLanguage()==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d)+' GMT+8':'—';};
function amountCents(value:string){
 if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim()))throw Error(F('invalidAmount'));
 const [whole,part='']=value.trim().split('.'),cents=Number(whole)*100+Number(part.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents<=0||cents>100_000_000)throw Error(F('invalidAmount'));return cents;
}
function isoTime(value:string){const result=new Date(value+':00+08:00');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)||!Number.isFinite(result.getTime()))throw Error(F('invalidTime'));return result.toISOString();}
function ReceiptButton({id}:{id:string}){return <Button type="button" variant="outline" onClick={()=>{const opened=window.open('/api/receipts/'+encodeURIComponent(id)+'/print?'+new URLSearchParams({lang:getLanguage()}),'_blank');if(opened)opened.opener=null;else showActionToast('error',F('printBlocked'));}}>{F('receipt')}</Button>;}

function FinanceActionDialog({action,summary,busy,canCreditInvoice,onClose,onSubmit}:{action:DialogAction;summary:InvoiceFinanceDetail;busy:boolean;canCreditInvoice:boolean;onClose:()=>void;onSubmit:(body:Record<string,unknown>)=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null),[amount,setAmount]=useState(action.kind==='recordPayment'?(summary.remainingCents/100).toFixed(2):action.kind==='refund'&&action.payment?(action.payment.refundableCents/100).toFixed(2):''),[when,setWhen]=useState(localTime),[method,setMethod]=useState<PaymentMethod>('bank_transfer'),[reference,setReference]=useState(''),[notes,setNotes]=useState(''),[reason,setReason]=useState(''),[kind,setKind]=useState<'charge'|'credit'>('credit'),[creditInvoice,setCreditInvoice]=useState(false);
 const needsAmount=['recordPayment','refund','adjust'].includes(action.kind),needsTime=['recordPayment','refund','adjust'].includes(action.kind),needsReason=action.kind!=='recordPayment';
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
 async function submit(event:FormEvent){event.preventDefault();if(busy)return;try{
  const body:Record<string,unknown>={action:action.kind};
  if(needsAmount)body.amountCents=amountCents(amount);
  if(needsReason){if(!reason.trim())throw Error(F('reasonRequired'));body.reason=reason.trim();}
  if(action.payment)body.paymentId=action.payment.id;
  if(needsTime)body[action.kind==='recordPayment'?'paidAt':action.kind==='refund'?'refundedAt':'effectiveAt']=isoTime(when);
  if(action.kind==='recordPayment'||action.kind==='refund'){body.method=method;body.reference=reference.trim();}
  if(action.kind==='adjust')body.kind=kind;
  if(action.kind==='refund')body.creditInvoice=creditInvoice;
  body.notes=notes.trim();await onSubmit(body);
 }catch(error){alertActionFailure(error,'invoiceFinance.requestFailed');}}
 const hint=({recordPayment:'paymentHint',reversePayment:'reverseHint',refund:'refundHint',adjust:'adjustHint',void:'voidHint'} as Record<Action,string>)[action.kind];
 return <dialog ref={dialog} className="invoice-dialog invoice-finance-dialog" aria-labelledby="finance-action-title" onCancel={event=>{if(busy)event.preventDefault();else onClose();}}>
  <div className="invoice-dialog-body"><Button type="button" className="invoice-finance-close" variant="outline" aria-label={F('close')} disabled={busy} onClick={onClose}>×</Button><h3 id="finance-action-title">{F('action.'+action.kind)}</h3><p className="invoice-finance-confirm">{F(hint)}</p>
  {action.payment&&<dl className="invoice-confirm-details"><div><dt>{F('receiptNumber')}</dt><dd>{action.payment.number}</dd></div><div><dt>{F(action.kind==='refund'?'refundable':'amount')}</dt><dd>{financeMoney(action.kind==='refund'?action.payment.refundableCents:action.payment.amountCents)}</dd></div></dl>}
  <form noValidate className="invoice-finance-form" onSubmit={submit}><fieldset disabled={busy}>
   {action.kind==='adjust'&&<label>{F('adjustmentType')}<select value={kind} onChange={e=>setKind(e.target.value as 'charge'|'credit')}><option value="credit">{F('credit')}</option><option value="charge">{F('charge')}</option></select></label>}
   {needsAmount&&<label>{F('amount')}<input autoFocus type="text" inputMode="decimal" maxLength={11} value={amount} onChange={e=>setAmount(e.target.value)}/></label>}
   {needsTime&&<label>{F(action.kind==='recordPayment'?'receivedAt':action.kind==='refund'?'refundedAt':'effectiveAt')}<input type="datetime-local" value={when} onChange={e=>setWhen(e.target.value)}/></label>}
   {(action.kind==='recordPayment'||action.kind==='refund')&&<><label>{F('method')}<select value={method} onChange={e=>setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map(item=><option key={item} value={item}>{F('method.'+item)}</option>)}</select></label><label>{F('reference')}<input maxLength={150} value={reference} onChange={e=>setReference(e.target.value)}/></label></>}
   {needsReason&&<label>{F('reason')}<textarea autoFocus={!needsAmount} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>}
   {action.kind==='refund'&&canCreditInvoice&&<label className="invoice-finance-checkbox"><input type="checkbox" checked={creditInvoice} onChange={e=>setCreditInvoice(e.target.checked)}/><span>{F('creditInvoice')}</span></label>}
   <label>{F('notes')}<textarea maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)}/><small className="invoice-finance-muted">{F('internalHint')}</small></label>
  </fieldset><div className="invoice-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{F('cancel')}</Button><Button type="submit" variant={['void','reversePayment'].includes(action.kind)?'destructive':'default'} disabled={busy}>{F(busy?'saving':'confirm')}</Button></div></form></div>
 </dialog>;
}

function Pagination({page,pages,onChange,loading}:{page:number;pages:number;onChange:(page:number)=>void;loading:boolean}){if(pages<=1)return null;return <div className="invoice-finance-pagination"><Button type="button" variant="outline" disabled={page<=1||loading} onClick={()=>onChange(page-1)}>{F('previous')}</Button><p>{F('page').replace('{page}',String(page)).replace('{pages}',String(pages))}</p><Button type="button" variant="outline" disabled={page>=pages||loading} onClick={()=>onChange(page+1)}>{F('next')}</Button></div>;}

export default function InvoiceFinancePanel({invoiceId,permissions=noInvoiceFinancePermissions,onChanged,children}:{invoiceId:string;permissions?:InvoiceFinancePermissions;onChanged?:()=>void;children?:ReactNode}){
 const [detail,setDetail]=useState<InvoiceFinanceDetail|null>(null),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[page,setPage]=useState(1),[paymentPage,setPaymentPage]=useState(1),[version,setVersion]=useState(0),[action,setAction]=useState<DialogAction|null>(null),[busy,setBusy]=useState(false);
 const pending=useRef<Pending>(null);
 useEffect(()=>{
  if(!permissions.view)return;const controller=new AbortController();setLoading(true);setFailed(false);
  void groupFetch('/api/invoice-finance?'+new URLSearchParams({invoiceId,page:String(page),paymentPage:String(paymentPage)}),{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await readApiJson<InvoiceFinanceDetail&{error?:string}>(response);if(!response.ok)throw Error(t(data.error||'invoiceFinance.requestFailed'));return data;}).then(data=>{if(!controller.signal.aborted)setDetail(data);}).catch(error=>{if(!controller.signal.aborted){setFailed(true);setDetail(null);alertActionFailure(error,'invoiceFinance.loadFailed');}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[invoiceId,permissions.view,page,paymentPage,version]);
 useEffect(()=>{setDetail(null);setPage(1);setPaymentPage(1);setAction(null);pending.current=null;},[invoiceId]);
 async function submit(body:Record<string,unknown>){if(!detail||busy)return;setBusy(true);const request={...body,invoiceId,revision:detail.revision},signature=JSON.stringify(request);if(pending.current?.signature!==signature)pending.current={signature,operationId:crypto.randomUUID()};
  try{const response=await groupFetch('/api/invoice-finance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...request,operationId:pending.current.operationId})}),data=await readApiJson<{ok?:boolean;error?:string}>(response);if(!response.ok){if(response.status===409){setAction(null);setVersion(value=>value+1);}throw Error(t(data.error||'invoiceFinance.requestFailed'));}pending.current=null;setAction(null);setPage(1);setPaymentPage(1);setVersion(value=>value+1);showActionToast('success','invoiceFinance.saved');onChanged?.();}
  finally{setBusy(false);}
 }
 if(!permissions.view)return null;
 return <section className="panel invoice-finance-panel" aria-busy={loading} data-testid="invoice-finance-panel"><div className="invoice-finance-header"><div><h3>{F('title')}</h3>{detail&&<span className={'invoice-finance-status invoice-finance-status-'+detail.status}>{F('status.'+detail.status)}</span>}</div><Button type="button" variant="outline" disabled={loading||busy} onClick={()=>setVersion(value=>value+1)}>{F('refresh')}</Button></div>
  {loading&&<p role="status">{F('loading')}</p>}{failed&&<div className="invoice-finance-actions"><Button type="button" variant="outline" onClick={()=>setVersion(value=>value+1)}>{F('reload')}</Button></div>}
  {detail&&!failed&&<><dl className="invoice-finance-balances">{([['original',detail.originalTotalCents],['adjusted',detail.adjustedTotalCents],['paid',detail.paidCents],['remaining',detail.remainingCents],...(detail.refundedCents?[['refunded',detail.refundedCents]]:[]),...(detail.creditBalanceCents?[['creditBalance',detail.creditBalanceCents]]:[])] as [string,number][]).map(([key,value])=><div key={key}><dt>{F(key)}</dt><dd>{financeMoney(value)}</dd></div>)}</dl>
   <div className="invoice-finance-actions">{detail.status!=='void'&&<>{permissions.record&&<Button type="button" disabled={loading||busy||detail.remainingCents<=0} onClick={()=>setAction({kind:'recordPayment'})}>{F('record')}</Button>}{permissions.adjust&&<Button type="button" variant="outline" disabled={loading||busy} onClick={()=>setAction({kind:'adjust'})}>{F('adjust')}</Button>}{permissions.void&&<Button type="button" variant="destructive" disabled={loading||busy||detail.paidCents>0} onClick={()=>setAction({kind:'void'})}>{F('void')}</Button>}</>}</div>
   {permissions.void&&detail.status!=='void'&&detail.paidCents>0&&<p className="invoice-finance-muted">{F('voidPaidHint')}</p>}
   {detail.status==='void'&&<p className="invoice-finance-confirm">{F('voidReason')}：{detail.voidReason}<br/>{detail.voidedAt&&stamp(detail.voidedAt)}</p>}
   <section className="invoice-finance-section"><h4>{F('payments')}</h4><div className="invoice-finance-records">{detail.payments.map(payment=><article key={payment.id} className="invoice-finance-record"><div className="invoice-finance-record-heading"><strong>{payment.number}</strong><strong>{financeMoney(payment.amountCents)}</strong>{payment.reversedAt&&<span className="invoice-finance-status invoice-finance-status-void">{F('reversed')}</span>}</div><dl><div><dt>{F('receivedAt')}</dt><dd>{stamp(payment.paidAt)}</dd></div><div><dt>{F('method')}</dt><dd>{F('method.'+payment.method)}</dd></div>{payment.reference&&<div><dt>{F('reference')}</dt><dd>{payment.reference}</dd></div>}{payment.refundedCents>0&&<div><dt>{F('refunded')}</dt><dd>{financeMoney(payment.refundedCents)}</dd></div>}{payment.notes&&<div><dt>{F('notes')}</dt><dd>{payment.notes}</dd></div>}</dl><div className="invoice-finance-actions"><ReceiptButton id={payment.receiptId}/>{!payment.reversedAt&&detail.status!=='void'&&<>{permissions.refund&&payment.refundableCents>0&&<Button type="button" variant="outline" disabled={loading||busy} onClick={()=>setAction({kind:'refund',payment})}>{F('refund')}</Button>}{permissions.reverse&&payment.refundedCents===0&&<Button type="button" variant="outline" disabled={loading||busy} onClick={()=>setAction({kind:'reversePayment',payment})}>{F('reverse')}</Button>}</>}</div></article>)}</div>{!detail.payments.length&&<p className="invoice-finance-muted">{F('emptyPayments')}</p>}<Pagination page={detail.paymentPage} pages={detail.paymentPages} loading={loading||busy} onChange={setPaymentPage}/><p className="invoice-finance-muted">{F('balanceHint')}</p></section>
   <section className="invoice-finance-section"><h4>{F('events')}</h4><ol className="invoice-finance-history">{detail.events.map(event=><li key={event.id}><div className="invoice-finance-record-heading"><strong>{F('kind.'+event.kind)}</strong>{event.amountCents>0&&<strong>{financeMoney(event.amountCents)}</strong>}</div><small className="invoice-finance-muted">{stamp(event.occurredAt)}</small>{event.reason&&<p>{event.reason}</p>}{event.reference&&<p>{F('reference')}：{event.reference}</p>}{event.notes&&<p>{F('notes')}：{event.notes}</p>}</li>)}</ol>{!detail.events.length&&<p className="invoice-finance-muted">{F('emptyEvents')}</p>}<Pagination page={detail.page} pages={detail.pages} loading={loading||busy} onChange={setPage}/></section>
   {permissions.correctAttendance&&detail.status!=='void'&&<InvoiceAttendanceCorrection invoiceId={invoiceId} financeRevision={detail.revision} onChanged={()=>{setVersion(value=>value+1);onChanged?.();}}/>}
   {children}{action&&<FinanceActionDialog key={action.kind+':'+(action.payment?.id||'')} action={action} summary={detail} busy={busy} canCreditInvoice={permissions.adjust} onClose={()=>{if(!busy)setAction(null);}} onSubmit={submit}/>}</>}
 </section>;
}
