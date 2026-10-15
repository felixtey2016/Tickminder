import {classPlanSubjectSql} from "./academic-subject-match";
import type {AttendanceSession,AttendanceParticipant} from "./attendance-types";
import type {Account} from "./auth";
import {groupReader,requireGroup} from "./group-data";
import {learningDb} from "./learning-server";
import {classroomMayManage,activeClassroomMemberNames} from "./classrooms-server";
import {normalizeOnlineLink} from "./online-link";
import {generateWeekly,hoursBetween,findLessonConflict,lessonConflictReason,type LessonSlot} from "./lesson-rules";
import {operationHash,operationId} from "./learning-operations";
import {isOwnerAccount} from "./owner";
import {participantSql} from "./notification-access";

export class ClassSessionError extends Error {constructor(message:string,readonly status=400,readonly conflict?:Record<string,unknown>){super(message);}}
const str=(value:unknown)=>typeof value==="string"?value.trim():"";
export const classSessionActions=["createClassSession","editClassSession","cancelClassSession","proposeClassReschedule","respondClassReschedule","updateClassSessionLink"];
export type ClassSession=Omit<AttendanceSession,"participants"|"participantCount">&{id:string;groupId:string;sessionType:string;classroomId:string|null;classroomTitle:string|null;teacherName:string;subject:string;subjectId?:string|null;syllabusId?:string|null;plannedStart:string;plannedEnd:string;onlineLink:string|null;status:string;seriesId:string|null;revision:number;createdAt:string;updatedAt:string};
type Participant=AttendanceParticipant;
const columns="s.id,s.group_id AS groupId,s.session_type AS sessionType,s.classroom_id AS classroomId,s.classroom_title AS classroomTitle,s.teacher_name AS teacherName,s.subject,(SELECT subject_id FROM classrooms WHERE id=s.classroom_id AND group_id=s.group_id) AS subjectId,(SELECT syllabus_id FROM classrooms WHERE id=s.classroom_id AND group_id=s.group_id) AS syllabusId,s.planned_start AS plannedStart,s.planned_end AS plannedEnd,s.online_link AS onlineLink,s.status,s.series_id AS seriesId,s.revision,s.created_at AS createdAt,s.updated_at AS updatedAt,s.teaching_status AS teachingStatus,s.actual_start AS actualStart,s.actual_end AS actualEnd,s.attendance_note AS attendanceNote,s.attendance_recorded_at AS attendanceRecordedAt,s.attendance_recorded_by AS attendanceRecordedBy,s.attendance_reviewed_at AS attendanceReviewedAt,s.attendance_reviewed_by AS attendanceReviewedBy";
function roleFilter(actor:Account) {return actor.role==="admin"?{sql:"1",args:[]}:actor.role==="teacher"?{sql:"s.teacher_name=?",args:[actor.teacherName]}:{sql:"EXISTS(SELECT 1 FROM class_session_participants p WHERE p.session_id=s.id AND p.group_id=s.group_id AND p.student_name=?)",args:[actor.studentName]};}
export async function classSessionState(actor:Account) {
 const {rows}=groupReader(actor.groupId),filter=roleFilter(actor);
 const [sessions,participants]=await Promise.all([
  rows<ClassSession&{participantCount:number}>("SELECT "+columns+",(SELECT count(*) FROM class_session_participants p WHERE p.session_id=s.id AND p.group_id=s.group_id) AS participantCount FROM class_sessions s WHERE "+filter.sql+" ORDER BY s.planned_start",...filter.args),
  rows<Participant>("SELECT p.session_id AS sessionId,p.lesson_id AS lessonId,p.student_name AS studentName,p.attendance_status AS attendanceStatus,p.arrived_at AS arrivedAt,p.left_at AS leftAt,p.attendance_note AS attendanceNote,(SELECT chargeable FROM lessons WHERE id=p.lesson_id) AS chargeable FROM class_session_participants p JOIN class_sessions s ON s.id=p.session_id WHERE "+filter.sql+(actor.role==="student"?" AND p.student_name=?":"")+" ORDER BY p.student_name",...filter.args,...(actor.role==="student"?[actor.studentName]:[])),
 ]);
 const classes=actor.role==="teacher"?await rows<{id:string}>("SELECT id FROM classrooms WHERE teacher_name=? AND archived=0",actor.teacherName):[],manageable=new Set(classes.map(c=>c.id));
 const enriched=sessions.map(s=>({...s,canManage:actor.role==="admin"||Boolean(s.classroomId&&manageable.has(s.classroomId)),participants:participants.filter(p=>p.sessionId===s.id)}));
 // A classroom can contain preserved one-to-one sessions as well as group
 // sessions. The type still controls rescheduling and participant snapshots;
 // merely organising a lesson into a classroom must not change those rules.
 return {allSessions:enriched,classroomSessions:enriched.filter(s=>Boolean(s.classroomId)),sessions:enriched.filter(s=>s.sessionType==="group"),byId:new Map(enriched.map(s=>[s.id,s]))};
}
export function malaysiaClassIso(value:unknown) {
 const input=str(value);if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(input))throw new ClassSessionError("请选择有效的日期和时间");
 const parsed=new Date(input+":00+08:00");if(!Number.isFinite(parsed.getTime())||new Date(parsed.getTime()+8*3600_000).toISOString().slice(0,16)!==input)throw new ClassSessionError("请选择有效的日期和时间");return parsed.toISOString();
}
function revision(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<1)throw new ClassSessionError("课次已改变，请重新打开窗口",409);return Number(value);}
export async function classScheduleOptions(actor:Account) {
 if(!["admin","teacher"].includes(actor.role))throw new ClassSessionError("没有整班排课权限",403);
 const {rows}=groupReader(actor.groupId);
 const classes=await rows<{id:string;title:string;teacherName:string;subject:string;subjectId:string|null;syllabusId:string|null;grade:string|null;updatedAt:string}>("SELECT c.id,c.title,c.teacher_name AS teacherName,c.subject,c.subject_id AS subjectId,c.syllabus_id AS syllabusId,c.grade,c.updated_at AS updatedAt FROM classrooms c JOIN teachers t ON t.name=c.teacher_name AND t.active=1 WHERE c.archived=0"+(actor.role==="teacher"?" AND c.teacher_name=?":"")+" ORDER BY c.title",...(actor.role==="teacher"?[actor.teacherName]:[]));
 return Promise.all(classes.map(async c=>{
  const members=await activeClassroomMemberNames(c.id,actor.groupId),matched=await rows<{student:string;subject:string;link:string|null;key:string}>(`SELECT p.student,p.subject,p.online_link AS link,p.key FROM plans p JOIN classroom_members m ON m.student_name=p.student JOIN classrooms c ON c.id=m.classroom_id JOIN students s ON s.name=p.student AND s.active=1 WHERE c.id=? AND ${classPlanSubjectSql()} AND p.teacher_name=c.teacher_name AND p.active=1 ORDER BY p.key`,c.id);
  const links=[...new Set(matched.map(plan=>plan.link))];
  return {...c,members,planKeys:[...new Set(matched.map(plan=>plan.key))],optionKey:await operationHash([c.id,c.title,c.teacherName,c.subject,c.updatedAt,members]),onlineLink:links.length===1?links[0]:null};
 }));
}
async function session(actor:Account,id:string) {
 const value=await groupReader(actor.groupId).first<ClassSession>("SELECT "+columns+" FROM class_sessions s WHERE s.id=?",id);
 if(!value||value.sessionType!=="group")throw new ClassSessionError("班级课次不存在或无权访问",404);
 if(actor.role!=="admin"&&(actor.role!=="teacher"||actor.teacherName!==value.teacherName))throw new ClassSessionError("没有班级课次操作权限",403);
 return value;
}
const activeMembersSql=`SELECT m.student_name FROM classroom_members m JOIN students st ON st.group_id=m.group_id AND st.name=m.student_name AND st.active=1 JOIN classrooms c ON c.id=m.classroom_id AND c.group_id=m.group_id WHERE m.classroom_id=c0.id AND m.group_id=c0.group_id AND EXISTS(SELECT 1 FROM plans p WHERE p.group_id=c.group_id AND p.student=m.student_name AND ${classPlanSubjectSql('p','c','st')} AND p.teacher_name=c.teacher_name AND p.active=1) ORDER BY m.student_name`;
function actorGuard(actor:Account,groupId:string) {
 return {sql:"EXISTS(SELECT 1 FROM accounts a JOIN tuition_groups g ON g.id=? AND g.active=1 WHERE a.id=? AND a.disabled_at IS NULL AND (a.group_id=g.id OR (?=1 AND a.group_id IS NULL)) AND a.role=? AND (a.role='admin' OR EXISTS(SELECT 1 FROM teachers t WHERE t.group_id=g.id AND t.name=a.teacher_name AND t.active=1)))",args:[groupId,actor.id,isOwnerAccount(actor)?1:0,actor.role]};
}
async function checkSlots(actor:Account,candidates:LessonSlot[],exclude:string[]=[]){
 const existing=await groupReader(actor.groupId).rows<LessonSlot&{sessionId:string|null}>("SELECT id,student,teacher_name AS teacherName,planned_start AS plannedStart,planned_end AS plannedEnd,status,session_id AS sessionId FROM lessons"),excluded=new Set(exclude),others=existing.filter(l=>!l.sessionId||!excluded.has(l.sessionId));
 for(const slot of candidates){const conflict=findLessonConflict(slot,others);if(conflict)throw new ClassSessionError("课程时间冲突",409,{start:conflict.plannedStart,end:conflict.plannedEnd,reason:lessonConflictReason(slot,conflict),...(actor.role==="admin"?{student:conflict.student,teacherName:conflict.teacherName}:{})});}
 for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){const a=candidates[i],b=candidates[j];if(a.id!==b.id&&a.plannedStart<b.plannedEnd&&b.plannedStart<a.plannedEnd&&(a.teacherName===b.teacherName||a.student===b.student))throw new ClassSessionError("重复课次之间的时间冲突",409);}
}
function sessionAudit(actor:Account,s:ClassSession,opId:string,action:string,before:unknown,after:unknown,at:string,claim:string,args:unknown[]) {
 return learningDb().prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) SELECT ?,?||l.id,l.id,?,?,?,?,? FROM lessons l WHERE l.session_id=? AND l.group_id=? AND "+claim)
  .bind(actor.groupId,"class-event:"+opId+":",actor.id,action,JSON.stringify(before),JSON.stringify(after),at,s.id,actor.groupId,...args);
}
function sessionNotice(actor:Account,s:ClassSession,opId:string,kind:string,at:string,claim:string,args:unknown[],target:"all"|"admin"|"teacher"="all") {
 const adminAccess="a.role='admin' AND (a.group_id=l.group_id OR (a.group_id IS NULL AND a.id NOT LIKE 'local:%' AND lower(trim(a.email))='felixtey2016@gmail.com'))";
 const access=target==="admin"?"a.disabled_at IS NULL AND "+adminAccess:target==="teacher"?"a.role='teacher' AND a.group_id=l.group_id AND a.teacher_name=l.teacher_name AND a.disabled_at IS NULL":"a.disabled_at IS NULL AND (("+adminAccess+") OR ("+participantSql+"))";
 return learningDb().prepare("INSERT OR IGNORE INTO site_notifications(group_id,id,account_id,event_id,lesson_id,kind,created_at) SELECT l.group_id,lower(hex(randomblob(16))),a.id,?||l.id,l.id,?,? FROM lessons l JOIN accounts a ON "+access+" WHERE l.session_id=? AND l.group_id=? AND a.id<>? AND (a.role='student' OR l.id=(SELECT min(id) FROM lessons WHERE session_id=l.session_id)) AND "+claim)
  .bind("class-event:"+opId+":",kind,at,s.id,actor.groupId,actor.id,...args);
}
export async function classSessionAction(actor:Account,data:Record<string,unknown>) {
 const action=str(data.action),groupId=requireGroup(actor.groupId),requestId=operationId(data.operationId),hash=await operationHash(data),{first,rows}=groupReader(groupId),db=learningDb(),now=new Date().toISOString(),guard=actorGuard(actor,groupId);
 if(!["admin","teacher"].includes(actor.role))throw new ClassSessionError("没有整班排课权限",403);
 const previous=await first<{afterJson:string}>("SELECT after_json AS afterJson FROM audit WHERE id=? AND actor_id=?","class-op:"+requestId,actor.id);
 if(previous){const saved=JSON.parse(previous.afterJson);if(saved.hash!==hash)throw new ClassSessionError("重复操作内容不同，请重新打开窗口",409);return {ok:true,replayed:true,count:saved.count};}
 if(action==="createClassSession") {
  const existing=await first<{createHash:string;count:number}>("SELECT create_hash AS createHash,count(*) AS count FROM class_sessions WHERE create_request_id=? AND created_by=? GROUP BY create_hash",requestId,actor.id);
  if(existing){if(existing.createHash!==hash)throw new ClassSessionError("重复操作内容不同，请重新打开窗口",409);return {ok:true,replayed:true,count:existing.count};}
  const chosen=(await classScheduleOptions(actor)).find(c=>c.id===str(data.classroomId));if(!chosen)throw new ClassSessionError("请选择有效且有权管理的班级",403);if(chosen.optionKey!==data.optionKey)throw new ClassSessionError("班级或学生名单已改变，请重新载入",409);if(!chosen.members.length)throw new ClassSessionError("班级暂无有效学生，不能排课");
  const start=malaysiaClassIso(data.start),end=malaysiaClassIso(data.end);hoursBetween(start,end);const dates=str(data.until)?generateWeekly(start,end,malaysiaClassIso(str(data.until)+"T23:59")):[{start,end}],onlineLink=normalizeOnlineLink(data.onlineLink),seriesId=dates.length>1?crypto.randomUUID():null;
  await checkSlots(actor,dates.flatMap((d,index)=>chosen.members.map(student=>({id:String(index),student,teacherName:chosen.teacherName,plannedStart:d.start,plannedEnd:d.end}))));
  const rosterJson=JSON.stringify(chosen.members),statements=[];
  for(const [index,date]of dates.entries()){
   const id=requestId+":"+index,claim="EXISTS(SELECT 1 FROM class_sessions WHERE id=? AND group_id=? AND create_request_id=?)",claimArgs=[id,groupId,requestId];
   statements.push(db.prepare("INSERT INTO class_sessions(id,group_id,session_type,classroom_id,classroom_title,teacher_name,subject,planned_start,planned_end,online_link,series_id,created_by,created_at,updated_at,create_request_id,occurrence,create_hash) SELECT ?,?,'group',?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM classrooms c0 WHERE c0.id=? AND c0.group_id=? AND c0.archived=0 AND c0.teacher_name=? AND c0.subject=? AND c0.title=? AND c0.updated_at=? AND (SELECT json_group_array(student_name) FROM ("+activeMembersSql+"))=? AND "+guard.sql)
    .bind(id,groupId,chosen.id,chosen.title,chosen.teacherName,chosen.subject,date.start,date.end,onlineLink,seriesId,actor.id,now,now,requestId,index,hash,chosen.id,groupId,chosen.teacherName,chosen.subject,chosen.title,chosen.updatedAt,rosterJson,...guard.args));
   statements.push(db.prepare("INSERT INTO lessons(group_id,id,student,subject,teacher_name,planned_start,planned_end,kind,series_id,created_by,updated_at,session_id) SELECT ?,lower(hex(randomblob(16))),value,?,?,?,?, 'regular',?,?,?,? FROM json_each(?) WHERE "+claim).bind(groupId,chosen.subject,chosen.teacherName,date.start,date.end,seriesId,actor.id,now,id,rosterJson,...claimArgs));
   statements.push(db.prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) SELECT ?,?||l.id,l.id,?,'createClassSession',json_object('sessionId',l.session_id,'student',l.student,'subject',l.subject,'plannedStart',l.planned_start,'plannedEnd',l.planned_end,'classroomTitle',?,'participantCount',?),? FROM lessons l WHERE l.session_id=? AND l.group_id=? AND "+claim).bind(groupId,"class-create:"+requestId+":",actor.id,chosen.title,chosen.members.length,now,id,groupId,...claimArgs));
  }
  try{const result=await db.batch(statements);if(result.filter((_,i)=>i%3===0).some(r=>!r.meta.changes))throw new ClassSessionError("班级或学生名单已改变，请重新载入",409);}catch(error){if(/UNIQUE constraint/.test(String(error))){const saved=await first<{createHash:string}>("SELECT create_hash AS createHash FROM class_sessions WHERE create_request_id=? AND created_by=? LIMIT 1",requestId,actor.id);if(saved?.createHash===hash)return {ok:true,replayed:true,count:dates.length};}throw error;}
  return {ok:true,count:dates.length,studentCount:chosen.members.length};
 }
 return changeClassSession(actor,data,{groupId,requestId,hash,now,guard});
}

