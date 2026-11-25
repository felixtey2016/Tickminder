import type {Account} from './auth';
import {learningDb} from './learning-server';
import {billingBasisSql,billingMonthBounds,invoiceBillingPreview} from './billing-server';
import {financeAuthority,requireFinancePermission} from './invoice-finance-server';
import {InvoiceFinanceError} from './invoice-finance';
import type {InvoiceDocument} from './invoice';
import type {BillingLine} from './billing';
import {digest} from './prepayment-access';
import type {InvoiceMonthlyExtraRow,InvoiceMonthlyExtraView,InvoiceMonthlyExtraResult} from './invoice-monthly-extra';

type SourceFact={id:string;start:string;end:string;subject:string;replacement:string|null};
type Decision={id:string;subjectKey:string;confirmed:number;source:string};
type Stored={id:string;studentId:string;month:string;total:number;revision:number;adjusted:number;document:string};
const identifier=(value:unknown)=>{if(typeof value!=='string'||!/^[A-Za-z0-9:_-]{1,100}$/.test(value))throw new InvoiceFinanceError('请选择有效账单');return value;};
async function read<T>(actor:Account,key:string,sql:string,...args:unknown[]){const a=financeAuthority(actor,key);return(await learningDb().prepare(`SELECT * FROM (${sql}) WHERE ${a.sql}`).bind(...args,...a.args).all<T>()).results||[];}
export const monthlyExtraBasisSql=`SELECT json_object('billing',json((${billingBasisSql})),
 'adjustments',(SELECT json_group_array(json(j)) FROM(SELECT json_object('id',id,'line',line_id,'revision',revision,'amount',amount_cents,'basis',basis_hash) AS j FROM billing_adjustments WHERE group_id=? AND student_id=? AND month=? ORDER BY id)),
 'decisions',(SELECT json_group_array(json(j)) FROM(SELECT json_object('id',id,'subjectKey',subject_key,'confirmed',confirmed_excess_count,'source',source_json) AS j FROM invoice_monthly_extra_decisions WHERE group_id=? AND invoice_id=? ORDER BY id)),
 'finance',(SELECT json_object('revision',coalesce(f.revision,0),'charge',coalesce(f.charge_cents,0),'credit',coalesce(f.credit_cents,0),'voided',f.voided_at,'status',i.status,'scope',i.billing_scope) FROM invoices i LEFT JOIN invoice_finance_accounts f ON f.group_id=i.group_id AND f.invoice_id=i.id WHERE i.group_id=? AND i.id=?))`;
