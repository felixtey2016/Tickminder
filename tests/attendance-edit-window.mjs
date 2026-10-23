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
let beforeBatch=null,failBatchAt=-1;
const d1={prepare:statement,batch:async statements=>{const hook=beforeBatch;beforeBatch=null;hook?.(statements);const fail=failBatchAt;failBatchAt=-1;sqlite.exec('BEGIN');try{const result=statements.map((query,index)=>{if(index===fail)throw Error('injected batch failure');return query.execute();});sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
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

const RealDate=globalThis.Date;let clock=RealDate.now();class ControlledDate extends RealDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}globalThis.Date=ControlledDate;
const firstClock=clock,sid=one.session_id;
const fresh=(patch={})=>bodyFor(sid,{reason:'Corrected fictional attendance',...patch});
await attendance.attendanceAction(teacher,await bodyFor(sid,{firstSubmissionAt:'2099-01-01T00:00:00.000Z'}));
const first=session(sid).first_submission_at;
check(first===new Date(firstClock).toISOString(),'First timestamp comes from the server clock, ignoring supplied time');
check(session(sid).first_submission_by===teacher.id&&session(sid).attendance_reviewed_by===teacher.id,'First actor and automatic confirmation are persisted');
const initialCounts=counts();
await assert.rejects(async()=>attendance.attendanceAction(teacher,await bodyFor(sid)),e=>e.status===400);checks++;
check(JSON.stringify(initialCounts)===JSON.stringify(counts()),'A correction without a reason writes nothing');
clock=firstClock+23*3600000;
const correction=await fresh();await attendance.attendanceAction(teacher,correction);
check(session(sid).first_submission_at===first,'23-hour correction never resets the first timestamp');
const event=sqlite.prepare("SELECT before_json,after_json FROM audit WHERE id LIKE 'attendance:%' AND action='saveSessionAttendance' ORDER BY rowid DESC LIMIT 1").get(),after=JSON.parse(event.after_json);
check(after.reason==='Corrected fictional attendance'&&after.firstSubmissionAt===first&&after.deadline===new Date(firstClock+24*3600000).toISOString(),'Correction history retains reason, original clock and deadline');
await post({action:'attendance',id:one.id,sessionRevision:session(sid).revision,operationId:op(),status:'completed',actualStart:'2020-03-02T12:00',actualEnd:'2020-03-02T13:30',reason:'Legacy route correction within window'},teacher);check(session(sid).first_submission_at===first,'Legacy attendance entry uses the same immutable clock');
clock=firstClock+24*3600000-1;await attendance.attendanceAction(teacher,await fresh());
check(session(sid).first_submission_at===first,'One millisecond before deadline is accepted without extension');
clock=firstClock+24*3600000;
await assert.rejects(async()=>attendance.attendanceAction(teacher,await fresh()),e=>e.status===409&&/24/.test(e.message));checks++;
await post({action:'attendance',id:one.id,sessionRevision:session(sid).revision,operationId:op(),status:'completed',actualStart:'2020-03-02T12:00',actualEnd:'2020-03-02T13:30',reason:'Legacy bypass attempt'},teacher,409);
const beforeReplay=counts();check((await attendance.attendanceAction(teacher,correction)).replayed,'A retry after expiry returns the previously accepted result');check(JSON.stringify(beforeReplay)===JSON.stringify(counts()),'Retry after expiry never duplicates history');
await attendance.attendanceAction(admin,await fresh({reason:'Administrator handles expired attendance'}));
check(session(sid).first_submission_at===first&&session(sid).attendance_reviewed_by===admin.id,'Expired attendance can be corrected and freshly confirmed by an administrator with a reason');
// Explicit locks require review permission, and unlocking cannot revive the clock.
sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run(admin.id,group);
const editOnly=account('window-edit-only','admin','Edit Only'),reviewer=account('window-reviewer','admin','Reviewer');
for(const[a,keys]of[[editOnly,['lessons.view','attendance.view','attendance.edit']],[reviewer,['lessons.view','attendance.view','attendance.review']]])sqlite.prepare("INSERT INTO admin_permission_profiles(group_id,account_id,revision,grants_json,origin,updated_at) VALUES(?,?,1,?,'new',?)").run(group,a.id,JSON.stringify(keys),new Date().toISOString());
globalThis.__classroomSessions.env.ADMIN_PERMISSIONS_MODE='enforced';
const lockBody=()=>({action:'lockSessionAttendance',sessionId:sid,revision:session(sid).revision,operationId:op(),reason:'School record checked and explicitly locked'});
await assert.rejects(()=>attendance.attendanceAction(editOnly,lockBody()),e=>e.status===403);checks++;
await assert.rejects(()=>attendance.attendanceAction(teacher,lockBody()),e=>e.status===403);checks++;
await attendance.attendanceAction(reviewer,lockBody());
check(Boolean(session(sid).explicit_locked_at)&&session(sid).explicit_locked_by===reviewer.id,'Review-only administrator may explicitly lock attendance');
await assert.rejects(async()=>attendance.attendanceAction(editOnly,await fresh()),e=>e.status===409&&/锁定/.test(e.message));checks++;
await assert.rejects(()=>attendance.attendanceAction(reviewer,{action:'unlockSessionAttendance',sessionId:sid,revision:session(sid).revision,operationId:op()}),e=>e.status===400);checks++;
await attendance.attendanceAction(reviewer,{action:'unlockSessionAttendance',sessionId:sid,revision:session(sid).revision,operationId:op(),reason:'Release explicit lock while retaining fixed deadline'});
check(session(sid).explicit_locked_at===null&&session(sid).first_submission_at===first,'Unlock clears explicit lock without moving the first clock');
await assert.rejects(async()=>attendance.attendanceAction(teacher,await fresh()),e=>e.status===409);checks++;
// Review permission alone cannot change a charge decision.
await assert.rejects(async()=>attendance.attendanceAction(reviewer,await fresh({action:'reviewSessionAttendance',participants:[{lessonId:one.id,status:'present',chargeable:false}]})),e=>e.status===403);checks++;
clock=firstClock+3600000;
const stale=await fresh();await attendance.attendanceAction(teacher,await fresh());await assert.rejects(()=>attendance.attendanceAction(teacher,stale),e=>e.status===409);checks++;
function onWrite(effect){const hook=statements=>{if(statements.some(s=>/UPDATE class_sessions SET first_submission_at/.test(s.sql)))effect();else beforeBatch=hook;};beforeBatch=hook;}
const raceBefore=lesson(one.id),auditBefore=sqlite.prepare('SELECT count(*) n FROM audit').get().n;
onWrite(()=>sqlite.prepare("UPDATE class_sessions SET explicit_locked_at=?,explicit_locked_by=?,explicit_lock_reason='Concurrent administrator lock' WHERE id=?").run(new Date().toISOString(),admin.id,sid));
await assert.rejects(async()=>attendance.attendanceAction(teacher,await fresh()),e=>e.status===409);checks++;
check(JSON.stringify(raceBefore)===JSON.stringify(lesson(one.id))&&sqlite.prepare('SELECT count(*) n FROM audit').get().n===auditBefore,'A lock inside the write boundary prevents every participant and audit write');
await attendance.attendanceAction(reviewer,{action:'unlockSessionAttendance',sessionId:sid,revision:session(sid).revision,operationId:op(),reason:'Fixture unlock'});
const rollback=JSON.stringify(session(sid)),lessonRollback=JSON.stringify(lesson(one.id));const badBatch=await fresh();const failHook=statements=>{if(statements.some(s=>/UPDATE class_sessions SET first_submission_at/.test(s.sql)))throw Error('fixture injected write rejection');else beforeBatch=failHook;};beforeBatch=failHook;
await assert.rejects(()=>attendance.attendanceAction(teacher,badBatch),/fixture injected/);checks++;
check(JSON.stringify(session(sid))===rollback&&JSON.stringify(lesson(one.id))===lessonRollback,'Injected failure preserves session and student facts');
onWrite(()=>{failBatchAt=3;});await assert.rejects(async()=>attendance.attendanceAction(teacher,await fresh()),/injected batch failure/);checks++;check(JSON.stringify(session(sid))===rollback&&JSON.stringify(lesson(one.id))===lessonRollback,'Failure after session/participant writes rolls back the entire batch');
assert.throws(()=>sqlite.prepare('UPDATE class_sessions SET first_submission_at=? WHERE id=?').run(new Date().toISOString(),sid),/attendance_first_submission_immutable/);checks++;

const {bindAccountSession}=await import(compile('lib/account-session.ts')),sessionHash='window-fixture-session-hash-123456789012345678901';
sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run(sessionHash,teacher.id,new RealDate(RealDate.now()+3600000).toISOString());bindAccountSession(teacher,sessionHash);
const logoutBefore=JSON.stringify(lesson(one.id));onWrite(()=>sqlite.prepare('DELETE FROM sessions WHERE token_hash=?').run(sessionHash));
await assert.rejects(async()=>attendance.attendanceAction(teacher,await fresh()),e=>e.status===409);checks++;check(JSON.stringify(lesson(one.id))===logoutBefore,'Teacher logout at write boundary prevents the correction atomically');
sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run(sessionHash,teacher.id,new RealDate(RealDate.now()+3600000).toISOString());
clock=RealDate.now();await post({action:'create',student:student.name,subject:'Science',teacherName:teacher.name,classroomId:classId,start:'2020-07-02T12:00',end:'2020-07-02T13:30'});const edgeLesson=sqlite.prepare("SELECT * FROM lessons WHERE planned_start='2020-07-02T04:00:00.000Z'").get(),edgeFirst=new RealDate(RealDate.now()-24*3600000+1500).toISOString();
sqlite.prepare("UPDATE class_sessions SET first_submission_at=?,first_submission_by=?,teaching_status='not_taught',attendance_recorded_at=?,attendance_recorded_by=? WHERE id=?").run(edgeFirst,teacher.id,edgeFirst,teacher.id,edgeLesson.session_id);sqlite.prepare("UPDATE class_session_participants SET attendance_status='absent' WHERE lesson_id=?").run(edgeLesson.id);
const queued=await bodyFor(edgeLesson.session_id,{reason:'Queued just before the real database deadline'}),queuedBefore=JSON.stringify(lesson(edgeLesson.id));
onWrite(()=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1700));await assert.rejects(()=>attendance.attendanceAction(teacher,queued),e=>e.status===409);checks++;check(JSON.stringify(lesson(edgeLesson.id))===queuedBefore,'Request queued past the real write-time deadline cannot use an earlier captured timestamp');

// Unknown historical submissions are never guessed from a latest write time.
const older=await post({action:'create',student:student.name,subject:'Science',teacherName:teacher.name,classroomId:classId,start:'2020-06-02T12:00',end:'2020-06-02T13:30'});const oldLesson=sqlite.prepare("SELECT * FROM lessons WHERE planned_start='2020-06-02T04:00:00.000Z'").get();
sqlite.prepare("UPDATE class_sessions SET teaching_status='not_taught',attendance_recorded_at=?,attendance_recorded_by=? WHERE id=?").run(new Date().toISOString(),teacher.id,oldLesson.session_id);sqlite.prepare("UPDATE class_session_participants SET attendance_status='absent' WHERE lesson_id=?").run(oldLesson.id);
await assert.rejects(async()=>attendance.attendanceAction(teacher,await bodyFor(oldLesson.session_id,{reason:'Unknown historical source'})),e=>e.status===409&&/旧考勤/.test(e.message));checks++;
// A separate pre-migration database proves backfill only accepts reliable audit transitions.
const legacyDb=new DatabaseSync(':memory:');for(const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>/^\d{4}_.*\.sql$/.test(n)&&Number(n.slice(0,4))<52).sort())legacyDb.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
legacyDb.prepare("INSERT INTO accounts(id,group_id,email,name,role,created_at) VALUES('history-teacher',?,'history@example.test','History Teacher','teacher',?)").run(group,now);
legacyDb.prepare("INSERT INTO teachers(group_id,name,created_at) VALUES(?,'History Teacher',?)").run(group,now);
let historyDay=0;for(const key of['reliable','unknown','ambiguous']){const name='History '+key;legacyDb.prepare('INSERT INTO students(group_id,name,name_key,created_at) VALUES(?,?,?,?)').run(group,name,name,now);legacyDb.prepare("INSERT INTO lessons(id,group_id,student,subject,teacher_name,planned_start,planned_end,status,created_by,updated_at) VALUES(?,?,?,'Science','History Teacher',?,?,'scheduled','history-teacher',?)").run('history-'+key,group,name,'2020-01-0'+(++historyDay)+'T04:00:00Z','2020-01-0'+historyDay+'T05:00:00Z',now);const sid=legacyDb.prepare('SELECT session_id FROM lessons WHERE id=?').get('history-'+key).session_id;legacyDb.prepare("UPDATE class_sessions SET teaching_status='not_taught',attendance_recorded_at=?,attendance_recorded_by='history-teacher' WHERE id=?").run(now,sid);if(key!=='unknown'){const before=JSON.stringify({teachingStatus:'pending',status:'pending'}),after=JSON.stringify({teachingStatus:'not_taught',status:'absent',sessionId:sid});legacyDb.prepare("INSERT INTO audit(id,group_id,lesson_id,actor_id,action,before_json,after_json,at) VALUES(?,?,?,'history-teacher','saveSessionAttendance',?,?,?)").run('history-event-'+key,group,'history-'+key,before,after,'2020-01-01T05:01:00.000Z');if(key==='ambiguous')legacyDb.prepare("INSERT INTO audit(id,group_id,lesson_id,actor_id,action,before_json,after_json,at) VALUES('history-conflicting',?,?,'unknown-other-actor','saveSessionAttendance',?,?,?)").run(group,'history-'+key,before,after,'2020-01-01T05:01:00.000Z');}}
legacyDb.exec(fs.readFileSync(new URL('../drizzle/0052_attendance_edit_window.sql',import.meta.url),'utf8'));
const history=key=>legacyDb.prepare('SELECT first_submission_at,first_submission_by FROM class_sessions WHERE id=(SELECT session_id FROM lessons WHERE id=?)').get('history-'+key);
check(history('reliable').first_submission_at==='2020-01-01T05:01:00.000Z'&&history('reliable').first_submission_by==='history-teacher','Reliable initial audit yields the original first submission');
check(history('unknown').first_submission_at===null&&history('ambiguous').first_submission_at===null,'Unknown and conflicting history remain NULL despite recorded_at timestamps');legacyDb.close();
globalThis.Date=RealDate;check(sqlite.prepare('PRAGMA foreign_key_check').all().length===0,'Window and lock writes preserve foreign keys');
console.log(JSON.stringify({suite:'attendance-edit-window',passed:checks,productionWrites:false}));sqlite.close();

