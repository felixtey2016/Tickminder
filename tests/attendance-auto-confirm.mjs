import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {drizzle} from 'drizzle-orm/d1';

// Run real classroom, scheduling, attendance and access handlers against an
// isolated database. Nothing in this regression contacts a hosted service.
globalThis.fetch=async()=>{throw Error('Hosted requests are forbidden');};
const sqlite=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
function statement(sql,values=[]){const execute=arrays=>{const query=sqlite.prepare(sql);if(arrays)query.setReturnArrays(true);return query.columns().length?{results:query.all(...values),meta:{changes:0}}:{results:[],meta:query.run(...values)};};return{bind:(...args)=>statement(sql,args),all:async()=>execute(false),raw:async()=>execute(true).results,first:async()=>execute(false).results[0]||null,run:async()=>execute(false),execute:()=>execute(false)};}
let beforeBatch=null,failBatchAt=-1;
const d1={prepare:statement,batch:async statements=>{const hook=beforeBatch,fail=failBatchAt;beforeBatch=null;failBatchAt=-1;hook?.();sqlite.exec('BEGIN');try{const result=statements.map((query,index)=>{if(index===fail)throw Error('injected batch failure');return query.execute();});sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
let actor;
globalThis.__classroomSessions={env:{DB:d1},currentBusinessAccount:async()=>actor,currentAccount:async()=>actor,NextResponse:{json:(value,options)=>Response.json(value,options)},getDb:null};
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-classroom-sessions-')),runtimePath=path.join(temporary,'runtime.mjs'),cache=new Map();
process.once('exit',()=>{const resolved=path.resolve(temporary);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('tickminder-classroom-sessions-'))fs.rmSync(resolved,{recursive:true,force:true});});
fs.writeFileSync(runtimePath,'export const {env,currentBusinessAccount,currentAccount,NextResponse}=globalThis.__classroomSessions;export const getDb=(...args)=>globalThis.__classroomSessions.getDb(...args);');
const stub=pathToFileURL(runtimePath).href;
function compile(file){if(cache.has(file))return cache.get(file);const target=path.join(temporary,file.replace(/\.ts$/,'.mjs')),url=pathToFileURL(target).href;cache.set(file,url);let source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');for(const [,spec]of [...source.matchAll(/from ["']([^"']+)["']/g)]){const replacement=['cloudflare:workers','next/server','@/db','@/lib/auth','./auth'].includes(spec)?stub:spec.startsWith('@/')?compile(spec.slice(2)+'.ts'):spec.startsWith('.')?compile(path.posix.normalize(path.posix.join(path.posix.dirname(file),spec))+(spec.endsWith('.ts')?'':'.ts')):import.meta.resolve(spec);source=source.replaceAll('"'+spec+'"','"'+replacement+'"').replaceAll("'"+spec+"'","'"+replacement+"'");}fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);return url;}
const schema=await import(compile('db/schema.ts'));globalThis.__classroomSessions.getDb=()=>drizzle(d1,{schema});
const action=await import(compile('app/api/action/route.ts')),route=await import(compile('app/api/class-sessions/route.ts')),sessions=await import(compile('lib/class-sessions.ts')),attendance=await import(compile('lib/session-attendance.ts')),helpers=await import(compile('lib/student-classrooms.ts'));
const group='next-genn-edu',now=new Date().toISOString(),op=()=>crypto.randomUUID();
sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run('session-foreign','Foreign fixture','session-foreign',now,now);
function account(id,role,name,groupId=group){sqlite.prepare('INSERT INTO accounts(id,group_id,email,name,role,teacher_name,student_name,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,groupId,id+'@example.test',name,role,role==='teacher'?name:null,role==='student'?name:null,now);if(role==='teacher')sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(groupId,name,now);if(role==='student')sqlite.prepare("INSERT INTO students(group_id,name,name_key,syllabus_id,grade,created_at) VALUES(?,?,?,'spm','Form 3',?)").run(groupId,name,name.toLowerCase(),now);return{id,groupId,email:id+'@example.test',name,role,teacherName:role==='teacher'?name:null,studentName:role==='student'?name:null};}
const admin=account('sessions-admin','admin','Fixture Admin'),teacher=account('sessions-teacher','teacher','Fixture Teacher'),otherTeacher=account('sessions-teacher-two','teacher','Other Teacher'),student=account('sessions-student','student','Fixture Student'),peer=account('sessions-peer','student','Peer Student'),foreign=account('sessions-foreign','admin','Foreign Admin','session-foreign');
let checks=0;
const check=(value,message)=>{assert(value,message);checks++;};
async function post(body,as=admin,status=200){actor=as;const response=await action.POST(new Request('https://fixture.test/api/action',{method:'POST',headers:{origin:'https://fixture.test','content-type':'application/json'},body:JSON.stringify(body)}));const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));checks++;return value;}
async function getClass(id,as=student,status=200){actor=as;const response=await route.GET(new Request('https://fixture.test/api/class-sessions?classroomId='+encodeURIComponent(id)));const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));checks++;return value;}
const counts=()=>Object.fromEntries(['lessons','class_sessions','class_session_participants','audit'].map(table=>[table,sqlite.prepare('SELECT count(*) AS n FROM '+table).get().n]));
const lesson=id=>({...sqlite.prepare('SELECT * FROM lessons WHERE id=?').get(id)});
const session=id=>({...sqlite.prepare('SELECT * FROM class_sessions WHERE id=?').get(id)});
for(const learner of [student,peer])await post({action:'savePlan',student:learner.name,subjectId:'science',teacherName:teacher.name,duration:1.5});
// The fictional roster and subject enrolment predate these historical lessons.
for(const table of ['students','plans','billing_students','billing_subjects'])sqlite.prepare("UPDATE "+table+" SET created_at='2019-01-01T00:00:00.000Z' WHERE group_id=?").run(group);
const classId=(await helpers.readPlanClassroom(group,student.name+'|Science')).id;
await post({action:'create',student:student.name,subject:'Science',teacherName:teacher.name,classroomId:classId,start:'2020-03-02T12:00',end:'2020-03-02T13:30'});
const one=sqlite.prepare("SELECT * FROM lessons WHERE planned_start='2020-03-02T04:00:00.000Z'").get();
const getSession=async id=>(await sessions.classSessionState(admin)).allSessions.find(s=>s.id===id);
const bodyFor=async(id,patch={})=>{const s=await getSession(id);return{action:'saveSessionAttendance',sessionId:id,revision:s.revision,operationId:op(),teachingStatus:'taught',actualStart:s.plannedStart.slice(0,10)+'T12:00',actualEnd:s.plannedEnd.slice(0,10)+'T13:30',participants:s.participants.map(p=>({lessonId:p.lessonId,status:'present',chargeable:true})),...patch};};
const oneBody=await bodyFor(one.session_id);
await assert.rejects(()=>attendance.attendanceAction(otherTeacher,oneBody),e=>e.status===404);checks++;
await assert.rejects(()=>attendance.attendanceAction(student,oneBody),e=>e.status===403);checks++;
await attendance.attendanceAction(teacher,oneBody);
check(Boolean(session(one.session_id).attendance_reviewed_at),'Teacher save confirms session');
check(session(one.session_id).attendance_reviewed_by===teacher.id,'Recording teacher is preserved as confirmer');
check(lesson(one.id).reviewed_at===session(one.session_id).attendance_reviewed_at&&lesson(one.id).reviewed_by===teacher.id,'Student lesson confirmation matches session atomically');
check(lesson(one.id).actual_start===one.planned_start&&lesson(one.id).actual_end===one.planned_end,'Normal attendance uses the full supplied scheduled period');
const savedCounts=counts();check((await attendance.attendanceAction(teacher,oneBody)).replayed,'Confirmation retry is idempotent');
check(JSON.stringify(savedCounts)===JSON.stringify(counts()),'Retry never adds duplicate history');
const initialSubmission=session(one.session_id).first_submission_at;await assert.rejects(async()=>attendance.attendanceAction(teacher,await bodyFor(one.session_id,{reason:'Teacher correction immediately after submission'})),e=>e.status===409);checks++;check(session(one.session_id).first_submission_at===initialSubmission,'Immediate teacher correction is rejected and first submission remains unchanged');
// Billing and invoice issuance consume the teacher confirmation directly.
sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run(admin.id,group);
const billing=await import(compile('lib/billing-server.ts')),invoices=await import(compile('lib/invoice-server.ts'));
const rate=await billing.billingRateSettings(admin,student.name+'|Science');
await billing.saveBilling(admin,{action:'saveRate',studentId:rate.context.studentId,subjectKey:rate.context.subjectKey,revision:0,mode:'hour',amount:'60.00',effectiveFrom:'2020-01-01',operationId:op()});
const preview=await billing.billingPreview(admin,'2020-03',1,20,rate.context.studentId);
const line=preview.detail.lines.find(l=>l.lessonId===one.id);
check(line?.amountCents===9000&&!line.warnings.includes('attendance_unreviewed'),'Teacher confirmation yields a ready RM90 line without administrator review: '+JSON.stringify(line));
const generated=await invoices.saveInvoice(admin,{action:'generate',studentId:rate.context.studentId,month:'2020-03',operationId:op()});
const detail=await invoices.invoiceDetail(admin,generated.invoiceId);
check(detail.review.blockers.length===0,'Teacher-confirmed source does not block invoice issuance');
await invoices.saveInvoice(admin,{action:'issue',invoiceId:generated.invoiceId,revision:detail.invoice.revision,expectedSourceHash:detail.invoice.sourceHash,operationId:op()});
check(sqlite.prepare('SELECT status FROM invoices WHERE id=?').get(generated.invoiceId).status==='issued','Invoice can issue without a second attendance confirmation');
await assert.rejects(async()=>attendance.attendanceAction(admin,await bodyFor(one.session_id)),e=>e.status===409&&/已正式开单/.test(e.message));checks++;
// Group save confirms every participant, including a valid late/absence record.
const gid='auto-confirm-group',start='2020-04-02T04:00:00.000Z',end='2020-04-02T05:30:00.000Z';
sqlite.prepare("INSERT INTO class_sessions(id,group_id,session_type,classroom_id,classroom_title,teacher_name,subject,planned_start,planned_end,status,created_by,created_at,updated_at) VALUES(?,?,'group',?,'Fixture Class',?,'Science',?,?,'scheduled',?,?,?)").run(gid,group,classId,teacher.name,start,end,admin.id,now,now);
for(const [name,id]of [[student.name,'auto-group-a'],[peer.name,'auto-group-b']])sqlite.prepare("INSERT INTO lessons(id,group_id,session_id,student,subject,teacher_name,planned_start,planned_end,created_by,updated_at) VALUES(?,?,?,?,'Science',?,?,?,?,?)").run(id,group,gid,name,teacher.name,start,end,admin.id,now);
const invalid=await bodyFor(gid,{participants:[{lessonId:'auto-group-a',status:'present'}]});
const beforeInvalid=JSON.stringify(session(gid));await assert.rejects(()=>attendance.attendanceAction(teacher,invalid),e=>e.status===409);checks++;check(JSON.stringify(session(gid))===beforeInvalid,'Incomplete class attendance cannot partially confirm');
await attendance.attendanceAction(teacher,await bodyFor(gid,{participants:[{lessonId:'auto-group-a',status:'early_leave',leftAt:'2020-04-02T13:00'},{lessonId:'auto-group-b',status:'absent'}]}));
check(Boolean(session(gid).attendance_reviewed_at),'Teacher confirms valid group attendance once');
check(lesson('auto-group-a').reviewed_by===teacher.id&&lesson('auto-group-b').reviewed_by===teacher.id,'All group students are confirmed under the actual teacher');
check(lesson('auto-group-a').actual_end==='2020-04-02T05:00:00.000Z'&&lesson('auto-group-b').chargeable===0,'Early departure and absent charge decisions are preserved');
await attendance.attendanceAction(admin,await bodyFor(gid,{reason:'Administrator corrected the group attendance'}));
check(session(gid).attendance_reviewed_by===admin.id&&lesson('auto-group-b').status==='completed','Administrator can correct confirmed, uninvoiced group attendance');
// Backfill complete old saves; skip incomplete and locked sources, preserve times.
sqlite.prepare("UPDATE class_sessions SET attendance_reviewed_at=NULL,attendance_reviewed_by=NULL WHERE id=?").run(gid);
sqlite.prepare("UPDATE lessons SET reviewed_at=NULL,reviewed_by=NULL,updated_at=(SELECT attendance_written_at FROM class_sessions WHERE id=?) WHERE session_id=?").run(gid,gid);
const legacy=session(gid),priorGroupTimes=sqlite.prepare('SELECT id,actual_start,actual_end,chargeable FROM lessons WHERE session_id=? ORDER BY id').all(gid);
await post({action:'create',student:student.name,subject:'Science',teacherName:teacher.name,classroomId:classId,start:'2020-05-02T12:00',end:'2020-05-02T13:30'});
const pending=sqlite.prepare("SELECT * FROM lessons WHERE planned_start='2020-05-02T04:00:00.000Z'").get(),pendingBefore=JSON.stringify(lesson(pending.id)),lockedBefore=JSON.stringify(lesson(one.id));
const migration=fs.readFileSync(new URL('../drizzle/0036_attendance_auto_confirm.sql',import.meta.url),'utf8');
sqlite.exec(migration);
check(session(gid).attendance_reviewed_at===legacy.attendance_recorded_at&&session(gid).attendance_reviewed_by===admin.id,'Backfill preserves original recorder and confirmation time');
check(sqlite.prepare('SELECT count(*) n FROM lessons WHERE session_id=? AND reviewed_at IS NOT NULL').get(gid).n===2,'Backfill confirms all complete participants');
check(JSON.stringify(priorGroupTimes)===JSON.stringify(sqlite.prepare('SELECT id,actual_start,actual_end,chargeable FROM lessons WHERE session_id=? ORDER BY id').all(gid)),'Backfill never changes durations or charge decisions');
check(JSON.stringify(lesson(pending.id))===pendingBefore,'Unrecorded scheduled lessons remain untouched');
check(JSON.stringify(lesson(one.id))===lockedBefore,'Issued invoice sources remain untouched');
const auditCount=sqlite.prepare("SELECT count(*) n FROM audit WHERE action='autoConfirmAttendance'").get().n;
check(auditCount===2,'Backfill records explicit confirmation history for each affected lesson');
sqlite.exec(migration);check(sqlite.prepare("SELECT count(*) n FROM audit WHERE action='autoConfirmAttendance'").get().n===auditCount,'Backfill is safe to rerun');
const groupFirst=session(gid).first_submission_at;
await attendance.attendanceAction(admin,{action:'adminResetSessionAttendance',sessionId:gid,revision:session(gid).revision,operationId:op(),reason:'Restore the whole fictional group after a mistaken taught save'});
check(session(gid).teaching_status==='pending'&&session(gid).actual_start===null&&session(gid).attendance_reviewed_at===null,'Group reset removes shared teaching and confirmation');
check(sqlite.prepare("SELECT count(*) n FROM lessons WHERE session_id=? AND status='scheduled' AND attendance_kind='pending' AND actual_start IS NULL AND actual_end IS NULL AND chargeable IS NULL AND reviewed_at IS NULL").get(gid).n===2,'Group reset restores every student lesson atomically');
check(sqlite.prepare("SELECT count(*) n FROM class_session_participants WHERE session_id=? AND attendance_status='pending' AND arrived_at IS NULL AND left_at IS NULL").get(gid).n===2,'Group reset removes every personal attendance');
check(session(gid).first_submission_at===groupFirst&&Boolean(session(gid).attendance_recorded_at),'Group reset preserves the original submission evidence');
await assert.rejects(async()=>attendance.attendanceAction(teacher,await bodyFor(gid)),e=>e.status===409);checks++;
const resetPreview=await billing.billingPreview(admin,'2020-04',1,20,rate.context.studentId);check(resetPreview.detail.lines.find(l=>l.lessonId==='auto-group-a')?.status==='pending','Unissued fee generation treats restored attendance as pending');
await attendance.attendanceAction(admin,await bodyFor(gid,{reason:'Administrator re-records the verified group attendance'}));check(session(gid).teaching_status==='taught'&&session(gid).first_submission_at===groupFirst,'Administrator may record the restored group again');
check(sqlite.prepare('PRAGMA foreign_key_check').all().length===0,'Attendance confirmation retains all foreign keys');
console.log(JSON.stringify({suite:'attendance-auto-confirm',passed:checks,productionWrites:false}));sqlite.close();

