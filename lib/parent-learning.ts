import type {Account} from './auth';
import {learningDb} from './learning-server';
import {childScope,selectedChild,recheckChild,classroomAccess} from './parents-server';
import {ParentsError,parentMonth,parentPage,parentText,type ParentChild,type ParentPage} from './parents';
import {assignmentEligibleSql} from './quiz-practice';
import {assignmentSettings,quizReleaseVisible,scaledQuizScore} from './quiz-assignment-rules';
import type {QuizContent} from './quiz';
import type {ParentQuizGrade,ParentQuizGradePage,ParentQuizGradeDetail,ParentHomeworkGrade,ParentHomeworkGradePage,ParentHomeworkGradeDetail,ParentPerformance,ParentPerformanceMetrics} from './parent-learning-types';

const id=(value:unknown)=>{const v=parentText(value);if(!v||v.length>200)throw new ParentsError('记录不存在或没有查看权限',404);return v;};
const round=(v:number|null)=>v===null?null:Math.round(v*100)/100;
const percentage=(score:number,total:number)=>total>0?round(score*100/total):null;
const releaseDue=`(SELECT max(coalesce(release_r.due_at,json_extract(qa.settings_json,'$.dueAt'))) FROM quiz_practice_recipients release_r WHERE release_r.assignment_id=qa.id AND release_r.group_id=qa.group_id)`;
const scorePolicy=`coalesce(json_extract(qa.settings_json,'$.scoreRelease'),CASE WHEN json_extract(qa.settings_json,'$.kind')='quiz' THEN 'deadline' ELSE 'submission' END)`;
const quizScoreReleased=`(qa.scores_released_at IS NOT NULL OR ${scorePolicy}='submission' OR ${scorePolicy}='deadline' AND coalesce(${releaseDue},json_extract(qa.settings_json,'$.dueAt'))<=?)`;
const quizFrom=`FROM quiz_practice_attempts pa JOIN quiz_versions v ON v.id=pa.version_id AND v.quiz_id=pa.quiz_id LEFT JOIN quiz_practice_assignments qa ON qa.id=pa.assignment_id AND qa.group_id=pa.group_id`;
const quizEligible=`pa.discarded_at IS NULL AND pa.status='submitted' AND pa.submitted_at IS NOT NULL AND pa.pending_manual=0 AND pa.total_score>0 AND pa.score>=0 AND pa.score<=pa.total_score AND (pa.assignment_id IS NULL OR qa.version_id=pa.version_id AND ${assignmentEligibleSql('qa','pa.student_name')}) AND ${quizScoreReleased}`;
type QuizRow={id:string;contentJson:string;settingsJson:string|null;orderJson:string;resultsJson:string;score:number;totalScore:number;attemptNumber:number;submittedAt:string;scoresReleasedAt:string|null;answersReleasedAt:string|null;releaseDueAt:string|null};
const quizSelect=`pa.id,v.content_json AS contentJson,qa.settings_json AS settingsJson,pa.order_json AS orderJson,pa.results_json AS resultsJson,pa.score,pa.total_score AS totalScore,pa.attempt_number AS attemptNumber,pa.submitted_at AS submittedAt,qa.scores_released_at AS scoresReleasedAt,qa.answers_released_at AS answersReleasedAt,${releaseDue} AS releaseDueAt`;
function projectQuiz(row:QuizRow,now:string):ParentQuizGrade{
 const content=JSON.parse(row.contentJson) as QuizContent,policy=assignmentSettings(row.settingsJson?JSON.parse(row.settingsJson):undefined,content),score=scaledQuizScore(row.score,row.totalScore,policy.scoreMax),total=policy.scoreMax??row.totalScore,order=JSON.parse(row.orderJson) as {questions:string[]};
 if(!quizReleaseVisible(policy.scoreRelease,row.scoresReleasedAt,row.releaseDueAt||policy.dueAt,now))throw new ParentsError('成绩尚未发布或没有查看权限',404);
 return{id:row.id,title:content.title,subject:content.subject,kind:policy.kind,attemptNumber:row.attemptNumber||1,submittedAt:row.submittedAt,score,totalScore:total,percentage:percentage(score,total),questionCount:Array.isArray(order.questions)?order.questions.length:0,answersReleased:quizReleaseVisible(policy.answerRelease,row.answersReleasedAt,row.releaseDueAt||policy.dueAt,now)};
}
async function pageRows<T>(select:string,from:string,where:string,args:unknown[],page:number,order:string):Promise<ParentPage<T>>{
 const db=learningDb(),results=await db.batch([db.prepare(`SELECT count(*) AS total ${from} WHERE ${where}`).bind(...args),db.prepare(`SELECT ${select} ${from} WHERE ${where} ORDER BY ${order} LIMIT 20 OFFSET ?`).bind(...args,(page-1)*20)]),total=Number((results[0].results as {total:number}[])[0]?.total||0);
 return{items:results[1].results as T[]||[],page,pages:Math.max(1,Math.ceil(total/20)),total,pageSize:20};
}
async function quizResults(actor:Account,child:ParentChild,params:URLSearchParams):Promise<ParentQuizGradePage>{
 const scope=childScope(actor,child.studentId,child.student),month=parentMonth(params.get('month')),now=new Date().toISOString();
 const result=await pageRows<QuizRow>(quizSelect,quizFrom,`pa.group_id=? AND pa.student_name=? AND substr(datetime(pa.submitted_at,'+8 hours'),1,7)=? AND ${quizEligible} AND ${scope.sql}`,[actor.groupId,child.student,month,now,...scope.args],parentPage(params.get('page')),'pa.submitted_at DESC,pa.id DESC');
 return{...result,child,month,items:result.items.map(row=>projectQuiz(row,now))};
}
async function quizResult(actor:Account,child:ParentChild,params:URLSearchParams):Promise<ParentQuizGradeDetail>{
 const scope=childScope(actor,child.studentId,child.student),now=new Date().toISOString(),row=await learningDb().prepare(`SELECT ${quizSelect} ${quizFrom} WHERE pa.id=? AND pa.group_id=? AND pa.student_name=? AND ${quizEligible} AND ${scope.sql}`).bind(id(params.get('id')),actor.groupId,child.student,now,...scope.args).first<QuizRow>();
 if(!row)throw new ParentsError('成绩尚未发布或没有查看权限',404);
 const result=projectQuiz(row,now),feedback:ParentQuizGradeDetail['feedback']=[];
 if(result.answersReleased){const content=JSON.parse(row.contentJson) as QuizContent,order=JSON.parse(row.orderJson) as {questions:string[]},results=JSON.parse(row.resultsJson) as {questionId:string;points:number|null;feedback?:string}[];for(const [index,qid]of(order.questions||[]).entries()){const r=results.find(r=>r.questionId===qid),q=content.questions.find(q=>q.id===qid);if(q&&r?.feedback)feedback.push({questionNumber:index+1,points:r.points,maxPoints:q.points,comment:r.feedback});}}
 // No answer keys, submitted answers, flags, rubric or teacher-only grading notes.
 return{child,result,feedback};
}
const latestSubmission=`(SELECT sub.id FROM homework_submissions sub WHERE sub.group_id=h.group_id AND sub.homework_id=h.id AND sub.student_name=r.student_name ORDER BY sub.attempt DESC,sub.submitted_at DESC,sub.id DESC LIMIT 1)`;
const gradeMax=`(SELECT hist.max_score FROM homework_score_history hist WHERE hist.group_id=h.group_id AND hist.homework_id=h.id AND hist.student_name=r.student_name AND hist.submission_id=s.id AND hist.score IS r.score AND hist.changed_at=r.scored_at ORDER BY hist.changed_at DESC,hist.id DESC LIMIT 1)`;
const gradeExists=`r.score IS NOT NULL AND r.scored_at IS NOT NULL`;
const publishedFeedback=`EXISTS(SELECT 1 FROM homework_feedback f WHERE f.group_id=h.group_id AND f.homework_id=h.id AND f.submission_id=s.id)`;
const homeworkFrom=`FROM homework h JOIN homework_recipients r ON r.group_id=h.group_id AND r.homework_id=h.id JOIN homework_submissions s ON s.group_id=h.group_id AND s.homework_id=h.id AND s.student_name=r.student_name AND s.id=${latestSubmission}`;
const homeworkSelect=`h.id,h.title,h.subject,h.due_at AS dueAt,s.submitted_at AS submittedAt,CASE WHEN ${gradeExists} THEN r.score ELSE NULL END AS score,CASE WHEN ${gradeExists} THEN ${gradeMax} ELSE NULL END AS maxScore,CASE WHEN ${gradeExists} THEN r.scored_at ELSE NULL END AS scoredAt,(SELECT count(*) FROM homework_feedback f WHERE f.group_id=h.group_id AND f.homework_id=h.id AND f.submission_id=s.id) AS feedbackCount`;
function homeworkWhere(scope:string,month=false){return`h.group_id=? AND r.student_name=? AND h.starts_at<=? ${month?"AND substr(datetime(h.due_at,'+8 hours'),1,7)=?":''} AND ${classroomAccess('h')} AND (${gradeExists} OR ${publishedFeedback}) AND ${scope}`;}
async function homeworkGrades(actor:Account,child:ParentChild,params:URLSearchParams):Promise<ParentHomeworkGradePage>{
 const scope=childScope(actor,child.studentId,child.student),month=parentMonth(params.get('month')),now=new Date().toISOString(),result=await pageRows<ParentHomeworkGrade>(homeworkSelect,homeworkFrom,homeworkWhere(scope.sql,true),[actor.groupId,child.student,now,month,child.student,...scope.args],parentPage(params.get('page')),'h.due_at DESC,h.id DESC');
 return{...result,child,month};
}
async function homeworkGrade(actor:Account,child:ParentChild,params:URLSearchParams):Promise<ParentHomeworkGradeDetail>{
 const scope=childScope(actor,child.studentId,child.student),now=new Date().toISOString(),row=await learningDb().prepare(`SELECT ${homeworkSelect} ${homeworkFrom} WHERE h.id=? AND ${homeworkWhere(scope.sql)}`).bind(id(params.get('id')),actor.groupId,child.student,now,child.student,...scope.args).first<ParentHomeworkGrade>();
 if(!row)throw new ParentsError('评分或评语尚未发布，或没有查看权限',404);
 const page=parentPage(params.get('feedbackPage')),paged=(await learningDb().prepare(`SELECT f.id,f.comment,f.created_at AS createdAt,coalesce(a.teacher_name,a.name,'老师') AS teacherName,f.file_id AS fileId FROM homework_feedback f JOIN homework h ON h.group_id=f.group_id AND h.id=f.homework_id JOIN homework_recipients r ON r.group_id=h.group_id AND r.homework_id=h.id LEFT JOIN accounts a ON a.id=f.teacher_id AND a.group_id=f.group_id WHERE h.id=? AND h.group_id=? AND r.student_name=? AND h.starts_at<=? AND f.submission_id=${latestSubmission} AND ${classroomAccess('h')} AND ${scope.sql} ORDER BY f.created_at DESC,f.id DESC LIMIT 20 OFFSET ?`).bind(row.id,actor.groupId,child.student,now,child.student,...scope.args,(page-1)*20).all<{id:string;comment:string;createdAt:string;teacherName:string;fileId:string|null}>()).results||[];
 return{child,homework:row,feedback:paged.map(({fileId,...f})=>({...f,fileUrl:fileId?'/api/parents/files/'+encodeURIComponent(fileId)+'?studentId='+encodeURIComponent(child.studentId):null})),feedbackPage:page,feedbackPages:Math.max(1,Math.ceil(row.feedbackCount/20))};
}
const metricKeys=['scheduledLessons','attendedLessons','absentLessons','pendingAttendance','cancelledLessons','teacherAbsentLessons','homeworkAssigned','homeworkSubmitted','homeworkScored','homeworkOverdue','quizCompleted'] as const;
function metrics(row:Record<string,unknown>|undefined):ParentPerformanceMetrics{const out=Object.fromEntries(metricKeys.map(k=>[k,Number(row?.[k]||0)])) as Omit<ParentPerformanceMetrics,'quizAveragePercent'>;return{...out,quizAveragePercent:out.quizCompleted?round(Number(row?.quizPercentSum||0)/out.quizCompleted):null};}
async function performance(actor:Account,child:ParentChild,params:URLSearchParams):Promise<ParentPerformance>{
 const scope=childScope(actor,child.studentId,child.student),month=parentMonth(params.get('month')),page=parentPage(params.get('page')),now=new Date().toISOString(),db=learningDb();
 const cte=`WITH authorised AS(SELECT b.student_name AS student,b.group_id AS groupId FROM billing_students b WHERE b.group_id=? AND b.id=? AND ${scope.sql}),
 lesson_stats AS(SELECT l.subject,sum(l.status<>'cancelled') AS scheduledLessons,sum(l.status<>'cancelled' AND p.attendance_status IN ('present','late','early_leave','late_early')) AS attendedLessons,sum(l.status NOT IN('cancelled','teacher_absent') AND p.attendance_status='absent') AS absentLessons,sum(l.status NOT IN('cancelled','teacher_absent') AND coalesce(p.attendance_status,'pending')='pending') AS pendingAttendance,sum(l.status='cancelled') AS cancelledLessons,sum(l.status='teacher_absent') AS teacherAbsentLessons FROM lessons l JOIN authorised a ON a.groupId=l.group_id AND a.student=l.student LEFT JOIN class_session_participants p ON p.group_id=l.group_id AND p.lesson_id=l.id AND p.student_name=l.student WHERE substr(datetime(l.planned_start,'+8 hours'),1,7)=? GROUP BY l.subject),
 homework_stats AS(SELECT h.subject,count(*) AS homeworkAssigned,sum(EXISTS(SELECT 1 FROM homework_submissions s WHERE s.group_id=h.group_id AND s.homework_id=h.id AND s.student_name=r.student_name)) AS homeworkSubmitted,sum(r.score IS NOT NULL AND r.scored_at IS NOT NULL) AS homeworkScored,sum(h.due_at<? AND NOT EXISTS(SELECT 1 FROM homework_submissions s WHERE s.group_id=h.group_id AND s.homework_id=h.id AND s.student_name=r.student_name)) AS homeworkOverdue FROM homework h JOIN homework_recipients r ON r.group_id=h.group_id AND r.homework_id=h.id JOIN authorised a ON a.groupId=h.group_id AND a.student=r.student_name WHERE h.starts_at<=? AND substr(datetime(h.due_at,'+8 hours'),1,7)=? AND ${classroomAccess('h')} GROUP BY h.subject),
 quiz_stats AS(SELECT json_extract(v.content_json,'$.subject') AS subject,count(*) AS quizCompleted,sum(pa.score*100.0/pa.total_score) AS quizPercentSum ${quizFrom} JOIN authorised a ON a.groupId=pa.group_id AND a.student=pa.student_name WHERE substr(datetime(pa.submitted_at,'+8 hours'),1,7)=? AND ${quizEligible} GROUP BY json_extract(v.content_json,'$.subject')),
 subject_rows AS(SELECT subject,scheduledLessons,attendedLessons,absentLessons,pendingAttendance,cancelledLessons,teacherAbsentLessons,0 AS homeworkAssigned,0 AS homeworkSubmitted,0 AS homeworkScored,0 AS homeworkOverdue,0 AS quizCompleted,0.0 AS quizPercentSum FROM lesson_stats UNION ALL SELECT subject,0,0,0,0,0,0,homeworkAssigned,homeworkSubmitted,homeworkScored,homeworkOverdue,0,0.0 FROM homework_stats UNION ALL SELECT subject,0,0,0,0,0,0,0,0,0,0,quizCompleted,quizPercentSum FROM quiz_stats),
 by_subject AS(SELECT min(subject) AS subject,${metricKeys.map(k=>`sum(${k}) AS ${k}`).join(',')},sum(quizPercentSum) AS quizPercentSum FROM subject_rows GROUP BY lower(trim(subject)))`;
 const args=[actor.groupId,child.studentId,...scope.args,month,now,now,month,child.student,month,now];
 const result=await db.batch([db.prepare(`${cte} SELECT ${metricKeys.map(k=>`sum(${k}) AS ${k}`).join(',')},sum(quizPercentSum) AS quizPercentSum,count(*) AS subjectCount FROM by_subject`).bind(...args),db.prepare(`${cte} SELECT * FROM by_subject ORDER BY subject LIMIT 20 OFFSET ?`).bind(...args,(page-1)*20)]),sum=(result[0].results as Record<string,unknown>[])[0],total=Number(sum?.subjectCount||0);
 return{child,month,summary:metrics(sum),subjects:(result[1].results as (Record<string,unknown>&{subject:string})[]).map(row=>({subject:row.subject,...metrics(row)})),page,pages:Math.max(1,Math.ceil(total/20)),total,pageSize:20,capabilities:{syllabusProgress:false,selfStudyCompletion:false},basis:{timezone:'Asia/Singapore',attendance:'scheduled_month_personal_attendance',homework:'due_month_current_recipient',quiz:'published_final_attempts',quizAverage:'equal_weight_per_attempt'}};
}
export async function parentLearningView(actor:Account,params:URLSearchParams){
 const child=await selectedChild(actor,id(params.get('studentId'))),view=parentText(params.get('view'));
 let result:unknown;if(view==='quizResults')result=await quizResults(actor,child,params);else if(view==='quizResult')result=await quizResult(actor,child,params);else if(view==='homeworkGrades')result=await homeworkGrades(actor,child,params);else if(view==='homeworkGrade')result=await homeworkGrade(actor,child,params);else if(view==='performance')result=await performance(actor,child,params);else throw new ParentsError('学习页面不存在',404);
 await recheckChild(actor,child);return result;
}
export async function parentHomeworkReviewFile(actor:Account,studentId:string,fileId:string){
 const child=await selectedChild(actor,id(studentId)),scope=childScope(actor,child.studentId,child.student),now=new Date().toISOString();
 const file=await learningDb().prepare(`SELECT file.id,file.object_key AS objectKey,file.filename,file.bytes FROM pdf_files file WHERE file.group_id=? AND file.id=? AND file.status='attached' AND ${scope.sql} AND EXISTS(SELECT 1 FROM homework_feedback f JOIN homework h ON h.group_id=f.group_id AND h.id=f.homework_id JOIN homework_recipients r ON r.group_id=h.group_id AND r.homework_id=h.id WHERE f.group_id=file.group_id AND f.file_id=file.id AND r.student_name=? AND h.starts_at<=? AND f.submission_id=${latestSubmission} AND ${classroomAccess('h')})`).bind(actor.groupId,id(fileId),...scope.args,child.student,now,child.student).first<{id:string;objectKey:string;filename:string;bytes:number}>();
 if(!file)throw new ParentsError('文件未发布或没有查看权限',404);return{file,recheck:async()=>{await parentHomeworkReviewFile(actor,studentId,fileId);}};
}
