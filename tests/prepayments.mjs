import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createFixtureLoader} from './fixture-loader.mjs';
const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
for(const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
let actor=null,beforeBatch=null,afterRead=null,checks=0;globalThis.__prepayEnv={ADMIN_PERMISSIONS_MODE:'enforced'};
function statement(sql,values=[]){const execute=()=>{assert(values.length<=100,'D1 parameter limit');const s=sqlite.prepare(sql);return s.columns().length?{results:s.all(...values),meta:{changes:0}}:{results:[],meta:s.run(...values)};};return{bind:(...v)=>statement(sql,v),all:async()=>{const result=execute();afterRead?.(sql);return result;},first:async()=>execute().results[0]||null,run:async()=>execute(),execute};}
const db={prepare:statement,batch:async statements=>{beforeBatch?.();beforeBatch=null;sqlite.exec('BEGIN');try{const r=statements.map(s=>s.execute());sqlite.exec('COMMIT');return r;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
globalThis.__prepaymentRuntime={learningDb:()=>db,currentBusinessAccount:async()=>actor,OWNER_EMAIL:'owner@prepay.test',isOwnerAccount:a=>a?.role==='admin'&&a.email==='owner@prepay.test'&&!a.id.startsWith('local:'),pdfLimits:()=>({total:10000000})};
const dataUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64'),runtimeUrl=dataUrl('export const {learningDb,currentBusinessAccount,OWNER_EMAIL,isOwnerAccount,pdfLimits}=globalThis.__prepaymentRuntime;'),environmentUrl=dataUrl("export const env=globalThis.__prepayEnv;"),nextUrl=dataUrl('export const NextResponse={json:(data,options)=>Response.json(data,options)};');
const load=createFixtureLoader({runtimeUrl,environmentUrl,runtimeFiles:['lib/auth.ts','lib/owner.ts','lib/learning-server.ts','lib/pdf-storage.ts'],transform:(_file,code)=>code.replaceAll("'next/server'",JSON.stringify(nextUrl)).replaceAll('"next/server"',JSON.stringify(nextUrl))});
const route=(await load('app/api/prepayments/route.ts')).module,service=(await load('lib/prepayments-server.ts')).module,finance=(await load('lib/invoice-finance-server.ts')).module,billing=(await load('lib/billing-server.ts')).module,render=(await load('lib/invoice-render.ts')).module,settings=(await load('lib/invoice-settings.ts')).module,prints=(await load('lib/prepayment-print.ts')).module;
const now=new Date().toISOString(),gid='prepay-school',foreign='prepay-foreign',op=()=>crypto.randomUUID(),month='2034-02';
for(const id of[gid,foreign])sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,id,now,now);
function account(id,role='admin',groupId=gid,email=id+'@prepay.test'){const a={id,role,groupId,email,name:id};sqlite.prepare('INSERT INTO accounts(id,email,name,role,group_id,created_at) VALUES(?,?,?,?,?,?)').run(id,email,id,role,groupId,now);return a;}
const owner=account('prepay-owner','admin',gid,'owner@prepay.test'),admin=account('prepay-admin'),teacher=account('prepay-teacher','teacher'),student=account('prepay-student','student'),parent=account('prepay-parent','parent'),outsider=account('prepay-outsider','admin',foreign);
const grants=['prepayments.view','prepayments.manage','prepayments.record','prepayments.apply','prepayments.refund','prepayments.reverse','invoices.view','invoices.adjust','invoices.void','payments.view','payments.record','payments.refund','payments.reverse'];
function grant(values=grants){sqlite.prepare("INSERT INTO admin_permission_profiles(group_id,account_id,revision,grants_json,origin,updated_at) VALUES(?,?,1,?,'new',?) ON CONFLICT(group_id,account_id) DO UPDATE SET grants_json=excluded.grants_json,revision=revision+1,origin='new'").run(gid,admin.id,JSON.stringify(values),now);}grant();
function learner(name,groupId=gid){sqlite.prepare('INSERT INTO students(group_id,name,name_key,created_at,grade) VALUES(?,?,?,?,?)').run(groupId,name,name.toLowerCase(),'2020-01-01T00:00:00Z','form-4');sqlite.prepare('INSERT INTO plans(group_id,key,student,subject,subject_id,teacher_name,created_at) VALUES(?,?,?,?,?,?,?)').run(groupId,name+'-science',name,'Science','science','Demo Teacher','2020-01-01T00:00:00Z');return sqlite.prepare('SELECT id FROM billing_students WHERE group_id=? AND student_name=?').get(groupId,name).id;}
const first=learner('Alpha'),second=learner('Beta'),monthly=learner('Monthly'),foreignSid=learner('Foreign',foreign);
function lesson(id,name,start='2034-02-05T02:00:00Z',end='2034-02-05T03:30:00Z'){sqlite.prepare("INSERT INTO lessons(id,group_id,student,subject,teacher_name,planned_start,planned_end,status,created_by,updated_at) VALUES(?,?,?,'Science','Demo Teacher',?,?,'scheduled',?,?)").run(id,gid,name,start,end,owner.id,now);}
lesson('prepay-alpha','Alpha');lesson('prepay-alpha-future-rate','Alpha','2034-02-25T02:00:00Z','2034-02-25T03:30:00Z');lesson('prepay-beta','Beta','2034-02-06T02:00:00Z','2034-02-06T03:30:00Z');lesson('prepay-monthly','Monthly','2034-02-07T02:00:00Z','2034-02-07T03:30:00Z');
for(const [name,mode,amount]of[['Alpha','hour','40.00'],['Beta','lesson','50.00'],['Monthly','month','150.00']]){const response=await billing.billingRateSettings(owner,name+'-science');await billing.saveBilling(owner,{action:'saveRate',studentId:response.context.studentId,subjectKey:response.context.subjectKey,revision:0,mode,amount,effectiveFrom:'2020-01-01',operationId:op()});}
const rate=await billing.billingRateSettings(owner,'Alpha-science');await billing.saveBilling(owner,{action:'saveRate',studentId:first,subjectKey:rate.context.subjectKey,revision:1,mode:'hour',amount:'60.00',effectiveFrom:'2034-02-20',operationId:op()});
async function get(params,as=admin){actor=as;const r=await route.GET(new Request('https://prepay.test/api/prepayments?'+new URLSearchParams(params)));return{status:r.status,data:await r.json()};}
async function post(body,as=admin){actor=as;const r=await route.POST(new Request('https://prepay.test/api/prepayments',{method:'POST',headers:{origin:'https://prepay.test','content-type':'application/json'},body:JSON.stringify(body)}));return{status:r.status,data:await r.json()};}
function check(fn){fn();checks++;}function expect(r,status,label){check(()=>assert.equal(r.status,status,label+': '+JSON.stringify(r.data)));return r.data;}
for(const a of[null,teacher,student,parent,outsider])expect(await get({view:'students'},a),a?403:401,'non financial actor denied');
expect(await get({view:'overview',studentId:foreignSid}),404,'foreign stable student denied');
let preview=expect(await get({view:'preview',studentId:first,month}),200,'future scheduled lessons can be estimated');
check(()=>assert.equal(preview.document.totalCents,15000,'dated future rate selects 40x1.5 and 60x1.5'));
check(()=>assert.equal(preview.document.lessonCount,2));check(()=>assert.deepEqual(preview.blockers,[]));
const sourceHash=preview.document.sourceHash;
const draftBody={action:'saveRequest',studentId:first,month,expectedSourceHash:sourceHash,operationId:op(),notes:'Advance <script>alert(1)</script>'};
const draft=expect(await post(draftBody),200,'create request draft');expect(await post(draftBody),200,'draft idempotent retry');
const issueBody={action:'issueRequest',requestId:draft.requestId,revision:1,operationId:op()},issued=expect(await post(issueBody),200,'issue estimate without attendance or locking lessons');expect(await post(issueBody),200,'issued retry');check(()=>assert.match(issued.number,/^ADV-\d{4}-000001$/));
let detail=expect(await get({view:'request',requestId:draft.requestId}),200,'issued request detail');check(()=>assert.equal(detail.request.totalCents,15000));check(()=>assert.match(detail.printUrl,/groupId=prepay-school/));
const frozenRequest=sqlite.prepare('SELECT document_json FROM prepayment_requests WHERE id=?').get(draft.requestId).document_json;
check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM invoice_source_locks').get().n,0,'advance creates no invoice locks'));
expect(await post({...draftBody,operationId:op(),requestId:draft.requestId,revision:2}),409,'issued estimate cannot edit');
// Duplicate all-subject / subject-specific notices cannot issue twice for the same scheduled lessons.
const duplicate=expect(await post({action:'saveRequest',studentId:first,month,subjectKey:rate.context.subjectKey,operationId:op()}),200,'overlapping subject draft allowed');
expect(await post({action:'issueRequest',requestId:duplicate.requestId,revision:1,operationId:op()}),409,'overlapping active issued request denied');
expect(await post({action:'deleteRequest',requestId:duplicate.requestId,revision:1,operationId:op()}),200,'overlapping draft can be removed');
sqlite.prepare("UPDATE lessons SET planned_start='2034-03-05T02:00:00Z',planned_end='2034-03-05T03:30:00Z' WHERE id='prepay-alpha'").run();
detail=expect(await get({view:'request',requestId:draft.requestId}),200,'month move detail');check(()=>assert.equal(detail.currentLessons.find(l=>l.lessonId==='prepay-alpha').change,'moved_month'));check(()=>assert.equal(detail.request.totalCents,15000));
check(()=>assert.equal(sqlite.prepare('SELECT document_json FROM prepayment_requests WHERE id=?').get(draft.requestId).document_json,frozenRequest,'issued snapshot bytes unchanged'));
const betaPreview=expect(await get({view:'preview',studentId:second,month}),200,'second preview');
sqlite.prepare("UPDATE lessons SET planned_end='2034-02-06T04:00:00Z' WHERE id='prepay-beta'").run();
expect(await post({action:'saveRequest',studentId:second,month,expectedSourceHash:betaPreview.document.sourceHash,operationId:op()}),409,'preview drift rejected');
let betaDraft=expect(await post({action:'saveRequest',studentId:second,month,operationId:op()}),200,'new preview draft');
beforeBatch=()=>sqlite.prepare("UPDATE lessons SET planned_end='2034-02-06T04:30:00Z' WHERE id='prepay-beta'").run();
expect(await post({action:'issueRequest',requestId:betaDraft.requestId,revision:1,operationId:op()}),409,'planned change during issue CAS');
expect(await post({action:'saveRequest',requestId:betaDraft.requestId,studentId:second,month,revision:1,operationId:op()}),200,'refresh changed draft');
expect(await post({action:'deleteRequest',requestId:betaDraft.requestId,revision:2,operationId:op()}),200,'delete only draft');
const betaRequests=await Promise.all([0,1].map(()=>post({action:'saveRequest',studentId:second,month,operationId:op()})));
const betaIds=betaRequests.map(r=>expect(r,200,'parallel beta draft').requestId);
const issuedRaces=await Promise.all(betaIds.map(requestId=>post({action:'issueRequest',requestId,revision:1,operationId:op()})));
check(()=>assert.deepEqual(issuedRaces.map(r=>r.status).sort(),[200,409],'duplicate issue claim is atomic'));
const winnerIndex=issuedRaces.findIndex(r=>r.status===200),loserIndex=1-winnerIndex;
expect(await post({action:'voidRequest',requestId:betaIds[winnerIndex],revision:2,reason:'Replace outdated notice',operationId:op()}),200,'void overlapping issued notice');
expect(await post({action:'issueRequest',requestId:betaIds[loserIndex],revision:1,operationId:op()}),200,'void allows replacement notice without duplicates');
let monthlyPreview=expect(await get({view:'preview',studentId:monthly,month}),200,'fixed monthly preview');check(()=>assert(monthlyPreview.blockers.includes('monthly_manual_review')));
let monthlyDraft=expect(await post({action:'saveRequest',studentId:monthly,month,operationId:op()}),200,'monthly draft before manual confirmation');
expect(await post({action:'issueRequest',requestId:monthlyDraft.requestId,revision:1,operationId:op()}),400,'fixed month requires manual review');
expect(await post({action:'saveRequest',requestId:monthlyDraft.requestId,studentId:monthly,month,monthlyReviewed:true,revision:1,operationId:op()}),200,'manual monthly review retained');
expect(await post({action:'issueRequest',requestId:monthlyDraft.requestId,revision:2,operationId:op()}),200,'issue reviewed fixed fee');
lesson('prepay-monthly-new-rate','Monthly','2034-02-26T02:00:00Z','2034-02-26T03:30:00Z');
const monthlySettings=await billing.billingRateSettings(owner,'Monthly-science');await billing.saveBilling(owner,{action:'saveRate',studentId:monthly,subjectKey:monthlySettings.context.subjectKey,revision:1,mode:'month',amount:'170.00',effectiveFrom:'2034-02-20',operationId:op()});
monthlyPreview=expect(await get({view:'preview',studentId:monthly,month,monthlyReviewed:'true'}),200,'monthly rate change preview');
check(()=>assert(monthlyPreview.blockers.includes('monthly_rate_change_review'),'checkbox cannot approve ambiguous month changes'));
expect(await post({action:'saveRequest',studentId:monthly,month,monthlyReviewed:true,operationId:op()}),400,'monthly changed rate cannot silently create billed total');
const payBody={action:'recordPayment',studentId:first,revision:0,amountCents:20000,paidAt:now,method:'bank_transfer',reference:'PRE-BANK',notes:'Private note',requestId:draft.requestId,operationId:op()},paid=expect(await post(payBody),200,'collect independent advance');expect(await post(payBody),200,'payment idempotent');check(()=>assert.match(paid.number,/^APR-\d{4}-000001$/));
expect(await post({...payBody,amountCents:10000}),409,'operation hash cannot change');
const frozenReceipt=sqlite.prepare('SELECT document_json FROM prepayment_receipts WHERE id=?').get(paid.receiptId).document_json;
let overview=expect(await get({view:'overview',studentId:first}),200,'student advance balance');check(()=>assert.equal(overview.balance.balanceCents,20000));check(()=>assert.equal(overview.balance.receivedCents,20000));check(()=>assert.equal(overview.payments[0].availableCents,20000));
const receipt=expect(await get({view:'receipt',receiptId:paid.receiptId}),200,'independent saved receipt');check(()=>assert.equal(receipt.receipt.amountCents,20000));check(()=>assert(!JSON.stringify(receipt).includes('Private note')));check(()=>assert(!('invoiceId'in receipt.receipt)));
const html=prints.renderPrepaymentHtml(detail.request,{lang:'zh',nonce:'fixture'});check(()=>assert(html.includes('并非最终 Invoice')));check(()=>assert(!html.includes('<script>alert(1)</script>')));check(()=>assert(html.includes('&lt;script&gt;')));
const englishHtml=prints.renderPrepaymentHtml(detail.request,{lang:'en',nonce:'fixture'});
check(()=>assert(englishHtml.includes('Original planned lessons')));check(()=>assert(englishHtml.includes('1 hour 30 minutes')));check(()=>assert(englishHtml.includes('Feb 2034')));check(()=>assert(html.includes('1小时30分钟')));check(()=>assert(!englishHtml.includes('<script>alert(1)</script>')));
const receiptHtml=prints.renderPrepaymentHtml(receipt.receipt,{lang:'en',nonce:'fixture'});check(()=>assert(receiptHtml.includes('Bank transfer')));check(()=>assert(!receiptHtml.includes('bank_transfer')));check(()=>assert(prints.renderPrepaymentHtml(receipt.receipt,{lang:'zh',nonce:'fixture'}).includes('银行转账')));
check(()=>assert(receiptHtml.includes('Advance payment receipt')));check(()=>assert(!receiptHtml.includes('Original planned lessons')));check(()=>assert(!receiptHtml.includes('Private note')));
actor=admin;const printed=await prints.prepaymentPrintResponse(new Request('https://prepay.test/api/prepayments/requests/'+draft.requestId+'/print?groupId='+gid+'&lang=en'),draft.requestId,'request');
check(()=>assert.equal(printed.status,200));check(()=>assert.match(printed.headers.get('content-security-policy'),/script-src 'nonce-/));check(()=>assert.equal(printed.headers.get('cache-control'),'private, no-store'));
const deniedPrint=await prints.prepaymentPrintResponse(new Request('https://prepay.test/api/prepayments/requests/'+draft.requestId+'/print?groupId='+foreign),draft.requestId,'request');check(()=>assert.equal(deniedPrint.status,403));
function invoice(id,sid=first,serviceMonth='2034-01',total=10000){const student=sqlite.prepare('SELECT student_name FROM billing_students WHERE group_id=? AND id=?').get(gid,sid).student_name,doc={...render.sampleInvoiceDocument(settings.defaultInvoiceSettings('Fixture')),id,groupId:gid,studentId:sid,student:{id:sid,name:student,syllabus:null,grade:null},month:serviceMonth,status:'issued',revision:1,number:'INV-'+id,issuedAt:now,createdAt:now,updatedAt:now,totalCents:total,subtotalCents:total,discountCents:0};sqlite.prepare("INSERT INTO invoices(id,group_id,student_id,month,status,revision,number,issued_at,created_at,updated_at,created_by,due_date,currency,source_hash,source_basis_json,adjustment_basis_json,document_json,total_cents) VALUES(?,?,?,?,'issued',1,?,?,?,?,?,'2034-03-01','MYR','fixture','{}','[]',?,?)").run(id,gid,sid,serviceMonth,doc.number,now,now,now,owner.id,JSON.stringify(doc),total);return doc;}
const invoiceA=invoice('advance-invoice-a'),invoiceB=invoice('advance-invoice-b',first,'2034-02'),invoiceOther=invoice('advance-other',second);
const frozenInvoice=sqlite.prepare('SELECT document_json FROM invoices WHERE id=?').get(invoiceA.id).document_json;
let allocationPreview=expect(await get({view:'allocation',invoiceId:invoiceA.id}),200,'allocation preview');check(()=>assert.equal(allocationPreview.remainingCents,10000));
const applyBody={action:'apply',studentId:first,revision:1,invoiceId:invoiceA.id,invoiceRevision:0,paymentId:paid.paymentId,amountCents:6000,operationId:op()},allocationA=expect(await post(applyBody),200,'allocate part of advance');expect(await post(applyBody),200,'allocate replay');
expect(await post({...applyBody,revision:2,operationId:op(),invoiceId:invoiceOther.id}),404,'cannot allocate another student');
let financeA=await finance.invoiceFinanceDetail(admin,invoiceA.id);check(()=>assert.equal(financeA.prepaymentCents,6000));check(()=>assert.equal(financeA.receivedCents,0));check(()=>assert.equal(financeA.paidCents,6000));check(()=>assert.equal(financeA.cashPaidCents,0));check(()=>assert.equal(financeA.revision,1));check(()=>assert.equal(financeA.remainingCents,4000));const invoiceHtml=render.renderInvoiceHtml(invoiceA,{lang:'en',finance:financeA});check(()=>assert(invoiceHtml.includes('Settled amount: RM60.00')));check(()=>assert(invoiceHtml.includes('Net cash received: RM0.00')));check(()=>assert(invoiceHtml.includes('Advance balance applied: RM60.00')));const invoiceZh=render.renderInvoiceHtml(invoiceA,{lang:'zh',finance:financeA});check(()=>assert(invoiceZh.includes('已结算金额: RM60.00')));check(()=>assert(invoiceZh.includes('净现金收款: RM0.00')));check(()=>assert(invoiceZh.includes('预收余额抵扣: RM60.00')));
const allocationB=expect(await post({...applyBody,revision:2,invoiceId:invoiceB.id,amountCents:7000,operationId:op()}),200,'one payment allocates another month');
overview=expect(await get({view:'overview',studentId:first}),200,'carried balance after two invoices');check(()=>assert.equal(overview.balance.balanceCents,7000));check(()=>assert.equal(overview.balance.appliedCents,13000));
expect(await post({action:'refund',studentId:first,revision:3,paymentId:paid.paymentId,amountCents:7001,reason:'Too much',operationId:op()}),409,'cannot refund allocated advance');
expect(await post({action:'reversePayment',studentId:first,revision:3,paymentId:paid.paymentId,reason:'Must release first',operationId:op()}),409,'cannot reverse allocated advance');
await assert.rejects(()=>finance.saveInvoiceFinance(admin,{action:'recordPayment',invoiceId:invoiceA.id,revision:1,amountCents:4001,method:'cash',operationId:op()}),/剩余欠款/);checks++;
const cash=await finance.saveInvoiceFinance(admin,{action:'recordPayment',invoiceId:invoiceA.id,revision:1,amountCents:4000,method:'cash',operationId:op()});check(()=>assert(cash.receiptId));
await assert.rejects(()=>finance.saveInvoiceFinance(admin,{action:'refund',invoiceId:invoiceA.id,revision:2,paymentId:paid.paymentId,amountCents:1000,reason:'Wrong payment',operationId:op()}),/不存在/);checks++;
const release=expect(await post({action:'release',studentId:first,revision:3,invoiceId:invoiceA.id,invoiceRevision:2,allocationId:allocationA.allocationId,amountCents:2000,reason:'Cancel tuition: keep balance',operationId:op()}),200,'partial release returns advance balance');
overview=expect(await get({view:'overview',studentId:first}),200,'released balance');check(()=>assert.equal(overview.balance.balanceCents,9000));
expect(await post({action:'refund',studentId:first,revision:4,paymentId:paid.paymentId,amountCents:3000,method:'bank_transfer',reason:'Cancel tuition: return funds',operationId:op()}),200,'explicit refund of available advance');
overview=expect(await get({view:'overview',studentId:first}),200,'refund recorded with reason');check(()=>assert.equal(overview.balance.balanceCents,6000));check(()=>assert.equal(overview.balance.refundedCents,3000));
expect(await post({action:'release',studentId:first,revision:5,invoiceId:invoiceA.id,invoiceRevision:3,allocationId:allocationA.allocationId,amountCents:4001,reason:'Too much',operationId:op()}),409,'cannot release more than allocation net');
const races=await Promise.all([0,1].map(()=>post({...applyBody,revision:5,invoiceId:invoiceA.id,invoiceRevision:3,amountCents:1000,operationId:op()})));check(()=>assert.deepEqual(races.map(r=>r.status).sort(),[200,409],'student and invoice CAS reject racing allocations'));
expect(await post({action:'voidRequest',requestId:draft.requestId,revision:2,reason:'Schedule cancelled, balance retained pending final settlement',operationId:op()}),200,'void advance request independent of funds');
check(()=>assert.equal(sqlite.prepare('SELECT document_json FROM prepayment_requests WHERE id=?').get(draft.requestId).document_json,frozenRequest));check(()=>assert.equal(sqlite.prepare('SELECT document_json FROM prepayment_receipts WHERE id=?').get(paid.receiptId).document_json,frozenReceipt));check(()=>assert.equal(sqlite.prepare('SELECT document_json FROM invoices WHERE id=?').get(invoiceA.id).document_json,frozenInvoice));
expect(await post({...payBody,revision:6,operationId:op()}),409,'void request cannot accept another referenced payment');
// Every new finance power requires a complete explicitly applied profile.
for(const allowed of[[],['prepayments.record'],['invoices.view','payments.view','payments.record']]){
 grant(allowed);expect(await get({view:'overview',studentId:first}),403,'old or incomplete finance grants cannot read advances');
 expect(await post({action:'recordPayment',studentId:second,revision:0,amountCents:100,method:'cash',operationId:op()}),403,'old or incomplete grants cannot collect advances');
}
grant(['prepayments.view']);expect(await get({view:'overview',studentId:first}),200,'advance viewer independent of invoice cash grants');expect(await get({view:'allocation',invoiceId:invoiceA.id}),403,'invoice allocation preview also requires invoice visibility');grant();
globalThis.__prepayEnv.ADMIN_PERMISSIONS_MODE='preparation';grant([]);
expect(await get({view:'overview',studentId:first}),403,'preparation mode cannot bypass explicit advance grants');
expect(await post({action:'recordPayment',studentId:second,revision:0,amountCents:100,method:'cash',operationId:op()}),403,'preparation mode cannot grant new cash powers');
globalThis.__prepayEnv.ADMIN_PERMISSIONS_MODE='enforced';grant();
afterRead=sql=>{if(sql.includes('SELECT l.id,l.planned_start AS plannedStart')){afterRead=null;grant([]);}};
expect(await get({view:'request',requestId:draft.requestId}),403,'request detail rechecks grant after reading current schedule');grant();
grant(['prepayments.view','prepayments.apply']);
expect(await post({action:'apply',studentId:first,revision:6,invoiceId:invoiceA.id,invoiceRevision:4,paymentId:paid.paymentId,amountCents:100,operationId:op()}),403,'apply requires independent invoice visibility at runtime');grant();
beforeBatch=()=>grant(['prepayments.view']);expect(await post({action:'recordPayment',studentId:second,revision:0,amountCents:100,method:'cash',operationId:op()}),409,'permission revocation inside write boundary');check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM prepayment_payments WHERE student_id=?').get(second).n,0));grant();
const session=(await load('lib/account-session.ts')).module,sessionActor=session.bindAccountSession({...admin},'prepay-live');sqlite.prepare("INSERT INTO sessions VALUES(?,?,'2099-01-01T00:00:00Z')").run('prepay-live',admin.id);
beforeBatch=()=>sqlite.prepare('DELETE FROM sessions WHERE token_hash=?').run('prepay-live');expect(await post({action:'recordPayment',studentId:second,revision:0,amountCents:100,method:'cash',operationId:op()},sessionActor),409,'session revoked at ledger write');expect(await get({view:'overview',studentId:first},sessionActor),403,'session read denied after logout');
// Strict append-only accounting and defensive cross-ledger aggregate guards.
for(const table of['prepayment_payments','prepayment_receipts','prepayment_events','prepayment_allocations'])check(()=>assert.throws(()=>sqlite.exec('DELETE FROM '+table),/prepayment_immutable/));
check(()=>assert.throws(()=>sqlite.prepare('UPDATE prepayment_accounts SET received_cents=received_cents+1 WHERE student_id=?').run(first),/prepayment_immutable/));
check(()=>assert.throws(()=>sqlite.prepare('UPDATE invoice_finance_accounts SET prepayment_cents=prepayment_cents+1 WHERE invoice_id=?').run(invoiceA.id),/invoice_finance_immutable/));
check(()=>assert.throws(()=>sqlite.prepare('DELETE FROM prepayment_requests WHERE id=?').run(draft.requestId),/prepayment_request_immutable/));
for(let revision=0;revision<23;revision++)expect(await post({action:'recordPayment',studentId:second,revision,amountCents:100,method:'cash',operationId:op()}),200,'bounded history seed');
const paymentsPage=expect(await get({view:'payments',studentId:second,page:'2'}),200,'payment history page');check(()=>assert.equal(paymentsPage.items.length,3));check(()=>assert.equal(paymentsPage.total,23));
const usable=expect(await get({view:'payments',studentId:second,availableOnly:'true'}),200,'usable payment selection');check(()=>assert.equal(usable.total,23));const ledgerPage=expect(await get({view:'ledger',studentId:second,page:'2'}),200,'ledger page');check(()=>assert.equal(ledgerPage.items.length,3));
const summary=expect(await get({view:'overview',studentId:second}),200,'bounded overview');check(()=>assert.equal(summary.payments.length,20));check(()=>assert.equal(summary.counts.payments,23));
// Races also reject two refunds against the same student revision.
const betaPayment=summary.payments[0],refundRace=await Promise.all([0,1].map(()=>post({action:'refund',studentId:second,revision:23,paymentId:betaPayment.id,amountCents:100,reason:'Duplicate concurrent cancel',operationId:op()})));check(()=>assert.deepEqual(refundRace.map(r=>r.status).sort(),[200,409]));
const reverseTarget=summary.payments[1];
expect(await post({action:'reversePayment',studentId:second,revision:24,paymentId:reverseTarget.id,method:'tng',reason:'Incorrect receipt',operationId:op()}),400,'reversal retains original cash method');
expect(await post({action:'reversePayment',studentId:second,revision:24,paymentId:reverseTarget.id,reason:'Incorrect receipt',operationId:op()}),200,'unused advance can reverse');
const usableAfter=expect(await get({view:'payments',studentId:second,availableOnly:'true'}),200,'usable payments exclude fully refunded and reversed receipts');check(()=>assert.equal(usableAfter.total,21));
check(()=>assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]));check(()=>assert.equal(sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok'));
console.log(JSON.stringify({ok:true,checks}));
