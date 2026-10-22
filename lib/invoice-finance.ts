import type {InvoiceInstitutionSnapshot} from './invoice-settings';
import type {InvoiceStudent} from './invoice';

export const PAYMENT_METHODS=['cash','bank_transfer','duitnow','tng','other'] as const;
export type PaymentMethod=typeof PAYMENT_METHODS[number];
export type InvoiceFinanceStatus='unpaid'|'partially_paid'|'paid'|'void';
export type InvoiceFinanceEventKind='payment'|'reverse'|'refund'|'charge'|'credit'|'void'|'attendance_correction';
export type ReceiptDocument={id:string;number:string;invoiceId:string;invoiceNumber:string;student:InvoiceStudent;institution:InvoiceInstitutionSnapshot;currency:'MYR';amountCents:number;paidAt:string;method:PaymentMethod;reference:string;createdAt:string;serviceMonth:string;invoiceTotalCents:number;balanceAfterCents:number};
export type InvoicePayment={id:string;invoiceId:string;receiptId:string;number:string;amountCents:number;paidAt:string;method:PaymentMethod;reference:string;notes:string;createdAt:string;reversedAt:string|null;refundedCents:number;refundableCents:number};
export type InvoiceFinanceEvent={id:string;kind:InvoiceFinanceEventKind;amountCents:number;paymentId:string|null;occurredAt:string;method:PaymentMethod|'';reason:string;notes:string;reference:string;createdAt:string;actorId:string};
export type InvoiceFinanceSummary={invoiceId:string;revision:number;status:InvoiceFinanceStatus;originalTotalCents:number;chargeCents:number;creditCents:number;adjustedTotalCents:number;receivedCents:number;reversedCents:number;refundedCents:number;paidCents:number;remainingCents:number;creditBalanceCents:number;voidedAt:string|null;voidReason:string};
export type InvoiceFinanceDetail=InvoiceFinanceSummary&{payments:InvoicePayment[];events:InvoiceFinanceEvent[];page:number;pageSize:number;pages:number;total:number;paymentPage:number;paymentPages:number;paymentTotal:number};
export type InvoiceFinanceResult={ok:true;invoiceId:string;revision:number;eventId:string;paymentId?:string;receiptId?:string;number?:string};
export class InvoiceFinanceError extends Error{constructor(message:string,readonly status=400){super(message);}}
