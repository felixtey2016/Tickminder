import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const source=stripTypeScriptTypes(readFileSync(new URL('../lib/student-statements.ts',import.meta.url),'utf8'),{mode:'transform'});
const {completeStudentStatement,statementMonthOffset,statementInteger}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
let checks=0;
function test(name,run){try{run();checks++;}catch(error){error.message=name+': '+error.message;throw error;}}
function row(month,invoiceCents=0,unbilledCents=0,extra={}){return{month,invoiceCents,unbilledCents,chargeCents:invoiceCents+unbilledCents,pendingCount:0,lessonCount:0,changedInvoiceCount:0,...extra};}
function page(extra={}){return{student:{id:'student-a',name:'Fictional Student'},month:'2026-09',asOf:'2026-10-30T09:00:00.000Z',token:'same-revision',cashBeforeCents:0,receivedCents:0,refundedCents:0,reversedCents:0,walletBalanceCents:0,invoiceDueCents:0,invoiceCreditCents:0,rows:[row('2026-09')],nextBefore:null,...extra};}
function statement(extra={}){return completeStudentStatement([page(extra)]);}

test('RM640 collected, RM560 confirmed tuition carries RM80 credit',()=>{
 const result=statement({receivedCents:64000,rows:[row('2026-09',0,56000)]});
 assert.equal(result.openingCents,0);assert.equal(result.closingCents,8000);assert.equal(result.creditCents,8000);assert.equal(result.outstandingCents,0);assert.equal(result.status,'reconciled');
});
test('RM480 collected, RM560 confirmed tuition carries RM80 debt',()=>{
 const result=statement({receivedCents:48000,rows:[row('2026-09',56000)]});
 assert.equal(result.closingCents,-8000);assert.equal(result.creditCents,0);assert.equal(result.outstandingCents,8000);
});
test('prior credit becomes this month opening without another receipt',()=>{
 const result=statement({cashBeforeCents:64000,rows:[row('2026-09',0,10000),row('2026-08',56000)]});
 assert.equal(result.openingCents,8000);assert.equal(result.closingCents,-2000);assert.equal(result.receivedCents,0);
});
test('prior debt reduces this month receipt',()=>{
 const result=statement({cashBeforeCents:40000,receivedCents:30000,rows:[row('2026-09',20000),row('2026-08',56000)]});
 assert.equal(result.openingCents,-16000);assert.equal(result.closingCents,-6000);
});
test('refund returns actual cash and reduces credit',()=>{
 assert.equal(statement({receivedCents:64000,refundedCents:8000,rows:[row('2026-09',56000)]}).closingCents,0);
});
test('reversal removes incorrect receipt',()=>{
 const result=statement({receivedCents:64000,reversedCents:64000,rows:[row('2026-09',56000)]});
 assert.equal(result.closingCents,-56000);assert.equal(result.outstandingCents,56000);
});
test('multi-page history uses all earlier charges and cash once',()=>{
 const first=page({cashBeforeCents:30000,receivedCents:20000,refundedCents:2000,reversedCents:1000,rows:[row('2026-09',16000,8000)],nextBefore:'2026-08'});
 const second=page({...first,rows:[row('2026-08',16000),row('2026-07',8000)],nextBefore:null});
 const result=completeStudentStatement([first,second]);
 assert.equal(result.openingCents,6000);assert.equal(result.closingCents,-1000);assert.equal(result.invoiceCents,16000);assert.equal(result.unbilledCents,8000);assert.equal(result.chargeCents,24000);assert.equal(result.months.length,3);
});
test('wallet and invoice settlement transfers are not extra cash',()=>{
 const first=statement({cashBeforeCents:64000,invoiceDueCents:56000,walletBalanceCents:64000,rows:[row('2026-09',56000)]});
 const allocated=statement({cashBeforeCents:64000,invoiceDueCents:0,walletBalanceCents:8000,rows:[row('2026-09',56000)]});
 assert.equal(first.closingCents,8000);assert.equal(allocated.closingCents,8000);
});
test('invoice excess remains informational and is not another receipt',()=>{
 assert.equal(statement({receivedCents:64000,invoiceCreditCents:8000,rows:[row('2026-09',56000)]}).closingCents,8000);
});
test('zero activity and zero fees produce exact zero',()=>{
 const result=statement();assert.equal(result.openingCents,0);assert.equal(result.closingCents,0);assert.equal(result.creditCents,0);assert.equal(result.outstandingCents,0);assert.equal(result.status,'reconciled');
});
test('current month remains in progress',()=>{
 assert.equal(statement({month:'2026-10',rows:[row('2026-10')]}).status,'in_progress');
});
test('future month is never marked reconciled',()=>{
 assert.equal(statement({month:'2026-11',rows:[row('2026-11')]}).status,'in_progress');
});
test('GMT+8 boundary determines current month',()=>{
 assert.equal(statement({asOf:'2026-09-30T16:00:00.000Z'}).status,'reconciled');
 assert.equal(statement({asOf:'2026-09-30T15:59:59.000Z'}).status,'in_progress');
});
test('selected month missing attendance prevents reconciliation',()=>{
 const result=statement({receivedCents:64000,rows:[row('2026-09',56000,0,{pendingCount:1})]});
 assert.equal(result.pendingCount,1);assert.equal(result.status,'review');
});
test('earlier missing attendance also prevents reconciliation',()=>{
 const result=statement({rows:[row('2026-09'),row('2026-08',0,0,{pendingCount:2})]});
 assert.equal(result.pendingCount,2);assert.equal(result.status,'review');
});
test('changed issued source requests review across all history',()=>{
 const result=statement({rows:[row('2026-09'),row('2026-08',56000,0,{changedInvoiceCount:1})]});
 assert.equal(result.changedInvoiceCount,1);assert.equal(result.status,'review');
});
test('current review takes priority over in-progress status',()=>{
 assert.equal(statement({month:'2026-10',rows:[row('2026-10',0,0,{pendingCount:1})]}).status,'review');
});
test('empty response is incomplete',()=>assert.throws(()=>completeStudentStatement([])));
test('unfinished history cannot be rendered as final balance',()=>assert.throws(()=>completeStudentStatement([page({nextBefore:'2026-08'})])));
test('missing selected month is rejected',()=>assert.throws(()=>statement({rows:[row('2026-08')]})));
test('duplicate month in one page is rejected',()=>assert.throws(()=>statement({rows:[row('2026-09'),row('2026-09')]})));
test('month later than the selected month is rejected',()=>assert.throws(()=>statement({rows:[row('2026-09'),row('2026-10')]})));
test('pagination gap is rejected',()=>{
 assert.throws(()=>completeStudentStatement([page({nextBefore:'2026-08'}),page({rows:[row('2026-07')],nextBefore:null})]));
});
test('pagination overlap is rejected',()=>{
 assert.throws(()=>completeStudentStatement([page({nextBefore:'2026-08'}),page({rows:[row('2026-08'),row('2026-09')],nextBefore:null})]));
});
test('changed revision token is rejected',()=>{
 assert.throws(()=>completeStudentStatement([page({nextBefore:'2026-08'}),page({token:'new-revision',rows:[row('2026-08')]})]));
});
test('changed student is rejected',()=>{
 assert.throws(()=>completeStudentStatement([page({nextBefore:'2026-08'}),page({student:{id:'student-b',name:'Another Student'},rows:[row('2026-08')]})]));
});
test('changed selected month is rejected',()=>{
 assert.throws(()=>completeStudentStatement([page({nextBefore:'2026-08'}),page({month:'2026-08',rows:[row('2026-08')]})]));
});
test('history integer addition overflow is rejected',()=>{
 assert.throws(()=>statement({rows:[row('2026-09'),row('2026-08',Number.MAX_SAFE_INTEGER),row('2026-07',1)]}));
});
test('opening integer overflow is rejected',()=>{
 assert.throws(()=>statement({cashBeforeCents:-Number.MAX_SAFE_INTEGER,rows:[row('2026-09'),row('2026-08',1)]}));
});
test('closing integer overflow is rejected',()=>{
 assert.throws(()=>statement({cashBeforeCents:Number.MAX_SAFE_INTEGER,receivedCents:1}));
});
test('fractional and nonfinite amounts are rejected',()=>{
 for(const amount of [0.5,NaN,Infinity,-Infinity])assert.throws(()=>statementInteger(amount));
});
test('largest safe integer and zero are accepted',()=>{
 assert.equal(statementInteger(0),0);assert.equal(statementInteger(Number.MAX_SAFE_INTEGER),Number.MAX_SAFE_INTEGER);assert.equal(statementInteger(-Number.MAX_SAFE_INTEGER),-Number.MAX_SAFE_INTEGER);
});
test('month offset crosses year boundaries correctly',()=>{
 assert.equal(statementMonthOffset('2026-01',-1),'2025-12');assert.equal(statementMonthOffset('2026-12',1),'2027-01');assert.equal(statementMonthOffset('2024-02',12),'2025-02');assert.equal(statementMonthOffset('2026-09',0),'2026-09');
});
test('malformed month and fractional offset are rejected',()=>{
 for(const month of ['2026-00','2026-13','2026-1','2026-01-01','not-a-month'])assert.throws(()=>statementMonthOffset(month,1));
 assert.throws(()=>statementMonthOffset('2026-09',0.5));
});
test('history with an undeclared month gap is rejected',()=>{
 assert.throws(()=>statement({rows:[row('2026-09'),row('2026-07')]}));
});
test('empty historical page cannot complete an account',()=>{
 assert.throws(()=>completeStudentStatement([page({nextBefore:'2026-08'}),page({rows:[]})]));
});
test('cursor must point at the month immediately after this page',()=>{
 assert.throws(()=>completeStudentStatement([page({nextBefore:'2026-07'}),page({rows:[row('2026-07')]})]));
});
test('same token with changed cash totals still rejects mixed snapshots',()=>{
 assert.throws(()=>completeStudentStatement([page({nextBefore:'2026-08'}),page({receivedCents:1,rows:[row('2026-08')]})]));
});
test('same student id with a different name rejects mixed snapshots',()=>{
 assert.throws(()=>completeStudentStatement([page({nextBefore:'2026-08'}),page({student:{id:'student-a',name:'Changed Name'},rows:[row('2026-08')]})]));
});
test('negative and fractional charges are rejected',()=>{
 for(const amount of [-1,0.5])assert.throws(()=>statement({rows:[row('2026-09',amount)]}));
});
test('inconsistent invoice and unbilled charge total is rejected',()=>{
 assert.throws(()=>statement({rows:[row('2026-09',10000,10000,{chargeCents:10000})]}));
});
test('negative and fractional review counts are rejected',()=>{
 for(const pendingCount of [-1,0.5])assert.throws(()=>statement({rows:[row('2026-09',0,0,{pendingCount})]}));
});
test('pending count overflow cannot accidentally produce a final balance',()=>{
 assert.throws(()=>statement({rows:[row('2026-09',0,0,{pendingCount:Number.MAX_SAFE_INTEGER}),row('2026-08',0,0,{pendingCount:1})]}));
});
test('malformed date, token and month are rejected',()=>{
 for(const change of [{asOf:'not-a-date'},{token:''},{month:'2026-13'},{rows:[row('2026-9')]}])assert.throws(()=>statement(change));
});
test('nonfinite cash or wallet metadata is rejected',()=>{
 for(const change of [{receivedCents:Infinity},{refundedCents:NaN},{walletBalanceCents:0.5},{invoiceDueCents:-1}])assert.throws(()=>statement(change));
});

console.log(JSON.stringify({suite:'student-statements-behavior',passed:checks}));
