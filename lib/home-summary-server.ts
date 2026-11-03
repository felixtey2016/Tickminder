import type { Account } from './auth';
import type { HomeLesson, HomeStudyBlock, HomeSummary, HomeNavigationSummary } from './home-summary-types';
import { learningDb } from './learning-server';
import { guardedCoreReader } from './admin-core-permissions';
import { adminPermissionContext, AdminPermissionDenied } from './admin-permission-access';
import { accountSessionPredicate } from './account-session';
import { groupReader, requireGroup } from './group-data';
import { isOwnerAccount } from './owner';
import { classPlanSubjectSql } from './academic-subject-match';
import { courseLessonScope, courseOverlap, CourseQueryError, type CourseTaskCounts } from './course-query';

// Check the original login, role, person binding and selected organisation again
// before returning. A lightweight page must retain the same revocation boundary
// as the course/learning pages, including admins with no readable home cards.
async function assertHomeActor(actor: Account) {
  if (!['admin', 'teacher', 'student'].includes(actor.role)) throw new CourseQueryError('没有主页查看权限', 403);
  const session = accountSessionPredicate(actor);
  const found = await learningDb().prepare(`SELECT 1 FROM accounts a JOIN tuition_groups g ON g.id=? AND (g.active=1 OR ?=1)
    WHERE a.id=? AND a.role=? AND a.email IS ? AND a.teacher_name IS ? AND a.student_name IS ?
    AND (a.group_id=? OR ?=1) AND a.disabled_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM local_credentials c WHERE c.account_id=a.id AND c.must_change_password=1)
    AND NOT(EXISTS(SELECT 1 FROM google_identities gi WHERE gi.account_id=a.id) AND NOT EXISTS(SELECT 1 FROM local_credentials c WHERE c.account_id=a.id))
    AND ${session.sql}`).bind(requireGroup(actor.groupId), isOwnerAccount(actor) ? 1 : 0, actor.id, actor.role, actor.email, actor.teacherName, actor.studentName, actor.groupId, isOwnerAccount(actor) ? 1 : 0, ...session.args).first();
  if (!found) throw new CourseQueryError('账号或权限已改变，请重新登录', 403);
}

