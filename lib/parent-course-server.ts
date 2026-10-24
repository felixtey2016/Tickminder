import type {Account} from './auth';
import {learningDb} from './learning-server';
import {parentIdentity,selectedChild} from './parents-server';
import {parentLessonOverlap,parentLessonRange} from './parent-calendar';
import {ParentsError,parentMonth,parentPage,parentText,type ParentChild,type ParentCalendarDay,type ParentCourseLesson,type ParentCourseStatus,type ParentPage} from './parents';

/** One relational scope covers every linked child, including children beyond picker page one. */
export function parentLinkedChildren(actor:Account){
 const identity=parentIdentity(actor);
 return{sql:`SELECT b.id AS studentId,b.student_name AS student,l.id AS linkId,l.revision AS linkRevision,s.grade,s.syllabus_id AS syllabusId,cast((row_number() OVER(ORDER BY b.student_name,b.id)-1)/20 AS INTEGER)+1 AS childPage FROM parent_child_links l JOIN billing_students b ON b.group_id=l.group_id AND b.id=l.student_id JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name WHERE l.group_id=? AND l.parent_account_id=? AND l.active=1 AND s.active=1 AND ${identity.sql}`,args:[actor.groupId,actor.id,...identity.args]};
}
export const parentFinancialChildSql=`EXISTS(SELECT 1 FROM parent_financial_access access WHERE access.group_id=? AND access.parent_account_id=? AND access.student_id=ch.studentId AND access.link_id=ch.linkId AND access.active=1 AND access.link_revision=ch.linkRevision)`;
type ScopeSnapshot={children:string;finances:string;total:number};
async function scopeSnapshot(actor:Account):Promise<ScopeSnapshot>{
 const identity=parentIdentity(actor),linked=parentLinkedChildren(actor);
 const row=await learningDb().prepare(`WITH linked_children AS (${linked.sql}) SELECT
  (SELECT json_group_array(json_object('id',studentId,'student',student,'linkId',linkId,'revision',linkRevision)) FROM (SELECT * FROM linked_children ORDER BY studentId)) AS children,
  (SELECT json_group_array(json_object('id',id,'studentId',student_id,'revision',revision,'linkRevision',link_revision)) FROM (SELECT f.id,f.student_id,f.revision,f.link_revision FROM parent_financial_access f JOIN linked_children ch ON ch.studentId=f.student_id AND ch.linkId=f.link_id AND ch.linkRevision=f.link_revision WHERE f.group_id=? AND f.parent_account_id=? AND f.active=1 ORDER BY f.id)) AS finances,
  (SELECT count(*) FROM linked_children) AS total WHERE ${identity.sql}`).bind(...linked.args,actor.groupId,actor.id,...identity.args).first<ScopeSnapshot>();
 if(!row)throw new ParentsError('家长权限已改变，请重新登录',403);
 return row;
}
export async function captureParentScope(actor:Account){
 const snapshot=await scopeSnapshot(actor);
 return{totalChildren:snapshot.total,recheck:async()=>{
  const current=await scopeSnapshot(actor);
  if(snapshot.children!==current.children||snapshot.finances!==current.finances)throw new ParentsError('孩子关联或财务授权已改变，请刷新后重试',403);
 }};
}
export function parentCourseStatus(value:unknown):ParentCourseStatus{
 const status=parentText(value)||'all';
 if(!['all','upcoming','completed','absent','cancelled'].includes(status))throw new ParentsError('课程状态筛选无效');
 return status as ParentCourseStatus;
}
export const parentCourseCategory=`CASE WHEN l.status='cancelled' THEN 'cancelled' WHEN l.status IN ('student_absent','teacher_absent','absent','not_taught') OR p.attendance_status='absent' THEN 'absent' WHEN l.status='completed' THEN 'completed' ELSE 'upcoming' END`;
const courseFrom=`FROM lessons l JOIN linked_children ch ON ch.student=l.student LEFT JOIN class_sessions cs ON cs.id=l.session_id AND cs.group_id=l.group_id LEFT JOIN classrooms c ON c.id=cs.classroom_id AND c.group_id=l.group_id LEFT JOIN class_session_participants p ON p.lesson_id=l.id AND p.group_id=l.group_id AND p.student_name=l.student`;
const courseSelect=`l.id,ch.studentId,ch.student,ch.childPage,l.subject,l.teacher_name AS teacherName,c.title AS classroomTitle,l.planned_start AS plannedStart,l.planned_end AS plannedEnd,l.status,coalesce(p.attendance_status,'pending') AS attendanceStatus,p.arrived_at AS arrivedAt,p.left_at AS leftAt`;

