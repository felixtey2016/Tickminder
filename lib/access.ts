export function teacherMaySeeLesson(account: { role: string; teacherName: string | null }, lesson: { teacherName: string; student: string; subject: string }, activeKeys: ReadonlySet<string>) {
  const key = `${lesson.student}|${lesson.subject}`;
  return account.role === "teacher" && Boolean(account.teacherName) && lesson.teacherName === account.teacherName && activeKeys.has(key);
}
