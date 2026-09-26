export type TimetableLesson = {
  id: string;
  student: string;
  subject: string;
  teacherName: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  status: string;
};

export function malaysiaMonth(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).format(new Date(iso));
}

export function timetableLessons<T extends TimetableLesson>(rows: readonly T[], month: string, type: "student" | "teacher", name: string, studentFilter = "") {
  if (!name || !/^\d{4}-\d{2}$/.test(month)) return [];
  return rows.filter(l => l.status !== "cancelled" && malaysiaMonth(l.plannedStart) === month &&
    (type === "student" ? l.student === name : l.teacherName === name && (!studentFilter || l.student === studentFilter)))
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
}

export function timetableHours(rows: readonly TimetableLesson[]) {
  return rows.reduce((sum, l) => {
    const checkedIn = l.status === "completed" && l.actualStart && l.actualEnd;
    const start = checkedIn ? l.actualStart! : l.plannedStart;
    const end = checkedIn ? l.actualEnd! : l.plannedEnd;
    return sum + Math.max(0, (Date.parse(end) - Date.parse(start)) / 3600000);
  }, 0);
}
