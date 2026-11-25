import type {PrepaymentPreview} from './prepayments';
export type ScheduledTuition={studentId:string;month:string;hourlyCents:number;monthlyCents:number;lessonCents:number;totalCents:number;lessonCount:number;complete:boolean;needsMonthlyReview:boolean;blockers:string[];lines:{subject:string;mode:string;lessonCount:number;amountCents:number}[]};
/** A schedule forecast is never a receipt, invoice, or wallet credit. */
export function scheduledTuition(preview:PrepaymentPreview):ScheduledTuition{
 const {document,blockers}=preview,lines=document.lines.map(({subject,mode,lessonCount,amountCents})=>({subject,mode,lessonCount,amountCents}));
 const sum=(mode:string)=>lines.filter(line=>line.mode===mode).reduce((n,line)=>n+line.amountCents,0);
 const hourlyCents=sum('hour'),monthlyCents=sum('month'),lessonCents=sum('lesson'),totalCents=hourlyCents+monthlyCents+lessonCents;
 if(![hourlyCents,monthlyCents,lessonCents,totalCents].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('Invalid scheduled tuition');
 return{studentId:document.studentId,month:document.month,hourlyCents,monthlyCents,lessonCents,totalCents,lessonCount:document.lessonCount,complete:!blockers.some(code=>code!=='monthly_manual_review'&&code!=='no_planned_lessons'),needsMonthlyReview:lines.some(line=>line.mode==='month'),blockers,lines};
}
