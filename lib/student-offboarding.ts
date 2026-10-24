import type {Account} from './auth';
import {learningDb} from './learning-server';
import {requireCorePermissions,guardedCoreDb} from './admin-core-permissions';
import {adminActorGuard} from './admin-authority';
import {appendAudit} from './audit-log';
import {offboardingFinancialState} from './student-offboarding-finance';
import {deleteUnreferencedFile} from './pdf-storage';

export class StudentOffboardingError extends Error {constructor(message:string,readonly status=409){super(message);}}
export type OffboardingRow={studentName:string;status:'marked'|'cancelled'|'cleaned';lastLessonDate:string|null;reason:string;revision:number;updatedAt:string};
const columns='student_name AS studentName,status,last_lesson_date AS lastLessonDate,reason,revision,updated_at AS updatedAt';
export const malaysiaToday=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const sqlRows=async<T=Record<string,unknown>>(sql:string,...args:unknown[])=>(await learningDb().prepare(sql).bind(...args).all<T>()).results||[];
const canonical=(value:unknown)=>typeof value==='string'?value.trim():'';
const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
export async function offboardingItems(groupId:string,studentName=''){return sqlRows<OffboardingRow>(`SELECT ${columns} FROM student_offboarding WHERE group_id=?${studentName?' AND student_name=?':''} ORDER BY updated_at DESC,student_name`,...studentName?[groupId,studentName]:[groupId]);}
export async function markStudentDeparture(actor:Account,data:Record<string,unknown>){
 await requireCorePermissions(actor,['students.edit']);
 const groupId=actor.groupId!,student=canonical(data.studentName),reason=canonical(data.reason),date=data.lastLessonDate==null||data.lastLessonDate===''?null:canonical(data.lastLessonDate),revision=Number(data.revision),cancel=data.action==='cancel';
 if(!student||student.length>80||reason.length>500||!Number.isSafeInteger(revision)||revision<0||date&&!validDate(date))throw new StudentOffboardingError('请检查姓名、日期和备注',400);
 const current=(await offboardingItems(groupId,student))[0];
 if(current?.status==='cleaned')throw new StudentOffboardingError('学生资料已经清理，无法撤销');
 if((current?.revision||0)!==revision||cancel&&current?.status!=='marked')throw new StudentOffboardingError('记录已更新，请刷新后重试');
 if(!await learningDb().prepare('SELECT 1 FROM students WHERE group_id=? AND name=?').bind(groupId,student).first())throw new StudentOffboardingError('学生不存在',404);
 const now=new Date().toISOString(),db=guardedCoreDb(actor,['students.edit']);
 const write=current?db.prepare('UPDATE student_offboarding SET status=?,last_lesson_date=?,reason=?,revision=revision+1,updated_by=?,updated_at=? WHERE group_id=? AND student_name=? AND revision=? AND status<>\'cleaned\'').bind(cancel?'cancelled':'marked',cancel?current.lastLessonDate:date,cancel?current.reason:reason,actor.id,now,groupId,student,revision):db.prepare("INSERT INTO student_offboarding(group_id,student_name,status,last_lesson_date,reason,revision,marked_by,marked_at,updated_by,updated_at) VALUES(?,?,'marked',?,?,1,?,?,?,?)").bind(groupId,student,date,reason,actor.id,now,actor.id,now);
 await db.batch([adminActorGuard(actor),write,db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM student_offboarding WHERE group_id=? AND student_name=? AND revision=? AND updated_by=? AND updated_at=?) THEN 1 ELSE json_extract('[]','$[student_offboarding_changed') END`).bind(groupId,student,revision+1,actor.id,now),appendAudit(db,{groupId,lessonId:'student:'+student,actorId:actor.id,actorName:actor.name,objectName:student,action:cancel?'studentDeparture.cancel':'studentDeparture.mark',before:current,after:{status:cancel?'cancelled':'marked',lastLessonDate:date,reason},at:now})]);
 return {ok:true,items:await offboardingItems(groupId,student)};
}

type Watch={name:string;sql:string;args:unknown[];value:string};
type Effect={label:string;count:number};
async function cleanupPlan(actor:Account,student:string,revision:number){
 const groupId=actor.groupId!,raw=learningDb(),row=(await offboardingItems(groupId,student))[0];
 if(!row||row.status!=='marked'||row.revision!==revision)throw new StudentOffboardingError('记录已更新，请刷新后重试');
 const permissions=['students.delete','students.disable','plans.disable','accounts.delete','lessons.delete','invoices.view','payments.view','prepayments.view','payroll.view'];
 await requireCorePermissions(actor,permissions);
 const finance=await offboardingFinancialState(groupId,student,row.lastLessonDate),blockers=[...finance.blockers],watches:Watch[]=[...finance.watches],writes:D1PreparedStatement[]=[],effects:Effect[]=[],files:string[]=[];
 // Independent inspection queries share a D1 round trip. Snapshots still run before every write.
 type ReadJob={statement:D1PreparedStatement;resolve:(rows:Record<string,unknown>[])=>void;reject:(error:unknown)=>void};let readQueue:ReadJob[]=[];
 function read(source:string,args:unknown[]):Promise<Record<string,unknown>[]>{return new Promise((resolve,reject)=>{readQueue.push({statement:raw.prepare(source).bind(...args),resolve,reject});if(readQueue.length===1)queueMicrotask(async()=>{const jobs=readQueue;readQueue=[];try{const results=await raw.batch<Record<string,unknown>>(jobs.map(job=>job.statement));results.forEach((result,index)=>jobs[index].resolve(result.results||[]));}catch(error){for(const job of jobs)job.reject(error);}});});}
 if(row.lastLessonDate&&row.lastLessonDate>malaysiaToday())blockers.unshift({code:'departure_not_due',label:'尚未到预计停课日期',count:1});
 async function inspect(name:string,source:string,args:unknown[]){
  const records=await read(source,args),fields=Object.keys(records[0]||{}).sort();
  const sql=fields.length?`SELECT coalesce(json_group_array(json_object(${fields.map(f=>"'"+f+"',s.\""+f+'\"').join(',')})),'[]') value FROM (${source} ORDER BY ${fields.map(f=>'"'+f+'"').join(',')}) s`:`SELECT CAST(count(*) AS TEXT) value FROM (${source})`;
  const value=String((await read(sql,args))[0]?.value||'0');if(!fields.length&&value!=='0')throw new StudentOffboardingError('资料已更新，请重新预览');watches.push({name,sql,args,value});return fields.length?JSON.parse(value) as Record<string,unknown>[]:[];
 }
 async function remove(table:string,where:string,args:unknown[],label?:string){writes.push(raw.prepare('DELETE FROM '+table+' WHERE '+where).bind(...args));const records=await inspect(table,'SELECT * FROM '+table+' WHERE '+where,args);if(label&&records.length)effects.push({label,count:records.length});return records;}
 const[departure, ,accounts,sourceCourses,rooms]=await Promise.all([
 inspect('departure','SELECT * FROM student_offboarding WHERE group_id=? AND student_name=?',[groupId,student]),
 inspect('student-profile','SELECT * FROM students WHERE group_id=? AND name=?',[groupId,student]),
 inspect('accounts',"SELECT * FROM accounts WHERE group_id=? AND role='student' AND student_name=?",[groupId,student]),
 inspect('lesson-source','SELECT * FROM lessons WHERE group_id=? AND student=?',[groupId,student]),
 inspect('classroom-source',`SELECT DISTINCT c.* FROM classrooms c WHERE c.group_id=? AND (c.id IN(SELECT classroom_id FROM classroom_members WHERE group_id=? AND student_name=?) OR c.id IN(SELECT s.classroom_id FROM lessons l JOIN class_sessions s ON s.group_id=l.group_id AND s.id=l.session_id WHERE l.group_id=? AND l.student=?))`,[groupId,groupId,student,groupId,student])]);
 if(departure[0]?.status!=='marked'||departure[0]?.revision!==revision)throw new StudentOffboardingError('记录已更新，请刷新后重试');
 const accountsSql="SELECT id FROM accounts WHERE group_id=? AND role='student' AND student_name=?",accountArgs=[groupId,student];
 if(sourceCourses.some(l=>l.status==='scheduled'))blockers.push({code:'scheduled_courses',label:'还有未完成或未取消的排课',count:sourceCourses.filter(l=>l.status==='scheduled').length});
 const roomIds=JSON.stringify(rooms.map(c=>c.id));
 const[members,classLessons,cleaned]=await Promise.all([inspect('room-members','SELECT * FROM classroom_members WHERE group_id=? AND classroom_id IN(SELECT value FROM json_each(?))',[groupId,roomIds]),inspect('room-lessons','SELECT l.*,s.classroom_id AS source_classroom_id FROM lessons l JOIN class_sessions s ON s.id=l.session_id AND s.group_id=l.group_id WHERE l.group_id=? AND s.classroom_id IN(SELECT value FROM json_each(?))',[groupId,roomIds]),read("SELECT student_name FROM student_offboarding WHERE group_id=? AND status='cleaned'",[groupId])]);
 const departed=new Set([student,...cleaned.map(r=>String(r.student_name))]);
 const solo=rooms.filter(c=>!members.some(m=>m.classroom_id===c.id&&!departed.has(String(m.student_name))));
 // Membership can be stale: publications still assigned to another pupil keep the classroom shared.
 const publicationUsers=await inspect('room-publication-users',`SELECT h.classroom_id,r.student_name,'homework' kind,r.id FROM homework_recipients r JOIN homework h ON h.group_id=r.group_id AND h.id=r.homework_id WHERE h.group_id=? AND h.classroom_id IN(SELECT value FROM json_each(?)) UNION ALL SELECT h.classroom_id,s.student_name,'submission' kind,s.id FROM homework_submissions s JOIN homework h ON h.group_id=s.group_id AND h.id=s.homework_id WHERE h.group_id=? AND h.classroom_id IN(SELECT value FROM json_each(?)) UNION ALL SELECT m.classroom_id,r.student_name,'material' kind,r.id FROM material_recipients r JOIN teaching_materials m ON m.group_id=r.group_id AND m.id=r.material_id WHERE m.group_id=? AND m.classroom_id IN(SELECT value FROM json_each(?)) UNION ALL SELECT v.classroom_id,r.student_name,'recording' kind,r.recording_id id FROM recording_recipients r JOIN class_recordings v ON v.group_id=r.group_id AND v.id=r.recording_id WHERE v.group_id=? AND v.classroom_id IN(SELECT value FROM json_each(?))`,[groupId,roomIds,groupId,roomIds,groupId,roomIds,groupId,roomIds]);
 // Session ownership is checked explicitly; a shared class always survives another student's cleanup.
 const soloIds:string[]=[];
 for(const room of solo)if(!classLessons.some(l=>l.source_classroom_id===room.id&&!departed.has(String(l.student)))&&!publicationUsers.some(r=>r.classroom_id===room.id&&!departed.has(String(r.student_name))))soloIds.push(String(room.id));
 const soloJson=JSON.stringify(soloIds),now=new Date().toISOString();
 const mine=[groupId,student],mineWhere='group_id=? AND student_name=?';
 const[submissions,feedback]=await Promise.all([inspect('submission-files','SELECT * FROM homework_submissions WHERE '+mineWhere,mine),inspect('feedback-files','SELECT f.* FROM homework_feedback f JOIN homework_submissions s ON s.id=f.submission_id AND s.group_id=f.group_id WHERE s.group_id=? AND s.student_name=?',mine)]);for(const f of[...submissions,...feedback])if(f.file_id)files.push(String(f.file_id));
 await Promise.all([
 remove('homework_feedback',`group_id=? AND submission_id IN(SELECT id FROM homework_submissions WHERE ${mineWhere})`,[groupId,...mine]),
 remove('homework_resubmission_grants',mineWhere,mine),remove('homework_score_history',mineWhere,mine),remove('homework_submissions',mineWhere,mine,'清理功课提交'),remove('homework_recipients',mineWhere,mine),remove('material_recipients',mineWhere,mine,'解除教学资料分配'),remove('recording_recipients',mineWhere,mine),
 remove('quiz_assignment_notifications',`group_id=? AND (account_id IN(${accountsSql}) OR attempt_id IN(SELECT id FROM quiz_practice_attempts WHERE group_id=? AND (student_name=? OR account_id IN(${accountsSql}))))`,[groupId,...accountArgs,groupId,student,...accountArgs]),
 remove('quiz_practice_events',`group_id=? AND (actor_id IN(${accountsSql}) OR attempt_id IN(SELECT id FROM quiz_practice_attempts WHERE group_id=? AND (student_name=? OR account_id IN(${accountsSql}))))`,[groupId,...accountArgs,groupId,student,...accountArgs]),
 remove('quiz_practice_operations',`group_id=? AND actor_id IN(${accountsSql})`,[groupId,...accountArgs]),remove('quiz_practice_attempts',`group_id=? AND (student_name=? OR account_id IN(${accountsSql}))`,[groupId,student,...accountArgs],'清理个人 Quiz 作答'),remove('quiz_practice_recipients',mineWhere,mine),
 ...['learning_notifications','study_blocks','assignments','site_notifications'].map(table=>remove(table,`group_id=? AND account_id IN(${accountsSql})`,[groupId,...accountArgs])),
 remove('notification_deliveries',`item_id IN(SELECT id FROM notification_items WHERE group_id=? AND account_id IN(${accountsSql})) OR subscription_id IN(SELECT id FROM push_subscriptions WHERE account_id IN(${accountsSql}))`,[groupId,...accountArgs,...accountArgs]),remove('notification_items',`group_id=? AND account_id IN(${accountsSql})`,[groupId,...accountArgs]),
 remove('parent_notifications',"group_id=? AND kind='student_absent' AND student_id IN(SELECT id FROM billing_students WHERE group_id=? AND student_name=?)",[groupId,...mine]),
 ...['whatsapp_contacts','whatsapp_contact_requests','whatsapp_challenges'].map(table=>remove(table,`group_id=? AND account_id IN(${accountsSql})`,[groupId,...accountArgs])),remove('login_attempts',`username IN(SELECT username FROM local_credentials WHERE account_id IN(${accountsSql}))`,accountArgs),
 ...['push_subscriptions','sessions','google_identities','local_credentials'].map(table=>remove(table,`account_id IN(${accountsSql})`,accountArgs)),remove('classroom_members',mineWhere,mine,'移出班级')]);
 // Retain IDs and source facts required by invoices/payroll. All operational readers hide them after status=cleaned.
 writes.push(raw.prepare('UPDATE plans SET active=0 WHERE group_id=? AND student=?').bind(groupId,student),raw.prepare('UPDATE students SET active=0,age=NULL,grade=NULL WHERE group_id=? AND name=?').bind(groupId,student),raw.prepare("UPDATE accounts SET disabled_at=coalesce(disabled_at,?),email='',name=?,teacher_name=NULL WHERE group_id=? AND role='student' AND student_name=?").bind(now,'已清理的学生',groupId,student));
 for(const roomId of soloIds){writes.push(raw.prepare('INSERT INTO classroom_retirements(group_id,classroom_id,student_name,retired_at,retired_by) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING').bind(groupId,roomId,student,now,actor.id));}
 writes.push(raw.prepare('UPDATE classrooms SET archived=1,updated_at=? WHERE group_id=? AND id IN(SELECT value FROM json_each(?))').bind(now,groupId,soloJson));
 // Class-owned publications may be shared; only an entirely departed classroom is cleared.
 const homeworkWhere='group_id=? AND classroom_id IN(SELECT value FROM json_each(?))',roomArgs=[groupId,soloJson];
 const[resources,homework,materials]=await Promise.all([inspect('class-files','SELECT file_id FROM teaching_materials WHERE '+homeworkWhere,roomArgs),inspect('class-homework','SELECT * FROM homework WHERE '+homeworkWhere,roomArgs),inspect('class-materials','SELECT id FROM teaching_materials WHERE '+homeworkWhere,roomArgs)]);for(const f of resources)if(f.file_id)files.push(String(f.file_id));for(const h of homework)if(h.attachment_file_id)files.push(String(h.attachment_file_id));
 const homeIds=JSON.stringify(homework.map(h=>h.id));
 const materialIds=JSON.stringify(materials.map(m=>m.id));
 const versionsWhere="group_id=? AND ((kind='homework' AND record_id IN(SELECT value FROM json_each(?))) OR (kind='material' AND record_id IN(SELECT value FROM json_each(?))))",versionsArgs=[groupId,homeIds,materialIds];
 const[versions,classSubmissions,classFeedback]=await Promise.all([inspect('class-version-files','SELECT * FROM learning_versions WHERE '+versionsWhere,versionsArgs),inspect('class-submission-files','SELECT * FROM homework_submissions WHERE group_id=? AND homework_id IN(SELECT value FROM json_each(?))',[groupId,homeIds]),inspect('class-feedback-files','SELECT * FROM homework_feedback WHERE group_id=? AND homework_id IN(SELECT value FROM json_each(?))',[groupId,homeIds])]);for(const f of[...versions,...classSubmissions,...classFeedback])if(f.file_id)files.push(String(f.file_id));
 await Promise.all([remove('learning_versions',versionsWhere,versionsArgs),remove('learning_notifications',"group_id=? AND ((content_kind='homework' AND record_id IN(SELECT value FROM json_each(?))) OR (content_kind='material' AND record_id IN(SELECT value FROM json_each(?))))",versionsArgs)]);
 writes.push(raw.prepare('UPDATE study_blocks SET homework_id=NULL WHERE group_id=? AND homework_id IN(SELECT value FROM json_each(?))').bind(groupId,homeIds));
 await Promise.all([...['homework_feedback','homework_resubmission_grants','homework_score_history','homework_submissions','homework_recipients'].map(table=>remove(table,'group_id=? AND homework_id IN(SELECT value FROM json_each(?))',[groupId,homeIds])),remove('material_recipients','group_id=? AND material_id IN(SELECT id FROM teaching_materials WHERE '+homeworkWhere+')',[groupId,...roomArgs]),...['homework','teaching_materials','classroom_announcements','resource_assignments'].map(table=>remove(table,homeworkWhere,roomArgs)),remove('recording_recipients','group_id=? AND recording_id IN(SELECT id FROM class_recordings WHERE '+homeworkWhere+')',[groupId,...roomArgs]),remove('class_recordings',homeworkWhere,roomArgs),remove('classroom_folders',homeworkWhere,roomArgs)]);
 effects.unshift({label:'从学生名单移除',count:1},{label:'关闭学生账号并移除登录方式',count:accounts.length},{label:'从教学页面移除历史课程',count:sourceCourses.length},{label:'清理仅属于此学生的班级',count:soloIds.length});
 return {row,permissions,blockers,watches,writes,effects:effects.filter(e=>e.count>0),files,groupId,student,revision,now};
}
async function fingerprint(actor:Account,plan:Awaited<ReturnType<typeof cleanupPlan>>,at:string){const text=JSON.stringify({actor:actor.id,group:plan.groupId,student:plan.student,revision:plan.revision,at,watches:plan.watches.map(w=>[w.name,w.value]),effects:plan.effects});return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
export async function previewStudentCleanup(actor:Account,student:string,revision:number){const plan=await cleanupPlan(actor,student,revision),at=new Date().toISOString();return {preview:{token:at+'|'+await fingerprint(actor,plan,at),studentName:student,effects:plan.effects,blockers:plan.blockers,financialHistoryRetained:true}};}
export async function cleanStudentDeparture(actor:Account,data:Record<string,unknown>){
 const student=canonical(data.studentName),revision=Number(data.revision),token=canonical(data.token),[at,proof]=token.split('|'),age=Date.now()-Date.parse(at);
 if(data.confirm!==true||!Number.isFinite(age)||age<0||age>300000||!proof)throw new StudentOffboardingError('预览已过期，请重新预览');
 const plan=await cleanupPlan(actor,student,revision);if(plan.blockers.length)throw new StudentOffboardingError('仍有未处理事项，请先完成财务及排课处理');
 if(proof!==await fingerprint(actor,plan,at))throw new StudentOffboardingError('资料已更新，请重新预览');
 const db=guardedCoreDb(actor,plan.permissions),guards=plan.watches.map(w=>db.prepare(`SELECT CASE WHEN (${w.sql})=? THEN 1 ELSE json_extract('[]','$[student_offboarding_changed') END`).bind(...w.args,w.value));
 await db.batch([adminActorGuard(actor),...guards,...plan.writes,db.prepare("UPDATE student_offboarding SET status='cleaned',revision=revision+1,updated_by=?,updated_at=?,cleaned_at=? WHERE group_id=? AND student_name=? AND revision=? AND status='marked'").bind(actor.id,plan.now,plan.now,plan.groupId,student,revision),appendAudit(db,{groupId:plan.groupId,lessonId:'student:'+student,actorId:actor.id,actorName:actor.name,objectName:student,action:'studentDeparture.clean',after:{effects:plan.effects,financialHistoryRetained:true,sourceFactsRetained:true},at:plan.now})]);
 // Bound the post-commit storage work; the existing upload cleanup retries remaining unreferenced files.
 const fileIds=[...new Set(plan.files)];let cleanupPending=fileIds.length>2;for(const id of fileIds.slice(0,2)){try{await deleteUnreferencedFile(id);}catch{cleanupPending=true;}}
 return {ok:true,financialHistoryRetained:true,...cleanupPending?{warning:'资料已清理，部分未引用文件稍后清理'}:{}};
}
