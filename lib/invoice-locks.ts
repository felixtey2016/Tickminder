/** Shared error translation; database triggers protect every mutation path. */
export const invoiceLockedMessage="关联资料已正式开单，考勤及计费依据已锁定。请通过账单调整流程更正。";
export function isInvoiceLocked(error:unknown):boolean {const seen=new Set<unknown>();let value=error;for(let depth=0;depth<6&&value&&!seen.has(value);depth++){seen.add(value);if(/invoice_source_locked/i.test(String(value)))return true;value=typeof value==='object'&&value!==null&&'cause'in value?(value as {cause?:unknown}).cause:null;}return false;}
