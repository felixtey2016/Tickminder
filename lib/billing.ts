/** Shared, serialisable billing contracts. Prices never belong in roster/state payloads. */
export type BillingMode = 'hour' | 'lesson' | 'month';
export type BillingPolicy = {id:string;revision:number;currency:'MYR';hourRounding:'minute'|'quarter_up';attendanceBasis:'personal'|'teaching';monthlyPartial:'manual'|'daily';effectiveFrom:string;createdAt:string};
export type BillingRate = {id:string;rateId:string;revision:number;mode:BillingMode;amountCents:number;currency:'MYR';effectiveFrom:string;createdAt:string;subject:string};
export type BillingContext = {studentId:string;student:string;subjectKey:string;subject:string;syllabusId:string|null;grade:string|null;active:boolean;revision:number;currentRate:BillingRate|null;history:BillingRate[]};
export type BillingRateResponse = {context:BillingContext;policy:BillingPolicy|null;policyRevision:number;policyHistory:BillingPolicy[]};
export type BillingLine = {id:string;studentId:string;student:string;subjectKey:string;subject:string;date:string;lessonId:string|null;sessionId:string|null;classroomId:string|null;classroomTitle:string|null;teacherName:string|null;attendanceStatus:string;reviewedAt:string|null;rateVersionId:string|null;policyVersionId:string|null;mode:BillingMode|null;unitAmountCents:number|null;currency:'MYR';durationSeconds:number;billableSeconds:number;billableMinutes:number;quantity:number;amountCents:number|null;status:'ready'|'exempt'|'pending';warnings:string[];replacementFor:string|null;basisHash?:string;adjustmentRevision?:number;adjustmentHistory?:{id:string;amountCents:number|null;reason:string;createdAt:string}[];originalAmountCents?:number|null;adjustment?:{id:string;amountCents:number|null;reason:string;createdAt:string;stale:boolean}|null};
export type BillingSummary = {studentId:string;student:string;active:boolean;subtotalCents:number;pendingCount:number;lineCount:number};
export type BillingPreview = {month:string;currency:'MYR';policy:BillingPolicy|null;policyRevision:number;items:BillingSummary[];total:number;page:number;pageSize:number;pages:number;detail?:BillingSummary&{lines:BillingLine[]};warnings:string[]};
export class BillingError extends Error {constructor(message:string,readonly status=400){super(message);}}
export const MAX_BILLING_CENTS=100_000_000;
export function parseBillingAmount(value:unknown){
 if(typeof value!=='string'||!/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim()))throw new BillingError('请输入最多两位小数的有效金额');
 const [whole,fraction='']=value.trim().split('.'),amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(amount)||amount<=0||amount>MAX_BILLING_CENTS)throw new BillingError('收费金额须大于零，且不超过 1,000,000.00');
 return amount;
}
export function billingDate(value:unknown){
 if(typeof value!=='string'||!/^20\d\d-\d\d-\d\d$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw new BillingError('请选择有效的生效日期');
 return value;
}
export function billingMonth(value:unknown){if(typeof value!=='string'||!/^20\d\d-(?:0[1-9]|1[0-2])$/.test(value))throw new BillingError('请选择有效月份');return value;}
export function malaysiaDate(value:string){return new Date(Date.parse(value)+8*3600_000).toISOString().slice(0,10);}
export function roundRatioCents(amount:number,numerator:number,denominator:number){
 if(![amount,numerator,denominator].every(Number.isSafeInteger)||amount<0||numerator<0||denominator<=0)throw new BillingError('计费数值无效');
 const result=(BigInt(amount)*BigInt(numerator)*BigInt(2)+BigInt(denominator))/(BigInt(2)*BigInt(denominator));
 if(result>BigInt(Number.MAX_SAFE_INTEGER))throw new BillingError('费用超出可计算范围');return Number(result);
}
export function billHourlyCents(amountCents:number,seconds:number,rounding:BillingPolicy['hourRounding']){const billableSeconds=rounding==='quarter_up'?Math.ceil(seconds/900)*900:Math.max(0,Math.round(seconds/60))*60;return{billableSeconds,amountCents:roundRatioCents(amountCents,billableSeconds,3600)};}
export function rateOnDate(rates:BillingRate[],date:string){return rates.filter(rate=>rate.effectiveFrom<=date).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||b.revision-a.revision)[0]||null;}
export function policyOnDate(policies:BillingPolicy[],date:string){return policies.filter(policy=>policy.effectiveFrom<=date).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||b.revision-a.revision)[0]||null;}
