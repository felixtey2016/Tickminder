import type {Account} from './auth';
import {learningDb} from './learning-server';
import {billingMonth,malaysiaDate,type BillingLine,BillingError} from './billing';
import {billingMonthBounds,billingPreview} from './billing-server';
import {financeAuthority} from './invoice-finance-server';
import {prepaymentAuthority,id,digest} from './prepayment-access';
import {adminPermissionPredicate} from './admin-permission-access';
import {statementInteger,statementMonthOffset,type StatementMonth,type StudentStatementPage} from './student-statements';

type Guard={sql:string;args:unknown[]};
type InvoiceRow={id:string;month:string;total:number;charge:number;credit:number;received:number;refunded:number;reversed:number;applied:number;voided:string|null;issuedAt:string;document:string;items:string};
type Coverage={ids:Set<string>;lessons:Set<string>;monthly:Set<string>};

// A combined statement exposes all four domains, so it requires every read grant.
export function statementAuthority(actor:Account):Guard{
 const finance=financeAuthority(actor),prepayment=prepaymentAuthority(actor),fees=adminPermissionPredicate(actor,'fees.view');
 return{sql:`(${finance.sql}) AND (${prepayment.sql}) AND (${fees.sql})`,args:[...finance.args,...prepayment.args,...fees.args]};
}
async function assert(actor:Account){const a=statementAuthority(actor);if(!await learningDb().prepare(`SELECT 1 WHERE ${a.sql}`).bind(...a.args).first())throw new BillingError('没有学生月结的查看权限',403);}
async function read<T>(actor:Account,sql:string,...args:unknown[]):Promise<T[]>{const a=statementAuthority(actor);return(await learningDb().prepare(`SELECT * FROM (${sql}) WHERE ${a.sql}`).bind(...args,...a.args).all<T>()).results||[];}

/** Audit revisions plus both immutable-money account revisions pin all history pages. */
async function version(actor:Account,sid:string){
 const value=(await read<Record<string,unknown>>(actor,`SELECT
  (SELECT coalesce(max(rowid),0) FROM audit WHERE group_id=?) AS audit,
  (SELECT coalesce(sum(revision),0) FROM invoice_finance_accounts WHERE group_id=? AND invoice_id IN(SELECT id FROM invoices WHERE group_id=? AND student_id=?)) AS invoices,
  (SELECT coalesce(sum(revision),0) FROM prepayment_accounts WHERE group_id=? AND student_id=?) AS prepayments,
  (SELECT count(*)||':'||coalesce(max(updated_at),'') FROM invoices WHERE group_id=? AND student_id=?) AS documents`,actor.groupId,actor.groupId,actor.groupId,sid,actor.groupId,sid,actor.groupId,sid))[0];
 if(!value)throw new BillingError('没有学生月结的查看权限',403);
 return digest({group:actor.groupId,studentId:sid,...value});
}
function money(value:number){return statementInteger(value);}
function coverage(invoices:InvoiceRow[]):Coverage{
 const result:Coverage={ids:new Set(),lessons:new Set(),monthly:new Set()};
 for(const invoice of invoices){
  let source:unknown,items:{sourceId:string|null;snapshot:string}[];
  try{source=JSON.parse(invoice.document).sourceLines;items=JSON.parse(invoice.items);}catch{throw new BillingError('旧账单资料需要核对，请先检查正式账单',409);}
  if(!Array.isArray(source)&&!items.length)throw new BillingError('旧账单缺少课程来源，请先核对正式账单',409);
  const lines:Partial<BillingLine>[]=Array.isArray(source)?source:[];
  for(const item of items){if(item.sourceId)result.ids.add(item.sourceId);try{lines.push(JSON.parse(item.snapshot));}catch{throw new BillingError('旧账单课程来源需要核对',409);}}
  // A void cancels this invoice's original claim. It must not silently recreate
  // the same tuition charge as an unbilled lesson. Newly added lessons still accrue.
  for(const row of lines){
   if(typeof row.id==='string')result.ids.add(row.id);
   if(typeof row.lessonId==='string')result.lessons.add(row.lessonId);
   if(row.mode==='month'&&!row.lessonId&&typeof row.subjectKey==='string')result.monthly.add(invoice.month+'|'+row.subjectKey);
  }
 }
 return result;
}
function covered(row:BillingLine,month:string,sources:Coverage){return sources.ids.has(row.id)||Boolean(row.lessonId&&sources.lessons.has(row.lessonId))||row.mode==='month'&&!row.lessonId&&sources.monthly.has(month+'|'+row.subjectKey);}

