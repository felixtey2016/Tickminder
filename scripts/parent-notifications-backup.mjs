export const PARENT_NOTIFICATION_TABLES=['parent_notifications','parent_notification_deliveries','parent_notification_runtime'];
export const PARENT_NOTIFICATION_REPLAY_TRIGGERS=['parent_notification_identity_insert'];
/** Replay queue snapshots exactly; stale epochs are retained but never reactivated. */
export function checkRestoredParentNotifications(db){
 const present=PARENT_NOTIFICATION_TABLES.filter(name=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)).length;
 if(!present)return;
 const fail=()=>{throw Error('Restored parent notification source, authorization epoch, queue claim or runtime is invalid');};
 if(present!==PARENT_NOTIFICATION_TABLES.length)fail();
 const rows=name=>db.prepare('SELECT * FROM '+name).all(),key=(...values)=>JSON.stringify(values);
 const text=(v,max=200,min=1)=>typeof v==='string'&&v.length>=min&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
 const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
 const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
 const nullableStamp=v=>v===null||stamp(v),parse=v=>{try{return JSON.parse(v);}catch{fail();}};
 const day=v=>typeof v==='string'&&/^20\d\d-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00.000Z'))&&new Date(v+'T00:00:00.000Z').toISOString().slice(0,10)===v;
 const runtime=rows('parent_notification_runtime');if(runtime.length!==1||runtime[0].id!==1)fail();
 const run=runtime[0];if(!stamp(run.activation_at)||!nullableStamp(run.last_generated_at)||!nullableStamp(run.last_dispatch_at)||!nullableStamp(run.lease_until)||(run.lease_until===null)!==(run.lease_token===null)||run.lease_token!==null&&!text(run.lease_token,100,16)||run.last_generated_at!==null&&run.last_generated_at<run.activation_at||run.last_dispatch_at!==null&&run.last_dispatch_at<run.activation_at)fail();
 const accounts=new Map(rows('accounts').map(a=>[a.id,a])),students=new Map(rows('billing_students').map(s=>[key(s.group_id,s.id),s])),links=new Map(rows('parent_child_links').map(l=>[key(l.group_id,l.id),l])),bindingEvents=new Map(rows('parent_link_events').map(e=>[key(e.group_id,e.link_id,e.revision),e])),financial=new Map(rows('parent_financial_access').map(f=>[key(f.group_id,f.id),f])),financialEvents=new Map(rows('parent_financial_events').map(e=>[key(e.group_id,e.access_id,e.revision),e])),subscriptions=new Map(rows('push_subscriptions').map(s=>[s.id,s]));
 const notices=new Map();
 for(const n of rows('parent_notifications')){
  const parent=accounts.get(n.account_id),student=students.get(key(n.group_id,n.student_id)),link=links.get(key(n.group_id,n.link_id)),binding=bindingEvents.get(key(n.group_id,n.link_id,n.link_revision)),absence=n.kind==='student_absent',source=parse(n.source_revision);
  if(!text(n.id)||!text(n.group_id,64)||!text(n.account_id)||!text(n.student_id)||!text(n.link_id)||!text(n.source_id)||!text(n.cycle_key,500)||!integer(n.link_revision,1)||!integer(n.revision,1)||!['invoice_issued','invoice_due_soon','invoice_due','invoice_overdue','student_absent'].includes(n.kind)||!stamp(n.due_at)||!stamp(n.created_at)||!stamp(n.updated_at)||!nullableStamp(n.read_at)||!nullableStamp(n.cancelled_at)||n.created_at<run.activation_at||n.updated_at<n.created_at||n.read_at!==null&&n.read_at<n.created_at||n.cancelled_at!==null&&n.cancelled_at<n.created_at||!text(n.cancel_reason,500,0)||(n.cancelled_at===null)!==(n.cancel_reason==='')||!parent||parent.group_id!==n.group_id||!student||!link||link.parent_account_id!==n.account_id||link.student_id!==n.student_id||link.revision<n.link_revision||!binding||binding.action!=='grant'||binding.parent_account_id!==n.account_id||binding.student_id!==n.student_id||binding.created_at>n.created_at)fail();
  const expected=JSON.stringify([absence?'absence':'invoice',n.source_id,n.cycle_key,n.link_id,n.link_revision,n.finance_access_id??'',n.finance_revision??0]);if(n.dedup_key!==expected)fail();
  if(absence){
   const event=db.prepare('SELECT * FROM audit WHERE id=? AND group_id=?').get(n.cycle_key,n.group_id),lesson=db.prepare('SELECT group_id,student FROM lessons WHERE id=?').get(n.source_id),before=event&&parse(event.before_json||'{}'),after=event&&parse(event.after_json||'{}');
   if(n.finance_access_id!==null||n.finance_revision!==null||!Array.isArray(source)||source.length!==2||source[0]!=='absent'||source[1]!==n.cycle_key||!event||event.lesson_id!==n.source_id||!['saveSessionAttendance','reviewSessionAttendance'].includes(event.action)||after?.status!=='absent'||after?.teachingStatus==='teacher_absent'||before?.status==='absent'&&before?.teachingStatus!=='teacher_absent'||!stamp(event.at)||event.at<run.activation_at||event.at>n.created_at||lesson&&(lesson.group_id!==n.group_id||lesson.student!==student.student_name))fail();
  }else{
   const f=financial.get(key(n.group_id,n.finance_access_id)),grant=financialEvents.get(key(n.group_id,n.finance_access_id,n.finance_revision)),invoice=db.prepare('SELECT status,student_id,issued_at FROM invoices WHERE group_id=? AND id=?').get(n.group_id,n.source_id);
   if(!text(n.finance_access_id)||!integer(n.finance_revision,1)||!f||f.link_id!==n.link_id||f.parent_account_id!==n.account_id||f.student_id!==n.student_id||f.revision<n.finance_revision||!grant||grant.action!=='grant'||grant.link_id!==n.link_id||grant.link_revision!==n.link_revision||grant.parent_account_id!==n.account_id||grant.student_id!==n.student_id||grant.created_at>n.created_at||!day(n.cycle_key)||new Date(Date.parse(n.due_at)+8*3600000).toISOString().slice(0,10)!==n.cycle_key||!Array.isArray(source)||source.length!==4||!integer(source[0])||!day(source[1])||!integer(source[2],0,100000000)||!integer(source[3],0,100000000)||!invoice||invoice.status!=='issued'||invoice.student_id!==n.student_id||n.kind==='invoice_issued'&&invoice.issued_at<run.activation_at)fail();
  }
  notices.set(key(n.group_id,n.id),n);
 }
 for(const d of rows('parent_notification_deliveries')){
  const n=notices.get(key(d.group_id,d.item_id)),device=subscriptions.get(d.subscription_id);
  if(!text(d.id)||!text(d.group_id,64)||!n||!device||device.account_id!==n.account_id||!integer(d.notification_revision,1)||d.notification_revision>n.revision||!['pending','sending','sent','expired','failed','cancelled'].includes(d.status)||!integer(d.attempts,0,3)||!stamp(d.next_attempt_at)||!nullableStamp(d.lock_until)||!nullableStamp(d.sent_at)||!text(d.last_error,500,0)||(d.lock_until===null)!==(d.claim_token===null)||d.claim_token!==null&&!text(d.claim_token,100,16)||d.status==='sending'&&(d.claim_token===null||d.attempts<1)||d.status!=='sending'&&d.claim_token!==null||d.status==='sent'&&d.sent_at===null||d.sent_at!==null&&(d.attempts<1||['pending','sending','failed'].includes(d.status)))fail();
 }
 if(db.prepare('PRAGMA foreign_key_check').all().length)fail();
}
