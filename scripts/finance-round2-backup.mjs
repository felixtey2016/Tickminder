import {createHash} from 'node:crypto';

export const CLASS_PAYROLL_TABLES=['payroll_legacy_rate_links','payroll_monthly_reviews','payroll_deleted_drafts'];
export const FINANCE_ROUND2_TABLES=['payroll_teachers','payroll_rate_scopes','payroll_rate_versions','payroll_operations','payroll_runs','payroll_events','finance_expense_operations','finance_expenses','finance_expense_events'];
export const FINANCE_ROUND2_REPLAY_TRIGGERS=['payroll_event_guard','payroll_event_apply','finance_expense_event_guard','finance_expense_replacement_guard','payroll_legacy_link_guard','payroll_month_review_guard','payroll_deleted_draft_guard'];

/** Validate frozen teacher pay and reconcile every immutable cash event on restore. */
export function checkRestoredFinanceRound2(db){
 const present=FINANCE_ROUND2_TABLES.filter(name=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
 if(!present.length)return;
 const fail=()=>{throw Error('Restored teacher pay or expense ledger is invalid');};
 const classPresent=CLASS_PAYROLL_TABLES.filter(name=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
 const hasClassPayroll=classPresent.length===CLASS_PAYROLL_TABLES.length;
 if(classPresent.length&&!hasClassPayroll)fail();
 if(db.prepare('PRAGMA table_info(payroll_rate_versions)').all().some(c=>c.name==='mode')!==hasClassPayroll)fail();
 if(present.length!==FINANCE_ROUND2_TABLES.length)fail();
 const integer=(v,min=0,max=100000000)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
 const text=(v,max=2000)=>typeof v==='string'&&v.length<=max;
 const instant=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
 const stamp=v=>instant(v)&&new Date(v).toISOString()===v;
 const date=v=>typeof v==='string'&&/^20\d\d-\d\d-\d\d$/.test(v)&&instant(v)&&new Date(v).toISOString().slice(0,10)===v;
 const month=v=>typeof v==='string'&&/^20\d\d-(?:0[1-9]|1[0-2])$/.test(v);
 const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 const key=(g,id)=>JSON.stringify([g,id]);
 const json=v=>{try{return JSON.parse(v);}catch{fail();}};
 const rows=name=>db.prepare('SELECT * FROM '+name).all();
 const methods=['cash','bank_transfer','duitnow','tng','other'];
 const teachers=new Map(rows('payroll_teachers').map(t=>[key(t.group_id,t.id),t]));
 const scopes=new Map(rows('payroll_rate_scopes').map(s=>[key(s.group_id,s.id),s]));
 const rates=new Map(rows('payroll_rate_versions').map(r=>[key(r.group_id,r.id),r]));
 const runs=new Map(rows('payroll_runs').map(r=>[key(r.group_id,r.id),r]));
 const events=rows('payroll_events');
 const operations=new Map(rows('payroll_operations').map(o=>[key(o.group_id,o.operation_id),o]));
 const opResults=new Map(),deletedRuns=new Map(),monthlyReviews=new Map();
 for(const [identity,o]of operations){
  const result=json(o.result_json);
  if(!['saveRate','generate','refresh','confirm','adjust','pay','reversePayment',...(hasClassPayroll?['reviewMonth','deleteDraft']:[])].includes(o.action)||!o.actor_id||!hash(o.request_hash)||!o.execution_id||!stamp(o.created_at)||!result||result.ok!==true||!integer(result.revision,1))fail();
  opResults.set(identity,result);
 }
 if(hasClassPayroll){
  for(const link of rows('payroll_legacy_rate_links')){
   const scope=scopes.get(key(link.group_id,link.scope_id)),rate=[...rates.values()].find(r=>r.group_id===link.group_id&&r.scope_id===link.scope_id&&r.revision===link.max_revision);
   if(!link.id||!scope||scope.teacher_id!==link.teacher_id||scope.classroom_id!==null||!integer(link.max_revision,1)||link.max_revision>scope.revision||!rate||rate.mode!=='hour'||!stamp(link.created_at)||(link.classroom_id===null)===(link.session_id===null))fail();
   if(link.classroom_id!==null&&!db.prepare('SELECT 1 FROM classrooms WHERE group_id=? AND id=?').get(link.group_id,link.classroom_id))fail();
   if(link.session_id!==null){const teacher=teachers.get(key(link.group_id,link.teacher_id));if(!teacher||!db.prepare('SELECT 1 FROM class_sessions WHERE group_id=? AND id=? AND teacher_name=? AND classroom_id IS NULL').get(link.group_id,link.session_id,teacher.teacher_name))fail();}
  }
  const reviewGroups=new Map();
  for(const review of rows('payroll_monthly_reviews')){
   const operation=operations.get(key(review.group_id,review.operation_id)),result=opResults.get(key(review.group_id,review.operation_id));
   if(!review.id||!teachers.has(key(review.group_id,review.teacher_id))||!db.prepare('SELECT 1 FROM classrooms WHERE group_id=? AND id=?').get(review.group_id,review.classroom_id)||!month(review.month)||!integer(review.revision,1)||!integer(review.amount_cents)||!text(review.reason,1000)||!review.reason.trim()||!hash(review.basis_hash)||!stamp(review.created_at)||!operation||operation.action!=='reviewMonth'||operation.actor_id!==review.created_by||operation.created_at!==review.created_at||result.reviewId!==review.id||result.teacherId!==review.teacher_id||result.revision!==review.revision)fail();
   monthlyReviews.set(key(review.group_id,review.id),review);
   const scope=JSON.stringify([review.group_id,review.teacher_id,review.classroom_id,review.month]);if(!reviewGroups.has(scope))reviewGroups.set(scope,[]);reviewGroups.get(scope).push(review.revision);
  }
  for(const versions of reviewGroups.values())if(versions.sort((a,b)=>a-b).some((v,i)=>v!==i+1))fail();
  const runColumns=db.prepare('PRAGMA table_info(payroll_runs)').all().map(c=>c.name).sort().join('|');
  for(const deleted of rows('payroll_deleted_drafts')){
   const original=json(deleted.run_snapshot_json),operation=operations.get(key(deleted.group_id,deleted.operation_id)),result=opResults.get(key(deleted.group_id,deleted.operation_id));
   if(!original||Object.keys(original).sort().join('|')!==runColumns||original.id!==deleted.payroll_id||original.group_id!==deleted.group_id||original.teacher_id!==deleted.teacher_id||original.month!==deleted.month||original.revision!==deleted.revision||original.status!=='draft'||[original.bonus_cents,original.deduction_cents,original.paid_cents,original.reversed_cents].some(v=>v!==0)||original.confirmed_at!==null||original.confirmed_by!==null||runs.has(key(deleted.group_id,deleted.payroll_id))||events.some(e=>e.group_id===deleted.group_id&&e.payroll_id===deleted.payroll_id)||!stamp(deleted.deleted_at)||!stamp(original.updated_at)||Date.parse(deleted.deleted_at)<Date.parse(original.updated_at)||!operation||operation.action!=='deleteDraft'||operation.actor_id!==deleted.deleted_by||operation.created_at!==deleted.deleted_at||result.payrollId!==deleted.payroll_id||result.revision!==deleted.revision+1||result.deleted!==true)fail();
   deletedRuns.set(key(deleted.group_id,deleted.payroll_id),original);
  }
 }
 for(const t of teachers.values())if(!t.id||!t.teacher_name||!stamp(t.created_at)||!db.prepare('SELECT 1 FROM teachers WHERE group_id=? AND name=?').get(t.group_id,t.teacher_name))fail();
 for(const s of scopes.values()){
  if(!teachers.has(key(s.group_id,s.teacher_id))||s.scope_key!==(s.classroom_id||'')||!integer(s.revision)||!stamp(s.updated_at))fail();
  const versions=[...rates.values()].filter(r=>r.group_id===s.group_id&&r.scope_id===s.id).sort((a,b)=>a.revision-b.revision);
  if(!versions.length||s.revision!==versions.length||versions.some((r,i)=>r.revision!==i+1))fail();
 }
 for(const r of rates.values()){
  const s=scopes.get(key(r.group_id,r.scope_id)),o=operations.get(key(r.group_id,r.operation_id)),result=opResults.get(key(r.group_id,r.operation_id));
  if(!s||(hasClassPayroll&&!['hour','lesson','month'].includes(r.mode))||(hasClassPayroll&&s.classroom_id===null&&r.mode!=='hour')||!integer(r.amount_cents,1)||r.currency!=='MYR'||!date(r.effective_from)||!stamp(r.created_at)||!o||o.action!=='saveRate'||o.actor_id!==r.created_by||result.rateId!==r.id||result.teacherId!==s.teacher_id||result.revision!==r.revision)fail();
 }
 const seenEvents=new Set();
 for(const run of [...runs.values(),...deletedRuns.values()]){
  const t=teachers.get(key(run.group_id,run.teacher_id)),doc=json(run.document_json);
  if(!t||!month(run.month)||!integer(run.revision,1)||!hash(run.source_hash)||!integer(run.base_total_cents)||!stamp(run.created_at)||!stamp(run.updated_at)||!doc||doc.id!==run.id||doc.groupId!==run.group_id||doc.teacherId!==run.teacher_id||doc.teacherName!==t.teacher_name||doc.month!==run.month||doc.currency!=='MYR'||doc.status!==run.status||doc.baseTotalCents!==run.base_total_cents||doc.sourceHash!==run.source_hash||doc.createdAt!==run.created_at||doc.confirmedAt!==run.confirmed_at||!stamp(doc.updatedAt)||!integer(doc.revision,1)||!Array.isArray(doc.sourceLines)||doc.sourceLines.length>5000)fail();
  if(run.status==='confirmed'?(!stamp(run.confirmed_at)||!run.confirmed_by||doc.revision>run.revision):(run.status!=='draft'||run.confirmed_at!==null||run.confirmed_by!==null||doc.revision!==run.revision))fail();
  if(doc.calculationVersion!==undefined&&doc.calculationVersion!==2||doc.calculationVersion===2&&(!hasClassPayroll||!Array.isArray(doc.monthlyLines)||doc.monthlyLines.length>5000)||doc.calculationVersion===undefined&&doc.monthlyLines!==undefined)fail();
  const monthLines=doc.monthlyLines||[],monthClasses=new Set();
  for(const line of monthLines){
   const rate=rates.get(key(run.group_id,line.rateVersionId)),scope=rate&&scopes.get(key(run.group_id,rate.scope_id)),review=line.reviewId?monthlyReviews.get(key(run.group_id,line.reviewId)):null;
   if(!line||!line.classroomId||monthClasses.has(line.classroomId)||line.teacherId!==run.teacher_id||line.month!==run.month||!text(line.classroomTitle,300)||!rate||rate.mode!=='month'||!scope||scope.teacher_id!==run.teacher_id||scope.classroom_id!==line.classroomId||line.unitAmountCents!==rate.amount_cents||!['ready','pending','upcoming','excluded'].includes(line.status)||!Array.isArray(line.warnings)||!integer(line.reviewRevision)||!hash(line.sourceHash)||!doc.sourceLines.some(s=>s.classroomId===line.classroomId&&s.rateVersionId===rate.id))fail();
   monthClasses.add(line.classroomId);
   if(line.reviewId!==null){if(!review||review.teacher_id!==run.teacher_id||review.classroom_id!==line.classroomId||review.month!==run.month||review.revision!==line.reviewRevision||review.basis_hash!==line.sourceHash||review.reason!==line.reviewReason)fail();}
   else if(line.reviewReason!==null||line.reviewRevision>0&&![...monthlyReviews.values()].some(r=>r.group_id===run.group_id&&r.teacher_id===run.teacher_id&&r.classroom_id===line.classroomId&&r.month===run.month&&r.revision===line.reviewRevision))fail();
   const expected=review?review.amount_cents:line.unitAmountCents;
   if(line.status==='ready'){if(line.amountCents!==expected||line.estimatedAmountCents!==expected||line.warnings.length)fail();}
   else if(line.amountCents!==null||line.estimatedAmountCents!==null&&line.estimatedAmountCents!==expected||line.status==='excluded'&&line.estimatedAmountCents!==null)fail();
   const active=doc.sourceLines.filter(s=>s.classroomId===line.classroomId&&s.status!=='excluded');
   if(line.status==='ready'&&(!active.length||active.some(s=>s.status!=='ready'))||line.status==='excluded'&&active.length||run.status==='confirmed'&&['pending','upcoming'].includes(line.status))fail();
  }
  const sessions=new Set();let total=monthLines.reduce((sum,l)=>sum+(l.amountCents??0),0),seconds=0,count=0;
  for(const line of doc.sourceLines){
   if(!line||typeof line.sessionId!=='string'||sessions.has(line.sessionId)||line.teacherName!==t.teacher_name||!instant(line.plannedStart)||!instant(line.plannedEnd)||!integer(line.sessionRevision,1)||!Array.isArray(line.warnings)||!['ready','pending','excluded','upcoming'].includes(line.status))fail();
   sessions.add(line.sessionId);
   if(line.status==='ready'){
    const rate=rates.get(key(run.group_id,line.rateVersionId)),scope=rate&&scopes.get(key(run.group_id,rate.scope_id));
    const duration=(Date.parse(line.actualEnd)-Date.parse(line.actualStart))/1000;
    const mode=rate?.mode||'hour',monthly=monthClasses.has(line.classroomId),minutes=Math.max(0,Math.round(Math.round(duration)/60)),amount=monthly?0:mode==='lesson'?rate.amount_cents:Math.round(line.hourlyRateCents*minutes/60);
    if((line.rateMode||'hour')!==(monthly?'month':mode)||line.unitAmountCents!==undefined&&line.unitAmountCents!==rate?.amount_cents||mode!=='hour'&&line.unitAmountCents!==rate?.amount_cents||!monthly&&mode==='month')fail();
    const serviceDate=instant(line.actualStart)?new Date(Date.parse(line.actualStart)+8*3600000).toISOString().slice(0,10):'';
    if(line.teachingStatus!=='taught'||!instant(line.attendanceReviewedAt)||!instant(line.actualStart)||!instant(line.actualEnd)||!Number.isFinite(duration)||duration<=0||duration>43200||line.durationSeconds!==Math.round(duration)||line.minutes!==minutes||line.amountCents!==amount||!integer(amount)||!rate||!scope||scope.teacher_id!==run.teacher_id||scope.classroom_id!==null&&scope.classroom_id!==line.classroomId||line.hourlyRateCents!==rate.amount_cents||rate.effective_from>serviceDate||serviceDate.slice(0,7)!==run.month||line.warnings.length)fail();
    total+=amount;seconds+=line.durationSeconds;count++;
   }else if(line.amountCents!==null)fail();
   if(run.status==='confirmed'&&['pending','upcoming'].includes(line.status))fail();
  }
  if(total!==run.base_total_cents||seconds!==doc.durationSeconds||count!==doc.lessonCount)fail();
  if(run.status==='confirmed'){
   const financial={teacherId:doc.teacherId,teacherName:doc.teacherName,month:doc.month,unlinked:[],lines:doc.sourceLines.map(({sessionRevision,attendanceReviewedAt,...line})=>({...line,attendanceConfirmed:Boolean(attendanceReviewedAt)}))};
   const semantic=doc.calculationVersion===2?{...financial,calculationVersion:2,monthlyLines:monthLines}:financial;
   if(createHash('sha256').update(JSON.stringify(semantic)).digest('hex')!==doc.sourceHash)fail();
  }
  const history=events.filter(e=>e.group_id===run.group_id&&e.payroll_id===run.id).sort((a,b)=>a.expected_revision-b.expected_revision);
  let bonus=0,deduction=0,paid=0,reversed=0;
  const payments=new Map();
  for(const [index,e]of history.entries()){
   const op=operations.get(key(e.group_id,e.operation_id)),result=opResults.get(key(e.group_id,e.operation_id));
   seenEvents.add(key(e.group_id,e.id));
   if(run.status!=='confirmed'||e.expected_revision!==doc.revision+index||!integer(e.amount_cents,1)||!stamp(e.occurred_at)||!stamp(e.created_at)||!text(e.reason,1000)||!text(e.notes,1000)||!text(e.reference,160)||!op||op.actor_id!==e.actor_id||result.payrollId!==run.id||result.eventId!==e.id||result.revision!==e.expected_revision+1)fail();
   const remaining=run.base_total_cents+bonus-deduction-paid+reversed;
   if(e.kind==='payment'){
    if(op.action!=='pay'||e.payment_id!==null||!methods.includes(e.method)||e.amount_cents>remaining)fail();
    payments.set(e.id,{event:e,reversed:false});paid+=e.amount_cents;
   }else if(e.kind==='reverse'){
    const p=payments.get(e.payment_id);
    if(op.action!=='reversePayment'||!p||p.reversed||p.event.amount_cents!==e.amount_cents||p.event.method!==e.method||Date.parse(e.occurred_at)<Date.parse(p.event.occurred_at)||!e.reason.trim())fail();
    p.reversed=true;reversed+=e.amount_cents;
   }else if(e.kind==='bonus'||e.kind==='deduction'){
    if(op.action!=='adjust'||e.payment_id!==null||e.method!==''||!e.reason.trim())fail();
    if(e.kind==='bonus')bonus+=e.amount_cents;else{if(e.amount_cents>remaining)fail();deduction+=e.amount_cents;}
   }else fail();
   if(!integer(run.base_total_cents+bonus-deduction))fail();
  }
  if(history.length+doc.revision!==run.revision||bonus!==run.bonus_cents||deduction!==run.deduction_cents||paid!==run.paid_cents||reversed!==run.reversed_cents)fail();
  const initial=[...operations.values()].filter(o=>o.group_id===run.group_id&&opResults.get(key(o.group_id,o.operation_id)).payrollId===run.id);
  if(!initial.some(o=>o.action==='generate'&&o.actor_id===run.created_by&&o.created_at===run.created_at&&opResults.get(key(o.group_id,o.operation_id)).revision===1)||run.status==='confirmed'&&!initial.some(o=>o.action==='confirm'&&o.actor_id===run.confirmed_by&&o.created_at===run.confirmed_at&&opResults.get(key(o.group_id,o.operation_id)).revision===doc.revision))fail();
  if(doc.updatedAt!==(run.status==='confirmed'?run.confirmed_at:run.updated_at))fail();
 }
 if(seenEvents.size!==events.length)fail();
 for(const [identity,o]of operations){
  const result=opResults.get(identity);
  if(o.action==='saveRate'){if(!rates.has(key(o.group_id,result.rateId)))fail();}
  else if(o.action==='reviewMonth'){if(!monthlyReviews.has(key(o.group_id,result.reviewId)))fail();}
  else if(o.action==='deleteDraft'){if(!deletedRuns.has(key(o.group_id,result.payrollId)))fail();}
  else if((!runs.has(key(o.group_id,result.payrollId))&&!deletedRuns.has(key(o.group_id,result.payrollId)))||(deletedRuns.has(key(o.group_id,result.payrollId))&&!['generate','refresh'].includes(o.action))||['adjust','pay','reversePayment'].includes(o.action)&&events.filter(e=>e.group_id===o.group_id&&e.operation_id===o.operation_id).length!==1)fail();
 }
 const expenses=rows('finance_expenses'),expenseEvents=rows('finance_expense_events');
 const expenseById=new Map(expenses.map(e=>[key(e.group_id,e.id),e]));
 const expenseOps=new Map(rows('finance_expense_operations').map(o=>[key(o.group_id,o.operation_id),o]));
 for(const e of expenses){
  const op=expenseOps.get(key(e.group_id,e.operation_id)),result=op&&json(op.result_json),history=expenseEvents.filter(x=>x.group_id===e.group_id&&x.expense_id===e.id),record=history.filter(x=>x.kind==='record'),reverse=history.filter(x=>x.kind==='reverse');
  if(!['rent','utilities','materials','software','other'].includes(e.category)||!text(e.description,250)||!e.description.trim()||!integer(e.amount_cents,1)||!stamp(e.spent_at)||!stamp(e.created_at)||!methods.includes(e.method)||!text(e.reference,160)||!text(e.notes,1000)||!op||op.action!=='recordExpense'||op.actor_id!==e.actor_id||op.created_at!==e.created_at||result.expenseId!==e.id||result.revision!==0||record.length!==1||reverse.length>1||history.length!==record.length+reverse.length)fail();
  for(const event of history){
   const operation=expenseOps.get(key(event.group_id,event.operation_id)),value=operation&&json(operation.result_json);
   if(!operation||operation.actor_id!==event.actor_id||operation.created_at!==event.created_at||value.expenseId!==e.id||value.revision!==(event.kind==='record'?0:1)||event.amount_cents!==e.amount_cents||!stamp(event.created_at)||!stamp(event.occurred_at)||!text(event.reason,1000))fail();
   if(event.kind==='record'){if(operation.action!=='recordExpense'||event.occurred_at!==e.spent_at||event.operation_id!==e.operation_id)fail();}
   else if(event.kind==='reverse'){if(operation.action!=='reverseExpense'||!event.reason.trim()||Date.parse(event.occurred_at)<Date.parse(e.spent_at))fail();}
   else fail();
  }
  if(e.replacement_for&&!expenses.some(p=>p.group_id===e.group_id&&p.id===e.replacement_for&&expenseEvents.some(x=>x.group_id===p.group_id&&x.expense_id===p.id&&x.kind==='reverse'&&Date.parse(x.created_at)<=Date.parse(e.created_at))))fail();
  const chain=new Set([e.id]);let previous=e;
  while(previous.replacement_for){if(chain.has(previous.replacement_for))fail();chain.add(previous.replacement_for);previous=expenseById.get(key(e.group_id,previous.replacement_for));if(!previous)fail();}
 }
 for(const e of expenseEvents)if(!expenses.some(x=>x.group_id===e.group_id&&x.id===e.expense_id))fail();
 for(const o of expenseOps.values()){
  const result=json(o.result_json),related=expenseEvents.filter(e=>e.group_id===o.group_id&&e.operation_id===o.operation_id);
  if(!['recordExpense','reverseExpense'].includes(o.action)||!o.actor_id||!hash(o.request_hash)||!o.execution_id||!stamp(o.created_at)||!result||result.ok!==true||related.length!==1||result.expenseId!==related[0].expense_id)fail();
 }
 if(db.prepare('PRAGMA foreign_key_check').all().length)fail();
}
