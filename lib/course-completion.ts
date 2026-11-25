export type CourseCompletionFilter='all'|'completed'|'incomplete';
type CourseState={status:string;sessionType?:string;sessionStatus?:string;teachingStatus?:string};
export function courseIsCompleted(course:CourseState){
 if(course.sessionType!=='group')return course.status==='completed';
 if(course.teachingStatus==='taught'||course.teachingStatus==='completed')return true;
 if(course.teachingStatus&&course.teachingStatus!=='pending')return false;
 return (course.sessionStatus||course.status)==='completed';
}
export function matchesCourseCompletion(course:CourseState,filter:string){return filter==='completed'?courseIsCompleted(course):filter==='incomplete'?!courseIsCompleted(course):true;}
