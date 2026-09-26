import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { currentAccount } from "@/lib/auth";
import { readRoster } from "@/lib/roster";
import { getDb } from "@/db";
import { accounts, audit, lessons, localCredentials, rescheduleRequests } from "@/db/schema";
import { approvedActualHours, approvedHoursInMonth, checkinInMonth, currentMalaysiaMonth, inMonth } from "@/lib/lesson-rules";
import { teacherMaySeeLesson } from "@/lib/access";
import { readRevision } from "@/lib/revision";

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

export async function GET(request: Request) {
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const credential = await getDb().select({ mustChangePassword: localCredentials.mustChangePassword }).from(localCredentials).where(eq(localCredentials.accountId, account.id)).get();
  if (credential?.mustChangePassword) return NextResponse.json({ error: "请先修改初始密码" }, { status: 403 });
  if (account.role === "pending") return NextResponse.json({ account: { name: account.name, email: account.email, role: "pending" } });
  const selected = new URL(request.url).searchParams.get("month") || currentMalaysiaMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)) return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  try {
    const revision = await readRevision();
    const roster = await readRoster();
    const db = getDb();
    const allLessons = await db.select().from(lessons).all();
    const allRequests = await db.select().from(rescheduleRequests).all();
    if (account.role === "student") {
      const visible = allLessons.filter(l => l.student === account.studentName && l.status !== "cancelled");
      const lessonIds = new Set(visible.map(l => l.id));
      const proposals = allRequests.filter(r => lessonIds.has(r.lessonId));
      return NextResponse.json({ revision, account: { id: account.id, name: account.name, role: "student", studentName: account.studentName }, lessons: visible, proposals, month: selected });
    }
    if (account.role === "teacher") {
      const plans = roster.plans.filter(p => p.teacher === account.teacherName);
      const active = new Set(plans.map(p => p.key));
      const visible = allLessons.filter(l => teacherMaySeeLesson(account, l, active));
      const records = visible.filter(l => l.actualStart && inMonth(l.actualStart, selected) && approvedActualHours(l) > 0).sort((a, b) => a.actualStart!.localeCompare(b.actualStart!));
      const checkins = visible.filter(l => checkinInMonth(l, selected)).sort((a, b) => (a.actualStart || a.plannedStart).localeCompare(b.actualStart || b.plannedStart));
      const lessonIds = new Set(visible.map(l => l.id));
      return NextResponse.json({ revision, account: { id: account.id, name: account.name, role: account.role, teacherName: account.teacherName }, plans, lessons: visible, proposals: allRequests.filter(r => lessonIds.has(r.lessonId)), month: selected, summary: monthlySummary(plans, visible, selected), records, checkins });
    }
    const summaryPlans = roster.allPlans.map(p => ({ key: p.key, student: p.student, subject: p.subject }));
    const records = allLessons.filter(l => l.actualStart && inMonth(l.actualStart, selected) && approvedActualHours(l) > 0).sort((a, b) => a.actualStart!.localeCompare(b.actualStart!));
    const checkins = allLessons.filter(l => checkinInMonth(l, selected)).sort((a, b) => (a.actualStart || a.plannedStart).localeCompare(b.actualStart || b.plannedStart));
    const users = await db.select().from(accounts).all();
    const credentials = await db.select({ accountId: localCredentials.accountId, username: localCredentials.username, mustChangePassword: localCredentials.mustChangePassword }).from(localCredentials).all();
    const changes = await db.select().from(audit).orderBy(desc(audit.at)).limit(30).all();
    return NextResponse.json({ revision, account: { id: account.id, name: account.name, role: account.role }, plans: roster.plans, allPlans: roster.allPlans, students: roster.students, allStudents: roster.allStudents, teachers: roster.teachers, allTeachers: roster.allTeachers, lessons: allLessons, proposals: allRequests, month: selected, summary: monthlySummary(summaryPlans, allLessons, selected), records, checkins, users: users.map(u => ({ ...u, username: credentials.find(c => c.accountId === u.id)?.username || null, mustChangePassword: credentials.find(c => c.accountId === u.id)?.mustChangePassword || false })), activity: changes.map(c => ({ ...c, actorName: users.find(u => u.id === c.actorId)?.name || c.actorId, lessonName: (() => { const lesson = allLessons.find(l => l.id === c.lessonId); return lesson ? `${lesson.student} · ${lesson.subject}` : c.lessonId; })() })) });
  } catch (error) {
    return NextResponse.json({ account: { name: account.name, role: account.role }, error: error instanceof Error ? error.message : "Data unavailable" }, { status: 503 });
  }
}
