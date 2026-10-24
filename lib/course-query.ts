import type {Account} from './auth';
import type {lessons,rescheduleRequests} from '@/db/schema';
import {learningDb} from './learning-server';
import {guardedCoreReader,requireCorePermissions} from './admin-core-permissions';
import {hasAdminPermission} from './admin-permission-access';
import {accountSessionPredicate} from './account-session';
import {requireGroup} from './group-data';
import {classSessionState} from './class-sessions';
import {studentLessonResponse,studentRescheduleResponse,studentSessionResponse} from './student-course-response';
import {uniqueSessionLessons} from './class-session-display';
import {readRevision} from './revision';
import type {TeacherStudentPair} from './teacher-student-options';

export class CourseQueryError extends Error {constructor(message:string,readonly status=400){super(message);}}
export type CourseRange={from:string;to:string;start:string;end:string};
export type CoursePage<T>={items:T[];page:number;pages:number;total:number;pageSize:20;revision:number;teacherStudentPairs:TeacherStudentPair[]};
export type CourseTaskCounts={lessons:number;reschedule:number;overview:number;attention:number;pendingAttendance:number;pendingReview:number;makeupNeeded:number;todayLessons:number;todayPendingAttendance:number};
export type CourseTeachingSummary={month:string;recordedMilliseconds:number;approvedMilliseconds:number;count:number};
export type CourseTimetableSummary={lessonCount:number;completedCount:number;durationMilliseconds:number};
type SummaryPlan={key:string;student:string;subject:string;subjectId?:string|null;syllabusId?:string|null};
type Lesson=typeof lessons.$inferSelect;
type RequestRow=typeof rescheduleRequests.$inferSelect;
type Predicate={sql:string;args:unknown[]};
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
const DAY=86400000,OFFSET=28800000;
const currentMonth=()=>new Date(Date.now()+OFFSET).toISOString().slice(0,7);
export function courseMonth(value:unknown){const month=text(value)||currentMonth();if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<1000)throw new CourseQueryError('请选择有效月份');return month;}
function validDate(value:string){const n=Date.parse(value+'T00:00:00.000Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)throw new CourseQueryError('请选择有效日期范围');return n;}
export function courseRange(params:URLSearchParams,month=courseMonth(params.get('month'))):CourseRange {
 const first=month+'-01',[year,m]=month.split('-').map(Number),next=new Date(Date.UTC(year,m,1)).toISOString().slice(0,10);
 if(params.has('from')!==params.has('to'))throw new CourseQueryError('请同时提供日期范围起止');
 const from=params.has('from')?text(params.get('from')):first,to=params.has('to')?text(params.get('to')):next,start=validDate(from),end=validDate(to);
 if(end<=start||end-start>62*DAY)throw new CourseQueryError('日期范围须为1至62天');
 return{from,to,start:new Date(start-OFFSET).toISOString(),end:new Date(end-OFFSET).toISOString()};
}
export function coursePage(value:unknown){if(value===null||value===undefined||value==='')return 1;const p=Number(value);if(!Number.isSafeInteger(p)||p<1||p>100000)throw new CourseQueryError('分页信息无效');return p;}
export function courseOverlap(alias:string){return`julianday(${alias}.planned_start)<julianday(?) AND julianday(${alias}.planned_end)>julianday(?)`;}
const inMonth=(column:string)=>`julianday(${column})>=julianday(?) AND julianday(${column})<julianday(?)`;
const millis=(start:string,end:string)=>`max(0,round((julianday(${end})-julianday(${start}))*86400000))`;
const lessonColumns=`l.id,l.group_id AS groupId,l.session_id AS sessionId,l.student,l.subject,l.teacher_name AS teacherName,l.planned_start AS plannedStart,l.planned_end AS plannedEnd,l.actual_start AS actualStart,l.actual_end AS actualEnd,l.status,l.attendance_kind AS attendanceKind,l.note,l.chargeable,l.reviewed_at AS reviewedAt,l.reviewed_by AS reviewedBy,l.kind,l.series_id AS seriesId,l.replacement_for AS replacementFor,l.created_by AS createdBy,l.updated_at AS updatedAt`;
const requestColumns=`r.id,r.group_id AS groupId,r.session_id AS sessionId,r.lesson_id AS lessonId,r.original_start AS originalStart,r.original_end AS originalEnd,r.proposed_start AS proposedStart,r.proposed_end AS proposedEnd,r.status,r.note,r.requested_by AS requestedBy,r.requested_role AS requestedRole,r.requested_at AS requestedAt,r.responded_by AS respondedBy,r.responded_at AS respondedAt`;

function identity(actor:Account):Predicate {
 if(!['admin','teacher','student'].includes(actor.role))throw new CourseQueryError('没有课程查看权限',403);
 if(actor.role==='admin')return{sql:'1',args:[]};
 const session=accountSessionPredicate(actor);
 // The tenant reader forbids explicit main.* access; sessions is a global
 // identity table and is deliberately absent from its group-scoped CTEs.
 const sessionSql=session.sql.replace('main.sessions','sessions');
 return{sql:`EXISTS(SELECT 1 FROM accounts course_actor JOIN tuition_groups course_group ON course_group.id=course_actor.group_id AND course_group.active=1 WHERE course_actor.id=? AND course_actor.group_id=? AND course_actor.role=? AND course_actor.teacher_name IS ? AND course_actor.student_name IS ? AND course_actor.disabled_at IS NULL AND NOT EXISTS(SELECT 1 FROM local_credentials credentials WHERE credentials.account_id=course_actor.id AND credentials.must_change_password=1) AND ${sessionSql})`,args:[actor.id,requireGroup(actor.groupId),actor.role,actor.teacherName,actor.studentName,...session.args]};
}
export async function assertCourseActor(actor:Account,keys:string[]=['lessons.view']){
 const id=identity(actor);await requireCorePermissions(actor,keys);
 if(!await learningDb().prepare(`SELECT 1 WHERE ${id.sql}`).bind(...id.args).first())throw new CourseQueryError('课程权限已改变，请刷新后重试',403);
}
/** Match the existing active teaching plan rule, with preserved group-session ownership. */
export function courseLessonScope(actor:Account,alias='l'):Predicate {
 const id=identity(actor),args:unknown[]=[requireGroup(actor.groupId)],parts=[`${alias}.group_id=?`];
 if(actor.role==='teacher'){
  parts.push(`${alias}.teacher_name=? AND (EXISTS(SELECT 1 FROM plans assigned JOIN students roster ON roster.group_id=assigned.group_id AND roster.name=assigned.student AND roster.active=1 JOIN teachers teacher ON teacher.group_id=assigned.group_id AND teacher.name=assigned.teacher_name AND teacher.active=1 WHERE assigned.group_id=${alias}.group_id AND assigned.student=${alias}.student AND assigned.subject=${alias}.subject AND assigned.teacher_name=${alias}.teacher_name AND assigned.active=1) OR EXISTS(SELECT 1 FROM class_sessions owned WHERE owned.group_id=${alias}.group_id AND owned.id=${alias}.session_id AND owned.session_type='group' AND owned.teacher_name=${alias}.teacher_name))`);args.push(actor.teacherName);
 }else if(actor.role==='student'){parts.push(`${alias}.student=?`);args.push(actor.studentName);}
 parts.push(id.sql);args.push(...id.args);return{sql:parts.join(' AND '),args};
}
function sessionScope(actor:Account):Predicate {
 const id=identity(actor),args:unknown[]=[requireGroup(actor.groupId)],parts=['s.group_id=?'];
 if(actor.role==='teacher'){parts.push('s.teacher_name=?');args.push(actor.teacherName);}
 if(actor.role==='student'){parts.push('EXISTS(SELECT 1 FROM class_session_participants mine WHERE mine.group_id=s.group_id AND mine.session_id=s.id AND mine.student_name=?)');args.push(actor.studentName);}
 parts.push(id.sql);args.push(...id.args);return{sql:parts.join(' AND '),args};
}
const noReplacement=(alias='l')=>`NOT EXISTS(SELECT 1 FROM lessons replacement WHERE replacement.group_id=${alias}.group_id AND replacement.replacement_for=${alias}.id AND replacement.status<>'cancelled')`;
async function decorateLessons(actor:Account,rows:Lesson[],selectedSessions?:Awaited<ReturnType<typeof classSessionState>>){
 const sessionIds=[...new Set(rows.map(l=>l.sessionId).filter((s):s is string=>Boolean(s)))],data=selectedSessions||await classSessionState(actor,{sessionIds}),canAttendance=actor.role!=='admin'||await hasAdminPermission(actor,'attendance.view');
 const {rows:read}=guardedCoreReader(actor,['lessons.view']);
 const links=rows.length?await read<{id:string;onlineLink:string|null}>(`SELECT l.id,p.online_link AS onlineLink FROM lessons l LEFT JOIN plans p ON p.group_id=l.group_id AND p.student=l.student AND p.subject=l.subject AND p.teacher_name=l.teacher_name WHERE l.id IN(SELECT value FROM json_each(?))`,JSON.stringify(rows.map(l=>l.id))):[];
 const linkMap=new Map(links.map(l=>[l.id,l.onlineLink]));
 return rows.map(source=>{
  const s=source.sessionId?data.byId.get(source.sessionId):undefined,p=s?.participants.find(p=>p.lessonId===source.id),lesson={...source,chargeable:source.chargeable===null?null:Boolean(source.chargeable),teachingStatus:s?.teachingStatus,teachingStart:s?.actualStart,teachingEnd:s?.actualEnd,personalAttendance:p?.attendanceStatus,onlineLink:s?.sessionType==='group'?s.onlineLink:linkMap.get(source.id)||s?.onlineLink||null,sessionType:s?.sessionType||'one_to_one',classroomId:s?.classroomId||null,classroomTitle:s?.classroomTitle,participantCount:s?.participantCount||1,sessionRevision:s?.revision,sessionStatus:s?.status,...actor.role!=='student'?{participantNames:s?.participants.map(p=>p.studentName)}:{}};
  if(actor.role==='student')return studentLessonResponse(lesson);
  if(canAttendance)return lesson;
  const {actualStart:_,actualEnd:__,attendanceKind:___,note:____,chargeable:_____,reviewedAt:______,reviewedBy:_______,...schedule}=lesson;return schedule;
 });
}
export async function courseRangeState(actor:Account,range:CourseRange){
 const scope=courseLessonScope(actor),{rows}=guardedCoreReader(actor,['lessons.view']);
 const source=await rows<Lesson>(`SELECT ${lessonColumns} FROM lessons l WHERE ${scope.sql} AND ${courseOverlap('l')}${actor.role==='student'?" AND l.status<>'cancelled'":''} ORDER BY l.planned_start,l.id`,...scope.args,range.end,range.start);
 const sessionData=await classSessionState(actor,{from:range.start,to:range.end}),lessons=await decorateLessons(actor,source,sessionData);
 const requests=await hasAdminPermission(actor,'reschedules.view')?await rows<RequestRow>(`SELECT ${requestColumns} FROM reschedule_requests r JOIN lessons l ON l.group_id=r.group_id AND l.id=r.lesson_id WHERE ${scope.sql} AND r.status='pending' AND (${courseOverlap('l')} OR (julianday(r.proposed_start)<julianday(?) AND julianday(r.proposed_end)>julianday(?))) ORDER BY r.requested_at,r.id`,...scope.args,range.end,range.start,range.end,range.start):[];
 const groupIds=new Set(sessionData.sessions.map(s=>s.id));
 return{lessons,attendanceSessions:actor.role==='student'?undefined:sessionData.allSessions,classSessions:actor.role==='student'?sessionData.sessions.map(s=>studentSessionResponse(s,actor.studentName)):sessionData.sessions,proposals:requests.filter(r=>!r.sessionId||!groupIds.has(r.sessionId)).map(r=>actor.role==='student'?studentRescheduleResponse(r):r),classSessionRequests:actor.role==='student'?[]:requests.filter(r=>r.sessionId&&groupIds.has(r.sessionId))};
}
export async function courseAggregates(actor:Account,month:string,plans:SummaryPlan[]){
 const emptyTasks:CourseTaskCounts={lessons:0,reschedule:0,overview:0,attention:0,pendingAttendance:0,pendingReview:0,makeupNeeded:0,todayLessons:0,todayPendingAttendance:0},emptyTeaching:CourseTeachingSummary={month,recordedMilliseconds:0,approvedMilliseconds:0,count:0};
 const range=courseRange(new URLSearchParams({month})),now=new Date().toISOString(),scope=courseLessonScope(actor),ss=sessionScope(actor),canStats=actor.role!=='student'&&await hasAdminPermission(actor,'statistics.view'),canAttendance=actor.role!=='student'&&await hasAdminPermission(actor,'attendance.view'),canLessons=await hasAdminPermission(actor,'lessons.view'),canRequests=await hasAdminPermission(actor,'reschedules.view');
 let taskCounts=emptyTasks,teachingSummary=emptyTeaching,summary:Array<{key:string;completed:number;lessons:number;upcoming:number;pending:number;makeupNeeded:number}>=[];
 if(canLessons||canAttendance){
  const {first}=guardedCoreReader(actor,[canLessons?'lessons.view':'attendance.view']);
  const today=new Date(Date.now()+OFFSET).toISOString().slice(0,10),todayStart=new Date(Date.parse(today+'T00:00:00Z')-OFFSET).toISOString(),todayEnd=new Date(Date.parse(today+'T00:00:00Z')+DAY-OFFSET).toISOString();
  const row=await first<{pending:number;review:number;makeup:number;todayLessons:number;todayPendingAttendance:number}>(`SELECT count(DISTINCT CASE WHEN l.status='scheduled' AND julianday(l.planned_end)<julianday(?) THEN CASE WHEN s.session_type='group' THEN s.id ELSE l.id END END) AS pending,count(DISTINCT CASE WHEN l.status IN('completed','student_absent','teacher_absent') AND l.reviewed_at IS NULL THEN CASE WHEN s.session_type='group' THEN s.id ELSE l.id END END) AS review,coalesce(sum(l.status IN('student_absent','teacher_absent') AND coalesce(l.chargeable,0)=0 AND ${noReplacement()}),0) AS makeup,count(DISTINCT CASE WHEN l.status<>'cancelled' AND ${courseOverlap('l')} THEN CASE WHEN s.session_type='group' THEN s.id ELSE l.id END END) AS todayLessons,count(DISTINCT CASE WHEN l.status='scheduled' AND ${courseOverlap('l')} THEN CASE WHEN s.session_type='group' THEN s.id ELSE l.id END END) AS todayPendingAttendance FROM lessons l LEFT JOIN class_sessions s ON s.group_id=l.group_id AND s.id=l.session_id WHERE ${scope.sql}`,now,todayEnd,todayStart,todayEnd,todayStart,...scope.args);
  const incoming=canRequests?(await guardedCoreReader(actor,['reschedules.view']).first<{total:number}>(`SELECT count(*) AS total FROM reschedule_requests r JOIN lessons l ON l.group_id=r.group_id AND l.id=r.lesson_id WHERE ${scope.sql} AND r.status='pending' AND l.status='scheduled'${actor.role==='admin'?'':" AND r.requested_role<>? AND r.requested_by<>?"}`,...scope.args,...actor.role==='admin'?[]:[actor.role,actor.id]))?.total||0:0;
  const pending=Number(row?.pending||0),review=canAttendance?Number(row?.review||0):0,makeup=canAttendance?Number(row?.makeup||0):0;
  taskCounts={lessons:actor.role==='teacher'?pending:0,reschedule:incoming,overview:actor.role==='admin'?review:0,attention:actor.role==='admin'&&canAttendance?pending+review+makeup:0,pendingAttendance:pending,pendingReview:review,makeupNeeded:makeup,todayLessons:canLessons?Number(row?.todayLessons||0):0,todayPendingAttendance:canAttendance?Number(row?.todayPendingAttendance||0):0};
 }
 if(canStats){
  const {rows}=guardedCoreReader(actor,['statistics.view']);
  const values=await rows<{student:string;subject:string;subjectId:string|null;syllabusId:string|null;completed:number;lessons:number;upcoming:number;pending:number;makeupNeeded:number}>(`SELECT l.student,l.subject,c.subject_id AS subjectId,c.syllabus_id AS syllabusId,
   coalesce(sum(CASE WHEN l.status='completed' AND l.reviewed_at IS NOT NULL AND ${inMonth('l.actual_start')} THEN ${millis('l.actual_start','l.actual_end')}/3600000.0 ELSE 0 END),0) AS completed,
   coalesce(sum(l.status='completed' AND l.reviewed_at IS NOT NULL AND ${inMonth('l.actual_start')} AND julianday(l.actual_end)>julianday(l.actual_start)),0) AS lessons,
   coalesce(sum(CASE WHEN l.status='scheduled' AND julianday(l.planned_start)>julianday(?) AND ${inMonth('l.planned_start')} THEN ${millis('l.planned_start','l.planned_end')}/3600000.0 ELSE 0 END),0) AS upcoming,
   coalesce(sum(l.status<>'cancelled' AND l.reviewed_at IS NULL AND julianday(l.planned_start)<=julianday(?) AND ${inMonth('l.planned_start')}),0) AS pending,
   coalesce(sum(l.status IN('student_absent','teacher_absent') AND ${inMonth('l.planned_start')} AND ${noReplacement()}),0) AS makeupNeeded
   FROM lessons l LEFT JOIN class_sessions s ON s.group_id=l.group_id AND s.id=l.session_id LEFT JOIN classrooms c ON c.group_id=s.group_id AND c.id=s.classroom_id WHERE ${scope.sql} AND (${inMonth('l.planned_start')} OR ${inMonth('l.actual_start')}) GROUP BY l.student,l.subject,c.subject_id,c.syllabus_id`,range.start,range.end,range.start,range.end,now,range.start,range.end,now,range.start,range.end,range.start,range.end,...scope.args,range.start,range.end,range.start,range.end);
  summary=plans.map(plan=>{const match=values.filter(v=>v.student===plan.student&&(v.subject===plan.subject||Boolean(plan.subjectId&&v.subjectId===plan.subjectId&&v.syllabusId===plan.syllabusId)));return{key:plan.key,completed:match.reduce((n,v)=>n+v.completed,0),lessons:match.reduce((n,v)=>n+v.lessons,0),upcoming:match.reduce((n,v)=>n+v.upcoming,0),pending:match.reduce((n,v)=>n+v.pending,0),makeupNeeded:match.reduce((n,v)=>n+v.makeupNeeded,0)};});
 }
 if(canAttendance){
  const row=await guardedCoreReader(actor,['attendance.view']).first<{recordedMilliseconds:number;approvedMilliseconds:number;count:number}>(`SELECT coalesce(sum(CASE WHEN s.teaching_status='taught' THEN ${millis('s.actual_start','s.actual_end')} ELSE 0 END),0) AS recordedMilliseconds,coalesce(sum(CASE WHEN s.teaching_status='taught' AND s.attendance_reviewed_at IS NOT NULL THEN ${millis('s.actual_start','s.actual_end')} ELSE 0 END),0) AS approvedMilliseconds,count(*) AS count FROM class_sessions s WHERE ${ss.sql} AND s.status<>'cancelled' AND s.teaching_status<>'pending' AND ${inMonth('coalesce(s.actual_start,s.planned_start)')}`,...ss.args,range.start,range.end);
  teachingSummary={month,recordedMilliseconds:Number(row?.recordedMilliseconds||0),approvedMilliseconds:Number(row?.approvedMilliseconds||0),count:Number(row?.count||0)};
 }
 return{summary,teachingSummary,taskCounts};
}

export async function courseList(actor:Account,params:URLSearchParams){
 const view=text(params.get('view'))||'lessons',mode=text(params.get('mode'))||(view==='reschedules'?'pending':'month'),requestedPage=coursePage(params.get('page')),month=courseMonth(params.get('month')),range=courseRange(params,month),now=new Date().toISOString();
 if(!['lessons','sessions','reschedules'].includes(view)||!['month','pending','review','makeup','originals','records','upcoming','timetable'].includes(mode))throw new CourseQueryError('课程查询无效');
 if(actor.role==='student'&&view==='sessions')throw new CourseQueryError('没有课程考勤查看权限',403);
 const sessionPermission=view==='sessions'&&await hasAdminPermission(actor,'attendance.view')?'attendance.view' as const:'lessons.view' as const;
 const keys=[view==='sessions'?sessionPermission:'lessons.view',...(view==='reschedules'?['reschedules.view']:['pending','review','records'].includes(mode)?['attendance.view']:[])];
 await assertCourseActor(actor,keys);const reader=guardedCoreReader(actor,keys),scope=view==='sessions'?sessionScope(actor):courseLessonScope(actor),alias=view==='sessions'?'s':'l',parts=[scope.sql],args=[...scope.args];
 const teacher=text(params.get('teacher')),student=text(params.get('student')),subject=text(params.get('subject')),classroom=text(params.get('classroomId')),completion=text(params.get('completion'))||'all',sessionType=text(params.get('sessionType'));
 if(sessionType){if(!['one_to_one','group'].includes(sessionType))throw new CourseQueryError('课次类型无效');parts.push("coalesce(s.session_type,'one_to_one')=?");args.push(sessionType);}
 const peoplePartIndexes=new Set<number>(),peopleArgIndexes=new Set<number>();
 if(teacher){peoplePartIndexes.add(parts.length);peopleArgIndexes.add(args.length);parts.push(`${alias}.teacher_name=?`);args.push(teacher);}if(student){peoplePartIndexes.add(parts.length);peopleArgIndexes.add(args.length);parts.push(view==='sessions'?'EXISTS(SELECT 1 FROM class_session_participants selected WHERE selected.group_id=s.group_id AND selected.session_id=s.id AND selected.student_name=?)':'l.student=?');args.push(student);}
 if(subject){parts.push(`${alias}.subject=?`);args.push(subject);}
 const classroomPartIndex=parts.length,classroomArgIndex=args.length;
 if(classroom){parts.push('s.classroom_id=?');args.push(classroom);}
 if(!['all','completed','incomplete'].includes(completion))throw new CourseQueryError('课程完成筛选无效');
 const sessionComplete=`(s.teaching_status='taught' OR s.teaching_status='completed' OR s.teaching_status='pending' AND s.status='completed')`,completed=view==='sessions'?sessionComplete:`CASE WHEN s.session_type='group' THEN ${sessionComplete} ELSE l.status='completed' END`;
 if(completion!=='all'){parts.push(`${completed}=${completion==='completed'?1:0}`);}
 if(view==='reschedules'){
  parts.push(mode==='records'?inMonth('r.requested_at'):"r.status='pending' AND l.status='scheduled'");if(mode==='records')args.push(range.start,range.end);
 }else if(mode==='month'||mode==='timetable'){
  parts.push(courseOverlap(alias));args.push(range.end,range.start);parts.push(`${alias}.status${params.get('cancelled')==='1'?'=':'<>'}'cancelled'`);
 }else if(mode==='pending'){parts.push(view==='sessions'?"s.status<>'cancelled' AND EXISTS(SELECT 1 FROM lessons pending_lesson WHERE pending_lesson.group_id=s.group_id AND pending_lesson.session_id=s.id AND pending_lesson.status='scheduled' AND julianday(pending_lesson.planned_end)<julianday(?))":`l.status='scheduled' AND julianday(l.planned_end)<julianday(?)`);args.push(now);
 }else if(mode==='review'){parts.push(view==='sessions'?"s.status<>'cancelled' AND s.teaching_status<>'pending' AND s.attendance_reviewed_at IS NULL":"l.status IN('completed','student_absent','teacher_absent') AND l.reviewed_at IS NULL");
 }else if(mode==='makeup'){if(view!=='lessons')throw new CourseQueryError('补课查询类型无效');parts.push(`l.status IN('student_absent','teacher_absent') AND coalesce(l.chargeable,0)=0 AND ${noReplacement()}`);
 }else if(mode==='originals'){if(view!=='lessons'||!student||!subject)throw new CourseQueryError('请选择学生与科目查找原课程');parts.push(`l.status IN('student_absent','teacher_absent','cancelled') AND ${noReplacement()}`);
 }else if(mode==='records'){parts.push(view==='sessions'?"s.status<>'cancelled' AND s.teaching_status<>'pending'":"l.status IN('completed','student_absent','teacher_absent')");parts.push(inMonth(view==='sessions'?'coalesce(s.actual_start,s.planned_start)':"CASE WHEN l.status='completed' THEN l.actual_start ELSE l.planned_start END"));args.push(range.start,range.end);
 }else if(mode==='upcoming'){parts.push(`${alias}.status='scheduled' AND julianday(${alias}.planned_start)>=julianday(?)`);args.push(now);}
 const from=view==='sessions'?'FROM class_sessions s':view==='reschedules'?'FROM reschedule_requests r JOIN lessons l ON l.id=r.lesson_id AND l.group_id=r.group_id LEFT JOIN class_sessions s ON s.id=l.session_id AND s.group_id=l.group_id':'FROM lessons l LEFT JOIN class_sessions s ON s.id=l.session_id AND s.group_id=l.group_id';
 if(mode==='timetable'&&(view!=='lessons'||!['teacher','student'].includes(text(params.get('timetableType')))))throw new CourseQueryError('时间表类型无效');
 // Relation options deliberately ignore both selected people, retaining the
 // rest of the actual query context. DISTINCT is before any page LIMIT.
 const pairParts=parts.filter((_,index)=>!peoplePartIndexes.has(index)),pairArgs=args.filter((_,index)=>!peopleArgIndexes.has(index));
 const pairFrom=view==='sessions'?from+' JOIN class_session_participants pair_member ON pair_member.group_id=s.group_id AND pair_member.session_id=s.id':from;
 const historicalPairs=await reader.rows<TeacherStudentPair>(`SELECT DISTINCT ${alias}.teacher_name AS teacher,${view==='sessions'?'pair_member.student_name':'l.student'} AS student ${pairFrom} WHERE ${pairParts.join(' AND ')} ORDER BY teacher,student`,...pairArgs);
 // Current assignments remain selectable even before this month's first
 // course is scheduled. This projection contains names only, independent of
 // subject permissions; an explicitly selected subject/class is still a filter.
 const currentIdentity=identity(actor),personSql=actor.role==='teacher'?' AND p.teacher_name=?':actor.role==='student'?' AND p.student=?':'',classPersonSql=actor.role==='teacher'?' AND c.teacher_name=?':actor.role==='student'?' AND cm.student_name=?':'',personArgs=actor.role==='teacher'?[actor.teacherName]:actor.role==='student'?[actor.studentName]:[];
 const currentPairs=await reader.rows<TeacherStudentPair>(`SELECT DISTINCT teacher,student FROM (
  SELECT p.teacher_name AS teacher,p.student AS student FROM plans p JOIN teachers roster_teacher ON roster_teacher.group_id=p.group_id AND roster_teacher.name=p.teacher_name AND roster_teacher.active=1 JOIN students roster_student ON roster_student.group_id=p.group_id AND roster_student.name=p.student AND roster_student.active=1 WHERE p.group_id=? AND p.active=1${personSql}${subject?' AND p.subject=?':''}${classroom?' AND EXISTS(SELECT 1 FROM classroom_members selected_member JOIN classrooms selected_class ON selected_class.group_id=selected_member.group_id AND selected_class.id=selected_member.classroom_id AND selected_class.archived=0 WHERE selected_member.group_id=p.group_id AND selected_member.classroom_id=? AND selected_member.student_name=p.student AND selected_class.teacher_name=p.teacher_name)':''} AND ${currentIdentity.sql}
  UNION
  SELECT c.teacher_name AS teacher,cm.student_name AS student FROM classrooms c JOIN classroom_members cm ON cm.group_id=c.group_id AND cm.classroom_id=c.id JOIN teachers roster_teacher ON roster_teacher.group_id=c.group_id AND roster_teacher.name=c.teacher_name AND roster_teacher.active=1 JOIN students roster_student ON roster_student.group_id=cm.group_id AND roster_student.name=cm.student_name AND roster_student.active=1 WHERE c.group_id=? AND c.archived=0${classPersonSql}${subject?' AND c.subject=?':''}${classroom?' AND c.id=?':''} AND ${currentIdentity.sql}
 ) ORDER BY teacher,student`,actor.groupId,...personArgs,...subject?[subject]:[],...classroom?[classroom]:[],...currentIdentity.args,actor.groupId,...personArgs,...subject?[subject]:[],...classroom?[classroom]:[],...currentIdentity.args);
 const teacherStudentPairs=[...new Map([...currentPairs,...historicalPairs].map(pair=>[JSON.stringify([pair.teacher,pair.student]),pair])).values()].sort((a,b)=>a.teacher.localeCompare(b.teacher)||a.student.localeCompare(b.student));
 if(params.get('optionsOnly')==='1'){
  await assertCourseActor(actor,keys);
  return{items:[],page:1,pages:1,total:0,pageSize:20 as const,revision:await readRevision(actor.groupId),month,courseRange:{from:range.from,to:range.to},teacherStudentPairs,optionsOnly:true};
 }
 let where=parts.join(' AND '),summary:CourseTimetableSummary|undefined,studentOptions:string[]|undefined;
 if(mode==='timetable'){
  const timetableType=text(params.get('timetableType'));if(view!=='lessons'||!['teacher','student'].includes(timetableType))throw new CourseQueryError('时间表类型无效');
  if(timetableType==='teacher'){const options=await reader.rows<{student:string}>(`SELECT DISTINCT l.student FROM lessons l WHERE ${scope.sql} AND ${courseOverlap('l')} AND l.status<>'cancelled'${teacher?' AND l.teacher_name=?':''} ORDER BY l.student`,...scope.args,range.end,range.start,...teacher?[teacher]:[]);studentOptions=options.map(item=>item.student);}
  if(timetableType==='teacher'){
   // Choose the representative after applying the selected student filter.
   where+=` AND (coalesce(s.session_type,'one_to_one')<>'group' OR l.id=(SELECT min(rep.id) FROM lessons rep WHERE rep.group_id=l.group_id AND rep.session_id=l.session_id AND rep.status<>'cancelled'${student?' AND rep.student=?':''}))`;if(student)args.push(student);
  }
  const checked=timetableType==='teacher'?sessionComplete:"l.status='completed' AND l.actual_start IS NOT NULL AND l.actual_end IS NOT NULL",start=timetableType==='teacher'?"CASE WHEN s.teaching_status='taught' THEN s.actual_start WHEN s.teaching_status='pending' AND l.status='completed' THEN l.actual_start ELSE l.planned_start END":"CASE WHEN l.status='completed' AND l.actual_start IS NOT NULL AND l.actual_end IS NOT NULL THEN l.actual_start ELSE l.planned_start END",end=timetableType==='teacher'?"CASE WHEN s.teaching_status='taught' THEN s.actual_end WHEN s.teaching_status='pending' AND l.status='completed' THEN l.actual_end ELSE l.planned_end END":"CASE WHEN l.status='completed' AND l.actual_start IS NOT NULL AND l.actual_end IS NOT NULL THEN l.actual_end ELSE l.planned_end END";
  const result=await reader.first<CourseTimetableSummary>(`SELECT count(*) AS lessonCount,coalesce(sum(${checked}),0) AS completedCount,coalesce(sum(CASE WHEN ${timetableType==='teacher'?"s.teaching_status IN('not_taught','teacher_absent')":'0'} THEN 0 ELSE ${millis(start,end)} END),0) AS durationMilliseconds ${from} WHERE ${where}`,...args);summary=result||{lessonCount:0,completedCount:0,durationMilliseconds:0};
 }
 const total=Number((await reader.first<{total:number}>(`SELECT count(*) AS total ${from} WHERE ${where}`,...args))?.total||0),order=view==='reschedules'?'r.requested_at DESC,r.id DESC':mode==='records'?`${alias}.planned_start DESC,${alias}.id DESC`:`${alias}.planned_start,${alias}.id`;
 const page=Math.min(requestedPage,Math.max(1,Math.ceil(total/20)));
 let items:unknown[],related:Record<string,unknown>={};
 if(view==='sessions'){
  const optionParts=[...parts],optionArgs=[...args];if(classroom){optionParts.splice(classroomPartIndex,1);optionArgs.splice(classroomArgIndex,1);}
  const classroomOptions=await reader.rows<{id:string;title:string}>(`SELECT s.classroom_id AS id,coalesce(max(c.title),max(s.classroom_title),'') AS title FROM class_sessions s LEFT JOIN classrooms c ON c.group_id=s.group_id AND c.id=s.classroom_id WHERE ${optionParts.join(' AND ')} AND s.classroom_id IS NOT NULL GROUP BY s.classroom_id ORDER BY title,s.classroom_id`,...optionArgs);
  related={classroomOptions};
  const ids=await reader.rows<{id:string}>(`SELECT s.id ${from} WHERE ${where} ORDER BY ${order} LIMIT 20 OFFSET ?`,...args,(page-1)*20),data=await classSessionState(actor,{sessionIds:ids.map(s=>s.id),permissionKey:sessionPermission}),byId=data.byId;items=ids.map(s=>byId.get(s.id)).filter(Boolean);
 }else if(view==='reschedules'){
  const requests=await reader.rows<RequestRow>(`SELECT ${requestColumns} ${from} WHERE ${where} ORDER BY ${order} LIMIT 20 OFFSET ?`,...args,(page-1)*20),lessonRows=requests.length?await reader.rows<Lesson>(`SELECT ${lessonColumns} FROM lessons l WHERE l.id IN(SELECT value FROM json_each(?)) AND ${scope.sql}`,JSON.stringify(requests.map(r=>r.lessonId)),...scope.args):[];
  const lessons=await decorateLessons(actor,lessonRows),data=await classSessionState(actor,{sessionIds:[...new Set(requests.map(r=>r.sessionId).filter((id):id is string=>Boolean(id)))]}),groupIds=new Set(data.sessions.map(s=>s.id));
  items=requests.map(r=>actor.role==='student'?studentRescheduleResponse(r):r);related={lessons,classSessions:actor.role==='student'?data.sessions.map(s=>studentSessionResponse(s,actor.studentName)):data.sessions,proposals:items.filter((_,i)=>!requests[i].sessionId||!groupIds.has(requests[i].sessionId!)),classSessionRequests:actor.role==='student'?[]:requests.filter(r=>r.sessionId&&groupIds.has(r.sessionId))};
 }else{
  const source=await reader.rows<Lesson>(`SELECT ${lessonColumns} ${from} WHERE ${where} ORDER BY ${order} LIMIT 20 OFFSET ?`,...args,(page-1)*20),decorated=await decorateLessons(actor,source);items=mode==='timetable'&&params.get('timetableType')==='teacher'?uniqueSessionLessons(decorated):decorated;
 }
 await assertCourseActor(actor,keys);
 return{items,page,pages:Math.max(1,Math.ceil(total/20)),total,pageSize:20 as const,revision:await readRevision(actor.groupId),month,courseRange:{from:range.from,to:range.to},teacherStudentPairs,...summary?{summary}:{},...studentOptions?{studentOptions}:{},...related};
}
