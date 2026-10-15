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
for(const learner of [student,peer])await post({action:'savePlan',student:learner.name,subjectId:'science',teacherName:teacher.name,duration:1});
const planKey=student.name+'|Science',ownClass=await helpers.readPlanClassroom(group,planKey),peerClass=await helpers.readPlanClassroom(group,peer.name+'|Science');
check(ownClass&&peerClass&&ownClass.id!==peerClass.id,'Each student-subject-teacher pairing receives its own classroom');
const options=await sessions.classScheduleOptions(admin),option=options.find(item=>item.id===ownClass.id);
check(option.planKeys.includes(planKey)&&option.subjectId==='science'&&option.syllabusId==='spm','Schedule options publish exact eligible plan keys and canonical classification');
await post({action:'create',student:student.name,subject:'Science',teacherName:teacher.name,start:'2035-03-01T12:00',end:'2035-03-01T13:00',until:'2035-03-08'},teacher);
const originalLessons=sqlite.prepare('SELECT * FROM lessons ORDER BY planned_start').all(),originalIds=originalLessons.map(item=>item.id);
check(originalLessons.length===2,'Weekly one-to-one creation creates exactly one lesson per occurrence');
for(const row of originalLessons){const linked=session(row.session_id);check(linked.session_type==='one_to_one'&&linked.classroom_id===ownClass.id,'Legacy lesson remains one-to-one while linked to its classroom');check(sqlite.prepare('SELECT lesson_id FROM class_session_participants WHERE session_id=?').get(row.session_id).lesson_id===row.id,'Original lesson is the sole immutable participant record');}
const projected=await sessions.classSessionState(student);
check(projected.sessions.length===0&&projected.classroomSessions.length===2,'Group-only board remains separate from classroom-linked one-to-one projection');
check((await getClass(ownClass.id)).sessions.length===2,'Student can read own linked classroom timetable');
check((await getClass(ownClass.id,teacher)).sessions.every(item=>item.participants.every(p=>p.studentName===student.name)),'Owning teacher sees the correct participant snapshot');
await getClass(ownClass.id,peer,404);await getClass(ownClass.id,foreign,404);await getClass(ownClass.id,otherTeacher,404);await getClass(ownClass.id,null,401);
await post({action:'editClassSession',sessionId:originalLessons[0].session_id,revision:1,start:'2035-03-02T12:00',end:'2035-03-02T13:00',operationId:op()},admin,404);
await post({action:'proposeReschedule',id:originalLessons[0].id,start:'2035-03-02T12:00',end:'2035-03-02T13:00',note:'Fictional request'},student);
const proposal=sqlite.prepare("SELECT id FROM reschedule_requests WHERE lesson_id=? AND status='pending'").get(originalLessons[0].id);
await post({action:'respondReschedule',id:originalLessons[0].id,requestId:proposal.id,decision:'accept'},teacher);
check(lesson(originalLessons[0].id).planned_start==='2035-03-02T04:00:00.000Z','Linked one-to-one lesson retains bilateral teacher/student rescheduling');
check(session(originalLessons[0].session_id).classroom_id===ownClass.id,'Reschedule preserves classroom association');
check(sqlite.prepare('SELECT count(*) AS n FROM lessons').get().n===2,'Reschedule never duplicates lesson rows');
await post({action:'create',student:student.name,subject:'Science',teacherName:teacher.name,classroomId:ownClass.id,start:'2020-03-01T12:00',end:'2020-03-01T13:00'},admin);
const historical=sqlite.prepare("SELECT * FROM lessons WHERE planned_start<'2021'").get(),attendSession=(await sessions.classSessionState(admin)).allSessions.find(item=>item.id===historical.session_id);
await attendance.attendanceAction(admin,{action:'saveSessionAttendance',sessionId:attendSession.id,revision:attendSession.revision,operationId:op(),teachingStatus:'taught',actualStart:'2020-03-01T12:00',actualEnd:'2020-03-01T13:00',participants:[{lessonId:historical.id,status:'present',chargeable:true}]});
const historicalBefore=lesson(historical.id),attendanceBefore=session(historical.session_id),historicalParticipant={...sqlite.prepare('SELECT * FROM class_session_participants WHERE lesson_id=?').get(historical.id)};
await post({action:'savePlan',editingKey:planKey,student:student.name,subjectId:'science',teacherName:otherTeacher.name,duration:1});
const reassignedClass=await helpers.readPlanClassroom(group,planKey);
check(reassignedClass&&reassignedClass.id!==ownClass.id,'Teacher reassignment establishes the new student-subject-teacher classroom');
for(const id of originalIds){const row=lesson(id),linked=session(row.session_id);check(row.teacher_name===otherTeacher.name&&linked.classroom_id===reassignedClass.id&&linked.session_type==='one_to_one','Only scheduled one-to-one sessions follow teacher reassignment');}
check(JSON.stringify(lesson(historical.id))===JSON.stringify(historicalBefore),'Teacher reassignment preserves every historical lesson/attendance/chargeable field');
check(JSON.stringify(session(historical.session_id))===JSON.stringify(attendanceBefore),'Teacher reassignment preserves historical teaching session fields and old classroom link');
check(JSON.stringify({...sqlite.prepare('SELECT * FROM class_session_participants WHERE lesson_id=?').get(historical.id)})===JSON.stringify(historicalParticipant),'Teacher reassignment preserves the original attendance participant snapshot');
const beforeWrong=counts();await post({action:'create',student:student.name,subject:'Science',teacherName:otherTeacher.name,classroomId:peerClass.id,start:'2035-04-01T12:00',end:'2035-04-01T13:00'},admin,409);check(JSON.stringify(counts())===JSON.stringify(beforeWrong),'Another student classroom cannot receive this lesson');
const body={action:'create',student:student.name,subject:'Science',teacherName:otherTeacher.name,classroomId:reassignedClass.id,start:'2035-04-01T12:00',end:'2035-04-01T13:00'};
const beforeRace=counts();beforeBatch=()=>sqlite.prepare('UPDATE classrooms SET archived=1 WHERE id=?').run(reassignedClass.id);await post(body,admin,409);check(JSON.stringify(counts())===JSON.stringify(beforeRace),'Class archived during creation yields no orphan lesson, session, participant or audit');sqlite.prepare('UPDATE classrooms SET archived=0 WHERE id=?').run(reassignedClass.id);
const beforeFail=counts();failBatchAt=1;await post(body,admin,503);check(JSON.stringify(counts())===JSON.stringify(beforeFail),'Failed linking rolls back the inserted lesson and trigger-created session/participant');
await post(body,admin);const created=sqlite.prepare("SELECT * FROM lessons WHERE planned_start='2035-04-01T04:00:00.000Z'").get();check(session(created.session_id).classroom_id===reassignedClass.id,'Explicit valid class creation succeeds atomically');
await post({action:'setStudentActive',name:student.name,active:false});await post({...body,start:'2035-04-02T12:00',end:'2035-04-02T13:00'},admin,400);await post({action:'setStudentActive',name:student.name,active:true});check((await helpers.readPlanClassroom(group,planKey)).id===reassignedClass.id,'Restoring a student reuses the corresponding active classroom');
check(sqlite.prepare('PRAGMA foreign_key_check').all().length===0,'All original lesson and participant foreign keys remain valid');check(sqlite.prepare('PRAGMA integrity_check').get().integrity_check==='ok','SQLite integrity remains valid');
console.log(JSON.stringify({suite:'student-classroom-sessions',passed:checks,scope:'Real isolated handlers/native SQL; class linkage, legacy rescheduling, historical attendance preservation, guards and rollback. No production writes.'},null,2));sqlite.close();
