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
grants(admin,['tasks.create','tasks.archive']);grants(reader,['tasks.view']);grants(legacy,catalog.LEGACY_ADMIN_GRANTS);grants(foreignAdmin,['tasks.create','tasks.archive']);
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
const complete=(id,extra={})=>({action:'complete',classroomId:room,id,operationId:op(),...extra});
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
const studentRequest=complete(id),finished=expect(await post(student,studentRequest),200,'student marks the no-file Task Complete');
check('completion uses the authenticated roster identity',()=>{assert.equal(finished.id,id);const payload=JSON.parse(taskEvents().find(e=>e.action==='classTask.complete').after_json);assert.equal(payload.studentName,'Alpha');assert.equal(eventCount('complete',id),1);});
expect(await post(student,studentRequest),200,'lost completion response is replayable');
expect(await post(student,complete(id)),200,'second operation for an already completed Task stays idempotent');
expect(await post(student2,complete(id)),200,'two accounts bound to the same student share one completion');
check('completion identity is independent of account display names and operation IDs',()=>assert.equal(eventCount('complete',id),1));
sqlite.prepare('UPDATE accounts SET name=? WHERE id=?').run('Different display name',student.id);student.name='Different display name';
list=expect(await get(student),200,'display-name change preserves student completion');
check('fresh reads reconstruct the stored student completion',()=>assert.equal(typeof list.tasks.find(t=>t.id===id).completedAt,'string'));
let betaState=expect(await get(beta),200,'another student reads only own completion');
check('one student completion never marks a classmate complete',()=>{assert(!betaState.tasks.find(t=>t.id===id).completedAt);assert(!JSON.stringify(betaState).includes('Alpha'));});
const forged=await post(beta,complete(id,{studentName:'Alpha',accountId:student.id}));
check('client identity fields cannot complete for another student',()=>{
 assert([200,400,403].includes(forged.status),JSON.stringify(forged.data));
 const completions=taskEvents().filter(e=>e.action==='classTask.complete').map(e=>({actor:e.actor_id,student:JSON.parse(e.after_json).studentName}));
 assert(!completions.some(e=>e.actor===beta.id&&e.student!=='Beta'));
});
list=expect(await get(teacher),200,'teacher reads per-student completion after refresh');
check('teacher progress reflects each active class student once',()=>{const progress=list.tasks.find(t=>t.id===id).progress;assert.equal(progress.total,2);assert.equal(progress.completed,eventCount('complete',id));assert.equal(typeof progress.students.find(s=>s.studentName==='Alpha').completedAt,'string');});
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
 beforeStatement=sql=>{if(!sql.includes('GROUP BY a.lesson_id'))return false;fired=true;revoke();return true;};
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
