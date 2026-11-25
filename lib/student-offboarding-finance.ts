import {learningDb} from './learning-server';
import {requireGroup} from './group-data';

export type OffboardingFinanceWatch={name:string;value:string;sql:string;args:unknown[]};
export type OffboardingFinanceBlocker={code:string;label:string;count:number};
type Definition=Omit<OffboardingFinanceWatch,'value'>;
type Row=Record<string,string|number|null>;
const date=(value:string)=>/^\d{4}-\d\d-\d\d$/.test(value)&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const malaysiaDate=(value:string)=>new Date(Date.parse(value)+8*3600000).toISOString().slice(0,10);
const jsonArray=(value:unknown):Record<string,unknown>[]=>{try{const parsed=JSON.parse(String(value||'{}'));return Array.isArray(parsed.sourceLines)?parsed.sourceLines:[];}catch{return [];}};
const number=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)?value:NaN;

// This service is internal: the caller checks financial permissions before
// calling it. Only blocker labels/counts may be returned to clients. Watches
// contain ledger data and are server-only scalar SELECTs for transaction guards.
export async function offboardingFinancialState(groupId:string,studentName:string,lastLessonDate:string|null):Promise<{blockers:OffboardingFinanceBlocker[];watches:OffboardingFinanceWatch[]}>{
 const gid=requireGroup(groupId),name=studentName.trim();
 if(!name||lastLessonDate!==null&&!date(lastLessonDate))throw new Error('请选择有效学生与最后上课日期');
 const untilDate=lastLessonDate||malaysiaDate(new Date().toISOString());
 const db=learningDb(),definitions:Definition[]=[],sid="SELECT id FROM billing_students WHERE group_id=? AND student_name=?";
 function watch(name:string,columns:Record<string,string>,from:string,where:string,args:unknown[],order:string){
  const object=Object.entries(columns).map(([key,value])=>"'"+key+"',"+value).join(',');
  definitions.push({name,sql:`SELECT coalesce(json_group_array(json(j)),'[]') AS value FROM (SELECT json_object(${object}) AS j FROM ${from} WHERE ${where} ORDER BY ${order})`,args});
 }
 watch('billingIdentities',{id:'id',createdAt:'created_at'},'billing_students','group_id=? AND student_name=?',[gid,name],'id');
 watch('invoices',{id:'i.id',studentId:'i.student_id',month:'i.month',status:'i.status',revision:'i.revision',total:'i.total_cents',document:'i.document_json',source:'i.source_basis_json',adjustments:'i.adjustment_basis_json',financeRevision:'f.revision',charge:'coalesce(f.charge_cents,0)',credit:'coalesce(f.credit_cents,0)',received:'coalesce(f.received_cents,0)',reversed:'coalesce(f.reversed_cents,0)',refunded:'coalesce(f.refunded_cents,0)',prepayment:'coalesce(f.prepayment_cents,0)',voidedAt:'f.voided_at'},'invoices i LEFT JOIN invoice_finance_accounts f ON f.group_id=i.group_id AND f.invoice_id=i.id',`i.group_id=? AND i.student_id IN(${sid})`,[gid,gid,name],'i.id');
 watch('invoiceLocks',{invoiceId:'invoice_id',studentId:'student_id',month:'month',type:'source_type',sourceId:'source_id'},'invoice_source_locks',`group_id=? AND student_id IN(${sid})`,[gid,gid,name],'invoice_id,source_type,source_id');
 watch('invoiceEvents',{id:'e.id',invoiceId:'e.invoice_id',kind:'e.kind',amount:'e.amount_cents',revision:'e.expected_revision'},'invoice_finance_events e JOIN invoices i ON i.group_id=e.group_id AND i.id=e.invoice_id',`e.group_id=? AND i.student_id IN(${sid})`,[gid,gid,name],'e.id');
 watch('prepaymentAccounts',{id:'student_id',revision:'revision',received:'received_cents',refunded:'refunded_cents',reversed:'reversed_cents',applied:'applied_cents'},'prepayment_accounts',`group_id=? AND student_id IN(${sid})`,[gid,gid,name],'student_id');
 watch('prepaymentRequests',{id:'id',status:'status',revision:'revision',total:'total_cents',month:'month',voidedAt:'voided_at',document:'document_json'},'prepayment_requests',`group_id=? AND student_id IN(${sid})`,[gid,gid,name],'id');
 watch('prepaymentPayments',{id:'id',requestId:'request_id',amount:'amount_cents'},'prepayment_payments',`group_id=? AND student_id IN(${sid})`,[gid,gid,name],'id');
 watch('prepaymentEvents',{id:'id',paymentId:'payment_id',requestInvoiceId:'invoice_id',allocationId:'allocation_id',kind:'kind',amount:'amount_cents',revision:'expected_revision'},'prepayment_events',`group_id=? AND student_id IN(${sid})`,[gid,gid,name],'id');
 watch('prepaymentAllocations',{id:'id',invoiceId:'invoice_id',paymentId:'payment_id',amount:'amount_cents'},'prepayment_allocations',`group_id=? AND student_id IN(${sid})`,[gid,gid,name],'id');
 watch('billingRates',{subjectKey:'b.subject_key',subject:'b.subject',subjectCreated:'b.created_at',rateId:'r.id',rateRevision:'r.revision',versionId:'v.id',revision:'v.revision',mode:'v.mode',amount:'v.amount_cents',effectiveFrom:'v.effective_from'},'billing_subjects b LEFT JOIN billing_rates r ON r.group_id=b.group_id AND r.student_id=b.student_id AND r.subject_key=b.subject_key LEFT JOIN billing_rate_versions v ON v.group_id=r.group_id AND v.rate_id=r.id',`b.group_id=? AND b.student_id IN(${sid})`,[gid,gid,name],'b.subject_key,v.effective_from,v.revision,v.id');
 watch('billingAdjustments',{id:'id',month:'month',lineId:'line_id',revision:'revision',amount:'amount_cents',basis:'basis_hash'},'billing_adjustments',`group_id=? AND student_id IN(${sid})`,[gid,gid,name],'id');
 watch('plans',{key:'key',subject:'subject',subjectId:'subject_id',teacher:'teacher_name',active:'active',createdAt:'created_at'},'plans','group_id=? AND student=?',[gid,name],'key');
 watch('billingPolicies',{id:'id',revision:'revision',effectiveFrom:'effective_from',partial:'monthly_partial',basis:'attendance_basis',rounding:'hour_rounding'},'billing_policy_versions','group_id=?',[gid],'id');
 watch('lessons',{id:'l.id',subject:'l.subject',teacher:'l.teacher_name',plannedStart:'l.planned_start',plannedEnd:'l.planned_end',actualStart:'l.actual_start',actualEnd:'l.actual_end',status:'l.status',chargeable:'l.chargeable',reviewedAt:'l.reviewed_at',updatedAt:'l.updated_at',replacement:'l.replacement_for',sessionId:'l.session_id',sessionStatus:'s.status',sessionRevision:'s.revision',classroomId:'s.classroom_id',sessionTeacher:'s.teacher_name',teaching:'s.teaching_status',sessionStart:'s.actual_start',sessionEnd:'s.actual_end',sessionReviewedAt:'s.attendance_reviewed_at',attendance:'p.attendance_status',arrivedAt:'p.arrived_at',leftAt:'p.left_at'},'lessons l LEFT JOIN class_sessions s ON s.group_id=l.group_id AND s.id=l.session_id LEFT JOIN class_session_participants p ON p.group_id=l.group_id AND p.lesson_id=l.id','l.group_id=? AND l.student=?',[gid,name],'l.id');
 const relatedPayroll=`p.group_id=? AND (EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(p.document_json) THEN p.document_json ELSE '{}' END,'$.sourceLines') x JOIN lessons l ON l.group_id=p.group_id AND l.session_id=json_extract(x.value,'$.sessionId') WHERE l.student=?) OR EXISTS(SELECT 1 FROM lessons l LEFT JOIN class_sessions s ON s.group_id=l.group_id AND s.id=l.session_id JOIN payroll_teachers t ON t.group_id=p.group_id AND t.id=p.teacher_id WHERE l.group_id=p.group_id AND l.student=? AND t.teacher_name=coalesce(s.teacher_name,l.teacher_name) AND p.month=strftime('%Y-%m',coalesce(s.actual_start,l.actual_start,l.planned_start),'+8 hours')))`;
 watch('payrollRuns',{id:'p.id',teacherId:'p.teacher_id',teacher:'payroll_teacher.teacher_name',month:'p.month',status:'p.status',revision:'p.revision',document:'p.document_json',base:'p.base_total_cents',bonus:'p.bonus_cents',deduction:'p.deduction_cents',paid:'p.paid_cents',reversed:'p.reversed_cents'},'payroll_runs p JOIN payroll_teachers payroll_teacher ON payroll_teacher.group_id=p.group_id AND payroll_teacher.id=p.teacher_id',relatedPayroll,[gid,name,name],'p.id');
 watch('payrollEvents',{id:'e.id',payrollId:'e.payroll_id',kind:'e.kind',amount:'e.amount_cents',revision:'e.expected_revision'},'payroll_events e JOIN payroll_runs p ON p.group_id=e.group_id AND p.id=e.payroll_id',relatedPayroll,[gid,name,name],'e.id');
 watch('payrollRates',{id:'v.id',scopeId:'v.scope_id',revision:'v.revision',mode:'v.mode',amount:'v.amount_cents',effectiveFrom:'v.effective_from'},'payroll_rate_versions v JOIN payroll_rate_scopes r ON r.group_id=v.group_id AND r.id=v.scope_id JOIN payroll_teachers t ON t.group_id=r.group_id AND t.id=r.teacher_id','v.group_id=? AND EXISTS(SELECT 1 FROM lessons l WHERE l.group_id=v.group_id AND l.student=? AND l.teacher_name=t.teacher_name)',[gid,name],'v.id');
 watch('payrollMonthlyReviews',{id:'r.id',teacherId:'r.teacher_id',classroomId:'r.classroom_id',month:'r.month',revision:'r.revision',amount:'r.amount_cents',basis:'r.basis_hash'},'payroll_monthly_reviews r','r.group_id=? AND EXISTS(SELECT 1 FROM lessons l JOIN class_sessions s ON s.group_id=l.group_id AND s.id=l.session_id WHERE l.group_id=r.group_id AND l.student=? AND s.classroom_id=r.classroom_id)',[gid,name],'r.id');
 const result=await db.batch<{value:string}>(definitions.map(item=>db.prepare(item.sql).bind(...item.args))),watches=definitions.map((item,index)=>({...item,value:result[index].results?.[0]?.value||'[]'}));
 const records=new Map(watches.map(item=>[item.name,JSON.parse(item.value) as Row[]])),get=(key:string)=>records.get(key)||[],blockers:OffboardingFinanceBlocker[]=[];
 const block=(code:string,label:string,count:number)=>{if(count>0)blockers.push({code,label,count});};
 const invoices=get('invoices'),issued=invoices.filter(row=>row.status==='issued'&&!row.voidedAt);
 block('draft_invoices','有草稿账单待处理',invoices.filter(row=>row.status==='draft').length);
 let outstanding=0,credit=0,invalid=0;
 for(const item of invoices.filter(row=>row.status==='issued')){
  const adjusted=number(item.total)+number(item.charge)-number(item.credit),paid=number(item.received)-number(item.reversed)-number(item.refunded)+number(item.prepayment),difference=adjusted-paid;
  if(!Number.isSafeInteger(difference)||adjusted<0||paid<0||item.voidedAt&&paid!==0){invalid++;continue;}
  if(item.voidedAt)continue;
  if(difference>0)outstanding++;else if(difference<0)credit++;
 }
 block('invoice_outstanding','正式账单仍有欠款',outstanding);block('invoice_credit','账单仍有多收款或退款待处理',credit);block('financial_review','财务记录需要核对',invalid);
 block('prepayment_balance','仍有预收余额或预收差额待处理',get('prepaymentAccounts').filter(row=>number(row.received)-number(row.refunded)-number(row.reversed)-number(row.applied)!==0).length);
 const prepaymentEvents=get('prepaymentEvents'),payments=get('prepaymentPayments');
 block('prepayment_requests','有预收草稿或未完成的预收费单',get('prepaymentRequests').filter(row=>{
  if(row.status==='void'||row.voidedAt)return false;if(row.status==='draft')return true;
  const received=payments.filter(payment=>payment.requestId===row.id).reduce((sum,payment)=>sum+number(payment.amount)-prepaymentEvents.filter(event=>event.paymentId===payment.id&&['refund','reverse'].includes(String(event.kind))).reduce((total,event)=>total+number(event.amount),0),0);
  return !Number.isSafeInteger(received)||received<number(row.total);
 }).length);
 const locks=get('invoiceLocks'),covered=(lesson:Row)=>issued.some(invoice=>locks.some(lock=>lock.invoiceId===invoice.id&&(lock.type==='lesson'&&lock.sourceId===lesson.id||lock.type==='session'&&lock.sourceId===lesson.sessionId))||jsonArray(invoice.document).some(line=>line.lessonId===lesson.id||lesson.sessionId&&line.sessionId===lesson.sessionId));
 const lessons=get('lessons').filter(row=>row.status!=='cancelled'&&row.sessionStatus!=='cancelled');
 let unbilled=0,attendance=0;
 for(const lesson of lessons){
  if(lesson.sessionId?lesson.teaching==='pending':lesson.status==='scheduled'){attendance++;continue;}
  if(covered(lesson))continue;
  const reviewed=Boolean(lesson.sessionReviewedAt||lesson.reviewedAt),taught=lesson.teaching==='taught'||lesson.status==='completed',exempt=reviewed&&(lesson.chargeable===0||lesson.teaching==='teacher_absent'||lesson.teaching==='not_taught'||lesson.status==='teacher_absent');
  if(exempt)continue;
  if(taught||lesson.chargeable===1)unbilled++;
  else attendance++;
 }
 block('uninvoiced_lessons','已上或需收费的课程尚未完成开单核对',unbilled);block('attendance_review','仍有未完成或考勤收费状态待核对的课程',attendance);
 const monthlyPeriods=new Set<string>();
 for(const subjectKey of new Set(get('billingRates').map(row=>String(row.subjectKey)))){
  const rates=get('billingRates').filter(row=>row.subjectKey===subjectKey&&row.versionId).sort((a,b)=>String(a.effectiveFrom).localeCompare(String(b.effectiveFrom))||number(a.revision)-number(b.revision));
  const start=rates.filter(row=>row.mode==='month'&&String(row.effectiveFrom)<=untilDate)[0];if(!start)continue;
  const subjectDate=malaysiaDate(String(start.subjectCreated)),from=String(start.effectiveFrom)>subjectDate?String(start.effectiveFrom):subjectDate;
  let month=from.slice(0,7),iterations=0;while(month<=untilDate.slice(0,7)&&iterations++<1200){
   const monthEnd=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10),periodStart=[from,month+'-01'].sort().at(-1)!,periodEnd=monthEnd<untilDate?monthEnd:untilDate;
   const monthlyWithin=rates.some((row,index)=>row.mode==='month'&&String(row.effectiveFrom)<=periodEnd&&(!rates[index+1]||String(rates[index+1].effectiveFrom)>periodStart));
   if(monthlyWithin&&!issued.some(invoice=>invoice.month===month))monthlyPeriods.add(month);
   month=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1)).toISOString().slice(0,7);
  }
  if(iterations>=1200)block('monthly_range_review','固定月费历史范围需要管理员核对',1);
 }
 block('monthly_fee_review','固定月费仍有月份未完成开单或减免核对',monthlyPeriods.size);
 const runs=get('payrollRuns'),paidRuns=new Set<string>();let drafts=0,unpaid=0,payrollInvalid=0;
 for(const run of runs){
  let document:Record<string,unknown>;try{document=JSON.parse(String(run.document));if(!document||!Array.isArray(document.sourceLines))throw Error('Invalid payroll document');}catch{payrollInvalid++;continue;}
  if(run.status==='draft'){drafts++;continue;}
  const remaining=number(run.base)+number(run.bonus)-number(run.deduction)-number(run.paid)+number(run.reversed);
  if(!Number.isSafeInteger(remaining)||remaining<0)payrollInvalid++;else if(remaining>0)unpaid++;else paidRuns.add(String(run.id));
 }
 block('payroll_drafts','关联老师薪资仍有草稿待处理',drafts);block('payroll_unpaid','关联老师薪资尚未结清',unpaid);block('payroll_review','关联薪资记录需要核对',payrollInvalid);
 const taughtSessions=new Map(lessons.filter(row=>row.sessionId?row.teaching==='taught':row.status==='completed').map(row=>[String(row.sessionId||'lesson:'+row.id),String(row.sessionTeacher||row.teacher)]));
 // An earlier teacher's paid snapshot cannot settle the replacement teacher's
 // remuneration when the same session ID was reassigned after confirmation.
 block('payroll_not_generated','已授课课次尚未纳入已结清薪资',[...taughtSessions].filter(([sessionId,teacher])=>!runs.some(run=>paidRuns.has(String(run.id))&&run.teacher===teacher&&jsonArray(run.document).some(line=>line.sessionId===sessionId))).length);
 return{blockers,watches};
}
