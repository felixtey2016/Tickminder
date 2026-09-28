import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { currentAccount } from "@/lib/auth";
import { getDb } from "@/db";
import { accounts, audit, lessons, rescheduleRequests } from "@/db/schema";
import { readRoster } from "@/lib/roster";
import { teacherMaySeeLesson } from "@/lib/access";

const bad = (error: string, status: number) => NextResponse.json({ error }, { status });
type TimePair = { plannedStart?: unknown; plannedEnd?: unknown };

export async function GET(request: Request) {
  const actor = await currentAccount();
  if (!actor) return bad("Sign in required", 401);
  const id = new URL(request.url).searchParams.get("lessonId") || "";
  if (!id) return bad("Choose a lesson", 400);
  const db = getDb();
  const lesson = await db.select().from(lessons).where(eq(lessons.id, id)).get();
  if (!lesson) return bad("Lesson not found", 404);
  if (actor.role === "student" && actor.studentName !== lesson.student) return bad("You cannot view this lesson", 403);
  if (actor.role === "teacher") {
    const roster = await readRoster();
    const active = new Set(roster.plans.filter(p => p.teacher === actor.teacherName).map(p => p.key));
    if (!teacherMaySeeLesson(actor, lesson, active)) return bad("You cannot view this lesson", 403);
  }
  if (!["admin", "student", "teacher"].includes(actor.role)) return bad("You cannot view this lesson", 403);

  const [requests, changes] = await Promise.all([
    db.select().from(rescheduleRequests).where(eq(rescheduleRequests.lessonId, id)).all(),
    db.select().from(audit).where(eq(audit.lessonId, id)).all(),
  ]);
  const relevant = changes.filter(change => change.action === "reschedule");
  const actorIds = new Set([...requests.flatMap(row => [row.requestedBy, row.respondedBy]), ...relevant.map(row => row.actorId)].filter(Boolean));
  const names = new Map((await db.select({ id: accounts.id, name: accounts.name }).from(accounts).all())
    .filter(row => actorIds.has(row.id)).map(row => [row.id, row.name]));
  const nameOf = (accountId: string | null) => accountId ? names.get(accountId) || "已删除账号" : null;
  const entries = [
    ...requests.map(row => ({
      id: row.id, type: "request", originalStart: row.originalStart, originalEnd: row.originalEnd,
      proposedStart: row.proposedStart, proposedEnd: row.proposedEnd, status: row.status,
      requestedBy: nameOf(row.requestedBy), requestedAt: row.requestedAt,
      respondedBy: nameOf(row.respondedBy), respondedAt: row.respondedAt,
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
          requestedBy: nameOf(change.actorId), requestedAt: change.at, respondedBy: null, respondedAt: null,
        }];
      } catch { return []; }
    }),
  ].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt) || b.id.localeCompare(a.id));
  return NextResponse.json({ currentStart: lesson.plannedStart, currentEnd: lesson.plannedEnd, entries });
}
