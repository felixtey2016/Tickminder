import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createFixtureLoader} from './fixture-loader.mjs';

// Only infrastructure and the signed-in identity are fixtures. Task projection,
// session/grant predicates, tenant SQL and backup/restore are production code.
// The database and every identity below are fictional and private to this test.
const sqlite=new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
for(const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
let actor=null,beforeStatement=null,checks=0;
function statement(sql,values=[]){
 const execute=()=>{
  if(beforeStatement&&beforeStatement(sql,values))beforeStatement=null;
  assert(values.length<=100,'Task queries must respect the D1 bind limit');
  const query=sqlite.prepare(sql);
  return query.columns().length?{results:query.all(...values),meta:{changes:0}}:{results:[],meta:query.run(...values)};
 };
 return{sql,values,bind:(...args)=>statement(sql,args),first:async()=>execute().results[0]||null,all:async()=>execute(),run:async()=>execute(),execute};
}
const db={prepare:statement,batch:async statements=>{
 sqlite.exec('BEGIN');
 try{const result=statements.map(s=>s.execute());sqlite.exec('COMMIT');return result;}
 catch(error){sqlite.exec('ROLLBACK');throw error;}
}};
const unexpected=[],env={DB:db,ADMIN_PERMISSIONS_MODE:'enforced',BACKUP_EXPORT_TOKEN:'fictional-task-backup-proof-12345678901234567890'};
globalThis.__classroomTaskFixture={env,learningDb:()=>db,rows:async(sql,...args)=>(await statement(sql,args).all()).results,currentBusinessAccount:async()=>actor,OWNER_EMAIL:'owner@classroom-tasks.example.test',isOwnerAccount:a=>a.role==='admin'&&a.email==='owner@classroom-tasks.example.test'&&!a.id.startsWith('local:'),reportUnexpectedError:async error=>unexpected.push(String(error?.stack||error)),pdfBucket:()=>{throw Error('Tasks must never use object storage');}};
globalThis.fetch=async()=>{throw Error('No network permitted in classroom Task fixtures');};
const dataUrl=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const runtimeUrl=dataUrl('export const {env,learningDb,rows,currentBusinessAccount,OWNER_EMAIL,isOwnerAccount,reportUnexpectedError,pdfBucket}=globalThis.__classroomTaskFixture; export class LearningEditError extends Error {constructor(message,status=400){super(message);this.status=status;}}');
const nextUrl=dataUrl('export const NextResponse={json:(data,options)=>Response.json(data,options)};');
const load=createFixtureLoader({runtimeUrl,environmentUrl:runtimeUrl,runtimeFiles:['lib/auth.ts','lib/owner.ts','lib/learning-server.ts','lib/learning-versions.ts','lib/diagnostics-server.ts','lib/pdf-storage.ts'],transform:(_file,code)=>code.replaceAll("'next/server'",JSON.stringify(nextUrl)).replaceAll('"next/server"',JSON.stringify(nextUrl))});
const route=(await load('app/api/classroom-tasks/route.ts')).module,service=(await load('lib/classroom-tasks-server.ts')).module,catalog=(await load('lib/admin-permissions.ts')).module,sessions=(await load('lib/account-session.ts')).module;
const backupRoute=(await load('app/api/backup-export/route.ts')).module;
const now=new Date().toISOString(),group='tasks-school',foreign='tasks-foreign',op=()=>crypto.randomUUID();
for(const id of[group,foreign]){
 sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,id,now,now);
 sqlite.prepare('INSERT INTO storage_quota(group_id,id,used_bytes) VALUES(?,1,0)').run(id);
}
function account(id,role='admin',groupId=group,identity=id,email=id+'@classroom-tasks.example.test'){
 const a={id,role,groupId,name:id,email,teacherName:role==='teacher'?identity:null,studentName:role==='student'?identity:null};
 sqlite.prepare('INSERT INTO accounts(id,group_id,email,name,role,teacher_name,student_name,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,groupId,email,id,role,a.teacherName,a.studentName,now);
 sqlite.prepare('INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES(?,?,?,0,?)').run(id,id,'fictional-proof',now);
 const hash='fictional-task-session-'+id;
 sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run(hash,id,'2099-01-01T00:00:00.000Z');
 sessions.bindAccountSession(a,hash);return a;
}
const owner=account('task-owner','admin',group,'Owner','owner@classroom-tasks.example.test'),admin=account('task-admin'),reader=account('task-reader'),legacy=account('task-legacy'),chief=account('task-chief'),foreignAdmin=account('task-foreign-admin','admin',foreign);
sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run(chief.id,group);
const teacher=account('task-teacher','teacher',group,'Teacher A'),teacher2=account('task-teacher-second','teacher',group,'Teacher A'),otherTeacher=account('task-other-teacher','teacher',group,'Teacher B'),foreignTeacher=account('task-foreign-teacher','teacher',foreign,'Teacher A');
const student=account('task-student','student',group,'Alpha'),student2=account('task-student-second','student',group,'Alpha'),beta=account('task-beta','student',group,'Beta'),newStudent=account('task-new','student',group,'New Student'),outsider=account('task-outsider','student',group,'Outsider'),foreignStudent=account('task-foreign-student','student',foreign,'Alpha'),parent=account('task-parent','parent'),pending=account('task-pending','pending');
for(const[gid,name]of[[group,'Teacher A'],[group,'Teacher B'],[foreign,'Teacher A']])sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(gid,name,now);
for(const[gid,name,t]of[[group,'Alpha','Teacher A'],[group,'Beta','Teacher A'],[group,'New Student','Teacher A'],[group,'Outsider','Teacher B'],[foreign,'Alpha','Teacher A']]){
 sqlite.prepare('INSERT INTO students(group_id,name,name_key,created_at) VALUES(?,?,?,?)').run(gid,name,name.toLowerCase(),now);
 sqlite.prepare('INSERT INTO plans(group_id,key,student,subject,subject_id,teacher_name,created_at) VALUES(?,?,?,?,?,?,?)').run(gid,name+'-math',name,'Mathematics','mathematics',t,now);
}
function classroom(id,teacherName='Teacher A',groupId=group,createdBy=teacher.id){sqlite.prepare('INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,groupId,id,'Mathematics',teacherName,createdBy,now,now);return id;}
function member(room,name,gid=group){sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(op(),gid,room,name,now);}
const room=classroom('tasks-class-a'),otherRoom=classroom('tasks-class-b','Teacher B'),foreignRoom=classroom('tasks-class-foreign','Teacher A',foreign,foreignTeacher.id),pageRoom=classroom('tasks-class-pagination');
member(room,'Alpha');member(room,'Beta');member(otherRoom,'Outsider');member(foreignRoom,'Alpha',foreign);member(pageRoom,'Alpha');
function grants(who,keys){sqlite.prepare("INSERT INTO admin_permission_profiles(group_id,account_id,revision,grants_json,origin,updated_at) VALUES(?,?,1,?,'new',?) ON CONFLICT(group_id,account_id) DO UPDATE SET grants_json=excluded.grants_json,revision=revision+1").run(who.groupId,who.id,JSON.stringify(catalog.normalizeAdminGrants(keys)),now);}
grants(admin,['tasks.create','tasks.review','tasks.archive']);grants(reader,['tasks.view']);grants(legacy,catalog.LEGACY_ADMIN_GRANTS);grants(foreignAdmin,['tasks.create','tasks.archive']);
const rows=(table,where='1',...args)=>sqlite.prepare('SELECT * FROM '+table+' WHERE '+where+' ORDER BY rowid').all(...args);
const taskEvents=()=>rows('audit',"action LIKE 'classTask.%'");
const eventCount=(action,id)=>taskEvents().filter(e=>(!action||e.action==='classTask.'+action)&&(!id||JSON.parse(e.after_json).taskId===id)).length;
const check=(label,fn)=>{fn();checks++;console.log('PASS '+label);};
function expect(result,status,label){check(label,()=>assert.equal(result.status,status,JSON.stringify(result.data)+'\n'+unexpected.join('\n')));return result.data;}
function denied(result,label){check(label,()=>assert([403,404,409].includes(result.status),JSON.stringify(result.data)));return result;}
async function get(who=teacher,classroomId=room,params={}){
 actor=who;const response=await route.GET(new Request('https://tasks.example.test/api/classroom-tasks?'+new URLSearchParams({classroomId,...params})));
 return{status:response.status,data:await response.json(),headers:response.headers};
}
async function post(who,data,options={}){
 actor=who;const headers={'content-type':'application/json',origin:'https://tasks.example.test',...options.headers};
 const response=await route.POST(new Request('https://tasks.example.test/api/classroom-tasks',{method:'POST',headers,body:options.raw??JSON.stringify(data)}));
 return{status:response.status,data:await response.json(),headers:response.headers};
}
const create=(extra={})=>({action:'create',classroomId:room,title:'Recite the 7 times table',description:'Practise aloud, then press Complete.',operationId:op(),...extra});
const complete=(id,extra={})=>({action:'submit',classroomId:room,id,expectedEventId:null,operationId:op(),...extra});
const archive=(id,extra={})=>({action:'archive',classroomId:room,id,operationId:op(),...extra});

// Preserve genuine pre-existing PDF homework, its recipients, and storage state.
sqlite.prepare("INSERT INTO pdf_files(id,group_id,object_key,owner_id,kind,context_id,filename,bytes,status,created_at) VALUES(?,?,?,?,'homework',?,'Original worksheet.pdf',83,'attached',?)").run('existing-task-pdf',group,'fictional/worksheet.pdf',teacher.id,'existing-task-homework',now);
sqlite.prepare('INSERT INTO homework(id,group_id,owner_id,title,subject,description,starts_at,due_at,attachment_file_id,classroom_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('existing-task-homework',group,teacher.id,'Original PDF homework','Mathematics','Keep this assignment',now,'2099-01-01T00:00:00Z','existing-task-pdf',room,now);
sqlite.prepare('INSERT INTO homework_recipients(id,group_id,homework_id,student_name) VALUES(?,?,?,?)').run('existing-task-recipient',group,'existing-task-homework','Alpha');
sqlite.prepare('UPDATE storage_quota SET used_bytes=83 WHERE group_id=?').run(group);
const oldTables=['pdf_files','homework','homework_recipients','homework_submissions','teaching_materials','material_recipients','storage_quota','learning_versions','file_extra_references'];
const oldBusiness=JSON.stringify(oldTables.map(table=>[table,rows(table)]));
const schema=JSON.stringify(rows('sqlite_master',"name NOT LIKE 'sqlite_%'").map(({type,name,tbl_name,sql})=>({type,name,tbl_name,sql})));

check('new Task permissions require classroom read and never expand frozen legacy staff',()=>{
 assert.deepEqual(catalog.normalizeAdminGrants(['tasks.create']),['classrooms.view','tasks.view','tasks.create']);
 assert.deepEqual(catalog.normalizeAdminGrants(['tasks.archive']),['classrooms.view','tasks.view','tasks.archive']);
 for(const key of['tasks.view','tasks.create','tasks.archive'])assert(!catalog.LEGACY_ADMIN_GRANTS.includes(key));
});
expect(await get(null),401,'anonymous cannot list Tasks');expect(await post(null,create()),401,'anonymous cannot create Tasks');
expect(await post(teacher,create(),{headers:{origin:'https://unrelated.example.test'}}),403,'cross-origin Task writes are rejected');
expect(await post(teacher,{}, {raw:'{'}),400,'malformed JSON is rejected');
expect(await post(teacher,create(),{headers:{origin:''}}),403,'missing origin cannot authorize a Task write');
expect(await post(teacher,create(),{headers:{'content-type':'text/plain'}}),400,'Task writes require JSON content type');
for(const raw of['null','[]','false'])expect(await post(teacher,{}, {raw}),400,'JSON scalar and array bodies are rejected');
expect(await post(teacher,{}, {raw:JSON.stringify({title:'x'.repeat(16385)})}),413,'streamed request bytes have a bounded size');
expect(await post(teacher,create(),{headers:{'content-length':'16385'}}),413,'oversized declared bodies are rejected before mutation');
for(const who of[parent,pending,legacy])denied(await get(who),'ungranted or unrelated role cannot list Task contents');
for(const who of[student,parent,pending,reader])denied(await post(who,create()),'Task creation requires the real teacher or explicit staff create grant');
for(const[who,target]of[[teacher,otherRoom],[teacher,foreignRoom],[foreignTeacher,room],[foreignAdmin,room],[foreignStudent,room],[outsider,room]])denied(await get(who,target),'class teacher, membership and tenant boundaries apply to reads');
denied(await post(teacher,create({classroomId:otherRoom})),'teacher cannot create in another teacher classroom');
denied(await post(admin,create({classroomId:foreignRoom})),'granted administrator cannot create across groups');
denied(await post(teacher,create({groupId:foreign})),'explicit cross-group identity input is denied');
for(const data of[create({title:''}),create({title:'x'.repeat(121)}),create({description:'x'.repeat(2001)}),create({action:'delete'})])expect(await post(teacher,data),400,'invalid Task content or action is rejected');
expect(await post(teacher,create({operationId:'bad'})),400,'malformed operation ID cannot create a Task');
check('all denied creates leave no Task events',()=>assert.equal(taskEvents().length,0));

const request=create(),created=expect(await post(teacher,request),200,'assigned teacher creates a no-file Task'),id=created.id;
check('Task creation returns a stable ID and records one canonical event',()=>{assert.equal(typeof id,'string');assert.equal(eventCount('create',id),1);const event=taskEvents()[0],payload=JSON.parse(event.after_json);assert.equal(event.actor_id,teacher.id);assert.equal(payload.title,request.title);assert.equal(payload.description,request.description);assert.equal(payload.schemaVersion,1);assert.equal(payload.groupId,group);assert.equal(payload.classroomId,room);assert.equal(payload.revision,1);assert(!payload._audit?.objectName,'generic audit-view permission must not expose Task titles');});
let list=expect(await get(teacher),200,'teacher can read own classroom Tasks');
check('teacher receives current-roster progress and separate action flags',()=>{assert.equal(list.classroomId,room);assert.equal(list.canCreate,true);assert.equal(list.canArchive,true);assert.equal(list.canComplete,false);assert.equal(list.tasks[0].title,request.title);assert.equal(list.tasks[0].progress.total,2);assert.equal(list.tasks[0].progress.completed,0);assert.deepEqual(list.tasks[0].progress.students.map(s=>s.studentName).sort(),['Alpha','Beta']);});
const cacheResponse=await get(teacher);
check('Task responses prohibit caching',()=>assert.match(cacheResponse.headers.get('cache-control'),/no-store/));
let replay=expect(await post(teacher,request),200,'same Task create operation is safely replayed');
check('lost create response does not duplicate a Task',()=>{assert.equal(replay.id,id);assert.equal(replay.replayed,true);assert.equal(eventCount('create',id),1);});
expect(await post(teacher,{...request,title:'Different task'}),409,'operation ID cannot be reused for different content');
expect(await post(teacher2,request),409,'operation ID cannot be stolen by another account');
list=expect(await get(reader),200,'view-only administrator sees classroom Task progress');
check('view-only staff cannot create, archive or complete',()=>{assert.equal(list.canCreate,false);assert.equal(list.canArchive,false);assert.equal(list.canComplete,false);assert.equal(list.tasks[0].progress.total,2);});
for(const who of[owner,chief])expect(await get(who),200,'configured owner and group chief retain authorized Task read');
list=expect(await get(student),200,'current student can read a classroom Task');
check('student sees only personal status without classmates or staff progress',()=>{assert.equal(list.canComplete,true);assert.equal(list.canCreate,false);assert.equal(list.canArchive,false);for(const task of list.tasks){assert.equal(task.progress,undefined);assert(!task.completedAt);}assert(!JSON.stringify(list).includes('Beta'));assert(!JSON.stringify(list).includes(teacher.email));});
expect(await post(student,{action:'complete',classroomId:room,id,operationId:op()}),409,'old client cannot self-confirm a Task');
const studentRequest=complete(id),finished=expect(await post(student,studentRequest),200,'student requests teacher confirmation');
check('request is bound to authenticated student and remains uncompleted',()=>{assert.equal(finished.id,id);const event=taskEvents().find(e=>e.action==='classTask.submit');assert.equal(JSON.parse(event.after_json).studentName,'Alpha');assert.equal(eventCount('submit',id),1);});
expect(await post(student,studentRequest),200,'lost request response is replayable');
expect(await post(student,complete(id)),409,'new operation cannot duplicate a pending request');
expect(await post(student2,complete(id)),409,'second account cannot duplicate the same student request');
let state=expect(await get(student),200,'student reads awaiting review').tasks.find(t=>t.id===id).studentState;
check('student submission is not teacher completion',()=>{assert.equal(state.status,'awaiting_review');assert.equal(state.completedAt,null);assert.equal(state.history.length,1);});
const review=(action,version=state.stateVersion,extra={})=>({action,classroomId:room,id,studentName:'Alpha',expectedEventId:version,operationId:op(),...extra});
expect(await post(student,review('approve')),403,'student cannot approve own Task');
expect(await post(reader,review('approve')),403,'view-only admin cannot review');
expect(await post(teacher,review('return',state.stateVersion,{reason:' '})),400,'review return requires reason');
const firstVersion=state.stateVersion,returnRequest=review('return',firstVersion,{reason:'Practise seven times eight again.'});
expect(await post(teacher,returnRequest),200,'teacher returns Task with reason');expect(await post(teacher,returnRequest),200,'return replay idempotent');
expect(await post(teacher,review('approve',firstVersion)),409,'stale approval cannot overwrite return');
state=expect(await get(student),200,'student reads returned Task').tasks.find(t=>t.id===id).studentState;
check('student sees redo reason and original request history',()=>{assert.equal(state.status,'needs_redo');assert.match(state.reason,/seven times eight/);assert.equal(state.history.length,2);});
expect(await post(student,complete(id,{expectedEventId:state.stateVersion})),200,'student requests review after redo');
state=expect(await get(student),200,'student reads second request').tasks.find(t=>t.id===id).studentState;
const approveRequest=review('approve');expect(await post(admin,approveRequest),200,'explicitly authorized admin confirms');expect(await post(admin,approveRequest),200,'approval replay idempotent');
state=expect(await get(student),200,'student reads confirmed Task').tasks.find(t=>t.id===id).studentState;
check('only reviewer approval completes and all four transitions remain',()=>{assert.equal(state.status,'completed');assert.equal(typeof state.completedAt,'string');assert.equal(state.history.length,4);assert.deepEqual(state.history.map(e=>e.action),['approve','submit','return','submit']);assert.equal(state.history[0].actorName,admin.name);});
expect(await post(student,complete(id,{expectedEventId:state.stateVersion})),409,'confirmed Task cannot be resubmitted');
let betaState=expect(await get(beta),200,'classmate reads own status');check('completion never leaks another student history',()=>{assert.equal(betaState.tasks.find(t=>t.id===id).studentState.status,'pending');assert(!JSON.stringify(betaState).includes('Alpha'));});
expect(await post(beta,complete(id,{studentName:'Alpha'})),403,'client cannot request review for another student');
list=expect(await get(teacher),200,'teacher reads confirmed student status');check('confirmed count excludes pending students',()=>{const p=list.tasks.find(t=>t.id===id).progress;assert.equal(p.completed,1);assert.equal(p.awaitingReview,0);assert.equal(p.total,2);});
const legacyId=expect(await post(teacher,create({title:'Legacy self-completed Task'})),200,'create legacy fixture').id;
sqlite.prepare('INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) VALUES(?,?,?,?,?,?,?)').run(group,'legacy-event','class-task:'+legacyId,student.id,'classTask.complete',JSON.stringify({schemaVersion:1,revision:1,groupId:group,classroomId:room,taskId:legacyId,studentName:'Alpha'}),now);
const legacyState=expect(await get(student),200,'read legacy completion').tasks.find(t=>t.id===legacyId).studentState;check('legacy completion never becomes teacher approval',()=>assert.equal(legacyState.status,'legacy_completed'));
const legacyProgress=expect(await get(teacher),200,'read legacy progress').tasks.find(t=>t.id===legacyId).progress;check('legacy has a separate count',()=>{assert.equal(legacyProgress.completed,0);assert.equal(legacyProgress.legacyCompleted,1);});
const concurrentId=expect(await post(teacher,create({title:'Concurrent review Task'})),200,'create concurrent review fixture').id;expect(await post(student,complete(concurrentId)),200,'request concurrent review');
let concurrentState=expect(await get(student),200,'read concurrent state').tasks.find(t=>t.id===concurrentId).studentState;
const concurrent=await Promise.allSettled([service.mutateClassroomTask(teacher,{...review('approve',concurrentState.stateVersion),id:concurrentId}),service.mutateClassroomTask(teacher,{...review('return',concurrentState.stateVersion,{reason:'Retry'}),id:concurrentId})]);
check('concurrent reviewer decisions append exactly one result',()=>{assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal(concurrent.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);assert.equal(eventCount(null,concurrentId),3);});
denied(await post(teacher,complete(id)),'teacher cannot impersonate a student completion');
denied(await post(student,archive(id)),'student cannot close a Task');
denied(await post(reader,archive(id)),'view permission never permits closing a Task');
denied(await post(student,complete(id,{classroomId:otherRoom})),'Task ID cannot be completed from another classroom');

member(room,'New Student');
list=expect(await get(newStudent),200,'new currently authorized member inherits classroom Tasks');
check('new members start uncompleted',()=>assert(!list.tasks.find(t=>t.id===id).completedAt));
sqlite.prepare('UPDATE plans SET active=0 WHERE group_id=? AND student=?').run(group,'New Student');
denied(await get(newStudent),'inactive enrollment loses access to old classroom Tasks');
denied(await post(newStudent,complete(id)),'inactive enrollment cannot complete a Task');
list=expect(await get(teacher),200,'teacher progress excludes inactive enrollment');
check('inactive plans do not inflate current roster totals',()=>assert.equal(list.tasks.find(t=>t.id===id).progress.total,2));
sqlite.prepare('UPDATE plans SET active=1 WHERE group_id=? AND student=?').run(group,'New Student');
sqlite.prepare('DELETE FROM classroom_members WHERE classroom_id=? AND student_name=?').run(room,'New Student');
denied(await get(newStudent),'former class member cannot read old Tasks');

async function readRace(label,who,revoke,restore){
 let fired=false;
 beforeStatement=sql=>{if(!sql.includes('row_number() OVER'))return false;fired=true;revoke();return true;};
 try{denied(await get(who),label);check(label+' reached the guarded status projection',()=>assert(fired));}
 finally{beforeStatement=null;restore();}
}
await readRace('staff read permission revoked after Task content was selected never returns that content',reader,()=>grants(reader,[]),()=>grants(reader,['tasks.view']));
const alphaMember=rows('classroom_members','classroom_id=? AND student_name=?',room,'Alpha')[0];
await readRace('student removed after Task content was selected never receives a stale response',student,()=>sqlite.prepare('DELETE FROM classroom_members WHERE id=?').run(alphaMember.id),()=>sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(alphaMember.id,alphaMember.group_id,alphaMember.classroom_id,alphaMember.student_name,alphaMember.created_at));

// Revoke authority immediately before the actual canonical write executes. A
// preliminary API check alone must never authorize the later INSERT.
const isTaskWrite=(sql,values)=>/\bINSERT(?: OR \w+)? INTO (?:main\.)?audit\b/i.test(sql)&&values.some(v=>typeof v==='string'&&/^classTask\./.test(v));
async function race(label,who,data,revoke,restore){
 const before=JSON.stringify(taskEvents());let fired=false;
 beforeStatement=(sql,values)=>{if(!isTaskWrite(sql,values))return false;fired=true;revoke();return true;};
 try{const result=await post(who,data);denied(result,label);check(label+' preserves Task history',()=>{assert(fired,'fixture must reach the guarded mutation boundary');assert.equal(JSON.stringify(taskEvents()),before);});}
 finally{beforeStatement=null;restore();}
}
await race('grant revoked at write boundary is rejected',admin,create(),()=>grants(admin,['tasks.view']),()=>grants(admin,['tasks.create','tasks.archive']));
const teacherSession=rows('sessions','account_id=?',teacher.id)[0];
await race('session revoked at write boundary is rejected',teacher,create(),()=>sqlite.prepare('DELETE FROM sessions WHERE account_id=?').run(teacher.id),()=>sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run(teacherSession.token_hash,teacher.id,teacherSession.expires_at));
await race('disabled account at write boundary is rejected',teacher,create(),()=>sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,teacher.id),()=>sqlite.prepare('UPDATE accounts SET disabled_at=NULL WHERE id=?').run(teacher.id));
await race('account role changed at write boundary is rejected',teacher,create(),()=>sqlite.prepare("UPDATE accounts SET role='pending' WHERE id=?").run(teacher.id),()=>sqlite.prepare("UPDATE accounts SET role='teacher' WHERE id=?").run(teacher.id));
await race('class reassigned at write boundary is rejected',teacher,create(),()=>sqlite.prepare("UPDATE classrooms SET teacher_name='Teacher B' WHERE id=?").run(room),()=>sqlite.prepare("UPDATE classrooms SET teacher_name='Teacher A' WHERE id=?").run(room));
await race('class archived at write boundary is rejected',teacher,create(),()=>sqlite.prepare('UPDATE classrooms SET archived=1 WHERE id=?').run(room),()=>sqlite.prepare('UPDATE classrooms SET archived=0 WHERE id=?').run(room));
await race('inactive group at write boundary is rejected',teacher,create(),()=>sqlite.prepare('UPDATE tuition_groups SET active=0 WHERE id=?').run(group),()=>sqlite.prepare('UPDATE tuition_groups SET active=1 WHERE id=?').run(group));
const raceId=expect(await post(teacher,create({title:'Completion race fixture'})),200,'create separate pending Task for completion races').id;
const betaMember=rows('classroom_members','classroom_id=? AND student_name=?',room,'Beta')[0];
await race('student removed at completion boundary is rejected',beta,complete(raceId),()=>sqlite.prepare('DELETE FROM classroom_members WHERE id=?').run(betaMember.id),()=>sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(betaMember.id,betaMember.group_id,betaMember.classroom_id,betaMember.student_name,betaMember.created_at));
await race('student plan revoked at completion boundary is rejected',beta,complete(raceId),()=>sqlite.prepare('UPDATE plans SET active=0 WHERE group_id=? AND student=?').run(group,'Beta'),()=>sqlite.prepare('UPDATE plans SET active=1 WHERE group_id=? AND student=?').run(group,'Beta'));
await race('student disabled at completion boundary is rejected',beta,complete(raceId),()=>sqlite.prepare('UPDATE students SET active=0 WHERE group_id=? AND name=?').run(group,'Beta'),()=>sqlite.prepare('UPDATE students SET active=1 WHERE group_id=? AND name=?').run(group,'Beta'));

expect(await post(beta,complete(raceId)),200,'prepare pending review for authority races');
const reviewRaceVersion=expect(await get(beta),200,'read pending review version').tasks.find(t=>t.id===raceId).studentState.stateVersion;
const reviewRace=()=>({action:'approve',classroomId:room,id:raceId,studentName:'Beta',expectedEventId:reviewRaceVersion,operationId:op()});
grants(admin,['tasks.create','tasks.review','tasks.archive']);
await race('review grant revoked at approval write boundary is rejected',admin,reviewRace(),()=>grants(admin,['tasks.view']),()=>grants(admin,['tasks.create','tasks.review','tasks.archive']));
await race('student plan disconnected at approval write boundary is rejected',teacher,reviewRace(),()=>sqlite.prepare('UPDATE plans SET active=0 WHERE group_id=? AND student=?').run(group,'Beta'),()=>sqlite.prepare('UPDATE plans SET active=1 WHERE group_id=? AND student=?').run(group,'Beta'));
await race('teacher reassigned at approval write boundary is rejected',teacher,reviewRace(),()=>sqlite.prepare("UPDATE classrooms SET teacher_name='Teacher B' WHERE id=?").run(room),()=>sqlite.prepare("UPDATE classrooms SET teacher_name='Teacher A' WHERE id=?").run(room));

const closeRequest=archive(id);expect(await post(teacher,closeRequest),200,'teacher closes the Task while preserving its history');
expect(await post(teacher,closeRequest),200,'lost archive response is replayable');
denied(await post(beta,complete(id)),'closed Tasks reject further completion');
list=expect(await get(student),200,'student retains visible history for closed Tasks');
check('closing preserves previous completion and stable Task identity',()=>{const task=list.tasks.find(t=>t.id===id);assert.equal(task.archived,true);assert.equal(typeof task.completedAt,'string');assert.equal(eventCount('archive',id),1);});
sqlite.prepare('UPDATE classrooms SET archived=1 WHERE id=?').run(room);
list=expect(await get(teacher),200,'archived classroom keeps read-only Task history');
check('archived classroom disables every write capability',()=>{assert.equal(list.readOnly,true);assert.equal(list.canCreate,false);assert.equal(list.canArchive,false);assert.equal(list.canComplete,false);});
denied(await post(teacher,create()),'archived classroom cannot create Tasks');denied(await post(teacher,archive(raceId)),'archived classroom cannot close Tasks');denied(await post(beta,complete(raceId)),'archived classroom cannot complete Tasks');
sqlite.prepare('UPDATE classrooms SET archived=0 WHERE id=?').run(room);

// Exercise the public pagination with actual stored events rather than mocking
// the service response. Equal millisecond timestamps must not lose records.
for(let i=0;i<53;i++)expect(await post(teacher,create({classroomId:pageRoom,title:'Page task '+String(i).padStart(2,'0')})),200,'create paginated Task '+i);
const first=expect(await get(teacher,pageRoom),200,'first Task page'),second=expect(await get(teacher,pageRoom,{cursor:first.nextCursor}),200,'next Task page');
check('pagination covers all Tasks exactly once with a bounded page size',()=>{assert.equal(first.tasks.length,50);assert.equal(typeof first.nextCursor,'string');assert.equal(second.tasks.length,3);assert(!second.nextCursor);assert.equal(new Set([...first.tasks,...second.tasks].map(t=>t.id)).size,53);});
expect(await get(teacher,pageRoom,{cursor:'not-a-valid-cursor'}),400,'malformed pagination cursor is rejected');
expect(await get(teacher,room,{cursor:first.nextCursor}),400,'pagination cursor is bound to its classroom');

const oldTask=expect(await get(student,pageRoom,{taskId:second.tasks[0].id}),200,'direct task lookup beyond first page');check('focused lookup returns exactly selected task',()=>{assert.equal(oldTask.tasks.length,1);assert.equal(oldTask.tasks[0].id,second.tasks[0].id);});
const oldId=second.tasks[0].id;expect(await post(student,complete(oldId,{classroomId:pageRoom})),200,'request older Task');
const oldState=expect(await get(student,pageRoom,{taskId:oldId}),200,'read older request').tasks[0].studentState;
expect(await post(teacher,{action:'return',classroomId:pageRoom,id:oldId,studentName:'Alpha',expectedEventId:oldState.stateVersion,reason:'Older task needs another try.',operationId:op()}),200,'return older Task');
const inbox=expect(await get(student,room,{view:'inbox'}),200,'student cross-class inbox'),redoInbox=expect(await get(student,room,{view:'inbox',status:'needs_redo'}),200,'server-filtered redo inbox');
check('inbox bounds pages and filters older status before limit',()=>{assert.equal(inbox.items.length,20);assert(inbox.nextCursor);assert(redoInbox.items.some(item=>item.taskId===oldId));assert(redoInbox.items.every(item=>item.status==='needs_redo'));});
expect(await get(student,room,{view:'inbox',status:'needs_redo',cursor:inbox.nextCursor}),400,'inbox cursor is status-bound');
denied(await get(reader,room,{view:'inbox'}),'review inbox requires explicit review permission');
const teacherInbox=expect(await get(teacher,room,{view:'inbox'}),200,'teacher cross-class review inbox');check('teacher inbox contains only pending reviews',()=>assert(teacherInbox.items.every(item=>item.status==='awaiting_review'&&item.awaitingReview>0)));
// Completion mode is a creation property, never a student-controlled action.
for(const requiresReview of['false',0,null,{}])expect(await post(teacher,create({requiresReview})),400,'completion mode requires an actual boolean');
const defaultBody=create({title:'Explicit default review replay'}),defaultId=expect(await post(teacher,defaultBody),200,'omitted mode keeps existing default').id;
expect(await post(teacher,{...defaultBody,requiresReview:true}),200,'explicit true preserves the historical default request hash');
expect(await post(teacher,{...defaultBody,requiresReview:false}),409,'same nonce cannot silently change completion mode');
expect(await post(student,complete(defaultId,{requiresReview:false})),200,'student cannot bypass review with a forged mode');
check('server applies the published review mode',()=>assert.equal(JSON.parse(taskEvents().find(e=>e.lesson_id==='class-task:'+defaultId&&e.action==='classTask.submit').after_json).studentName,'Alpha'));
const selfBody=create({title:'Student confirms this task',requiresReview:false}),selfId=expect(await post(teacher,selfBody),200,'teacher publishes self-completion Task').id;
expect(await post(teacher,selfBody),200,'self-completion creation retry is idempotent');
expect(await post(teacher,{...selfBody,requiresReview:true}),409,'self-completion nonce cannot become review mode');
let selfTask=expect(await get(student),200,'student reads completion mode').tasks.find(t=>t.id===selfId);
check('new self-completion starts pending and is explicit',()=>{assert.equal(selfTask.requiresReview,false);assert.equal(selfTask.studentState.status,'pending');});
expect(await post(student,{...complete(selfId),action:'selfComplete'}),400,'clients cannot invoke the internal self-completion action');
expect(await post(student,{...complete(selfId),action:'complete'}),409,'legacy complete is still rejected rather than reinterpreted');
const selfSubmit=complete(selfId),selfResult=expect(await post(student,selfSubmit),200,'submit resolves to self-completion on the server');
expect(await post(student,selfSubmit),200,'lost self-completion response replays safely');
selfTask=expect(await get(student),200,'student reads self-completed Task').tasks.find(t=>t.id===selfId);
check('self-completion is separate from approval and legacy records',()=>{assert.equal(selfResult.status,'self_completed');assert.equal(selfTask.studentState.status,'self_completed');assert.equal(selfTask.studentState.history[0].action,'selfComplete');assert(selfTask.studentState.completedAt);assert.equal(eventCount('selfComplete',selfId),1);assert.equal(eventCount('approve',selfId),0);assert.equal(eventCount('submit',selfId),0);});
const selfProgress=expect(await get(teacher),200,'teacher reads self-completion totals').tasks.find(t=>t.id===selfId).progress;
check('self-completed totals never claim teacher approval',()=>{assert.equal(selfProgress.selfCompleted,1);assert.equal(selfProgress.completed,0);assert.equal(selfProgress.awaitingReview,0);assert.equal(selfProgress.legacyCompleted,0);});
expect(await post(student,complete(selfId,{expectedEventId:selfTask.studentState.stateVersion})),409,'new self-completion nonce cannot append a second completion');
for(const action of['approve','return'])expect(await post(teacher,{action,classroomId:room,id:selfId,studentName:'Alpha',expectedEventId:selfTask.studentState.stateVersion,reason:'No review needed',operationId:op()}),409,'review actions cannot reinterpret self-completion');
const selfStudentInbox=expect(await get(student,room,{view:'inbox'}),200,'read student inbox after self-completion'),selfStaffInbox=expect(await get(teacher,room,{view:'inbox'}),200,'read teacher inbox after self-completion');
check('self-completed Tasks leave both actionable inboxes',()=>{assert(!selfStudentInbox.items.some(t=>t.taskId===selfId));assert(!selfStaffInbox.items.some(t=>t.taskId===selfId));});
const selfConcurrentId=expect(await post(teacher,create({title:'Self completion concurrency',requiresReview:false})),200,'create self-completion race fixture').id;
const selfConcurrent=await Promise.allSettled([service.mutateClassroomTask(student,complete(selfConcurrentId)),service.mutateClassroomTask(student,complete(selfConcurrentId))]);
check('concurrent self-completions append exactly one canonical event',()=>{assert.equal(selfConcurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal(selfConcurrent.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);assert.equal(eventCount('selfComplete',selfConcurrentId),1);});

const preview=(id,extra={})=>({action:'previewDelete',classroomId:room,id,...extra});
const deleteBody=p=>({action:'delete',classroomId:room,id:p.id,previewAt:p.previewAt,fingerprint:p.fingerprint,confirm:true,operationId:op()});
check('delete grant is explicit and does not expand frozen legacy staff',()=>{assert.deepEqual(catalog.normalizeAdminGrants(['tasks.delete']),['classrooms.view','tasks.view','tasks.delete']);assert(!catalog.LEGACY_ADMIN_GRANTS.includes('tasks.delete'));});
const deletionHistory=taskEvents().filter(e=>e.lesson_id==='class-task:'+selfId),beforePreview=JSON.stringify(taskEvents());
const selfPreview=expect(await post(teacher,preview(selfId)),200,'publisher can preview deletion');
check('deletion preview is read-only and includes explicit impact',()=>{assert.equal(JSON.stringify(taskEvents()),beforePreview);assert.equal(selfPreview.history.events,2);assert.equal(selfPreview.history.students,1);assert.equal(selfPreview.history.selfCompletions,1);assert.match(selfPreview.fingerprint,/^[a-f0-9]{64}$/);});
for(const who of[student,parent,pending,teacher2,otherTeacher,foreignTeacher,foreignAdmin,reader,admin])denied(await post(who,preview(selfId)),'only publisher or explicitly authorized staff can preview deletion');
const secondTeacherList=expect(await get(teacher2),200,'second account bound to same teacher can read');
check('delete capability belongs to publishing account rather than shared teacher name',()=>assert.equal(secondTeacherList.tasks.find(t=>t.id===selfId).canDelete,false));
expect(await post(teacher,{action:'delete',classroomId:room,id:selfId,operationId:op()}),409,'deletion needs preview and confirmation');
expect(await post(teacher,{...deleteBody(selfPreview),confirm:false}),409,'deletion requires explicit confirmation');
expect(await post(teacher,{...deleteBody(selfPreview),fingerprint:'0'.repeat(64)}),409,'tampered deletion preview is rejected');
expect(await post(teacher,{...deleteBody(selfPreview),previewAt:new Date(Date.now()-301000).toISOString()}),409,'expired deletion preview is rejected');
expect(await post(teacher,{...deleteBody(selfPreview),previewAt:new Date(Date.now()+60000).toISOString()}),409,'future deletion preview is rejected');
const stalePreview=expect(await post(teacher,preview(selfConcurrentId)),200,'preview before another student completes');
expect(await post(beta,complete(selfConcurrentId)),200,'another student completes after preview');
expect(await post(teacher,deleteBody(stalePreview)),409,'changed historical impact requires a fresh deletion preview');
// A departed student is deliberately absent from current progress, but their
// history must remain visible in deletion impact and survive the tombstone.
sqlite.prepare('DELETE FROM classroom_members WHERE id=?').run(alphaMember.id);
try{
 const departed=expect(await post(teacher,preview(selfId)),200,'preview includes departed student history');
 check('departed student is counted without restoring their access',()=>{assert.equal(departed.history.students,1);assert.equal(departed.history.selfCompletions,1);});
 denied(await get(student,room,{taskId:selfId}),'departed student cannot use retained history to read task');
}finally{sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(alphaMember.id,alphaMember.group_id,alphaMember.classroom_id,alphaMember.student_name,alphaMember.created_at);}
const freshDelete=deleteBody(expect(await post(teacher,preview(selfId)),200,'refresh deletion preview'));
for(const who of[student,teacher2,foreignTeacher,reader])denied(await post(who,freshDelete),'preview cannot authorize another actor to delete');
expect(await post(teacher,freshDelete),200,'publisher deletes task with a tombstone');
expect(await post(teacher,freshDelete),200,'lost successful deletion response is replayable');
check('deletion retains exact previous events and appends one distinct tombstone',()=>{assert.deepEqual(taskEvents().filter(e=>e.lesson_id==='class-task:'+selfId&&e.action!=='classTask.delete'),deletionHistory);assert.equal(eventCount('delete',selfId),1);assert.equal(JSON.parse(taskEvents().find(e=>e.lesson_id==='class-task:'+selfId&&e.action==='classTask.delete').after_json).deleted,true);});
for(const who of[teacher,student]){
 const remaining=expect(await get(who),200,'list excludes deleted task');check('deleted task is absent from list',()=>assert(!remaining.tasks.some(t=>t.id===selfId)));
 expect(await get(who,room,{taskId:selfId}),404,'direct lookup of deleted task is unavailable');
 const remainingInbox=expect(await get(who,room,{view:'inbox'}),200,'inbox excludes deleted task');check('deleted task absent from inbox',()=>assert(!remainingInbox.items.some(t=>t.taskId===selfId)));
}
denied(await post(beta,complete(selfId)),'deleted task rejects new completion');denied(await post(teacher,archive(selfId)),'deleted task cannot be closed again');
expect(await post(teacher,{...freshDelete,fingerprint:'0'.repeat(64)}),409,'replayed deletion nonce still binds the original proof');
// Archive remains a separate retained-list behavior; deleting a closed Task
// must still preserve historical approvals and redo requests.
const closedPreview=expect(await post(teacher,preview(id)),200,'publisher can delete an already closed task');
check('delete preview counts full review history',()=>{assert.equal(closedPreview.history.approvals,1);assert.equal(closedPreview.history.returns,1);assert.equal(closedPreview.history.submissions,2);});
expect(await post(teacher,deleteBody(closedPreview)),200,'closed task can be deleted without erasing history');
grants(admin,['tasks.delete']);
const adminPreview=expect(await post(admin,preview(legacyId)),200,'explicitly authorized administrator may delete another publisher task');
check('legacy completion remains distinct in deletion impact',()=>{assert.equal(adminPreview.history.legacyCompletions,1);assert.equal(adminPreview.history.approvals,0);});
await race('delete grant revoked at insertion boundary is rejected',admin,deleteBody(adminPreview),()=>grants(admin,['tasks.view']),()=>grants(admin,['tasks.delete']));
expect(await post(admin,deleteBody(adminPreview)),200,'administrator with live delete grant deletes task');
grants(admin,['tasks.create','tasks.review','tasks.archive']);
const guardedDeleteId=expect(await post(teacher,create({title:'Deletion authority race'})),200,'create deletion race fixture').id;
const guardedDelete=deleteBody(expect(await post(teacher,preview(guardedDeleteId)),200,'preview deletion race fixture'));
await race('delete session revoked at insertion boundary is rejected',teacher,guardedDelete,()=>sqlite.prepare('DELETE FROM sessions WHERE account_id=?').run(teacher.id),()=>sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run(teacherSession.token_hash,teacher.id,teacherSession.expires_at));
await race('delete teacher reassignment at insertion boundary is rejected',teacher,guardedDelete,()=>sqlite.prepare("UPDATE classrooms SET teacher_name='Teacher B' WHERE id=?").run(room),()=>sqlite.prepare("UPDATE classrooms SET teacher_name='Teacher A' WHERE id=?").run(room));
let deleteRaceFired=false;
beforeStatement=(sql,values)=>{if(!isTaskWrite(sql,values))return false;deleteRaceFired=true;sqlite.prepare('INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) VALUES(?,?,?,?,?,?,?)').run(group,'delete-race-student-event','class-task:'+guardedDeleteId,student.id,'classTask.submit',JSON.stringify({schemaVersion:1,revision:1,groupId:group,classroomId:room,taskId:guardedDeleteId,studentName:'Alpha'}),now);return true;};
try{expect(await post(teacher,guardedDelete),409,'append after preview recomputation is caught by insertion CAS');check('CAS preserves the new student record and never tombstones',()=>{assert(deleteRaceFired);assert.equal(eventCount('submit',guardedDeleteId),1);assert.equal(eventCount('delete',guardedDeleteId),0);});}finally{beforeStatement=null;}
const deleteConcurrent=deleteBody(expect(await post(teacher,preview(guardedDeleteId)),200,'fresh preview for duplicate deletion race'));
const deletions=await Promise.allSettled([service.mutateClassroomTask(teacher,deleteConcurrent),service.mutateClassroomTask(teacher,{...deleteConcurrent,operationId:op()})]);
check('concurrent different deletion operations append only one tombstone',()=>{assert.equal(deletions.filter(r=>r.status==='fulfilled').length,1);assert.equal(eventCount('delete',guardedDeleteId),1);});

check('Task writes leave existing PDF/homework/material/quota records byte-for-byte unchanged',()=>assert.equal(JSON.stringify(oldTables.map(table=>[table,rows(table)])),oldBusiness));
check('Task feature performs no schema changes',()=>assert.equal(JSON.stringify(rows('sqlite_master',"name NOT LIKE 'sqlite_%'").map(({type,name,tbl_name,sql})=>({type,name,tbl_name,sql}))),schema));
check('Task fixture has no broken foreign keys',()=>assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]));

// Run the actual backup exporter and restore verifier. The canonical events
// must survive intact, including each completion and operation replay key.
const backup=await backupRoute.GET(new Request('https://tasks.example.test/api/backup-export',{headers:{authorization:'Bearer '+env.BACKUP_EXPORT_TOKEN}}));
expect({status:backup.status,data:null},200,'existing backup exporter supports Task events without a format migration');
const snapshot=await backup.json(),expectedEvents=JSON.parse(JSON.stringify(taskEvents()));
check('backup includes complete canonical Task event JSON',()=>assert.deepEqual(snapshot.tables.audit.rows.filter(e=>e.action.startsWith('classTask.')),expectedEvents));
const root=path.resolve(import.meta.dirname,'..');
let secure=fs.readFileSync(path.join(root,'scripts/secure-d1-backup.mjs'),'utf8').replaceAll('\r\n','\n').split('\ntry {\n')[0];
secure=secure.replace("const projectRoot = resolve(import.meta.dirname, '..').toLowerCase();",'const projectRoot = '+JSON.stringify(root)+';').replace("'./backup-order.mjs'",JSON.stringify(new URL('../scripts/backup-order.mjs',import.meta.url).href));
const {restoreInMemory}=await import(dataUrl(secure.replace('return counts;',"return {counts,events:db.prepare(\"SELECT * FROM audit WHERE action LIKE 'classTask.%' ORDER BY rowid\").all()};")+'\nexport {restoreInMemory};'));
const restored=restoreInMemory(snapshot);
check('secure restore retains every Task event exactly',()=>assert.deepEqual(JSON.parse(JSON.stringify(restored.events)),expectedEvents));
const projectedBefore=await service.readClassroomTasks(teacher,new URLSearchParams({classroomId:room}));
sqlite.prepare("DELETE FROM audit WHERE action LIKE 'classTask.%'").run();
for(const event of restored.events){const keys=Object.keys(event);sqlite.prepare('INSERT INTO audit('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(key=>event[key]));}
const projectedAfter=await service.readClassroomTasks(teacher,new URLSearchParams({classroomId:room}));
check('fresh Task projection rebuilds identically from restored canonical events',()=>assert.deepEqual(projectedAfter,projectedBefore));
check('Task API produced no unexpected server errors',()=>assert.deepEqual(unexpected,[]));
console.log(JSON.stringify({suite:'classroom-tasks-server',checks,productionWrites:false,networkRequests:0,schemaChanges:0}));
sqlite.close();
