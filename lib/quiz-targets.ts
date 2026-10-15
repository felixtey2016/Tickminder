import type {Account} from '@/lib/auth';
import {learningDb} from '@/lib/learning-server';
import {QuizError} from '@/lib/quiz';
import {quizSubjectKey,quizSubjectSql} from '@/lib/quiz-subjects';
import type {PracticeTargetOptions} from '@/lib/quiz-practice-types';

// Every field is trusted SQL supplied by the caller. Expressions are evaluated
// once, in declaration order, so '?' placeholders have predictable bindings.
export type QuizTargetSql={groupId:string;subject:string;teacherName?:string;allowCrossSubject?:string};
export function quizClassroomEligibleSql(input:QuizTargetSql&{classroomId:string;studentName?:string}){
 const fields=[`${input.groupId} AS target_group`,`${input.subject} AS target_subject`,`${input.teacherName??'NULL'} AS target_teacher`,`${input.classroomId} AS target_class`,`${input.studentName??'NULL'} AS target_student`,`${input.allowCrossSubject??'0'} AS allow_cross_subject`];
 const subjectGuard=input.allowCrossSubject==='1'?'1':`${quizSubjectSql('quiz_target_input.target_subject')}<>'' AND (quiz_target_input.allow_cross_subject=1 OR ${quizSubjectSql('quiz_target_class.subject')}=${quizSubjectSql('quiz_target_input.target_subject')})`;
 return `EXISTS(SELECT 1 FROM (SELECT ${fields.join(',')}) quiz_target_input JOIN classrooms quiz_target_class ON quiz_target_class.id=quiz_target_input.target_class AND quiz_target_class.group_id=quiz_target_input.target_group AND quiz_target_class.archived=0 JOIN teachers quiz_target_teacher ON quiz_target_teacher.group_id=quiz_target_class.group_id AND quiz_target_teacher.name=quiz_target_class.teacher_name AND quiz_target_teacher.active=1 WHERE (quiz_target_input.target_teacher IS NULL OR quiz_target_class.teacher_name=quiz_target_input.target_teacher) AND ${subjectGuard} ${input.studentName?`AND EXISTS(SELECT 1 FROM classroom_members quiz_target_member JOIN students quiz_target_student ON quiz_target_student.group_id=quiz_target_member.group_id AND quiz_target_student.name=quiz_target_member.student_name AND quiz_target_student.active=1 WHERE quiz_target_member.classroom_id=quiz_target_class.id AND quiz_target_member.group_id=quiz_target_class.group_id AND quiz_target_member.student_name=quiz_target_input.target_student)`:''})`;
}
export function quizStudentEligibleSql(input:QuizTargetSql&{studentName:string}){
 const fields=[`${input.groupId} AS target_group`,`${input.subject} AS target_subject`,`${input.teacherName??'NULL'} AS target_teacher`,`${input.studentName} AS target_student`,`${input.allowCrossSubject??'0'} AS allow_cross_subject`];
 const subjectPresent=input.allowCrossSubject==='1'?'1':`${quizSubjectSql('quiz_target_input.target_subject')}<>''`,matches=(column:string)=>input.allowCrossSubject==='1'?'1':`(quiz_target_input.allow_cross_subject=1 OR ${quizSubjectSql(column)}=${quizSubjectSql('quiz_target_input.target_subject')})`;
 return `EXISTS(SELECT 1 FROM (SELECT ${fields.join(',')}) quiz_target_input JOIN students quiz_target_student ON quiz_target_student.group_id=quiz_target_input.target_group AND quiz_target_student.name=quiz_target_input.target_student AND quiz_target_student.active=1 WHERE ${subjectPresent} AND (EXISTS(SELECT 1 FROM plans quiz_target_plan JOIN teachers quiz_target_plan_teacher ON quiz_target_plan_teacher.group_id=quiz_target_plan.group_id AND quiz_target_plan_teacher.name=quiz_target_plan.teacher_name AND quiz_target_plan_teacher.active=1 WHERE quiz_target_plan.group_id=quiz_target_input.target_group AND quiz_target_plan.student=quiz_target_input.target_student AND quiz_target_plan.active=1 AND (quiz_target_input.target_teacher IS NULL OR quiz_target_plan.teacher_name=quiz_target_input.target_teacher) AND ${matches('quiz_target_plan.subject')}) OR EXISTS(SELECT 1 FROM classroom_members quiz_target_member JOIN classrooms quiz_target_class ON quiz_target_class.group_id=quiz_target_member.group_id AND quiz_target_class.id=quiz_target_member.classroom_id AND quiz_target_class.archived=0 JOIN teachers quiz_target_class_teacher ON quiz_target_class_teacher.group_id=quiz_target_class.group_id AND quiz_target_class_teacher.name=quiz_target_class.teacher_name AND quiz_target_class_teacher.active=1 WHERE quiz_target_member.group_id=quiz_target_input.target_group AND quiz_target_member.student_name=quiz_target_input.target_student AND (quiz_target_input.target_teacher IS NULL OR quiz_target_class.teacher_name=quiz_target_input.target_teacher) AND ${matches('quiz_target_class.subject')})))`;
}

