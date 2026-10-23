import {checkRestoredAttendanceWindow} from './attendance-window-backup.mjs';
export {checkRestoredAttendanceWindow} from './attendance-window-backup.mjs';
import {checkRestoredParentNotifications,PARENT_NOTIFICATION_TABLES,PARENT_NOTIFICATION_REPLAY_TRIGGERS} from './parent-notifications-backup.mjs';
export {checkRestoredParentNotifications} from './parent-notifications-backup.mjs';
import {checkRestoredParentFinance,PARENT_FINANCIAL_TABLES,PARENT_FINANCIAL_REPLAY_TRIGGERS} from './parent-finance-backup.mjs';
export {checkRestoredParentFinance} from './parent-finance-backup.mjs';
import {checkRestoredParents,PARENT_TABLES,PARENT_REPLAY_TRIGGERS} from './parents-backup.mjs';
export {checkRestoredParents} from './parents-backup.mjs';
import {checkRestoredPrepayments,PREPAYMENT_TABLES,PREPAYMENT_REPLAY_TRIGGERS} from './prepayments-backup.mjs';
export {checkRestoredPrepayments} from './prepayments-backup.mjs';
import {checkRestoredFinanceRound2,FINANCE_ROUND2_TABLES,FINANCE_ROUND2_REPLAY_TRIGGERS,CLASS_PAYROLL_TABLES} from './finance-round2-backup.mjs';
export {checkRestoredFinanceRound2} from './finance-round2-backup.mjs';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import {checkRestoredInvoiceFinance,INVOICE_FINANCE_REPLAY_TRIGGERS} from './invoice-finance-backup.mjs';
export {checkRestoredInvoiceFinance} from './invoice-finance-backup.mjs';
// The source catalogue is self-contained. Reuse its strict parser so restored
// settings cannot admit unknown actions, future modules or missing dependencies.
const permissionSource=stripTypeScriptTypes(readFileSync(new URL('../lib/admin-permissions.ts',import.meta.url),'utf8'));
const {normalizeAdminGrants:normalizeRestoredAdminGrants}=await import('data:text/javascript;base64,'+Buffer.from(permissionSource).toString('base64'));
const recordingSource=stripTypeScriptTypes(readFileSync(new URL('../lib/recordings.ts',import.meta.url),'utf8'),{mode:'transform'});
const {recordingDriveUrl,recordingDate}=await import('data:text/javascript;base64,'+Buffer.from(recordingSource).toString('base64'));
const externalSource=stripTypeScriptTypes(readFileSync(new URL('../lib/backup-external-schema.ts',import.meta.url),'utf8'));
const {EXTERNAL_BOT_TABLES,externalSchemaPlan}=await import('data:text/javascript;base64,'+Buffer.from(externalSource).toString('base64'));
export function externalSnapshotSchema(database){
 const objects=database?.externalSchema;
 const hashes=Object.fromEntries((Array.isArray(objects)?objects:[]).filter(item=>item&&typeof item.name==='string'&&typeof item.sql==='string').map(item=>[item.name,createHash('sha256').update(item.sql).digest('hex')]));
 const result=externalSchemaPlan(Object.keys(database?.tables||{}),objects,hashes);
 if(result.names.length&&snapshotVersion(database)<23)throw Error('External Bot schema requires snapshot v23');
 return result;
}

