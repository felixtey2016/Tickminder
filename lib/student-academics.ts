import { groupReader, groupStatement } from "./group-data";
import { readAcademicCatalogue } from "./academic-catalogue-server";
import { catalogueGradeValid, findCatalogueGrade, findCatalogueSubject, findCatalogueSyllabus,type AcademicCatalogue } from "./academic-catalogue";

export class StudentAcademicError extends Error { constructor(message:string,readonly status=400){super(message);} }
const str=(value:unknown)=>typeof value==='string'?value.trim():'';
export async function studentProfileInput(data:Record<string,unknown>,previous?:{syllabusId:string;grade:string|null;age:number|null},provided?:AcademicCatalogue){
 const catalogue=provided||await readAcademicCatalogue('student'),syllabusId=str(data.syllabusId)||previous?.syllabusId||'',syllabus=findCatalogueSyllabus(catalogue,syllabusId);
 if(!syllabus||(!syllabus.active&&syllabus.id!==previous?.syllabusId))throw new StudentAcademicError('请选择有效的课程体系');
 const inputGrade=data.grade===undefined?previous?.grade||null:str(data.grade)||null;
 if(!catalogueGradeValid(syllabus,inputGrade))throw new StudentAcademicError('请选择该课程体系的年级');
 const grade=findCatalogueGrade(syllabus,inputGrade)||null;
 const value=data.age===undefined?previous?.age??null:data.age;
 const age=value===null||value===''?null:Number(value);
 if(age!==null&&((typeof value!=='string'&&typeof value!=='number')||typeof value==='string'&&!/^\d{1,3}$/.test(value)||!Number.isInteger(age)||age<0||age>100))throw new StudentAcademicError('年龄须为 0 至 100 的整数，或留空');
 return {syllabusId:syllabus.id,grade,age};
}
export async function allocationSubject(syllabusId:string,value:string,existingId?:string|null,provided?:AcademicCatalogue){
 const catalogue=provided||await readAcademicCatalogue('student'),syllabus=findCatalogueSyllabus(catalogue,syllabusId),subject=syllabus&&findCatalogueSubject(syllabus,value);
 if(!syllabus||!subject||(!syllabus.active&&!existingId)||(!subject.active&&subject.id!==existingId))throw new StudentAcademicError('请选择该课程体系的有效科目');
 return {syllabus,subject};
}
export type AcademicPlanSnapshot={key:string;subject:string;subjectId:string|null;teacherName:string;active:number};
export async function studentAcademicSnapshot(groupId:string,studentName:string){
 return groupReader(groupId).rows<AcademicPlanSnapshot>('SELECT key,subject,subject_id AS subjectId,teacher_name AS teacherName,active FROM plans WHERE student=? ORDER BY key',studentName);
}
export function studentAcademicGuard(groupId:string,studentName:string,before:{syllabusId:string;grade:string|null;age:number|null;active:boolean},catalogue:AcademicCatalogue,snapshot:AcademicPlanSnapshot[]){
 const signature=JSON.stringify(snapshot.map(plan=>[plan.key,plan.subject,plan.subjectId,plan.teacherName,Number(plan.active)]));
 return {sql:"EXISTS(SELECT 1 FROM students WHERE name=? AND group_id=? AND syllabus_id=? AND grade IS ? AND age IS ? AND active=?) AND EXISTS(SELECT 1 FROM academic_catalogues WHERE scope='student' AND revision=?) AND coalesce((SELECT json_group_array(json_array(key,subject,subject_id,teacher_name,active)) FROM (SELECT key,subject,subject_id,teacher_name,active FROM plans WHERE student=? AND group_id=? ORDER BY key)),'[]')=?",args:[studentName,groupId,before.syllabusId,before.grade,before.age,before.active?1:0,catalogue.revision,studentName,groupId,signature]};
}
export async function studentSyllabusPlanUpdates(groupId:string,studentName:string,previous:string,next:string,provided?:AcademicCatalogue,snapshot?:AcademicPlanSnapshot[],claim?:{sql:string;args:unknown[]}){
 if(previous===next)return [];
 const catalogue=provided||await readAcademicCatalogue('student'),syllabus=findCatalogueSyllabus(catalogue,next);
 if(!syllabus?.active)throw new StudentAcademicError('请选择有效的课程体系');
 const plans=snapshot||await studentAcademicSnapshot(groupId,studentName),updates=[];
 for(const plan of plans){
  const subject=(plan.subjectId?findCatalogueSubject(syllabus,plan.subjectId):undefined)||findCatalogueSubject(syllabus,plan.subject);
  if(!subject||!subject.active)throw new StudentAcademicError(`此学生的科目「${plan.subject}」未包含在新课程体系中，请先由平台最高管理员补充菜单`);
  updates.push(groupStatement(groupId,'UPDATE plans SET subject_id=? WHERE key=? AND group_id=?'+(claim?' AND '+claim.sql:'')).bind(subject.id,plan.key,groupId,...(claim?.args||[])));
 }
 return updates;
}

