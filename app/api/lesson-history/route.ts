import {groupReader} from "@/lib/group-data";
import { groupWhere } from "@/lib/group-data";
import { NextResponse } from "next/server";
import { and,or,eq,inArray } from "drizzle-orm";
import { currentBusinessAccount as currentAccount } from "@/lib/auth";
import { getDb } from "@/db";
import { accounts, audit, lessons, rescheduleRequests } from "@/db/schema";
import { readRoster } from "@/lib/roster";
import { teacherMaySeeLesson } from "@/lib/access";
import { mergedAccountNames } from "@/lib/merged-account-names";
import {studentAttendanceSnapshot} from "@/lib/student-course-response";
import {requireCorePermissions,guardedCoreReader} from '@/lib/admin-core-permissions';
import {adminPermissionFailure,adminPermissionReadCondition,hasAdminPermission} from '@/lib/admin-permission-access';

const responseHeaders = { "Cache-Control": "private, no-store" };
const bad = (error: string, status: number) => NextResponse.json({ error }, { status, headers: responseHeaders });
type TimePair = { plannedStart?: unknown; plannedEnd?: unknown };

export async function GET(request: Request) {
  const actor = await currentAccount();
  if (!actor) return bad("Sign in required", 401);
  try{
  await requireCorePermissions(actor,['lessons.view']);
  const showReschedules=actor.role!=='admin'||await hasAdminPermission(actor,'reschedules.view'),showAttendance=actor.role!=='admin'||await hasAdminPermission(actor,'attendance.view');
  const id = new URL(request.url).searchParams.get("lessonId") || "";
  if (!id) return bad("Choose a lesson", 400);
  const db = getDb();
  const lesson = await db.select().from(lessons).where(and(groupWhere(lessons,actor.groupId,eq(lessons.id, id)),adminPermissionReadCondition(actor,'lessons.view'))).get();
  if (!lesson) return bad("Lesson not found", 404);
  if (actor.role === "student" && actor.studentName !== lesson.student) return bad("You cannot view this lesson", 403);
  if (actor.role === "teacher") {
    const roster = await readRoster(actor);
    const active = new Set(roster.plans.filter(p => p.teacher === actor.teacherName).map(p => p.key));
    if (!teacherMaySeeLesson(actor, lesson, active)&&!await groupReader(actor.groupId).first("SELECT 1 FROM class_sessions WHERE id=? AND session_type='group' AND teacher_name=?",lesson.sessionId,actor.teacherName)) return bad("You cannot view this lesson", 403);
  }
  if (!["admin", "student", "teacher"].includes(actor.role)) return bad("You cannot view this lesson", 403);

  const [requests, changes] = await Promise.all([
    showReschedules?guardedCoreReader(actor,['reschedules.view']).rows<typeof rescheduleRequests.$inferSelect>("SELECT id,original_start AS originalStart,original_end AS originalEnd,proposed_start AS proposedStart,proposed_end AS proposedEnd,status,note,requested_role AS requestedRole,requested_by AS requestedBy,requested_at AS requestedAt,responded_by AS respondedBy,responded_at AS respondedAt FROM reschedule_requests WHERE lesson_id=? OR (session_id=? AND EXISTS(SELECT 1 FROM class_sessions WHERE id=? AND session_type='group'))",id,lesson.sessionId,lesson.sessionId):[],
    db.select().from(audit).where(and(groupWhere(audit,actor.groupId,eq(audit.lessonId,id)),or(and(eq(audit.action,'reschedule'),adminPermissionReadCondition(actor,'reschedules.view')),and(inArray(audit.action,['saveSessionAttendance','reviewSessionAttendance','attendance','review']),adminPermissionReadCondition(actor,'attendance.view'))))).all(),
  ]);
  const relevant = showReschedules?changes.filter(change => change.action === "reschedule"):[];
  const actorIds = new Set([...requests.flatMap(row => [row.requestedBy, row.respondedBy]), ...changes.map(row => row.actorId)].filter(Boolean));
  const studentView = actor.role === "student";
  const names = new Map((studentView ? [] : await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(groupWhere(accounts,actor.groupId)).all())
    .filter(row => actorIds.has(row.id)).map(row => [row.id, row.name]));
  const mergedNames = studentView ? new Map<string,string>() : await mergedAccountNames(actor.groupId);
  const nameOf = (accountId: string | null) => accountId ? names.get(accountId) || mergedNames.get(accountId) || "已删除账号" : null;
  const entries = [
    ...requests.map(row => ({
      id: row.id, type: "request", originalStart: row.originalStart, originalEnd: row.originalEnd,
      proposedStart: row.proposedStart, proposedEnd: row.proposedEnd, status: row.status,
      requestedBy: studentView ? row.requestedBy===actor.id ? actor.name : row.requestedRole==="teacher" ? lesson.teacherName : null : nameOf(row.requestedBy), requestedAt: row.requestedAt,
      respondedBy: studentView ? null : nameOf(row.respondedBy), respondedAt: row.respondedAt,
      note: row.note,
    })),
    ...relevant.flatMap(change => {
      try {
        const before = JSON.parse(change.before || "{}") as TimePair;
        const after = JSON.parse(change.after || "{}") as TimePair;
        if (typeof before.plannedStart !== "string" || typeof before.plannedEnd !== "string" ||
            typeof after.plannedStart !== "string" || typeof after.plannedEnd !== "string") return [];
        return [{
          id: change.id, type: "direct", originalStart: before.plannedStart, originalEnd: before.plannedEnd,
          proposedStart: after.plannedStart, proposedEnd: after.plannedEnd, status: "applied",
          requestedBy: studentView ? null : nameOf(change.actorId), requestedAt: change.at, respondedBy: null, respondedAt: null,
        }];
      } catch { return []; }
    }),
  ].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt) || b.id.localeCompare(a.id));
  const attendanceEntries=(showAttendance?changes:[]).filter(c=>['saveSessionAttendance','reviewSessionAttendance','attendance','review'].includes(c.action)).map(c=>{let before:unknown={},after:unknown={};try{before=JSON.parse(c.before||'{}');after=JSON.parse(c.after||'{}');}catch{}return studentView ? {id:c.id,action:c.action,at:c.at,before:studentAttendanceSnapshot(before),after:studentAttendanceSnapshot(after)} : {id:c.id,action:c.action,at:c.at,actor:nameOf(c.actorId),before,after};}).sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id));
  return NextResponse.json({studentView,attendanceEntries, currentStart: lesson.plannedStart, currentEnd: lesson.plannedEnd, entries }, {headers:responseHeaders});
  }catch(error){const permission=adminPermissionFailure(error);return bad(permission?.error||'课程历史暂时无法加载',permission?.status||503);}
}
