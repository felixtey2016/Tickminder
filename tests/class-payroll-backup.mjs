import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createFixtureLoader} from './fixture-loader.mjs';
import {checkRestoredFinanceRound2,snapshotVersion,expectedSnapshotTables} from '../scripts/backup-order.mjs';

// Real services, SQL and restore code with fictional institutions and money only.
globalThis.fetch=async()=>{throw Error('Network forbidden in classroom payroll backup fixture');};
const root=path.resolve(import.meta.dirname,'..'),RealDate=Date,now='2032-06-15T04:00:00.000Z';
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return RealDate.parse(now);}};
function database(max=999){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const name of fs.readdirSync(path.join(root,'drizzle')).filter(n=>n.endsWith('.sql')&&Number(n.slice(0,4))<=max).sort())db.exec(fs.readFileSync(path.join(root,'drizzle',name),'utf8'));return db;}
let active=database(45),checks=0;
function statement(sql,values=[]){const execute=()=>{assert(values.length<=100,'D1 parameter limit');const s=active.prepare(sql);return s.columns().length?{results:s.all(...values),meta:{changes:0}}:{results:[],meta:s.run(...values)};};return{bind:(...v)=>statement(sql,v),first:async()=>execute().results[0]||null,all:async()=>execute(),run:async()=>execute(),execute};}
const db={prepare:statement,batch:async statements=>{active.exec('BEGIN');try{const result=statements.map(s=>s.execute());active.exec('COMMIT');return result;}catch(e){active.exec('ROLLBACK');throw e;}}};
const token='fictional-class-payroll-backup-token-1234567890',gid='class-payroll-school',owner={id:'class-payroll-owner',email:'owner@class-payroll.example.test',role:'admin',groupId:gid,name:'Fictional payroll owner'};
globalThis.__classPayrollBackupRuntime={learningDb:()=>db,currentBusinessAccount:async()=>owner,OWNER_EMAIL:owner.email,isOwnerAccount:a=>a.role==='admin'&&a.email===owner.email&&!a.id.startsWith('local:'),pdfLimits:()=>({total:10000000}),pdfBucket:()=>({}),env:{ADMIN_PERMISSIONS_MODE:'enforced',BACKUP_EXPORT_TOKEN:token}};
const dataUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64'),runtimeUrl=dataUrl('export const {learningDb,currentBusinessAccount,OWNER_EMAIL,isOwnerAccount,pdfLimits,pdfBucket,env}=globalThis.__classPayrollBackupRuntime;');
const load=createFixtureLoader({runtimeUrl,environmentUrl:runtimeUrl,runtimeFiles:['lib/auth.ts','lib/owner.ts','lib/learning-server.ts','lib/pdf-storage.ts']});
const route=(await load('app/api/backup-export/route.ts')).module;
let secure=fs.readFileSync(path.join(root,'scripts/secure-d1-backup.mjs'),'utf8').replace(/\r\n/g,'\n').split('\ntry {\n')[0];secure=secure.replace("const projectRoot = resolve(import.meta.dirname, '..').toLowerCase();",'const projectRoot = '+JSON.stringify(root.toLowerCase())+';').replace("'./backup-order.mjs'",JSON.stringify(new URL('../scripts/backup-order.mjs',import.meta.url).href));const {restoreInMemory}=await import(dataUrl(secure+'\nexport {restoreInMemory};'));
const check=(label,fn)=>{fn();checks++;console.log('PASS '+label);},hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),op=()=>crypto.randomUUID();
function seedSchool(){active.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(gid,'Fictional Classroom Payroll',gid,now,now);active.prepare('INSERT INTO accounts(id,email,name,role,group_id,created_at) VALUES(?,?,?,?,?,?)').run(owner.id,owner.email,owner.name,owner.role,gid,now);}
function seedTeacher(name){active.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(gid,name,'2030-01-01T00:00:00.000Z');}
function classroom(id,name,createdAt='2030-01-01T00:00:00.000Z'){active.prepare('INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,gid,'Fictional '+id,'Mathematics',name,owner.id,createdAt,now);}
function session(id,classroomId,teacherName,start,end,ready=true){active.prepare("INSERT INTO class_sessions(id,group_id,session_type,classroom_id,classroom_title,teacher_name,subject,planned_start,planned_end,status,teaching_status,actual_start,actual_end,attendance_reviewed_at,created_by,created_at,updated_at) VALUES(?,?,'group',?,?,?,?,?,?,'scheduled',?,?,?,?,?,?,?)").run(id,gid,classroomId,'Fictional '+classroomId,teacherName,'Mathematics',start,end,ready?'taught':'pending',ready?start:null,ready?end:null,ready?now:null,owner.id,now,now);}
async function exported(){const response=await route.GET(new Request('https://fictional.test/api/backup-export',{headers:{authorization:'Bearer '+token}}));assert.equal(response.status,200);return response.json();}
function corrupt(snapshot,label,edit){check(label,()=>{const bad=structuredClone(snapshot);edit(bad);assert.throws(()=>restoreInMemory(bad),/teacher pay|expense|constraint|Incomplete|Schema mismatch/i);});}
seedSchool();seedTeacher('Legacy Teacher');classroom('legacy-class','Legacy Teacher');session('legacy-session','legacy-class','Legacy Teacher','2032-06-03T02:00:00.000Z','2032-06-03T03:30:00.000Z');
const legacyTeacher='legacy-payroll-teacher',legacyScope='legacy-payroll-scope',legacyRate='legacy-payroll-rate',legacyRun='legacy-payroll-run',saveOperation=op(),generateOperation=op(),confirmOperation=op();
active.prepare('INSERT INTO payroll_teachers(id,group_id,teacher_name,created_at) VALUES(?,?,?,?)').run(legacyTeacher,gid,'Legacy Teacher',now);
active.prepare("INSERT INTO payroll_rate_scopes(id,group_id,teacher_id,classroom_id,scope_key,revision,updated_at) VALUES(?,?,?,NULL,'',1,?)").run(legacyScope,gid,legacyTeacher,now);
function operation(operationId,action,result){active.prepare('INSERT INTO payroll_operations(group_id,operation_id,actor_id,action,request_hash,execution_id,result_json,created_at) VALUES(?,?,?,?,?,?,?,?)').run(gid,operationId,owner.id,action,'a'.repeat(64),op(),JSON.stringify(result),now);}
operation(saveOperation,'saveRate',{ok:true,teacherId:legacyTeacher,rateId:legacyRate,revision:1});
active.prepare("INSERT INTO payroll_rate_versions(id,group_id,scope_id,revision,amount_cents,currency,effective_from,created_by,created_at,operation_id) VALUES(?,?,?,1,3000,'MYR','2030-01-01',?,?,?)").run(legacyRate,gid,legacyScope,owner.id,now,saveOperation);
const legacyLine={sessionId:'legacy-session',classroomId:'legacy-class',classroomTitle:'Fictional legacy-class',subject:'Mathematics',teacherName:'Legacy Teacher',plannedStart:'2032-06-03T02:00:00.000Z',plannedEnd:'2032-06-03T03:30:00.000Z',actualStart:'2032-06-03T02:00:00.000Z',actualEnd:'2032-06-03T03:30:00.000Z',teachingStatus:'taught',attendanceReviewedAt:now,sessionRevision:1,rateVersionId:legacyRate,hourlyRateCents:3000,durationSeconds:5400,minutes:90,amountCents:4500,status:'ready',warnings:[]};
const legacyHash=hash({teacherId:legacyTeacher,teacherName:'Legacy Teacher',month:'2032-06',unlinked:[],lines:[(({sessionRevision,attendanceReviewedAt,...line})=>({...line,attendanceConfirmed:Boolean(attendanceReviewedAt)}))(legacyLine)]});
const legacyDocument={id:legacyRun,groupId:gid,teacherId:legacyTeacher,teacherName:'Legacy Teacher',month:'2032-06',currency:'MYR',status:'confirmed',revision:2,sourceHash:legacyHash,sourceLines:[legacyLine],baseTotalCents:4500,durationSeconds:5400,lessonCount:1,createdAt:now,updatedAt:now,confirmedAt:now};
operation(generateOperation,'generate',{ok:true,payrollId:legacyRun,revision:1});operation(confirmOperation,'confirm',{ok:true,payrollId:legacyRun,revision:2});
active.prepare("INSERT INTO payroll_runs(id,group_id,teacher_id,month,status,revision,document_json,source_hash,base_total_cents,created_by,created_at,updated_at,confirmed_by,confirmed_at) VALUES(?,?,?,'2032-06','confirmed',2,?,?,4500,?,?,?,?,?)").run(legacyRun,gid,legacyTeacher,JSON.stringify(legacyDocument),legacyHash,owner.id,now,now,owner.id,now);
const oldSnapshot=await exported();check('nonempty v26 hourly salary restores without mode or new tables',()=>{assert.equal(snapshotVersion(oldSnapshot),26);assert.equal(restoreInMemory(oldSnapshot).payroll_runs,1);});
active.exec(fs.readFileSync(path.join(root,'drizzle/0046_classroom_payroll.sql'),'utf8'));
const upgraded=await exported();check('v26 migration retains frozen document and creates exact legacy bridge',()=>{assert.equal(active.prepare('SELECT document_json FROM payroll_runs WHERE id=?').get(legacyRun).document_json,JSON.stringify(legacyDocument));const link=active.prepare('SELECT * FROM payroll_legacy_rate_links').get();assert.equal(link.classroom_id,'legacy-class');assert.equal(link.scope_id,legacyScope);assert.equal(link.max_revision,1);assert.equal(snapshotVersion(upgraded),27);assert.equal(restoreInMemory(upgraded).payroll_runs,1);});
corrupt(upgraded,'legacy bridge cannot point beyond saved rate revision',s=>s.tables.payroll_legacy_rate_links.rows[0].max_revision=2);
corrupt(upgraded,'v27 cannot silently omit a classroom payroll table',s=>delete s.tables.payroll_deleted_drafts);
corrupt(upgraded,'v27 cannot silently omit rate mode column',s=>{s.tables.payroll_rate_versions.columns=s.tables.payroll_rate_versions.columns.filter(c=>c!=='mode');for(const row of s.tables.payroll_rate_versions.rows)delete row.mode;});
const legacyDb=active;active=database();seedSchool();seedTeacher('Mixed Teacher');
classroom('hour-class','Mixed Teacher');classroom('lesson-class','Mixed Teacher');classroom('month-class','Mixed Teacher','2032-06-10T00:00:00.000Z');
session('hour-session','hour-class','Mixed Teacher','2032-06-02T02:00:00.000Z','2032-06-02T03:30:00.000Z');
session('lesson-session-a','lesson-class','Mixed Teacher','2032-06-03T02:00:00.000Z','2032-06-03T03:30:00.000Z');
session('lesson-session-b','lesson-class','Mixed Teacher','2032-06-04T02:00:00.000Z','2032-06-04T02:45:00.000Z');
session('month-session','month-class','Mixed Teacher','2032-06-11T02:00:00.000Z','2032-06-11T03:00:00.000Z');
const payroll=(await load('lib/payroll-server.ts')).module,teacherId=(await payroll.payrollTeachers(owner)).items[0].teacherId;
for(const [classroomId,mode,amountCents,effectiveFrom]of [['hour-class','hour',3000,'2030-01-01'],['lesson-class','lesson',12000,'2030-01-01'],['month-class','month',60000,'2032-06-10']])await payroll.savePayroll(owner,{action:'saveRate',teacherId,classroomId,mode,revision:0,amountCents,effectiveFrom,operationId:op()});
// Further assertions below exercise actual reviewed monthly pay and draft deletion.
const generated=await payroll.savePayroll(owner,{action:'generate',teacherId,month:'2032-06',operationId:op()});
let detail=await payroll.payrollDetail(owner,generated.payrollId);
check('mixed draft counts per-lesson classes once and marks partial monthly pay for review',()=>{assert.equal(detail.payroll.calculationVersion,2);assert.equal(detail.summary.baseTotalCents,28500);assert.equal(detail.payroll.monthlyLines.length,1);assert(detail.payroll.monthlyLines[0].warnings.includes('partial_month'));});
const monthly=detail.payroll.monthlyLines[0];
await payroll.savePayroll(owner,{action:'reviewMonth',teacherId,classroomId:'month-class',month:'2032-06',revision:monthly.reviewRevision,amountCents:50000,reason:'Fictional approved partial-month remuneration',expectedSourceHash:monthly.sourceHash,operationId:op()});
await payroll.savePayroll(owner,{action:'refresh',payrollId:generated.payrollId,revision:detail.summary.revision,operationId:op()});
detail=await payroll.payrollDetail(owner,generated.payrollId);
check('reviewed monthly amount adds once to hourly and per-lesson salary',()=>{assert.equal(detail.summary.baseTotalCents,78500);assert.equal(detail.payroll.monthlyLines[0].amountCents,50000);assert.equal(detail.review.pendingCount,0);});
await payroll.savePayroll(owner,{action:'confirm',payrollId:generated.payrollId,revision:detail.summary.revision,expectedSourceHash:detail.payroll.sourceHash,operationId:op()});
detail=await payroll.payrollDetail(owner,generated.payrollId);
await payroll.savePayroll(owner,{action:'pay',payrollId:generated.payrollId,revision:detail.summary.revision,amountCents:10000,method:'bank_transfer',paidAt:now,operationId:op()});
const mixedSnapshot=await exported();check('v31 restores actual mixed salary, monthly approval and payout with exact row contents',()=>{assert.deepEqual(Object.keys(mixedSnapshot.tables).sort(),expectedSnapshotTables(31).sort());const counts=restoreInMemory(mixedSnapshot);assert.equal(counts.payroll_runs,1);assert.equal(counts.payroll_monthly_reviews,1);assert.equal(counts.payroll_events,1);});
corrupt(mixedSnapshot,'per-lesson salary cannot be tampered into hourly calculation',s=>{const r=s.tables.payroll_runs.rows[0],d=JSON.parse(r.document_json),line=d.sourceLines.find(l=>l.sessionId==='lesson-session-a');line.amountCents=18000;r.document_json=JSON.stringify(d);});
corrupt(mixedSnapshot,'monthly amount cannot differ from immutable approved amount',s=>{const r=s.tables.payroll_runs.rows[0],d=JSON.parse(r.document_json);d.monthlyLines[0].amountCents++;r.document_json=JSON.stringify(d);});
corrupt(mixedSnapshot,'monthly review approval amount mismatch is rejected',s=>s.tables.payroll_monthly_reviews.rows[0].amount_cents++);
corrupt(mixedSnapshot,'monthly approval actor must match its operation',s=>s.tables.payroll_monthly_reviews.rows[0].created_by='another-actor');
corrupt(mixedSnapshot,'monthly source signature cannot be removed from frozen salary',s=>{const r=s.tables.payroll_runs.rows[0],d=JSON.parse(r.document_json);delete d.calculationVersion;r.document_json=JSON.stringify(d);});
corrupt(mixedSnapshot,'month-rate history cannot be changed to hourly',s=>s.tables.payroll_rate_versions.rows.find(r=>r.mode==='month').mode='hour');
await assert.rejects(()=>payroll.savePayroll(owner,{action:'deleteDraft',payrollId:generated.payrollId,revision:detail.summary.revision,operationId:op()}),/草稿|已确认|版本|改变/);checks++;
session('july-session','lesson-class','Mixed Teacher','2032-07-02T02:00:00.000Z','2032-07-02T03:30:00.000Z',false);
const body={action:'generate',teacherId,month:'2032-07',operationId:op()},draft=await payroll.savePayroll(owner,body),draftDetail=await payroll.payrollDetail(owner,draft.payrollId);
const original=active.prepare('SELECT * FROM payroll_runs WHERE id=?').get(draft.payrollId),deleteBody={action:'deleteDraft',payrollId:draft.payrollId,revision:draftDetail.summary.revision,operationId:op()};
await payroll.savePayroll(owner,deleteBody);
check('draft deletion retains exact original snapshot and audit operation',()=>{assert.equal(active.prepare('SELECT count(*) n FROM payroll_runs WHERE id=?').get(draft.payrollId).n,0);assert.deepEqual(JSON.parse(active.prepare('SELECT run_snapshot_json FROM payroll_deleted_drafts WHERE payroll_id=?').get(draft.payrollId).run_snapshot_json),{...original});assert.equal(active.prepare('SELECT count(*) n FROM payroll_operations WHERE operation_id=?').get(deleteBody.operationId).n,1);});
const deletedSnapshot=await exported();check('deleted draft restores as audit-only history and cannot reappear as active salary',()=>{const counts=restoreInMemory(deletedSnapshot);assert.equal(counts.payroll_runs,1);assert.equal(counts.payroll_deleted_drafts,1);});
await assert.rejects(()=>payroll.savePayroll(owner,body),/已删除/);checks++;
await payroll.savePayroll(owner,deleteBody);
const recreated=await payroll.savePayroll(owner,{...body,operationId:op()});
check('new generation uses new identity while keeping old deletion history',()=>{assert.notEqual(recreated.payrollId,draft.payrollId);assert.equal(active.prepare('SELECT count(*) n FROM payroll_deleted_drafts').get().n,1);});
const recreatedSnapshot=await exported();check('regenerated salary and deleted predecessor both restore without duplicate monthly identity',()=>{const counts=restoreInMemory(recreatedSnapshot);assert.equal(counts.payroll_runs,2);assert.equal(counts.payroll_deleted_drafts,1);});
corrupt(deletedSnapshot,'deleted history cannot be omitted while original operations remain',s=>s.tables.payroll_deleted_drafts.rows=[]);
corrupt(deletedSnapshot,'deleted draft cannot be restored as active salary',s=>{const d=s.tables.payroll_deleted_drafts.rows[0];s.tables.payroll_runs.rows.push(JSON.parse(d.run_snapshot_json));});
corrupt(deletedSnapshot,'deleted snapshot cannot claim a paid financial balance',s=>{const d=s.tables.payroll_deleted_drafts.rows[0],r=JSON.parse(d.run_snapshot_json);r.paid_cents=1;d.run_snapshot_json=JSON.stringify(r);});
corrupt(deletedSnapshot,'deleted snapshot cannot alter original generation actor',s=>{const d=s.tables.payroll_deleted_drafts.rows[0],r=JSON.parse(d.run_snapshot_json);r.created_by='another-actor';d.run_snapshot_json=JSON.stringify(r);});
corrupt(deletedSnapshot,'deleted draft actor must match authorized deletion operation',s=>s.tables.payroll_deleted_drafts.rows[0].deleted_by='another-actor');
corrupt(deletedSnapshot,'deleted draft operation revision cannot be rewritten',s=>{const o=s.tables.payroll_operations.rows.find(o=>o.action==='deleteDraft'),r=JSON.parse(o.result_json);r.revision++;o.result_json=JSON.stringify(r);});
check('live payroll ledger validates after regeneration',()=>checkRestoredFinanceRound2(active));
legacyDb.close();active.close();console.log(JSON.stringify({suite:'class-payroll-backup',checks,productionWrites:false}));
