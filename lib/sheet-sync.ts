import { malaysiaMonth } from "./lesson-rules.ts";

export type SyncMode = "billable" | "all_completed";
export type SyncPair = { student: string; subject: string; hours: number };
type Plan = { student: string; subject: string };
type Lesson = {
  student: string;
  subject: string;
  status: string;
  actualStart: string | null;
  actualEnd: string | null;
  reviewedAt: string | null;
  chargeable: boolean | null;
};

const pairKey = (student: string, subject: string) => JSON.stringify([student, subject]);

/** Use the website's registered student-subject pairs, including pairs with zero hours this month. */
export function monthlySheetPairs(plans: readonly Plan[], lessons: readonly Lesson[], month: string, mode: SyncMode): SyncPair[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid lesson month");
  const totals = new Map<string, SyncPair>();
  for (const plan of plans) {
    if (plan.student && plan.subject) totals.set(pairKey(plan.student, plan.subject), { student: plan.student, subject: plan.subject, hours: 0 });
  }
  for (const lesson of lessons) {
    if (lesson.status !== "completed" || !lesson.reviewedAt || !lesson.actualStart || !lesson.actualEnd ||
        malaysiaMonth(lesson.actualStart) !== month || (mode === "billable" && lesson.chargeable !== true)) continue;
    const pair = totals.get(pairKey(lesson.student, lesson.subject));
    if (!pair) continue;
    const duration = (Date.parse(lesson.actualEnd) - Date.parse(lesson.actualStart)) / 3600000;
    if (Number.isFinite(duration) && duration > 0 && duration <= 12) pair.hours += duration;
  }
  return [...totals.values()].map(pair => ({ ...pair, hours: Math.round((pair.hours + Number.EPSILON) * 100) / 100 }))
    .sort((a, b) => a.student.localeCompare(b.student) || a.subject.localeCompare(b.subject));
}
