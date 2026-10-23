import {billHourlyCents} from './billing';
export const PAYROLL_METHODS=['cash','bank_transfer','duitnow','tng','other'] as const;
export type PayrollMethod=typeof PAYROLL_METHODS[number];
export type PayrollRateMode='hour'|'lesson'|'month';
export type PayrollTeacher={teacherId:string;teacherName:string;active:boolean;rosterMissing?:boolean};
export type PayrollRate={mode:PayrollRateMode;id:string;scopeId:string;teacherId:string;classroomId:string|null;classroomTitle:string|null;revision:number;scopeRevision:number;amountCents:number;currency:'MYR';effectiveFrom:string;createdAt:string};
export type PayrollSourceLine={rateMode?:PayrollRateMode;unitAmountCents?:number;sessionId:string;classroomId:string|null;classroomTitle:string|null;subject:string;teacherName:string;plannedStart:string;plannedEnd:string;actualStart:string|null;actualEnd:string|null;durationSeconds:number;minutes:number;rateVersionId:string|null;hourlyRateCents:number|null;amountCents:number|null;status:'ready'|'pending'|'excluded'|'upcoming';warnings:string[];teachingStatus:string;attendanceReviewedAt:string|null;sessionRevision:number};
export type PayrollMonthlyLine={classroomId:string;classroomTitle:string;teacherId:string;month:string;rateVersionId:string;unitAmountCents:number;amountCents:number|null;estimatedAmountCents:number|null;status:'ready'|'pending'|'upcoming'|'excluded';warnings:string[];reviewRevision:number;reviewId:string|null;reviewReason:string|null;sourceHash:string};
export type PayrollClassroomResponse={classroom:{id:string;title:string;teacherName:string};teachers:PayrollTeacher[];rates:PayrollRate[];suggestions:PayrollRate[]};
export type PayrollDocument={calculationVersion?:2;monthlyLines?:PayrollMonthlyLine[];id:string;groupId:string;teacherId:string;teacherName:string;month:string;currency:'MYR';status:'draft'|'confirmed';revision:number;sourceHash:string;sourceLines:PayrollSourceLine[];baseTotalCents:number;durationSeconds:number;lessonCount:number;createdAt:string;updatedAt:string;confirmedAt:string|null};
export type PayrollReview={sourceChanged:boolean;pendingCount:number;missingRateCount:number;upcomingCount:number;excludedCount:number};
export type PayrollDraftPreview={confirmedCents:number;projectedCents:number;projectedTotalCents:number;projectedCount:number;missingRateCount:number;unresolvedCount:number;complete:boolean};
/** Draft projections are display-only and never become confirmed salary or payment balances. */
export function payrollDraftPreview(lines:PayrollSourceLine[],unlinkedCount=0,monthlyLines:PayrollMonthlyLine[]=[]):PayrollDraftPreview{
 let confirmedCents=0,projectedCents=0,projectedCount=0,missingRateCount=0,unresolvedCount=Number.isSafeInteger(unlinkedCount)&&unlinkedCount>0?unlinkedCount:0;
 const seconds=(start:string|null,end:string|null)=>{const value=start&&end?(Date.parse(end)-Date.parse(start))/1000:NaN;return Number.isFinite(value)&&value>0&&value<=43200?Math.round(value):null;};
 for(const line of lines){
  if(line.rateMode==='month')continue;
  if(line.status==='excluded'||line.teachingStatus==='teacher_absent'||line.teachingStatus==='not_taught')continue;
  const earned=line.amountCents;
  if(line.status==='ready'&&typeof earned==='number'&&Number.isSafeInteger(earned)&&earned>=0){confirmedCents+=earned;continue;}
  const rate=line.rateMode==='lesson'?line.unitAmountCents:line.hourlyRateCents;
  if(!line.rateVersionId||typeof rate!=='number'||!Number.isSafeInteger(rate)||rate<=0||rate>100_000_000){missingRateCount++;unresolvedCount++;continue;}
  const actual=line.teachingStatus==='taught'?seconds(line.actualStart,line.actualEnd):null;
  const duration=actual??(line.teachingStatus==='pending'?seconds(line.plannedStart,line.plannedEnd):null);
  if(duration===null){unresolvedCount++;continue;}
  projectedCents+=line.rateMode==='lesson'?rate:billHourlyCents(rate,duration,'minute').amountCents;projectedCount++;
 }
 for(const line of monthlyLines){if(line.status==='excluded')continue;let unresolved=line.warnings.length>0;if(line.status==='ready'&&line.amountCents!==null)confirmedCents+=line.amountCents;else if(line.estimatedAmountCents!==null){projectedCents+=line.estimatedAmountCents;projectedCount++;}else unresolved=true;if(unresolved)unresolvedCount++;}
 return{confirmedCents,projectedCents,projectedTotalCents:confirmedCents+projectedCents,projectedCount,missingRateCount,unresolvedCount,complete:(lines.length>0||monthlyLines.length>0)&&unresolvedCount===0};
}
export type PayrollSummary={id:string;teacherId:string;teacherName:string;month:string;status:'draft'|'confirmed';revision:number;baseTotalCents:number;bonusCents:number;deductionCents:number;totalCents:number;paidCents:number;remainingCents:number;lessonCount:number;durationSeconds:number;confirmedAt:string|null;createdAt:string;updatedAt:string;draftPreview?:PayrollDraftPreview};
export type PayrollEvent={id:string;kind:'bonus'|'deduction'|'payment'|'reverse';amountCents:number;paymentId:string|null;occurredAt:string;method:PayrollMethod|'';reference:string;notes:string;reason:string;actorId:string;createdAt:string;reversedAt?:string|null};
export type PayrollDetail={payroll:PayrollDocument;summary:PayrollSummary;review:PayrollReview;events:PayrollEvent[];page:number;pageSize:number;pages:number;total:number};
export type PayrollPendingSummary={id:null;teacherId:string;teacherName:string;month:string;status:'not_generated';lessonCount:number;durationSeconds:number;rosterMissing:boolean};
export type PayrollList={items:(PayrollSummary|PayrollPendingSummary)[];page:number;pageSize:number;pages:number;total:number};
export type PayrollRatesResponse={teacher:PayrollTeacher;classrooms:{id:string;title:string}[];rates:PayrollRate[]};
export type PayrollResult={ok:true;payrollId?:string;teacherId?:string;revision:number;eventId?:string;rateId?:string;deleted?:boolean;reviewId?:string};
export class PayrollError extends Error{constructor(message:string,readonly status=400){super(message);}}
