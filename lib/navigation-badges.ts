type Lesson = { id: string; status: string; plannedEnd: string; chargeable?: boolean | null; replacementFor?: string | null };
type Proposal = { lessonId: string; status: string; requestedRole?: string; requestedBy?: string };

// Inputs come from the already-authorized core state. Counts span all months,
// exclude closed lessons, and count only requests the current role must answer.
export function navigationBadges(role: string, accountId: string, lessons: Lesson[], proposals: Proposal[], now = Date.now()) {
  const missed = lessons.filter(lesson => lesson.status === "scheduled" && Date.parse(lesson.plannedEnd) < now).length;
  const incoming = role === "teacher" || role === "student" ? proposals.filter(proposal => proposal.status === "pending" && (proposal.requestedRole || "teacher") !== role && proposal.requestedBy !== accountId && lessons.some(lesson => lesson.id === proposal.lessonId && lesson.status === "scheduled")).length : 0;
  const replacements = new Set(lessons.filter(lesson => lesson.status !== "cancelled" && lesson.replacementFor).map(lesson => lesson.replacementFor));
  const absence = lessons.filter(lesson => ["student_absent", "teacher_absent"].includes(lesson.status) && !lesson.chargeable && !replacements.has(lesson.id)).length;
  return { lessons: role === "teacher" ? missed : 0, reschedule: incoming, attention: role === "admin" ? missed + absence : 0 };
}
