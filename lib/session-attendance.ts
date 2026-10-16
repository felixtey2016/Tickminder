import type {Account} from './auth';
import {classSessionState,ClassSessionError,malaysiaClassIso} from './class-sessions';
import {groupReader,requireGroup} from './group-data';
import {learningDb} from './learning-server';
import {operationId,operationHash} from './learning-operations';
import {isOwnerAccount} from './owner';
import {hoursBetween,mayCheckIn,malaysiaDate} from './lesson-rules';
import {corePermissionKeys,requireCorePermissions,rejectUnknownAdminAction,guardedCoreDb} from './admin-core-permissions';

const str=(v:unknown)=>typeof v==='string'?v.trim():'';
export const attendanceActions=['saveSessionAttendance','reviewSessionAttendance'];
export async function attendanceAction(actor:Account,data:Record<string,unknown>){
 if(!['teacher','admin'].includes(actor.role))throw new ClassSessionError('没有考勤操作权限',403);
 const permissionKeys=corePermissionKeys(str(data.action));rejectUnknownAdminAction(actor,permissionKeys);await requireCorePermissions(actor,permissionKeys);
 const group=requireGroup(actor.groupId),{first,rows}=groupReader(group),db=guardedCoreDb(actor,permissionKeys),op=operationId(data.operationId),hash=await operationHash(data),now=new Date().toISOString();
 const previous=await first<{after:string}>("SELECT after_json AS after FROM audit WHERE id=? AND actor_id=?",'attendance-op:'+op,actor.id);
 if(previous){if(JSON.parse(previous.after).hash!==hash)throw new ClassSessionError('重复操作内容不同，请重新打开窗口',409);return {ok:true,replayed:true};}
 const state=await classSessionState(actor),s=state.allSessions.find(s=>s.id===str(data.sessionId));
 if(!s)throw new ClassSessionError('课次不存在或无权访问',404);
 if(s.status==='cancelled')throw new ClassSessionError('已取消课次不能登记考勤',409);
 const review=data.action==='reviewSessionAttendance';
 if(review&&actor.role!=='admin')throw new ClassSessionError('只有管理员可以复核考勤',403);
 if(actor.role==='teacher'&&s.attendanceReviewedAt)throw new ClassSessionError('考勤已经复核，请联系管理员更正',409);
 if(actor.role==='teacher'&&!mayCheckIn(s.plannedStart,now))throw new ClassSessionError('课程当天才可以打卡');
 if(!Number.isSafeInteger(data.revision)||data.revision!==s.revision)throw new ClassSessionError('课次已改变，请重新载入考勤',409);
 const teaching=review?s.teachingStatus:str(data.teachingStatus);
 if(!['taught','not_taught','teacher_absent'].includes(teaching))throw new ClassSessionError('请选择实际授课情况');
 const start=review?s.actualStart:teaching==='taught'?malaysiaClassIso(data.actualStart):null,end=review?s.actualEnd:teaching==='taught'?malaysiaClassIso(data.actualEnd):null;
 if(teaching==='taught'){if(!start||!end)throw new ClassSessionError('请填写实际授课起止时间');hoursBetween(start,end);if(malaysiaDate(start)>malaysiaDate(now)||malaysiaDate(end)>malaysiaDate(now))throw new ClassSessionError('实际上课日期不能在未来');}
 if(review&&(!s.attendanceRecordedAt||s.participants.some(p=>p.attendanceStatus==='pending')))throw new ClassSessionError('请先登记完整考勤，再复核',409);
 if(!Array.isArray(data.participants)||data.participants.length!==s.participants.length)throw new ClassSessionError('必须一次提交本课次全部学生的考勤',409);
 const input=data.participants as Record<string,unknown>[],ids=input.map(p=>str(p.lessonId));
 if(new Set(ids).size!==ids.length||s.participants.some(p=>!ids.includes(p.lessonId)))throw new ClassSessionError('考勤学生名单已改变，请重新载入',409);
 const recorded=s.participants.map(p=>{const value=input.find(v=>v.lessonId===p.lessonId)!;const status=review?p.attendanceStatus:str(value.status);
  if(!['present','absent','late','early_leave','late_early'].includes(status))throw new ClassSessionError('请为每位学生选择有效出席状态');
  if(teaching!=='taught'&&status!=='absent')throw new ClassSessionError('未授课时不能记录学生已出席');
  let arrived:string|null=null,left:string|null=null;
  if(status!=='absent'){arrived=review?p.arrivedAt:status==='present'||status==='early_leave'?start:malaysiaClassIso(value.arrivedAt);left=review?p.leftAt:status==='present'||status==='late'?end:malaysiaClassIso(value.leftAt);
   if(!arrived||!left||!start||!end||arrived<start||left>end||arrived>=left)throw new ClassSessionError('学生到离时间必须在实际授课范围内');
   if(['late','late_early'].includes(status)&&arrived<=start)throw new ClassSessionError('迟到时间必须晚于实际开始时间');
   if(['early_leave','late_early'].includes(status)&&left>=end)throw new ClassSessionError('早退时间必须早于实际结束时间');}
  const chargeable=teaching==='teacher_absent'?false:actor.role==='admin'?value.chargeable===true:status!=='absent';
  return {...p,attendanceStatus:status,arrivedAt:arrived,leftAt:left,attendanceNote:review?p.attendanceNote:str(value.note).slice(0,500)||null,chargeable};
 });
 const billableIds=JSON.stringify(recorded.filter(p=>p.chargeable).map(p=>p.lessonId));
 if(await first("SELECT 1 FROM lessons WHERE replacement_for IN(SELECT value FROM json_each(?)) AND status<>'cancelled'",billableIds))throw new ClassSessionError('已有补课安排，不能同时标记原课收费',409);
 const checked=actor.role==='admin'?now:null,note=review?s.attendanceNote:str(data.note).slice(0,500)||null;
 const guard="EXISTS(SELECT 1 FROM accounts a JOIN tuition_groups g ON g.id=? AND g.active=1 WHERE a.id=? AND a.disabled_at IS NULL AND a.role=? AND (a.group_id=g.id OR (?=1 AND a.group_id IS NULL)) AND (a.role='admin' OR (a.teacher_name=class_sessions.teacher_name AND EXISTS(SELECT 1 FROM teachers t WHERE t.group_id=g.id AND t.name=a.teacher_name AND t.active=1))))";
 const claim='EXISTS(SELECT 1 FROM class_sessions WHERE id=? AND group_id=? AND mutation_id=?)',claimArgs=[s.id,group,op],afterTeaching={teachingStatus:teaching,actualStart:start,actualEnd:end,reviewedAt:checked};
 const statements=[db.prepare('UPDATE class_sessions SET teaching_status=?,actual_start=?,actual_end=?,attendance_note=?,attendance_recorded_at=?,attendance_recorded_by=?,attendance_reviewed_at=?,attendance_reviewed_by=?,attendance_written_at=?,revision=revision+1,mutation_id=?,updated_at=? WHERE id=? AND group_id=? AND revision=? AND '+guard+(actor.role==='teacher'?' AND attendance_reviewed_at IS NULL':''))
  .bind(teaching,start,end,note,review?s.attendanceRecordedAt:now,review?s.attendanceRecordedBy:actor.id,checked,checked?actor.id:null,now,op,now,s.id,group,data.revision,group,actor.id,actor.role,isOwnerAccount(actor)?1:0)];
 const changes=JSON.stringify(recorded.map(p=>{const before=s.participants.find(old=>old.lessonId===p.lessonId)!;
  const lessonStatus=teaching==='teacher_absent'?'teacher_absent':p.attendanceStatus==='absent'?'student_absent':'completed';
  const beforeJson={teachingStatus:s.teachingStatus,actualStart:s.actualStart,actualEnd:s.actualEnd,teachingNote:s.attendanceNote,status:before.attendanceStatus,arrivedAt:before.arrivedAt,leftAt:before.leftAt,note:before.attendanceNote,chargeable:before.chargeable,reviewedAt:s.attendanceReviewedAt};
  const afterJson={...afterTeaching,teachingNote:note,status:p.attendanceStatus,arrivedAt:p.arrivedAt,leftAt:p.leftAt,note:p.attendanceNote,chargeable:p.chargeable,sessionId:s.id};
  return {lessonId:p.lessonId,status:p.attendanceStatus,lessonStatus,arrivedAt:p.arrivedAt,leftAt:p.leftAt,note:p.attendanceNote,chargeable:p.chargeable?1:0,beforeJson:JSON.stringify(beforeJson),afterJson:JSON.stringify(afterJson)};
 }));
 const changeCte="WITH changes AS (SELECT json_extract(value,'$.lessonId') AS lessonId,json_extract(value,'$.status') AS status,json_extract(value,'$.lessonStatus') AS lessonStatus,json_extract(value,'$.arrivedAt') AS arrivedAt,json_extract(value,'$.leftAt') AS leftAt,json_extract(value,'$.note') AS note,json_extract(value,'$.chargeable') AS chargeable FROM json_each(?)) ";
 statements.push(db.prepare(changeCte+'UPDATE class_session_participants AS p SET attendance_status=c.status,arrived_at=c.arrivedAt,left_at=c.leftAt,attendance_note=c.note,attendance_updated_at=? FROM changes c WHERE p.lesson_id=c.lessonId AND p.session_id=? AND p.group_id=? AND '+claim).bind(changes,now,s.id,group,...claimArgs));
 statements.push(db.prepare(changeCte+'UPDATE lessons AS l SET status=c.lessonStatus,attendance_kind=c.status,actual_start=c.arrivedAt,actual_end=c.leftAt,note=c.note,chargeable=c.chargeable,reviewed_at=?,reviewed_by=?,updated_at=? FROM changes c WHERE l.id=c.lessonId AND l.session_id=? AND l.group_id=? AND '+claim).bind(changes,checked,checked?actor.id:null,now,s.id,group,...claimArgs));
 statements.push(db.prepare("INSERT INTO audit(id,group_id,lesson_id,actor_id,action,before_json,after_json,at) SELECT 'attendance:'||?||':'||json_extract(j.value,'$.lessonId'),?,json_extract(j.value,'$.lessonId'),?,?,json_extract(j.value,'$.beforeJson'),json_extract(j.value,'$.afterJson'),? FROM json_each(?) j WHERE "+claim).bind(op,group,actor.id,review?'reviewSessionAttendance':'saveSessionAttendance',now,changes,...claimArgs));
 statements.push(db.prepare("UPDATE reschedule_requests SET status='stale',responded_at=? WHERE session_id=? AND group_id=? AND status='pending' AND "+claim).bind(now,s.id,group,...claimArgs));
 statements.push(db.prepare('INSERT INTO audit(id,group_id,lesson_id,actor_id,action,after_json,at) SELECT ?,?,?,?,?,?,? WHERE '+claim).bind('attendance-op:'+op,group,'session:'+s.id,actor.id,'sessionAttendanceOperation',JSON.stringify({hash,count:recorded.length,...afterTeaching}),now,...claimArgs));
 try{const result=await db.batch(statements);if(!result[0].meta.changes)throw new ClassSessionError('课次或操作权限已改变，请重新载入',409);}catch(error){if(/actual teaching conflict|actual student attendance conflict/.test(String(error)))throw new ClassSessionError('实际授课或学生出席时间与其他记录冲突，未保存任何考勤',409);if(/UNIQUE constraint/.test(String(error))){const prev=await first<{after:string}>('SELECT after_json AS after FROM audit WHERE id=? AND actor_id=?','attendance-op:'+op,actor.id);if(prev&&JSON.parse(prev.after).hash===hash)return {ok:true,replayed:true};throw new ClassSessionError('课次已改变，请重新载入考勤',409);}throw error;}
 return {ok:true,count:recorded.length};
}
