import type {Account} from '@/lib/auth';
import {learningDb} from '@/lib/learning-server';
import {QuizError} from '@/lib/quiz';
import {adminPermissionPredicate,requireAdminPermission} from '@/lib/admin-permission-access';
import {practiceAuthority,practiceAuthorityValues} from '@/lib/quiz-practice';

export type QuizAnalysisMode='latest'|'first'|'best'|'all';
export type QuizQuestionAnalysis={questionId:string;number:number;type:string;prompt:string;manual:boolean;points:number;receivedCount:number;incorrectCount:number|null;errorRatePercent:number|null;averageScorePercent:number|null};
export type QuizAnalysis={assignmentId:string;versionId:string;title:string;mode:QuizAnalysisMode;page:number;pageSize:number;questionCount:number;hasMore:boolean;summary:{recipientCount:number;startedStudents:number;notStartedStudents:number;inProgressAttempts:number;submittedAttempts:number;pendingGradingAttempts:number;analysedAttempts:number;averagePercent:number|null;highestPercent:number|null;lowestPercent:number|null};questions:QuizQuestionAnalysis[]};
type SummaryRow={authorised:number;versionId:string;title:string|null;recipientCount:number;startedStudents:number;notStartedStudents:number;inProgressAttempts:number;submittedAttempts:number;pendingGradingAttempts:number;analysedAttempts:number;averagePercent:number|null;highestPercent:number|null;lowestPercent:number|null;questionCount:number};
type QuestionRow=Omit<QuizQuestionAnalysis,'manual'>&{manual:number};
const identifier=(value:unknown):string=>{if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(value))throw new QuizError('quiz.invalidFields');return value;};
const round=(value:number|null)=>value===null?null:Math.round(value*100)/100;

