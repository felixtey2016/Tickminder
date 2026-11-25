import type {MonthlyAllowance} from './monthly-allowance';
export type InvoiceMonthlyExtraRow={subjectKey:string;subject:string;rateVersionId:string;allowance:MonthlyAllowance;alreadyConfirmedExcess:number;newExtraSessions:number;reviewRequired:boolean;reviewReasons:string[];basisHash:string};
export type InvoiceMonthlyExtraView={invoiceId:string;studentId:string;month:string;invoiceRevision:number;rows:InvoiceMonthlyExtraRow[]};
export type InvoiceMonthlyExtraResult={ok:true;invoiceId:string;invoiceRevision:number;decisionId:string;eventId:string|null;approvedAmountCents:number;confirmedExcessCount:number};
