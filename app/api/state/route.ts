import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { currentBusinessAccount as currentAccount, type Account } from "@/lib/auth";
import { lifecycleView } from "@/lib/account-lifecycle";
import { readRoster } from "@/lib/roster";
import { getDb } from "@/db";
import { accounts, audit, lessons, localCredentials, rescheduleRequests } from "@/db/schema";
import { approvedActualHours, approvedHoursInMonth, checkinInMonth, currentMalaysiaMonth, inMonth } from "@/lib/lesson-rules";
import { teacherMaySeeLesson } from "@/lib/access";
import { readRevision } from "@/lib/revision";
import { learningState, rows } from "@/lib/learning-server";
import { mergedAccountNames } from "@/lib/merged-account-names";
import { classroomsState } from "@/lib/classrooms-server";

function monthlySummary(plans: Array<{ key: string; student: string; subject: string }>, rows: Array<typeof lessons.$inferSelect>, month: string) {
  const now = new Date().toISOString();
  return plans.map(p => {
    const items = rows.filter(l => l.student === p.student && l.subject === p.subject);
    const completed = items.filter(l => l.actualStart && inMonth(l.actualStart, month));
    const planned = items.filter(l => inMonth(l.plannedStart, month));
    return {
      key: p.key,
      completed: Number(completed.reduce((sum, l) => sum + approvedHoursInMonth(l, month), 0).toFixed(2)),
      lessons: completed.filter(l => approvedActualHours(l) > 0).length,
      upcoming: Number(planned.filter(l => l.status === "scheduled" && l.plannedStart > now).reduce((sum, l) => sum + (Date.parse(l.plannedEnd) - Date.parse(l.plannedStart)) / 3600000, 0).toFixed(2)),
      pending: planned.filter(l => l.status !== "cancelled" && !l.reviewedAt && l.plannedStart <= now).length,
      makeupNeeded: planned.filter(l => ["student_absent", "teacher_absent"].includes(l.status) && !rows.some(x => x.replacementFor === l.id && x.status !== "cancelled")).length,
    };
  });
}

type Scope = "core" | "learning" | "classrooms" | "accounts" | "activity";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function coreState(account: Account, selected: string) {
  const db = getDb();
  const lessonFilter = account.role === "teacher" ? eq(lessons.teacherName, account.teacherName || "") : account.role === "student" ? eq(lessons.student, account.studentName || "") : undefined;
  const [revision, roster, allLessons, allRequests] = await Promise.all([
    readRevision(), readRoster(account), db.select().from(lessons).where(lessonFilter).all(),
    lessonFilter ? db.select({request: rescheduleRequests}).from(rescheduleRequests).innerJoin(lessons, eq(lessons.id, rescheduleRequests.lessonId)).where(lessonFilter).all().then(items => items.map(item => item.request)) : db.select().from(rescheduleRequests).all(),
  ]);
  const linkByPlan = new Map(roster.allPlans.map(plan => [plan.key, plan]));
  const withOnlineLink = (lesson: typeof lessons.$inferSelect) => {
    const plan = linkByPlan.get(`${lesson.student}|${lesson.subject}`);
    return { ...lesson, onlineLink: plan?.teacherName === lesson.teacherName ? plan.onlineLink : null };
  };
  const base = { revision, month: selected };
  if (account.role === "student") {
    const visible = allLessons.filter(l => l.status !== "cancelled");
    const ids = new Set(visible.map(l => l.id));
    return {...base, lessons: visible.map(withOnlineLink), proposals: allRequests.filter(r => ids.has(r.lessonId))};
  }
  const plans = roster.plans.filter(p => p.teacher === account.teacherName);
  const keys = new Set(plans.map(p => p.key));
  const visible = account.role === "teacher" ? allLessons.filter(l => teacherMaySeeLesson(account, l, keys)) : allLessons;
  const ids = new Set(visible.map(l => l.id));
  const records = visible.filter(l => l.actualStart && inMonth(l.actualStart, selected) && approvedActualHours(l) > 0).sort((a,b) => a.actualStart!.localeCompare(b.actualStart!));
  const checkins = visible.filter(l => checkinInMonth(l, selected)).sort((a,b) => (a.actualStart || a.plannedStart).localeCompare(b.actualStart || b.plannedStart));
  if (account.role === "teacher") return {...base, plans, lessons: visible.map(withOnlineLink), proposals: allRequests.filter(r => ids.has(r.lessonId)), records, checkins, summary: monthlySummary(plans, visible, selected)};
  return {...base, plans: roster.plans, allPlans: roster.allPlans, students: roster.students, allStudents: roster.allStudents, teachers: roster.teachers, allTeachers: roster.allTeachers,
    lessons: visible.map(withOnlineLink), proposals: allRequests, records, checkins, summary: monthlySummary(roster.allPlans, visible, selected)};
}

