import {learningDb} from './learning-server';
import type {Account} from './auth';
import type {DeletionWrite} from './cancelled-student-deletion';
import type {D1BatchRead} from './d1-read-batch';

export class ClassroomDeletionError extends Error {readonly status=409;}

/** Removing a classroom never changes a pairing or deletes a course/history source. */
export async function classroomDeletion(actor:Account,groupId:string,id:string,_selectedClasses:string[],write:DeletionWrite,read?:D1BatchRead){
 const raw=learningDb(),watches:Array<{name:string;value:string}>=[],guards:D1PreparedStatement[]=[],statements:D1PreparedStatement[]=[],extraSnapshots:Array<{table:string;records:Record<string,unknown>[];action:'retain_history'}>=[],permissions:string[]=[];
 async function first<T=Record<string,unknown>>(sql:string,params:unknown[]){const statement=raw.prepare(sql).bind(...params);return read?(await read(statement)).results?.[0] as T|undefined:await statement.first<T>();}
 async function watch(name:string,sql:string,fields:string[],params:unknown[]){
  const snapshot=`SELECT coalesce(json_group_array(json_object(${fields.map(f=>"'"+f+"',source."+f).join(',')})),'[]') value FROM (${sql}) source`;
  const value=(await first<{value:string}>(snapshot,params))?.value||'[]';
  watches.push({name,value});guards.push(raw.prepare(`SELECT CASE WHEN (${snapshot})=? THEN 1 ELSE json_extract('[]','$[classroom_delete_changed') END`).bind(...params,value));
  return JSON.parse(value) as Record<string,unknown>[];
 }
 const sessionQuery='SELECT id FROM class_sessions WHERE group_id=? AND classroom_id=?',args=[groupId,id];
 const historyTables=['classroom_folders','classroom_announcements','teaching_materials','homework','class_recordings','resource_assignments','quiz_practice_assignments'];
 const [sessions,lessons,members,classrooms,history,tasks]=await Promise.all([
  watch('classroom-sessions','SELECT id,status,revision,updated_at FROM class_sessions WHERE group_id=? AND classroom_id=? ORDER BY id',['id','status','revision','updated_at'],args),
  watch('classroom-lessons',`SELECT id,session_id,status,updated_at,replacement_for FROM lessons WHERE group_id=? AND session_id IN(${sessionQuery}) ORDER BY id`,['id','session_id','status','updated_at','replacement_for'],[groupId,...args]),
  watch('classroom-members','SELECT id,student_name FROM classroom_members WHERE group_id=? AND classroom_id=? ORDER BY id',['id','student_name'],args),
  watch('classroom-identity','SELECT id,title,teacher_name,archived,updated_at FROM classrooms WHERE group_id=? AND id=?',['id','title','teacher_name','archived','updated_at'],args),
  watch('classroom-history',historyTables.map(table=>`SELECT '${table}' AS kind,id FROM ${table} WHERE group_id=? AND classroom_id=?`).join(' UNION ALL ')+' ORDER BY kind,id',['kind','id'],historyTables.flatMap(()=>args)),
  // Tasks are append-only audit events, including archived/deleted tasks.
  // Preserve future event versions too; unrelated or malformed JSON is safe.
  watch('classroom-tasks',"SELECT id,action,after_json,at FROM audit WHERE group_id=? AND action LIKE 'classTask.%' AND json_extract(CASE WHEN json_valid(after_json) THEN after_json ELSE '{}' END,'$.classroomId')=? ORDER BY id",['id','action','after_json','at'],args),
 ]);
 // Some immutable payroll references can exist even when no session remains.
 const payroll=`SELECT (EXISTS(SELECT 1 FROM payroll_rate_scopes WHERE group_id=? AND classroom_id=?) OR EXISTS(SELECT 1 FROM payroll_legacy_rate_links WHERE group_id=? AND (classroom_id=? OR session_id IN(${sessionQuery}))) OR EXISTS(SELECT 1 FROM payroll_monthly_reviews WHERE group_id=? AND classroom_id=?) OR EXISTS(SELECT 1 FROM payroll_runs r,json_each(r.document_json,'$.sourceLines') line WHERE r.group_id=? AND r.status='confirmed' AND (json_extract(line.value,'$.classroomId')=? OR json_extract(line.value,'$.sessionId') IN(${sessionQuery})))) protected`;
 const payrollArgs=[...args,...args,...args,...args,...args,...args];
 const protectedPayroll=Boolean((await first<{protected:number}>(payroll,payrollArgs))?.protected);
 guards.push(raw.prepare(`SELECT CASE WHEN (${payroll})=? THEN 1 ELSE json_extract('[]','$[classroom_delete_changed') END`).bind(...payrollArgs,protectedPayroll?1:0));
 const retainClassroom=protectedPayroll||sessions.length>0||lessons.length>0||history.length>0||tasks.length>0;
 if(retainClassroom){
  for(const [table,records] of [['classrooms',classrooms],['class_sessions',sessions],['lessons',lessons],['classroom_members',members]] as const)if(records.length)extraSnapshots.push({table,records,action:'retain_history'});
  for(const table of historyTables){const records=history.filter(row=>row.kind===table).map(({id})=>({id}));if(records.length)extraSnapshots.push({table,records,action:'retain_history'});}
  if(tasks.length)extraSnapshots.push({table:'audit',records:tasks.map(({id})=>({id})),action:'retain_history'});
  const now=new Date().toISOString();
  statements.push(write("INSERT INTO classroom_retirements(group_id,classroom_id,student_name,retired_at,retired_by) VALUES(?,?,'',?,?)",groupId,id,now,actor.id));
  statements.push(write('UPDATE classrooms SET archived=1,updated_at=? WHERE group_id=? AND id=?',now,groupId,id));
 }
 return {statements,guards,watches,extraSnapshots,permissions,retainClassroom};
}