async function snapshot(actor:Account,key:string,invoice:Stored){const b=billingMonthBounds(invoice.month),args=[actor.groupId,invoice.studentId,b.start,b.end,actor.groupId,invoice.studentId,invoice.month,actor.groupId,invoice.id,actor.groupId,invoice.id],row=(await read<{basis:string}>(actor,key,`SELECT (${monthlyExtraBasisSql}) AS basis`,...args))[0];if(!row)throw new InvoiceFinanceError('没有权限查看账单',403);return{basis:row.basis,args};}
function facts(basis:unknown,ids:string[]):SourceFact[]{const data=basis as {lessons:unknown[]};return(data.lessons||[]).map(v=>typeof v==='string'?JSON.parse(v):v).filter((v:{id:string})=>ids.includes(v.id)).map((v:SourceFact)=>({id:v.id,start:v.start,end:v.end,subject:v.subject,replacement:v.replacement||null})).sort((a,b)=>a.id.localeCompare(b.id));}
function initialFacts(lines:BillingLine[],ids:string[]):SourceFact[]{return lines.filter(line=>Boolean(line.lessonId&&ids.includes(line.lessonId))).map(line=>({id:line.lessonId!,start:line.plannedStart||'',end:line.plannedEnd||'',subject:line.subject,replacement:line.replacementFor||null})).sort((a,b)=>a.id.localeCompare(b.id));}
async function prepare(actor:Account,invoiceIdValue:unknown,key='invoices.view'){
 const gid=await requireFinancePermission(actor,key),invoiceId=identifier(invoiceIdValue),invoice=(await read<Stored>(actor,key,`SELECT i.id,i.student_id AS studentId,i.month,i.total_cents AS total,i.document_json AS document,coalesce(f.revision,0) AS revision,i.total_cents+coalesce(f.charge_cents,0)-coalesce(f.credit_cents,0) AS adjusted FROM invoices i LEFT JOIN invoice_finance_accounts f ON f.group_id=i.group_id AND f.invoice_id=i.id WHERE i.group_id=? AND i.id=? AND i.status='issued' AND i.billing_scope='monthly' AND f.voided_at IS NULL`,gid,invoiceId))[0];
 if(!invoice)throw new InvoiceFinanceError('请选择未作废的独立月费账单',404);
 const before=await snapshot(actor,key,invoice),preview=await invoiceBillingPreview(actor,key==='invoices.adjust'?'invoices.adjust':'invoices.view',invoice.month,invoice.studentId),original=JSON.parse(invoice.document) as InvoiceDocument,data=JSON.parse(before.basis) as {billing:unknown;decisions:Decision[]};
 const current=new Map<string,BillingLine>();for(const line of preview.detail?.lines||[])if(line.mode==='month'&&line.monthlyAllowance)current.set(line.subjectKey,line);
 const rows:InvoiceMonthlyExtraRow[]=[],sources=new Map<string,string>();
 for(const [subjectKey,line]of current){
  const old=original.sourceLines.filter(row=>row.mode==='month'&&row.subjectKey===subjectKey),base=old.find(row=>row.monthlyAllowance);if(!base?.monthlyAllowance)continue;
  const allowance=line.monthlyAllowance!,decisions=data.decisions.filter(row=>row.subjectKey===subjectKey).sort((a,b)=>b.confirmed-a.confirmed),last=decisions[0],originalExtra=old.find(row=>row.monthlyExtra&&row.status!=='pending'&&row.amountCents!==null),alreadyConfirmedExcess=last?.confirmed??originalExtra?.monthlyAllowance?.extraSessions??0;
  const reasons=new Set<string>(allowance.reviewReasons),oldSource=last?JSON.parse(last.source) as {lessonFacts:SourceFact[];allowance:{includedSessions:number;rateVersionIds:string[]}}:{lessonFacts:initialFacts(old,base.monthlyAllowance.lessonIds),allowance:base.monthlyAllowance};
  const currentFacts=facts(data.billing,allowance.lessonIds),byId=new Map(currentFacts.map(row=>[row.id,row]));
  if(oldSource.lessonFacts.some(row=>JSON.stringify(row)!==JSON.stringify(byId.get(row.id))))reasons.add('previous_schedule_changed');
  if(allowance.extraSessions<alreadyConfirmedExcess)reasons.add('previous_extra_count_changed');
  if(allowance.includedSessions!==oldSource.allowance.includedSessions||JSON.stringify(allowance.rateVersionIds)!==JSON.stringify(oldSource.allowance.rateVersionIds))reasons.add('monthly_rate_changed');
  for(const warning of line.warnings)if(!['monthly_extra_review','adjustment_stale'].includes(warning))reasons.add(warning);
  const source=JSON.stringify({allowance,lessonFacts:currentFacts}),basisHash=await digest({basis:before.basis,invoiceId,subjectKey,alreadyConfirmedExcess,source});sources.set(subjectKey,source);
  rows.push({subjectKey,subject:line.subject,rateVersionId:allowance.rateVersionIds.length===1?allowance.rateVersionIds[0]:'',allowance,alreadyConfirmedExcess,newExtraSessions:Math.max(0,allowance.extraSessions-alreadyConfirmedExcess),reviewRequired:reasons.size>0,reviewReasons:[...reasons],basisHash});
 }
 await requireFinancePermission(actor,key);if((await snapshot(actor,key,invoice)).basis!==before.basis)throw new InvoiceFinanceError('月费课次或账单已改变，请刷新重试',409);
 const view:InvoiceMonthlyExtraView={invoiceId,studentId:invoice.studentId,month:invoice.month,invoiceRevision:invoice.revision,rows};return{view,invoice,sources,...before};
}
export async function invoiceMonthlyExtras(actor:Account,invoiceId:string){return(await prepare(actor,invoiceId)).view;}
export async function confirmInvoiceMonthlyExtra(actor:Account,data:Record<string,unknown>):Promise<InvoiceMonthlyExtraResult>{
 const key='invoices.adjust',gid=await requireFinancePermission(actor,key);if(data.action!=='confirmMonthlyExtra')throw new InvoiceFinanceError('未知月费确认操作');if(data.groupId!==undefined&&data.groupId!==gid)throw new InvoiceFinanceError('不能修改其他集团账单',403);
 const operation=typeof data.operationId==='string'?data.operationId:'';if(!/^[A-Za-z0-9_-]{16,100}$/.test(operation))throw new InvoiceFinanceError('操作编号无效');const hash=await digest(data);
 const replay=async()=>{const old=(await read<{actorId:string;hash:string;result:string}>(actor,key,'SELECT actor_id AS actorId,request_hash AS hash,result_json AS result FROM invoice_finance_operations WHERE group_id=? AND operation_id=?',gid,operation))[0];if(!old)return null;if(old.actorId!==actor.id||old.hash!==hash)throw new InvoiceFinanceError('操作编号已用于其他请求',409);return JSON.parse(old.result) as InvoiceMonthlyExtraResult;};const previous=await replay();if(previous)return previous;
 const prepared=await prepare(actor,data.invoiceId,key),{invoice,view}=prepared,subjectKey=typeof data.subjectKey==='string'?data.subjectKey:'',row=view.rows.find(item=>item.subjectKey===subjectKey);
 if(!row||row.reviewRequired||row.newExtraSessions<=0)throw new InvoiceFinanceError('没有可确认的新超额课次，或原课次变化需要人工核对',409);
 if(data.expectedBasis!==row.basisHash||data.invoiceRevision!==invoice.revision)throw new InvoiceFinanceError('月费课次或账单已改变，请刷新重试',409);
 const amount=data.amountCents;if(!Number.isSafeInteger(amount)||Number(amount)<0||Number(amount)>100000000||invoice.adjusted+Number(amount)>100000000)throw new InvoiceFinanceError('请填写有效额外收费总金额；免收填写0');
 const reason=typeof data.reason==='string'?data.reason.trim():'';if(!reason||reason.length>1000||/[\u0000-\u001f\u007f]/.test(reason))throw new InvoiceFinanceError('请填写确认原因，最多1000字');
 const now=new Date().toISOString(),execution=crypto.randomUUID(),decisionId=crypto.randomUUID(),eventId=amount?crypto.randomUUID():null,result:InvoiceMonthlyExtraResult={ok:true,invoiceId:invoice.id,invoiceRevision:invoice.revision+(eventId?1:0),decisionId,eventId,approvedAmountCents:Number(amount),confirmedExcessCount:row.allowance.extraSessions},auth=financeAuthority(actor,key),guard='EXISTS(SELECT 1 FROM invoice_finance_operations WHERE group_id=? AND operation_id=? AND execution_id=?)',guardArgs=[gid,operation,execution],db=learningDb();
 const statements:D1PreparedStatement[]=[db.prepare(`INSERT OR IGNORE INTO invoice_finance_operations(group_id,operation_id,actor_id,action,request_hash,execution_id,result_json,created_at) SELECT ?,?,?,'confirmMonthlyExtra',?,?,?,? WHERE ${auth.sql} AND (${monthlyExtraBasisSql})=?`).bind(gid,operation,actor.id,hash,execution,JSON.stringify(result),now,...auth.args,...prepared.args,prepared.basis),db.prepare(`INSERT INTO invoice_finance_accounts(group_id,invoice_id,student_id,original_total_cents,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE ${guard} AND NOT EXISTS(SELECT 1 FROM invoice_finance_accounts WHERE group_id=? AND invoice_id=?)`).bind(gid,invoice.id,invoice.studentId,invoice.total,now,now,...guardArgs,gid,invoice.id)];
 if(eventId)statements.push(db.prepare(`INSERT INTO invoice_finance_events(id,group_id,invoice_id,payment_id,kind,amount_cents,occurred_at,method,reason,notes,reference,actor_id,created_at,operation_id,expected_revision) SELECT ?,?,?,NULL,'charge',?,?,'',?,'','',?,?,?,? WHERE ${guard}`).bind(eventId,gid,invoice.id,amount,now,reason,actor.id,now,operation,invoice.revision,...guardArgs));
 statements.push(db.prepare(`INSERT INTO invoice_monthly_extra_decisions(id,group_id,invoice_id,student_id,subject_key,rate_version_id,included_sessions,scheduled_sessions,previous_excess_count,confirmed_excess_count,amount_cents,basis_hash,source_json,operation_id,event_id,reason,actor_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(decisionId,gid,invoice.id,invoice.studentId,subjectKey,row.rateVersionId,row.allowance.includedSessions,row.allowance.scheduledSessions,row.alreadyConfirmedExcess,row.allowance.extraSessions,amount,row.basisHash,prepared.sources.get(subjectKey),operation,eventId,reason,actor.id,now,...guardArgs),db.prepare(`INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) SELECT ?,?,?,?,'invoice.confirmMonthlyExtra',?,? WHERE ${guard}`).bind(gid,crypto.randomUUID(),'invoice:'+invoice.id,actor.id,JSON.stringify({decisionId,eventId,subjectKey,amountCents:amount,confirmedExcessCount:row.allowance.extraSessions}),now,...guardArgs));
 try{const saved=await db.batch(statements);if(!saved[0].meta.changes){const repeated=await replay();if(repeated)return repeated;throw new InvoiceFinanceError('课次、账单或权限已改变，请刷新重试',409);}}
 catch(error){if(error instanceof InvoiceFinanceError)throw error;if(/invoice_monthly_extra_|invoice_finance_|constraint failed/.test(String(error)))throw new InvoiceFinanceError('额外收费资料已改变，请刷新重试',409);throw error;}
 await requireFinancePermission(actor,key);return result;
}
