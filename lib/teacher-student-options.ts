/** Minimal names-only relation. Sources must already be authorized for their screen. */
export type TeacherStudentPair={teacher:string;student:string};
const unselected=(value:string)=>!value||value==='all';
const unique=(values:readonly string[])=>[...new Set(values.filter(Boolean))];

export function allowedTeacherOptions(student:string,pairs:readonly TeacherStudentPair[]):string[]{
 return unique(pairs.filter(pair=>unselected(student)||pair.student===student).map(pair=>pair.teacher));
}
export function allowedStudentOptions(teacher:string,pairs:readonly TeacherStudentPair[]):string[]{
 return unique(pairs.filter(pair=>unselected(teacher)||pair.teacher===teacher).map(pair=>pair.student));
}
export function isTeacherStudentPair(pairs:readonly TeacherStudentPair[],teacher:string,student:string){
 return unselected(teacher)||unselected(student)||pairs.some(pair=>pair.teacher===teacher&&pair.student===student);
}
/** Preserve the caller's option ordering; All/empty remains the caller's own option. */
export function teacherStudentOptions(teachers:readonly string[],students:readonly string[],pairs:readonly TeacherStudentPair[],teacher:string,student:string):{teachers:string[];students:string[]}{
 const teacherSet=new Set(allowedTeacherOptions(student,pairs)),studentSet=new Set(allowedStudentOptions(teacher,pairs));
 return{teachers:unique(teachers).filter(value=>teacherSet.has(value)),students:unique(students).filter(value=>studentSet.has(value))};
}
