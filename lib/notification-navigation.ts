import type {SessionLesson} from './class-session-display';
export type NotificationLessonRecord=SessionLesson&{student:string;subject:string;teacherName:string;plannedStart:string;plannedEnd:string;actualStart:string|null;actualEnd:string|null;status:string;attendanceKind?:string|null;note?:string|null;chargeable?:boolean|null;reviewedAt?:string|null;kind:string;seriesId:string|null;replacementFor:string|null;onlineLink?:string|null};
export type NotificationDestination =
 | {kind:'lesson';recordId:string}
 | {kind:'homework'|'material';recordId:string}
 | {kind:'quiz';assignmentId:string;attemptId?:string};

export type NotificationNavigationItem={contentKind?:string;recordId?:string;lessonId?:string;attemptId?:string};
const identifier=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\u0000-\u001f]/.test(value);
// The inbox supplies object IDs only. Never interpret message text or a URL as
// an authority grant; destination APIs recheck the live recipient and source.
export function notificationDestination(item:NotificationNavigationItem):NotificationDestination|null{
 if(item.contentKind==='quiz'&&identifier(item.recordId))return{kind:'quiz',assignmentId:item.recordId,...identifier(item.attemptId)?{attemptId:item.attemptId}:{}};
 if((item.contentKind==='homework'||item.contentKind==='material')&&identifier(item.recordId))return{kind:item.contentKind,recordId:item.recordId};
 if(!item.contentKind&&identifier(item.lessonId))return{kind:'lesson',recordId:item.lessonId};
 return null;
}
