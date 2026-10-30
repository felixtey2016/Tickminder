import {adminMaterialCreateAuthority} from "./material-import-access";
import {accountSessionPredicate} from "./account-session";
import type {Account} from "./auth";
import {classPlanSubjectSql} from "./academic-subject-match";

// Re-evaluate identity and context in the write statement, after body parsing,
// hashing and cleanup have yielded. All names and identifiers remain bound.
export function pdfUploadAuthority(actor: Account, kind: string, context: {classroomId: string; homeworkId: string; submissionId: string;folderId?:string|null;subject?:string}) {
  if(actor.role==='admin'&&kind==='material')return adminMaterialCreateAuthority(actor,context);
  const session=accountSessionPredicate(actor);
  const identity = `EXISTS(SELECT 1 FROM accounts upload_actor JOIN tuition_groups upload_group ON upload_group.id=upload_actor.group_id AND upload_group.active=1
    WHERE upload_actor.id=? AND upload_actor.group_id=? AND upload_actor.role=? AND upload_actor.disabled_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM local_credentials credentials WHERE credentials.account_id=upload_actor.id AND credentials.must_change_password=1) AND (${session.sql})`;
  const values: unknown[] = [actor.id, actor.groupId, actor.role,...session.args];
  if (actor.role === "teacher") {
    const feedback = kind === "feedback" ? ` AND EXISTS(SELECT 1 FROM homework_submissions submission JOIN homework task ON task.id=submission.homework_id AND task.group_id=submission.group_id
      WHERE submission.id=? AND submission.group_id=upload_actor.group_id AND task.owner_id=upload_actor.id AND task.classroom_id=upload_class.id)` : "";
    values.push(actor.teacherName, context.classroomId);
    if (feedback) values.push(context.submissionId);
    return {sql: `${identity} AND upload_actor.teacher_name=? AND EXISTS(SELECT 1 FROM teachers teacher JOIN classrooms upload_class ON upload_class.group_id=teacher.group_id AND upload_class.teacher_name=teacher.name
      WHERE teacher.group_id=upload_actor.group_id AND teacher.name=upload_actor.teacher_name AND teacher.active=1 AND upload_class.id=? AND upload_class.archived=0${feedback}))`, values};
  }
  if (actor.role === "student" && kind === "submission") {
    values.push(actor.studentName, context.homeworkId, new Date().toISOString(), new Date().toISOString());
    return {sql: `${identity} AND upload_actor.student_name=? AND EXISTS(SELECT 1 FROM students student JOIN homework_recipients recipient ON recipient.group_id=student.group_id AND recipient.student_name=student.name
      JOIN homework task ON task.id=recipient.homework_id AND task.group_id=recipient.group_id
      WHERE student.group_id=upload_actor.group_id AND student.name=upload_actor.student_name AND student.active=1 AND task.id=? AND task.starts_at<=?
      AND (task.classroom_id IS NULL OR EXISTS(SELECT 1 FROM classrooms c JOIN classroom_members member ON member.classroom_id=c.id AND member.group_id=c.group_id AND member.student_name=student.name
        JOIN plans p ON p.group_id=c.group_id AND p.student=member.student_name AND p.teacher_name=c.teacher_name AND p.active=1 AND ${classPlanSubjectSql("p","c","student")}
        JOIN teachers teacher ON teacher.group_id=c.group_id AND teacher.name=c.teacher_name AND teacher.active=1
        WHERE c.id=task.classroom_id AND c.group_id=task.group_id AND c.archived=0))
      AND (?<=task.due_at OR NOT EXISTS(SELECT 1 FROM homework_submissions submitted WHERE submitted.homework_id=task.id AND submitted.group_id=task.group_id AND submitted.student_name=student.name)
        OR EXISTS(SELECT 1 FROM homework_resubmission_grants grant_row WHERE grant_row.id=recipient.active_grant_id AND grant_row.group_id=task.group_id AND grant_row.homework_id=task.id AND grant_row.student_name=student.name
          AND grant_row.used_at IS NULL AND grant_row.revoked_at IS NULL AND grant_row.base_submission_id=(SELECT latest.id FROM homework_submissions latest WHERE latest.group_id=task.group_id AND latest.homework_id=task.id AND latest.student_name=student.name ORDER BY latest.attempt DESC,latest.submitted_at DESC,latest.id DESC LIMIT 1)))))`, values};
  }
  return {sql: "0", values: []};
}
