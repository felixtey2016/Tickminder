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
const stateRoute=await import(compile('app/api/state/route.ts')),historyRoute=await import(compile('app/api/lesson-history/route.ts')),sessionRoute=await import(compile('app/api/class-sessions/route.ts'));
const actionRoute=await import(compile('app/api/action/route.ts')),sessionServer=await import(compile('lib/class-sessions.ts')),attendance=await import(compile('lib/session-attendance.ts'));
const learningRoute=await import(compile('app/api/learning/versions/route.ts')),reviewRoute=await import(compile('app/api/learning/review/route.ts'));
const projections=await import(compile('lib/student-course-response.ts'));
let checks=0;
function check(value,message){assert(value,message);checks++;}
const now=new Date().toISOString(),group='next-genn-edu',op=()=>crypto.randomUUID();
sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run('projection-foreign','Synthetic Other Group','projection-foreign',now,now);
function account(id,role,name,groupId=group){
  sqlite.prepare('INSERT INTO accounts(id,group_id,email,name,role,teacher_name,student_name,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,groupId,id+'@example.test',name,role,role==='teacher'?name:null,role==='student'?name:null,now);
  if(role==='teacher')sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(groupId,name,now);
  if(role==='student')sqlite.prepare("INSERT INTO students(group_id,name,name_key,syllabus_id,grade,created_at) VALUES(?,?,?,'spm','Form 3',?)").run(groupId,name,name.toLowerCase(),now);
  return {id,groupId,email:id+'@example.test',name,role,teacherName:role==='teacher'?name:null,studentName:role==='student'?name:null};
}
const admin=account('projection-admin','admin','Synthetic Admin'),teacher=account('projection-teacher','teacher','Synthetic Teacher'),student=account('projection-student','student','Synthetic Student'),peer=account('projection-peer','student','Synthetic Peer');
const foreignStudent=account('projection-foreign-student','student',student.name,'projection-foreign');
account('projection-foreign-teacher','teacher',teacher.name,'projection-foreign');
async function post(body,as=admin){actor=as;const response=await actionRoute.POST(new Request('https://fixture.test/api/action',{method:'POST',headers:{origin:'https://fixture.test','content-type':'application/json'},body:JSON.stringify(body)}));const data=await response.json();check(response.status===200,JSON.stringify(data));return data;}
async function get(route,url,as=student,status=200){actor=as;const response=await route.GET(new Request('https://fixture.test/api/'+url));const data=await response.json();check(response.status===status,JSON.stringify(data));return {data,response};}
await post({action:'savePlan',student:student.name,subjectId:'science',teacherName:teacher.name,duration:1,onlineLink:'https://example.test/student-link'});
await post({action:'savePlan',student:peer.name,subjectId:'science',teacherName:teacher.name,duration:1});
await post({action:'create',student:student.name,subject:'Science',teacherName:teacher.name,start:'2020-03-01T12:00',end:'2020-03-01T13:00'});
await post({action:'create',student:student.name,subject:'Science',teacherName:teacher.name,start:'2035-03-01T12:00',end:'2035-03-01T13:00'});
const historical=sqlite.prepare("SELECT * FROM lessons WHERE planned_start<'2021'").get(),upcoming=sqlite.prepare("SELECT * FROM lessons WHERE planned_start>'2030'").get();
const seed=(await sessionServer.classSessionState(admin)).allSessions.find(session=>session.id===historical.session_id);
await attendance.attendanceAction(admin,{action:'saveSessionAttendance',sessionId:seed.id,revision:seed.revision,operationId:op(),teachingStatus:'taught',actualStart:'2020-03-01T12:00',actualEnd:'2020-03-01T13:00',note:'INTERNAL_TEACHING_NOTE',participants:[{lessonId:historical.id,status:'present',note:'INTERNAL_ATTENDANCE_NOTE',chargeable:true}]});
await post({action:'proposeReschedule',id:upcoming.id,start:'2035-03-02T12:00',end:'2035-03-02T13:00',note:'STUDENT_SHARED_REASON'},student);
const rawBefore=JSON.stringify(sqlite.prepare('SELECT * FROM lessons WHERE id=?').get(historical.id));
const ownClass=sqlite.prepare('SELECT classroom_id FROM class_sessions WHERE id=?').get(historical.session_id).classroom_id;
sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(op(),group,ownClass,peer.name,now);
const classOption=(await sessionServer.classScheduleOptions(admin)).find(option=>option.id===ownClass);
await post({action:'createClassSession',classroomId:ownClass,optionKey:classOption.optionKey,start:'2035-04-01T12:00',end:'2035-04-01T13:00',operationId:op()});
sqlite.prepare("UPDATE class_sessions SET attendance_note='INTERNAL_GROUP_NOTE',attendance_recorded_by=? WHERE session_type='group'").run(admin.id);
function noInternal(value,message){const serialized=JSON.stringify(value);check(!/INTERNAL_|"(?:note|chargeable|reviewedAt|reviewedBy|createdBy|groupId|attendanceNote|attendanceRecordedAt|attendanceRecordedBy|attendanceReviewedAt|attendanceReviewedBy|actorId|ownerId)"/.test(serialized),message);}
const core=(await get(stateRoute,'state?scope=core')).data;
check(core.lessons.length===3,'Student receives own historical, one-to-one and group lessons');
noInternal(core.lessons,'Student lesson response excludes staff metadata and notes');
noInternal(core.classSessions,'Core class sessions also exclude internal attendance metadata');
check(core.classSessions.length===1&&core.classSessions[0].participantCount===2&&core.classSessions[0].participants.length===1,'Group session snapshot retains class count but only the current student name');
const old=core.lessons.find(lesson=>lesson.id===historical.id);
check(old.personalAttendance==='present'&&old.actualStart&&old.teachingStatus==='taught','Student retains personal attendance, actual times and class teaching status');
check(core.lessons.find(lesson=>lesson.id===upcoming.id).onlineLink==='https://example.test/student-link','Online link remains available');
check(core.proposals[0].note==='STUDENT_SHARED_REASON','Own shared reschedule reason remains available');
check(!('requestedBy' in core.proposals[0])&&!('respondedBy' in core.proposals[0]),'Reschedule state omits private account identifiers');
const classData=(await get(sessionRoute,'class-sessions?classroomId='+ownClass)).data;
noInternal(classData,'Classroom sessions omit internal teaching and participant metadata');
check(classData.sessions.every(session=>session.participants.length===1&&session.participants[0].studentName===student.name&&!session.canManage),'Student sessions retain own participant only and cannot manage attendance');
const pureSession=projections.studentSessionResponse({...seed,participants:[...seed.participants,{...seed.participants[0],studentName:peer.name}]},student.name);
check(pureSession.participants.length===1,'Projection also rejects accidental peer participants');
const historicalPayload=(await get(historyRoute,'lesson-history?lessonId='+historical.id)).data;
noInternal(historicalPayload,'Student attendance history is an explicit safe snapshot, not raw audit JSON');
check(historicalPayload.attendanceEntries.some(entry=>entry.after.status==='present'&&entry.after.arrivedAt),'Attendance history keeps personal status and times');
check(historicalPayload.attendanceEntries.every(entry=>!('actor' in entry)),'Attendance history omits reviewer identity');
const reasonHistory=(await get(historyRoute,'lesson-history?lessonId='+upcoming.id)).data;
check(reasonHistory.entries.some(entry=>entry.note==='STUDENT_SHARED_REASON'&&entry.requestedBy===student.name),'History preserves student-authored reschedule explanations');
const staffCore=(await get(stateRoute,'state?scope=core',admin)).data;
check(staffCore.lessons.some(lesson=>lesson.id===historical.id&&lesson.note==='INTERNAL_ATTENDANCE_NOTE'&&lesson.reviewedBy===admin.id),'Admin retains authorised attendance review data');
const staffHistory=(await get(historyRoute,'lesson-history?lessonId='+historical.id,teacher)).data;
check(staffHistory.attendanceEntries.some(entry=>entry.after.teachingNote==='INTERNAL_TEACHING_NOTE'&&entry.actor===admin.name),'Owning teacher retains staff history');
await get(historyRoute,'lesson-history?lessonId='+historical.id,peer,403);
await get(historyRoute,'lesson-history?lessonId='+historical.id,foreignStudent,404);
await get(sessionRoute,'class-sessions?classroomId='+ownClass,foreignStudent,404);
check((await get(stateRoute,'state?scope=core',foreignStudent)).data.lessons.length===0,'Same-name student in another group sees no lessons');
check(rawBefore===JSON.stringify(sqlite.prepare('SELECT * FROM lessons WHERE id=?').get(historical.id)),'Response filtering preserves historical database rows');
check(Object.keys(projections.studentAttendanceSnapshot({status:'present',note:'INTERNAL',chargeable:true,nested:{reviewedBy:'INTERNAL'}})).join(',')==='status','Unknown future audit keys are excluded');
check(Object.keys(projections.studentAttendanceSnapshot(null)).length===0&&Object.keys(projections.studentAttendanceSnapshot([])).length===0,'Malformed historical snapshot shapes do not create leaked fields');

// Learning history is visible only to current authorised recipients. Its
// student projection keeps teaching content, published feedback and own scores.
sqlite.prepare("INSERT INTO homework(id,group_id,owner_id,title,description,subject,starts_at,due_at,max_score,classroom_id,created_at) VALUES('projection-hw',?,?,?,?,?,?,?,?,?,?)").run(group,teacher.id,'Shared Homework','PUBLIC_TEACHING_DESCRIPTION','Science','2020-01-01T00:00:00Z','2035-12-01T00:00:00Z',10,ownClass,now);
sqlite.prepare("INSERT INTO homework_recipients(id,group_id,homework_id,student_name) VALUES('projection-recipient',?,'projection-hw',?)").run(group,student.name);
for(const [id,owner,kind,context]of [['projection-submission-file',student.id,'submission','projection-hw'],['projection-feedback-file',teacher.id,'feedback','projection-submission']]){
  sqlite.prepare("INSERT INTO pdf_files(id,group_id,object_key,owner_id,kind,context_id,filename,bytes,status,created_at) VALUES(?,?,?,?,?,?,?,10,'attached',?)").run(id,group,'synthetic/'+id,owner,kind,context,'synthetic.pdf',now);
}
sqlite.prepare("INSERT INTO homework_submissions(id,group_id,homework_id,student_name,file_id,submitted_at,late,homework_revision) VALUES('projection-submission',?,'projection-hw',?,'projection-submission-file',?,0,1)").run(group,student.name,now);
sqlite.prepare("INSERT INTO homework_feedback(id,group_id,homework_id,submission_id,teacher_id,comment,file_id,created_at,request_hash) VALUES('projection-feedback',?,'projection-hw','projection-submission',?,'PUBLIC_TEACHER_FEEDBACK','projection-feedback-file',?,'synthetic-feedback-hash')").run(group,teacher.id,now);
// Insert a synthetic imported legacy version; production versions are immutable.
sqlite.prepare("INSERT INTO learning_versions(id,group_id,kind,record_id,revision,file_id,snapshot_json,actor_id,changed_at,reason) SELECT id||'-legacy',group_id,kind,record_id,revision+1,file_id,json_set(snapshot_json,'$.ownerId',?,'$.internalNote',?,'$.futurePrivateField',?),actor_id,changed_at,? FROM learning_versions WHERE record_id='projection-hw'").run(teacher.id,'INTERNAL_SNAPSHOT_NOTE','INTERNAL_FUTURE_FIELD','INTERNAL_CHANGE_REASON');
sqlite.prepare("INSERT INTO homework_score_history(id,group_id,homework_id,student_name,homework_revision,score,max_score,actor_id,changed_at,reason) VALUES('projection-score',?,'projection-hw',?,1,8,10,?,?,?)").run(group,student.name,teacher.id,now,'INTERNAL_GRADE_REASON');
sqlite.prepare("INSERT INTO homework_score_history(id,group_id,homework_id,student_name,homework_revision,score,max_score,actor_id,changed_at,reason) VALUES('projection-peer-score',?,'projection-hw',?,1,2,10,?,?,?)").run(group,peer.name,teacher.id,now,'INTERNAL_PEER_GRADE_REASON');
const versions=(await get(learningRoute,'learning/versions?kind=homework&id=projection-hw')).data;
check(!/INTERNAL_|"(?:ownerId|actorId|snapshotJson)"/.test(JSON.stringify(versions)),'Student learning history omits raw snapshots and internal actor fields');
check(versions.record.description==='PUBLIC_TEACHING_DESCRIPTION'&&versions.versions[0].snapshot.description==='PUBLIC_TEACHING_DESCRIPTION','Public descriptions and version content remain visible');
check(versions.scores.length===1&&versions.scores[0].score===8&&versions.scores[0].maxScore===10,'Only own grading history is visible');
check(!('reason' in versions.scores[0])&&versions.versions[0].reason==='updated','Free-form history reasons cannot leak into student payloads');
const review=(await get(reviewRoute,'learning/review?homeworkId=projection-hw')).data;
check(review.grades.length===1&&review.grades[0].score===8&&!('reason' in review.grades[0]),'Homework review applies the same grade projection');
check(review.feedback[0].comment==='PUBLIC_TEACHER_FEEDBACK'&&review.feedback[0].fileId==='projection-feedback-file'&&review.submissions[0].fileId==='projection-submission-file','Published teacher comments, marked PDFs and own submission remain accessible');
await get(learningRoute,'learning/versions?kind=homework&id=projection-hw',peer,404);
await get(reviewRoute,'learning/review?homeworkId=projection-hw&studentName='+encodeURIComponent(peer.name),student,403);
const staffVersions=(await get(learningRoute,'learning/versions?kind=homework&id=projection-hw',teacher)).data;
check(staffVersions.record.ownerId===teacher.id&&staffVersions.versions[0].snapshot.internalNote==='INTERNAL_SNAPSHOT_NOTE'&&staffVersions.scores.length===2,'Authorised staff retain full version and grade audit records');
console.log(JSON.stringify({suite:'part01-student-response',checks,hostedRequests:0}));
