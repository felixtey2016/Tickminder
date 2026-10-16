import {adminPermissionPredicate} from './admin-permission-access';
import type {Account} from './auth';
import {learningDb,rows} from './learning-server';
import {quizClassroomEligibleSql,quizStudentEligibleSql} from './quiz-targets';

const ownerSql=(a:string)=>`${a}.group_id IS NULL AND ${a}.role='admin' AND ${a}.id NOT LIKE 'local:%' AND lower(trim(${a}.email))='felixtey2016@gmail.com'`;
const accountGroupSql=(a:string,group:string)=>`(${a}.group_id=${group} OR (${ownerSql(a)}))`;
// All expressions come from trusted code. The same active class/subject
// relationship used for assigning a Quiz is rechecked before reading a notice.
// Quiz practice is allowed across subjects; this does not widen class ownership.
export function quizNoticeRecipientSql(assignment='qa',student='a.student_name') {
 const teacher=`CASE WHEN notice_author.role='teacher' THEN notice_author.teacher_name ELSE NULL END`;
 const input={groupId:`${assignment}.group_id`,subject:`${assignment}.subject`,teacherName:teacher,studentName:student,allowCrossSubject:'1'};
 return `EXISTS(SELECT 1 FROM quiz_practice_recipients notice_recipient
  JOIN students notice_student ON notice_student.group_id=notice_recipient.group_id AND notice_student.name=notice_recipient.student_name AND notice_student.active=1
  JOIN accounts notice_author ON notice_author.id=${assignment}.created_by AND notice_author.disabled_at IS NULL
  WHERE notice_recipient.assignment_id=${assignment}.id AND notice_recipient.group_id=${assignment}.group_id AND notice_recipient.student_name=${student}
  AND ${accountGroupSql('notice_author',`${assignment}.group_id`)}
  AND (notice_author.role='admin' OR notice_author.role='teacher' AND EXISTS(SELECT 1 FROM teachers notice_teacher WHERE notice_teacher.group_id=${assignment}.group_id AND notice_teacher.name=notice_author.teacher_name AND notice_teacher.active=1))
  AND ((${assignment}.classroom_id IS NULL AND ${quizStudentEligibleSql(input)}) OR (${assignment}.classroom_id IS NOT NULL AND ${quizClassroomEligibleSql({...input,classroomId:`${assignment}.classroom_id`})})))`;
}
function sourceSql(assignment='qa') {
 return `EXISTS(SELECT 1 FROM quiz_versions notice_version JOIN quizzes notice_quiz ON notice_quiz.id=notice_version.quiz_id
  JOIN tuition_groups notice_source_group ON notice_source_group.id=notice_quiz.group_id AND notice_source_group.active=1
  WHERE notice_version.id=${assignment}.version_id AND notice_quiz.id=${assignment}.quiz_id AND notice_quiz.deleted_at IS NULL
  AND ((notice_quiz.group_id=${assignment}.group_id AND (notice_quiz.owner_id=${assignment}.created_by OR EXISTS(SELECT 1 FROM accounts notice_source_admin WHERE notice_source_admin.id=${assignment}.created_by AND notice_source_admin.role='admin' AND notice_source_admin.disabled_at IS NULL AND ${accountGroupSql('notice_source_admin',`${assignment}.group_id`)})))
   OR (notice_quiz.shared_revision IS NOT NULL AND (notice_quiz.visibility='public' OR notice_quiz.visibility='organisation' AND notice_quiz.group_id=${assignment}.group_id))))`;
}
export const quizAssignmentNoticeAccess=`a.disabled_at IS NULL AND ${accountGroupSql('a','n.group_id')}
 AND EXISTS(SELECT 1 FROM tuition_groups notice_group WHERE notice_group.id=n.group_id AND notice_group.active=1)
 AND qa.group_id=n.group_id AND qa.withdrawn_at IS NULL
 AND ((n.kind<>'pending_marking' AND a.role='student' AND a.group_id=n.group_id AND ${quizNoticeRecipientSql()} AND ${sourceSql()})
 OR (n.kind='pending_marking' AND qa.created_by=a.id AND a.role IN ('teacher','admin')
  AND EXISTS(SELECT 1 FROM quiz_practice_attempts notice_attempt WHERE notice_attempt.id=n.attempt_id AND notice_attempt.assignment_id=qa.id AND notice_attempt.group_id=n.group_id
   AND notice_attempt.status='submitted' AND notice_attempt.pending_manual>0 AND ${quizNoticeRecipientSql('qa','notice_attempt.student_name')})))`;

