import type {BillingMode} from './billing';

export type CourseSetupPair={key:string;student:string;subject:string;subjectId?:string|null;syllabusId?:string;grade?:string|null;teacherName:string;active:boolean};
export type CoursePayClassroom={id:string;title:string;subject:string;subjectId?:string|null;syllabusId?:string|null;grade?:string|null;teacherName:string;archived:number|boolean;members?:string[]};
const label=(value:string)=>value.trim().toLocaleLowerCase();
/** This narrows an already authorized classroom response; the API owns authority. */
export function coursePayTargets(pair:CourseSetupPair,classrooms:readonly CoursePayClassroom[]){
 if(!pair.active)return [];
 return classrooms.filter(room=>!room.archived&&room.teacherName===pair.teacherName&&room.members?.includes(pair.student)&&
  (!room.syllabusId||room.syllabusId===pair.syllabusId)&&(!room.grade||room.grade===pair.grade)&&
  (room.subjectId?Boolean(pair.subjectId&&room.subjectId===pair.subjectId):label(room.subject)===label(pair.subject)));
}
/** Existing per-lesson records remain editable; new subjects offer hour/month. */
export function studentRateModes(rates:readonly {mode:BillingMode}[]):BillingMode[]{return rates.some(rate=>rate.mode==='lesson')?['hour','lesson','month']:['hour','month'];}
export function existingCoursePair(plans:readonly CourseSetupPair[],student:string,subject:string,subjectId?:string){
 return plans.find(plan=>plan.student===student&&(Boolean(subjectId&&plan.subjectId===subjectId)||label(plan.subject)===label(subject)));
}
