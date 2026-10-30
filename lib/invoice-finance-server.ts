import type {Account} from './auth';
import {learningDb} from './learning-server';
import {invoiceAuthority} from './invoice-server';
import {adminPermissionPredicate} from './admin-permission-access';
import {billingDate,malaysiaDate} from './billing';
import type {InvoiceDocument} from './invoice';
import {PAYMENT_METHODS,InvoiceFinanceError,type InvoiceFinanceSummary,type InvoiceFinanceDetail,type InvoicePayment,type InvoiceFinanceEvent,type InvoiceFinanceEventKind,type InvoiceFinanceResult,type PaymentMethod,type ReceiptDocument} from './invoice-finance';
import {prepareInvoiceAttendanceCorrection} from './invoice-attendance-correction';
import {auditJson} from './audit-log';

type Guard={sql:string;args:unknown[]};
type StoredInvoice={id:string;studentId:string;status:string;documentJson:string;totalCents:number};
type BalanceRow={invoiceId:string;revision:number;originalTotalCents:number;chargeCents:number;creditCents:number;receivedCents:number;reversedCents:number;refundedCents:number;prepaymentCents:number;voidedAt:string|null;voidReason:string};
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
const totalsColumns=`i.id AS invoiceId,coalesce(f.revision,0) AS revision,i.total_cents AS originalTotalCents,coalesce(f.charge_cents,0) AS chargeCents,coalesce(f.credit_cents,0) AS creditCents,coalesce(f.received_cents,0) AS receivedCents,coalesce(f.reversed_cents,0) AS reversedCents,coalesce(f.refunded_cents,0) AS refundedCents,coalesce(f.prepayment_cents,0) AS prepaymentCents,f.voided_at AS voidedAt,coalesce(f.void_reason,'') AS voidReason`;
const totalsFrom='invoices i LEFT JOIN invoice_finance_accounts f ON f.group_id=i.group_id AND f.invoice_id=i.id';
export function financeAuthority(actor:Account,key:string='payments.view'):Guard{
 if(actor.role!=='admin'||!actor.groupId||!/^[a-z0-9-]{1,64}$/.test(actor.groupId))throw new InvoiceFinanceError('没有权限查看或修改收款记录',403);
 const base=invoiceAuthority(actor),grants=[...(key==='invoices.view'?[]:[key]),...(['payments.record','payments.reverse','payments.refund','invoices.adjust','invoices.void'].includes(key)?['payments.view']:[])].map(k=>adminPermissionPredicate(actor,k));
 return{sql:`(${base.sql})${grants.map(g=>` AND (${g.sql})`).join('')}`,args:[...base.args,...grants.flatMap(g=>g.args)]};
}
export async function requireFinancePermission(actor:Account,key='payments.view'){
 const a=financeAuthority(actor,key);if(!await learningDb().prepare(`SELECT 1 WHERE ${a.sql}`).bind(...a.args).first())throw new InvoiceFinanceError('没有权限查看或修改收款记录',403);
 return actor.groupId!;
}
async function read<T>(actor:Account,key:string,sql:string,...args:unknown[]){const a=financeAuthority(actor,key);return(await learningDb().prepare(`SELECT * FROM (${sql}) WHERE ${a.sql}`).bind(...args,...a.args).all<T>()).results||[];}
function validId(value:unknown,label='账单'){const id=text(value);if(!/^[A-Za-z0-9:_-]{1,100}$/.test(id))throw new InvoiceFinanceError(`请选择有效${label}`);return id;}
function summarize(row:BalanceRow):InvoiceFinanceSummary{
 const adjustedTotalCents=row.originalTotalCents+row.chargeCents-row.creditCents,cashPaidCents=row.receivedCents-row.reversedCents-row.refundedCents,paidCents=cashPaidCents+row.prepaymentCents;
 return{...row,adjustedTotalCents,cashPaidCents,paidCents,remainingCents:row.voidedAt?0:Math.max(0,adjustedTotalCents-paidCents),creditBalanceCents:row.voidedAt?0:Math.max(0,paidCents-adjustedTotalCents),status:row.voidedAt?'void':paidCents>=adjustedTotalCents?'paid':paidCents>0?'partially_paid':'unpaid'};
}
async function balance(actor:Account,id:string,key='payments.view'){
 const rows=await read<BalanceRow>(actor,key,`SELECT ${totalsColumns} FROM ${totalsFrom} WHERE i.group_id=? AND i.id=? AND i.status='issued'`,actor.groupId,id);
 if(!rows[0]){await requireFinancePermission(actor,key);throw new InvoiceFinanceError('正式账单不存在或无权查看',404);}return summarize(rows[0]);
}
export async function invoiceFinanceSummary(actor:Account,invoiceIds:string[]):Promise<Record<string,InvoiceFinanceSummary>>{
 await requireFinancePermission(actor,'invoices.view');if(!Array.isArray(invoiceIds)||invoiceIds.length>20)throw new InvoiceFinanceError('一次最多读取 20 张账单');
 const ids=[...new Set(invoiceIds.map(v=>validId(v)))];if(!ids.length)return{};
 const rows=await read<BalanceRow>(actor,'invoices.view',`SELECT ${totalsColumns} FROM ${totalsFrom} WHERE i.group_id=? AND i.status='issued' AND i.id IN(${ids.map(()=>'?').join(',')})`,actor.groupId,...ids);
 // Invoice viewers receive totals, while the transaction-view grant controls internal reasons.
 return Object.fromEntries(rows.map(r=>[r.invoiceId,{...summarize(r),voidReason:''}]));
}
const eventColumns='id,kind,amount_cents AS amountCents,payment_id AS paymentId,occurred_at AS occurredAt,method,reason,notes,reference,created_at AS createdAt,actor_id AS actorId';
const paymentColumns=`p.id,p.invoice_id AS invoiceId,r.id AS receiptId,r.number,p.amount_cents AS amountCents,p.paid_at AS paidAt,p.method,p.reference,p.notes,p.created_at AS createdAt,(SELECT e.occurred_at FROM invoice_finance_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='reverse') AS reversedAt,coalesce((SELECT sum(e.amount_cents) FROM invoice_finance_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='refund'),0) AS refundedCents`;
function page(value:number,pages:number){return Math.min(pages,Math.max(1,Math.trunc(value)||1));}
export async function invoiceFinanceDetail(actor:Account,invoiceId:string,pageValue=1,paymentPageValue=1):Promise<InvoiceFinanceDetail>{
 await requireFinancePermission(actor);const id=validId(invoiceId),summary=await balance(actor,id);
 const counts=(await read<{events:number;payments:number}>(actor,'payments.view',`SELECT (SELECT count(*) FROM invoice_finance_events WHERE group_id=? AND invoice_id=?) AS events,(SELECT count(*) FROM invoice_payments WHERE group_id=? AND invoice_id=?) AS payments`,actor.groupId,id,actor.groupId,id))[0];
 const total=counts?.events||0,paymentTotal=counts?.payments||0,pageSize=20,pages=Math.max(1,Math.ceil(total/pageSize)),paymentPages=Math.max(1,Math.ceil(paymentTotal/pageSize)),current=page(pageValue,pages),paymentPage=page(paymentPageValue,paymentPages);
 const events=await read<InvoiceFinanceEvent>(actor,'payments.view',`SELECT ${eventColumns} FROM invoice_finance_events WHERE group_id=? AND invoice_id=? ORDER BY expected_revision DESC LIMIT ? OFFSET ?`,actor.groupId,id,pageSize,(current-1)*pageSize);
 const rows=await read<Omit<InvoicePayment,'refundableCents'>>(actor,'payments.view',`SELECT ${paymentColumns} FROM invoice_payments p JOIN invoice_receipts r ON r.group_id=p.group_id AND r.payment_id=p.id WHERE p.group_id=? AND p.invoice_id=? ORDER BY p.created_at DESC,p.id DESC LIMIT ? OFFSET ?`,actor.groupId,id,pageSize,(paymentPage-1)*pageSize);
 return{...summary,payments:rows.map(p=>({...p,refundableCents:p.reversedAt?0:p.amountCents-p.refundedCents})),events,total,page:current,pageSize,pages,paymentTotal,paymentPage,paymentPages};
}
export async function receiptDetail(actor:Account,receiptId:string):Promise<{receipt:ReceiptDocument;reversedAt:string|null}>{
 await requireFinancePermission(actor);const id=validId(receiptId,'收据'),row=(await read<{documentJson:string;reversedAt:string|null}>(actor,'payments.view',`SELECT r.document_json AS documentJson,(SELECT e.occurred_at FROM invoice_finance_events e WHERE e.group_id=r.group_id AND e.payment_id=r.payment_id AND e.kind='reverse') AS reversedAt FROM invoice_receipts r WHERE r.group_id=? AND r.id=?`,actor.groupId,id))[0];
 if(!row)throw new InvoiceFinanceError('收据不存在或无权查看',404);return{receipt:JSON.parse(row.documentJson) as ReceiptDocument,reversedAt:row.reversedAt};
}
function limited(value:unknown,max:number,label:string,required=false){const v=text(value);if(v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)||required&&!v)throw new InvoiceFinanceError(`请填写有效${label}，最多 ${max} 个字符`);return v;}
function amount(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<=0||Number(value)>100000000)throw new InvoiceFinanceError('金额须大于零，且不超过 RM1,000,000.00');return Number(value);}
function timestamp(value:unknown,now:string){const v=text(value);if(!v)return now;try{billingDate(v.slice(0,10));}catch{throw new InvoiceFinanceError('请选择有效交易日期');}let parsed:string;if(/^20\d\d-\d\d-\d\d$/.test(v))parsed=v+'T00:00:00+08:00';else{if(!/^20\d\d-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v))throw new InvoiceFinanceError('请选择有效交易日期与时间');parsed=v;}const ms=Date.parse(parsed);if(!Number.isFinite(ms)||ms>Date.parse(now)+300000)throw new InvoiceFinanceError('交易时间不能晚于现在');return new Date(ms).toISOString();}
async function digest(value:unknown){return[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function replay(actor:Account,key:string,operation:string,hash:string){const row=(await read<{actorId:string;hash:string;result:string}>(actor,key,'SELECT actor_id AS actorId,request_hash AS hash,result_json AS result FROM invoice_finance_operations WHERE group_id=? AND operation_id=?',actor.groupId,operation))[0];if(!row)return null;if(row.actorId!==actor.id||row.hash!==hash)throw new InvoiceFinanceError('操作编号已用于其他请求，请刷新后重试',409);return JSON.parse(row.result) as InvoiceFinanceResult;}
function operationGuard(groupId:string,operation:string,execution:string):Guard{return{sql:'EXISTS(SELECT 1 FROM invoice_finance_operations WHERE group_id=? AND operation_id=? AND execution_id=?)',args:[groupId,operation,execution]};}
function eventStatement(actor:Account,id:string,eventId:string,kind:InvoiceFinanceEventKind,value:number,paymentId:string|null,occurredAt:string,reason:string,notes:string,reference:string,now:string,operation:string,expected:number,guard:Guard,method:PaymentMethod|''=''){return learningDb().prepare(`INSERT INTO invoice_finance_events(id,group_id,invoice_id,payment_id,kind,amount_cents,occurred_at,method,reason,notes,reference,actor_id,created_at,operation_id,expected_revision) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard.sql}`).bind(eventId,actor.groupId,id,paymentId,kind,value,occurredAt,method,reason,notes,reference,actor.id,now,operation,expected,...guard.args);}
const actionGrants:Record<string,string>={recordPayment:'payments.record',reversePayment:'payments.reverse',refund:'payments.refund',adjust:'invoices.adjust',void:'invoices.void',correctAttendance:'invoices.adjust'};
export async function saveInvoiceFinance(actor:Account,data:Record<string,unknown>):Promise<InvoiceFinanceResult>{
 const action=text(data.action),key=actionGrants[action];if(!key)throw new InvoiceFinanceError('未知收款操作');const gid=await requireFinancePermission(actor,key);
 if('groupId'in data&&data.groupId!==gid)throw new InvoiceFinanceError('没有权限修改其他集团的财务记录',403);
 const operation=text(data.operationId);if(!/^[A-Za-z0-9_-]{16,100}$/.test(operation))throw new InvoiceFinanceError('操作编号无效，请重试');
 const hash=await digest(data),previous=await replay(actor,key,operation,hash);if(previous)return previous;
 const id=validId(data.invoiceId),expected=Number(data.revision);if(!Number.isSafeInteger(data.revision)||expected<0)throw new InvoiceFinanceError('收款版本无效，请刷新后重试',409);
 const invoice=(await read<StoredInvoice>(actor,key,'SELECT id,student_id AS studentId,status,document_json AS documentJson,total_cents AS totalCents FROM invoices WHERE group_id=? AND id=?',gid,id))[0];
 if(!invoice||invoice.status!=='issued')throw new InvoiceFinanceError('请选择已经正式发出的账单',404);
 const current=await balance(actor,id,key);if(current.revision!==expected||current.voidedAt)throw new InvoiceFinanceError('账单或收款记录已改变，请刷新后重试',409);
 const now=new Date().toISOString(),execution=crypto.randomUUID(),eventId=crypto.randomUUID(),authority=financeAuthority(actor,key),guard=operationGuard(gid,operation,execution),db=learningDb();
 const reason=limited(data.reason,1000,'原因',action!=='recordPayment'),notes=limited(data.notes,1000,'内部备注'),reference=limited(data.reference,160,'参考号');
 let paymentId:string|null=null,value=0,kind:InvoiceFinanceEventKind='payment',occurredAt=now,creditInvoice=false,method:PaymentMethod='cash';
 let correction:Awaited<ReturnType<typeof prepareInvoiceAttendanceCorrection>>|null=null,correctionAmount=0,correctionKind:'charge'|'credit'='credit';
 if(action==='recordPayment'){
  value=amount(data.amountCents);if(value>current.remainingCents)throw new InvoiceFinanceError('收款金额不可超过账单剩余欠款');
  if(!PAYMENT_METHODS.includes(data.method as PaymentMethod))throw new InvoiceFinanceError('请选择有效收款方式');method=data.method as PaymentMethod;occurredAt=timestamp(data.paidAt,now);paymentId=crypto.randomUUID();
 }else if(action==='reversePayment'||action==='refund'){
  paymentId=validId(data.paymentId,'收款记录');const payment=(await read<{amountCents:number;method:PaymentMethod;paidAt:string;reversedAt:string|null;refundedCents:number}>(actor,key,`SELECT p.amount_cents AS amountCents,p.method,p.paid_at AS paidAt,(SELECT e.occurred_at FROM invoice_finance_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='reverse') AS reversedAt,coalesce((SELECT sum(e.amount_cents) FROM invoice_finance_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='refund'),0) AS refundedCents FROM invoice_payments p WHERE p.group_id=? AND p.invoice_id=? AND p.id=?`,gid,id,paymentId))[0];
  if(!payment||payment.reversedAt)throw new InvoiceFinanceError('收款记录不存在或已经撤销',409);
  if(data.method!==undefined&&!PAYMENT_METHODS.includes(data.method as PaymentMethod))throw new InvoiceFinanceError('请选择有效退款方式');method=data.method===undefined?payment.method:data.method as PaymentMethod;
  if(action==='reversePayment'){if(payment.refundedCents)throw new InvoiceFinanceError('已有退款的收款不能整笔撤销，请先核对退款记录',409);value=payment.amountCents;kind='reverse';occurredAt=timestamp(data.effectiveAt,now);}
  else{value=amount(data.amountCents);if(value>payment.amountCents-payment.refundedCents)throw new InvoiceFinanceError('退款金额不可超过这笔收款尚可退回的金额');kind='refund';occurredAt=timestamp(data.refundedAt,now);if(data.creditInvoice!==undefined&&typeof data.creditInvoice!=='boolean')throw new InvoiceFinanceError('请选择有效减免选项');creditInvoice=data.creditInvoice===true;if(creditInvoice){const creditAuthority=financeAuthority(actor,'invoices.adjust');if(!await db.prepare(`SELECT 1 WHERE ${creditAuthority.sql}`).bind(...creditAuthority.args).first())throw new InvoiceFinanceError('没有权限减免账单金额',403);authority.sql+=` AND (${creditAuthority.sql})`;authority.args.push(...creditAuthority.args);if(value>current.adjustedTotalCents)throw new InvoiceFinanceError('减免金额不可超过调整后的账单总额');}}
  if(Date.parse(occurredAt)<Date.parse(payment.paidAt))throw new InvoiceFinanceError('退款或撤销日期不能早于原收款日期');
 }else if(action==='adjust'){
  value=amount(data.amountCents);if(!['charge','credit'].includes(text(data.kind)))throw new InvoiceFinanceError('请选择追加收费或减免');kind=data.kind as 'charge'|'credit';occurredAt=timestamp(data.effectiveAt,now);
  if(kind==='credit'&&value>current.adjustedTotalCents)throw new InvoiceFinanceError('减免金额不可超过调整后的账单总额');if(kind==='charge'&&value+current.adjustedTotalCents>100000000)throw new InvoiceFinanceError('调整后金额超过上限');
 }else if(action==='correctAttendance'){
  correction=await prepareInvoiceAttendanceCorrection(actor,data);authority.sql+=` AND (${correction.authority.sql})`;authority.args.push(...correction.authority.args);kind='attendance_correction';
  if(!Number.isSafeInteger(data.amountCents)||Number(data.amountCents)<0)throw new InvoiceFinanceError('请填写有效调整金额');
  correctionAmount=Number(data.amountCents);if(correctionAmount){amount(correctionAmount);if(!['charge','credit'].includes(text(data.kind)))throw new InvoiceFinanceError('请选择追加收费或减免');correctionKind=data.kind as 'charge'|'credit';if(correctionKind==='credit'&&correctionAmount>current.adjustedTotalCents)throw new InvoiceFinanceError('减免金额不可超过调整后的账单总额');if(correctionKind==='charge'&&correctionAmount+current.adjustedTotalCents>100000000)throw new InvoiceFinanceError('调整后金额超过上限');}
 }else{kind='void';if(current.paidCents!==0)throw new InvoiceFinanceError('账单仍有收款，请先办理退款或撤销误登记收款',409);occurredAt=timestamp(data.effectiveAt,now);}
 const result:InvoiceFinanceResult={ok:true,invoiceId:id,revision:expected+(creditInvoice||correctionAmount?2:1),eventId,...(paymentId&&action==='recordPayment'?{paymentId,receiptId:crypto.randomUUID()}: {})};
 const statements:D1PreparedStatement[]=[db.prepare(`INSERT OR IGNORE INTO invoice_finance_operations(group_id,operation_id,actor_id,action,request_hash,execution_id,result_json,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${authority.sql} AND EXISTS(SELECT 1 FROM invoices i LEFT JOIN invoice_finance_accounts f ON f.group_id=i.group_id AND f.invoice_id=i.id WHERE i.group_id=? AND i.id=? AND i.status='issued' AND coalesce(f.revision,0)=? AND f.voided_at IS NULL)`).bind(gid,operation,actor.id,action,hash,execution,JSON.stringify(result),now,...authority.args,gid,id,expected),
 db.prepare(`INSERT INTO invoice_finance_accounts(group_id,invoice_id,student_id,original_total_cents,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE ${guard.sql} AND NOT EXISTS(SELECT 1 FROM invoice_finance_accounts WHERE group_id=? AND invoice_id=?)`).bind(gid,id,invoice.studentId,invoice.totalCents,now,now,...guard.args,gid,id)];
 if(action==='recordPayment')statements.push(db.prepare(`INSERT INTO invoice_payments(id,group_id,invoice_id,student_id,amount_cents,paid_at,method,reference,notes,created_by,created_at,operation_id) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard.sql}`).bind(paymentId,gid,id,invoice.studentId,value,occurredAt,method,reference,notes,actor.id,now,operation,...guard.args));
 statements.push(eventStatement(actor,id,eventId,kind,value,paymentId,occurredAt,reason,notes,reference,now,operation,expected,guard,paymentId?method:''));
 if(creditInvoice)statements.push(eventStatement(actor,id,crypto.randomUUID(),'credit',value,null,occurredAt,reason,notes,reference,now,operation,expected+1,guard));
 if(correctionAmount)statements.push(eventStatement(actor,id,crypto.randomUUID(),correctionKind,correctionAmount,null,occurredAt,reason,notes,reference,now,operation,expected+1,guard));
 if(correction)statements.push(...correction.statements(guard,now,eventId));
 if(action==='recordPayment'){
  const year=malaysiaDate(now).slice(0,4),original=JSON.parse(invoice.documentJson) as InvoiceDocument,receipt:ReceiptDocument={id:result.receiptId!,number:'',invoiceId:id,invoiceNumber:original.number!,student:original.student,...(original.billTo?{billTo:original.billTo}:{}),...(original.extension?.printVersion===2?{printVersion:2 as const}:{}),institution:original.institution,currency:'MYR',amountCents:value,paidAt:occurredAt,method,reference,createdAt:now,serviceMonth:original.month,invoiceTotalCents:current.adjustedTotalCents,balanceAfterCents:current.remainingCents-value};
  statements.push(db.prepare(`INSERT INTO invoice_receipt_sequences(group_id,year,last_value) SELECT ?,?,1 WHERE ${guard.sql} ON CONFLICT(group_id,year) DO UPDATE SET last_value=last_value+1`).bind(gid,year,...guard.args));
  const numberSql="'RCT-'||?||'-'||printf('%06d',(SELECT last_value FROM invoice_receipt_sequences WHERE group_id=? AND year=?))";
  statements.push(db.prepare(`INSERT INTO invoice_receipts(id,group_id,invoice_id,payment_id,number,sequence_year,sequence_value,document_json,created_at) SELECT ?,?,?,?,${numberSql},?,(SELECT last_value FROM invoice_receipt_sequences WHERE group_id=? AND year=?),json_set(?,'$.number',${numberSql}),? WHERE ${guard.sql}`).bind(result.receiptId,gid,id,paymentId,year,gid,year,year,gid,year,JSON.stringify(receipt),year,gid,year,now,...guard.args),db.prepare(`UPDATE invoice_finance_operations SET result_json=json_set(result_json,'$.number',(SELECT number FROM invoice_receipts WHERE group_id=? AND id=?)) WHERE group_id=? AND operation_id=? AND execution_id=?`).bind(gid,result.receiptId,gid,operation,execution));
 }
 const auditInvoice=JSON.parse(invoice.documentJson) as InvoiceDocument,auditContext={student:auditInvoice.student.name,number:auditInvoice.number,month:auditInvoice.month},metadata={actorName:actor.name,objectName:[auditInvoice.student.name,auditInvoice.number||auditInvoice.month].filter(Boolean).join(' · ')};
 const paid='audit_f.received_cents-audit_f.reversed_cents-audit_f.refunded_cents+audit_f.prepayment_cents',total='audit_f.original_total_cents+audit_f.charge_cents-audit_f.credit_cents';
 statements.push(db.prepare(`INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) SELECT ?,?,?,?,?,?,json_set(?,'$.totalCents',${total},'$.status',CASE WHEN audit_f.voided_at IS NOT NULL THEN 'void' WHEN ${paid}>=${total} THEN 'paid' WHEN ${paid}>0 THEN 'partially_paid' ELSE 'unpaid' END,'$.number',coalesce((SELECT number FROM invoice_receipts WHERE group_id=? AND id=?),?)),? FROM invoice_finance_accounts audit_f WHERE audit_f.group_id=? AND audit_f.invoice_id=? AND ${guard.sql}`).bind(gid,crypto.randomUUID(),'invoice:'+id,actor.id,'invoice.finance.'+action,auditJson({...auditContext,status:current.status,totalCents:current.adjustedTotalCents,revision:current.revision}),auditJson({...auditContext,invoiceId:id,eventId,kind,amountCents:value,paymentId,reason,creditInvoice,revision:result.revision,...(correction?{correction:correction.details}: {})},metadata),gid,result.receiptId||null,auditInvoice.number,now,gid,id,...guard.args));
 try{const saved=await db.batch(statements);if(!saved[0].meta.changes){const repeated=await replay(actor,key,operation,hash);if(repeated)return repeated;throw new InvoiceFinanceError('收款、账单或权限已改变，请刷新后重试',409);}}
 catch(error){if(error instanceof InvoiceFinanceError)throw error;if(/invoice_finance_|invoice_correction_|invoice_source_locked|UNIQUE constraint failed/.test(String(error)))throw new InvoiceFinanceError('收款、账单或考勤资料已改变，请刷新后重试',409);throw error;}
 return await replay(actor,key,operation,hash)||result;
}