type QuizNoticeEvent={groupId:string;assignmentId:string;eventId:string;kind:'assigned'|'updated'|'retake_granted'|'pending_marking';at:string;guard:string;guardArgs:unknown[];studentName?:string;attemptId?:string};
// Include these statements in the caller's mutation batch, after the operation
// claim and recipient rows. A replay cannot create a second account/event notice.
export function quizAssignmentNoticeStatements(event:QuizNoticeEvent) {
 const pending=event.kind==='pending_marking';
 if(pending&&!event.attemptId)throw new Error('Pending marking notice requires an attempt');
 const access=pending?`a.id=qa.created_by AND a.role IN ('teacher','admin')
  AND EXISTS(SELECT 1 FROM quiz_practice_attempts notice_attempt WHERE notice_attempt.id=? AND notice_attempt.assignment_id=qa.id AND notice_attempt.group_id=qa.group_id AND notice_attempt.status='submitted' AND notice_attempt.pending_manual>0 AND ${quizNoticeRecipientSql('qa','notice_attempt.student_name')})`
  :`a.role='student' AND a.group_id=qa.group_id AND ${quizNoticeRecipientSql()} AND ${sourceSql()}`;
 return [learningDb().prepare(`INSERT OR IGNORE INTO quiz_assignment_notifications(id,group_id,account_id,event_id,assignment_id,attempt_id,kind,title,subject,created_at)
  SELECT lower(hex(randomblob(16))),qa.group_id,a.id,?,qa.id,?,?,qa.title,qa.subject,?
  FROM quiz_practice_assignments qa JOIN accounts a ON a.disabled_at IS NULL AND ${accountGroupSql('a','qa.group_id')}
  WHERE qa.id=? AND qa.group_id=? AND qa.withdrawn_at IS NULL AND ${access} ${event.studentName?'AND a.student_name=?':''} AND (${event.guard})`)
  .bind(event.eventId,event.attemptId||null,event.kind,event.at,event.assignmentId,event.groupId,...(pending?[event.attemptId]:[]),...(event.studentName?[event.studentName]:[]),...event.guardArgs)];
}
export async function quizAssignmentInbox(account:Account) {
 if(!account.groupId||!['student','teacher','admin'].includes(account.role))return {items:[],unreadCount:0};
 const permission=adminPermissionPredicate(account,'quizAssignments.view');
 const messages=await rows<{id:string;kind:string;assignmentId:string;title:string;subject:string;createdAt:string;readAt:string|null;unreadTotal:number}>(`SELECT n.id,n.kind,n.assignment_id AS assignmentId,n.title,n.subject,n.created_at AS createdAt,n.read_at AS readAt,sum(n.read_at IS NULL) OVER() AS unreadTotal
  FROM quiz_assignment_notifications n JOIN accounts a ON a.id=n.account_id JOIN quiz_practice_assignments qa ON qa.id=n.assignment_id
  WHERE n.account_id=? AND n.group_id=? AND ${quizAssignmentNoticeAccess} AND (${permission.sql})
  ORDER BY (n.read_at IS NULL) DESC,n.created_at DESC,n.id DESC LIMIT 100`,account.id,account.groupId,...permission.args);
 return {unreadCount:Number(messages[0]?.unreadTotal||0),items:messages.map(n=>({id:'quiz:'+n.id,kind:'quiz_'+n.kind,contentKind:'quiz' as const,recordId:n.assignmentId,title:n.title,subject:n.subject,dueAt:n.createdAt,readAt:n.readAt}))};
}
