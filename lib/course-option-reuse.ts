import type {TeacherStudentPair} from './teacher-student-options';
import type {PrivateReadSnapshot} from './private-read-lifecycle';

/** Only an already mounted consumer owns these names. No global/session storage. */
export type CourseOptionsSnapshot={key:string;revision:number;pairs:TeacherStudentPair[]};
export function courseOptionsKey(params:Record<string,string>|null,context:PrivateReadSnapshot,refreshKey?:unknown){
 if(!params||context.blocked||!context.identity||context.identity==='anonymous')return null;
 const mode=params.mode||(params.view==='reschedules'?'pending':'month');
 // These options depend on the advancing clock even without a data mutation.
 if(mode==='pending'||mode==='upcoming')return null;
 const query=Object.entries(params).filter(([key])=>!['page','teacher','student','optionsOnly','includeOptions'].includes(key)).sort(([a],[b])=>a.localeCompare(b));
 return JSON.stringify([context.identity,context.groupId,context.clearEpoch,context.epoch,context.authEpoch,refreshKey,query]);
}
export function courseOptionsSnapshot(key:string|null,value:{revision:number;teacherStudentPairs?:TeacherStudentPair[]}):CourseOptionsSnapshot|null{
 return key&&Number.isSafeInteger(value.revision)&&Array.isArray(value.teacherStudentPairs)?{key,revision:value.revision,pairs:value.teacherStudentPairs.map(pair=>({...pair}))}:null;
}
export function reusableCourseOptions(key:string|null,...sources:Array<CourseOptionsSnapshot|null|undefined>){
 return key?sources.find(source=>source?.key===key)||null:null;
}