export function homeSummary(actor: Account, scope?: 'home'): Promise<HomeSummary>;
export function homeSummary(actor: Account, scope: 'navigation'): Promise<HomeNavigationSummary>;
export async function homeSummary(actor: Account, responseScope: 'home' | 'navigation' = 'home'): Promise<HomeSummary | HomeNavigationSummary> {
  await assertHomeActor(actor);
  const access = await adminPermissionContext(actor);
  const can = (key: 'lessons.view' | 'attendance.view' | 'reschedules.view') => actor.role !== 'admin' || !access.enforced || access.grants.includes(key);
  const canLessons = can('lessons.view'), canAttendance = actor.role !== 'student' && can('attendance.view'), canRequests = can('reschedules.view');
  const now = new Date().toISOString(), date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const start = new Date(Date.parse(date + 'T00:00:00Z') - 8 * 3600000).toISOString();
  const end = new Date(Date.parse(start) + 86400000).toISOString();
  const scope = courseLessonScope(actor), reader = guardedCoreReader(actor, ['lessons.view']);
  const from = 'FROM lessons l LEFT JOIN class_sessions s ON s.group_id=l.group_id AND s.id=l.session_id';
  // This is the display-only allowlist used by LessonPreview. Do not load full
  // attendance/participant records merely to show a title, time and lesson link.
  const status = actor.role === 'student' ? 'l.status' : `CASE ${canAttendance ? "WHEN s.teaching_status IS NOT NULL AND s.teaching_status<>'pending' THEN CASE s.teaching_status WHEN 'taught' THEN 'completed' WHEN 'teacher_absent' THEN 'teacher_absent' ELSE 'student_absent' END" : ''} WHEN s.session_type='group' THEN s.status ELSE l.status END`;
  const columns = `l.id,l.student,l.subject,l.teacher_name AS teacherName,l.planned_start AS plannedStart,l.planned_end AS plannedEnd,
    ${status} AS status,l.session_id AS sessionId,coalesce(s.session_type,'one_to_one') AS sessionType,s.classroom_title AS classroomTitle,
    CASE WHEN s.session_type='group' THEN s.online_link ELSE coalesce(nullif((SELECT p.online_link FROM plans p WHERE p.group_id=l.group_id AND p.student=l.student AND p.subject=l.subject AND p.teacher_name=l.teacher_name LIMIT 1),''),s.online_link) END AS onlineLink`;
  const groupKey = actor.role === 'student' ? 'l.id' : "CASE WHEN s.session_type='group' THEN s.id ELSE l.id END";
  const lessonKeys = canAttendance ? ['lessons.view', 'attendance.view'] : ['lessons.view'];
  const lessonReader = guardedCoreReader(actor, lessonKeys);
  const todayWork = async () => {
    if (!canLessons) return { items: [] as HomeLesson[], total: 0, nextLesson: null as HomeLesson | null };
    // Deduplicate group lessons before LIMIT, so a large first class cannot hide
    // the second/third lesson. COUNT is over the entire authorised day, not 3 rows.
    const found = await lessonReader.rows<HomeLesson & { homeTotal: number }>(`SELECT id,student,subject,teacherName,plannedStart,plannedEnd,status,sessionId,sessionType,classroomTitle,onlineLink,count(*) OVER() AS homeTotal
      FROM (SELECT ${columns},row_number() OVER(PARTITION BY ${groupKey} ORDER BY l.planned_start,l.id) AS position ${from}
      WHERE ${scope.sql} AND ${courseOverlap('l')} AND l.status<>'cancelled') WHERE position=1 ORDER BY plannedStart,id LIMIT 3`, ...scope.args, end, start);
    const items = found.map(({ homeTotal: _, ...lesson }) => lesson);
    const nextLesson = found.length ? null : await lessonReader.first<HomeLesson>(`SELECT ${columns} ${from}
      WHERE ${scope.sql} AND l.status='scheduled' AND julianday(l.planned_start)>=julianday(?) ORDER BY l.planned_start,l.id LIMIT 1`, ...scope.args, now);
    return { items, total: Number(found[0]?.homeTotal || 0), nextLesson };
  };
  const navigationWork = async (): Promise<CourseTaskCounts> => {
    const empty = { lessons: 0, reschedule: 0, overview: 0, attention: 0, pendingAttendance: 0, pendingReview: 0, makeupNeeded: 0, todayLessons: 0, todayPendingAttendance: 0 };
    if (!canLessons && !canAttendance) return empty;
    const attendance = guardedCoreReader(actor, [canLessons ? 'lessons.view' : 'attendance.view', ...canAttendance ? ['attendance.view'] : []]);
    const countKey = "CASE WHEN s.session_type='group' THEN s.id ELSE l.id END";
    // Preserve the navigation's historical counters as well as today's cards.
    // These are aggregate rows, without monthly totals or roster hydration.
    const row = await attendance.first<{ pending: number; review: number; makeup: number; today: number; todayLessons: number }>(`SELECT
      count(DISTINCT CASE WHEN l.status='scheduled' AND julianday(l.planned_end)<julianday(?) THEN ${countKey} END) AS pending,
      count(DISTINCT CASE WHEN l.status IN('completed','student_absent','teacher_absent') AND l.reviewed_at IS NULL THEN ${countKey} END) AS review,
      coalesce(sum(l.status IN('student_absent','teacher_absent') AND coalesce(l.chargeable,0)=0 AND NOT EXISTS(SELECT 1 FROM lessons replacement WHERE replacement.group_id=l.group_id AND replacement.replacement_for=l.id AND replacement.status<>'cancelled')),0) AS makeup,
      count(DISTINCT CASE WHEN l.status='scheduled' AND ${courseOverlap('l')} THEN ${countKey} END) AS today,
      count(DISTINCT CASE WHEN l.status<>'cancelled' AND ${courseOverlap('l')} THEN ${countKey} END) AS todayLessons
      ${from} WHERE ${scope.sql}`, now, end, start, end, start, ...scope.args);
    const incoming = canRequests ? await guardedCoreReader(actor, ['reschedules.view']).first<{total:number}>(`SELECT count(*) AS total FROM reschedule_requests r JOIN lessons l ON l.group_id=r.group_id AND l.id=r.lesson_id WHERE ${scope.sql} AND r.status='pending' AND l.status='scheduled'${actor.role==='admin'?'':' AND r.requested_role<>? AND r.requested_by<>?'}`, ...scope.args, ...actor.role==='admin'?[]:[actor.role,actor.id]) : null;
    const pending=Number(row?.pending||0),review=canAttendance?Number(row?.review||0):0,makeup=canAttendance?Number(row?.makeup||0):0;
    return { lessons: actor.role==='teacher'?pending:0, reschedule: Number(incoming?.total||0), overview: actor.role==='admin'?review:0,
      attention: actor.role==='admin'&&canAttendance?pending+review+makeup:0, pendingAttendance: pending, pendingReview: review, makeupNeeded: makeup,
      todayLessons:canLessons?Number(row?.todayLessons||0):0,todayPendingAttendance:canAttendance?Number(row?.today||0):0 };
  };
  const learningWork = async () => {
    const empty = { homeworkCount: 0, pendingHomeworkCount: 0, nextStudy: null as HomeStudyBlock | null };
    const learning = groupReader(actor.groupId);
    if (actor.role === 'teacher') {
      const count = await learning.first<{ total: number }>('SELECT count(*) AS total FROM homework WHERE owner_id=?', actor.id);
      return { ...empty, homeworkCount: Number(count?.total || 0) };
    }
    if (actor.role !== 'student' || !actor.studentName) return empty;
    // Same active-classroom/plan rule as learningState. Preserve its current
    // treatment of future homework and any submitted attempt; do not invent a
    // different "pending" definition while replacing the list with COUNT.
    const activeClassroom = `(h.classroom_id IS NULL OR EXISTS(SELECT 1 FROM classroom_members cm
      JOIN classrooms c ON c.id=cm.classroom_id
      JOIN plans p ON p.student=cm.student_name AND ${classPlanSubjectSql('p', 'c', 'student')} AND p.teacher_name=c.teacher_name AND p.active=1
      JOIN students student ON student.name=cm.student_name AND student.active=1
      JOIN teachers teacher ON teacher.name=c.teacher_name AND teacher.active=1
      WHERE cm.classroom_id=h.classroom_id AND cm.student_name=?))`;
    const [count, nextStudy] = await Promise.all([
      learning.first<{ total: number; pending: number }>(`SELECT count(*) AS total,coalesce(sum(NOT EXISTS(SELECT 1 FROM homework_submissions sub WHERE sub.homework_id=h.id AND sub.student_name=?)),0) AS pending
        FROM homework h JOIN homework_recipients r ON r.homework_id=h.id WHERE r.student_name=? AND ${activeClassroom}`, actor.studentName, actor.studentName, actor.studentName),
      learning.first<HomeStudyBlock>('SELECT id,title,starts_at AS startsAt,ends_at AS endsAt FROM study_blocks WHERE account_id=? AND julianday(ends_at)>julianday(?) ORDER BY starts_at LIMIT 1', actor.id, now),
    ]);
    return { homeworkCount: Number(count?.total || 0), pendingHomeworkCount: Number(count?.pending || 0), nextStudy };
  };
  const [today, navigationCounts, learning] = await Promise.all([
    responseScope==='home'?todayWork():null, navigationWork(), responseScope==='home'?learningWork():null,
  ]);
  await assertHomeActor(actor);
  if (JSON.stringify(access) !== JSON.stringify(await adminPermissionContext(actor))) throw new AdminPermissionDenied();
  // Recheck every grant used by a result, including revocation after the last
  // individual SQL statement. No cross-request permission cache is introduced.
  if (canLessons) await reader.first('SELECT 1');
  if (canAttendance) await guardedCoreReader(actor, ['attendance.view']).first('SELECT 1');
  if ((canLessons || canAttendance) && canRequests) await guardedCoreReader(actor, ['reschedules.view']).first('SELECT 1');
  if (!today || !learning) return { accountId: actor.id, groupId: requireGroup(actor.groupId), navigationCounts };
  return { accountId: actor.id, groupId: requireGroup(actor.groupId), today: { date, total: today.total, items: today.items }, nextLesson: today.nextLesson,
    taskCounts: { todayLessons: today.total, todayPendingAttendance:navigationCounts.todayPendingAttendance, attention:navigationCounts.attention }, navigationCounts, learning };
}
