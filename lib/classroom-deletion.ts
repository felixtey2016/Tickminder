import {learningDb} from './learning-server';
import {classPlanSubjectSql} from './academic-subject-match';
import type {Account} from './auth';
import {requireCorePermissions} from './admin-core-permissions';
import type {DeletionWrite} from './cancelled-student-deletion';
import type {D1BatchRead} from './d1-read-batch';

export class ClassroomDeletionError extends Error {readonly status=409;}

/** Prepare an explicit, tenant-scoped cascade. Financial sources remain protected. */
export async function classroomDeletion(actor:Account,groupId:string,id:string,selectedClasses:string[],write:DeletionWrite,read?:D1BatchRead){
 const raw=learningDb(),watches:Array<{name:string;value:string}>=[],guards:D1PreparedStatement[]=[],statements:D1PreparedStatement[]=[],extraSnapshots:Array<{table:string;records:Record<string,unknown>[];action:'deactivate'|'retain_finance'}>=[],permissions:string[]=[];
 async function first<T=Record<string,unknown>>(sql:string,params:unknown[]){const statement=raw.prepare(sql).bind(...params);return read?(await read(statement)).results?.[0] as T|undefined:await statement.first<T>();}
 async function watch(name:string,sql:string,fields:string[],params:unknown[]){
  const snapshot=`SELECT coalesce(json_group_array(json_object(${fields.map(f=>"'"+f+"',source."+f).join(',')})),'[]') value FROM (${sql}) source`;
  const value=(await first<{value:string}>(snapshot,params))?.value||'[]';
  watches.push({name,value});guards.push(raw.prepare(`SELECT CASE WHEN (${snapshot})=? THEN 1 ELSE json_extract('[]','$[classroom_delete_changed') END`).bind(...params,value));
  return JSON.parse(value) as Record<string,unknown>[];
 }
 const sessionQuery='SELECT id FROM class_sessions WHERE group_id=? AND classroom_id=?';
 const lessonQuery=`SELECT id FROM lessons WHERE group_id=? AND session_id IN(${sessionQuery})`;
 const sessionArgs=[groupId,id],lessonArgs=[groupId,...sessionArgs];
 const[sessions,lessons,members,classroomRows]=await Promise.all([watch('classroom-sessions','SELECT id,status,revision,updated_at FROM class_sessions WHERE group_id=? AND classroom_id=? ORDER BY id',['id','status','revision','updated_at'],sessionArgs),watch('classroom-lessons',`SELECT id,session_id,status,updated_at,replacement_for FROM lessons WHERE group_id=? AND session_id IN(${sessionQuery}) ORDER BY id`,['id','session_id','status','updated_at','replacement_for'],lessonArgs),watch('classroom-members','SELECT id,student_name FROM classroom_members WHERE group_id=? AND classroom_id=? ORDER BY id',['id','student_name'],sessionArgs),watch('classroom-identity','SELECT id,title,teacher_name,archived,updated_at FROM classrooms WHERE group_id=? AND id=?',['id','title','teacher_name','archived','updated_at'],sessionArgs)]);
 // An empty classroom can leave operational lists while its immutable financial identity remains.
 const payroll=`SELECT (EXISTS(SELECT 1 FROM payroll_rate_scopes WHERE group_id=? AND classroom_id=?) OR EXISTS(SELECT 1 FROM payroll_legacy_rate_links WHERE group_id=? AND (classroom_id=? OR session_id IN(${sessionQuery}))) OR EXISTS(SELECT 1 FROM payroll_monthly_reviews WHERE group_id=? AND classroom_id=?) OR EXISTS(SELECT 1 FROM payroll_runs r,json_each(r.document_json,'$.sourceLines') line WHERE r.group_id=? AND r.status='confirmed' AND (json_extract(line.value,'$.classroomId')=? OR json_extract(line.value,'$.sessionId') IN(${sessionQuery})))) protected`;
 const payrollArgs=[...sessionArgs,...sessionArgs,...sessionArgs,...sessionArgs,...sessionArgs,...sessionArgs];
 const protectedPayroll=Boolean((await first<{protected:number}>(payroll,payrollArgs))?.protected),retainClassroom=protectedPayroll&&!sessions.length&&!members.length;
 if(protectedPayroll&&!retainClassroom)throw new ClassroomDeletionError('此班级仍关联薪资和学生课程，请先在学生名单标记待退课，处理财务后清理。');
 guards.push(raw.prepare(`SELECT CASE WHEN (${payroll})=? THEN 1 ELSE json_extract('[]','$[classroom_delete_changed') END`).bind(...payrollArgs,protectedPayroll?1:0));
 if(retainClassroom){
  if(actor.role!=='admin')throw new ClassroomDeletionError('请由管理员清理关联财务记录的空班级。');
  extraSnapshots.push({table:'classrooms',records:classroomRows,action:'retain_finance'});
  statements.push(write('INSERT INTO classroom_retirements(group_id,classroom_id,student_name,retired_at,retired_by) VALUES(?,?,\'\',?,?)',groupId,id,new Date().toISOString(),actor.id));
  statements.push(write('UPDATE classrooms SET archived=1,updated_at=? WHERE group_id=? AND id=?',new Date().toISOString(),groupId,id));
 }
 const locked=`SELECT 1 FROM invoice_source_locks il WHERE il.group_id=? AND ((il.source_type='session' AND il.source_id IN(SELECT value FROM json_each(?))) OR (il.source_type='lesson' AND il.source_id IN(SELECT value FROM json_each(?))) OR (il.source_type='student_month' AND EXISTS(SELECT 1 FROM lessons l JOIN billing_students b ON b.group_id=l.group_id AND b.student_name=l.student LEFT JOIN class_sessions s ON s.group_id=l.group_id AND s.id=l.session_id WHERE l.group_id=il.group_id AND b.id=il.student_id AND l.id IN(SELECT value FROM json_each(?)) AND il.month=strftime('%Y-%m',coalesce(s.actual_start,l.actual_start,l.planned_start),'+8 hours')))) LIMIT 1`;
 const lessonIds=JSON.stringify(lessons.map(l=>l.id)),lockedArgs=[groupId,JSON.stringify(sessions.map(s=>s.id)),lessonIds,lessonIds];
 if(await first(locked,lockedArgs))throw new ClassroomDeletionError('此班级的课程已关联正式账单，请先处理账单后再永久删除。');
 guards.push(raw.prepare(`SELECT CASE WHEN EXISTS(${locked}) THEN json_extract('[]','$[classroom_delete_changed') ELSE 1 END`).bind(...lockedArgs));
 if(sessions.length){
  if(actor.role!=='admin')throw new ClassroomDeletionError('此班级有排课，请由管理员删除班级及关联课程。');
  permissions.push('lessons.delete');await requireCorePermissions(actor,permissions);
 }
 // Only plans losing their last active classroom are disabled, never deleted.
 const planSource=`SELECT DISTINCT p.key,p.active,p.subject,p.teacher_name FROM plans p JOIN students s ON s.group_id=p.group_id AND s.name=p.student JOIN classrooms c ON c.group_id=p.group_id AND c.teacher_name=p.teacher_name JOIN classroom_members m ON m.group_id=c.group_id AND m.classroom_id=c.id AND m.student_name=p.student WHERE p.group_id=? AND c.id=? AND p.active=1 AND ${classPlanSubjectSql()} AND NOT EXISTS(SELECT 1 FROM classrooms other JOIN classroom_members om ON om.group_id=other.group_id AND om.classroom_id=other.id WHERE other.group_id=p.group_id AND other.teacher_name=p.teacher_name AND other.archived=0 AND om.student_name=p.student AND other.id NOT IN(SELECT value FROM json_each(?)) AND ${classPlanSubjectSql('p','other','s')}) ORDER BY p.key`;
 const planArgs=[groupId,id,JSON.stringify(selectedClasses)],plans=await watch('classroom-plans',planSource,['key','active','subject','teacher_name'],planArgs);
 if(plans.length){
  if(actor.role!=='admin')throw new ClassroomDeletionError('此班级仍用于学生科目配对，请由管理员处理后删除。');
  permissions.push('plans.disable');await requireCorePermissions(actor,['plans.disable']);
  extraSnapshots.push({table:'plans',records:plans,action:'deactivate'});
  statements.push(write('UPDATE plans SET active=0 WHERE group_id=? AND key IN(SELECT value FROM json_each(?))',groupId,JSON.stringify(plans.map(p=>p.key))));
 }
 await watch('classroom-other-coverage',`SELECT c.id,c.archived,c.updated_at,m.id member_id,m.student_name FROM classrooms c JOIN classroom_members m ON m.group_id=c.group_id AND m.classroom_id=c.id WHERE c.group_id=? AND m.student_name IN(SELECT student_name FROM classroom_members WHERE group_id=? AND classroom_id=?) ORDER BY c.id,m.id`,['id','archived','updated_at','member_id','student_name'],[groupId,...sessionArgs]);
 const replacement=`SELECT 1 FROM lessons WHERE group_id=? AND replacement_for IN(${lessonQuery}) AND id NOT IN(${lessonQuery}) LIMIT 1`,replacementArgs=[groupId,...lessonArgs,...lessonArgs];
 if(await first(replacement,replacementArgs))throw new ClassroomDeletionError('班级课程仍有关联到其他班级的补课，请先处理这些补课。');
 guards.push(raw.prepare(`SELECT CASE WHEN EXISTS(${replacement}) THEN json_extract('[]','$[classroom_delete_changed') ELSE 1 END`).bind(...replacementArgs));
 statements.push(write(`DELETE FROM reschedule_requests WHERE group_id=? AND (session_id IN(${sessionQuery}) OR lesson_id IN(${lessonQuery}))`,groupId,...sessionArgs,...lessonArgs));
 statements.push(write(`DELETE FROM notification_deliveries WHERE item_id IN(SELECT id FROM notification_items WHERE group_id=? AND lesson_id IN(${lessonQuery}))`,groupId,...lessonArgs));
 for(const table of ['notification_items','site_notifications'])statements.push(write(`DELETE FROM ${table} WHERE group_id=? AND lesson_id IN(${lessonQuery})`,groupId,...lessonArgs));
 statements.push(write(`DELETE FROM parent_notifications WHERE group_id=? AND kind='student_absent' AND (source_id IN(${lessonQuery}) OR source_id IN(${sessionQuery}))`,groupId,...lessonArgs,...sessionArgs));
 statements.push(write(`DELETE FROM class_session_participants WHERE group_id=? AND session_id IN(${sessionQuery})`,groupId,...sessionArgs));
 statements.push(write(`DELETE FROM lessons WHERE group_id=? AND session_id IN(${sessionQuery})`,...lessonArgs));
 statements.push(write('DELETE FROM class_sessions WHERE group_id=? AND classroom_id=?',...sessionArgs));
 statements.push(write('DELETE FROM resource_assignments WHERE group_id=? AND classroom_id=?',...sessionArgs));
 return {statements,guards,watches,extraSnapshots,permissions,retainClassroom};
}
