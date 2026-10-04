export type StudentCalendarLesson = {
  id: string;
  plannedStart: string;
  plannedEnd: string;
  status: string;
};

const dayFormatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
});
export function malaysiaDay(iso: string) {
  return dayFormatter.format(new Date(iso));
}

export function shiftMonth(month: string, by: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
}

export function monthDays(month: string) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Math.ceil((mondayOffset + lastDay) / 7) * 7;
  return Array.from({ length: cells }, (_, index) =>
    new Date(first.getTime() + (index - mondayOffset) * 86_400_000).toISOString().slice(0, 10));
}

export function activeLessonsOnDay<T extends StudentCalendarLesson>(lessons: readonly T[], day: string) {
  return lessons.filter(lesson => lesson.status !== "cancelled" && malaysiaDay(lesson.plannedStart) === day)
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
}

export function nextScheduledLesson<T extends StudentCalendarLesson>(lessons: readonly T[], now: string) {
  return lessons.filter(lesson => lesson.status === "scheduled" && lesson.plannedEnd > now)
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart))[0] || null;
}
