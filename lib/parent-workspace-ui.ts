export type ParentCourseStatus='all'|'upcoming'|'completed'|'absent'|'cancelled';
export type ParentWorkspaceTarget={
 targetId:string;
 view:'calendar'|'lessons'|'homework'|'finance';
 studentId?:string;
 childPage?:number;
 month?:string;
 date?:string;
 status?:ParentCourseStatus;
};
