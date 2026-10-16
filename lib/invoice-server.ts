import type {Account} from './auth';
import {learningDb} from './learning-server';
import {adminPermissionPredicate} from './admin-permission-access';
import {accountSessionPredicate} from './account-session';
import {OWNER_EMAIL} from './owner';
import {billingDate,billingMonth,malaysiaDate,type BillingLine} from './billing';
import {billingBasisSql,billingMonthBounds,invoiceBillingPreview} from './billing-server';
import {invoiceSettingsSnapshot} from './invoice-settings';
import {InvoiceError,invoiceAdditions,invoiceLessonDuration,invoicePrintLines,invoiceTotals,type InvoiceDetail,type InvoiceDocument,type InvoiceList,type InvoiceSummary,type InvoiceReview,type InvoiceStudent} from './invoice';

type Grant='invoices.view'|'invoices.create'|'invoices.edit'|'invoices.issue';
type Stored={id:string;studentId:string;month:string;status:'draft'|'issued';revision:number;sourceHash:string;sourceBasis:string;adjustmentBasis:string;documentJson:string};
const columns='id,student_id AS studentId,month,status,revision,source_hash AS sourceHash,source_basis_json AS sourceBasis,adjustment_basis_json AS adjustmentBasis,document_json AS documentJson';
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
function group(actor:Account){if(actor.role!=='admin'||!actor.groupId||!/^[a-z0-9-]{1,64}$/.test(actor.groupId))throw new InvoiceError('没有权限查看或修改账单',403);return actor.groupId;}
/** Live identity, group, session and configured grants are rechecked inside every write batch. */
export function invoiceAuthority(actor:Account,key:Grant='invoices.view'){
 const gid=group(actor),grant=adminPermissionPredicate(actor,key),view=adminPermissionPredicate(actor,'invoices.view'),session=accountSessionPredicate(actor);
 return{sql:`EXISTS(SELECT 1 FROM accounts ia JOIN tuition_groups ig ON ig.id=? AND ig.active=1 WHERE ia.id=? AND ia.role='admin' AND ia.disabled_at IS NULL AND (ia.group_id=ig.id OR lower(trim(ia.email))=? AND substr(ia.id,1,6)<>'local:') AND NOT EXISTS(SELECT 1 FROM local_credentials ic WHERE ic.account_id=ia.id AND ic.must_change_password=1)) AND (${view.sql}) AND (${grant.sql}) AND (${session.sql})`,args:[gid,actor.id,OWNER_EMAIL,...view.args,...grant.args,...session.args]};
}
export async function requireInvoicePermission(actor:Account,key:Grant='invoices.view'){const c=invoiceAuthority(actor,key);if(!await learningDb().prepare(`SELECT 1 WHERE ${c.sql}`).bind(...c.args).first())throw new InvoiceError('没有权限查看或修改账单',403);return group(actor);}
async function read<T>(actor:Account,key:Grant,query:string,...args:unknown[]){const c=invoiceAuthority(actor,key);return(await learningDb().prepare(`SELECT * FROM (${query}) WHERE ${c.sql}`).bind(...args,...c.args).all<T>()).results||[];}
async function stored(actor:Account,id:string,key:Grant='invoices.view'){if(!id||id.length>100)throw new InvoiceError('请选择有效账单');const item=(await read<Stored>(actor,key,`SELECT ${columns} FROM invoices WHERE group_id=? AND id=?`,group(actor),id))[0];if(!item){await requireInvoicePermission(actor,key);throw new InvoiceError('账单不存在或无权查看',404);}return item;}
const adjustmentSql=`SELECT coalesce(json_group_array(j),'[]') FROM(SELECT json_object('id',id,'lineId',line_id,'revision',revision,'amount',amount_cents,'basis',basis_hash,'reason',reason) AS j FROM billing_adjustments WHERE group_id=? AND student_id=? AND month=? ORDER BY line_id,revision)`;
const studentSql=`SELECT json_object('id',b.id,'name',b.student_name,'syllabus',s.syllabus_id,'grade',s.grade) FROM billing_students b JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name WHERE b.group_id=? AND b.id=?`;
async function sourceBasis(actor:Account,key:Grant,studentId:string,month:string){const bounds=billingMonthBounds(month),gid=group(actor);const result=(await read<{basis:string;adjustments:string;student:string}>(actor,key,`SELECT (${billingBasisSql}) AS basis,(${adjustmentSql}) AS adjustments,(${studentSql}) AS student`,gid,studentId,bounds.start,bounds.end,gid,studentId,month,gid,studentId))[0];if(!result?.student)throw new InvoiceError('学生不存在或无权访问',404);return result;}
async function digest(v:unknown){return[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v))))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function upcomingCount(basis:string){const parsed=JSON.parse(basis),decode=(value:unknown)=>typeof value==='string'?JSON.parse(value):value,sessions=(parsed.sessions||[]).map(decode) as {id:string;start:string|null;teaching:string;status:string}[],lessons=(parsed.lessons||[]).map(decode) as {session:string|null;actualStart:string|null;start:string;status:string;attendance:string|null}[];return lessons.filter(lesson=>{const session=sessions.find(item=>item.id===lesson.session);return lesson.status!=='cancelled'&&session?.status!=='cancelled'&&!session?.start&&!lesson.actualStart&&(session?.teaching==='pending'||lesson.status==='scheduled'||['pending','scheduled'].includes(lesson.attendance||''))&&Date.parse(lesson.start)>Date.now();}).length;}
function review(lines:BillingLine[],sourceChanged=false,upcoming=0):InvoiceReview{return{blockers:[...new Set([...lines.filter(l=>l.status==='pending').flatMap(l=>l.warnings.length?l.warnings:['fee_pending']),...(sourceChanged?['source_changed']:[]),...(upcoming?['future_lessons_pending']:[])])],sourceChanged,pendingCount:lines.filter(l=>l.status==='pending').length,completedUnbilledCount:lines.filter(l=>l.lessonId&&l.lessonStatus!=='cancelled'&&l.sessionStatus!=='cancelled'&&!['cancelled','pending','scheduled','absent','student_absent','teacher_absent'].includes(l.attendanceStatus)).length,replacementCount:lines.filter(l=>l.warnings.some(w=>w.startsWith('replacement_'))).length,upcomingCount:upcoming};}
async function loadSource(actor:Account,key:'invoices.create'|'invoices.edit'|'invoices.issue',studentId:string,month:string){
 const before=await sourceBasis(actor,key,studentId,month),snapshots=new Map<string,string>(),preview=await invoiceBillingPreview(actor,key,month,studentId,snapshots),after=await sourceBasis(actor,key,studentId,month);
 if(!preview.detail||before.basis!==after.basis||before.adjustments!==after.adjustments||before.student!==after.student||snapshots.get(studentId)!==after.basis)throw new InvoiceError('课次或收费资料刚有更改，请刷新后重试',409);
 const institution=await invoiceSettingsSnapshot(actor,{skipViewerCheck:true}),student=JSON.parse(after.student) as InvoiceStudent,sourceLines=preview.detail.lines.map(line=>({...line,displayDurationSeconds:invoiceLessonDuration(line)}));
 const sourceHash=await digest({basis:after.basis,adjustments:after.adjustments,student,institution,lines:sourceLines});
 return{...after,student,institution,sourceLines,sourceHash,review:review(sourceLines,false,upcomingCount(after.basis))};
}
function revision(v:unknown){if(!Number.isSafeInteger(v)||Number(v)<1)throw new InvoiceError('账单版本无效，请刷新后重试',409);return Number(v);}
function operationId(v:unknown){const id=str(v);if(!/^[A-Za-z0-9_-]{16,100}$/.test(id))throw new InvoiceError('操作编号无效，请重试');return id;}
function date(v:unknown){try{return billingDate(v);}catch{throw new InvoiceError('请选择有效付款截止日期');}}
function notes(v:unknown){const value=str(v);if(value.length>2000)throw new InvoiceError('备注最多 2,000 个字符');return value;}
async function replay(actor:Account,key:Grant,operation:string,hash:string){const row=(await read<{actorId:string;hash:string;result:string}>(actor,key,'SELECT actor_id AS actorId,request_hash AS hash,result_json AS result FROM invoice_operations WHERE group_id=? AND operation_id=?',group(actor),operation))[0];if(!row)return null;if(row.actorId!==actor.id||row.hash!==hash)throw new InvoiceError('操作编号已用于其他请求，请刷新后重试',409);return JSON.parse(row.result) as {ok:true;invoiceId:string;revision:number;number?:string};}
function operationGuard(gid:string,operation:string,execution:string){return{sql:'EXISTS(SELECT 1 FROM invoice_operations WHERE group_id=? AND operation_id=? AND execution_id=?)',args:[gid,operation,execution]};}
function basisGuard(gid:string,studentId:string,month:string,source:{basis:string;adjustments:string;student:InvoiceStudent;institution:{revision:number}}){const bounds=billingMonthBounds(month);return{sql:`(${billingBasisSql})=? AND (${adjustmentSql})=? AND (${studentSql})=? AND coalesce((SELECT revision FROM invoice_brand_settings WHERE group_id=?),0)=?`,args:[gid,studentId,bounds.start,bounds.end,source.basis,gid,studentId,month,source.adjustments,gid,studentId,JSON.stringify(source.student),gid,source.institution.revision]};}
export async function invoiceList(actor:Account,monthValue:string,pageValue=1,statusValue?:string):Promise<InvoiceList>{
 const gid=await requireInvoicePermission(actor),month=billingMonth(monthValue),pageSize=20;
 if(statusValue&&!['draft','issued'].includes(statusValue))throw new InvoiceError('账单状态无效');
 const condition=statusValue?' AND status=?':'',values=[gid,month,...(statusValue?[statusValue]:[])];
 const total=(await read<{total:number}>(actor,'invoices.view',`SELECT count(*) AS total FROM invoices WHERE group_id=? AND month=?${condition}`,...values))[0]?.total||0,pages=Math.max(1,Math.ceil(total/pageSize)),page=Math.min(pages,Math.max(1,Math.trunc(pageValue)||1));
 const rows=await read<InvoiceSummary>(actor,'invoices.view',`SELECT id,student_id AS studentId,json_extract(document_json,'$.student.name') AS student,month,status,revision,number,issued_at AS issuedAt,created_at AS createdAt,updated_at AS updatedAt,due_date AS dueDate,currency,total_cents AS totalCents,json_extract(document_json,'$.lessonCount') AS lessonCount,json_extract(document_json,'$.durationSeconds') AS durationSeconds FROM invoices WHERE group_id=? AND month=?${condition} ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?`,...values,pageSize,(page-1)*pageSize);
 return{items:rows,total,page,pageSize,pages};
}export async function invoiceStudents(actor:Account,pageValue=1){const gid=await requireInvoicePermission(actor,'invoices.create'),pageSize=20,total=(await read<{total:number}>(actor,'invoices.create','SELECT count(*) AS total FROM billing_students WHERE group_id=?',gid))[0]?.total||0,pages=Math.max(1,Math.ceil(total/pageSize)),page=Math.min(pages,Math.max(1,Math.trunc(pageValue)||1));return{items:await read<{studentId:string;student:string}>(actor,'invoices.create','SELECT id AS studentId,student_name AS student FROM billing_students WHERE group_id=? ORDER BY lower(student_name),id LIMIT ? OFFSET ?',gid,pageSize,(page-1)*pageSize),total,page,pageSize,pages};}
export async function invoiceDetail(actor:Account,id:string):Promise<InvoiceDetail>{await requireInvoicePermission(actor);const item=await stored(actor,id),invoice=JSON.parse(item.documentJson) as InvoiceDocument;if(item.status==='issued')return{invoice,review:{blockers:[],sourceChanged:false,pendingCount:0,completedUnbilledCount:0,replacementCount:0,upcomingCount:0}};const current=await sourceBasis(actor,'invoices.view',item.studentId,item.month),institution=await invoiceSettingsSnapshot(actor,{skipViewerCheck:true}),changed=current.basis!==item.sourceBasis||current.adjustments!==item.adjustmentBasis||current.student!==JSON.stringify(invoice.student)||institution.revision!==invoice.institution.revision;return{invoice,review:review(invoice.sourceLines,changed,upcomingCount(current.basis))};}
function itemStatements(document:InvoiceDocument,guard:{sql:string;args:unknown[]}){const db=learningDb(),gid=document.groupId,id=document.id,items=[...document.sourceLines.map(line=>({kind:'fee',sourceId:line.id,amount:line.amountCents??0,value:line})),...document.additions.map(line=>({kind:line.kind,sourceId:null,amount:line.kind==='discount'?-line.amountCents:line.amountCents,value:line}))];return[db.prepare(`DELETE FROM invoice_items WHERE group_id=? AND invoice_id=? AND ${guard.sql}`).bind(gid,id,...guard.args),...items.map((item,i)=>db.prepare(`INSERT INTO invoice_items(id,group_id,invoice_id,position,kind,source_id,amount_cents,snapshot_json) SELECT ?,?,?,?,?,?,?,? WHERE ${guard.sql}`).bind(crypto.randomUUID(),gid,id,i,item.kind,item.sourceId,item.amount,JSON.stringify(item.value),...guard.args))];}
function audit(actor:Account,action:string,id:string,data:unknown,now:string,guard:{sql:string;args:unknown[]}){return learningDb().prepare(`INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) SELECT ?,?,?,?,?,?,? WHERE ${guard.sql}`).bind(group(actor),crypto.randomUUID(),'invoice:'+id,actor.id,'invoice.'+action,JSON.stringify(data),now,...guard.args);}