export async function parentCoursePage(actor:Account,params:URLSearchParams,extraWhere='1',extraArgs:unknown[]=[]):Promise<ParentPage<ParentCourseLesson>>{
 const linked=parentLinkedChildren(actor),range=parentLessonRange(params),selection=parentText(params.get('studentId'))||'all',status=parentCourseStatus(params.get('status')),page=parentPage(params.get('page'));
 const where=`l.group_id=? AND ${parentLessonOverlap('?','?')} AND (?='all' OR ch.studentId=?) AND (?='all' OR (${parentCourseCategory})=?) AND (${extraWhere})`,args=[...linked.args,actor.groupId,range.end,range.start,selection,selection,status,status,...extraArgs];
 const total=(await learningDb().prepare(`WITH linked_children AS (${linked.sql}) SELECT count(*) AS total ${courseFrom} WHERE ${where}`).bind(...args).first<{total:number}>())?.total||0;
 const items=(await learningDb().prepare(`WITH linked_children AS (${linked.sql}) SELECT ${courseSelect} ${courseFrom} WHERE ${where} ORDER BY julianday(l.planned_start),ch.student,l.id LIMIT 20 OFFSET ?`).bind(...args,(page-1)*20).all<ParentCourseLesson>()).results||[];
 return{items,page,pages:Math.max(1,Math.ceil(total/20)),total,pageSize:20};
}
export async function parentNextCourse(actor:Account,start:string):Promise<ParentCourseLesson|null>{
 const linked=parentLinkedChildren(actor);
 return learningDb().prepare(`WITH linked_children AS (${linked.sql}) SELECT ${courseSelect} ${courseFrom} WHERE l.group_id=? AND julianday(l.planned_start)>=julianday(?) AND (${parentCourseCategory})='upcoming' ORDER BY julianday(l.planned_start),ch.student,l.id LIMIT 1`).bind(...linked.args,actor.groupId,start).first<ParentCourseLesson>();
}
export async function parentCourseView(actor:Account,params:URLSearchParams){
 const snapshot=await captureParentScope(actor),selection=parentText(params.get('studentId'))||'all',status=parentCourseStatus(params.get('status')),month=parentMonth(params.get('month'));
 const child:ParentChild|null=selection==='all'?null:await selectedChild(actor,selection),view=parentText(params.get('view'));
 if(view==='lessons'){
  const range=parentLessonRange(params),page=await parentCoursePage(actor,params);
  await snapshot.recheck();return{child,selection,totalChildren:snapshot.totalChildren,status,month,...range.date?{date:range.date}:{},...page};
 }
 if(view!=='calendar')throw new ParentsError('家长课程页面不存在',404);
 const range=parentLessonRange(new URLSearchParams({month})),linked=parentLinkedChildren(actor);
 const days=(await learningDb().prepare(`WITH RECURSIVE linked_children AS (${linked.sql}),calendar_days(date) AS (
  SELECT ? UNION ALL SELECT date(date,'+1 day') FROM calendar_days WHERE date<?
 ),selected_lessons AS (
  SELECT l.id,l.planned_start,l.planned_end,(${parentCourseCategory}) AS category ${courseFrom}
  WHERE l.group_id=? AND ${parentLessonOverlap('?','?')} AND (?='all' OR ch.studentId=?) AND (?='all' OR (${parentCourseCategory})=?)
 ) SELECT day.date,count(l.id) AS total,coalesce(sum(l.category='upcoming'),0) AS scheduled,coalesce(sum(l.category='completed'),0) AS completed,coalesce(sum(l.category='absent'),0) AS absent,coalesce(sum(l.category='cancelled'),0) AS cancelled
 FROM calendar_days day LEFT JOIN selected_lessons l ON ${parentLessonOverlap("datetime(day.date,'-8 hours')","datetime(day.date,'+1 day','-8 hours')")}
 GROUP BY day.date ORDER BY day.date`).bind(...linked.args,range.firstDate,range.lastDate,actor.groupId,range.end,range.start,selection,selection,status,status).all<ParentCalendarDay>()).results||[];
 await snapshot.recheck();return{child,selection,totalChildren:snapshot.totalChildren,status,month,days};
}
