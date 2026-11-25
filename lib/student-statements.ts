/** Read-only tuition reconciliation. Positive net = credit; negative net = fees owing. */
export type StatementMonth = {
 month:string;invoiceCents:number;unbilledCents:number;chargeCents:number;
 pendingCount:number;lessonCount:number;changedInvoiceCount:number;
};
export type StudentStatementPage = {
 student:{id:string;name:string};month:string;asOf:string;token:string;
 cashBeforeCents:number;receivedCents:number;refundedCents:number;reversedCents:number;
 walletBalanceCents:number;invoiceDueCents:number;invoiceCreditCents:number;
 rows:StatementMonth[];nextBefore:string|null;
};
export type StudentStatement = Omit<StudentStatementPage,'rows'|'nextBefore'> & {
 openingCents:number;chargeCents:number;invoiceCents:number;unbilledCents:number;
 closingCents:number;creditCents:number;outstandingCents:number;pendingCount:number;
 changedInvoiceCount:number;status:'in_progress'|'review'|'reconciled';months:StatementMonth[];
};
export function statementMonthOffset(month:string,offset:number){
 if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)||!Number.isInteger(offset))throw Error('Invalid statement month');
 return new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7))-1+offset,1)).toISOString().slice(0,7);
}
export function statementInteger(value:number){if(!Number.isSafeInteger(value))throw Error('Statement amount is outside the supported range');return value;}
function nonnegative(value:number){if(statementInteger(value)<0)throw Error('Invalid negative statement value');return value;}
function validMonth(value:string){if(typeof value!=='string'||!/^20\d\d-(0[1-9]|1[0-2])$/.test(value))throw Error('Invalid statement month');return value;}
const amountKeys=['cashBeforeCents','receivedCents','refundedCents','reversedCents','walletBalanceCents','invoiceDueCents','invoiceCreditCents'] as const;
/** Do not render a partial history as a completed account balance. */
export function completeStudentStatement(pages:StudentStatementPage[]):StudentStatement{
 const first=pages[0];if(!first||pages.at(-1)?.nextBefore!==null)throw Error('Incomplete statement');
 validMonth(first.month);
 if(!first.student?.id||!first.student.name||typeof first.token!=='string'||!first.token||!Number.isFinite(Date.parse(first.asOf)))throw Error('Invalid statement identity');
 const rows:StatementMonth[]=[],seen=new Set<string>();
 for(let i=0;i<pages.length;i++){
  const page=pages[i];if(page.token!==first.token||page.student?.id!==first.student.id||page.student.name!==first.student.name||page.month!==first.month||!Array.isArray(page.rows)||!page.rows.length||i>0&&pages[i-1].nextBefore!==page.rows[0]?.month)throw Error('Statement changed; refresh and try again');
  for(const key of amountKeys){nonnegative(page[key]);if(page[key]!==first[key])throw Error('Statement changed; refresh and try again');}
  for(const row of page.rows){
   validMonth(row.month);
   if(seen.has(row.month)||row.month>first.month||rows.length&&statementMonthOffset(rows.at(-1)!.month,-1)!==row.month)throw Error('Invalid statement history');
   for(const key of ['invoiceCents','unbilledCents','chargeCents','pendingCount','lessonCount','changedInvoiceCount'] as const)nonnegative(row[key]);
   if(statementInteger(row.invoiceCents+row.unbilledCents)!==row.chargeCents)throw Error('Invalid statement charges');
   seen.add(row.month);rows.push(row);
  }
  if(page.nextBefore!==null&&validMonth(page.nextBefore)!==statementMonthOffset(page.rows.at(-1)!.month,-1))throw Error('Incomplete statement');
 }
 const selected=rows.find(row=>row.month===first.month);if(!selected)throw Error('Missing selected month');
 const prior=rows.filter(row=>row.month<first.month).reduce((n,row)=>statementInteger(n+row.chargeCents),0);
 const openingCents=statementInteger(first.cashBeforeCents-prior),closingCents=[first.receivedCents,-first.refundedCents,-first.reversedCents,-selected.chargeCents].reduce((n,value)=>statementInteger(n+value),openingCents);
 const pendingCount=rows.reduce((n,row)=>statementInteger(n+row.pendingCount),0),changedInvoiceCount=rows.reduce((n,row)=>statementInteger(n+row.changedInvoiceCount),0);
 const current=new Date(Date.parse(first.asOf)+8*3600000).toISOString().slice(0,7);
 const status=pendingCount||changedInvoiceCount?'review':first.month>=current?'in_progress':'reconciled';
 return{...first,openingCents,closingCents,creditCents:Math.max(0,closingCents),outstandingCents:Math.max(0,-closingCents),chargeCents:selected.chargeCents,invoiceCents:selected.invoiceCents,unbilledCents:selected.unbilledCents,pendingCount,changedInvoiceCount,status,months:rows};
}
