export type LessonLike = { student: string; subject: string; plannedStart: string; plannedEnd: string; actualStart: string | null; actualEnd: string | null; status: string; chargeable: boolean | null; reviewedAt: string | null };

const monthFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" });
const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" });

export function hoursBetween(start: string, end: string) {
  const hours = (Date.parse(end) - Date.parse(start)) / 3600000;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 12) throw new Error("Lesson time must be between 1 minute and 12 hours");
  return hours;
}

export function billedHours(lesson: LessonLike) {
  if (!lesson.reviewedAt || !lesson.chargeable) return 0;
  if (lesson.status === "completed" && lesson.actualStart && lesson.actualEnd) return hoursBetween(lesson.actualStart, lesson.actualEnd);
  if (lesson.status === "student_absent") return hoursBetween(lesson.plannedStart, lesson.plannedEnd);
  return 0;
}

export function approvedActualHours(lesson: LessonLike) {
  return lesson.reviewedAt && lesson.status === "completed" && lesson.actualStart && lesson.actualEnd
    ? hoursBetween(lesson.actualStart, lesson.actualEnd) : 0;
}

export function inMonth(iso: string, month: string) {
  return malaysiaMonth(iso) === month;
}

export function malaysiaMonth(iso: string) {
  const parts = monthFormatter.formatToParts(new Date(iso));
  return `${parts.find(p => p.type === "year")?.value}-${parts.find(p => p.type === "month")?.value}`;
}

export function currentMalaysiaMonth() { return malaysiaMonth(new Date().toISOString()); }

export function malaysiaDate(iso: string) {
  const parts = dateFormatter.formatToParts(new Date(iso));
  const get = (type: string) => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function mayCheckIn(plannedStart: string, now: string) {
  return malaysiaDate(now) >= malaysiaDate(plannedStart);
}

export function checkinInMonth(lesson: LessonLike, month: string) {
  if (!["completed", "student_absent", "teacher_absent"].includes(lesson.status)) return false;
  const date = lesson.status === "completed" ? lesson.actualStart : lesson.plannedStart;
  return Boolean(date && inMonth(date, month));
}

export function monthlyAttendanceForPair<T extends LessonLike & { teacherName: string }>(rows: readonly T[], month: string, student?: string, teacher?: string) {
  const records = rows.filter(l => checkinInMonth(l, month) && (!student || l.student === student) && (!teacher || l.teacherName === teacher));
  const completed = records.filter(l => l.status === "completed" && l.actualStart && l.actualEnd);
  return {
    records,
    submittedHours: completed.reduce((sum, l) => sum + hoursBetween(l.actualStart!, l.actualEnd!), 0),
    approvedHours: completed.reduce((sum, l) => sum + approvedActualHours(l), 0),
    approvedLessons: completed.filter(l => approvedActualHours(l) > 0).length,
  };
}

export type LessonSlot = { id?: string; student: string; teacherName: string; plannedStart: string; plannedEnd: string; status?: string };
const studentIdentity = (name: string) => name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
export function findLessonConflict(candidate: LessonSlot, existing: readonly LessonSlot[]) {
  return existing.find(row => row.id !== candidate.id && row.status !== "cancelled" &&
    (studentIdentity(row.student) === studentIdentity(candidate.student) || row.teacherName === candidate.teacherName) &&
    candidate.plannedStart < row.plannedEnd && row.plannedStart < candidate.plannedEnd);
}

export function lessonConflictReason(candidate: LessonSlot, other: LessonSlot): "student" | "teacher" | "both" {
  const sameStudent = studentIdentity(candidate.student) === studentIdentity(other.student);
  const sameTeacher = candidate.teacherName === other.teacherName;
  return sameStudent && sameTeacher ? "both" : sameStudent ? "student" : "teacher";
}

export function approvedHoursInMonth(lesson: LessonLike, month: string) {
  return lesson.actualStart && inMonth(lesson.actualStart, month) ? approvedActualHours(lesson) : 0;
}

export function generateWeekly(start: string, end: string, until: string) {
  const first = new Date(start);
  const last = new Date(until);
  const duration = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 12 * 3600000 || !Number.isFinite(last.getTime())) throw new Error("Invalid recurring lesson time");
  const dates: Array<{ start: string; end: string }> = [];
  for (let date = first.getTime(); date <= last.getTime(); date += 7 * 86400000) {
    if (dates.length >= 110) throw new Error("Recurring range is too long");
    dates.push({ start: new Date(date).toISOString(), end: new Date(date + duration).toISOString() });
  }
  if (!dates.length) throw new Error("End date precedes first lesson");
  return dates;
}
