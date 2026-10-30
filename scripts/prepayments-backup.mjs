import {validInvoiceIssuerIdentity} from './invoice-identity-backup.mjs';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const billingSource=stripTypeScriptTypes(readFileSync(new URL('../lib/billing.ts',import.meta.url),'utf8'),{mode:'transform'});
const {rateOnDate,policyOnDate,billHourlyCents,malaysiaDate}=await import('data:text/javascript;base64,'+Buffer.from(billingSource).toString('base64'));
export const PREPAYMENT_TABLES=['prepayment_accounts','prepayment_operations','prepayment_sequences','prepayment_requests','prepayment_payments','prepayment_receipts','prepayment_allocations','prepayment_events','prepayment_collection_settings'];
export const PREPAYMENT_REPLAY_TRIGGERS=['prepayment_account_insert','prepayment_payment_identity','prepayment_allocation_identity','prepayment_event_guard','prepayment_event_apply','prepayment_receipt_identity','prepayment_request_insert_identity'];

/** Restore cached balances as stored, then reconcile immutable cash and noncash history. */
export function checkRestoredPrepayments(db){
 const present=PREPAYMENT_TABLES.filter(name=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
 const hasColumn=db.prepare('PRAGMA table_info(invoice_finance_accounts)').all().some(c=>c.name==='prepayment_cents');
 if(!present.length){if(hasColumn)throw Error('Restored prepayment schema is incomplete');return;}
 const fail=()=>{throw Error('Restored prepayment cash, allocation, operation or snapshot is invalid');};
 if(present.length!==PREPAYMENT_TABLES.length||!hasColumn)fail();
 const rows=name=>db.prepare('SELECT * FROM '+name).all(),key=(g,id)=>JSON.stringify([g,id]);
 const int=(v,min=0,max=100000000)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
 const str=(v,max=2000)=>typeof v==='string'&&v.length<=max;
 const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
 const instant=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
 const month=v=>typeof v==='string'&&/^20\d\d-(?:0[1-9]|1[0-2])$/.test(v);
 const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 const parse=v=>{try{return JSON.parse(v);}catch{fail();}};
 const methods=['cash','bank_transfer','duitnow','tng','other'];
 const accounts=new Map(rows('prepayment_accounts').map(a=>[key(a.group_id,a.student_id),a]));
 const payments=new Map(rows('prepayment_payments').map(p=>[key(p.group_id,p.id),p]));
 const requests=new Map(rows('prepayment_requests').map(r=>[key(r.group_id,r.id),r]));
 const allocations=new Map(rows('prepayment_allocations').map(a=>[key(a.group_id,a.id),a]));
 const events=rows('prepayment_events'),receipts=rows('prepayment_receipts'),operations=new Map(),results=new Map(),receiptBalances=new Map();
 for(const o of rows('prepayment_operations')){
  const result=parse(o.result_json),identity=key(o.group_id,o.operation_id);
  if(!str(o.operation_id,100)||!o.operation_id||!str(o.actor_id,200)||!o.actor_id||!str(o.action,100)||!o.action||!hash(o.request_hash)||!str(o.execution_id,100)||!o.execution_id||!stamp(o.created_at)||!result||result.ok!==true)fail();
  operations.set(identity,o);results.set(identity,result);
 }
 const number=(group,kind,value,createdAt)=>{
  const match=typeof value==='string'&&value.match(/^(ADV|APR)-(20\d{2})-(\d{6,})$/);
  const year=instant(createdAt)?new Date(Date.parse(createdAt)+8*3600000).toISOString().slice(0,4):'';
  const sequence=match&&db.prepare('SELECT last_value FROM prepayment_sequences WHERE group_id=? AND kind=? AND year=?').get(group,kind,match[2]);
  if(!match||match[1]!== (kind==='request'?'ADV':'APR')||match[2]!==year||!int(Number(match[3]),1)||!sequence||Number(match[3])>sequence.last_value)fail();
 };
 const institution=doc=>{
  if(!validInvoiceIssuerIdentity(doc))fail();
  if(!doc||!str(doc.institutionName,160)||!doc.institutionName.trim()||!['standard','centered','brand'].includes(doc.template)||!/^#[a-f0-9]{6}$/i.test(doc.themeColor))fail();
 };
 for(const r of requests.values()){
  const doc=parse(r.document_json),basis=parse(r.source_basis_json);
  if(!r.id||!db.prepare('SELECT 1 FROM billing_students WHERE group_id=? AND id=?').get(r.group_id,r.student_id)||!month(r.month)||!['draft','issued','void'].includes(r.status)||!int(r.revision,1)||!int(r.total_cents)||!stamp(r.created_at)||!stamp(r.updated_at)||!hash(r.source_hash)||!basis||!doc||doc.id!==r.id||doc.groupId!==r.group_id||doc.studentId!==r.student_id||doc.student?.id!==r.student_id||doc.month!==r.month||doc.subjectKey!==r.subject_key||doc.currency!=='MYR'||doc.totalCents!==r.total_cents||doc.sourceHash!==r.source_hash||doc.createdAt!==r.created_at||!stamp(doc.updatedAt)||!Array.isArray(doc.lessons)||doc.lessons.length>5000||!Array.isArray(doc.lines)||doc.lines.length>5000||doc.lessonCount!==doc.lessons.length||!['/api/prepayments/requests/'+r.id+'/print','/api/prepayments/requests/'+r.id+'/print?groupId='+encodeURIComponent(r.group_id)].includes(doc.printUrl)||!str(doc.notes,2000)||typeof doc.monthlyReviewed!=='boolean')fail();
  if(createHash('sha256').update(JSON.stringify({basis:r.source_basis_json,subjectKey:r.subject_key||'',monthlyReviewed:doc.monthlyReviewed})).digest('hex')!==r.source_hash)fail();
  if(r.status==='draft'?(r.number!==null||r.issued_at!==null||doc.status!=='draft'||doc.revision!==r.revision):(r.number===null||!stamp(r.issued_at)||doc.number!==r.number||doc.issuedAt!==r.issued_at||doc.status!=='issued'||doc.revision!==r.revision-(r.status==='void'?1:0)))fail();
  if(r.status==='void'?(!stamp(r.voided_at)||!r.voided_by||!str(r.void_reason,1000)||!r.void_reason.trim()):(r.voided_at!==null||r.voided_by!==null||r.void_reason!==''))fail();
  if(r.status!=='draft')number(r.group_id,'request',r.number,r.issued_at);
  institution(doc.institution);
  if(doc.institution.logoAssetId&&!db.prepare('SELECT 1 FROM invoice_brand_assets WHERE group_id=? AND id=?').get(r.group_id,doc.institution.logoAssetId))fail();
  if(!Array.isArray(basis.lessons)||!Array.isArray(basis.subjects)||!Array.isArray(basis.rates)||!Array.isArray(basis.policies))fail();
  const expectedLessons=[],expectedLines=[],expectedWarnings=[];
  for(const lesson of basis.lessons){
   if(lesson.status==='cancelled'||lesson.sessionStatus==='cancelled')continue;
   const matches=basis.subjects.filter(subject=>(lesson.subjectId?subject.subjectId===lesson.subjectId:subject.subject.trim().toLowerCase()===lesson.subject.trim().toLowerCase())&&subject.createdAt<=lesson.plannedStart).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),subject=matches[0];
   if(r.subject_key&&subject?.subjectKey!==r.subject_key)continue;
   const date=malaysiaDate(lesson.plannedStart),rate=subject?rateOnDate(basis.rates.filter(v=>v.subjectKey===subject.subjectKey),date):null,policy=policyOnDate(basis.policies,date),seconds=(Date.parse(lesson.plannedEnd)-Date.parse(lesson.plannedStart))/1000;
   if(!subject||matches[1]?.createdAt===subject.createdAt||!rate||!policy||!int(seconds,1,86400))fail();
   const amount=rate.mode==='lesson'?rate.amountCents:rate.mode==='hour'?billHourlyCents(rate.amountCents,seconds,policy.hourRounding).amountCents:0;
   expectedLessons.push({lessonId:lesson.lessonId,subjectKey:subject.subjectKey,subject:lesson.subject,teacherName:lesson.teacherName,plannedStart:lesson.plannedStart,plannedEnd:lesson.plannedEnd,status:lesson.status,rateVersionId:rate.id,policyVersionId:policy.id,mode:rate.mode,unitAmountCents:rate.amountCents,durationSeconds:seconds,amountCents:amount,warnings:[]});
   const identity=rate.mode==='month'?subject.subjectKey:JSON.stringify([subject.subjectKey,rate.mode,rate.id]);
   let line=expectedLines.find(v=>(v.mode==='month'?v.subjectKey:JSON.stringify([v.subjectKey,v.mode,v.rateVersionId]))===identity);
   if(!line){line={subjectKey:subject.subjectKey,subject:lesson.subject,mode:rate.mode,unitAmountCents:rate.amountCents,amountCents:rate.mode==='month'?rate.amountCents:0,lessonCount:0,durationSeconds:0,rateVersionId:rate.id};expectedLines.push(line);}
   line.lessonCount++;line.durationSeconds+=seconds;if(rate.mode!=='month')line.amountCents+=amount;
   if(rate.mode==='month'&&line.unitAmountCents!==rate.amountCents)expectedWarnings.push('monthly_rate_change_review');
  }
  if(expectedLines.some(l=>l.mode==='month')){expectedWarnings.push('fixed_monthly_manual_review');if(r.status!=='draft'&&!doc.monthlyReviewed)fail();}
  if(!expectedLessons.length||JSON.stringify(expectedLessons)!==JSON.stringify(doc.lessons)||JSON.stringify(expectedLines)!==JSON.stringify(doc.lines)||JSON.stringify([...new Set(expectedWarnings)])!==JSON.stringify(doc.warnings))fail();
  const seen=new Set();
  for(const line of doc.lessons){if(!line||!line.lessonId||seen.has(line.lessonId)||!instant(line.plannedStart)||!instant(line.plannedEnd)||!int(line.amountCents)||!int(line.durationSeconds,0,86400)||!Array.isArray(line.warnings))fail();seen.add(line.lessonId);}
  if(doc.lines.some(l=>!l||!['hour','lesson','month'].includes(l.mode)||!int(l.amountCents)||!int(l.unitAmountCents,1)||!int(l.lessonCount,1,5000)||!int(l.durationSeconds,0,432000000))||doc.lines.reduce((n,l)=>n+l.amountCents,0)!==r.total_cents)fail();
 }
 for(const a of accounts.values()){
  if(!db.prepare('SELECT 1 FROM billing_students WHERE group_id=? AND id=?').get(a.group_id,a.student_id)||!int(a.revision)||!stamp(a.created_at)||!stamp(a.updated_at))fail();
  const history=events.filter(e=>e.group_id===a.group_id&&e.student_id===a.student_id).sort((x,y)=>x.expected_revision-y.expected_revision),money=new Map(),applied=new Map();
  if(!history.length||a.created_at!==history[0].created_at)fail();
  let received=0,refunded=0,reversed=0,used=0;
  for(const [index,e]of history.entries()){
   const operation=operations.get(key(e.group_id,e.operation_id)),result=results.get(key(e.group_id,e.operation_id)),p=payments.get(key(e.group_id,e.payment_id));
   if(!e.id||e.expected_revision!==index||!int(e.amount_cents,1)||!stamp(e.occurred_at)||!stamp(e.created_at)||Date.parse(e.occurred_at)>Date.parse(e.created_at)+300000||!str(e.reason,1000)||!str(e.notes,1000)||!str(e.reference,160)||!operation||operation.actor_id!==e.actor_id||operation.created_at!==e.created_at||!result||result.eventId!==e.id||result.revision!==index+1||!p||p.student_id!==a.student_id)fail();
   const cash=['payment','refund','reverse'].includes(e.kind);
   if(cash?(e.invoice_id!==null||e.allocation_id!==null||e.expected_invoice_revision!==null||!methods.includes(e.method)):(e.method!==''||!e.invoice_id||!e.allocation_id||!int(e.expected_invoice_revision)))fail();
   if(e.kind!=='payment'&&Date.parse(e.occurred_at)<Date.parse(p.paid_at)||!['payment','apply'].includes(e.kind)&&!e.reason.trim())fail();
   if(e.kind==='payment'){
    if(operation.action!=='recordPayment'||money.has(p.id)||p.amount_cents!==e.amount_cents||p.paid_at!==e.occurred_at||p.method!==e.method||p.operation_id!==e.operation_id||p.created_by!==e.actor_id||p.reference!==e.reference||p.notes!==e.notes||p.created_at!==e.created_at)fail();
    money.set(p.id,{available:e.amount_cents,refunded:0,reversed:false});received+=e.amount_cents;receiptBalances.set(key(e.group_id,p.id),received-refunded-reversed-used);
   }else{
    const balance=money.get(p.id);if(!balance||balance.reversed)fail();
    if(e.kind==='refund'){
     if(operation.action!=='refund'||e.amount_cents>balance.available)fail();balance.available-=e.amount_cents;balance.refunded+=e.amount_cents;refunded+=e.amount_cents;
    }else if(e.kind==='reverse'){
     if(operation.action!=='reversePayment'||balance.refunded||balance.available!==p.amount_cents||p.amount_cents!==e.amount_cents||e.method!==p.method)fail();balance.available=0;balance.reversed=true;reversed+=e.amount_cents;
    }else if(e.kind==='apply'||e.kind==='release'){
     const allocation=allocations.get(key(e.group_id,e.allocation_id)),invoice=db.prepare('SELECT * FROM invoice_finance_accounts WHERE group_id=? AND invoice_id=?').get(e.group_id,e.invoice_id);
     if(!allocation||allocation.student_id!==a.student_id||allocation.payment_id!==p.id||allocation.invoice_id!==e.invoice_id||result.allocationId!==allocation.id||!invoice||invoice.student_id!==a.student_id||result.invoiceRevision!==e.expected_invoice_revision+1)fail();
     if(e.kind==='apply'){
      if(operation.action!=='apply'||applied.has(allocation.id)||allocation.amount_cents!==e.amount_cents||allocation.operation_id!==e.operation_id||allocation.created_at!==e.created_at||e.amount_cents>balance.available||result.allocationId!==allocation.id)fail();applied.set(allocation.id,e.amount_cents);balance.available-=e.amount_cents;used+=e.amount_cents;
     }else{
      if(operation.action!=='release'||!applied.has(allocation.id)||e.amount_cents>applied.get(allocation.id))fail();applied.set(allocation.id,applied.get(allocation.id)-e.amount_cents);balance.available+=e.amount_cents;used-=e.amount_cents;
     }
    }else fail();
   }
   if(![received,refunded,reversed,used,received-refunded-reversed-used].every(v=>Number.isSafeInteger(v)&&v>=0))fail();
  }
  if(a.revision!==history.length||a.received_cents!==received||a.refunded_cents!==refunded||a.reversed_cents!==reversed||a.applied_cents!==used||history.length&&a.updated_at!==history.at(-1).created_at)fail();
 }
 for(const p of payments.values()){
  if(!p.id||!accounts.has(key(p.group_id,p.student_id))||!int(p.amount_cents,1)||!stamp(p.paid_at)||!stamp(p.created_at)||!methods.includes(p.method)||!str(p.reference,160)||!str(p.notes,1000)||events.filter(e=>e.group_id===p.group_id&&e.payment_id===p.id&&e.kind==='payment').length!==1||receipts.filter(r=>r.group_id===p.group_id&&r.payment_id===p.id).length!==1)fail();
  if(p.request_id!==null){const request=requests.get(key(p.group_id,p.request_id));if(!request||request.student_id!==p.student_id||!['issued','void'].includes(request.status)||Date.parse(request.issued_at)>Date.parse(p.created_at))fail();}
 }
 for(const a of allocations.values())if(!a.id||!int(a.amount_cents,1)||!stamp(a.created_at)||events.filter(e=>e.group_id===a.group_id&&e.allocation_id===a.id&&e.kind==='apply').length!==1)fail();
 for(const e of events)if(!accounts.has(key(e.group_id,e.student_id)))fail();
 for(const receipt of receipts){
  const p=payments.get(key(receipt.group_id,receipt.payment_id)),doc=parse(receipt.document_json),result=p&&results.get(key(p.group_id,p.operation_id));
  if(!p||!result||doc?.id!==receipt.id||!['/api/prepayments/receipts/'+receipt.id+'/print','/api/prepayments/receipts/'+receipt.id+'/print?groupId='+encodeURIComponent(receipt.group_id)].includes(doc.printUrl)||doc.number!==receipt.number||doc.paymentId!==p.id||doc.requestId!==p.request_id||doc.student?.id!==p.student_id||doc.currency!=='MYR'||doc.amountCents!==p.amount_cents||doc.paidAt!==p.paid_at||doc.method!==p.method||doc.reference!==p.reference||doc.createdAt!==p.created_at||receipt.created_at!==p.created_at||doc.balanceAfterCents!==receiptBalances.get(key(p.group_id,p.id))||result.paymentId!==p.id||result.receiptId!==receipt.id||result.number!==receipt.number)fail();
  number(p.group_id,'receipt',receipt.number,receipt.created_at);
  institution(doc.institution);
  if(doc.institution.logoAssetId&&!db.prepare('SELECT 1 FROM invoice_brand_assets WHERE group_id=? AND id=?').get(p.group_id,doc.institution.logoAssetId))fail();
  if(p.request_id!==null&&doc.requestNumber!==requests.get(key(p.group_id,p.request_id))?.number)fail();
 }
 for(const seq of rows('prepayment_sequences'))if(!['request','receipt'].includes(seq.kind)||!/^20\d\d$/.test(seq.year)||!int(seq.last_value,1))fail();
 const requestHistory=new Map();
 for(const o of operations.values()){
  const related=events.filter(e=>e.group_id===o.group_id&&e.operation_id===o.operation_id),result=results.get(key(o.group_id,o.operation_id));
  if(['recordPayment','refund','reversePayment','apply','release'].includes(o.action)){if(related.length!==1)fail();}
  else{
   if(!['saveRequest','issueRequest','deleteRequest','voidRequest'].includes(o.action)||!result.requestId||!int(result.revision,1)||related.length)fail();
   const identity=key(o.group_id,result.requestId);if(!requestHistory.has(identity))requestHistory.set(identity,[]);requestHistory.get(identity).push({operation:o,result});
  }
 }
 for(const [identity,history]of requestHistory){
  history.sort((a,b)=>a.result.revision-b.result.revision);const request=requests.get(identity);let status='draft';
  for(const [index,{operation:o,result}]of history.entries()){
   if(result.revision!==index+1||index===0&&o.action!=='saveRequest'||status==='deleted'||status==='void')fail();
   if(o.action==='saveRequest'){if(status!=='draft')fail();}
   else if(o.action==='issueRequest'){if(status!=='draft')fail();status='issued';if(!request||result.number!==request.number||o.created_at!==request.issued_at)fail();}
   else if(o.action==='deleteRequest'){if(status!=='draft')fail();status='deleted';}
   else if(o.action==='voidRequest'){if(status!=='issued')fail();status='void';if(!request||o.created_at!==request.voided_at||o.actor_id!==request.voided_by)fail();}
  }
  if(status==='deleted'){if(request)fail();}
  else if(!request||request.status!==status||request.revision!==history.length||request.created_by!==history[0].operation.actor_id||request.created_at!==history[0].operation.created_at||request.updated_at!==history.at(-1).operation.created_at)fail();
 }
 for(const [identity]of requests)if(!requestHistory.has(identity))fail();
 const timingHistory=new Map();
 for(const operation of db.prepare("SELECT * FROM billing_operations WHERE action='saveCollectionTiming'").all()){
  const result=parse(operation.result_json),identity=JSON.stringify([operation.group_id,result.studentId,result.subjectKey]);
  if(!result||result.ok!==true||!str(result.studentId,128)||!result.studentId||!str(result.subjectKey,240)||!result.subjectKey||!int(result.revision,1)||!['advance','arrears'].includes(result.timing)||createHash('sha256').update(JSON.stringify({action:'saveCollectionTiming',revision:result.revision-1,studentId:result.studentId,subjectKey:result.subjectKey,timing:result.timing})).digest('hex')!==operation.request_hash)fail();
  if(!timingHistory.has(identity))timingHistory.set(identity,[]);timingHistory.get(identity).push({operation,result});
 }
 for(const setting of rows('prepayment_collection_settings')){
  const identity=JSON.stringify([setting.group_id,setting.student_id,setting.subject_key]),history=(timingHistory.get(identity)||[]).sort((a,b)=>a.result.revision-b.result.revision),latest=history.at(-1);
  if(!['advance','arrears'].includes(setting.timing)||!int(setting.revision,1)||!setting.updated_by||!stamp(setting.updated_at)||!db.prepare('SELECT 1 FROM billing_subjects WHERE group_id=? AND student_id=? AND subject_key=?').get(setting.group_id,setting.student_id,setting.subject_key)||history.length!==setting.revision||history.some((h,i)=>h.result.revision!==i+1)||!latest||latest.result.timing!==setting.timing||latest.operation.actor_id!==setting.updated_by||latest.operation.created_at!==setting.updated_at)fail();
  timingHistory.delete(identity);
 }
 if(timingHistory.size)fail();
 if(db.prepare('PRAGMA foreign_key_check').all().length)fail();
}