export type QuizTargetOptions=PracticeTargetOptions&{diagnostics:{classroomCount:number;studentCount:number;subjects:string[];emptyReason:'no_targets'|'subject_mismatch'|'no_students'|null;matchingClassroomCount:number;matchingStudentCount:number;allowCrossSubject:boolean}};
// A quiz's subject is metadata, not an allocation permission. Teachers may assign
// any subject to their own current students/classes; tenant and roster checks
// still apply. The optional subject argument remains for the route contract.
export async function readQuizTargetOptions(a:Account,subject?:string):Promise<QuizTargetOptions>{
 if(!a.groupId||!['teacher','admin'].includes(a.role)||a.role==='teacher'&&!a.teacherName)throw new QuizError('quiz.forbidden',403);
 const db=learningDb(),teacher=a.role==='teacher',ownSql=teacher?'AND c.teacher_name=?':'',ownValues=teacher?[a.teacherName]:[];
 const [classResult,studentResult]=await Promise.all([
  db.prepare(`SELECT c.id,c.title,c.subject,s.name AS studentName FROM classrooms c JOIN teachers t ON t.group_id=c.group_id AND t.name=c.teacher_name AND t.active=1 LEFT JOIN classroom_members m ON m.group_id=c.group_id AND m.classroom_id=c.id LEFT JOIN students s ON s.group_id=m.group_id AND s.name=m.student_name AND s.active=1 WHERE c.group_id=? AND c.archived=0 ${ownSql} ORDER BY c.title,c.id,s.name`).bind(a.groupId,...ownValues).all<{id:string;title:string;subject:string;studentName:string|null}>(),
  db.prepare(`SELECT DISTINCT p.student AS studentName,p.subject FROM plans p JOIN students s ON s.group_id=p.group_id AND s.name=p.student AND s.active=1 JOIN teachers t ON t.group_id=p.group_id AND t.name=p.teacher_name AND t.active=1 WHERE p.group_id=? AND p.active=1 ${teacher?'AND p.teacher_name=?':''} UNION SELECT DISTINCT m.student_name AS studentName,c.subject FROM classroom_members m JOIN classrooms c ON c.id=m.classroom_id AND c.group_id=m.group_id AND c.archived=0 JOIN teachers t ON t.group_id=c.group_id AND t.name=c.teacher_name AND t.active=1 JOIN students s ON s.group_id=m.group_id AND s.name=m.student_name AND s.active=1 WHERE m.group_id=? ${ownSql} ORDER BY studentName,subject`).bind(a.groupId,...ownValues,a.groupId,...ownValues).all<{studentName:string;subject:string}>(),
 ]);
 const classes=new Map<string,PracticeTargetOptions['classrooms'][number]>(),students=new Map<string,Set<string>>();
 for(const row of classResult.results){if(!classes.has(row.id))classes.set(row.id,{id:row.id,title:row.title,subject:row.subject,students:[]});if(row.studentName&&!classes.get(row.id)!.students.includes(row.studentName))classes.get(row.id)!.students.push(row.studentName);}
 for(const row of studentResult.results){if(!students.has(row.studentName))students.set(row.studentName,new Set());students.get(row.studentName)!.add(row.subject);}
 void subject;
 const allClasses=[...classes.values()],allStudents=[...students].map(([studentName,subjects])=>({studentName,subjects:[...subjects]})),allowCrossSubject=true;
 const classrooms=allClasses,matchingStudents=allStudents;
 const availableSubjects=[...new Set([...allClasses.map(c=>c.subject),...allStudents.flatMap(s=>s.subjects)].filter(s=>quizSubjectKey(s)))].sort((a,b)=>a.localeCompare(b));
 let emptyReason:QuizTargetOptions['diagnostics']['emptyReason']=null;
 if(!allClasses.length&&!allStudents.length)emptyReason='no_targets';
 else if(!matchingStudents.length&&!classrooms.some(c=>c.students.length))emptyReason='no_students';
 return {classrooms,students:matchingStudents,diagnostics:{classroomCount:allClasses.length,studentCount:allStudents.length,subjects:availableSubjects,emptyReason,matchingClassroomCount:classrooms.length,matchingStudentCount:matchingStudents.length,allowCrossSubject}};
}