async function extraState(account: Account, scope: Exclude<Scope, "core">) {
  if (scope === "learning") return { learning: await learningState(account) };
  if (scope === "classrooms") {
    const [classrooms, terms] = await Promise.all([classroomsState(account), rows("SELECT id,name,is_current AS isCurrent FROM academic_terms ORDER BY created_at DESC")]);
    return {classrooms, terms};
  }
  const db = getDb();
  const users = await db.select().from(accounts).all();
  if (scope === "accounts") {
    const credentials = await db.select({ accountId: localCredentials.accountId, username: localCredentials.username, mustChangePassword: localCredentials.mustChangePassword }).from(localCredentials).all();
    const byId = new Map(credentials.map(c => [c.accountId, c]));
    return {users: users.map(u => ({...u, ...lifecycleView(u), username: byId.get(u.id)?.username || null, mustChangePassword: byId.get(u.id)?.mustChangePassword || false}))};
  }
  const [changes, mergedNames] = await Promise.all([db.select().from(audit).orderBy(desc(audit.at)).limit(30).all(), mergedAccountNames()]);
  const changedLessons = changes.length ? await db.select({id: lessons.id, student: lessons.student, subject: lessons.subject}).from(lessons).where(inArray(lessons.id, changes.map(c => c.lessonId))).all() : [];
  const byId = new Map(changedLessons.map(l => [l.id, `${l.student} · ${l.subject}`]));
  return {activity: changes.map(c => ({...c, actorName: users.find(u => u.id === c.actorId)?.name || mergedNames.get(c.actorId) || c.actorId, lessonName: byId.get(c.lessonId) || c.lessonId}))};
}

export async function GET(request: Request) {
  const account = await currentAccount();
  if (!account) return json({error: "Sign in required"}, 401);
  const url = new URL(request.url), selected = url.searchParams.get("month") || currentMalaysiaMonth();
  const scope = url.searchParams.get("scope");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)) return json({error: "Invalid month"}, 400);
  if (scope && !["core","learning","classrooms","accounts","activity"].includes(scope)) return json({error: "请求无效，请刷新后重试"}, 400);
  if ((scope === "accounts" || scope === "activity") && account.role !== "admin") return json({error: "没有权限执行此操作"}, 403);
  const identity = {id: account.id, name: account.name, email: account.email, role: account.role, teacherName: account.teacherName, studentName: account.studentName};
  if (account.role === "pending") return json({account: {...identity, ...lifecycleView(account)}, lessons:[], classrooms:[], proposals:[], loadedScopes: ["core"]});
  try {
    // No scope preserves the existing full response for compatible clients.
    const scopes: Scope[] = scope ? [scope as Scope] : account.role === "admin" ? ["core","classrooms","accounts","activity"] : ["core","learning","classrooms"];
    const parts = await Promise.all(scopes.map(s => s === "core" ? coreState(account, selected) : extraState(account, s)));
    return json(Object.assign({account: identity, loadedScopes: scopes}, ...parts));
  } catch {
    return json({error: "资料暂时无法载入，请稍后刷新"}, 503);
  }
}
