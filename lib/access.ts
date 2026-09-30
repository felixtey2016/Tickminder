export function teacherMaySeeLesson(account: { role: string; teacherName: string | null }, lesson: { teacherName: string; student: string; subject: string }, activeKeys: ReadonlySet<string>) {
  const key = `${lesson.student}|${lesson.subject}`;
  return account.role === "teacher" && Boolean(account.teacherName) && lesson.teacherName === account.teacherName && activeKeys.has(key);
}

// Request direction is persisted separately from mutable account roles.
export function mayRequestReschedule(account: { role: string; teacherName: string | null; studentName: string | null }, lesson: { teacherName: string; student: string; subject: string }, plans: Array<{ student: string; subject: string; teacher: string }>) {
  const assigned = plans.some(p => p.student === lesson.student && p.subject === lesson.subject && p.teacher === lesson.teacherName);
  return assigned && ((account.role === "teacher" && account.teacherName === lesson.teacherName) || (account.role === "student" && account.studentName === lesson.student));
}
export function mayRespondReschedule(account: { id: string; role: string; teacherName: string | null; studentName: string | null }, lesson: { teacherName: string; student: string; subject: string }, proposal: { requestedBy: string; requestedRole: string }, plans: Array<{ student: string; subject: string; teacher: string }>) {
  return account.id !== proposal.requestedBy && mayRequestReschedule(account, lesson, plans) &&
    ((proposal.requestedRole === "teacher" && account.role === "student") || (proposal.requestedRole === "student" && account.role === "teacher"));
}