async function changeClassSession(actor:Account,data:Record<string,unknown>,context:{groupId:string;requestId:string;hash:string;now:string;guard:{sql:string;args:unknown[]}}) {
 const {groupId,requestId,hash,now,guard}=context,action=str(data.action),{first,rows}=groupReader(groupId),db=learningDb();
 const id=str(data.sessionId),current=await session(actor,id),baseRevision=revision(data.revision);
 if(current.revision!==baseRevision)throw new ClassSessionError("课次已改变，请重新打开窗口",409);
 const participants=await rows<Participant>("SELECT session_id AS sessionId,lesson_id AS lessonId,student_name AS studentName FROM class_session_participants WHERE session_id=?",id);
 if(!participants.length)throw new ClassSessionError("课次名单不存在，请联系管理员",409);
 if(actor.role==="teacher"){
  if(!["proposeClassReschedule","updateClassSessionLink"].includes(action))throw new ClassSessionError("整班时间与取消需由管理员处理",403);
  const classroom=current.classroomId?await classroomMayManage(actor,current.classroomId):null;if(!classroom||classroom.archived)throw new ClassSessionError("班级已封存或无权管理",403);
 }
 const claim="EXISTS(SELECT 1 FROM class_sessions WHERE id=? AND group_id=? AND mutation_id=?)",claimArgs=[id,groupId,requestId];
 const opAudit=(count:number)=>db.prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) SELECT ?,?,?,?,?,?,? WHERE "+claim).bind(groupId,"class-op:"+requestId,"class-session:"+id,actor.id,action,JSON.stringify({hash,count}),now,...claimArgs);
 if(action==="updateClassSessionLink"){
  const link=normalizeOnlineLink(data.onlineLink),result=await db.batch([db.prepare("UPDATE class_sessions SET online_link=?,revision=revision+1,updated_at=?,mutation_id=? WHERE id=? AND group_id=? AND revision=? AND "+guard.sql).bind(link,now,requestId,id,groupId,baseRevision,...guard.args),sessionAudit(actor,current,requestId,action,{onlineLink:current.onlineLink},{onlineLink:link},now,claim,claimArgs),opAudit(1)]);
  if(!result[0].meta.changes)throw new ClassSessionError("课次或操作权限已改变，请重新载入",409);return {ok:true};
 }
 if(action==="proposeClassReschedule"){
  if(actor.role!=="teacher"||current.status!=="scheduled")throw new ClassSessionError("只有任课老师可申请整班改期",403);
  if(await first("SELECT 1 FROM lessons WHERE session_id=? AND (reviewed_at IS NOT NULL OR actual_start IS NOT NULL OR status<>'scheduled') LIMIT 1",id))throw new ClassSessionError("课次已有出席记录或已关闭，不能修改整班安排",409);
  const start=malaysiaClassIso(data.start),end=malaysiaClassIso(data.end);hoursBetween(start,end);if(start<=now)throw new ClassSessionError("请选择未来的时间");
  await checkSlots(actor,participants.map(p=>({id,student:p.studentName,teacherName:current.teacherName,plannedStart:start,plannedEnd:end})),[id]);
  const proposalId=crypto.randomUUID(),result=await db.batch([
   db.prepare("UPDATE class_sessions SET revision=revision+1,mutation_id=?,updated_at=? WHERE id=? AND group_id=? AND revision=? AND status='scheduled' AND NOT EXISTS(SELECT 1 FROM reschedule_requests WHERE session_id=? AND status='pending') AND "+guard.sql).bind(requestId,now,id,groupId,baseRevision,id,...guard.args),
   db.prepare("INSERT INTO reschedule_requests(group_id,id,lesson_id,original_start,original_end,proposed_start,proposed_end,status,note,requested_by,requested_role,requested_at,session_id) SELECT ?,?,?,?,?,?,?,'pending',?,?,'teacher',?,? WHERE "+claim).bind(groupId,proposalId,participants[0].lessonId,current.plannedStart,current.plannedEnd,start,end,str(data.note).slice(0,500)||null,actor.id,now,id,...claimArgs),
   sessionAudit(actor,current,requestId,"proposeClassReschedule",{plannedStart:current.plannedStart,plannedEnd:current.plannedEnd},{proposedStart:start,proposedEnd:end},now,claim,claimArgs),
   sessionNotice(actor,current,requestId,"group_reschedule_requested",now,claim,claimArgs,"admin"),opAudit(1),
  ]);if(!result[0].meta.changes)throw new ClassSessionError("课次已改变或已有待处理申请，请重新载入",409);return {ok:true,requestId:proposalId};
 }
 if(actor.role!=="admin")throw new ClassSessionError("整班时间与取消需由管理员处理",403);
 const response=action==="respondClassReschedule"?await first<{id:string;originalStart:string;originalEnd:string;proposedStart:string;proposedEnd:string;status:string}>("SELECT id,original_start AS originalStart,original_end AS originalEnd,proposed_start AS proposedStart,proposed_end AS proposedEnd,status FROM reschedule_requests WHERE id=? AND session_id=?",str(data.requestId),id):null;
 if(action==="respondClassReschedule"&&(!response||response.status!=="pending"||response.originalStart!==current.plannedStart||response.originalEnd!==current.plannedEnd))throw new ClassSessionError("申请已失效，请重新载入",409);
 if(action==="respondClassReschedule"&&!["accept","reject"].includes(str(data.decision)))throw new ClassSessionError("请选择接受或拒绝");
 if(action==="respondClassReschedule"&&data.decision==="reject"){
  const result=await db.batch([db.prepare("UPDATE class_sessions SET revision=revision+1,mutation_id=?,updated_at=? WHERE id=? AND group_id=? AND revision=? AND "+guard.sql).bind(requestId,now,id,groupId,baseRevision,...guard.args),db.prepare("UPDATE reschedule_requests SET status='rejected',responded_by=?,responded_at=? WHERE id=? AND status='pending' AND "+claim).bind(actor.id,now,response!.id,...claimArgs),sessionAudit(actor,current,requestId,"rejectReschedule",response,{status:"rejected"},now,claim,claimArgs),sessionNotice(actor,current,requestId,"rejectReschedule",now,claim,claimArgs,"teacher"),opAudit(1)]);
  if(!result[0].meta.changes)throw new ClassSessionError("课次或操作权限已改变，请重新载入",409);return {ok:true};
 }
 if(!["editClassSession","cancelClassSession","respondClassReschedule"].includes(action))throw new ClassSessionError("请求格式无效");
 const future=data.scope==="future";if(future&&!current.seriesId)throw new ClassSessionError("此课次没有重复安排");
 const targets=future?await rows<ClassSession>("SELECT "+columns+" FROM class_sessions s WHERE s.series_id=? AND s.planned_start>=? AND s.session_type='group' AND s.status='scheduled' AND NOT EXISTS(SELECT 1 FROM lessons l WHERE l.session_id=s.id AND (l.reviewed_at IS NOT NULL OR l.actual_start IS NOT NULL OR l.status<>'scheduled')) ORDER BY s.planned_start",current.seriesId,current.plannedStart):[current];
 if(!targets.length||targets.some(s=>s.status!=="scheduled")||await first("SELECT 1 FROM lessons WHERE session_id=? AND (reviewed_at IS NOT NULL OR actual_start IS NOT NULL OR status<>'scheduled') LIMIT 1",id))throw new ClassSessionError("课次已有出席记录或已关闭，不能修改整班安排",409);
 const cancel=action==="cancelClassSession",start=cancel?current.plannedStart:response?.proposedStart||malaysiaClassIso(data.start),end=cancel?current.plannedEnd:response?.proposedEnd||malaysiaClassIso(data.end);if(!cancel)hoursBetween(start,end);if(response&&start<=now)throw new ClassSessionError("建议时间已过，请重新申请");
 const shift=Date.parse(start)-Date.parse(current.plannedStart),newTimes=targets.map(s=>({session:s,start:new Date(Date.parse(s.plannedStart)+shift).toISOString(),end:future?new Date(Date.parse(s.plannedStart)+shift+Date.parse(end)-Date.parse(start)).toISOString():end}));
 const allParts=await rows<Participant>("SELECT p.session_id AS sessionId,p.lesson_id AS lessonId,p.student_name AS studentName FROM class_session_participants p JOIN class_sessions s ON s.id=p.session_id WHERE "+(future?"s.series_id=? AND s.planned_start>=?":"s.id=?"),...(future?[current.seriesId,current.plannedStart]:[id]));
 if(!cancel)await checkSlots(actor,newTimes.flatMap(v=>allParts.filter(p=>p.sessionId===v.session.id).map(p=>({id:v.session.id,student:p.studentName,teacherName:v.session.teacherName,plannedStart:v.start,plannedEnd:v.end}))),targets.map(s=>s.id));
 const expected=JSON.stringify(targets.map(s=>({id:s.id,revision:s.revision}))),statements=[
  db.prepare("UPDATE class_sessions SET mutation_id=? WHERE id=? AND group_id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM json_each(?) e LEFT JOIN class_sessions other ON other.id=json_extract(e.value,'$.id') AND other.group_id=? WHERE other.id IS NULL OR other.revision<>json_extract(e.value,'$.revision')) AND "+guard.sql).bind(requestId,id,groupId,baseRevision,expected,groupId,...guard.args),
  // Temporarily release only these slots inside the same transaction. A weekly
  // shift can pass through another targeted session's previous position.
  db.prepare("UPDATE lessons SET status='cancelled' WHERE session_id IN(SELECT json_extract(value,'$.id') FROM json_each(?)) AND group_id=? AND "+claim).bind(expected,groupId,...claimArgs),
 ];
 for(const v of newTimes){
  statements.push(db.prepare("UPDATE class_sessions SET planned_start=?,planned_end=?,status=?,revision=revision+1,updated_at=? WHERE id=? AND group_id=? AND "+claim).bind(cancel?v.session.plannedStart:v.start,cancel?v.session.plannedEnd:v.end,cancel?"cancelled":"scheduled",now,v.session.id,groupId,...claimArgs));
  statements.push(db.prepare("UPDATE lessons SET planned_start=?,planned_end=?,status=?,updated_at=? WHERE session_id=? AND group_id=? AND "+claim).bind(cancel?v.session.plannedStart:v.start,cancel?v.session.plannedEnd:v.end,cancel?"cancelled":"scheduled",now,v.session.id,groupId,...claimArgs));
  if(response)statements.push(db.prepare("UPDATE reschedule_requests SET status='accepted',responded_by=?,responded_at=? WHERE id=? AND status='pending' AND "+claim).bind(actor.id,now,response.id,...claimArgs));
  statements.push(db.prepare("UPDATE reschedule_requests SET status='stale',responded_at=? WHERE session_id=? AND status='pending' AND group_id=? AND "+claim).bind(now,v.session.id,groupId,...claimArgs));
  const event=cancel?"cancel":response?"acceptReschedule":"reschedule";statements.push(sessionAudit(actor,v.session,requestId,event,{plannedStart:v.session.plannedStart,plannedEnd:v.session.plannedEnd,originalStart:v.session.plannedStart,originalEnd:v.session.plannedEnd,...(response?{proposedStart:v.start,proposedEnd:v.end}:{})},{plannedStart:v.start,plannedEnd:v.end,status:cancel?"cancelled":"scheduled",sessionId:v.session.id},now,claim,claimArgs),sessionNotice(actor,v.session,requestId,event,now,claim,claimArgs));
 }
 statements.push(opAudit(targets.length));const result=await db.batch(statements);if(!result[0].meta.changes)throw new ClassSessionError("课次或操作权限已改变，请重新载入",409);return {ok:true,count:targets.length};
}
export async function legacyGroupAction(actor:Account,data:Record<string,unknown>,sessionId:string){
 const map:Record<string,string>={edit:"editClassSession",cancel:"cancelClassSession",proposeReschedule:"proposeClassReschedule",respondReschedule:"respondClassReschedule"};
 if(actor.role==="student")throw new ClassSessionError("整班时间由管理员处理，请联系老师",403);
 return classSessionAction(actor,{...data,action:map[str(data.action)],sessionId,revision:data.sessionRevision,operationId:data.operationId});
}
export async function classSessionPreview(actor:Account,data:Record<string,unknown>) {
 const start=malaysiaClassIso(data.start),end=malaysiaClassIso(data.end);hoursBetween(start,end);
 if(data.action==="createClassSession"){
  const chosen=(await classScheduleOptions(actor)).find(c=>c.id===str(data.classroomId));if(!chosen||!chosen.members.length)throw new ClassSessionError("请选择有效且有权管理的班级",403);
  const dates=str(data.until)?generateWeekly(start,end,malaysiaClassIso(str(data.until)+"T23:59")):[{start,end}];await checkSlots(actor,dates.flatMap((d,index)=>chosen.members.map(student=>({id:String(index),student,teacherName:chosen.teacherName,plannedStart:d.start,plannedEnd:d.end}))));
 }else{
  const current=await session(actor,str(data.sessionId));if(actor.role!=="admin"&&data.action!=="proposeClassReschedule")throw new ClassSessionError("整班时间与取消需由管理员处理",403);const parts=await groupReader(actor.groupId).rows<Participant>("SELECT session_id AS sessionId,lesson_id AS lessonId,student_name AS studentName FROM class_session_participants WHERE session_id=?",current.id);await checkSlots(actor,parts.map(p=>({id:current.id,student:p.studentName,teacherName:current.teacherName,plannedStart:start,plannedEnd:end})),[current.id]);
 }return {available:true};
}
