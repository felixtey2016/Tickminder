import type {Account} from './auth';
import {learningDb} from './learning-server';
import {billingDate,malaysiaDate} from './billing';
import {PAYMENT_METHODS,type PaymentMethod} from './invoice-finance';
import {PrepaymentError,type PrepaymentResult,type PrepaymentRequestDocument,type PrepaymentReceiptDocument,type PrepaymentPayment} from './prepayments';
import {str,id,limited,cents,rev,timestamp,digest,prepaymentAuthority,requirePrepaymentPermission,prepaymentRead,prepaymentStudent,prepaymentInstitution,prepaymentBalance,type PrepaymentGuard} from './prepayment-access';
import {estimatePrepayment,requestSource,prepaymentBasisSql} from './prepayment-estimate';
import {storedPrepaymentRequest,paymentSql,paymentResult} from './prepayment-read';
export {requirePrepaymentPermission} from './prepayment-access';
export {prepaymentStudents,prepaymentRequests,prepaymentLedger,prepaymentOverview,prepaymentRequestDetail,prepaymentReceiptDetail,prepaymentAllocationPreview,prepaymentPayments,prepaymentAllocations} from './prepayment-read';
export async function prepaymentPreview(actor:Account,studentId:string,month:string,subjectKey='',monthlyReviewed=false){await requirePrepaymentPermission(actor);const {document,blockers}=await estimatePrepayment(actor,id(studentId,'学生'),month,subjectKey,monthlyReviewed);await requirePrepaymentPermission(actor);return{document,blockers};}
const grants:Record<string,string>={saveRequest:'prepayments.manage',issueRequest:'prepayments.manage',deleteRequest:'prepayments.manage',voidRequest:'prepayments.manage',recordPayment:'prepayments.record',refund:'prepayments.refund',reversePayment:'prepayments.reverse',apply:'prepayments.apply',release:'prepayments.apply'};
async function replay(actor:Account,key:string,operation:string,hash:string){const row=(await prepaymentRead<{actorId:string;hash:string;resultJson:string}>(actor,key,'SELECT actor_id AS actorId,request_hash AS hash,result_json AS resultJson FROM prepayment_operations WHERE group_id=? AND operation_id=?',actor.groupId,operation))[0];if(!row)return null;if(row.actorId!==actor.id||row.hash!==hash)throw new PrepaymentError('操作编号已用于其他请求，请刷新重试',409);return JSON.parse(row.resultJson) as PrepaymentResult;}
export async function savePrepayment(actor:Account,data:Record<string,unknown>):Promise<PrepaymentResult>{
 const action=str(data.action),key=grants[action];if(!key)throw new PrepaymentError('未知预收操作');const gid=await requirePrepaymentPermission(actor,key);
 if('groupId'in data&&data.groupId!==gid)throw new PrepaymentError('没有权限修改其他集团的预收记录',403);
 const operation=str(data.operationId);if(!/^[A-Za-z0-9_-]{16,100}$/.test(operation))throw new PrepaymentError('操作编号无效，请刷新重试');
 const hash=await digest(data),previous=await replay(actor,key,operation,hash);if(previous)return previous;
 const db=learningDb(),now=new Date().toISOString(),execution=crypto.randomUUID(),a=prepaymentAuthority(actor,key),guard:PrepaymentGuard={sql:'EXISTS(SELECT 1 FROM prepayment_operations WHERE group_id=? AND operation_id=? AND execution_id=?)',args:[gid,operation,execution]};
 let result:PrepaymentResult={ok:true},live='1',liveArgs:unknown[]=[],studentId='',statements:D1PreparedStatement[]=[],audit:Record<string,unknown>={action};
 const when=(sql:string,...args:unknown[])=>{live+=' AND ('+sql+')';liveArgs.push(...args);};
 const guarded=(sql:string,args:unknown[])=>db.prepare(sql+' WHERE '+guard.sql).bind(...args,...guard.args);
 if(['saveRequest','issueRequest','deleteRequest','voidRequest'].includes(action)){
  const existing=data.requestId?await storedPrepaymentRequest(actor,id(data.requestId,'预收费单'),key):null;
  if(action!=='saveRequest'&&!existing)throw new PrepaymentError('请选择预收费单');
  if(existing){const expected=rev(data.revision);if(expected!==existing.revision)throw new PrepaymentError('预收费单已改变，请刷新重试',409);when('EXISTS(SELECT 1 FROM prepayment_requests WHERE group_id=? AND id=? AND revision=? AND status=?)',gid,existing.id,expected,existing.status);studentId=existing.studentId;}
  const requestId=existing?.id||crypto.randomUUID();result={ok:true,requestId,revision:(existing?.revision||0)+1};audit={...audit,requestId,studentId};
  if(action==='saveRequest'){
   if(existing&&existing.status!=='draft')throw new PrepaymentError('已发出的预收费单不能修改',409);
   studentId=existing?.studentId||id(data.studentId,'学生');if(existing&&data.studentId!==undefined&&data.studentId!==studentId)throw new PrepaymentError('不能更改预收费单学生');
   if(data.monthlyReviewed!==undefined&&typeof data.monthlyReviewed!=='boolean')throw new PrepaymentError('请选择月费人工核对状态');
   const old=existing?JSON.parse(existing.documentJson) as PrepaymentRequestDocument:null,preview=await estimatePrepayment(actor,studentId,str(data.month),str(data.subjectKey),data.monthlyReviewed===true,key);
   if(data.expectedSourceHash!==undefined&&data.expectedSourceHash!==preview.document.sourceHash)throw new PrepaymentError('排课或收费资料已改变，请重新预览再保存',409);if(preview.blockers.some(b=>b!=='monthly_manual_review'))throw new PrepaymentError('请先处理课次收费资料：'+preview.blockers.join(', '));
   let dueDate=preview.document.dueDate;if(data.dueDate!==undefined){try{dueDate=billingDate(data.dueDate);}catch{throw new PrepaymentError('请选择有效到期日期');}}
   const document:PrepaymentRequestDocument={...preview.document,id:requestId,revision:result.revision!,createdAt:old?.createdAt||now,updatedAt:now,dueDate,notes:limited(data.notes,2000,'预收费单备注'),printUrl:'/api/prepayments/requests/'+requestId+'/print?groupId='+encodeURIComponent(gid)};
   when(`(${prepaymentBasisSql})=?`,...preview.basisArgs,preview.basis);
   if(existing)statements.push(db.prepare('SELECT 1'));
   else statements.push(guarded('INSERT INTO prepayment_requests(id,group_id,student_id,month,subject_key,status,revision,source_hash,source_basis_json,document_json,total_cents,created_by,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?',[requestId,gid,studentId,document.month,document.subjectKey,'draft',document.revision,document.sourceHash,preview.basis,JSON.stringify(document),document.totalCents,actor.id,now,now]));
   if(existing)statements[0]=db.prepare('UPDATE prepayment_requests SET month=?,subject_key=?,revision=?,source_hash=?,source_basis_json=?,document_json=?,total_cents=?,updated_at=? WHERE group_id=? AND id=? AND '+guard.sql).bind(document.month,document.subjectKey,document.revision,document.sourceHash,preview.basis,JSON.stringify(document),document.totalCents,now,gid,requestId,...guard.args);
  }else if(action==='issueRequest'){
   if(existing!.status!=='draft')throw new PrepaymentError('只有草稿可正式发出预收费单',409);
   const document=JSON.parse(existing!.documentJson) as PrepaymentRequestDocument,source=await requestSource(actor,studentId,document.month,key);
   if(source.basis!==existing!.sourceBasis)throw new PrepaymentError('排课或费率已改变，请重新保存草稿后发出',409);
   if(document.lines.some(l=>l.mode==='month')&&!document.monthlyReviewed)throw new PrepaymentError('固定月费须先人工核对');
   if(document.lessons.some(l=>l.warnings.length)||!document.lessons.length)throw new PrepaymentError('预收费单课次或费率未齐全');   if(document.warnings.includes('monthly_rate_change_review'))throw new PrepaymentError('月内固定月费版本有变化，请先完成收费核对再出单');
   if((await prepaymentRead(actor,key,"SELECT 1 FROM prepayment_requests r,json_each(r.document_json,'$.lessons') x WHERE r.group_id=? AND r.student_id=? AND r.status='issued' AND r.id<>? AND json_extract(x.value,'$.lessonId') IN(SELECT json_extract(value,'$.lessonId') FROM json_each(?,'$.lessons'))",gid,studentId,requestId,existing!.documentJson)).length)throw new PrepaymentError('这些计划课次已有有效预收费单，请先作废原单再重新发出',409);
   when("NOT EXISTS(SELECT 1 FROM prepayment_requests r,json_each(r.document_json,'$.lessons') x WHERE r.group_id=? AND r.student_id=? AND r.status='issued' AND r.id<>? AND json_extract(x.value,'$.lessonId') IN(SELECT json_extract(value,'$.lessonId') FROM json_each(?,'$.lessons')))",gid,studentId,requestId,existing!.documentJson);
   when(`(${prepaymentBasisSql})=?`,...source.args,source.basis);
   const year=malaysiaDate(now).slice(0,4),numberSql="'ADV-'||?||'-'||printf('%06d',(SELECT last_value FROM prepayment_sequences WHERE group_id=? AND kind='request' AND year=?))";
   statements.push(db.prepare(`INSERT INTO prepayment_sequences(group_id,kind,year,last_value) SELECT ?,'request',?,1 WHERE ${guard.sql} ON CONFLICT(group_id,kind,year) DO UPDATE SET last_value=last_value+1`).bind(gid,year,...guard.args));
   statements.push(db.prepare(`UPDATE prepayment_requests SET status='issued',revision=revision+1,number=${numberSql},issued_at=?,updated_at=?,document_json=json_set(document_json,'$.status','issued','$.revision',revision+1,'$.number',${numberSql},'$.issuedAt',?,'$.updatedAt',?) WHERE group_id=? AND id=? AND ${guard.sql}`).bind(year,gid,year,now,now,year,gid,year,now,now,gid,requestId,...guard.args));
   statements.push(db.prepare('UPDATE prepayment_operations SET result_json=json_set(result_json,\'$.number\',(SELECT number FROM prepayment_requests WHERE group_id=? AND id=?)) WHERE group_id=? AND operation_id=? AND execution_id=?').bind(gid,requestId,gid,operation,execution));
  }else if(action==='deleteRequest'){
   if(existing!.status!=='draft')throw new PrepaymentError('只能删除草稿，已发出原件须保留',409);
   statements.push(db.prepare('DELETE FROM prepayment_requests WHERE group_id=? AND id=? AND '+guard.sql).bind(gid,requestId,...guard.args));
  }else{
   if(existing!.status!=='issued')throw new PrepaymentError('只有已发出预收费单可以作废',409);
   const reason=limited(data.reason,1000,'作废原因',true);audit.reason=reason;
   statements.push(db.prepare("UPDATE prepayment_requests SET status='void',revision=revision+1,voided_at=?,voided_by=?,void_reason=?,updated_at=? WHERE group_id=? AND id=? AND "+guard.sql).bind(now,actor.id,reason,now,gid,requestId,...guard.args));
  }
 }else{
  studentId=id(data.studentId,'学生');await prepaymentStudent(actor,studentId,key);const expected=rev(data.revision),balance=await prepaymentBalance(actor,studentId,key);
  if(balance.revision!==expected)throw new PrepaymentError('学生余额已改变，请刷新重试',409);
  when('coalesce((SELECT revision FROM prepayment_accounts WHERE group_id=? AND student_id=?),0)=?',gid,studentId,expected);
  const eventId=crypto.randomUUID(),reason=limited(data.reason,1000,'原因',['refund','reversePayment','release'].includes(action)),notes=limited(data.notes,1000,'内部备注'),reference=limited(data.reference,160,'参考号');
  let value=0,paymentId='',invoiceId:string|null=null,allocationId:string|null=null,invoiceRevision:number|null=null,kind='payment',occurredAt=now,method:PaymentMethod|''='',requestId:string|null=null;
  if(action==='recordPayment'){
   value=cents(data.amountCents);if(!PAYMENT_METHODS.includes(data.method as PaymentMethod))throw new PrepaymentError('请选择有效收款方式');method=data.method as PaymentMethod;occurredAt=timestamp(data.paidAt,now);paymentId=crypto.randomUUID();requestId=data.requestId?id(data.requestId,'预收费单'):null;
   if(requestId){const request=await storedPrepaymentRequest(actor,requestId,key);if(request.studentId!==studentId||request.status!=='issued')throw new PrepaymentError('预收费单不属于该学生或已作废',409);when("EXISTS(SELECT 1 FROM prepayment_requests WHERE group_id=? AND id=? AND student_id=? AND status='issued')",gid,requestId,studentId);}
  }else{
   paymentId=action==='release'?'':id(data.paymentId,'预收款');let payment:PrepaymentPayment|undefined;
   if(action==='release'){allocationId=id(data.allocationId,'抵扣记录');const allocation=(await prepaymentRead<{paymentId:string}>(actor,key,'SELECT payment_id AS paymentId FROM prepayment_allocations WHERE group_id=? AND id=? AND student_id=?',gid,allocationId,studentId))[0];if(!allocation)throw new PrepaymentError('抵扣记录不存在',404);paymentId=allocation.paymentId;}
   const stored=(await prepaymentRead<Parameters<typeof paymentResult>[0]>(actor,key,paymentSql+' WHERE p.group_id=? AND p.id=? AND p.student_id=?',gid,paymentId,studentId))[0];if(stored)payment=paymentResult(stored);
   if(!payment||payment.reversedAt)throw new PrepaymentError('预收款不存在或已撤销',409);
   if(action==='refund'||action==='reversePayment'){
    kind=action==='refund'?'refund':'reverse';value=action==='refund'?cents(data.amountCents):payment.amountCents;if(value>payment.availableCents)throw new PrepaymentError('退款或撤销金额超过这笔预收的可用余额，请先解除账单抵扣',409);
    if(action==='reversePayment'&&payment.refundedCents)throw new PrepaymentError('已有退款的预收款不能整笔撤销',409);
    if(data.method!==undefined&&!PAYMENT_METHODS.includes(data.method as PaymentMethod))throw new PrepaymentError('请选择有效退款方式');if(action==='reversePayment'&&data.method!==undefined&&data.method!==payment.method)throw new PrepaymentError('撤销方式须与原收款一致');method=action==='reversePayment'?payment.method:(data.method as PaymentMethod|undefined)||payment.method;occurredAt=timestamp(action==='refund'?data.refundedAt:data.effectiveAt,now);
   }else{
    kind=action==='apply'?'apply':'release';value=cents(data.amountCents);invoiceId=id(data.invoiceId,'正式账单');invoiceRevision=rev(data.invoiceRevision);
    const invoice=(await prepaymentRead<{studentId:string;revision:number;remainingCents:number;totalCents:number}>(actor,key,`SELECT i.student_id AS studentId,coalesce(f.revision,0) AS revision,i.total_cents+coalesce(f.charge_cents,0)-coalesce(f.credit_cents,0)-coalesce(f.received_cents-f.reversed_cents-f.refunded_cents+f.prepayment_cents,0) AS remainingCents,i.total_cents AS totalCents FROM invoices i LEFT JOIN invoice_finance_accounts f ON f.group_id=i.group_id AND f.invoice_id=i.id WHERE i.group_id=? AND i.id=? AND i.status='issued' AND f.voided_at IS NULL`,gid,invoiceId))[0];
    if(!invoice||invoice.studentId!==studentId)throw new PrepaymentError('只能抵扣该学生已经正式发出的账单',404);if(invoice.revision!==invoiceRevision)throw new PrepaymentError('账单收款资料已改变，请刷新重试',409);
    if(kind==='apply'&&(value>payment.availableCents||value>invoice.remainingCents))throw new PrepaymentError('抵扣金额超过可用预收余额或账单欠款',409);
    when('EXISTS(SELECT 1 FROM invoices i LEFT JOIN invoice_finance_accounts f ON f.group_id=i.group_id AND f.invoice_id=i.id WHERE i.group_id=? AND i.id=? AND i.student_id=? AND i.status=\'issued\' AND f.voided_at IS NULL AND coalesce(f.revision,0)=?)',gid,invoiceId,studentId,invoiceRevision);
    statements.push(db.prepare('INSERT INTO invoice_finance_accounts(group_id,invoice_id,student_id,original_total_cents,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE '+guard.sql+' AND NOT EXISTS(SELECT 1 FROM invoice_finance_accounts WHERE group_id=? AND invoice_id=?)').bind(gid,invoiceId,studentId,invoice.totalCents,now,now,...guard.args,gid,invoiceId));
    if(kind==='apply'){allocationId=crypto.randomUUID();statements.push(guarded('INSERT INTO prepayment_allocations(id,group_id,student_id,payment_id,invoice_id,amount_cents,created_at,operation_id) SELECT ?,?,?,?,?,?,?,?',[allocationId,gid,studentId,paymentId,invoiceId,value,now,operation]));}
   }
   if(Date.parse(occurredAt)<Date.parse(payment.paidAt))throw new PrepaymentError('退款、撤销或抵扣日期不能早于原收款日期');
  }
  result={ok:true,revision:expected+1,eventId,...(action==='recordPayment'?{paymentId,receiptId:crypto.randomUUID()}:{}),...(allocationId?{allocationId}:{}),...(invoiceRevision!==null?{invoiceRevision:invoiceRevision+1}:{})};
  statements.unshift(db.prepare('INSERT INTO prepayment_accounts(group_id,student_id,created_at,updated_at) SELECT ?,?,?,? WHERE '+guard.sql+' AND NOT EXISTS(SELECT 1 FROM prepayment_accounts WHERE group_id=? AND student_id=?)').bind(gid,studentId,now,now,...guard.args,gid,studentId));
  if(action==='recordPayment')statements.push(guarded('INSERT INTO prepayment_payments(id,group_id,student_id,request_id,amount_cents,paid_at,method,reference,notes,created_by,created_at,operation_id) SELECT ?,?,?,?,?,?,?,?,?,?,?,?',[paymentId,gid,studentId,requestId,value,occurredAt,method,reference,notes,actor.id,now,operation]));
  statements.push(guarded('INSERT INTO prepayment_events(id,group_id,student_id,payment_id,invoice_id,allocation_id,kind,amount_cents,occurred_at,method,reason,notes,reference,actor_id,created_at,operation_id,expected_revision,expected_invoice_revision) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?',[eventId,gid,studentId,paymentId,invoiceId,allocationId,kind,value,occurredAt,method,reason,notes,reference,actor.id,now,operation,expected,invoiceRevision]));
  if(action==='recordPayment'){
   const student=await prepaymentStudent(actor,studentId,key),institution=await prepaymentInstitution(actor,key),year=malaysiaDate(now).slice(0,4),request=requestId?JSON.parse((await storedPrepaymentRequest(actor,requestId,key)).documentJson) as PrepaymentRequestDocument:null;
   const receipt:PrepaymentReceiptDocument={id:result.receiptId!,number:'',paymentId,requestId,requestNumber:request?.number||'',student,institution,currency:'MYR',amountCents:value,paidAt:occurredAt,method:method as PaymentMethod,reference,createdAt:now,balanceAfterCents:balance.balanceCents+value,printUrl:'/api/prepayments/receipts/'+result.receiptId+'/print?groupId='+encodeURIComponent(gid)};
   statements.push(db.prepare(`INSERT INTO prepayment_sequences(group_id,kind,year,last_value) SELECT ?,'receipt',?,1 WHERE ${guard.sql} ON CONFLICT(group_id,kind,year) DO UPDATE SET last_value=last_value+1`).bind(gid,year,...guard.args));
   const numberSql="'APR-'||?||'-'||printf('%06d',(SELECT last_value FROM prepayment_sequences WHERE group_id=? AND kind='receipt' AND year=?))";
   statements.push(db.prepare(`INSERT INTO prepayment_receipts(id,group_id,payment_id,number,document_json,created_at) SELECT ?,?,?,${numberSql},json_set(?,'$.number',${numberSql}),? WHERE ${guard.sql}`).bind(result.receiptId,gid,paymentId,year,gid,year,JSON.stringify(receipt),year,gid,year,now,...guard.args));
   statements.push(db.prepare("UPDATE prepayment_operations SET result_json=json_set(result_json,'$.number',(SELECT number FROM prepayment_receipts WHERE group_id=? AND id=?)) WHERE group_id=? AND operation_id=? AND execution_id=?").bind(gid,result.receiptId,gid,operation,execution));
  }
  audit={...audit,studentId,eventId,kind,amountCents:value,paymentId,invoiceId,allocationId,reason};
 }
 const operationStatement=db.prepare(`INSERT OR IGNORE INTO prepayment_operations(group_id,operation_id,actor_id,action,request_hash,execution_id,result_json,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${a.sql} AND ${live}`).bind(gid,operation,actor.id,action,hash,execution,JSON.stringify(result),now,...a.args,...liveArgs);
 statements.unshift(operationStatement);
 statements.push(guarded("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) SELECT ?,?,'prepayment',?,?,?,?",[gid,crypto.randomUUID(),actor.id,'prepayments.'+action,JSON.stringify(audit),now]));
 try{const saved=await db.batch(statements);if(!saved[0].meta.changes){const repeated=await replay(actor,key,operation,hash);if(repeated)return repeated;throw new PrepaymentError('预收、账单、排课或权限已改变，请刷新重试',409);}}
 catch(error){if(error instanceof PrepaymentError)throw error;if(/prepayment_|invoice_finance_|UNIQUE constraint failed|FOREIGN KEY constraint failed/.test(String(error)))throw new PrepaymentError('预收、账单或课次资料已改变，请刷新重试',409);throw error;}
 return await replay(actor,key,operation,hash)||result;
}
