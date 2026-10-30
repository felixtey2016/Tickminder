import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createFixtureLoader} from '../tests/fixture-loader.mjs';

const RealDate=Date,clock=RealDate.parse('2032-10-30T04:00:00Z');
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
let actor=null,afterRead=null,checks=0,queries=[];
function statement(sql,values=[]){
 const execute=()=>{assert(values.length<=100,'D1 parameter limit');queries.push(sql);const s=sqlite.prepare(sql);return s.columns().length?{results:s.all(...values),meta:{changes:0}}:{results:[],meta:s.run(...values)};};
 return{bind:(...v)=>statement(sql,v),all:async()=>{const result=execute();if(afterRead)await afterRead(sql);return result;},first:async()=>{const result=execute();if(afterRead)await afterRead(sql);return result.results[0]||null;},run:async()=>execute(),execute};
}
const db={prepare:statement,batch:async statements=>{sqlite.exec('BEGIN');try{const result=statements.map(s=>s.execute());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
globalThis.__statementTest={learningDb:()=>db,currentBusinessAccount:async()=>actor,OWNER_EMAIL:'owner@statement.example.test',isOwnerAccount:a=>a?.role==='admin'&&a.email==='owner@statement.example.test'&&!a.id.startsWith('local:'),pdfLimits:()=>({total:100000000,perFile:20000000}),pdfBucket:()=>({get:async()=>null})};
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64'),runtimeUrl=data('export const {learningDb,currentBusinessAccount,OWNER_EMAIL,isOwnerAccount,pdfLimits,pdfBucket}=globalThis.__statementTest;'),environmentUrl=data("export const env={ADMIN_PERMISSIONS_MODE:'enforced'};"),next=data('export const NextResponse={json:(value,options)=>Response.json(value,options)};');
const load=createFixtureLoader({runtimeUrl,environmentUrl,transform:(_f,s)=>s.replaceAll("'next/server'",JSON.stringify(next)).replaceAll('"next/server"',JSON.stringify(next))});
const route=(await load('app/api/student-statements/route.ts')).module,billing=(await load('lib/billing-server.ts')).module,session=(await load('lib/account-session.ts')).module,prepay=(await load('lib/prepayments-server.ts')).module,finance=(await load('lib/invoice-finance-server.ts')).module,pure=(await load('lib/student-statements.ts')).module,render=(await load('lib/invoice-render.ts')).module,settings=(await load('lib/invoice-settings.ts')).module;
const now=new Date().toISOString(),g='statement-school',foreign='statement-foreign',op=()=>crypto.randomUUID();
for(const gid of[g,foreign])sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(gid,gid,gid,now,now);
function account(id,role='admin',groupId=g){const a={id,role,groupId,name:id,email:id+'@statement.example.test'};sqlite.prepare('INSERT INTO accounts(id,email,name,role,group_id,created_at) VALUES(?,?,?,?,?,?)').run(id,a.email,id,role,groupId,now);return a;}
const chief=account('statement-chief'),admin=account('statement-admin'),teacher=account('statement-teacher','teacher'),student=account('statement-student','student'),parent=account('statement-parent','parent'),outsider=account('statement-other','admin',foreign);
sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run(chief.id,g);
const grants=['fees.view','invoices.view','payments.view','prepayments.view'];
function grant(keys=grants){sqlite.prepare("INSERT INTO admin_permission_profiles(group_id,account_id,revision,grants_json,origin,updated_at) VALUES(?,?,1,?,'new',?) ON CONFLICT(group_id,account_id) DO UPDATE SET revision=revision+1,grants_json=excluded.grants_json").run(g,admin.id,JSON.stringify(keys),now);}grant();
function learner(name,groupId=g){sqlite.prepare('INSERT INTO students(group_id,name,name_key,created_at) VALUES(?,?,?,?)').run(groupId,name,name.toLowerCase(),'2032-01-01T00:00:00Z');sqlite.prepare('INSERT INTO plans(key,group_id,student,subject,teacher_name,created_at) VALUES(?,?,?,?,?,?)').run(groupId+'-'+name,groupId,name,'Science','Fictional Teacher','2032-01-01T00:00:00Z');return sqlite.prepare('SELECT id FROM billing_students WHERE group_id=? AND student_name=?').get(groupId,name).id;}
const ids={};for(const name of['Prior','Alpha','Applied','Missing','Moved','Voided','Legacy','Monthly','Refund','Reversed','Direct'])ids[name]=learner(name);const foreignSid=learner('Foreign',foreign);
for(const name of Object.keys(ids)){const context=(await billing.billingRateSettings(chief,g+'-'+name)).context;await billing.saveBilling(chief,{action:'saveRate',studentId:context.studentId,subjectKey:context.subjectKey,revision:0,mode:name==='Monthly'?'month':'hour',amount:name==='Monthly'?'150.00':'80.00',effectiveFrom:name==='Prior'?'2032-06-01':'2032-09-01',operationId:op()});}
function lesson(id,name,month='2032-09',day=5,pending=false){const start=month+'-'+String(day).padStart(2,'0')+'T02:00:00Z',end=month+'-'+String(day).padStart(2,'0')+'T03:00:00Z';sqlite.prepare('INSERT INTO lessons(id,group_id,student,subject,teacher_name,planned_start,planned_end,actual_start,actual_end,status,attendance_kind,chargeable,reviewed_at,created_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,g,name,'Science','Fictional Teacher '+id,start,end,pending?null:start,pending?null:end,pending?'scheduled':'completed',pending?'pending':'present',pending?null:1,pending?null:'2032-09-25T00:00:00Z',chief.id,'2032-09-25T00:00:00Z');sqlite.prepare('UPDATE class_sessions SET teaching_status=?,actual_start=?,actual_end=?,attendance_reviewed_at=? WHERE id=(SELECT session_id FROM lessons WHERE id=?)').run(pending?'pending':'taught',pending?null:start,pending?null:end,pending?null:'2032-09-25T00:00:00Z',id);sqlite.prepare('UPDATE class_session_participants SET attendance_status=?,arrived_at=?,left_at=? WHERE lesson_id=?').run(pending?'pending':'present',pending?null:start,pending?null:end,id);}
for(const name of['Alpha','Applied','Missing'])for(let day=1;day<=7;day++)lesson(name+'-'+day,name,'2032-09',day);
lesson('missing-attendance','Missing','2032-09',10,true);
for(const name of['Moved','Voided','Legacy','Direct'])lesson(name+'-source',name);
lesson('prior-source','Prior','2032-08');lesson('current-source','Prior','2032-09');lesson('old-history','Prior','2032-06');
const check=fn=>{fn();checks++;},expect=(r,status,label)=>{check(()=>assert.equal(r.status,status,label+': '+JSON.stringify(r.body)));return r.body;};
async function get(name='Alpha',month='2032-09',as=admin,more={}){actor=as;const r=await route.GET(new Request('https://statement.example.test/api/student-statements?'+new URLSearchParams({studentId:ids[name],month,...more})));return{status:r.status,body:await r.json(),headers:r.headers};}
async function entire(name='Alpha',month='2032-09',as=admin){let first=expect(await get(name,month,as),200,name+' statement'),pages=[first];while(pages.at(-1).nextBefore){const last=pages.at(-1);pages.push(expect(await get(name,month,as,{before:last.nextBefore,token:first.token}),200,name+' history page'));}return pure.completeStudentStatement(pages);}
async function payment(name,value=64000,paidAt='2032-09-27'){return prepay.savePrepayment(chief,{action:'recordPayment',studentId:ids[name],revision:sqlite.prepare('SELECT revision FROM prepayment_accounts WHERE group_id=? AND student_id=?').get(g,ids[name])?.revision||0,operationId:op(),amountCents:value,paidAt,method:'bank_transfer'});}
function invoice(name,total=8000,itemOnly=false){const invoiceId='invoice-'+name,source=(awaitablePreviews[name]||[]),document={...render.sampleInvoiceDocument(settings.defaultInvoiceSettings('Statement School')),id:invoiceId,groupId:g,studentId:ids[name],student:{id:ids[name],name,syllabus:null,grade:null},month:'2032-09',status:'issued',revision:1,number:'INV-'+name,issuedAt:'2032-09-28T00:00:00Z',createdAt:now,updatedAt:now,totalCents:total,subtotalCents:total,discountCents:0,sourceLines:itemOnly?[]:source,lines:[]};
 const draft={...document,status:'draft',number:null,issuedAt:null};sqlite.prepare("INSERT INTO invoices(id,group_id,student_id,month,status,revision,number,issued_at,created_at,updated_at,created_by,due_date,currency,source_hash,source_basis_json,adjustment_basis_json,document_json,total_cents) VALUES(?,?,?,'2032-09','draft',1,NULL,NULL,?,?,?,'2032-09-30','MYR','fixture','{}','[]',?,?)").run(invoiceId,g,ids[name],now,now,chief.id,JSON.stringify(draft),total);
 if(itemOnly)for(const [position,line]of source.entries())sqlite.prepare('INSERT INTO invoice_items(id,group_id,invoice_id,position,kind,source_id,amount_cents,snapshot_json) VALUES(?,?,?,?,?,?,?,?)').run(op(),g,invoiceId,position,'fee',line.id,line.amountCents??0,JSON.stringify(line));
 sqlite.prepare("UPDATE invoices SET status='issued',number=?,issued_at=?,document_json=? WHERE id=?").run(document.number,document.issuedAt,JSON.stringify(document),invoiceId);return invoiceId;
}
const awaitablePreviews={};for(const name of['Applied','Moved','Voided','Legacy','Direct'])awaitablePreviews[name]=(await billing.billingPreview(chief,'2032-09',1,1,ids[name])).detail.lines;
for(const name of['Alpha','Missing','Applied'])await payment(name);
const appliedInvoice=invoice('Applied',56000),appliedPayment=sqlite.prepare('SELECT id FROM prepayment_payments WHERE student_id=?').get(ids.Applied).id;
const allocation=await prepay.savePrepayment(chief,{action:'apply',studentId:ids.Applied,paymentId:appliedPayment,invoiceId:appliedInvoice,revision:1,invoiceRevision:0,amountCents:56000,operationId:op()});
invoice('Moved');invoice('Voided');invoice('Legacy',8000,true);const directInvoice=invoice('Direct');
await finance.saveInvoiceFinance(chief,{action:'recordPayment',invoiceId:directInvoice,revision:0,operationId:op(),amountCents:8000,paidAt:'2032-09-28',method:'cash'});
await finance.saveInvoiceFinance(chief,{action:'void',invoiceId:'invoice-Voided',revision:0,operationId:op(),reason:'Fictional cancellation'});
await payment('Prior',24000,'2032-08-20');
const refunded=await payment('Refund',10000);await prepay.savePrepayment(chief,{action:'refund',studentId:ids.Refund,paymentId:refunded.paymentId,revision:1,operationId:op(),amountCents:4000,refundedAt:'2032-09-28',reason:'Fictional return'});
const reversed=await payment('Reversed',10000);await prepay.savePrepayment(chief,{action:'reversePayment',studentId:ids.Reversed,paymentId:reversed.paymentId,revision:1,operationId:op(),effectiveAt:'2032-09-28',reason:'Fictional incorrect entry'});
const dbSnapshot=()=>JSON.stringify(sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,sqlite.prepare('SELECT * FROM '+JSON.stringify(name)+' ORDER BY rowid').all()]));
let unchanged=dbSnapshot();
for(const as of[null,teacher,student,parent,outsider])expect(await get('Alpha','2032-09',as),as?403:401,'non financial role denied');
expect(await get('Alpha','2032-09',admin,{studentId:foreignSid}),404,'foreign student id denied');
for(const missing of grants){grant(grants.filter(key=>key!==missing));expect(await get(),403,'missing '+missing+' denied');}grant();unchanged=dbSnapshot();
let result=await entire('Alpha');check(()=>assert.equal(result.creditCents,8000));check(()=>assert.equal(result.chargeCents,56000));check(()=>assert.equal(result.status,'reconciled'));
result=await entire('Missing');check(()=>assert.equal(result.pendingCount,1));check(()=>assert.equal(result.status,'review'));check(()=>assert.equal(result.creditCents,8000,'net recorded amount remains separately visible under review'));
result=await entire('Applied');check(()=>assert.equal(result.receivedCents,64000,'allocation does not repeat collection'));check(()=>assert.equal(result.chargeCents,56000,'covered tuition not charged twice'));check(()=>assert.equal(result.creditCents,8000));check(()=>assert.equal(result.walletBalanceCents,8000));check(()=>assert.equal(result.invoiceDueCents,0));
result=await entire('Direct');check(()=>assert.equal(result.receivedCents,8000));check(()=>assert.equal(result.closingCents,0));
result=await entire('Voided');check(()=>assert.equal(result.chargeCents,0,'voided original sources remain retired'));check(()=>assert.equal(result.closingCents,0));
result=await entire('Refund');check(()=>assert.equal(result.receivedCents,10000));check(()=>assert.equal(result.refundedCents,4000));check(()=>assert.equal(result.closingCents,6000));
result=await entire('Reversed');check(()=>assert.equal(result.reversedCents,10000));check(()=>assert.equal(result.closingCents,0));
result=await entire('Prior');check(()=>assert.equal(result.openingCents,8000));check(()=>assert.equal(result.closingCents,0));check(()=>assert.equal(result.months.length,4));
result=await entire('Monthly');check(()=>assert.equal(result.chargeCents,15000,'fixed monthly fee independent of lesson count'));check(()=>assert.equal(result.outstandingCents,15000));
check(()=>assert.equal(dbSnapshot(),unchanged,'all monthly reads preserve every database table byte for byte'));
result=await entire('Alpha','2032-10');check(()=>assert.equal(result.openingCents,8000,'next calendar month opens with prior balance automatically'));check(()=>assert.equal(result.closingCents,8000));check(()=>assert.equal(result.status,'in_progress','ongoing month is provisional'));
// Internal release changes only where money is allocated, never its account net.
await prepay.savePrepayment(chief,{action:'release',studentId:ids.Applied,allocationId:allocation.allocationId,invoiceId:appliedInvoice,revision:2,invoiceRevision:1,amountCents:56000,operationId:op(),reason:'Fictional allocation correction'});
result=await entire('Applied');check(()=>assert.equal(result.receivedCents,64000));check(()=>assert.equal(result.creditCents,8000));check(()=>assert.equal(result.walletBalanceCents,64000));check(()=>assert.equal(result.invoiceDueCents,56000));
// A manual fee credit is independent of cash refunded; original issued bytes stay frozen.
const directOriginal=sqlite.prepare('SELECT document_json FROM invoices WHERE id=?').get(directInvoice).document_json;
await finance.saveInvoiceFinance(chief,{action:'adjust',invoiceId:directInvoice,revision:1,operationId:op(),kind:'credit',amountCents:2000,reason:'Fictional fee discount'});
const directPayment=sqlite.prepare('SELECT id FROM invoice_payments WHERE invoice_id=?').get(directInvoice).id;
await finance.saveInvoiceFinance(chief,{action:'refund',invoiceId:directInvoice,revision:2,operationId:op(),paymentId:directPayment,amountCents:1000,refundedAt:'2032-09-29',creditInvoice:false,reason:'Fictional partial return'});
result=await entire('Direct');check(()=>assert.equal(result.invoiceCents,6000));check(()=>assert.equal(result.refundedCents,1000));check(()=>assert.equal(result.creditCents,1000));check(()=>assert.equal(sqlite.prepare('SELECT document_json FROM invoices WHERE id=?').get(directInvoice).document_json,directOriginal));
// Cross-month source coverage uses stable lesson IDs and must not charge the moved source twice.
sqlite.prepare("UPDATE lessons SET planned_start='2032-10-05T02:00:00Z',planned_end='2032-10-05T03:00:00Z',actual_start='2032-10-05T02:00:00Z',actual_end='2032-10-05T03:00:00Z',updated_at=? WHERE id='Moved-source'").run(now);
sqlite.prepare("UPDATE class_sessions SET planned_start='2032-10-05T02:00:00Z',planned_end='2032-10-05T03:00:00Z',actual_start='2032-10-05T02:00:00Z',actual_end='2032-10-05T03:00:00Z' WHERE id=(SELECT session_id FROM lessons WHERE id='Moved-source')").run();
result=await entire('Moved','2032-10');check(()=>assert.equal(result.openingCents,-8000));check(()=>assert.equal(result.chargeCents,0));check(()=>assert.equal(result.closingCents,-8000));check(()=>assert.equal(result.changedInvoiceCount,1));check(()=>assert.equal(result.status,'review'));
// Paginated history must reject an intervening financial mutation or stale auth.
const firstPage=expect(await get('Prior'),200,'history page');check(()=>assert.equal(firstPage.rows.length,3));check(()=>assert.equal(firstPage.nextBefore,'2032-06'));
await payment('Prior',100,'2032-09-29');expect(await get('Prior','2032-09',admin,{before:firstPage.nextBefore,token:firstPage.token}),409,'changed history token rejected');
expect(await get('Prior','2032-09',admin,{before:'2032-06'}),409,'cursor without token rejected');
expect(await get('Prior','2099-01'),400,'future month rejected');
const sessionActor=session.bindAccountSession({...admin},'fictional-statement-session');sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run('fictional-statement-session',admin.id,'2099-01-01T00:00:00Z');
afterRead=async sql=>{if(!sql.includes('billing_rate_versions'))return;afterRead=null;sqlite.prepare('DELETE FROM sessions WHERE token_hash=?').run('fictional-statement-session');};expect(await get('Alpha','2032-09',sessionActor),403,'logout during read discards financial response');afterRead=null;
queries=[];const bounded=await get('Prior');expect(bounded,200,'bounded history');check(()=>assert(queries.length<=45,'max three calendar months per request: '+queries.length));check(()=>assert.equal(bounded.headers.get('cache-control'),'private, no-store'));
check(()=>assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]));
// Legacy item-only snapshots must cover their original lessons too.
result=await entire('Legacy');check(()=>assert.equal(result.chargeCents,8000,'invoice_items-only source coverage is not billed twice'));
// Shared teaching/participant edits cannot bypass drift review by leaving the
// denormalised lesson's updated timestamp unchanged.
const directLessonAt=sqlite.prepare("SELECT updated_at FROM lessons WHERE id='Direct-source'").get().updated_at;
sqlite.prepare("UPDATE class_sessions SET updated_at=? WHERE id=(SELECT session_id FROM lessons WHERE id='Direct-source')").run(now);
result=await entire('Direct');check(()=>assert.equal(result.changedInvoiceCount,1,'session-only edit flags source drift'));check(()=>assert.equal(result.status,'review'));check(()=>assert.equal(sqlite.prepare("SELECT updated_at FROM lessons WHERE id='Direct-source'").get().updated_at,directLessonAt));
const legacyLessonAt=sqlite.prepare("SELECT updated_at FROM lessons WHERE id='Legacy-source'").get().updated_at;
sqlite.prepare("UPDATE class_session_participants SET attendance_updated_at=? WHERE lesson_id='Legacy-source'").run(now);
result=await entire('Legacy');check(()=>assert.equal(result.changedInvoiceCount,1,'participant-only edit flags legacy item source drift'));check(()=>assert.equal(result.status,'review'));check(()=>assert.equal(sqlite.prepare("SELECT updated_at FROM lessons WHERE id='Legacy-source'").get().updated_at,legacyLessonAt));
// An initial rate may be deliberately backdated. It must not create obligations
// (or 100+ history pages) before that student's actual enrolment starts.
ids.NewMonthly=learner('NewMonthly');sqlite.prepare("UPDATE students SET created_at='2032-10-01T00:00:00Z' WHERE group_id=? AND name='NewMonthly'").run(g);sqlite.prepare("UPDATE plans SET created_at='2032-10-01T00:00:00Z' WHERE group_id=? AND student='NewMonthly'").run(g);
const newMonthly=(await billing.billingRateSettings(chief,g+'-NewMonthly')).context;
await billing.saveBilling(chief,{action:'saveRate',studentId:newMonthly.studentId,subjectKey:newMonthly.subjectKey,revision:0,mode:'month',amount:'150.00',effectiveFrom:'2020-01-01',operationId:op()});
const newMonthPage=expect(await get('NewMonthly','2032-10'),200,'new monthly enrolment');check(()=>assert.deepEqual(newMonthPage.rows.map(row=>row.month),['2032-10']));check(()=>assert.equal(newMonthPage.nextBefore,null));check(()=>assert.equal(newMonthPage.rows[0].chargeCents,15000));
// Suppressing editor hashes must never skip an existing manual fee adjustment,
// nor preserve that adjustment after its source basis becomes stale.
let full=await billing.billingPreview(chief,'2032-09',1,1,ids.Alpha),adjusted=full.detail.lines.find(line=>line.lessonId==='Alpha-1');
await billing.saveBilling(chief,{action:'saveAdjustment',studentId:ids.Alpha,month:'2032-09',lineId:adjusted.id,expectedBasis:adjusted.basisHash,revision:0,amount:'45.00',reason:'Fictional agreed adjustment',operationId:op()});
const projection=p=>({subtotalCents:p.detail.subtotalCents,pendingCount:p.detail.pendingCount,lines:p.detail.lines.map(({id,amountCents,status,warnings})=>({id,amountCents,status,warnings}))});
full=await billing.billingPreview(chief,'2032-09',1,1,ids.Alpha);let compact=await billing.billingPreview(chief,'2032-09',1,1,ids.Alpha,undefined,undefined,false);check(()=>assert.equal(full.detail.subtotalCents,52500));check(()=>assert.deepEqual(projection(compact),projection(full),'compact path retains nonstale adjustment'));
sqlite.prepare("UPDATE class_sessions SET actual_end='2032-09-01T03:15:00Z' WHERE id=(SELECT session_id FROM lessons WHERE id='Alpha-1')").run();
full=await billing.billingPreview(chief,'2032-09',1,1,ids.Alpha);compact=await billing.billingPreview(chief,'2032-09',1,1,ids.Alpha,undefined,undefined,false);check(()=>assert.deepEqual(projection(compact),projection(full),'compact path retains stale-adjustment blocking'));check(()=>assert(compact.detail.lines.find(line=>line.lessonId==='Alpha-1').warnings.includes('adjustment_stale')));check(()=>assert.equal(compact.detail.pendingCount,1));
afterRead=async sql=>{if(!sql.includes('billing_rate_versions'))return;afterRead=null;grant(['fees.view']);};expect(await get('Alpha'),403,'revoked combined financial grants during query discard response');afterRead=null;grant();
console.log('Student statement real SQL, grants, cash, coverage, carry-forward and immutable originals: '+checks+' checks passed');