export async function saveInvoice(actor:Account,data:Record<string,unknown>){
 const action=str(data.action),key:Grant=action==='generate'?'invoices.create':action==='issue'?'invoices.issue':'invoices.edit',gid=await requireInvoicePermission(actor,key);
 if('groupId'in data&&data.groupId!==gid)throw new InvoiceError('没有权限修改其他集团的账单',403);
 if(!['generate','refresh','save','issue','delete'].includes(action))throw new InvoiceError('未知账单操作');
 const operation=operationId(data.operationId),requestHash=await digest(data),old=await replay(actor,key,operation,requestHash);if(old)return old;
 const db=learningDb(),now=new Date().toISOString(),execution=crypto.randomUUID(),authority=invoiceAuthority(actor,key),guard=operationGuard(gid,operation,execution);
 let result:{ok:true;invoiceId:string;revision:number;number?:string;deleted?:boolean},statements:D1PreparedStatement[];
 if(action==='delete'){
  const id=str(data.invoiceId),item=await stored(actor,id,key),expected=revision(data.revision);
  if(item.status!=='draft')throw new InvoiceError('正式账单不能删除，只能删除草稿',409);
  if(item.revision!==expected)throw new InvoiceError('账单已被其他管理员更新，请刷新后重试',409);
  result={ok:true,invoiceId:id,revision:expected,deleted:true};
  statements=[
   db.prepare(`INSERT OR IGNORE INTO invoice_operations(group_id,operation_id,actor_id,action,request_hash,execution_id,result_json,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${authority.sql} AND EXISTS(SELECT 1 FROM invoices WHERE group_id=? AND id=? AND status='draft' AND revision=?)`).bind(gid,operation,actor.id,action,requestHash,execution,JSON.stringify(result),now,...authority.args,gid,id,expected),
   audit(actor,action,id,{studentId:item.studentId,month:item.month,revision:expected,deleted:true},now,guard),
   db.prepare(`DELETE FROM invoices WHERE group_id=? AND id=? AND status='draft' AND revision=? AND ${guard.sql}`).bind(gid,id,expected,...guard.args),
  ];
 }else if(action==='generate'){
  const studentId=str(data.studentId),month=billingMonth(data.month);if(!studentId||studentId.length>100)throw new InvoiceError('请选择学生');
  const existing=(await read<Stored>(actor,key,`SELECT ${columns} FROM invoices WHERE group_id=? AND student_id=? AND month=?`,gid,studentId,month))[0];
  if(existing)return{ok:true,invoiceId:existing.id,revision:existing.revision};
  const source=await loadSource(actor,'invoices.create',studentId,month),id=crypto.randomUUID(),dueDate=new Date(Date.parse(malaysiaDate(now)+'T00:00:00Z')+source.institution.dueDays*86400000).toISOString().slice(0,10),lines=invoicePrintLines(source.sourceLines),totals=invoiceTotals(source.sourceLines,[]);
  const document:InvoiceDocument={id,groupId:gid,studentId,student:source.student,month,status:'draft',revision:1,number:null,issuedAt:null,createdAt:now,updatedAt:now,dueDate,notes:source.institution.invoiceNote,currency:'MYR',institution:source.institution,sourceHash:source.sourceHash,sourceLines:source.sourceLines,lines,additions:[],...totals,lessonCount:lines.reduce((n,l)=>n+l.lessonCount,0),durationSeconds:lines.reduce((n,l)=>n+l.durationSeconds,0),extension:{schemaVersion:1,receiptIds:[],eInvoice:null}};
  result={ok:true,invoiceId:id,revision:1};const basis=basisGuard(gid,studentId,month,source);
  statements=[db.prepare(`INSERT OR IGNORE INTO invoice_operations(group_id,operation_id,actor_id,action,request_hash,execution_id,result_json,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${authority.sql} AND ${basis.sql} AND NOT EXISTS(SELECT 1 FROM invoices WHERE group_id=? AND student_id=? AND month=?)`).bind(gid,operation,actor.id,action,requestHash,execution,JSON.stringify(result),now,...authority.args,...basis.args,gid,studentId,month),db.prepare(`INSERT INTO invoices(id,group_id,student_id,month,status,revision,created_at,updated_at,created_by,due_date,notes,currency,source_hash,source_basis_json,adjustment_basis_json,document_json,total_cents,extension_json) SELECT ?,?,?,?,'draft',1,?,?,?,?,?,'MYR',?,?,?,?,?,? WHERE ${guard.sql}`).bind(id,gid,studentId,month,now,now,actor.id,dueDate,document.notes,source.sourceHash,source.basis,source.adjustments,JSON.stringify(document),document.totalCents,JSON.stringify(document.extension),...guard.args),...itemStatements(document,guard),audit(actor,action,id,{studentId,month,revision:1},now,guard)];
 }else{
  const id=str(data.invoiceId),item=await stored(actor,id,key),expected=revision(data.revision),document=JSON.parse(item.documentJson) as InvoiceDocument;
  if(item.status!=='draft')throw new InvoiceError('正式账单不能直接修改；更正须使用账单调整流程',409);
  if(item.revision!==expected)throw new InvoiceError('账单已被其他管理员更新，请刷新后重试',409);
  let source:Awaited<ReturnType<typeof loadSource>>|null=null;
  if(action==='refresh'||action==='issue')source=await loadSource(actor,key as 'invoices.edit'|'invoices.issue',item.studentId,item.month);
  if(action==='refresh'&&source){document.student=source.student;document.institution=source.institution;document.sourceLines=source.sourceLines;document.sourceHash=source.sourceHash;document.lines=invoicePrintLines(source.sourceLines);Object.assign(document,invoiceTotals(source.sourceLines,document.additions));document.lessonCount=document.lines.reduce((n,l)=>n+l.lessonCount,0);document.durationSeconds=document.lines.reduce((n,l)=>n+l.durationSeconds,0);}
  if(action==='save'){document.additions=invoiceAdditions(data.additions);document.notes=notes(data.notes);document.dueDate=date(data.dueDate);Object.assign(document,invoiceTotals(document.sourceLines,document.additions));}
  if(action==='issue'){
   if(!source||str(data.expectedSourceHash)!==item.sourceHash||source.sourceHash!==item.sourceHash)throw new InvoiceError('课次、费率或机构资料已有更改，请先更新草稿后核对',409);
   if(source.review.upcomingCount)throw new InvoiceError('本月仍有尚未完成的课程，可先保存草稿，待课程完成后正式开单',409);
   if(source.review.blockers.length)throw new InvoiceError('仍有待核对的考勤、收费或补课项目，请先处理后正式开单',409);
   if(!source.sourceLines.length&&!document.additions.length)throw new InvoiceError('空白账单不能正式发出');
   if(!document.institution.institutionName.trim())throw new InvoiceError('请先填写机构名称');
  }
  document.revision=expected+1;document.updatedAt=now;result={ok:true,invoiceId:id,revision:document.revision};
  const basis=source?basisGuard(gid,item.studentId,item.month,source):null;
  statements=[db.prepare(`INSERT OR IGNORE INTO invoice_operations(group_id,operation_id,actor_id,action,request_hash,execution_id,result_json,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${authority.sql} AND EXISTS(SELECT 1 FROM invoices WHERE group_id=? AND id=? AND status='draft' AND revision=?)${basis?` AND ${basis.sql}`:''}`).bind(gid,operation,actor.id,action,requestHash,execution,JSON.stringify(result),now,...authority.args,gid,id,expected,...(basis?.args||[]))];
  if(action==='issue'){
   const year=malaysiaDate(now).slice(0,4),prefix=document.institution.invoicePrefix;
   statements.push(db.prepare(`INSERT INTO invoice_sequences(group_id,year,last_value) SELECT ?,?,1 WHERE ${guard.sql} ON CONFLICT(group_id,year) DO UPDATE SET last_value=last_value+1`).bind(gid,year,...guard.args));
   // Sequence and issued original are committed together. Failed issue batches never consume a number.
   const numberSql="?||'-'||?||'-'||printf('%06d',(SELECT last_value FROM invoice_sequences WHERE group_id=? AND year=?))";
   statements.push(db.prepare(`UPDATE invoices SET status='issued',revision=?,number=${numberSql},sequence_year=?,sequence_value=(SELECT last_value FROM invoice_sequences WHERE group_id=? AND year=?),issued_at=?,issued_by=?,updated_at=?,document_json=json_set(?, '$.status','issued','$.revision',?,'$.number',${numberSql},'$.issuedAt',?,'$.updatedAt',?) WHERE group_id=? AND id=? AND status='draft' AND revision=? AND ${guard.sql}`).bind(document.revision,prefix,year,gid,year,year,gid,year,now,actor.id,now,JSON.stringify(document),document.revision,prefix,year,gid,year,now,now,gid,id,expected,...guard.args));
   const locks=new Map<string,{type:string;id:string}>();locks.set('student_month:'+item.studentId,{type:'student_month',id:item.studentId});
   for(const line of document.sourceLines){for(const [type,sourceId] of [['lesson',line.lessonId],['session',line.sessionId],['rate',line.rateVersionId]] as const)if(sourceId)locks.set(type+':'+sourceId,{type,id:sourceId});}
   // Replacement originals and children outside the billed month still affect whether a fee may be charged.
   // The same full basis used by the compare-and-swap guard defines the immutable source set.
   for(const value of JSON.parse(source!.basis).lessons||[]){const lesson=typeof value==='string'?JSON.parse(value):value;for(const [type,sourceId] of [['lesson',lesson.id],['session',lesson.session]])if(typeof sourceId==='string'&&sourceId)locks.set(type+':'+sourceId,{type,id:sourceId});}
   statements.push(...[...locks.values()].map(lock=>db.prepare(`INSERT INTO invoice_source_locks(group_id,invoice_id,source_type,source_id,student_id,month,created_at) SELECT ?,?,?,?,?,?,? WHERE ${guard.sql}`).bind(gid,id,lock.type,lock.id,item.studentId,item.month,now,...guard.args)),db.prepare(`UPDATE invoice_operations SET result_json=json_set(result_json,'$.number',(SELECT number FROM invoices WHERE group_id=? AND id=?)) WHERE ${guard.sql}`).bind(gid,id,...guard.args));
  }else{
   statements.push(db.prepare(`UPDATE invoices SET revision=?,updated_at=?,due_date=?,notes=?,source_hash=?,source_basis_json=?,adjustment_basis_json=?,document_json=?,total_cents=? WHERE group_id=? AND id=? AND status='draft' AND revision=? AND ${guard.sql}`).bind(document.revision,now,document.dueDate,document.notes,document.sourceHash,source?.basis||item.sourceBasis,source?.adjustments||item.adjustmentBasis,JSON.stringify(document),document.totalCents,gid,id,expected,...guard.args),...itemStatements(document,guard));
  }
  statements.push(audit(actor,action,id,{revision:document.revision,month:item.month,totalCents:document.totalCents,...(action==='save'?{additions:document.additions}:{}),...(action==='issue'?{lockedMonth:item.month}:{})},now,guard));
 }
 const saved=await db.batch(statements);
 if(!saved[0].meta.changes){const repeated=await replay(actor,key,operation,requestHash);if(repeated)return repeated;if(action==='generate'){const found=(await read<{id:string;revision:number}>(actor,key,'SELECT id,revision FROM invoices WHERE group_id=? AND student_id=? AND month=?',gid,str(data.studentId),str(data.month)))[0];if(found)return{ok:true,invoiceId:found.id,revision:found.revision};}throw new InvoiceError('账单、收费依据或权限已改变，请刷新后重试',409);}
 return await replay(actor,key,operation,requestHash)||result;
}
