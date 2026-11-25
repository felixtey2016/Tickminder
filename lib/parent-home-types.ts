import type {ParentChild,ParentCourseLesson,ParentPage} from './parents';

export type ParentHomeResponse={
 date:string;
 children:ParentPage<ParentChild>;
 today:ParentPage<ParentCourseLesson>;
 nextLesson:ParentCourseLesson|null;
 financeTarget:{studentId:string;childPage:number}|null;
 homeworkTarget:{studentId:string;childPage:number;month:string}|null;
 summary:{pendingHomework:number;unpaidInvoices:number;remainingCents:number;financialChildren:number;totalChildren:number};
};