// Stable catalogue IDs classify live records. Historical names and plan keys stay intact.
export async function refreshStudentClassifications(groupId:string,studentName:string){
 const {rows}=groupReader(groupId),classes=await rows<{id:string}>('SELECT DISTINCT classroom_id AS id FROM classroom_members WHERE student_name=?',studentName);
 for(const item of classes)await inferClassroomClassification(groupId,item.id);
}
export async function refreshClassroomAcademicMetadata(groupId:string){
 const {rows}=groupReader(groupId);
 for(const item of await rows<{id:string}>('SELECT id FROM classrooms'))await inferClassroomClassification(groupId,item.id);
}
export async function inferClassroomClassification(groupId:string,classroomId:string){
 const {rows}=groupReader(groupId);
 const members=await rows<{syllabusId:string;grade:string|null;subjectId:string|null;classGrade:string|null;classSubject:string}>(`SELECT s.syllabus_id AS syllabusId,s.grade,p.subject_id AS subjectId,c.grade AS classGrade,c.subject AS classSubject FROM classroom_members m JOIN classrooms c ON c.id=m.classroom_id JOIN students s ON s.name=m.student_name LEFT JOIN plans p ON p.student=m.student_name AND p.teacher_name=c.teacher_name AND (p.subject=c.subject OR (c.subject_id IS NOT NULL AND p.subject_id=c.subject_id)) AND p.active=1 WHERE c.id=?`,classroomId);
 if(!members.length)return;
 const agreed=(values:Array<string|null>)=>values.every(Boolean)&&new Set(values).size===1?values[0]:null;
 const syllabusId=agreed(members.map(row=>row.syllabusId)),catalogue=await readAcademicCatalogue('student'),syllabus=syllabusId?findCatalogueSyllabus(catalogue,syllabusId):undefined;
 const knownSubjects=members.map(row=>row.subjectId).filter((value):value is string=>Boolean(value)),labelSubject=syllabus&&findCatalogueSubject(syllabus,members[0].classSubject);
 const matchedSubject=syllabusId?(agreed(members.map(row=>row.subjectId))||(labelSubject&&knownSubjects.every(value=>value===labelSubject.id)?labelSubject.id:null)):null;
 const subjectId=syllabus&&matchedSubject&&findCatalogueSubject(syllabus,matchedSubject)?matchedSubject:null;
 const existingGrade=members[0].classGrade,compatible=existingGrade&&members.every(row=>!row.grade||row.grade===existingGrade);
 const matchedGrade=syllabusId?(agreed(members.map(row=>row.grade))||(compatible?existingGrade:null)):null,grade=syllabus&&catalogueGradeValid(syllabus,matchedGrade)?matchedGrade:null;
 await groupStatement(groupId,'UPDATE classrooms SET syllabus_id=?,subject_id=?,grade=?,updated_at=? WHERE id=? AND group_id=?').bind(syllabusId,subjectId,grade,new Date().toISOString(),classroomId,groupId).run();
}
