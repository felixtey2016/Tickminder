import type {Account} from './auth';
import {billingBasisSql,prepaymentBillingPreview} from './billing-server';
import {BillingError,type BillingLine} from './billing';
import {PrepaymentError,type PrepaymentAccountSummary} from './prepayments';
import {id,prepaymentRead,prepaymentStudent,prepaymentBalance,requirePrepaymentPermission} from './prepayment-access';
import {amountRequestSource,advanceModes} from './prepayment-amount';

// Exact source comparison, not an audit/revision heuristic. These parameters
// cover this one student only; no roster sweep and no cached private balances.
export const prepaymentAccountBasisSql=`WITH f AS(SELECT ? AS gid,? AS sid)
 SELECT json_object('billing',json((${billingBasisSql})),
 'adjustments',(SELECT json_group_array(json(j)) FROM(SELECT json_object('id',a.id,'line',a.line_id,'month',a.month,'rev',a.revision,'amount',a.amount_cents,'basis',a.basis_hash,'reason',a.reason,'created',a.created_at) AS j FROM billing_adjustments a,f WHERE a.group_id=f.gid AND a.student_id=f.sid ORDER BY a.id)),
 'invoices',(SELECT json_group_array(json(j)) FROM(SELECT json_object('id',i.id,'month',i.month,'total',i.total_cents,'document',i.document_json,'items',(SELECT json_group_array(json_object('sourceId',x.source_id,'snapshot',x.snapshot_json)) FROM invoice_items x WHERE x.group_id=i.group_id AND x.invoice_id=i.id AND x.kind='fee'),'revision',coalesce(a.revision,0),'charge',coalesce(a.charge_cents,0),'credit',coalesce(a.credit_cents,0),'cash',coalesce(a.received_cents-a.refunded_cents-a.reversed_cents,0),'applied',coalesce(a.prepayment_cents,0),'voided',a.voided_at) AS j FROM invoices i LEFT JOIN invoice_finance_accounts a ON a.group_id=i.group_id AND a.invoice_id=i.id,f WHERE i.group_id=f.gid AND i.student_id=f.sid AND i.status='issued' ORDER BY i.id)),
 'wallet',(SELECT json_object('revision',a.revision,'received',a.received_cents,'refunded',a.refunded_cents,'reversed',a.reversed_cents,'applied',a.applied_cents) FROM prepayment_accounts a,f WHERE a.group_id=f.gid AND a.student_id=f.sid))`;
type InvoiceSource={id:string;month:string;total:number;document:string;items:{sourceId:string|null;snapshot:string}[];revision:number;charge:number;credit:number;cash:number;applied:number;voided:string|null};
type InvoiceHold={invoiceId:string;revision:number;remainingCents:number;hourlyDueCents:number;reviewRequired:boolean};
/** Targeted settlement may consume that invoice's hold, never another source's
 * hold. Underfunded wallets do not implicitly prefer the invoice opened first. */
