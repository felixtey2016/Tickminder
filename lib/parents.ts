/** Baseline parent teaching projections. Released grades and finance use separate authorized DTOs. */
export class ParentsError extends Error {constructor(message:string,readonly status=400){super(message);}}
export type ParentPage<T>={items:T[];page:number;pages:number;total:number;pageSize:20};
export type ParentChild={studentId:string;student:string;syllabusName:string|null;grade:string|null};
export type ParentLink={id:string;studentId:string;student:string;active:boolean;revision:number;updatedAt:string};
export type ParentLinksResponse={parent:{id:string;name:string;disabled:boolean};links:ParentLink[];canManage:boolean;page:number;pages:number;total:number;pageSize:20};
export type ParentLesson={id:string;subject:string;teacherName:string;classroomTitle:string|null;plannedStart:string;plannedEnd:string;status:string;attendanceStatus:string;arrivedAt:string|null;leftAt:string|null};
export type ParentCalendarDay={date:string;total:number;scheduled:number;completed:number;absent:number;cancelled:number};
export type ParentCalendar={child:ParentChild;month:string;days:ParentCalendarDay[]};
export type ParentHomework={id:string;title:string;description:string;subject:string;dueAt:string;startsAt:string;completed:boolean;submittedAt:string|null;attachmentUrl:string|null};
export type ParentMaterial={id:string;title:string;description:string|null;subject:string;createdAt:string;fileUrl:string};
export type ParentRecording={id:string;title:string;description:string;subject:string;classroomTitle:string;lessonDate:string;openUrl:string};
export type ParentChildResponse={child:ParentChild;month:string;lessons:ParentPage<ParentLesson>;homework:ParentPage<ParentHomework>};
export const parentText=(value:unknown)=>typeof value==='string'?value.trim():'';
// Older databases require 2-500 characters in the relationship-history column.
// Keep the supplied text unchanged in operation hashes and audit JSON; only
// legacy rows use an explicit system description when no note was supplied.
export function parentReasonForStorage(reason:string){return reason.length===0?'未填写核实记录':Array.from(reason).length===1?'备注：'+reason:reason;}
export function parentPage(value:unknown){if(value===null||value===undefined||value==='')return 1;const p=Number(value);if(!Number.isSafeInteger(p)||p<1||p>100000)throw new ParentsError('分页信息无效，请刷新重试');return p;}
export function parentMonth(value:unknown){const month=parentText(value)||new Date(Date.now()+8*3600000).toISOString().slice(0,7);if(!/^20\d\d-(?:0[1-9]|1[0-2])$/.test(month))throw new ParentsError('请选择有效月份');return month;}
export function parentOperationId(value:unknown){const id=parentText(value);if(!/^[a-zA-Z0-9_-]{16,100}$/.test(id))throw new ParentsError('操作标识已失效，请重新打开窗口',409);return id;}
