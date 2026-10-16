import type {BillingLine} from './billing';
import type {InvoiceInstitutionSnapshot} from './invoice-settings';

export type InvoiceAddition = {id:string;label:string;kind:'charge'|'discount';amountCents:number;reason:string};
export type InvoicePrintLine = {id:string;subject:string;description:string;lessonCount:number;durationSeconds:number;mode:string|null;unitAmountCents:number|null;amountCents:number};
export type InvoiceStudent = {id:string;name:string;syllabus:string|null;grade:string|null};
export type InvoiceDocument = {
 id:string;groupId:string;studentId:string;student:InvoiceStudent;month:string;status:'draft'|'issued';revision:number;
 number:string|null;issuedAt:string|null;createdAt:string;updatedAt:string;dueDate:string;notes:string;currency:'MYR';
 institution:InvoiceInstitutionSnapshot;sourceHash:string;sourceLines:BillingLine[];lines:InvoicePrintLine[];additions:InvoiceAddition[];
 subtotalCents:number;discountCents:number;totalCents:number;lessonCount:number;durationSeconds:number;
 extension:{schemaVersion:1;receiptIds:string[];eInvoice:Record<string,unknown>|null};
};
export type InvoiceSummary = Pick<InvoiceDocument,'id'|'studentId'|'month'|'status'|'revision'|'number'|'issuedAt'|'createdAt'|'updatedAt'|'dueDate'|'currency'|'totalCents'|'lessonCount'|'durationSeconds'> & {student:string};
export type InvoiceReview = {blockers:string[];sourceChanged:boolean;pendingCount:number;completedUnbilledCount:number;replacementCount:number;upcomingCount:number};
export type InvoiceDetail = {invoice:InvoiceDocument;review:InvoiceReview};
export type InvoiceList = {items:InvoiceSummary[];total:number;page:number;pageSize:number;pages:number};
export class InvoiceError extends Error {constructor(message:string,readonly status=400){super(message);}}
export const INVOICE_MAX_CENTS=100_000_000;
export function invoiceLessonCancelled(line:BillingLine){return line.lessonStatus==='cancelled'||line.sessionStatus==='cancelled'||line.attendanceStatus==='cancelled';}

export function invoiceAdditions(value:unknown):InvoiceAddition[]{
 if(!Array.isArray(value)||value.length>50)throw new InvoiceError('附加收费及折扣最多可添加 50 项');
 const seen=new Set<string>();
 return value.map((v:unknown)=>{
  if(!v||typeof v!=='object'||Array.isArray(v))throw new InvoiceError('收费项目格式无效');
  const row=v as Record<string,unknown>,id=typeof row.id==='string'?row.id.trim():'',label=typeof row.label==='string'?row.label.trim():'',reason=typeof row.reason==='string'?row.reason.trim():'';
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id)||seen.has(id)||!label||label.length>150||!reason||reason.length>1000||!['charge','discount'].includes(String(row.kind))||!Number.isSafeInteger(row.amountCents)||Number(row.amountCents)<=0||Number(row.amountCents)>INVOICE_MAX_CENTS)throw new InvoiceError('请填写有效收费项目、金额及调整原因');
  seen.add(id);return{id,label,kind:row.kind as 'charge'|'discount',amountCents:Number(row.amountCents),reason};
 });
}
export function invoiceTotals(lines:BillingLine[],additions:InvoiceAddition[]){
 const subtotalCents=lines.reduce((n,l)=>n+(l.amountCents??0),0)+additions.filter(l=>l.kind==='charge').reduce((n,l)=>n+l.amountCents,0),discountCents=additions.filter(l=>l.kind==='discount').reduce((n,l)=>n+l.amountCents,0),totalCents=subtotalCents-discountCents;
 if(![subtotalCents,discountCents,totalCents].every(Number.isSafeInteger)||totalCents<0||subtotalCents>INVOICE_MAX_CENTS)throw new InvoiceError('账单金额无效，折扣不可超过应收金额');
 return{subtotalCents,discountCents,totalCents};
}
/** Invoice-only display duration does not alter the fee engine's monthly quantities or hashes. */
export function invoiceLessonDuration(line:BillingLine){
 if(line.durationSeconds)return line.durationSeconds;
 if(line.mode!=='month'||!line.lessonId)return 0;
 const early=['early_leave','late_early','late_early_leave'].includes(line.attendanceStatus),start=line.plannedStart?Date.parse(line.plannedStart):NaN,end=(early?line.actualEnd:line.plannedEnd)?Date.parse((early?line.actualEnd:line.plannedEnd)!):NaN,seconds=(end-start)/1000;
 return Number.isFinite(seconds)&&seconds>0?Math.min(seconds,86400):0;
}
export function invoicePrintLines(lines:BillingLine[]):InvoicePrintLine[]{
 const result=new Map<string,InvoicePrintLine>();
 for(const line of lines){
  if(line.status==='pending'||invoiceLessonCancelled(line))continue;
  const key=JSON.stringify([line.subjectKey,line.mode,line.unitAmountCents,line.rateVersionId]),row=result.get(key)||{id:key,subject:line.subject,description:'',lessonCount:0,durationSeconds:0,mode:line.mode,unitAmountCents:line.unitAmountCents,amountCents:0};
  // Monthly fees include their lessons once; the monthly charge itself has no lesson ID.
  if(line.lessonId&&line.lessonStatus!=='cancelled'&&line.sessionStatus!=='cancelled'&&!['cancelled','absent','student_absent','teacher_absent','pending','scheduled'].includes(line.attendanceStatus)){
   row.lessonCount++;
   row.durationSeconds+=line.displayDurationSeconds??invoiceLessonDuration(line);
  }
  row.amountCents+=line.amountCents??0;result.set(key,row);
 }
 return[...result.values()];
}
