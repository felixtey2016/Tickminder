"use client";
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import type {PrepaymentAllocationPreview,PrepaymentResult} from '@/lib/prepayments';
import {financeGet,financeMoney,financePost,FinanceModal,type PendingOperation} from './finance-round2-shared';
import {prepaymentUrl} from './prepayments-ui-shared';
import {financeLabel as L} from './finance-layout-tools';

type SettlementResult=PrepaymentResult&{settledCents?:number;remainingHourlyCents?:number;hasMore?:boolean};
export default function InvoiceBalanceSettlement({invoiceId,studentId,studentName,onClose,onSettled,onRecord}:{invoiceId:string;studentId:string;studentName:string;onClose:()=>void;onSettled:()=>void;onRecord?:(remainingCents:number)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[stale,setStale]=useState(false),[result,setResult]=useState<SettlementResult|null>(null),[total,setTotal]=useState(0);
 const pending=useRef<PendingOperation>(null),body=useRef<Record<string,unknown>|null>(null),running=useRef(false),started=useRef(false);
 async function settle(){
  if(running.current)return;running.current=true;setBusy(true);setError('');setStale(false);
  try{
   if(!body.current){const preview=await financeGet<PrepaymentAllocationPreview>(prepaymentUrl({view:'allocation',invoiceId}));if(preview.studentId!==studentId)throw Error(L('账单学生已改变，请重新加载。','The invoice student changed. Reload the invoice.'));body.current={action:'settleInvoice',studentId,invoiceId,revision:preview.balance.revision,invoiceRevision:preview.invoiceRevision};}
   const next=await financePost<SettlementResult>('/api/prepayments',body.current,pending);setResult(next);setTotal(value=>value+(next.settledCents||0));body.current=null;onSettled();
  }catch(reason){setError(reason instanceof Error?reason.message:L('余额结算未完成。','Balance settlement could not be completed.'));setStale((reason as {status?:number}).status===409);}
  finally{running.current=false;setBusy(false);}
 }
 useEffect(()=>{if(!started.current){started.current=true;void settle();}},[]);
 return <FinanceModal title={L('结算小时学费余额','Settle hourly tuition balance')} busy={busy} onClose={onClose}><p><strong>{studentName}</strong></p><p>{L('账单已发出。现在使用已有余额结算小时学费，不重复登记收款；固定月费不扣余额。','The invoice has been issued. Existing balance settles hourly tuition without recording another payment. Monthly tuition does not use this balance.')}</p>
  {busy&&<p role="status">{L('正在核对并结算余额…','Checking and settling the balance…')}</p>}
  {error&&<div role="alert"><p>{error}</p><p>{L('账单已经保留，请重试本次余额结算；不会重新开单。','The issued invoice is retained. Retry this settlement; the invoice will not be issued again.')}</p></div>}
  {result&&<div role="status"><p>{L('本次已抵扣','Balance applied')} · <strong>{financeMoney(total)}</strong></p><p>{L('小时学费仍待缴','Hourly tuition still due')} · {financeMoney(result.remainingHourlyCents??0)}</p>{!result.hasMore&&(result.remainingHourlyCents||0)>0&&<p>{L('可用余额不足，剩余费用保留为待缴。','The available balance was insufficient. The remainder stays due.')}</p>}{result.hasMore&&<p>{L('还有余额可继续结算。','More balance is available to settle.')}</p>}</div>}
  <div className="finance2-actions">{result&&!result.hasMore&&(result.remainingHourlyCents||0)>0&&onRecord&&<Button type="button" disabled={busy} onClick={()=>onRecord(result.remainingHourlyCents!)}>{L('登记收款','Record payment')}</Button>}<Button type="button" variant="outline" disabled={busy} onClick={onClose}>{L('关闭','Close')}</Button>{(error||result?.hasMore)&&<Button type="button" disabled={busy} onClick={()=>{if(stale){body.current=null;pending.current=null;}void settle();}}>{stale?L('重新核对余额','Reload balance'):error?L('重试余额结算','Retry settlement'):L('继续结算','Continue settlement')}</Button>}</div>
 </FinanceModal>;
}
