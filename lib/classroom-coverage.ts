import {classPlanSubjectSql} from './academic-subject-match';
import {groupReader,groupStatement} from './group-data';

export const classroomRequiredMessage='有效的学生科目必须保留至少一个班级。请先加入另一个同老师、同科目的班级，或停用该科目配对。';

export async function classroomPlanKeys(groupId:string,classroomId:string){
 const result=await groupReader(groupId).rows<{key:string}>(`SELECT DISTINCT p.key FROM classrooms c JOIN classroom_members m ON m.classroom_id=c.id AND m.group_id=c.group_id JOIN plans p ON p.student=m.student_name AND p.group_id=c.group_id JOIN students s ON s.name=p.student AND s.group_id=p.group_id JOIN teachers t ON t.name=p.teacher_name AND t.group_id=p.group_id WHERE c.id=? AND p.teacher_name=c.teacher_name AND ${classPlanSubjectSql()} AND p.active=1 AND s.active=1 AND t.active=1`,classroomId);
 return result.map(row=>row.key);
}

// Place last in the same D1 batch as membership removal/archive/deletion. A
// failing expression aborts the complete batch, including bulk operations.
// Keys are bound values, and the scoped views prevent foreign-group coverage.
export function classroomCoverageGuard(groupId:string,keys?:string[]){
 const selected=[...new Set(keys||[])];
 const predicate=selected.length?`p.key IN (${selected.map(()=>'?').join(',')})`:keys?'0':'1';
 return groupStatement(groupId,`SELECT CASE WHEN EXISTS(SELECT 1 FROM plans p JOIN students s ON s.name=p.student AND s.group_id=p.group_id JOIN teachers t ON t.name=p.teacher_name AND t.group_id=p.group_id WHERE ${predicate} AND p.active=1 AND s.active=1 AND t.active=1 AND NOT EXISTS(SELECT 1 FROM classrooms c JOIN classroom_members m ON m.classroom_id=c.id AND m.group_id=c.group_id WHERE m.student_name=p.student AND c.group_id=p.group_id AND c.archived=0 AND c.teacher_name=p.teacher_name AND ${classPlanSubjectSql()})) THEN json('classroom_required') ELSE 1 END AS covered`).bind(...selected);
}

export function isClassroomCoverageFailure(error:unknown){return /malformed JSON/i.test(String(error));}
