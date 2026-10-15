type Lesson = {sessionId?:string|null;sessionType?:string;reviewedAt?:string|null; id: string; status: string; plannedEnd: string; chargeable?: boolean | null; replacementFor?: string | null };
type Proposal = { lessonId: string; status: string; requestedRole?: string; requestedBy?: string };

// Inputs come from the already-authorized core state. Counts span all months,
// exclude closed lessons, and count only requests the current role must answer.
export function navigationBadges(role: string, accountId: string, lessons: Lesson[], proposals: Proposal[], now = Date.now()) {
  const missed = new Set(lessons.filter(lesson => lesson.status === "scheduled" && Date.parse(lesson.plannedEnd) < now).map(l=>l.sessionType==="group"?l.sessionId||l.id:l.id)).size;
  const incoming = role === "teacher" || role === "student" ? proposals.filter(proposal => proposal.status === "pending" && (proposal.requestedRole || "teacher") !== role && proposal.requestedBy !== accountId && lessons.some(lesson => lesson.id === proposal.lessonId && lesson.status === "scheduled")).length : 0;
  const replacements = new Set(lessons.filter(lesson => lesson.status !== "cancelled" && lesson.replacementFor).map(lesson => lesson.replacementFor));
  const absence = lessons.filter(lesson => ["student_absent", "teacher_absent"].includes(lesson.status) && !lesson.chargeable && !replacements.has(lesson.id)).length;
  const review=new Set(lessons.filter(l=>['completed','student_absent','teacher_absent'].includes(l.status)&&!l.reviewedAt).map(l=>l.sessionType==='group'?l.sessionId||l.id:l.id)).size;
  return { lessons: role === "teacher" ? missed : 0, reschedule: incoming, overview:role==='admin'?review:0, attention: role === "admin" ? missed + absence + review : 0 };
}
