import {learningDb} from './learning-server';

export class CancelledStudentDeletionError extends Error { readonly status=409; }
export type DeletionWrite=(sql:string,...params:unknown[])=>D1PreparedStatement;

/** Student deletion owns only this student's cancelled courses and otherwise empty rooms. */
export async function cancelledStudentDeletion(groupId:string,student:string,write:DeletionWrite){
 const raw=learningDb(),watches:Array<{name:string;value:string}>=[],guards:D1PreparedStatement[]=[];
 async function watch(name:string,source:string,fields:string[],params:unknown[]){
  const object=fields.map(field=>"'"+field+"',source."+field).join(',');
  const sql=`SELECT coalesce(json_group_array(json_object(${object})),'[]') AS value FROM (${source}) source`;
  const value=(await raw.prepare(sql).bind(...params).first<{value:string}>())?.value||'[]';
  watches.push({name,value});
  guards.push(raw.prepare(`SELECT CASE WHEN (${sql})=? THEN 1 ELSE json_extract('[]','$[student_delete_changed') END AS unchanged`).bind(...params,value));
  return JSON.parse(value) as Record<string,unknown>[];
 }
 const lessons=await watch('student-lessons','SELECT id,session_id,status,updated_at,replacement_for FROM lessons WHERE group_id=? AND student=? ORDER BY id',['id','session_id','status','updated_at','replacement_for'],[groupId,student]);
 const members=await watch('student-members','SELECT id,classroom_id,student_name FROM classroom_members WHERE group_id=? AND student_name=? ORDER BY id',['id','classroom_id','student_name'],[groupId,student]);
 await watch('student-accounts','SELECT id,role,disabled_at FROM accounts WHERE group_id=? AND student_name=? ORDER BY id',['id','role','disabled_at'],[groupId,student]);
 await watch('student-plans','SELECT key,subject,teacher_name,active,duration FROM plans WHERE group_id=? AND student=? ORDER BY key',['key','subject','teacher_name','active','duration'],[groupId,student]);
 const cancelled=lessons.filter(l=>l.status==='cancelled'),lessonIds=cancelled.map(l=>String(l.id)),sessionIds=[...new Set(cancelled.map(l=>l.session_id).filter(Boolean).map(String))],classIds=[...new Set(members.map(m=>String(m.classroom_id)))];
 if(members.length&&lessons.some(l=>l.status!=='cancelled'))throw new CancelledStudentDeletionError('仍有未取消的课程记录，请先处理课程后再永久删除学生。');
 const selected=JSON.stringify(lessonIds),sessions=JSON.stringify(sessionIds),classes=JSON.stringify(classIds);
 await watch('session-participants','SELECT id,session_id,lesson_id,student_name FROM class_session_participants WHERE group_id=? AND session_id IN(SELECT value FROM json_each(?)) ORDER BY id',['id','session_id','lesson_id','student_name'],[groupId,sessions]);
 const sessionRows=await watch('sessions','SELECT id,status,revision,classroom_id FROM class_sessions WHERE group_id=? AND id IN(SELECT value FROM json_each(?)) ORDER BY id',['id','status','revision','classroom_id'],[groupId,sessions]);
 if(sessionRows.some(s=>s.status!=='cancelled'))throw new CancelledStudentDeletionError('关联整班课次仍未取消，请先处理该课次。');
 const locked=`SELECT 1 FROM invoice_source_locks WHERE group_id=? AND ((source_type='lesson' AND source_id IN(SELECT value FROM json_each(?))) OR (source_type='session' AND source_id IN(SELECT value FROM json_each(?)))) LIMIT 1`;
 if(await raw.prepare(locked).bind(groupId,selected,sessions).first())throw new CancelledStudentDeletionError('取消课程仍关联正式账单，不能直接删除学生。');
 const salary=`SELECT 1 FROM payroll_runs r,json_each(r.document_json,'$.sourceLines') line WHERE r.group_id=? AND json_extract(line.value,'$.sessionId') IN(SELECT value FROM json_each(?)) UNION ALL SELECT 1 FROM payroll_legacy_rate_links WHERE group_id=? AND session_id IN(SELECT value FROM json_each(?)) LIMIT 1`;
 if(await raw.prepare(salary).bind(groupId,sessions,groupId,sessions).first())throw new CancelledStudentDeletionError('取消课程仍关联薪资记录，请先核对薪资。');
 if(await raw.prepare('SELECT 1 FROM lessons WHERE group_id=? AND replacement_for IN(SELECT value FROM json_each(?)) AND id NOT IN(SELECT value FROM json_each(?)) LIMIT 1').bind(groupId,selected,selected).first())throw new CancelledStudentDeletionError('取消课程仍有关联补课，请先处理补课后再删除学生。');
 await watch('replacement-links','SELECT id,status,replacement_for FROM lessons WHERE group_id=? AND replacement_for IN(SELECT value FROM json_each(?)) ORDER BY id',['id','status','replacement_for'],[groupId,selected]);
 await watch('class-members','SELECT id,classroom_id,student_name FROM classroom_members WHERE group_id=? AND classroom_id IN(SELECT value FROM json_each(?)) ORDER BY id',['id','classroom_id','student_name'],[groupId,classes]);
 await watch('class-courses','SELECT id,status,revision,classroom_id FROM class_sessions WHERE group_id=? AND classroom_id IN(SELECT value FROM json_each(?)) ORDER BY id',['id','status','revision','classroom_id'],[groupId,classes]);
 const classParticipants=await watch('class-participants','SELECT p.id,p.student_name,s.classroom_id FROM class_session_participants p JOIN class_sessions s ON s.id=p.session_id AND s.group_id=p.group_id WHERE p.group_id=? AND s.classroom_id IN(SELECT value FROM json_each(?)) ORDER BY p.id',['id','student_name','classroom_id'],[groupId,classes]);
 const contentTables=['teaching_materials','homework','classroom_announcements','class_recordings','resource_assignments','quiz_practice_assignments','payroll_rate_scopes','payroll_legacy_rate_links','payroll_monthly_reviews'];
 const nonempty=new Set<string>(),legacyRooms=new Set<string>();
 for(const row of classParticipants)if(row.student_name!==student)nonempty.add(String(row.classroom_id));
 for(const table of contentTables){
  const records=await watch(table,`SELECT id,classroom_id FROM ${table} WHERE group_id=? AND classroom_id IN(SELECT value FROM json_each(?)) ORDER BY id`,['id','classroom_id'],[groupId,classes]);
  for(const row of records)(table==='payroll_legacy_rate_links'?legacyRooms:nonempty).add(String(row.classroom_id));
 }
 const rooms=await watch('classrooms','SELECT id,title,subject,teacher_name,archived,updated_at FROM classrooms WHERE group_id=? AND id IN(SELECT value FROM json_each(?)) ORDER BY id',['id','title','subject','teacher_name','archived','updated_at'],[groupId,classes]);
 await watch('class-folders','SELECT id,classroom_id,parent_id,name FROM classroom_folders WHERE group_id=? AND classroom_id IN(SELECT value FROM json_each(?)) ORDER BY id',['id','classroom_id','parent_id','name'],[groupId,classes]);
 const allMembers=JSON.parse(watches.find(w=>w.name==='class-members')!.value) as {classroom_id:string;student_name:string}[];
 const allCourses=JSON.parse(watches.find(w=>w.name==='class-courses')!.value) as {id:string;classroom_id:string;status:string}[];
 const emptyRooms=rooms.filter(room=>!nonempty.has(String(room.id))&&!allMembers.some(m=>m.classroom_id===room.id&&m.student_name!==student)&&!allCourses.some(s=>s.classroom_id===room.id&&(s.status!=='cancelled'||!sessionIds.includes(s.id))));
 const removable=emptyRooms.filter(room=>!legacyRooms.has(String(room.id))).map(room=>String(room.id));
 const archivedRooms=emptyRooms.filter(room=>legacyRooms.has(String(room.id))&&!room.archived);
 // Guard mutable relationships at commit, before any cascade or deletion runs.
 const statements:D1PreparedStatement[]=[];
 guards.push(raw.prepare(`SELECT CASE WHEN NOT EXISTS(${locked}) AND NOT EXISTS(${salary}) AND NOT EXISTS(SELECT 1 FROM accounts WHERE group_id=? AND student_name=?) THEN 1 ELSE json_extract('[]','$[student_delete_changed') END AS clear`).bind(groupId,selected,sessions,groupId,sessions,groupId,sessions,groupId,student));
 statements.push(write('DELETE FROM reschedule_requests WHERE group_id=? AND lesson_id IN(SELECT value FROM json_each(?))',groupId,selected));
 statements.push(write('DELETE FROM notification_deliveries WHERE item_id IN(SELECT id FROM notification_items WHERE group_id=? AND lesson_id IN(SELECT value FROM json_each(?)))',groupId,selected));
 statements.push(write('DELETE FROM notification_items WHERE group_id=? AND lesson_id IN(SELECT value FROM json_each(?))',groupId,selected));
 statements.push(write('DELETE FROM site_notifications WHERE group_id=? AND lesson_id IN(SELECT value FROM json_each(?))',groupId,selected));
 statements.push(write('DELETE FROM lessons WHERE group_id=? AND id IN(SELECT value FROM json_each(?)) AND status=\'cancelled\'',groupId,selected));
 // One-to-one sessions are removed by their existing lesson trigger; empty group sessions need explicit cleanup.
 const orphanIds=sessionRows.filter(s=>!JSON.parse(watches.find(w=>w.name==='session-participants')!.value).some((p:{session_id:string;lesson_id:string})=>p.session_id===s.id&&!lessonIds.includes(p.lesson_id))).map(s=>String(s.id));
 statements.push(write('DELETE FROM reschedule_requests WHERE group_id=? AND session_id IN(SELECT value FROM json_each(?))',groupId,JSON.stringify(orphanIds)));
 statements.push(write('DELETE FROM class_sessions WHERE group_id=? AND id IN(SELECT value FROM json_each(?)) AND status=\'cancelled\' AND NOT EXISTS(SELECT 1 FROM lessons l WHERE l.group_id=class_sessions.group_id AND l.session_id=class_sessions.id AND l.id NOT IN(SELECT value FROM json_each(?)))',groupId,sessions,selected));
 statements.push(write('DELETE FROM classroom_members WHERE group_id=? AND student_name=?',groupId,student));
 statements.push(write('DELETE FROM classroom_folders WHERE group_id=? AND classroom_id IN(SELECT value FROM json_each(?))',groupId,JSON.stringify(removable)));
 statements.push(write('DELETE FROM classrooms WHERE group_id=? AND id IN(SELECT value FROM json_each(?))',groupId,JSON.stringify(removable)));
 statements.push(write('UPDATE classrooms SET archived=1,updated_at=? WHERE group_id=? AND id IN(SELECT value FROM json_each(?))',new Date().toISOString(),groupId,JSON.stringify(archivedRooms.map(room=>room.id))));
 return{statements,guards,watches,archivedRooms};
}
