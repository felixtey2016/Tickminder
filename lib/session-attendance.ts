import {registerAttendanceWindowTranslations} from './attendance-window-i18n';
import type {Account} from './auth';
import {classSessionState,ClassSessionError,malaysiaClassIso} from './class-sessions';
import {groupReader,requireGroup} from './group-data';
import {learningDb} from './learning-server';
import {operationId,operationHash} from './learning-operations';
import {isOwnerAccount} from './owner';
import {hoursBetween,mayCheckIn,malaysiaDate} from './lesson-rules';
import {corePermissionKeys,requireCorePermissions,rejectUnknownAdminAction,guardedCoreDb} from './admin-core-permissions';
import {attendanceEditWindow,attendanceLockMessages} from './attendance-edit-window';
import {auditJson,appendAudit} from './audit-log';
import {accountSessionPredicate} from './account-session';

registerAttendanceWindowTranslations();
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
export const attendanceActions=['saveSessionAttendance','reviewSessionAttendance','lockSessionAttendance','unlockSessionAttendance','adminResetSessionAttendance'];
export async function readAttendanceSession(actor:Account,id:string){
 const state=await classSessionState(actor,{sessionId:id,permissionKey:'attendance.view'}),session=state.allSessions.find(s=>s.id===id);
 if(!session)return null;
 const locked=await learningDb().prepare(`SELECT 1 FROM invoice_source_locks k WHERE k.group_id=? AND
 ((k.source_type='session' AND k.source_id=?) OR
 (k.source_type='lesson' AND EXISTS(SELECT 1 FROM class_session_participants p WHERE p.group_id=k.group_id AND p.session_id=? AND p.lesson_id=k.source_id)) OR
 (k.source_type='student_month' AND k.month=strftime('%Y-%m',coalesce(?,?),'+8 hours') AND EXISTS(SELECT 1 FROM class_session_participants p JOIN billing_students b ON b.group_id=p.group_id AND b.student_name=p.student_name WHERE p.group_id=k.group_id AND p.session_id=? AND b.id=k.student_id))) LIMIT 1`)
 .bind(actor.groupId,id,id,session.actualStart,session.plannedStart,id).first();
 const participantLocks=await learningDb().prepare(`SELECT p.lesson_id AS lessonId,EXISTS(SELECT 1 FROM invoice_source_locks k WHERE k.group_id=p.group_id AND (k.source_type='lesson' AND k.source_id=p.lesson_id OR k.source_type='student_month' AND k.month=strftime('%Y-%m',coalesce(?,?),'+8 hours') AND EXISTS(SELECT 1 FROM billing_students b WHERE b.group_id=p.group_id AND b.student_name=p.student_name AND b.id=k.student_id))) AS locked FROM class_session_participants p WHERE p.group_id=? AND p.session_id=?`).bind(session.actualStart,session.plannedStart,actor.groupId,id).all<{lessonId:string;locked:number}>();
 const lockedIds=new Set((participantLocks.results||[]).filter(p=>p.locked).map(p=>p.lessonId));
 return {...session,invoiceLocked:Boolean(locked),participants:session.participants.map(p=>({...p,invoiceLocked:lockedIds.has(p.lessonId)}))};
}
export async function attendanceAction(actor:Account,data:Record<string,unknown>){
 if(!['teacher','admin'].includes(actor.role))throw new ClassSessionError('没有考勤操作权限',403);
 const action=str(data.action),permissionKeys=corePermissionKeys(action);rejectUnknownAdminAction(actor,permissionKeys);await requireCorePermissions(actor,permissionKeys);
 const group=requireGroup(actor.groupId),{first}=groupReader(group),db=guardedCoreDb(actor,permissionKeys),op=operationId(data.operationId),hash=await operationHash(data),now=new Date().toISOString();
 const previous=await first<{after:string}>("SELECT after_json AS after FROM audit WHERE id=? AND actor_id=?",'attendance-op:'+op,actor.id);
 if(previous){if(JSON.parse(previous.after).hash!==hash)throw new ClassSessionError('重复操作内容不同，请重新打开窗口',409);return {ok:true,replayed:true};}
 const s=await readAttendanceSession(actor,str(data.sessionId));
 if(!s)throw new ClassSessionError('课次不存在或无权访问',404);
 if(s.status==='cancelled')throw new ClassSessionError('已取消课次不能登记考勤',409);
 if(!Number.isSafeInteger(data.revision)||data.revision!==s.revision)throw new ClassSessionError('课次已改变，请重新载入考勤',409);
 const review=action==='reviewSessionAttendance',resetting=action==='adminResetSessionAttendance',locking=action==='lockSessionAttendance'||action==='unlockSessionAttendance',reason=str(data.reason);
 if(reason.length>500)throw new ClassSessionError('更正或锁定原因最多500字');
 const sessionGuard=accountSessionPredicate(actor);
 const guard="EXISTS(SELECT 1 FROM accounts a JOIN tuition_groups g ON g.id=? AND g.active=1 WHERE a.id=? AND a.disabled_at IS NULL AND a.role=? AND (a.group_id=g.id OR (?=1 AND a.group_id IS NULL)) AND (a.role='admin' OR (a.teacher_name=class_sessions.teacher_name AND EXISTS(SELECT 1 FROM teachers t WHERE t.group_id=g.id AND t.name=a.teacher_name AND t.active=1)))) AND ("+sessionGuard.sql+")";
 const actorArgs=[group,actor.id,actor.role,isOwnerAccount(actor)?1:0,...sessionGuard.args],claim='EXISTS(SELECT 1 FROM class_sessions WHERE id=? AND group_id=? AND mutation_id=?)',claimArgs=[s.id,group,op];
 const objectName=(s.sessionType==='group'?s.classroomTitle:s.participants[0]?.studentName)||s.subject,metadata={actorName:actor.name,objectName};
 const operationStatement=(after:Record<string,unknown>)=>appendAudit(db,{id:'attendance-op:'+op,groupId:group,lessonId:'session:'+s.id,actorId:actor.id,actorName:actor.name,objectName,action:'sessionAttendanceOperation',after:{hash,...after},at:now,guard:{sql:claim,args:claimArgs}});
 const finish=async(statements:D1PreparedStatement[],count=s.participants.length)=>{
  try{const result=await db.batch(statements);if(!result[0].meta.changes)throw new ClassSessionError('课次、锁定状态或操作权限已改变，请重新载入',409);}
  catch(error){if(/actual teaching conflict|actual student attendance conflict/.test(String(error)))throw new ClassSessionError('实际授课或学生出席时间与其他记录冲突，未保存任何考勤',409);
   if(/invoice_source_locked/.test(String(error)))throw new ClassSessionError(attendanceLockMessages.invoice,409);
   if(/UNIQUE constraint/.test(String(error))){const prev=await first<{after:string}>('SELECT after_json AS after FROM audit WHERE id=? AND actor_id=?','attendance-op:'+op,actor.id);if(prev&&JSON.parse(prev.after).hash===hash)return {ok:true,replayed:true};throw new ClassSessionError('课次已改变，请重新载入考勤',409);}throw error;}
  return {ok:true,count};
 };
 if(locking){
  if(actor.role!=='admin')throw new ClassSessionError('只有获授权的管理员可以锁定或解锁考勤',403);
  if(!reason)throw new ClassSessionError('请填写锁定或解锁原因');
  const lock=action==='lockSessionAttendance';
  if(lock===Boolean(s.explicitLockedAt))throw new ClassSessionError(lock?'考勤已经锁定，请重新载入':'考勤目前没有显式锁定，请重新载入',409);
  const before={sessionId:s.id,explicitLockedAt:s.explicitLockedAt,explicitLockedBy:s.explicitLockedBy,explicitLockReason:s.explicitLockReason,firstSubmissionAt:s.firstSubmissionAt,firstSubmissionBy:s.firstSubmissionBy};
  const after={...before,explicitLockedAt:lock?now:null,explicitLockedBy:lock?actor.id:null,explicitLockReason:lock?reason:null,reason,deadline:attendanceEditWindow(s).deadline};
  return finish([
   db.prepare('UPDATE class_sessions SET explicit_locked_at=?,explicit_locked_by=?,explicit_lock_reason=?,revision=revision+1,mutation_id=?,updated_at=? WHERE id=? AND group_id=? AND revision=? AND '+guard).bind(after.explicitLockedAt,after.explicitLockedBy,after.explicitLockReason,op,now,s.id,group,data.revision,...actorArgs),
   db.prepare("INSERT INTO audit(id,group_id,lesson_id,actor_id,action,before_json,after_json,at) SELECT 'attendance-lock:'||?||':'||p.lesson_id,?,p.lesson_id,?,?,?,?,? FROM class_session_participants p WHERE p.session_id=? AND p.group_id=? AND "+claim).bind(op,group,actor.id,action,auditJson(before,metadata),auditJson(after,metadata),now,s.id,group,...claimArgs),
   operationStatement(after),
  ]);
 }
 if(review&&actor.role!=='admin')throw new ClassSessionError('只有管理员可以复核考勤',403);
 if(resetting&&actor.role!=='admin')throw new ClassSessionError('只有获授权的管理员可以还原未登记考勤',403);
 const window=attendanceEditWindow(s,Date.parse(now)),initial=!window.recorded&&!s.firstSubmissionAt&&s.participants.every(p=>p.attendanceStatus==='pending');
 const unissued=s.participants.filter(p=>!p.invoiceLocked),resetParticipants=resetting&&s.invoiceLocked?unissued.filter(p=>p.attendanceStatus!=='pending'):s.participants,subsetEditing=Boolean(s.invoiceLocked&&actor.role==='admin'&&!resetting&&!review&&unissued.length),subset=resetting&&Boolean(s.invoiceLocked)||subsetEditing;
 if(s.invoiceLocked&&!(resetting&&resetParticipants.length||subsetEditing))throw new ClassSessionError(attendanceLockMessages.invoice,409);
 if(subsetEditing){
  if(s.teachingStatus==='pending')throw new ClassSessionError('请先在财务中登记已开单学生与共同授课，再登记未开单学生',409);
  const sameTime=(value:unknown,expected:string|null)=>value===undefined||!expected&&!str(value)||Boolean(expected&&Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(str(value))?str(value):malaysiaClassIso(value))===Date.parse(expected));
  if(data.teachingStatus!==undefined&&str(data.teachingStatus)!==s.teachingStatus||!sameTime(data.actualStart,s.actualStart)||!sameTime(data.actualEnd,s.actualEnd)||data.note!==undefined&&str(data.note)!==str(s.attendanceNote))throw new ClassSessionError('已开单整班的共同授课资料须通过财务纠错，当前只能修改未开单学生考勤',409);
 }
 if(actor.role==='teacher'){
  if(window.lockCode)throw new ClassSessionError(attendanceLockMessages[window.lockCode],409);
  if(!initial)throw new ClassSessionError(attendanceLockMessages.submitted,409);
  if(initial&&!mayCheckIn(s.plannedStart,now))throw new ClassSessionError('课程当天才可以打卡');
 }
 if((!initial||resetting)&&!reason)throw new ClassSessionError('请填写本次考勤更正原因');
 if(resetting&&!subset&&s.teachingStatus==='pending'&&s.participants.every(p=>p.attendanceStatus==='pending'))throw new ClassSessionError('考勤已经是未登记状态，请重新载入',409);
 const teaching=subset?s.teachingStatus:resetting?'pending':review?s.teachingStatus:str(data.teachingStatus);
 if(!['taught','not_taught','teacher_absent',...(resetting?['pending']:[])].includes(teaching))throw new ClassSessionError('请选择实际授课情况');
 const start=review||subset?s.actualStart:teaching==='taught'?malaysiaClassIso(data.actualStart):null,end=review||subset?s.actualEnd:teaching==='taught'?malaysiaClassIso(data.actualEnd):null;
 if(teaching==='taught'&&!resetting){if(!start||!end)throw new ClassSessionError('请填写实际授课起止时间');hoursBetween(start,end);if(malaysiaDate(start)>malaysiaDate(now)||malaysiaDate(end)>malaysiaDate(now))throw new ClassSessionError('实际上课日期不能在未来');}
 if(review&&(!s.attendanceRecordedAt||s.participants.some(p=>p.attendanceStatus==='pending')))throw new ClassSessionError('请先登记完整考勤，再复核',409);
 const affected=resetting?resetParticipants:subsetEditing?unissued:s.participants;
 if(!resetting&&(!Array.isArray(data.participants)||data.participants.length!==affected.length))throw new ClassSessionError(subsetEditing?'请一次提交全部未开单学生考勤':'必须一次提交本课次全部学生的考勤',409);
 const input=resetting?affected.map(p=>({lessonId:p.lessonId})):data.participants as Record<string,unknown>[],ids=input.map(p=>str(p.lessonId));
 if(new Set(ids).size!==ids.length||affected.some(p=>!ids.includes(p.lessonId)))throw new ClassSessionError('考勤学生名单已改变，请重新载入',409);
 const recorded=affected.map(p=>{const value=input.find(v=>v.lessonId===p.lessonId)! as Record<string,unknown>;const status=resetting?'pending':review?p.attendanceStatus:str(value.status);
  if(!resetting&&!['present','absent','late','early_leave','late_early'].includes(status))throw new ClassSessionError('请为每位学生选择有效出席状态');
  if(!resetting&&teaching!=='taught'&&status!=='absent')throw new ClassSessionError('未授课时不能记录学生已出席');
  let arrived:string|null=null,left:string|null=null;
  if(status!=='absent'&&status!=='pending'){arrived=review?p.arrivedAt:status==='present'||status==='early_leave'?start:malaysiaClassIso(value.arrivedAt);left=review?p.leftAt:status==='present'||status==='late'?end:malaysiaClassIso(value.leftAt);
   if(!arrived||!left||!start||!end||arrived<start||left>end||arrived>=left)throw new ClassSessionError('学生到离时间必须在实际授课范围内');
   if(['late','late_early'].includes(status)&&arrived<=start)throw new ClassSessionError('迟到时间必须晚于实际开始时间');
   if(['early_leave','late_early'].includes(status)&&left>=end)throw new ClassSessionError('早退时间必须早于实际结束时间');}
  const chargeable=resetting?null:teaching==='teacher_absent'?false:actor.role==='admin'?value.chargeable===true:status!=='absent';
  return {...p,attendanceStatus:status,arrivedAt:arrived,leftAt:left,attendanceNote:resetting?p.attendanceNote:review?p.attendanceNote:str(value.note).slice(0,500)||null,chargeable};
 });
 if(review&&recorded.some(p=>Boolean(p.chargeable)!==Boolean(s.participants.find(old=>old.lessonId===p.lessonId)?.chargeable))){await requireCorePermissions(actor,['attendance.edit']);permissionKeys.push('attendance.edit');}
 const billableIds=JSON.stringify(recorded.filter(p=>p.chargeable).map(p=>p.lessonId));
 if(await first("SELECT 1 FROM lessons WHERE replacement_for IN(SELECT value FROM json_each(?)) AND status<>'cancelled'",billableIds))throw new ClassSessionError('已有补课安排，不能同时标记原课收费',409);
 // Every accepted change confirms the newly submitted facts. The original
 // submission clock is immutable and is independent of the latest confirmation.
 const checked=resetting?null:now,note=resetting||review||subset?s.attendanceNote:str(data.note).slice(0,500)||null,firstSubmissionAt=s.firstSubmissionAt||(initial&&!resetting?now:null),firstSubmissionBy=s.firstSubmissionBy||(initial&&!resetting?actor.id:null);
 const afterTeaching={teachingStatus:teaching,actualStart:start,actualEnd:end,reviewedAt:checked,firstSubmissionAt,firstSubmissionBy,reason:reason||null,confirmationPolicy:resetting?'administrator_reset':'recording_account_confirms',...(resetting?{resetScope:subset?'uninvoiced_participants':'whole_session',count:affected.length}: {})};
 const teacherGuard=actor.role==='teacher'?" AND explicit_locked_at IS NULL AND first_submission_at IS NULL AND teaching_status='pending' AND attendance_recorded_at IS NULL AND NOT EXISTS(SELECT 1 FROM class_session_participants p WHERE p.group_id=class_sessions.group_id AND p.session_id=class_sessions.id AND p.attendance_status<>'pending')":"";
 const statements=[db.prepare('UPDATE class_sessions SET first_submission_at=?,first_submission_by=?,teaching_status=?,actual_start=?,actual_end=?,status=?,attendance_note=?,attendance_recorded_at=?,attendance_recorded_by=?,attendance_reviewed_at=?,attendance_reviewed_by=?,attendance_written_at=?,revision=revision+1,mutation_id=?,updated_at=? WHERE id=? AND group_id=? AND revision=? AND '+guard+teacherGuard)
  .bind(firstSubmissionAt,firstSubmissionBy,teaching,start,end,subset?s.status:resetting?'scheduled':'completed',note,resetting?s.attendanceRecordedAt||now:review?s.attendanceRecordedAt:now,resetting?s.attendanceRecordedBy||actor.id:review?s.attendanceRecordedBy:actor.id,subset?s.attendanceReviewedAt:checked,subset?s.attendanceReviewedBy:resetting?null:actor.id,now,op,now,s.id,group,data.revision,...actorArgs)];
 const changes=JSON.stringify(recorded.map(p=>{const before=s.participants.find(old=>old.lessonId===p.lessonId)!;
  const lessonStatus=resetting?'scheduled':teaching==='teacher_absent'?'teacher_absent':p.attendanceStatus==='absent'?'student_absent':'completed';
  const beforeJson={teachingStatus:s.teachingStatus,actualStart:s.actualStart,actualEnd:s.actualEnd,teachingNote:s.attendanceNote,status:before.attendanceStatus,arrivedAt:before.arrivedAt,leftAt:before.leftAt,note:before.attendanceNote,chargeable:before.chargeable,reviewedAt:s.attendanceReviewedAt,firstSubmissionAt:s.firstSubmissionAt,firstSubmissionBy:s.firstSubmissionBy,sessionId:s.id};
  const afterJson={...afterTeaching,teachingNote:note,status:p.attendanceStatus,arrivedAt:p.arrivedAt,leftAt:p.leftAt,note:p.attendanceNote,chargeable:p.chargeable,sessionId:s.id};
  return {lessonId:p.lessonId,status:p.attendanceStatus,lessonStatus,arrivedAt:p.arrivedAt,leftAt:p.leftAt,note:p.attendanceNote,chargeable:p.chargeable===null?null:p.chargeable?1:0,beforeJson:auditJson(beforeJson,metadata),afterJson:auditJson(afterJson,metadata)};
 }));
 const changeCte="WITH changes AS (SELECT json_extract(value,'$.lessonId') AS lessonId,json_extract(value,'$.status') AS status,json_extract(value,'$.lessonStatus') AS lessonStatus,json_extract(value,'$.arrivedAt') AS arrivedAt,json_extract(value,'$.leftAt') AS leftAt,json_extract(value,'$.note') AS note,json_extract(value,'$.chargeable') AS chargeable FROM json_each(?)) ";
 statements.push(db.prepare(changeCte+'UPDATE class_session_participants AS p SET attendance_status=c.status,arrived_at=c.arrivedAt,left_at=c.leftAt,attendance_note=c.note,attendance_updated_at=? FROM changes c WHERE p.lesson_id=c.lessonId AND p.session_id=? AND p.group_id=? AND '+claim).bind(changes,now,s.id,group,...claimArgs));
 statements.push(db.prepare(changeCte+'UPDATE lessons AS l SET status=c.lessonStatus,attendance_kind=c.status,actual_start=c.arrivedAt,actual_end=c.leftAt,note=c.note,chargeable=c.chargeable,reviewed_at=?,reviewed_by=?,updated_at=? FROM changes c WHERE l.id=c.lessonId AND l.session_id=? AND l.group_id=? AND '+claim).bind(changes,checked,resetting?null:actor.id,now,s.id,group,...claimArgs));
 statements.push(db.prepare("INSERT INTO audit(id,group_id,lesson_id,actor_id,action,before_json,after_json,at) SELECT 'attendance:'||?||':'||json_extract(j.value,'$.lessonId'),?,json_extract(j.value,'$.lessonId'),?,?,json_extract(j.value,'$.beforeJson'),json_extract(j.value,'$.afterJson'),? FROM json_each(?) j WHERE "+claim).bind(op,group,actor.id,action,now,changes,...claimArgs));
 statements.push(db.prepare("UPDATE reschedule_requests SET status='stale',responded_at=? WHERE session_id=? AND group_id=? AND status='pending' AND "+claim).bind(now,s.id,group,...claimArgs));
 statements.push(operationStatement({count:recorded.length,...afterTeaching}));
 return finish(statements,recorded.length);
}

