import type {QuizAnswer,QuizContent,QuizKey} from '@/lib/quiz';
export type QuizAssignmentKind='practice'|'quiz'|'homework';
export type QuizReleasePolicy='submission'|'deadline'|'manual';
export type QuizAssignmentSettings={kind:QuizAssignmentKind;startsAt:string|null;dueAt:string|null;timeLimitSeconds:number|null;maxAttempts:number|null;latePolicy:'reject'|'allow';scoreMax:number|null;scoreRelease:QuizReleasePolicy;answerRelease:QuizReleasePolicy};
export type PracticeResult={questionId:string;status:'correct'|'incorrect'|'manual'|'graded';points:number|null;feedback?:string;key?:Pick<QuizKey,'correctOptionId'|'accepted'|'unit'|'explanation'|'rubric'>};
export type PracticeAttempt={id:string;quizId:string;assignmentId:string|null;versionId:string;title:string;subject:string;studentName:string|null;accountId:string;kind:QuizAssignmentKind;immediate:boolean;revision:number;status:'in_progress'|'submitted';startedAt:string;deadlineAt:string|null;submittedAt:string|null;updatedAt:string;submissionReason:'student'|'timer'|'deadline'|null;late:boolean;attemptNumber:number;score:number|null;totalScore:number;rawScore:number|null;rawTotalScore:number;scoreVisible:boolean;answersVisible:boolean;pendingManual:number;canGrade:boolean;canAnswer:boolean;manualQuestionIds:string[];content:QuizContent;answers:Record<string,QuizAnswer>;flaggedQuestionIds:string[];checkedQuestionIds:string[];results:PracticeResult[]};
export type PracticeAttemptSummary=Omit<PracticeAttempt,'content'|'answers'|'flaggedQuestionIds'|'checkedQuestionIds'|'results'|'manualQuestionIds'>;
export type PracticeRecipient={studentName:string;attemptCount:number;completedCount:number;latestScore:number|null;latestTotalScore:number|null;pendingManual:number;lastSubmittedAt:string|null;status:'not_started'|'in_progress'|'submitted'|'pending_grading'|'graded'|'overdue';dueAt:string|null;grantedDueAt:string|null;extraAttempts:number;maxAttempts:number|null};
export type PracticeAssignment=QuizAssignmentSettings&{id:string;quizId:string;versionId:string;title:string;subject:string;classroomId:string|null;classroomTitle:string|null;immediate:boolean;revision:number;createdAt:string;withdrawnAt:string|null;scoresReleasedAt:string|null;answersReleasedAt:string|null;recipientCount:number;completedCount:number;teacherName:string;canManage:boolean;state:'planned'|'open'|'closed'|'withdrawn';canStart:boolean;startBlockedReason:string|null;resumeAttemptId:string|null;attemptCount:number;remainingAttempts:number|null;effectiveDueAt:string|null;recipients?:PracticeRecipient[]};
export type PracticeEvent={id:string;action:string;actorName:string;at:string;before:Record<string,unknown>|null;after:Record<string,unknown>|null};
export type PracticeTargetOptions={classrooms:{id:string;title:string;subject:string;students:string[]}[];students:{studentName:string;subjects:string[]}[];diagnostics?:{classroomCount:number;studentCount:number;subjects:string[];emptyReason:string|null;allowCrossSubject?:boolean}};
export type PracticeState={assignments:PracticeAssignment[];attempts:PracticeAttemptSummary[];hasMore:boolean;serverNow:string;events?:PracticeEvent[]};
// Datetimes accept ISO UTC or native YYYY-MM-DDTHH:mm interpreted as GMT+8.
// GET ?attemptId=... => {attempt}; GET ?targets=1 (&subject=...) => PracticeTargetOptions.
// GET (?assignmentId=... teacher reports and events, ?offset=...) => PracticeState.
// POST start: {action:'start',operationId,quizId?,bank?,assignmentId?,immediate?}.
// POST save/check/submit: {action,operationId,attemptId,revision,answers,flaggedQuestionIds?,questionId?} => {attempt}.
// POST assign: {action:'assign',operationId,id,quizId,bank,classroomId? OR studentNames?,immediate?,settings?:QuizAssignmentSettings} => {id}.
// POST release: {action:'release',operationId,assignmentId,revision,release:'scores'|'answers'|'both'} => {ok:true}.
// POST accommodate: {action:'accommodate',operationId,assignmentId,revision,studentName,dueAt:string|null,extraAttempts:number,reason:string} => {ok:true}.
// POST withdraw: {action:'withdraw',operationId,assignmentId,revision} => {ok:true}.
// POST grade: {action:'grade',operationId,attemptId,revision,questionId,points,feedback?,reason?} => {attempt}.