export async function quizAnalytics(actor:Account,url:URL):Promise<QuizAnalysis>{
 if(!['teacher','admin'].includes(actor.role)||!actor.groupId)throw new QuizError('quiz.forbidden',403);
 await requireAdminPermission(actor,'quizAssignments.view');
 const assignmentId=identifier(url.searchParams.get('assignmentId')),requestedVersion=url.searchParams.get('versionId');if(requestedVersion)identifier(requestedVersion);
 const mode=(url.searchParams.get('attemptMode')||'latest') as QuizAnalysisMode;if(!['latest','first','best','all'].includes(mode))throw new QuizError('quiz.analysisInvalid');
 const rawPage=url.searchParams.get('page')||'0';if(!/^\d{1,4}$/.test(rawPage)||Number(rawPage)>1000)throw new QuizError('quiz.analysisInvalid');const page=Number(rawPage),pageSize=20,permission=adminPermissionPredicate(actor,'quizAssignments.view');
 const authority=`qa.group_id=? AND qa.id=? ${requestedVersion?'AND qa.version_id=?':''} AND (qa.created_by=? OR ?='admin') AND (${permission.sql}) AND ${practiceAuthority}`;
 const args=[actor.groupId,assignmentId,...(requestedVersion?[requestedVersion]:[]),actor.id,actor.role,...permission.args,...practiceAuthorityValues(actor)];
 const order=mode==='first'?'submitted_at ASC,id ASC':mode==='best'?'(score*1.0/total_score) DESC,submitted_at DESC,id DESC':'submitted_at DESC,id DESC';
 // Each request aggregates in SQLite. Neither answer payloads nor all attempts
 // are transferred into the Worker, and versions never mix across assignments.
 const ctes=`WITH authorised AS(SELECT qa.*,v.content_json FROM quiz_practice_assignments qa JOIN quiz_versions v ON v.id=qa.version_id WHERE ${authority}),
 base AS(SELECT pa.id,pa.student_name,pa.status,pa.score,pa.total_score,pa.pending_manual,pa.submitted_at,pa.order_json,pa.results_json FROM quiz_practice_attempts pa JOIN authorised qa ON qa.id=pa.assignment_id AND qa.group_id=pa.group_id AND qa.version_id=pa.version_id WHERE pa.discarded_at IS NULL AND pa.student_name IS NOT NULL),
 ranked AS(SELECT *,row_number() OVER(PARTITION BY student_name ORDER BY ${order}) AS position FROM base WHERE status='submitted' AND pending_manual=0 AND total_score>0),
 selected AS(SELECT * FROM ranked ${mode==='all'?'':'WHERE position=1'})`;
 const summarySql=`${ctes} SELECT (SELECT count(*) FROM authorised) AS authorised,(SELECT version_id FROM authorised) AS versionId,(SELECT title FROM authorised) AS title,
 (SELECT count(*) FROM quiz_practice_recipients r JOIN authorised qa ON qa.id=r.assignment_id AND qa.group_id=r.group_id) AS recipientCount,
 (SELECT count(DISTINCT student_name) FROM base) AS startedStudents,
 (SELECT count(*) FROM quiz_practice_recipients r JOIN authorised qa ON qa.id=r.assignment_id AND qa.group_id=r.group_id WHERE NOT EXISTS(SELECT 1 FROM base b WHERE b.student_name=r.student_name)) AS notStartedStudents,
 (SELECT count(*) FROM base WHERE status='in_progress') AS inProgressAttempts,
 (SELECT count(*) FROM base WHERE status='submitted') AS submittedAttempts,
 (SELECT count(*) FROM base WHERE status='submitted' AND pending_manual>0) AS pendingGradingAttempts,
 (SELECT count(*) FROM selected) AS analysedAttempts,
 (SELECT avg(score*100.0/total_score) FROM selected) AS averagePercent,
 (SELECT max(score*100.0/total_score) FROM selected) AS highestPercent,
 (SELECT min(score*100.0/total_score) FROM selected) AS lowestPercent,
 (SELECT json_array_length(content_json,'$.questions') FROM authorised) AS questionCount`;
 const questionsSql=`${ctes},
 questions AS(SELECT json_extract(q.value,'$.id') AS questionId,cast(q.key AS INTEGER)+1 AS number,json_extract(q.value,'$.type') AS type,substr(json_extract(q.value,'$.prompt.primary'),1,180) AS prompt,json_extract(q.value,'$.points') AS points,
 CASE WHEN (SELECT json_extract(k.value,'$.mode') FROM quiz_answer_keys ak JOIN json_each(ak.answers_json) k WHERE ak.version_id=qa.version_id AND json_extract(k.value,'$.questionId')=json_extract(q.value,'$.id') LIMIT 1)='manual' THEN 1 ELSE 0 END AS manual
 FROM authorised qa JOIN json_each(qa.content_json,'$.questions') q),
 picked AS(SELECT s.id AS attemptId,p.value AS questionId FROM selected s JOIN json_each(s.order_json,'$.questions') p),
 results AS(SELECT s.id AS attemptId,json_extract(r.value,'$.questionId') AS questionId,json_extract(r.value,'$.status') AS resultStatus,json_extract(r.value,'$.points') AS points FROM selected s JOIN json_each(s.results_json) r),
 metrics AS(SELECT p.questionId,count(*) AS receivedCount,sum(CASE WHEN r.resultStatus='incorrect' THEN 1 ELSE 0 END) AS incorrectCount,avg(r.points*100.0/q.points) AS averageScorePercent FROM picked p JOIN questions q ON q.questionId=p.questionId LEFT JOIN results r ON r.attemptId=p.attemptId AND r.questionId=p.questionId GROUP BY p.questionId)
 SELECT q.*,coalesce(m.receivedCount,0) AS receivedCount,CASE WHEN q.manual=1 THEN NULL ELSE coalesce(m.incorrectCount,0) END AS incorrectCount,CASE WHEN q.manual=1 OR coalesce(m.receivedCount,0)=0 THEN NULL ELSE m.incorrectCount*100.0/m.receivedCount END AS errorRatePercent,m.averageScorePercent FROM questions q LEFT JOIN metrics m ON m.questionId=q.questionId ORDER BY q.number LIMIT ? OFFSET ?`;
 const db=learningDb(),result=await db.batch([db.prepare(summarySql).bind(...args),db.prepare(questionsSql).bind(...args,pageSize,page*pageSize)]),summary=(result[0].results as SummaryRow[])[0];
 if(!summary?.authorised)throw new QuizError('quiz.notFound',404);
 return {assignmentId,versionId:summary.versionId,title:summary.title||'',mode,page,pageSize,questionCount:summary.questionCount,hasMore:(page+1)*pageSize<summary.questionCount,summary:{recipientCount:summary.recipientCount,startedStudents:summary.startedStudents,notStartedStudents:summary.notStartedStudents,inProgressAttempts:summary.inProgressAttempts,submittedAttempts:summary.submittedAttempts,pendingGradingAttempts:summary.pendingGradingAttempts,analysedAttempts:summary.analysedAttempts,averagePercent:round(summary.averagePercent),highestPercent:round(summary.highestPercent),lowestPercent:round(summary.lowestPercent)},questions:(result[1].results as QuestionRow[]).map(row=>({...row,manual:Boolean(row.manual),errorRatePercent:round(row.errorRatePercent),averageScorePercent:round(row.averageScorePercent)}))};
}
