import {NextResponse} from 'next/server';
import {currentBusinessAccount} from '@/lib/auth';
import {guardedCoreReader,requireCorePermissions} from '@/lib/admin-core-permissions';
import {adminPermissionFailure,hasAdminPermission} from '@/lib/admin-permission-access';
import {studentAttendanceSnapshot} from '@/lib/student-course-response';
import {invoiceAttendanceHistorySnapshot} from '@/lib/attendance-history-projection';
import {sanitizeAuditValue} from '@/lib/audit-log';
import {auditNames,historicalAccountLabel} from '@/lib/audit-names';
import {assertCourseActor,courseLessonScope,coursePage,CourseQueryError} from '@/lib/course-query';

const headers={'Cache-Control':'private, no-store'};
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers});
type HistoryEntry={id:string;type:string;originalStart:string;originalEnd:string;proposedStart:string;proposedEnd:string;status:string;requestedBy:string|null;requestedAt:string;respondedBy:string|null;respondedAt:string|null;note:string|null;requestedRole:string|null};
type AttendanceEntry={id:string;action:string;at:string;actorId:string;beforeJson:string|null;afterJson:string|null};
export async function GET(request:Request){
 const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);
 try{
  await assertCourseActor(actor);
  const params=new URL(request.url).searchParams,id=params.get('lessonId')||'';
  let page=coursePage(params.get('page')),attendancePage=coursePage(params.get('attendancePage'));
  if(!id||id.length>200)throw new CourseQueryError('请选择课程');
  const scope=courseLessonScope(actor),base=guardedCoreReader(actor,['lessons.view']);
  const lesson=await base.first<{sessionId:string|null;teacherName:string;plannedStart:string;plannedEnd:string}>('SELECT l.session_id AS sessionId,l.teacher_name AS teacherName,l.planned_start AS plannedStart,l.planned_end AS plannedEnd FROM lessons l WHERE l.id=? AND '+scope.sql,id,...scope.args);
  if(!lesson)return json({error:'课程不存在或没有查看权限'},404);
  const showReschedules=await hasAdminPermission(actor,'reschedules.view'),showAttendance=await hasAdminPermission(actor,'attendance.view'),studentView=actor.role==='student';
  const requestSource="SELECT r.id,'request' AS type,r.original_start AS originalStart,r.original_end AS originalEnd,r.proposed_start AS proposedStart,r.proposed_end AS proposedEnd,r.status,r.requested_by AS requestedBy,r.requested_at AS requestedAt,r.responded_by AS respondedBy,r.responded_at AS respondedAt,r.note,r.requested_role AS requestedRole FROM reschedule_requests r WHERE r.lesson_id=? OR (r.session_id=? AND EXISTS(SELECT 1 FROM class_sessions s WHERE s.id=? AND s.session_type='group')) UNION ALL SELECT a.id,'direct' AS type,json_extract(a.before_json,'$.plannedStart') AS originalStart,json_extract(a.before_json,'$.plannedEnd') AS originalEnd,json_extract(a.after_json,'$.plannedStart') AS proposedStart,json_extract(a.after_json,'$.plannedEnd') AS proposedEnd,'applied' AS status,a.actor_id AS requestedBy,a.at AS requestedAt,NULL AS respondedBy,NULL AS respondedAt,NULL AS note,NULL AS requestedRole FROM audit a WHERE a.lesson_id=? AND a.action='reschedule' AND json_valid(a.before_json) AND json_valid(a.after_json) AND json_type(a.before_json,'$.plannedStart')='text' AND json_type(a.before_json,'$.plannedEnd')='text' AND json_type(a.after_json,'$.plannedStart')='text' AND json_type(a.after_json,'$.plannedEnd')='text'";
  const requestArgs=[id,lesson.sessionId,lesson.sessionId,id],attendanceWhere="a.lesson_id=? AND a.action IN('saveSessionAttendance','reviewSessionAttendance','attendance','review','autoConfirmAttendance','lockSessionAttendance','unlockSessionAttendance','adminResetSessionAttendance','invoice.correctAttendance')";
  let entries:HistoryEntry[]=[],attendanceEntries:AttendanceEntry[]=[],total=0,attendanceTotal=0;
  if(showReschedules){const reader=guardedCoreReader(actor,['reschedules.view']);total=Number((await reader.first<{total:number}>(`SELECT count(*) AS total FROM (${requestSource})`,...requestArgs))?.total||0);page=Math.min(page,Math.max(1,Math.ceil(total/20)));entries=await reader.rows<HistoryEntry>(`SELECT * FROM (${requestSource}) ORDER BY requestedAt DESC,id DESC LIMIT 20 OFFSET ?`,...requestArgs,(page-1)*20);}
  if(showAttendance){const reader=guardedCoreReader(actor,['attendance.view']);attendanceTotal=Number((await reader.first<{total:number}>(`SELECT count(*) AS total FROM audit a WHERE ${attendanceWhere}`,id))?.total||0);attendancePage=Math.min(attendancePage,Math.max(1,Math.ceil(attendanceTotal/20)));attendanceEntries=await reader.rows<AttendanceEntry>(`SELECT a.id,a.action,a.at,a.actor_id AS actorId,a.before_json AS beforeJson,a.after_json AS afterJson FROM audit a WHERE ${attendanceWhere} ORDER BY a.at DESC,a.id DESC LIMIT 20 OFFSET ?`,id,(attendancePage-1)*20);}
  const actorIds=[...new Set([...entries.flatMap(e=>[e.requestedBy,e.respondedBy]),...attendanceEntries.map(e=>e.actorId)].filter((v):v is string=>Boolean(v)))];
  const names=studentView||!actorIds.length?new Map<string,string>():await auditNames(actor,actorIds);
  const nameOf=(id:string|null)=>id?historicalAccountLabel(id,names):null;
  const readJson=(value:string|null)=>{try{const parsed=JSON.parse(value||'{}');return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed as Record<string,unknown>:{};}catch{return{};}};
  await requireCorePermissions(actor,['lessons.view',...showReschedules?['reschedules.view']:[],...showAttendance?['attendance.view']:[]]);await assertCourseActor(actor);
  if(!await base.first('SELECT 1 FROM lessons l WHERE l.id=? AND '+scope.sql,id,...scope.args))throw new CourseQueryError('课程权限已改变，请刷新后重试',403);
  return json({studentView,currentStart:lesson.plannedStart,currentEnd:lesson.plannedEnd,
   entries:entries.map(e=>({...e,requestedRole:undefined,requestedBy:studentView?(e.type==='direct'?null:e.requestedBy===actor.id?actor.name:e.requestedRole==='teacher'?lesson.teacherName:null):nameOf(e.requestedBy),respondedBy:studentView?null:nameOf(e.respondedBy)})),
   page,pages:Math.max(1,Math.ceil(total/20)),total,pageSize:20,
   attendanceEntries:attendanceEntries.map(e=>{const rawBefore=readJson(e.beforeJson),rawAfter=readJson(e.afterJson),financial=e.action==='invoice.correctAttendance',before=financial?invoiceAttendanceHistorySnapshot(rawBefore):sanitizeAuditValue(rawBefore) as Record<string,unknown>,after=financial?invoiceAttendanceHistorySnapshot(rawAfter,rawBefore):sanitizeAuditValue(rawAfter) as Record<string,unknown>;return studentView?{id:e.id,action:e.action,at:e.at,before:studentAttendanceSnapshot(before),after:studentAttendanceSnapshot(after)}:{id:e.id,action:e.action,at:e.at,actor:nameOf(e.actorId),before,after};}),
   attendancePage,attendancePages:Math.max(1,Math.ceil(attendanceTotal/20)),attendanceTotal,attendancePageSize:20});
 }catch(error){const permission=adminPermissionFailure(error);return json({error:permission?.error||(error instanceof CourseQueryError?error.message:'课程历史暂时无法加载')},permission?.status||(error instanceof CourseQueryError?error.status:503));}
}
