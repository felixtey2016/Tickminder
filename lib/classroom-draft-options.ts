import type {AcademicCatalogue} from './academic-catalogue';

export type ClassroomDraftPlan = {student:string;teacherName:string;subjectId?:string|null;syllabusId?:string|null;grade?:string|null;active:boolean};
export type ClassroomCourseChoice = {key:string;syllabusId:string;syllabusName:string;subjectId:string;subjectName:string;grade:string};

/** Input plans must already be restricted to the actor's active student/teacher pairs. */
export function classroomDraftOptions(plans:ClassroomDraftPlan[],teacher:string,members:string[],catalogue:AcademicCatalogue|null|undefined) {
  const paired=plans.filter(plan=>plan.active&&plan.teacherName===teacher);
  const students=[...new Set(paired.map(plan=>plan.student))].sort((a,b)=>a.localeCompare(b));
  const selected=[...new Set(members)];
  const byStudent=new Map<string,Map<string,ClassroomCourseChoice>>();
  for(const plan of paired){
    // IDs and grade are deliberately exact: a label/alias is not a safe cross-syllabus identity.
    const syllabus=catalogue?.syllabuses.find(item=>item.active&&item.id===plan.syllabusId);
    const subject=syllabus?.subjects.find(item=>item.active&&item.id===plan.subjectId);
    if(!syllabus||!subject||!plan.grade||!syllabus.grades.includes(plan.grade))continue;
    const key=JSON.stringify([syllabus.id,plan.grade,subject.id]);
    const choices=byStudent.get(plan.student)||new Map<string,ClassroomCourseChoice>();
    choices.set(key,{key,syllabusId:syllabus.id,syllabusName:syllabus.name,subjectId:subject.id,subjectName:subject.name,grade:plan.grade});
    byStudent.set(plan.student,choices);
  }
  const choices=selected.length?[...(byStudent.get(selected[0])?.values()||[])].filter(choice=>selected.every(student=>byStudent.get(student)?.has(choice.key))):[];
  choices.sort((a,b)=>`${a.subjectName} ${a.syllabusName} ${a.grade}`.localeCompare(`${b.subjectName} ${b.syllabusName} ${b.grade}`));
  return {students,choices,incompleteStudents:selected.filter(student=>!byStudent.get(student)?.size)};
}
