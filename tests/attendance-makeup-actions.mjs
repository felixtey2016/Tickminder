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
function statement(sql,values=[]){const execute=arrays=>{const query=sqlite.prepare(sql);if(arrays)query.setReturnArrays(true);return query.columns().length?{results:query.all(...values),meta:{changes:0}}:{results:[],meta:query.run(...values)};};return{sql,bind:(...args)=>statement(sql,args),all:async()=>execute(false),raw:async()=>execute(true).results,first:async()=>execute(false).results[0]||null,run:async()=>execute(false),execute:()=>execute(false)};}
let beforeBatch=null,failBatchAt=-1,beforeMakeupWrite=null,failMakeupAt=-1;
const d1={prepare:statement,batch:async statements=>{const isMakeup=statements.some(s=>s.sql?.includes('FROM class_sessions source')),hook=isMakeup?beforeMakeupWrite:beforeBatch,fail=isMakeup?failMakeupAt:failBatchAt;if(isMakeup){beforeMakeupWrite=null;failMakeupAt=-1;}else{beforeBatch=null;failBatchAt=-1;}hook?.();sqlite.exec('BEGIN');try{const result=statements.map((query,index)=>{if(index===fail)throw Error('injected batch failure');return query.execute();});sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
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
for(const table of ['students','plans','billing_students','billing_subjects'])sqlite.prepare("UPDATE "+table+" SET created_at='2019-01-01T00:00:00.000Z' WHERE group_id=?").run(group);
const classId='makeup-fixture-class';
sqlite.prepare("INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_by,created_at,updated_at,syllabus_id,subject_id,grade) VALUES(?,?,'Fixture Class','Science',?,?,?,?, 'spm','science','Form 3')").run(classId,group,teacher.name,admin.id,now,now);
for(const learner of [student,peer])sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(op(),group,classId,learner.name,now);
const query=await import(compile('lib/course-query.ts'));
const readSession=async id=>(await sessions.classSessionState(admin,{sessionId:id,permissionKey:'attendance.view'})).allSessions[0];
const queue=async(month='2030-10')=>query.courseList(admin,new URLSearchParams({view:'sessions',mode:'makeup',month,includeOptions:'0'}));
async function one(day){await post({action:'create',student:student.name,subject:'Science',teacherName:teacher.name,classroomId:classId,start:day+'T12:00',end:day+'T13:30'});return sqlite.prepare('SELECT * FROM lessons WHERE planned_start=? AND student=?').get(day+'T04:00:00.000Z',student.name);}
async function mark(id,teaching='not_taught',patch={}){const s=await readSession(id);return attendance.attendanceAction(admin,{action:'saveSessionAttendance',sessionId:id,revision:s.revision,operationId:op(),teachingStatus:teaching,actualStart:s.plannedStart.slice(0,10)+'T12:00',actualEnd:s.plannedEnd.slice(0,10)+'T13:30',participants:s.participants.map((p,i)=>({lessonId:p.lessonId,status:teaching==='taught'&&i===0?'present':'absent',chargeable:teaching==='taught'&&i===0})),...patch});}
async function makeupBody(id,day='2035-09-01'){const s=(await queue()).items.find(s=>s.id===id);return{action:'scheduleMakeupSession',sessionId:id,revision:s.revision,lessonIds:s.participants.map(p=>p.lessonId),start:day+'T12:00',end:day+'T13:30',operationId:op()};}
async function groupLesson(id,day){sqlite.prepare("INSERT INTO class_sessions(id,group_id,session_type,classroom_id,classroom_title,teacher_name,subject,planned_start,planned_end,created_by,created_at,updated_at) VALUES(?,?,'group',?,'Fixture Class',?,'Science',?,?,?,?,?)").run(id,group,classId,teacher.name,day+'T04:00:00.000Z',day+'T05:30:00.000Z',admin.id,now,now);for(const name of [student.name,peer.name])sqlite.prepare("INSERT INTO lessons(id,group_id,session_id,student,subject,teacher_name,planned_start,planned_end,created_by,updated_at) VALUES(?,?,?,?,'Science',?,?,?,?,?)").run(op(),group,id,name,teacher.name,day+'T04:00:00.000Z',day+'T05:30:00.000Z',admin.id,now);}

// Backfill keeps actual attendance, rather than pretending a missed check-in is absence.
const taught=await one('2020-01-02');await mark(taught.session_id,'taught');
check(lesson(taught.id).status==='completed'&&Boolean(lesson(taught.id).reviewed_at),'Backfill confirms real attendance');
check(!(await queue()).items.some(s=>s.id===taught.session_id),'Backfilled lesson is not pending makeup');
const original=await one('2020-01-03');await mark(original.session_id);
check(lesson(original.id).status==='student_absent'&&lesson(original.id).chargeable===0,'Not held records an unpaid absence');
check(session(original.session_id).actual_start===null&&session(original.session_id).actual_end===null,'No fabricated actual teaching time');
check((await queue('2040-01')).items.some(s=>s.id===original.session_id),'Undecided date remains available across months');
const beforeSource=lesson(original.id),body=await makeupBody(original.session_id),made=await sessions.classSessionAction(admin,body);
const replacement=sqlite.prepare('SELECT * FROM lessons WHERE replacement_for=?').get(original.id);
check(replacement.kind==='makeup'&&replacement.session_id===made.sessionId,'New session links to original student lesson');
check(session(made.sessionId).session_type==='one_to_one','Individual makeup keeps individual session type');
check(JSON.stringify(beforeSource)===JSON.stringify(lesson(original.id)),'Scheduling preserves original attendance and charge decision');
check(!(await queue()).items.some(s=>s.id===original.session_id),'Scheduled original leaves pending queue');
const beforeRetry=JSON.stringify(counts());check((await sessions.classSessionAction(admin,body)).replayed,'Same operation retries safely');
check(beforeRetry===JSON.stringify(counts()),'Retry creates no duplicate session, lessons or audit');
await assert.rejects(()=>sessions.classSessionAction(admin,{...body,operationId:op()}),e=>e.status===409);checks++;
await assert.rejects(()=>sessions.classSessionAction(admin,{...body,start:'2035-09-02T12:00'}),e=>e.status===409);checks++;

// A partial class absence schedules only the missing learner, retaining one teaching session.
await groupLesson('makeup-partial','2020-02-03');await mark('makeup-partial','taught');
const pending=(await queue()).items.find(s=>s.id==='makeup-partial');
check(pending.participantCount===2&&pending.participants.length===1&&pending.participants[0].studentName===peer.name,'Queue includes only students still needing makeup');
const partialBody=await makeupBody('makeup-partial','2035-10-03'),partial=await sessions.classSessionAction(admin,partialBody);
check(session(partial.sessionId).session_type==='group','Makeup preserves the source group session type');
check(sqlite.prepare('SELECT count(*) n FROM lessons WHERE session_id=?').get(partial.sessionId).n===1,'Present classmates are not duplicated into makeup');
check(session('makeup-partial').teaching_status==='taught','Original class teaching facts are unchanged');
await assert.rejects(()=>sessions.classSessionAction(admin,{action:'cancelClassSession',sessionId:'makeup-partial',revision:session('makeup-partial').revision,operationId:op()}),e=>e.status===409);checks++;

await groupLesson('makeup-full','2020-03-03');await mark('makeup-full','teacher_absent');
const full=await sessions.classSessionAction(admin,await makeupBody('makeup-full','2021-11-03'));
check(sqlite.prepare('SELECT count(*) n FROM class_session_participants WHERE session_id=?').get(full.sessionId).n===2,'Whole-class makeup retains both students in one session');
await mark(full.sessionId,'taught');
check(session(full.sessionId).actual_start==='2021-11-03T04:00:00.000Z','Actual group teaching is recorded once');

// Cancellation closes the original and preserves history; it never merely hides a queue row.
await groupLesson('makeup-cancel','2020-04-03');await mark('makeup-cancel');
const cancelCount=sqlite.prepare('SELECT count(*) n FROM audit WHERE lesson_id IN(SELECT id FROM lessons WHERE session_id=?)').get('makeup-cancel').n;
await sessions.classSessionAction(admin,{action:'cancelClassSession',sessionId:'makeup-cancel',revision:session('makeup-cancel').revision,scope:'single',operationId:op()});
check(session('makeup-cancel').status==='cancelled','Untaught original group is cancelled');
check(sqlite.prepare("SELECT count(*) n FROM lessons WHERE session_id=? AND status='cancelled' AND chargeable IS NULL AND reviewed_at IS NULL").get('makeup-cancel').n===2,'Original group cancellation uses ordinary cancellation charge handling');
check(sqlite.prepare('SELECT count(*) n FROM audit WHERE lesson_id IN(SELECT id FROM lessons WHERE session_id=?)').get('makeup-cancel').n>cancelCount,'Original attendance audit survives cancellation');
check(!(await queue()).items.some(s=>s.id==='makeup-cancel'),'Cancelled original leaves makeup queue');
const cancelledOne=await one('2020-05-03');await mark(cancelledOne.session_id);await post({action:'cancel',id:cancelledOne.id,scope:'single'});
check(lesson(cancelledOne.id).status==='cancelled','Individual original uses existing cancellation action');
await groupLesson('makeup-invoiced','2020-07-03');await mark('makeup-invoiced');
const billingId=sqlite.prepare('SELECT id FROM billing_students WHERE group_id=? AND student_name=?').get(group,student.name).id;
sqlite.prepare("INSERT INTO invoices(id,group_id,student_id,month,status,revision,number,issued_at,created_at,updated_at,created_by,due_date,currency,source_hash,source_basis_json,adjustment_basis_json,document_json,total_cents) VALUES('makeup-locked-invoice',?,?,'2020-07','issued',1,'INV-MAKEUP',?,?,?,?,'2020-08-01','MYR','fixture','{}','[]','{}',0)").run(group,billingId,now,now,now,admin.id);
sqlite.prepare("INSERT INTO invoice_source_locks(group_id,invoice_id,source_type,source_id,student_id,month,created_at) VALUES(?,'makeup-locked-invoice','session','makeup-invoiced',?,'2020-07',?)").run(group,billingId,now);
const lockedBefore=JSON.stringify(session('makeup-invoiced'));
await assert.rejects(()=>sessions.classSessionAction(admin,{action:'cancelClassSession',sessionId:'makeup-invoiced',revision:session('makeup-invoiced').revision,scope:'single',operationId:op()}),/invoice_source_locked/);checks++;
check(lockedBefore===JSON.stringify(session('makeup-invoiced')),'Invoiced original cancellation remains protected and rolls back');

// Scope, optimistic versions, conflict detection, and rollback protect real data.
const race=await one('2020-06-03');await mark(race.session_id);const raceBody=await makeupBody(race.session_id,'2036-01-03');
await assert.rejects(()=>sessions.classSessionAction(otherTeacher,raceBody),e=>e.status===404);checks++;
await assert.rejects(()=>sessions.classSessionAction(foreign,raceBody),e=>e.status===404);checks++;
await assert.rejects(()=>sessions.classSessionAction(student,raceBody),e=>e.status===403);checks++;
await assert.rejects(()=>sessions.classSessionAction(admin,{...raceBody,revision:raceBody.revision-1}),e=>e.status===409);checks++;
await assert.rejects(()=>sessions.classSessionAction(admin,{...raceBody,lessonIds:[taught.id]}),e=>e.status===409);checks++;
await assert.rejects(()=>sessions.classSessionAction(admin,{...raceBody,lessonIds:[race.id,race.id]}),e=>e.status===400);checks++;
const noDateSource=JSON.stringify(lesson(race.id));
await assert.rejects(()=>sessions.classSessionAction(admin,{...raceBody,start:'',end:''}),e=>e.status===400);checks++;
check(noDateSource===JSON.stringify(lesson(race.id)),'Not choosing a date never consumes the original');
const beforeFailure=JSON.stringify(counts());failMakeupAt=1;
await assert.rejects(()=>sessions.classSessionAction(admin,raceBody),/injected batch failure/);checks++;
check(beforeFailure===JSON.stringify(counts()),'An insert failure rolls back the session, lessons and audit');
beforeMakeupWrite=()=>sqlite.prepare('UPDATE plans SET active=0 WHERE group_id=? AND student=?').run(group,student.name);
await assert.rejects(()=>sessions.classSessionAction(admin,raceBody),e=>e.status===409);checks++;
check(beforeFailure===JSON.stringify(counts()),'Enrolment revocation at commit creates no orphaned makeup');
sqlite.prepare('UPDATE plans SET active=1 WHERE group_id=? AND student=?').run(group,student.name);
const winnerId='race-winner';beforeMakeupWrite=()=>sqlite.prepare("INSERT INTO lessons(group_id,id,student,subject,teacher_name,planned_start,planned_end,kind,replacement_for,created_by,updated_at) VALUES(?,?,?,'Science',?,?,?,'makeup',?,?,?)").run(group,winnerId,student.name,teacher.name,'2036-02-03T04:00:00.000Z','2036-02-03T05:30:00.000Z',race.id,admin.id,now);
await assert.rejects(()=>sessions.classSessionAction(admin,raceBody),e=>e.status===409);checks++;
check(sqlite.prepare("SELECT count(*) n FROM lessons WHERE replacement_for=? AND status<>'cancelled'").get(race.id).n===1,'Competing legacy makeup cannot be duplicated at commit');
await post({action:'create',student:student.name,subject:'Science',teacherName:teacher.name,classroomId:classId,kind:'makeup',replacementFor:race.id,start:'2036-03-03T12:00',end:'2036-03-03T13:30'},admin,400);
check(sqlite.prepare('PRAGMA foreign_key_check').all().length===0,'All references remain valid');
check(sqlite.prepare('PRAGMA integrity_check').get().integrity_check==='ok','Database integrity remains valid');
console.log(JSON.stringify({suite:'attendance-makeup-actions',passed:checks,scope:'Isolated real handlers and SQL; no hosted requests or production mutations.'},null,2));sqlite.close();
