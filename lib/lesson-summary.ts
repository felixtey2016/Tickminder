import type { lessons } from "@/db/schema";
import { approvedActualHours, approvedHoursInMonth, inMonth } from "@/lib/lesson-rules";

export function monthlySummary(plans: Array<{ key: string; student: string; subject: string;subjectId?:string|null;syllabusId?:string|null }>, rows: Array<typeof lessons.$inferSelect>, month: string,sessionSubjects:Map<string,{subjectId?:string|null;syllabusId?:string|null}>=new Map()) {
  const now = new Date().toISOString();
  return plans.map(p => {
    const items = rows.filter(l => l.student === p.student && (l.subject === p.subject||Boolean(l.sessionId&&p.subjectId&&sessionSubjects.get(l.sessionId)?.subjectId===p.subjectId&&sessionSubjects.get(l.sessionId)?.syllabusId===p.syllabusId)));
    const completed = items.filter(l => l.actualStart && inMonth(l.actualStart, month));
    const planned = items.filter(l => inMonth(l.plannedStart, month));
    return {
      key: p.key,
      completed: completed.reduce((sum, l) => sum + approvedHoursInMonth(l, month), 0),
      lessons: completed.filter(l => approvedActualHours(l) > 0).length,
      upcoming: planned.filter(l => l.status === "scheduled" && l.plannedStart > now).reduce((sum, l) => sum + (Date.parse(l.plannedEnd) - Date.parse(l.plannedStart)) / 3600000, 0),
      pending: planned.filter(l => l.status !== "cancelled" && !l.reviewedAt && l.plannedStart <= now).length,
      makeupNeeded: planned.filter(l => ["student_absent", "teacher_absent"].includes(l.status) && !rows.some(x => x.replacementFor === l.id && x.status !== "cancelled")).length,
    };
  });
}
