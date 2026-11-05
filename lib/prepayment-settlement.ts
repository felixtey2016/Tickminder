import type {Account} from './auth';
import {learningDb} from './learning-server';
import {PrepaymentError,type PrepaymentResult} from './prepayments';
import {id,rev,prepaymentAuthority,prepaymentRead,requirePrepaymentPermission} from './prepayment-access';
import {prepaymentAccountState,prepaymentAccountBasisSql,targetPrepaymentAvailable} from './prepayment-account';
import {paymentSql,paymentResult} from './prepayment-read';

/** Issue and settlement are explicit separate operations. Each settlement batch
 * is atomic and replayable; the browser retries the same operation on unknown
 * outcomes. It never issues a second invoice and never consumes monthly fees. */
export async function settlePrepaymentInvoice(actor:Account,data:Record<string,unknown>,operation:string,hash:string):Promise<PrepaymentResult>{
 const key='prepayments.apply',gid=await requirePrepaymentPermission(actor,key),studentId=id(data.studentId,'学生'),invoiceId=id(data.invoiceId,'正式账单'),expected=rev(data.revision),invoiceRevision=rev(data.invoiceRevision);
 const account=await prepaymentAccountState(actor,studentId,key),invoice=account.invoices.find(row=>row.invoiceId===invoiceId);
 if(!invoice)throw new PrepaymentError('只能结算该学生已经正式发出的账单',404);
 if(account.summary.revision!==expected||invoice.revision!==invoiceRevision)throw new PrepaymentError('余额或账单已改变，请刷新重试',409);
 const available=targetPrepaymentAvailable(account.summary,account.invoices,invoiceId);
 if(invoice.reviewRequired||available===null)throw new PrepaymentError('账户仍有待核对费用，或混合账单的小时费调整需要先人工核对',409);
 const stored=await prepaymentRead<Parameters<typeof paymentResult>[0]>(actor,key,paymentSql+' WHERE p.group_id=? AND p.student_id=? ORDER BY p.paid_at,p.id',gid,studentId),payments=stored.map(paymentResult).filter(payment=>payment.availableCents>0);
 let remaining=Math.min(available,invoice.hourlyDueCents);
 const parts:{paymentId:string;amount:number}[]=[];
 for(const payment of payments){if(remaining<=0||parts.length===20)break;const amount=Math.min(payment.availableCents,remaining);parts.push({paymentId:payment.id,amount});remaining-=amount;}
 const allocationIds=parts.map(()=>crypto.randomUUID());
 const settledCents=parts.reduce((sum,part)=>sum+part.amount,0),result:PrepaymentResult={ok:true,studentId,invoiceId,allocationIds,initialRevision:expected,initialInvoiceRevision:invoiceRevision,revision:expected+parts.length,invoiceRevision:invoiceRevision+parts.length,settledCents,remainingHourlyCents:invoice.hourlyDueCents-settledCents,hasMore:remaining>0};
 const db=learningDb(),now=new Date().toISOString(),execution=crypto.randomUUID(),auth=prepaymentAuthority(actor,key),guard='EXISTS(SELECT 1 FROM prepayment_operations WHERE group_id=? AND operation_id=? AND execution_id=?)',guardArgs=[gid,operation,execution];
 const statements:D1PreparedStatement[]=[db.prepare(`INSERT OR IGNORE INTO prepayment_operations(group_id,operation_id,actor_id,action,request_hash,execution_id,result_json,created_at) SELECT ?,?,?,'settleInvoice',?,?,?,? WHERE ${auth.sql} AND (${prepaymentAccountBasisSql})=?${account.nextBoundary?" AND julianday('now')<julianday(?)":''}`).bind(gid,operation,actor.id,hash,execution,JSON.stringify(result),now,...auth.args,...account.basisArgs,account.basis,...(account.nextBoundary?[account.nextBoundary]:[])),
 db.prepare(`INSERT INTO invoice_finance_accounts(group_id,invoice_id,student_id,original_total_cents,created_at,updated_at) SELECT i.group_id,i.id,i.student_id,i.total_cents,?,? FROM invoices i WHERE i.group_id=? AND i.id=? AND ${guard} AND NOT EXISTS(SELECT 1 FROM invoice_finance_accounts f WHERE f.group_id=i.group_id AND f.invoice_id=i.id)`).bind(now,now,gid,invoiceId,...guardArgs)];
 for(const [index,part]of parts.entries()){
  const allocationId=allocationIds[index],eventId=crypto.randomUUID(),childOperation='settle_'+execution+'_'+index;
  statements.push(db.prepare(`INSERT INTO prepayment_operations(group_id,operation_id,actor_id,action,request_hash,execution_id,result_json,created_at) SELECT ?,?,?,'apply',?,?,?,? WHERE ${guard}`).bind(gid,childOperation,actor.id,hash,execution,JSON.stringify({ok:true,allocationId,eventId,revision:expected+index+1,invoiceRevision:invoiceRevision+index+1}),now,...guardArgs),
   db.prepare(`INSERT INTO prepayment_allocations(id,group_id,student_id,payment_id,invoice_id,amount_cents,created_at,operation_id) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`).bind(allocationId,gid,studentId,part.paymentId,invoiceId,part.amount,now,childOperation,...guardArgs),
   db.prepare(`INSERT INTO prepayment_events(id,group_id,student_id,payment_id,invoice_id,allocation_id,kind,amount_cents,occurred_at,method,reason,notes,reference,actor_id,created_at,operation_id,expected_revision,expected_invoice_revision) SELECT ?,?,?,?,?,?,'apply',?,?,'','','Hourly invoice settlement','',?,?,?,?,? WHERE ${guard}`).bind(eventId,gid,studentId,part.paymentId,invoiceId,allocationId,part.amount,now,actor.id,now,childOperation,expected+index,invoiceRevision+index,...guardArgs));
 }
 statements.push(db.prepare(`INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) SELECT ?,?,'prepayment',?,'prepayments.settleInvoice',?,? WHERE ${guard}`).bind(gid,crypto.randomUUID(),actor.id,JSON.stringify({studentId,invoiceId,amountCents:settledCents,allocations:parts.length}),now,...guardArgs));
 try{const saved=await db.batch(statements);if(!saved[0].meta.changes){const repeated=(await prepaymentRead<{actorId:string;hash:string;resultJson:string}>(actor,key,'SELECT actor_id AS actorId,request_hash AS hash,result_json AS resultJson FROM prepayment_operations WHERE group_id=? AND operation_id=?',gid,operation))[0];if(repeated?.actorId===actor.id&&repeated.hash===hash)return JSON.parse(repeated.resultJson) as PrepaymentResult;throw new PrepaymentError('费用、余额、账单或权限已改变，请刷新重试',409);}}
 catch(error){if(error instanceof PrepaymentError)throw error;if(/prepayment_|invoice_finance_|constraint failed/.test(String(error)))throw new PrepaymentError('余额或账单资料已改变，请刷新重试',409);throw error;}
 await requirePrepaymentPermission(actor,key);return result;
}