export function targetPrepaymentAvailable(summary:PrepaymentAccountSummary,invoices:InvoiceHold[],invoiceId:string){
 if(summary.reviewRequired)return null;
 const others=invoices.filter(row=>row.invoiceId!==invoiceId).reduce((sum,row)=>sum+row.hourlyDueCents,0);
 return Math.max(0,summary.cashBalanceCents-summary.confirmedHourlyUnbilledCents-others);
}
function integer(value:number){if(!Number.isSafeInteger(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER/2)throw new PrepaymentError('账户费用需要人工核对',409);return value;}
async function source(actor:Account,studentId:string,key:string){const args=[actor.groupId,studentId,actor.groupId,studentId,'2000-01-01T00:00:00.000Z','2100-01-01T00:00:00.000Z'];const row=(await prepaymentRead<{basis:string}>(actor,key,`SELECT (${prepaymentAccountBasisSql}) AS basis`,...args))[0];if(!row)throw new PrepaymentError('账户资料已改变，请刷新重试',409);return{basis:row.basis,args};}

export async function prepaymentAccountState(actor:Account,studentIdValue:string,key='prepayments.view'){
 await requirePrepaymentPermission(actor,key);
 const studentId=id(studentIdValue,'学生'),student=await prepaymentStudent(actor,studentId,key),before=await source(actor,studentId,key),now=new Date().toISOString();
 const [balance,amountSource,months,future]=await Promise.all([
  prepaymentBalance(actor,studentId,key),amountRequestSource(actor,studentId,key),
  prepaymentRead<{month:string}>(actor,key,`SELECT DISTINCT substr(datetime(coalesce(s.actual_start,l.actual_start,l.planned_start),'+8 hours'),1,7) AS month FROM billing_students b JOIN lessons l ON l.group_id=b.group_id AND l.student=b.student_name LEFT JOIN class_sessions s ON s.group_id=l.group_id AND s.id=l.session_id WHERE b.group_id=? AND b.id=? AND coalesce(s.actual_start,l.actual_start,l.planned_start)<=? ORDER BY month`,actor.groupId,studentId,now),
  prepaymentRead<{nextBoundary:string|null}>(actor,key,'SELECT min(l.planned_start) AS nextBoundary FROM billing_students b JOIN lessons l ON l.group_id=b.group_id AND l.student=b.student_name WHERE b.group_id=? AND b.id=? AND l.planned_start>?',actor.groupId,studentId,now),
 ]);
 const modes=advanceModes(amountSource.basis,now),data=JSON.parse(before.basis) as {invoices:InvoiceSource[]};
 const sourceIds=new Set<string>(),lessonIds=new Set<string>(),monthlySources=new Set<string>(),invoices:InvoiceHold[]=[];
 let reviewRequired=false,pendingCount=0,hourlyInvoiceDueCents=0,confirmedHourlyUnbilledCents=0;
 for(const invoice of data.invoices){
  let rows:Partial<BillingLine>[]=[];
  try{const document=JSON.parse(invoice.document);rows=Array.isArray(document.sourceLines)?document.sourceLines:invoice.items.map(item=>JSON.parse(item.snapshot));}catch{throw new PrepaymentError('旧账单来源无法核对，请先检查正式账单',409);}
  for(const item of invoice.items)if(item.sourceId)sourceIds.add(item.sourceId);
  for(const line of rows){if(typeof line.id==='string')sourceIds.add(line.id);if(typeof line.lessonId==='string')lessonIds.add(line.lessonId);if(line.mode==='month'&&!line.lessonId&&line.subjectKey)monthlySources.add(invoice.month+'|'+line.subjectKey);}
  if(invoice.voided)continue; // voided sources remain covered, never recharged
  const hourRows=rows.filter(line=>line.mode==='hour'),otherRows=rows.filter(line=>line.mode!=='hour'&&Number(line.amountCents)>0);
  let hourly=integer(hourRows.reduce((n,line)=>n+(Number.isSafeInteger(line.amountCents)?Number(line.amountCents):0),0));
  // Unknown adjustments on a mixed document cannot be silently assigned to its
  // hourly part. Credits/discounts and cash conservatively reduce hourly first.
  const needsReview=hourRows.some(line=>line.status==='pending'||!Number.isSafeInteger(line.amountCents))||hourRows.length>0&&otherRows.length>0&&invoice.charge>0;
  const rawTotal=integer(rows.reduce((n,line)=>n+(Number.isSafeInteger(line.amountCents)?Number(line.amountCents):0),0));
  hourly=Math.max(0,hourly-Math.max(0,rawTotal-invoice.total)-invoice.credit+(otherRows.length===0&&hourRows.length?invoice.charge:0));
  const remainingCents=Math.max(0,integer(invoice.total+invoice.charge-invoice.credit-invoice.cash-invoice.applied));
  const hourlyDueCents=Math.min(remainingCents,Math.max(0,integer(hourly-invoice.cash-invoice.applied)));
  invoices.push({invoiceId:invoice.id,revision:invoice.revision,remainingCents,hourlyDueCents,reviewRequired:needsReview});hourlyInvoiceDueCents=integer(hourlyInvoiceDueCents+hourlyDueCents);reviewRequired ||= needsReview;
 }
 for(const {month} of months){
  let preview;try{preview=await prepaymentBillingPreview(actor,month,studentId,student.name);}catch(error){if(error instanceof BillingError)throw new PrepaymentError(error.message,error.status);throw error;}
  for(const line of preview.detail?.lines||[]){
   if(sourceIds.has(line.id)||Boolean(line.lessonId&&lessonIds.has(line.lessonId))||line.mode==='month'&&!line.lessonId&&monthlySources.has(month+'|'+line.subjectKey))continue;
   // Per-lesson and monthly historical prices are never reinterpreted as hours.
   if(line.mode!=='hour'&&line.mode!==null)continue;
   if(line.status==='pending'||line.amountCents===null){pendingCount++;reviewRequired=true;continue;}
   if(line.mode==='hour')confirmedHourlyUnbilledCents=integer(confirmedHourlyUnbilledCents+line.amountCents);
  }
 }
 await requirePrepaymentPermission(actor,key);
 if((await source(actor,studentId,key)).basis!==before.basis||(await amountRequestSource(actor,studentId,key)).basis!==amountSource.basis)throw new PrepaymentError('账户费用或余额已改变，请刷新重试',409);
 const heldHourlyCents=Math.min(balance.balanceCents,integer(confirmedHourlyUnbilledCents+hourlyInvoiceDueCents));
 const summary:PrepaymentAccountSummary={studentId,revision:balance.revision,cashBalanceCents:balance.balanceCents,heldHourlyCents,availableBalanceCents:reviewRequired?null:balance.balanceCents-heldHourlyCents,confirmedHourlyUnbilledCents,hourlyInvoiceDueCents,pendingCount,reviewRequired,...modes,advanceEligible:modes.advanceEligible||confirmedHourlyUnbilledCents>0||hourlyInvoiceDueCents>0,asOf:now};
 return{summary,invoices,basis:before.basis,basisArgs:before.args,nextBoundary:future[0]?.nextBoundary||null};
}
export async function prepaymentAccount(actor:Account,studentId:string):Promise<PrepaymentAccountSummary>{return(await prepaymentAccountState(actor,studentId)).summary;}
