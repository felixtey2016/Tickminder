import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createFixtureLoader} from './fixture-loader.mjs';

const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
let actor=null,beforeBatch=null,checks=0;
function statement(sql,values=[]){
 const execute=()=>{assert(values.length<=100,'D1 parameter limit');const s=sqlite.prepare(sql);return s.columns().length?{results:s.all(...values),meta:{changes:0}}:{results:[],meta:s.run(...values)};};
 return{bind:(...v)=>statement(sql,v),all:async()=>execute(),first:async()=>execute().results[0]||null,run:async()=>execute(),execute};
}
const db={prepare:statement,batch:async statements=>{beforeBatch?.();beforeBatch=null;sqlite.exec('BEGIN');try{const results=statements.map(s=>s.execute());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
globalThis.__recordingRuntime={learningDb:()=>db,currentBusinessAccount:async()=>actor,OWNER_EMAIL:'owner@recordings.example.test',isOwnerAccount:a=>a.role==='admin'&&a.email==='owner@recordings.example.test'&&!a.id.startsWith('local:')};
const dataUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64'),runtimeUrl=dataUrl('export const {learningDb,currentBusinessAccount,OWNER_EMAIL,isOwnerAccount}=globalThis.__recordingRuntime; export class LearningEditError extends Error {constructor(message,status=400){super(message);this.status=status;}}'),environmentUrl=dataUrl("export const env={ADMIN_PERMISSIONS_MODE:'enforced'};"),nextUrl=dataUrl('export const NextResponse={json:(data,options)=>Response.json(data,options)};');
const load=createFixtureLoader({runtimeUrl,environmentUrl,runtimeFiles:['lib/auth.ts','lib/owner.ts','lib/learning-server.ts','lib/learning-versions.ts'],transform:(_file,code)=>code.replaceAll("'next/server'",JSON.stringify(nextUrl)).replaceAll('"next/server"',JSON.stringify(nextUrl))});
const route=(await load('app/api/recordings/route.ts')).module,pure=(await load('lib/recordings.ts')).module;
const group='recording-school',foreign='recording-foreign',now=new Date().toISOString(),op=()=>crypto.randomUUID(),grants=['recordings.view','recordings.create','recordings.edit','recordings.delete'];
for(const id of[group,foreign])sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,id,now,now);
function account(id,role='admin',groupId=group,person=id,email=id+'@recordings.example.test'){
 const a={id,role,groupId,email,name:id,...role==='teacher'?{teacherName:person}:role==='student'?{studentName:person}:{}};
 sqlite.prepare('INSERT INTO accounts(id,email,name,role,group_id,teacher_name,student_name,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,email,id,role,groupId,a.teacherName||null,a.studentName||null,now);return a;
}
function profile(a,keys=grants){sqlite.prepare("INSERT OR REPLACE INTO admin_permission_profiles(group_id,account_id,revision,grants_json,origin,updated_at) VALUES(?,?,1,?,'new',?)").run(a.groupId,a.id,JSON.stringify(keys),now);}
function teacher(name,groupId=group){sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(groupId,name,now);}
function learner(name,groupId=group){sqlite.prepare('INSERT INTO students(group_id,name,name_key,created_at) VALUES(?,?,?,?)').run(groupId,name,name.toLowerCase(),now);}
const owner=account('recording-owner','admin',group,'Owner','owner@recordings.example.test'),admin=account('recording-admin'),reader=account('recording-reader'),chief=account('recording-chief'),otherAdmin=account('foreign-admin','admin',foreign);
profile(admin);profile(reader,['recordings.view']);profile(otherAdmin);sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run(chief.id,group);
teacher('Teacher A');teacher('Teacher B');teacher('Foreign Teacher',foreign);
const teach=account('teacher-a','teacher',group,'Teacher A'),teach2=account('teacher-a-second','teacher',group,'Teacher A'),otherTeacher=account('teacher-b','teacher',group,'Teacher B');
for(const name of['Alpha','Beta','New Student','Outsider'])learner(name);
learner('Alpha',foreign);
const student=account('student-alpha','student',group,'Alpha'),second=account('student-beta','student',group,'Beta'),newStudent=account('student-new','student',group,'New Student'),outsider=account('student-outside','student',group,'Outsider'),foreignStudent=account('foreign-alpha','student',foreign,'Alpha');
function classroom(id,name,teacherName='Teacher A',groupId=group){sqlite.prepare('INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,groupId,name,'Mathematics',teacherName,owner.id,now,now);}
function member(classId,name,groupId=group){sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),groupId,classId,name,now);}
classroom('class-a','Class A');classroom('class-b','Class B','Teacher B');classroom('class-foreign','Foreign Class','Foreign Teacher',foreign);
for(const name of ['Alpha','Beta'])member('class-a',name);member('class-b','Outsider');member('class-foreign','Alpha',foreign);
sqlite.prepare("INSERT INTO class_sessions(id,group_id,session_type,classroom_id,classroom_title,teacher_name,subject,planned_start,planned_end,created_by,created_at,updated_at) VALUES(?,?,'group',?,?,'Teacher A','Mathematics','2032-06-15T02:00:00Z','2032-06-15T03:00:00Z',?,?,?)").run('session-a',group,'class-a','Class A',owner.id,now,now);
const body=(extra={})=>({action:'save',operationId:op(),classroomId:'class-a',sessionId:'session-a',lessonDate:'2032-06-15',title:'Algebra recording',description:'Revision lesson',driveUrl:'https://drive.google.com/file/d/fictional-video-12345/view?usp=sharing&resourcekey=resource-key',status:'draft',audienceMode:'selected',...extra});
async function get(params={},as=admin){actor=as;const response=await route.GET(new Request('https://recordings.example.test/api/recordings?'+new URLSearchParams(params)));return{status:response.status,data:await response.json()};}
async function post(data,as=admin,origin='https://recordings.example.test'){actor=as;const response=await route.POST(new Request('https://recordings.example.test/api/recordings',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)}));return{status:response.status,data:await response.json()};}
const check=fn=>{fn();checks++;},expect=(r,status,label)=>{check(()=>assert.equal(r.status,status,label+': '+JSON.stringify(r.data)));return r.data;};

check(()=>assert.equal(pure.recordingDriveUrl('https://drive.google.com/open?id=fictional-video-12345&resourcekey=abc_123'),'https://drive.google.com/file/d/fictional-video-12345/view?resourcekey=abc_123'));
for(const url of['javascript:alert(1)','http://drive.google.com/file/d/fictional-video-12345/view','https://drive.google.com.evil.example/file/d/fictional-video-12345/view','https://drive.google.com/drive/folders/fictional-video-12345','https://user@drive.google.com/file/d/fictional-video-12345/view'])check(()=>assert.throws(()=>pure.recordingDriveUrl(url)));
check(()=>assert.throws(()=>pure.recordingDate('2032-02-30')));
expect(await get({},null),401,'anonymous denied');expect(await post(body(),admin,'https://other.example'),403,'cross origin denied');expect(await post(body(),reader),403,'read-only admin cannot create');expect(await post(body(),student),403,'student cannot create');expect(await post(body({operationId:'bad'})),409,'invalid operation token');
expect(await post(body({classroomId:'class-b',sessionId:null}),teach),404,'teacher cannot create in other teacher class');expect(await post(body({classroomId:'class-foreign',sessionId:null}),admin),404,'foreign classroom rejected');expect(await post(body({groupId:foreign})),403,'explicit tenant tampering denied');expect(await post(body({lessonDate:'2032-06-16'})),400,'session date mismatch denied');
const create=body(),created=expect(await post(create,teach),200,'teacher creates own draft'),id=created.id;
expect(await post(create,teach),200,'create replay');check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM class_recordings').get().n,1));
expect(await post({...create,title:'Changed replay'},teach),409,'operation cannot be reused for another request');
expect(await get({id},student),404,'student cannot view draft');expect(await get({id},otherAdmin),404,'cross-group admin denied');expect(await get({id},foreignStudent),404,'same student name in other group denied');expect(await get({id},otherTeacher),404,'unassigned teacher denied');
const detail=expect(await get({id},teach),200,'teacher detail').recording;
check(()=>assert.equal(detail.driveUrl,'https://drive.google.com/file/d/fictional-video-12345/view?resourcekey=resource-key'));check(()=>assert.deepEqual(detail.students,['Alpha','Beta']));check(()=>assert.equal(detail.canEdit,true));
const secondTeacherDetail=expect(await get({id},teach2),200,'same teacher identity second account can read');check(()=>assert.equal(secondTeacherDetail.recording.canEdit,false));
expect(await post(body({id,revision:1,title:'Not mine'}),teach2),403,'teacher cannot edit other creator recording');expect(await post({action:'delete',id,revision:1,operationId:op()},teach2),403,'teacher cannot delete other creator recording');
expect(await post(body({id,revision:1,status:'published',students:[]} ),teach),400,'publish requires recipients');expect(await post(body({id,revision:1,status:'published',students:['Outsider']}),teach),400,'publish rejects students outside class');
expect(await post(body({id,revision:1,status:'published'}),teach),200,'publish snapshot');
const classWide=expect(await post(body({title:'Default classroom audience',status:'published',audienceMode:undefined}),teach),200,'default whole-class publication');
const classWideDetail=expect(await get({id:classWide.id},teach),200,'whole-class detail').recording;check(()=>assert.equal(classWideDetail.audienceMode,'classroom'));check(()=>assert.deepEqual(classWideDetail.students,[]));
expect(await post(body({id:classWide.id,revision:1,title:'Preserve existing audience',status:'published',audienceMode:undefined}),teach),200,'omitted edit audience preserves existing mode');
const studentDetail=expect(await get({id},student),200,'recipient sees published video');check(()=>assert.equal(studentDetail.recording.students,undefined));expect(await get({id},outsider),404,'unassigned student denied');expect(await get({id},newStudent),404,'non-member denied');
member('class-a','New Student');expect(await get({id},newStudent),404,'joining class does not inherit selected recordings');expect(await get({id:classWide.id},newStudent),200,'new class member sees older whole-class recordings');
expect(await get({id:classWide.id},outsider),404,'whole-class recording still requires current membership');expect(await get({id:classWide.id},foreignStudent),404,'whole-class recording retains tenant isolation');
expect(await post(body({id,revision:2,status:'published',students:['Alpha','Beta','New Student']}),teach),200,'teacher explicitly shares old recording');expect(await get({id},newStudent),200,'added recipient sees old recording');
expect(await post(body({id,revision:2,status:'draft'}),teach),409,'stale update rejected');expect(await post(body({id,revision:3,status:'draft'}),teach),200,'unpublish');expect(await get({id},student),404,'unpublished unavailable');
expect(await post(body({id,revision:4,status:'published'}),chief),200,'group chief manages another publisher recording');
const readerDetail=expect(await get({id},reader),200,'read-only detail');check(()=>assert.equal(readerDetail.recording.canEdit,false));expect(await post(body({id,revision:5}),reader),403,'read-only edit denied');
expect(await post(body({title:'Second recording',status:'published'}),owner),200,'multiple recordings per session allowed');
const selectedTransition=expect(await post(body({title:'Selected to classroom transition',status:'published',students:['Alpha']}),teach),200,'create selected audience');expect(await get({id:selectedTransition.id},newStudent),404,'unselected current member denied');
expect(await post(body({id:selectedTransition.id,revision:1,title:'Now classroom-wide',status:'published',audienceMode:'classroom'}),teach),200,'switch selected recording to classroom audience');expect(await get({id:selectedTransition.id},newStudent),200,'converted classroom audience includes new member');check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM recording_recipients WHERE recording_id=?').get(selectedTransition.id).n,0));
classroom('class-empty','Empty Classroom');expect(await post(body({classroomId:'class-empty',sessionId:null,audienceMode:'classroom',status:'published'}),teach),200,'empty whole-class publication allowed');
const context=expect(await get({view:'context',classroomId:'class-a',month:'2032-06'},teach),200,'teacher class context');check(()=>assert.deepEqual(context.classrooms.map(c=>c.id),['class-a','class-empty']));check(()=>assert.equal(context.sessions[0].id,'session-a'));check(()=>assert.deepEqual(context.students,['Alpha','Beta','New Student']));
const studentContext=expect(await get({view:'context',classroomId:'class-a'},student),200,'student context');check(()=>assert.equal(studentContext.students.length,0));check(()=>assert.equal(studentContext.permissions.canCreate,false));
// Pagination holds a stable tuple even when several recordings share dates and timestamps.
for(let index=0;index<26;index++)expect(await post(body({title:'Pagination '+String(index).padStart(2,'0'),status:'published'})),200,'create paginated recording');
const page1=expect(await get({q:'Pagination',month:'2032-06',subject:'Mathematics'},student),200,'first page'),page2=expect(await get({q:'Pagination',month:'2032-06',subject:'Mathematics',cursor:page1.nextCursor},student),200,'second page');
check(()=>assert.equal(page1.recordings.length,24));check(()=>assert.equal(page2.recordings.length,2));check(()=>assert.equal(new Set([...page1.recordings,...page2.recordings].map(r=>r.id)).size,26));check(()=>assert.equal(page2.nextCursor,null));
const subjectFiltered=expect(await get({q:'Pagination',subject:'Science'},student),200,'subject filter'),literalFiltered=expect(await get({q:'%',month:'2032-06'},student),200,'literal search escaping');check(()=>assert.equal(subjectFiltered.recordings.length,0));check(()=>assert.equal(literalFiltered.recordings.length,0));expect(await get({cursor:'malformed'}),400,'cursor validation');
// Revalidate authority and recipient membership inside the atomic write claim.
const auditBefore=sqlite.prepare('SELECT count(*) n FROM audit').get().n;
beforeBatch=()=>sqlite.prepare("UPDATE admin_permission_profiles SET grants_json='[]' WHERE account_id=?").run(admin.id);
expect(await post(body({title:'Must not save'})),409,'admin grant revoked at write boundary');check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM audit').get().n,auditBefore));profile(admin);
beforeBatch=()=>sqlite.prepare("DELETE FROM classroom_members WHERE classroom_id='class-a' AND student_name='Beta'").run();
expect(await post(body({title:'Membership race',status:'published',students:['Beta']}),teach),409,'recipient removed at write boundary');check(()=>assert.equal(sqlite.prepare("SELECT count(*) n FROM class_recordings WHERE title='Membership race'").get().n,0));member('class-a','Beta');
const sessionHelpers=(await load('lib/account-session.ts')).module,bound=sessionHelpers.bindAccountSession({...teach},'fictional-recording-session');sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run('fictional-recording-session',teach.id,'2099-01-01T00:00:00Z');
beforeBatch=()=>sqlite.prepare('DELETE FROM sessions WHERE token_hash=?').run('fictional-recording-session');expect(await post(body(),bound),409,'logout race denied');expect(await get({},bound),403,'revoked session cannot list');
sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,otherTeacher.id);expect(await get({},otherTeacher),403,'disabled teacher denied');
// Deleting a metadata record preserves its class/session and idempotency history.
const sourceCounts=Object.fromEntries(['classrooms','class_sessions','classroom_members'].map(t=>[t,sqlite.prepare('SELECT count(*) n FROM '+t).get().n]));
const deletion={action:'delete',id,revision:5,operationId:op()};expect(await post(deletion,teach),200,'publisher deletes');expect(await post(deletion,teach),200,'delete replay after removal');expect(await get({id},student),404,'deleted unavailable');
check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM recording_recipients WHERE recording_id=?').get(id).n,0));
for(const [table,count]of Object.entries(sourceCounts))check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM '+table).get().n,count,table+' preserved'));
check(()=>assert.equal(sqlite.prepare("SELECT count(*) n FROM audit WHERE action='recordings.delete' AND lesson_id=?").get('recording:'+id).n,1));
check(()=>assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0));
console.log(JSON.stringify({ok:true,checks,scope:'local SQLite recordings authorization, current-member whole-class audience and selected snapshots, Drive URL validation, pagination, revision/replay, atomic membership/permission/session guards and metadata-only deletion'}));
