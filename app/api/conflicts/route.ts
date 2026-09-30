import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { currentAccount } from "@/lib/auth";
import { getDb } from "@/db";
import { lessons } from "@/db/schema";
import { readRoster } from "@/lib/roster";
import { teacherMaySeeLesson, mayRequestReschedule } from "@/lib/access";
import { findLessonConflict, generateWeekly, hoursBetween, lessonConflictReason, type LessonSlot } from "@/lib/lesson-rules";

type Body = Record<string, unknown>;
const str = (value: unknown) => typeof value === "string" ? value.trim() : "";
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const malaysiaIso = (value: unknown) => {
  const text = str(value);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(text)) throw new Error("Enter a Malaysia date and time");
  const parsed = new Date(`${text}:00+08:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error("Invalid date and time");
  return parsed.toISOString();
};

// Preview only. The write route repeats the same overlap check immediately before saving.
export async function POST(request: Request) {
  if (new URL(request.url).origin !== request.headers.get("origin")) return bad("Origin mismatch", 403);
  const actor = await currentAccount();
  if (!actor) return bad("Sign in required", 401);
  let body: Body;
  try { body = await request.json(); } catch { return bad("Invalid request"); }
  const action = str(body.action);
  if (!["create", "edit", "proposeReschedule"].includes(action)) return bad("Invalid conflict check");
  if (actor.role !== "admin" && !(actor.role === "teacher" && ["create", "proposeReschedule"].includes(action)) && !(actor.role === "student" && action === "proposeReschedule")) return bad("No permission to check this schedule", 403);
  const db = getDb();
  try {
    const start = malaysiaIso(body.start), end = malaysiaIso(body.end);
    hoursBetween(start, end);
    const existing = await db.select().from(lessons).all();
    let slots: LessonSlot[] = [];
    let others = existing;
    if (action === "create") {
      const roster = await readRoster();
      const student = str(body.student), subject = str(body.subject), teacherName = str(body.teacherName);
      if (!roster.plans.some(p => p.student === student && p.subject === subject && p.teacher === teacherName)) return bad("Choose an active student subject and assigned teacher");
      const activeKeys = new Set(roster.plans.filter(p => p.teacher === actor.teacherName).map(p => p.key));
      if (actor.role === "teacher" && !teacherMaySeeLesson(actor, { student, subject, teacherName }, activeKeys)) return bad("Student is no longer active or assigned", 403);
      const until = str(body.until);
      const dates = until ? generateWeekly(start, end, malaysiaIso(`${until}T23:59`)) : [{ start, end }];
      slots = dates.map(date => ({ student, teacherName, plannedStart: date.start, plannedEnd: date.end }));
    } else {
      const id = str(body.id);
      const lesson = existing.find(row => row.id === id);
      if (!lesson) return bad("Lesson not found", 404);
      if (action === "proposeReschedule") {
        const roster = await readRoster();
        if (!mayRequestReschedule(actor, lesson, roster.plans)) return bad("No permission to check this lesson", 403);
        slots = [{ ...lesson, plannedStart: start, plannedEnd: end }];
        others = existing.filter(row => row.id !== id);
      } else {
        const future = body.scope === "future";
        if (future && !lesson.seriesId) return bad("This lesson is not recurring");
        const targets = future ? existing.filter(row => row.seriesId === lesson.seriesId && row.plannedStart >= lesson.plannedStart && !row.reviewedAt) : [lesson];
        if (!targets.length) return bad("No editable lessons");
        const ids = new Set(targets.map(row => row.id));
        const shift = Date.parse(start) - Date.parse(lesson.plannedStart);
        slots = targets.map(row => ({ ...row, plannedStart: new Date(Date.parse(row.plannedStart) + shift).toISOString(),
          plannedEnd: future ? new Date(Date.parse(row.plannedStart) + shift + Date.parse(end) - Date.parse(start)).toISOString() : end }));
        others = existing.filter(row => !ids.has(row.id));
      }
    }
    for (const [index, slot] of slots.entries()) {
      const conflict = findLessonConflict(slot, [...others, ...slots.filter((_, i) => i !== index)]);
      if (!conflict) continue;
      const detail = { start: conflict.plannedStart, end: conflict.plannedEnd,
        reason: lessonConflictReason(slot, conflict),
        ...(actor.role === "admin" ? { student: conflict.student, teacherName: conflict.teacherName } : {}) };
      return NextResponse.json({ available: false, conflict: detail });
    }
    return NextResponse.json({ available: true });
  } catch (error) {
    if (error instanceof Error && /Lesson time|Enter a Malaysia|Invalid date|Recurring range|End date precedes/.test(error.message)) return bad(error.message);
    return bad("Could not check this time. Try again.");
  }
}