export async function studentStatementPage(actor:Account,params:URLSearchParams):Promise<StudentStatementPage>{
 await assert(actor);
 const sid=id(params.get('studentId'),'学生'),month=billingMonth(params.get('month'));
 const now=new Date().toISOString(),current=malaysiaDate(now).slice(0,7);
 if(month>current)throw new BillingError('请查看当前或过去月份；下个月结转会显示在月结结果中');
 const before=params.get('before')?billingMonth(params.get('before')):month;
 if(before>month)throw new BillingError('月结分页无效');
 const student=(await read<{id:string;name:string}>(actor,'SELECT b.id,b.student_name AS name FROM billing_students b JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name WHERE b.group_id=? AND b.id=?',actor.groupId,sid))[0];
 if(!student){await assert(actor);throw new BillingError('学生不存在或无权查看',404);}
 const token=await version(actor,sid),expected=params.get('token');
 if(params.has('before')&&!expected||expected&&expected!==token)throw new BillingError('月结资料已改变，请刷新后重新计算',409);
 const bounds=billingMonthBounds(month);
 const [invoices,cash,origin,wallet,changed]=await Promise.all([
  read<InvoiceRow>(actor,`SELECT i.id,i.month,i.total_cents AS total,coalesce(f.charge_cents,0) AS charge,coalesce(f.credit_cents,0) AS credit,coalesce(f.received_cents,0) AS received,coalesce(f.refunded_cents,0) AS refunded,coalesce(f.reversed_cents,0) AS reversed,coalesce(f.prepayment_cents,0) AS applied,f.voided_at AS voided,i.issued_at AS issuedAt,i.document_json AS document,(SELECT json_group_array(json_object('sourceId',source_id,'snapshot',snapshot_json)) FROM invoice_items WHERE group_id=i.group_id AND invoice_id=i.id AND kind='fee') AS items FROM invoices i LEFT JOIN invoice_finance_accounts f ON f.group_id=i.group_id AND f.invoice_id=i.id WHERE i.group_id=? AND i.student_id=? AND i.status='issued'`,actor.groupId,sid),
  read<{cashBefore:number;received:number;refunded:number;reversed:number}>(actor,`SELECT coalesce(sum(CASE WHEN occurred_at<? THEN CASE kind WHEN 'payment' THEN amount_cents ELSE -amount_cents END ELSE 0 END),0) AS cashBefore,coalesce(sum(CASE WHEN occurred_at>=? AND kind='payment' THEN amount_cents ELSE 0 END),0) AS received,coalesce(sum(CASE WHEN occurred_at>=? AND kind='refund' THEN amount_cents ELSE 0 END),0) AS refunded,coalesce(sum(CASE WHEN occurred_at>=? AND kind='reverse' THEN amount_cents ELSE 0 END),0) AS reversed FROM (SELECT e.kind,e.amount_cents,e.occurred_at FROM invoice_finance_events e JOIN invoices i ON i.group_id=e.group_id AND i.id=e.invoice_id WHERE i.group_id=? AND i.student_id=? AND e.kind IN('payment','refund','reverse') AND e.occurred_at<? UNION ALL SELECT e.kind,e.amount_cents,e.occurred_at FROM prepayment_payments p JOIN prepayment_events e ON e.group_id=p.group_id AND e.payment_id=p.id WHERE p.group_id=? AND p.student_id=? AND e.kind IN('payment','refund','reverse') AND e.occurred_at<?)`,bounds.start,bounds.start,bounds.start,bounds.start,actor.groupId,sid,bounds.end,actor.groupId,sid,bounds.end),
  read<{first:string|null}>(actor,`SELECT min(m) AS first FROM (SELECT substr(datetime(coalesce(cs.actual_start,l.actual_start,l.planned_start),'+8 hours'),1,7) AS m FROM lessons l LEFT JOIN class_sessions cs ON cs.group_id=l.group_id AND cs.id=l.session_id WHERE l.group_id=? AND l.student=? UNION ALL SELECT max(substr(v.effective_from,1,7),substr(datetime(s.created_at,'+8 hours'),1,7),coalesce((SELECT substr(datetime(min(p.created_at),'+8 hours'),1,7) FROM plans p WHERE p.group_id=r.group_id AND p.student=b.student_name AND CASE WHEN p.subject_id IS NOT NULL THEN 'id:'||s.syllabus_id||':'||p.subject_id ELSE 'label:'||lower(trim(p.subject)) END=r.subject_key),substr(v.effective_from,1,7))) FROM billing_rates r JOIN billing_rate_versions v ON v.group_id=r.group_id AND v.rate_id=r.id JOIN billing_students b ON b.group_id=r.group_id AND b.id=r.student_id JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name WHERE r.group_id=? AND r.student_id=? AND v.mode='month' UNION ALL SELECT month FROM invoices WHERE group_id=? AND student_id=? AND status='issued')`,actor.groupId,student.name,actor.groupId,sid,actor.groupId,sid),
  read<{balance:number}>(actor,'SELECT received_cents-refunded_cents-reversed_cents-applied_cents AS balance FROM prepayment_accounts WHERE group_id=? AND student_id=?',actor.groupId,sid),
  // Explicit invoice attendance corrections already contain the administrator's
  // financial decision. Later unreviewed source edits require reconciliation.
  read<{month:string;n:number}>(actor,`WITH sources AS (SELECT i.id,i.month,i.group_id,i.issued_at,json_extract(source.value,'$.lessonId') AS lesson_id FROM invoices i JOIN json_each(i.document_json,'$.sourceLines') source LEFT JOIN invoice_finance_accounts f ON f.group_id=i.group_id AND f.invoice_id=i.id WHERE i.group_id=? AND i.student_id=? AND i.status='issued' AND f.voided_at IS NULL UNION SELECT i.id,i.month,i.group_id,i.issued_at,json_extract(item.snapshot_json,'$.lessonId') FROM invoices i JOIN invoice_items item ON item.group_id=i.group_id AND item.invoice_id=i.id LEFT JOIN invoice_finance_accounts f ON f.group_id=i.group_id AND f.invoice_id=i.id WHERE i.group_id=? AND i.student_id=? AND i.status='issued' AND f.voided_at IS NULL AND item.kind='fee') SELECT i.month,count(DISTINCT i.id) AS n FROM sources i JOIN lessons l ON l.group_id=i.group_id AND l.id=i.lesson_id LEFT JOIN class_sessions cs ON cs.group_id=l.group_id AND cs.id=l.session_id LEFT JOIN class_session_participants cp ON cp.group_id=l.group_id AND cp.lesson_id=l.id WHERE max(julianday(l.updated_at),coalesce(julianday(cs.updated_at),0),coalesce(julianday(cp.attendance_updated_at),0))>julianday(coalesce((SELECT max(c.created_at) FROM invoice_attendance_corrections c WHERE c.group_id=i.group_id AND c.invoice_id=i.id AND c.lesson_id=l.id),i.issued_at)) GROUP BY i.month`,actor.groupId,sid,actor.groupId,sid),
 ]);
 const sources=coverage(invoices),originMonth=origin[0]?.first,first=originMonth&&originMonth<month?originMonth:month;
 if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(first))throw new BillingError('历史课程日期需要核对',409);
 if(before<first)throw new BillingError('月结分页无效');
 const rows:StatementMonth[]=[];
 let cursor=before;
 for(let i=0;i<3&&cursor>=first;i++,cursor=statementMonthOffset(cursor,-1)){
  // This trusted read omits editing hashes/history, retaining adjustment checks.
  const preview=await billingPreview(actor,cursor,1,1,sid,student.name,undefined,false);
  let unbilled=0,pending=0,lessons=0;
  for(const line of preview.detail?.lines||[]){
   if(covered(line,cursor,sources))continue;
   if(line.status==='pending'){pending++;continue;}
   if(line.amountCents!==null)unbilled=money(unbilled+line.amountCents);
   if(line.lessonId&&line.status==='ready'&&line.amountCents!==null)lessons++;
  }
  const invoiceCents=money(invoices.filter(row=>row.month===cursor&&!row.voided).reduce((n,row)=>money(n+row.total+row.charge-row.credit),0));
  rows.push({month:cursor,invoiceCents,unbilledCents:unbilled,chargeCents:money(invoiceCents+unbilled),pendingCount:pending,lessonCount:lessons,changedInvoiceCount:changed.find(row=>row.month===cursor)?.n||0});
 }
 await assert(actor);if(await version(actor,sid)!==token)throw new BillingError('月结资料已改变，请刷新后重新计算',409);
 const totals=cash[0]||{cashBefore:0,received:0,refunded:0,reversed:0};
 const active=invoices.filter(row=>!row.voided);
 return{student,month,token,asOf:now,cashBeforeCents:money(totals.cashBefore),receivedCents:money(totals.received),refundedCents:money(totals.refunded),reversedCents:money(totals.reversed),walletBalanceCents:money(wallet[0]?.balance||0),invoiceDueCents:money(active.reduce((n,row)=>money(n+Math.max(0,row.total+row.charge-row.credit-row.received+row.refunded+row.reversed-row.applied)),0)),invoiceCreditCents:money(active.reduce((n,row)=>money(n+Math.max(0,row.received-row.refunded-row.reversed+row.applied-row.total-row.charge+row.credit)),0)),rows,nextBefore:cursor>=first?cursor:null};
}
