// Shared by generation, reading and push delivery. The signed-in account is
// matched to the current active lesson assignment, never to a client-supplied ID.
export const participantSql = `a.disabled_at IS NULL AND a.group_id=l.group_id AND EXISTS(SELECT 1 FROM tuition_groups g WHERE g.id=l.group_id AND g.active=1) AND (
 (a.role = 'teacher' AND a.teacher_name = l.teacher_name) OR
 (a.role = 'student' AND a.student_name = l.student)) AND EXISTS (
 SELECT 1 FROM plans p JOIN students s ON s.group_id=p.group_id AND s.name=p.student AND s.active=1
 JOIN teachers t ON t.group_id=p.group_id AND t.name=p.teacher_name AND t.active=1
 WHERE p.group_id=l.group_id AND p.student=l.student AND p.subject=l.subject AND p.teacher_name=l.teacher_name AND p.active=1)`;