// Restore structural parents before content. Replay historical rows without
// applying current publishing rules (an archived class may contain PDFs).
export const historicalInsertTriggers=['attendance_teaching_conflict','attendance_student_conflict','folder_parent_insert','material_active_class_insert','homework_active_class_insert','material_initial_version','homework_initial_version','class_session_auto_insert','class_session_conflict_insert','class_session_link_insert','billing_student_identity_insert','billing_subject_identity_insert','invoice_issued_item_insert',...INVOICE_FINANCE_REPLAY_TRIGGERS,...FINANCE_ROUND2_REPLAY_TRIGGERS,...PREPAYMENT_REPLAY_TRIGGERS,...PARENT_REPLAY_TRIGGERS,...PARENT_FINANCIAL_REPLAY_TRIGGERS,...PARENT_NOTIFICATION_REPLAY_TRIGGERS];
export function orderedSnapshotTables(tables) {
 const names=Object.keys(tables),priority=['academic_catalogues','tuition_groups','teachers','students','plans','accounts','whatsapp_contacts','whatsapp_challenges','whatsapp_contact_requests','classrooms','classroom_folders','class_sessions','lessons','class_session_participants','class_recordings','recording_recipients','recording_operations','pdf_files','teaching_materials','homework','homework_recipients','homework_submissions','homework_resubmission_grants','homework_feedback','push_subscriptions','learning_notifications','learning_notification_deliveries','quizzes','quiz_images','quiz_versions','quiz_answer_keys','quiz_version_images','quiz_question_sources','quiz_publications','quiz_publication_reports','quiz_publication_appeals','quiz_moderation_events','quiz_moderation_operations','quiz_practice_assignments','quiz_practice_recipients','quiz_practice_attempts','quiz_practice_operations','quiz_practice_events','quiz_assignment_notifications','student_grade_promotions','billing_students','billing_subjects','billing_policies','billing_policy_versions','billing_rates','billing_rate_versions','billing_operations','billing_adjustments','admin_permission_profiles','invoice_brand_assets','invoice_brand_settings','invoices','invoice_items','invoice_operations','invoice_sequences','invoice_source_locks','invoice_finance_accounts','invoice_finance_operations','invoice_payments','invoice_receipt_sequences','invoice_receipts','invoice_finance_events','invoice_attendance_corrections',...FINANCE_ROUND2_TABLES,...CLASS_PAYROLL_TABLES,...PREPAYMENT_TABLES,...PARENT_TABLES,...PARENT_FINANCIAL_TABLES,...PARENT_NOTIFICATION_TABLES];
 const ordered=[...priority.filter(name=>names.includes(name)),...names.filter(name=>!priority.includes(name)&&name!=='classroom_content_state'),...(names.includes('classroom_content_state')?['classroom_content_state']:[])];
 return ordered.map(name=>{
  const table=tables[name];if(name!=='classroom_folders')return [name,table];
  const remaining=new Map(table.rows.map(row=>[row.id,row])),rows=[],seen=new Set();
  if(remaining.size!==table.rows.length)throw Error('Duplicate folder ID in backup');
  while(remaining.size){let progressed=false;for(const [id,row]of remaining){if(row.parent_id==null||seen.has(row.parent_id)){rows.push(row);seen.add(id);remaining.delete(id);progressed=true;}}if(!progressed)throw Error('Backup folder tree has a cycle or missing parent');}
  return [name,{...table,rows}];
 });
}
export function checkRestoredAcademicStructure(db) {
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='academic_catalogues'").get())return;
 const key=value=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
 const id=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
 const label=(value,max=100)=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=max&&!/[\p{Cc}\p{Cf}|]/u.test(value);
 const fail=()=>{throw Error('Restored academic catalogue or student classification is invalid');};
 const rows=db.prepare('SELECT * FROM academic_catalogues ORDER BY scope').all();
 if(rows.map(row=>row.scope).join(',')!=='quiz,student')fail();
 const catalogues=new Map();
 for(const row of rows){
  if(!Number.isSafeInteger(row.revision)||row.revision<1||!Number.isFinite(Date.parse(row.updated_at))||(row.updated_by!==null&&typeof row.updated_by!=='string'))fail();
  const content=JSON.parse(row.content_json);
  if(!Array.isArray(content.syllabuses)||content.syllabuses.length<1||content.syllabuses.length>32)fail();
  const syllabusIds=new Set(),syllabusNames=new Set();
  for(const syllabus of content.syllabuses){
   if(!id(syllabus.id)||!label(syllabus.name)||typeof syllabus.active!=='boolean'||syllabusIds.has(syllabus.id)||syllabusNames.has(key(syllabus.name))||!Array.isArray(syllabus.grades)||syllabus.grades.length>32||syllabus.grades.some(value=>!label(value,60))||new Set(syllabus.grades.map(key)).size!==syllabus.grades.length||!Array.isArray(syllabus.subjects)||syllabus.subjects.length>120)fail();
   syllabusIds.add(syllabus.id);syllabusNames.add(key(syllabus.name));
   const subjectIds=new Set(),subjectNames=new Map();
   for(const subject of syllabus.subjects){
    if(!id(subject.id)||!label(subject.name)||typeof subject.active!=='boolean'||subjectIds.has(subject.id)||!Array.isArray(subject.aliases)||subject.aliases.length>40||subject.aliases.some(value=>!label(value)))fail();
    subjectIds.add(subject.id);
    for(const value of [subject.id,subject.name,...subject.aliases].map(key)){if(subjectNames.has(value)&&subjectNames.get(value)!==subject.id)fail();subjectNames.set(value,subject.id);}
   }
  }
  catalogues.set(row.scope,content.syllabuses);
 }
 const syllabuses=catalogues.get('student'),getSyllabus=id=>syllabuses.find(syllabus=>syllabus.id===id);
 for(const student of db.prepare('SELECT syllabus_id,grade,age FROM students').all()){
  const syllabus=getSyllabus(student.syllabus_id);
  if(!syllabus||(student.grade!==null&&!syllabus.grades.includes(student.grade))||(student.age!==null&&(!Number.isSafeInteger(student.age)||student.age<0||student.age>100)))fail();
 }
 const badPlan=db.prepare('SELECT p.subject_id,s.syllabus_id FROM plans p LEFT JOIN students s ON s.group_id=p.group_id AND s.name=p.student WHERE p.subject_id IS NOT NULL').all();
 for(const plan of badPlan)if(!getSyllabus(plan.syllabus_id)?.subjects.some(subject=>subject.id===plan.subject_id))fail();
 for(const classroom of db.prepare('SELECT syllabus_id,subject_id,grade FROM classrooms').all()){
  if(classroom.syllabus_id===null){if(classroom.subject_id!==null||classroom.grade!==null)fail();continue;}
  const syllabus=getSyllabus(classroom.syllabus_id);
  if(!syllabus||(classroom.subject_id!==null&&!syllabus.subjects.some(subject=>subject.id===classroom.subject_id))||(classroom.grade!==null&&!syllabus.grades.includes(classroom.grade)))fail();
 }
 for(const promotion of db.prepare('SELECT * FROM student_grade_promotions').all()){
  const syllabus=getSyllabus(promotion.syllabus_id),from=syllabus?.grades.indexOf(promotion.from_grade);
  if(!syllabus||!Number.isSafeInteger(promotion.cycle)||promotion.cycle<1||from<0||syllabus.grades[from+1]!==promotion.to_grade||typeof promotion.confirmed_by!=='string'||!promotion.confirmed_by||!Number.isFinite(Date.parse(promotion.confirmed_at)))fail();
 }
}
export function checkRestoredBillingStructure(db) {
 const tables=['billing_students','billing_subjects','billing_policies','billing_policy_versions','billing_rates','billing_rate_versions','billing_operations','billing_adjustments'];
 const present=db.prepare(`SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN (${tables.map(()=>'?').join(',')})`).get(...tables).count;
 if(!present)return;
 const fail=()=>{throw Error('Restored billing relationships or financial metadata are invalid');};
 if(present!==tables.length)fail();
 const bad=db.prepare(`SELECT 1 FROM billing_students b LEFT JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name LEFT JOIN tuition_groups g ON g.id=b.group_id WHERE s.name IS NULL OR g.id IS NULL
 UNION ALL SELECT 1 FROM billing_subjects s LEFT JOIN billing_students b ON b.id=s.student_id AND b.group_id=s.group_id WHERE b.id IS NULL
 UNION ALL SELECT 1 FROM billing_policies p LEFT JOIN tuition_groups g ON g.id=p.group_id LEFT JOIN billing_policy_versions v ON v.id=p.current_version_id AND v.group_id=p.group_id AND v.revision=p.revision WHERE g.id IS NULL OR (p.revision=0 AND (p.current_version_id IS NOT NULL OR EXISTS(SELECT 1 FROM billing_policy_versions x WHERE x.group_id=p.group_id))) OR (p.revision>0 AND (v.id IS NULL OR EXISTS(SELECT 1 FROM billing_policy_versions x WHERE x.group_id=p.group_id AND x.revision>p.revision)))
 UNION ALL SELECT 1 FROM billing_policy_versions v LEFT JOIN billing_policies p ON p.group_id=v.group_id WHERE p.group_id IS NULL
 UNION ALL SELECT 1 FROM billing_rates r LEFT JOIN billing_subjects s ON s.group_id=r.group_id AND s.student_id=r.student_id AND s.subject_key=r.subject_key LEFT JOIN billing_rate_versions v ON v.id=r.current_version_id AND v.group_id=r.group_id AND v.rate_id=r.id AND v.revision=r.revision WHERE s.id IS NULL OR (r.revision=0 AND (r.current_version_id IS NOT NULL OR EXISTS(SELECT 1 FROM billing_rate_versions x WHERE x.rate_id=r.id))) OR (r.revision>0 AND (v.id IS NULL OR EXISTS(SELECT 1 FROM billing_rate_versions x WHERE x.rate_id=r.id AND x.revision>r.revision)))
 UNION ALL SELECT 1 FROM billing_rate_versions v LEFT JOIN billing_rates r ON r.id=v.rate_id AND r.group_id=v.group_id WHERE r.id IS NULL
 UNION ALL SELECT 1 FROM billing_operations o LEFT JOIN tuition_groups g ON g.id=o.group_id WHERE g.id IS NULL
 UNION ALL SELECT 1 FROM billing_adjustments a LEFT JOIN billing_students b ON b.id=a.student_id AND b.group_id=a.group_id WHERE b.id IS NULL
 UNION ALL SELECT 1 FROM billing_policies p WHERE p.revision<>(SELECT count(*) FROM billing_policy_versions v WHERE v.group_id=p.group_id)
 UNION ALL SELECT 1 FROM billing_rates r WHERE r.revision<>(SELECT count(*) FROM billing_rate_versions v WHERE v.rate_id=r.id AND v.group_id=r.group_id)
 UNION ALL SELECT 1 FROM billing_adjustments GROUP BY group_id,line_id HAVING count(*)<>max(revision) OR count(DISTINCT student_id)>1 OR count(DISTINCT month)>1 LIMIT 1`).get();
 if(bad)fail();
 const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value);
 const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
 const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
 const date=value=>typeof value==='string'&&/^20\d\d-\d\d-\d\d$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 const instant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
 // Identity mappings inherit roster/plan timestamps verbatim. Older valid
 // timestamps may omit milliseconds or use an explicit UTC offset.
 for(const row of db.prepare('SELECT * FROM billing_students').all())if(!identifier(row.id)||!text(row.student_name,160)||typeof row.created_at!=='string'||!Number.isFinite(Date.parse(row.created_at)))fail();
 for(const row of db.prepare('SELECT * FROM billing_subjects').all())if(!identifier(row.id)||!text(row.subject_key,200)||!text(row.subject,100)||typeof row.created_at!=='string'||!Number.isFinite(Date.parse(row.created_at)))fail();
 for(const name of ['billing_policies','billing_rates'])for(const row of db.prepare('SELECT * FROM '+name).all())if((name==='billing_rates'&&!identifier(row.id))||!integer(row.revision)||!instant(row.updated_at)||(row.current_version_id!==null&&!identifier(row.current_version_id)))fail();
 for(const row of db.prepare('SELECT * FROM billing_policy_versions').all())if(!identifier(row.id)||!integer(row.revision,1)||row.currency!=='MYR'||!['minute','quarter_up'].includes(row.hour_rounding)||!['personal','teaching'].includes(row.attendance_basis)||!['manual','daily'].includes(row.monthly_partial)||!date(row.effective_from)||!text(row.actor_id,160)||!instant(row.created_at))fail();
 for(const row of db.prepare('SELECT * FROM billing_rate_versions').all())if(!identifier(row.id)||!integer(row.revision,1)||!['hour','lesson','month'].includes(row.mode)||!integer(row.amount_cents,1,100000000)||row.currency!=='MYR'||!date(row.effective_from)||!text(row.subject_snapshot,100)||!text(row.actor_id,160)||!instant(row.created_at))fail();
 for(const row of db.prepare('SELECT * FROM billing_operations').all()){
  if(!identifier(row.operation_id)||!text(row.actor_id,160)||!text(row.action,80)||typeof row.request_hash!=='string'||!/^[a-f0-9]{64}$/.test(row.request_hash)||!instant(row.created_at))fail();
  let result;try{result=JSON.parse(row.result_json);}catch{fail();}if(!result||typeof result!=='object'||Array.isArray(result))fail();
 }
 for(const row of db.prepare('SELECT * FROM billing_adjustments').all())if(!identifier(row.id)||!/^20\d\d-(?:0[1-9]|1[0-2])$/.test(row.month)||!text(row.line_id,512)||!integer(row.revision,1)||(row.amount_cents!==null&&!integer(row.amount_cents,0,100000000))||typeof row.basis_hash!=='string'||!/^[a-f0-9]{64}$/.test(row.basis_hash)||!text(row.reason,1000)||!text(row.actor_id,160)||!instant(row.created_at))fail();
 if(db.prepare('PRAGMA foreign_key_check').all().length)fail();
}
export function checkRestoredAdminPermissionsStructure(db) {
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='admin_permission_profiles'").get())return;
 const fail=()=>{throw Error('Restored administrator permission settings are invalid');};
 if(db.prepare(`SELECT 1 FROM admin_permission_profiles p
   LEFT JOIN accounts a ON a.id=p.account_id AND a.group_id=p.group_id
   LEFT JOIN tuition_groups g ON g.id=p.group_id WHERE a.id IS NULL OR g.id IS NULL LIMIT 1`).get())fail();
 for(const row of db.prepare('SELECT * FROM admin_permission_profiles').all()){
  if(!Number.isSafeInteger(row.revision)||row.revision<1||!['legacy','new'].includes(row.origin)||typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at))||(row.updated_by!==null&&(typeof row.updated_by!=='string'||!row.updated_by||row.updated_by.length>160)))fail();
  for(const field of ['grants_json','draft_grants_json']){
   if(field==='draft_grants_json'&&row[field]===null)continue;
   try{const grants=JSON.parse(row[field]);if(JSON.stringify(normalizeRestoredAdminGrants(grants))!==JSON.stringify(grants))fail();}catch{fail();}
  }
 }
}
export function checkRestoredRecordingsAndContacts(db) {
 const count=names=>db.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN (${names.map(()=>'?').join(',')})`).get(...names).n;
 const contacts=['whatsapp_contacts','whatsapp_challenges','whatsapp_contact_requests'],recordings=['class_recordings','recording_recipients','recording_operations'];
 const contactCount=count(contacts),recordingCount=count(recordings);
 const fail=()=>{throw Error('Restored recordings or WhatsApp relationships are invalid');};
 if(contactCount&&contactCount!==contacts.length||recordingCount&&recordingCount!==recordings.length)fail();
 if(contactCount)for(const name of contacts){
  // Contacts/challenges retain their historical identity snapshot after role or
  // name changes; restoring them must not silently rebind a different person.
  if(db.prepare(`SELECT 1 FROM ${name} w LEFT JOIN accounts a ON a.id=w.account_id LEFT JOIN tuition_groups g ON g.id=w.group_id WHERE a.id IS NULL OR g.id IS NULL LIMIT 1`).get())fail();
 }
 if(!recordingCount)return;
 if(db.prepare(`SELECT 1 FROM class_recordings r LEFT JOIN classrooms c ON c.id=r.classroom_id AND c.group_id=r.group_id
  LEFT JOIN accounts a ON a.id=r.created_by LEFT JOIN class_sessions s ON s.id=r.session_id AND s.group_id=r.group_id AND s.classroom_id=r.classroom_id
  WHERE c.id IS NULL OR a.id IS NULL OR (r.session_id IS NOT NULL AND s.id IS NULL)
  UNION ALL SELECT 1 FROM recording_recipients x LEFT JOIN class_recordings r ON r.id=x.recording_id AND r.group_id=x.group_id WHERE r.id IS NULL OR r.audience_mode<>'selected'
  UNION ALL SELECT 1 FROM recording_operations o LEFT JOIN accounts a ON a.id=o.actor_id LEFT JOIN tuition_groups g ON g.id=o.group_id WHERE a.id IS NULL OR g.id IS NULL LIMIT 1`).get())fail();
 for(const row of db.prepare('SELECT * FROM class_recordings').all()){
  if(typeof row.title!=='string'||!row.title.trim()||row.title.length>200||typeof row.description!=='string'||row.description.length>4000||!['draft','published'].includes(row.status)||!['classroom','selected'].includes(row.audience_mode)||!Number.isSafeInteger(row.revision)||row.revision<1||!Number.isFinite(Date.parse(row.created_at))||!Number.isFinite(Date.parse(row.updated_at)))fail();
  try{if(recordingDriveUrl(row.drive_url)!==row.drive_url||recordingDate(row.lesson_date)!==row.lesson_date)fail();}catch{fail();}
 }
 // Students may since have left a class; preserve the original recipient list.
 for(const row of db.prepare('SELECT student_name FROM recording_recipients').all())if(typeof row.student_name!=='string'||!row.student_name.trim()||row.student_name.length>80)fail();
 for(const row of db.prepare('SELECT * FROM recording_operations').all()){
  if(typeof row.request_hash!=='string'||!/^[a-f0-9]{64}$/.test(row.request_hash)||!Number.isFinite(Date.parse(row.created_at)))fail();
  try{const result=JSON.parse(row.result_json);if(!result||typeof result!=='object'||Array.isArray(result))fail();}catch{fail();}
 }
}
export function checkRestoredQuizUpgrade(db){
 const names=['quiz_publications','quiz_publication_reports','quiz_publication_appeals','quiz_moderation_events','quiz_moderation_operations','quiz_question_sources'];
 const present=names.filter(name=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
 if(!present.length)return;if(present.length!==names.length)throw Error('Restored quiz upgrade schema is incomplete');
 const fail=()=>{throw Error('Restored quiz moderation or provenance is invalid');},date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value)),id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(value),text=(value,max)=>typeof value==='string'&&value.length<=max,accountId=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\x00-\x1f\x7f]/.test(value);
 const badSource=db.prepare(`SELECT 1 FROM quiz_question_sources s LEFT JOIN quiz_versions target ON target.id=s.version_id LEFT JOIN quiz_versions origin ON origin.id=s.source_version_id WHERE target.id IS NULL OR origin.id IS NULL OR target.group_id<>s.group_id OR target.id=origin.id OR NOT EXISTS(SELECT 1 FROM json_each(target.content_json,'$.questions') q WHERE json_extract(q.value,'$.id')=s.question_id) OR NOT EXISTS(SELECT 1 FROM json_each(origin.content_json,'$.questions') q WHERE json_extract(q.value,'$.id')=s.source_question_id) LIMIT 1`).get();
 const badPublication=db.prepare('SELECT 1 FROM quiz_publications p LEFT JOIN quizzes q ON q.id=p.quiz_id LEFT JOIN quiz_versions v ON v.id=p.version_id WHERE q.id IS NULL OR v.id IS NULL OR q.id<>v.quiz_id OR p.group_id<>q.group_id OR v.group_id<>p.group_id OR p.applicant_id<>q.owner_id LIMIT 1').get();
 const badReport=db.prepare('SELECT 1 FROM quiz_publication_reports r LEFT JOIN quiz_versions v ON v.id=r.version_id WHERE v.id IS NULL OR v.quiz_id<>r.quiz_id LIMIT 1').get();
 const badAppeal=db.prepare('SELECT 1 FROM quiz_publication_appeals a LEFT JOIN quiz_publications p ON p.id=a.publication_id WHERE p.id IS NULL OR p.quiz_id<>a.quiz_id OR p.group_id<>a.group_id OR p.applicant_id<>a.applicant_id LIMIT 1').get();
 if(badSource||badPublication||badReport||badAppeal)fail();
 for(const row of db.prepare('SELECT * FROM quiz_publications').all()){
  if(!id(row.id)||!accountId(row.applicant_id)||!Number.isSafeInteger(row.revision)||row.revision<1||!date(row.created_at)||!date(row.updated_at)||(row.reviewed_at!==null&&!date(row.reviewed_at))||!text(row.author_display_name,120)||!text(row.authorization,3000)||!text(row.source_url,1500)||!text(row.review_reason,3000))fail();
  if(['approved','pending'].includes(row.status)&&(row.rights_confirmed!==1||!['original','licensed'].includes(row.source_type)||!row.author_display_name.trim()||!row.authorization.trim()||row.source_type==='licensed'&&!row.source_url))fail();
  if(row.source_url){let url;try{url=new URL(row.source_url);}catch{fail();}if(url.protocol!=='https:'||url.username||url.password)fail();}
 }
 for(const [table,person]of [['quiz_publication_reports','reporter_id'],['quiz_publication_appeals','applicant_id']])for(const row of db.prepare('SELECT * FROM '+table).all())if(!id(row.id)||!accountId(row[person])||!Number.isSafeInteger(row.revision)||row.revision<1||!text(row.reason,3000)||!row.reason.trim()||!text(row.resolution,3000)||!date(row.created_at)||!date(row.updated_at))fail();
 for(const row of db.prepare('SELECT * FROM quiz_moderation_operations').all())if(!id(row.id)||!accountId(row.actor_id)||!id(row.record_id)||typeof row.kind!=='string'||!row.kind||!/^[a-f0-9]{64}$/.test(row.request_hash)||!date(row.created_at))fail();
 for(const row of db.prepare('SELECT * FROM quiz_moderation_events').all()){
  if(!id(row.id)||!accountId(row.actor_id)||!id(row.quiz_id)||!id(row.entity_id)||!row.action||!date(row.created_at)||!db.prepare('SELECT 1 FROM quizzes WHERE id=?').get(row.quiz_id))fail();
  try{if(row.before_json!==null)JSON.parse(row.before_json);JSON.parse(row.after_json);}catch{fail();}
 }
 for(const row of db.prepare('SELECT public_blocked_at FROM quizzes WHERE public_blocked_at IS NOT NULL').all())if(!date(row.public_blocked_at))fail();
}
export function checkRestoredFolderStructure(db) {
 checkRestoredQuizUpgrade(db);
 checkRestoredRecordingsAndContacts(db);
 checkRestoredAdminPermissionsStructure(db);
 checkRestoredBillingStructure(db);
 checkRestoredInvoiceStructure(db);
 checkRestoredInvoiceFinance(db);
 checkRestoredFinanceRound2(db);
 checkRestoredPrepayments(db);
 checkRestoredParents(db);
 checkRestoredParentFinance(db);
 checkRestoredParentNotifications(db);
 checkRestoredAttendanceWindow(db);
 checkRestoredAcademicStructure(db);
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='classroom_folders'").get())return;
 const invalid=db.prepare(`SELECT 1 FROM classroom_folders f LEFT JOIN classrooms c ON c.id=f.classroom_id LEFT JOIN classroom_folders p ON p.id=f.parent_id WHERE c.id IS NULL OR c.group_id<>f.group_id OR (f.parent_id IS NOT NULL AND (p.id IS NULL OR p.classroom_id<>f.classroom_id OR p.group_id<>f.group_id)) LIMIT 1`).get();
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='learning_versions'").get()) {
  const invalidVersion=db.prepare("SELECT 1 FROM learning_versions v LEFT JOIN pdf_files f ON f.id=v.file_id WHERE (v.file_id IS NOT NULL AND (f.id IS NULL OR f.group_id<>v.group_id)) OR (v.kind='material' AND NOT EXISTS(SELECT 1 FROM teaching_materials m WHERE m.id=v.record_id AND m.group_id=v.group_id)) OR (v.kind='homework' AND NOT EXISTS(SELECT 1 FROM homework h WHERE h.id=v.record_id AND h.group_id=v.group_id)) LIMIT 1").get();
  if(invalidVersion)throw Error('Restored content versions are invalid');
 }
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='homework_feedback'").get()){
  const badFeedback=db.prepare("SELECT 1 FROM homework_feedback f JOIN homework h ON h.id=f.homework_id JOIN homework_submissions s ON s.id=f.submission_id LEFT JOIN pdf_files p ON p.id=f.file_id WHERE f.group_id<>h.group_id OR f.group_id<>s.group_id OR h.id<>s.homework_id OR f.teacher_id<>h.owner_id OR (f.file_id IS NOT NULL AND (p.id IS NULL OR p.group_id<>f.group_id OR p.owner_id<>f.teacher_id OR p.kind<>'feedback' OR p.context_id<>s.id OR p.status<>'attached')) LIMIT 1").get();
  const badGrant=db.prepare("SELECT 1 FROM homework_resubmission_grants g JOIN homework h ON h.id=g.homework_id JOIN homework_recipients r ON r.id=g.recipient_id JOIN homework_submissions s ON s.id=g.base_submission_id WHERE g.group_id<>h.group_id OR g.group_id<>r.group_id OR g.group_id<>s.group_id OR r.homework_id<>h.id OR s.homework_id<>h.id OR s.student_name<>g.student_name OR r.student_name<>g.student_name OR h.owner_id<>g.granted_by LIMIT 1").get();
  if(badFeedback||badGrant)throw Error('Restored feedback or resubmission grants are invalid');
 }
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='class_sessions'").get()){
  const invalidSession=db.prepare("SELECT 1 FROM lessons l LEFT JOIN class_sessions s ON s.id=l.session_id LEFT JOIN class_session_participants p ON p.lesson_id=l.id WHERE s.id IS NULL OR p.id IS NULL OR s.group_id<>l.group_id OR p.group_id<>l.group_id OR p.session_id<>s.id OR p.student_name<>l.student OR s.teacher_name<>l.teacher_name OR s.subject<>l.subject OR s.planned_start<>l.planned_start OR s.planned_end<>l.planned_end LIMIT 1").get();
  if(invalidSession)throw Error('Restored class sessions or participant snapshots are invalid');
  if(db.prepare('PRAGMA table_info(class_sessions)').all().some(c=>c.name==='teaching_status')){
   const badTeaching=db.prepare("SELECT 1 FROM class_sessions WHERE teaching_status='taught' AND (actual_start IS NULL OR actual_end IS NULL OR actual_start>=actual_end) LIMIT 1").get();
   const badAttendance=db.prepare("SELECT 1 FROM class_session_participants p JOIN class_sessions s ON s.id=p.session_id WHERE s.teaching_status='taught' AND p.attendance_status NOT IN ('pending','absent') AND (p.arrived_at IS NULL OR p.left_at IS NULL OR p.arrived_at>=p.left_at OR p.arrived_at<s.actual_start OR p.left_at>s.actual_end) LIMIT 1").get();
   if(badTeaching||badAttendance)throw Error('Restored teaching or individual attendance times are invalid');
  }
 }
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='quizzes'").get()){
  const badQuiz=db.prepare("SELECT 1 FROM quizzes q LEFT JOIN accounts a ON a.id=q.owner_id WHERE a.id IS NULL OR (a.group_id IS NOT NULL AND a.group_id<>q.group_id) OR q.revision<1 OR NOT EXISTS(SELECT 1 FROM quiz_versions v WHERE v.quiz_id=q.id AND v.group_id=q.group_id AND v.revision=q.revision) OR (q.shared_revision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM quiz_versions v WHERE v.quiz_id=q.id AND v.group_id=q.group_id AND v.revision=q.shared_revision)) LIMIT 1").get();
  const badVersion=db.prepare("SELECT 1 FROM quiz_versions v LEFT JOIN quizzes q ON q.id=v.quiz_id LEFT JOIN quiz_answer_keys k ON k.version_id=v.id WHERE q.id IS NULL OR v.group_id<>q.group_id OR k.version_id IS NULL OR k.group_id<>v.group_id OR v.actor_id<>q.owner_id LIMIT 1").get();
  const badImage=db.prepare("SELECT 1 FROM quiz_images i LEFT JOIN accounts a ON a.id=i.owner_id WHERE a.id IS NULL OR (a.group_id IS NOT NULL AND a.group_id<>i.group_id) LIMIT 1").get();
  const badGrant=db.prepare("SELECT 1 FROM quiz_version_images l LEFT JOIN quiz_versions v ON v.id=l.version_id LEFT JOIN quiz_images i ON i.id=l.image_id WHERE v.id IS NULL OR i.id IS NULL OR v.group_id<>l.group_id OR i.status<>'ready' LIMIT 1").get();
  if(badQuiz||badVersion||badImage||badGrant)throw Error('Restored quiz relationships are invalid');
  const grants=new Set(db.prepare('SELECT version_id,image_id FROM quiz_version_images').all().map(r=>r.version_id+'\0'+r.image_id));
  const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
  const identifier=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
  const shortText=(v,max)=>typeof v==='string'&&v.length<=max;
  for(const q of db.prepare('SELECT * FROM quizzes').all()){
   if(!identifier(q.id)||!shortText(q.title,160)||!q.title.trim()||!shortText(q.subject,100)||!shortText(q.exam,80)||(q.year!==null&&!integer(q.year,1900,2200))||!integer(q.revision,1,Number.MAX_SAFE_INTEGER)||!integer(q.question_count,1,150)||!Number.isFinite(q.total_score)||q.total_score<=0||q.total_score>100000||(q.time_limit_seconds!==null&&!integer(q.time_limit_seconds,60,21600))||(q.shared_revision!==null&&!integer(q.shared_revision,1,q.revision))||(q.source_key!==null&&!/^[a-f0-9]{64}$/.test(q.source_key))||(q.source_version_id!==null&&!identifier(q.source_version_id))||!Number.isFinite(Date.parse(q.created_at))||!Number.isFinite(Date.parse(q.updated_at)))throw Error('Restored quiz metadata is invalid');
  }
  for(const row of db.prepare('SELECT * FROM quiz_versions').all()){
   if(!identifier(row.id)||!identifier(row.operation_id)||row.operation_id.length<16||row.operation_id.length>80||!/^[a-f0-9]{64}$/.test(row.request_hash)||!Number.isFinite(Date.parse(row.created_at)))throw Error('Restored quiz version metadata is invalid');
   const content=JSON.parse(row.content_json);
   const keys=JSON.parse(db.prepare('SELECT answers_json FROM quiz_answer_keys WHERE version_id=?').get(row.id).answers_json);
   if(content.schemaVersion!==1||!Array.isArray(content.questions)||!integer(content.questions.length,1,150)||!Array.isArray(keys)||keys.length!==content.questions.length)throw Error('Restored quiz content is invalid');
   if(content.sampling!=null){const s=content.sampling;if(!s||!integer(s.count,1,150)||!Array.isArray(s.types)||!s.types.length||new Set(s.types).size!==s.types.length||s.types.some(type=>!['mcq','true_false','blank','math','written'].includes(type))||content.questions.filter(q=>s.types.includes(q.type)).length<s.count)throw Error('Restored quiz sampling is invalid');}
   const questionIds=new Set();
   for(const q of content.questions){
    if(!identifier(q.id)||questionIds.has(q.id)||!['mcq','true_false','blank','math','written'].includes(q.type)||!Number.isFinite(q.points)||q.points<0.01||q.points>1000||!Array.isArray(q.options)||!Array.isArray(q.extraImageIds)||q.extraImageIds.length>4)throw Error('Restored quiz question is invalid');
    questionIds.add(q.id);
    const matching=keys.filter(k=>k.questionId===q.id);
    if(matching.length!==1)throw Error('Restored quiz answer key is invalid');
    const k=matching[0];
    if(!['choice','text','numeric','manual'].includes(k.mode)||!Array.isArray(k.accepted)||k.accepted.length>20||k.accepted.some(a=>!shortText(a,300)||!a.trim())||typeof k.caseSensitive!=='boolean'||!Number.isFinite(k.tolerance)||k.tolerance<0||k.tolerance>1000000||!shortText(k.unit,40)||!shortText(k.rubric,4000)||!shortText(k.explanation,4000))throw Error('Restored quiz answer key is invalid');
    if((q.type==='mcq'||q.type==='true_false')&&(k.mode!=='choice'||!q.options.some(o=>o.id===k.correctOptionId))||q.type==='blank'&&(k.mode!=='text'||!k.accepted.length)||q.type==='math'&&!['numeric','manual'].includes(k.mode)||q.type==='written'&&k.mode!=='manual')throw Error('Restored quiz answer type is invalid');
    const images=[q.imageId,...(q.extraImageIds||[]),...(q.options||[]).map(o=>o.imageId)].filter(Boolean);
    if(images.some(id=>!grants.has(row.id+'\0'+id)))throw Error('Restored quiz content has an ungranted image');
   }
  }
 }
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='quiz_practice_attempts'").get()){
  const assignmentMismatch=db.prepare("SELECT 1 FROM quiz_practice_assignments p JOIN quiz_versions v ON v.id=p.version_id JOIN accounts a ON a.id=p.created_by LEFT JOIN classrooms c ON c.id=p.classroom_id WHERE p.quiz_id<>v.quiz_id OR (a.group_id IS NOT NULL AND a.group_id<>p.group_id) OR (p.classroom_id IS NOT NULL AND c.group_id<>p.group_id) LIMIT 1").get();
  const recipientMismatch=db.prepare("SELECT 1 FROM quiz_practice_recipients r JOIN quiz_practice_assignments p ON p.id=r.assignment_id WHERE r.group_id<>p.group_id LIMIT 1").get();
  const attemptMismatch=db.prepare("SELECT 1 FROM quiz_practice_attempts a JOIN quiz_versions v ON v.id=a.version_id JOIN accounts u ON u.id=a.account_id LEFT JOIN quiz_practice_assignments p ON p.id=a.assignment_id WHERE a.quiz_id<>v.quiz_id OR (u.group_id IS NOT NULL AND u.group_id<>a.group_id) OR (a.assignment_id IS NOT NULL AND (p.group_id<>a.group_id OR p.version_id<>a.version_id OR NOT EXISTS(SELECT 1 FROM quiz_practice_recipients r WHERE r.assignment_id=p.id AND r.group_id=a.group_id AND r.student_name=a.student_name))) LIMIT 1").get();
  if(assignmentMismatch||recipientMismatch||attemptMismatch)throw Error('Restored quiz practice relationships are invalid');
  for(const a of db.prepare('SELECT * FROM quiz_practice_attempts').all()){
   if(!Number.isSafeInteger(a.revision)||a.revision<1||!['in_progress','submitted'].includes(a.status)||![0,1].includes(a.immediate)||!Number.isFinite(a.score)||a.score<0||a.score>a.total_score||!Number.isFinite(a.total_score)||a.total_score<=0||!Number.isSafeInteger(a.pending_manual)||a.pending_manual<0||!Number.isFinite(Date.parse(a.started_at))||!Number.isFinite(Date.parse(a.updated_at))||(a.deadline_at!==null&&!Number.isFinite(Date.parse(a.deadline_at)))||(a.status==='submitted')!==(a.submitted_at!==null))throw Error('Restored quiz practice metadata is invalid');
   const content=JSON.parse(db.prepare('SELECT content_json FROM quiz_versions WHERE id=?').get(a.version_id).content_json);
   const order=JSON.parse(a.order_json),answers=JSON.parse(a.answers_json),checked=JSON.parse(a.checked_json),results=JSON.parse(a.results_json);
   if(!order||typeof order!=='object')throw Error('Restored quiz attempt selection is invalid');
   // Preserve pre-sampling snapshot compatibility. New sampled versions must
   // name the exact subset; older full-quiz order formats retain their checks.
   let selectedIds=content.questions.map(q=>q.id);
   if(content.sampling){
    if(!Array.isArray(order.questions)||!order.questions.length||new Set(order.questions).size!==order.questions.length||!order.options||typeof order.options!=='object'||Array.isArray(order.options)||order.questions.some(id=>!content.questions.some(q=>q.id===id)))throw Error('Restored quiz attempt selection is invalid');
    const selected=order.questions.map(id=>content.questions.find(q=>q.id===id));
    if(selected.length!==content.sampling.count||selected.some(q=>!content.sampling.types.includes(q.type))||Math.abs(a.total_score-Math.round(selected.reduce((sum,q)=>sum+q.points,0)*100)/100)>0.000001||selected.some(q=>!Array.isArray(order.options[q.id])||new Set(order.options[q.id]).size!==q.options.length||order.options[q.id].length!==q.options.length||order.options[q.id].some(id=>!q.options.some(o=>o.id===id)))||Object.keys(order.options).some(id=>!order.questions.includes(id)))throw Error('Restored quiz attempt selection is invalid');
    selectedIds=order.questions;
   }
   if(!answers||typeof answers!=='object'||Array.isArray(answers)||!Array.isArray(checked)||!Array.isArray(results)||checked.some(id=>!selectedIds.includes(id))||Object.keys(answers).some(id=>!selectedIds.includes(id))||results.some(r=>!selectedIds.includes(r.questionId)))throw Error('Restored quiz practice answers are invalid');
   if('flagged_json' in a){const flagged=JSON.parse(a.flagged_json);if(!Array.isArray(flagged)||flagged.some(id=>!selectedIds.includes(id)))throw Error('Restored quiz review flags are invalid');}
   if('discarded_at' in a&&a.discarded_at!==null&&(typeof a.discarded_at!=='string'||!Number.isFinite(Date.parse(a.discarded_at))||new Date(a.discarded_at).toISOString()!==a.discarded_at||a.assignment_id!==null||a.status!=='in_progress'||a.submitted_at!==null))throw Error('Restored discarded quiz practice metadata is invalid');
  }
 }
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='quiz_practice_events'").get()){
  const badEvent=db.prepare("SELECT 1 FROM quiz_practice_events e LEFT JOIN quiz_practice_assignments p ON p.id=e.assignment_id LEFT JOIN quiz_practice_attempts a ON a.id=e.attempt_id WHERE (e.assignment_id IS NOT NULL AND (p.id IS NULL OR p.group_id<>e.group_id)) OR (e.attempt_id IS NOT NULL AND (a.id IS NULL OR a.group_id<>e.group_id OR a.assignment_id IS NOT e.assignment_id)) LIMIT 1").get();
  if(badEvent)throw Error('Restored quiz event relationships are invalid');
  for(const event of db.prepare('SELECT * FROM quiz_practice_events').all()){
   if(!Number.isFinite(Date.parse(event.created_at))||!event.action)throw Error('Restored quiz event metadata is invalid');
   for(const field of ['before_json','after_json'])if(event[field]!==null)JSON.parse(event[field]);
  }
 }
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='quiz_assignment_notifications'").get()){
  const badNotice=db.prepare("SELECT 1 FROM quiz_assignment_notifications n LEFT JOIN quiz_practice_assignments p ON p.id=n.assignment_id LEFT JOIN quiz_practice_attempts pa ON pa.id=n.attempt_id LEFT JOIN accounts a ON a.id=n.account_id WHERE p.id IS NULL OR p.group_id<>n.group_id OR a.id IS NULL OR (a.group_id IS NOT NULL AND a.group_id<>n.group_id) OR (n.attempt_id IS NOT NULL AND (pa.id IS NULL OR pa.group_id<>n.group_id OR pa.assignment_id<>n.assignment_id)) LIMIT 1").get();
  if(badNotice)throw Error('Restored quiz notification relationships are invalid');
  for(const notice of db.prepare('SELECT * FROM quiz_assignment_notifications').all())if(!Number.isFinite(Date.parse(notice.created_at))||(notice.read_at!==null&&!Number.isFinite(Date.parse(notice.read_at))))throw Error('Restored quiz notification metadata is invalid');
 }
 if(invalid||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Restored folder relationships are invalid');
}

export function snapshotVersion(data){return Number(data?.format?.match(/^timelyo-d1-v(32|31|30|29|28|27|26|25|24|23|22|21|20|19|18|17|16|15|14|13|12|11|10|[1-9])$/)?.[1]||0);}
export function expectedSnapshotTables(version,tables={}){
 const base=['accounts','assignments','audit','lessons','local_credentials','login_attempts','plans','reschedule_requests','sessions','students','teachers','pdf_files','storage_quota','teaching_materials','material_recipients','homework','homework_recipients','homework_submissions','study_blocks'];
 return [...(version>=9?['tuition_groups']:[]),...base,...(version>=2?['classrooms','classroom_members','classroom_announcements']:[]),...(version>=3?['google_identities']:[]),...(version>=4?['academic_terms']:[]),...(version>=7?['notification_items','notification_deliveries','push_subscriptions','notification_runtime']:[]),...(version>=8?['site_notifications']:[]),...(version>=10?['classroom_folders','classroom_content_state']:[]),...(version>=11?['learning_versions','homework_score_history']:[]),...(version>=12?['homework_resubmission_grants','homework_feedback','learning_notifications','learning_notification_deliveries']:[]),...(version>=13?['class_sessions','class_session_participants']:[]),...(version>=15?['quizzes','quiz_versions','quiz_answer_keys','quiz_images','quiz_version_images']:[]),...(version>=16?['quiz_practice_assignments','quiz_practice_recipients','quiz_practice_attempts','quiz_practice_operations']:[]),...(version>=17?['quiz_practice_events','quiz_assignment_notifications']:[]),...(version>=18?['academic_catalogues','student_grade_promotions']:[]),...(version>=20?['billing_students','billing_subjects','billing_policies','billing_policy_versions','billing_rates','billing_rate_versions','billing_operations','billing_adjustments']:[]),...(version>=21?['admin_permission_profiles']:[]),...(version>=22?['invoice_brand_assets','invoice_brand_settings','invoices','invoice_items','invoice_operations','invoice_sequences','invoice_source_locks']:[]),...(version>=23?['whatsapp_contacts','whatsapp_challenges','whatsapp_contact_requests','class_recordings','recording_recipients','recording_operations',...EXTERNAL_BOT_TABLES.filter(name=>Object.hasOwn(tables,name))]:[]),...(version>=24?['quiz_publications','quiz_publication_reports','quiz_publication_appeals','quiz_moderation_events','quiz_moderation_operations','quiz_question_sources']:[]),...(version>=25?['invoice_finance_accounts','invoice_finance_operations','invoice_payments','invoice_receipt_sequences','invoice_receipts','invoice_finance_events','invoice_attendance_corrections']:[]),...(version>=26?FINANCE_ROUND2_TABLES:[]),...(version>=27?CLASS_PAYROLL_TABLES:[]),...(version>=28?PREPAYMENT_TABLES:[]),...(version>=29?PARENT_TABLES:[]),...(version>=30?PARENT_FINANCIAL_TABLES:[]),...(version>=31?PARENT_NOTIFICATION_TABLES:[])];
}
export function snapshotObjects(database){
 const pdfs=database?.tables?.pdf_files?.rows;if(!Array.isArray(pdfs))throw Error('Database export lacks PDF metadata');
 const objects=pdfs.map(row=>({...row,kind:'pdf',mime:'application/pdf'}));
 if(snapshotVersion(database)>=15){
  for(const row of database.tables.quiz_images.rows){
   if(!/^[a-zA-Z0-9_-]{1,128}$/.test(row.id)||!/^quiz\/[a-zA-Z0-9_-]{1,128}$/.test(row.object_key)||!['image/png','image/jpeg','image/webp'].includes(row.mime)||!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>5242880||!/^[a-f0-9]{64}$/.test(row.sha256)||!['uploading','ready'].includes(row.status)||typeof row.filename!=='string'||!row.filename||row.filename.length>240||typeof row.group_id!=='string'||typeof row.owner_id!=='string'||!Number.isFinite(Date.parse(row.created_at)))throw Error('Invalid quiz image metadata');
   if(row.status==='ready')objects.push({...row,kind:'quiz-image'});
  }
 }
 if(snapshotVersion(database)>=22){
  for(const row of database.tables.invoice_brand_assets.rows){
   if(!/^[a-zA-Z0-9_-]{1,128}$/.test(row.id)||!/^[-a-z0-9]{1,64}$/.test(row.group_id)||row.object_key!=='invoice-brand/'+row.group_id+'/'+row.id+'.png'||!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>2097152||!Number.isSafeInteger(row.width)||row.width<1||row.width>2048||!Number.isSafeInteger(row.height)||row.height<1||row.height>2048||typeof row.created_by!=='string'||!Number.isFinite(Date.parse(row.created_at)))throw Error('Invalid invoice logo metadata');
   objects.push({...row,kind:'invoice-logo',mime:'image/png'});
  }
 }
 const seen=new Set();for(const row of objects){const identity=row.kind+':'+row.id;if(seen.has(identity)||!/^[a-zA-Z0-9_-]{1,128}$/.test(row.id)||!Number.isSafeInteger(row.bytes)||row.bytes<1)throw Error('Invalid or duplicate backup object');seen.add(identity);}
 return objects;
}
export function backupObjectName(file){return file.id+'.'+(file.kind==='quiz-image'?'image':file.kind==='invoice-logo'?'logo':'pdf')+'.dpapi';}
export function validObjectSignature(bytes,mime){
 if(mime==='application/pdf')return bytes.subarray(0,5).toString()==='%PDF-';
 if(mime==='image/png')return bytes.length>=33&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(20)>0;
 if(mime==='image/jpeg')return bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217;
 if(mime==='image/webp')return bytes.length>=20&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&bytes.readUInt32LE(4)===bytes.length-8;
 return false;
}
export function matchManifestObjects(database,files){
 const objects=snapshotObjects(database);if(!Array.isArray(files)||files.length!==objects.length)throw Error('Backup object count does not match restored database');
 const actual=new Map();for(const file of files){const kind=file.kind??'pdf',identity=kind+':'+file.id;if(!['pdf','quiz-image','invoice-logo'].includes(kind)||actual.has(identity)||!/^[a-zA-Z0-9_-]{1,128}$/.test(file.id)||!/^[a-f0-9]{64}$/.test(file.sha256)||!Number.isSafeInteger(file.bytes)||file.bytes<1||typeof file.iv!=='string'||typeof file.tag!=='string')throw Error('Invalid backup manifest entry');actual.set(identity,file);}
 return objects.map(row=>{const metadata=actual.get(row.kind+':'+row.id);if(!metadata||metadata.bytes!==row.bytes||(row.sha256&&metadata.sha256!==row.sha256)||(row.kind!=='pdf'&&(metadata.objectKey!==row.object_key||metadata.mime!==row.mime)))throw Error('Backup object metadata does not match database');return {row,metadata};});
}
export function checkRestoredInvoiceStructure(db){
 const tables=['invoice_brand_assets','invoice_brand_settings','invoices','invoice_items','invoice_operations','invoice_sequences','invoice_source_locks'];
 const count=db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ("+tables.map(()=>'?').join(',')+")").get(...tables).n;if(!count)return;
 const fail=()=>{throw Error('Restored invoice snapshot, source locks or brand metadata is invalid');};if(count!==tables.length)fail();
 for(const row of db.prepare('SELECT * FROM invoices').all()){
  let doc;try{doc=JSON.parse(row.document_json);}catch{fail();}
  if(!doc||doc.id!==row.id||doc.groupId!==row.group_id||doc.studentId!==row.student_id||doc.month!==row.month||doc.status!==row.status||doc.revision!==row.revision||doc.number!==row.number||doc.issuedAt!==row.issued_at||doc.totalCents!==row.total_cents||doc.currency!=='MYR'||!Array.isArray(doc.sourceLines)||!Array.isArray(doc.additions)||!Array.isArray(doc.lines)||!doc.institution)fail();
  const items=db.prepare('SELECT * FROM invoice_items WHERE group_id=? AND invoice_id=? ORDER BY position').all(row.group_id,row.id);
  if(items.reduce((sum,x)=>sum+x.amount_cents,0)!==row.total_cents)fail();
  const locks=db.prepare('SELECT * FROM invoice_source_locks WHERE group_id=? AND invoice_id=?').all(row.group_id,row.id);
  if(row.status==='draft'&&locks.length||row.status==='issued'&&!locks.some(x=>x.source_type==='student_month'&&x.student_id===row.student_id&&x.source_id===row.student_id&&x.month===row.month))fail();
  if(doc.institution.logoAssetId&&!db.prepare('SELECT 1 FROM invoice_brand_assets WHERE id=? AND group_id=?').get(doc.institution.logoAssetId,row.group_id))fail();
 }
 if(db.prepare('PRAGMA foreign_key_check').all().length)fail();
}
