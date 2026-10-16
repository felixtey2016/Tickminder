import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {drizzle} from 'drizzle-orm/d1';
import ts from 'typescript';

// Real migrations, SQLite transactions, password hashes, authentication, and
// route handlers. All identities are fictional; no hosted binding is present.
const resultDirectory=new URL('../../../work/part03-permissions-round2/',import.meta.url);
mkdirSync(resultDirectory,{recursive:true});
const startedAt=new Date().toISOString(),results=[],log=[];
const record=message=>{log.push(message);console.log(message);};
const sqlite=new DatabaseSync(':memory:');
const fixtureOwnerEmail='permissions-owner@example.test';
const configuredOwnerEmail=readFileSync(new URL('../lib/owner.ts',import.meta.url),'utf8').match(/export const OWNER_EMAIL\s*=\s*"([^"]+)";/)?.[1];
assert(configuredOwnerEmail,'Owner constant required for the isolated fixture');
const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();
const preparationMigration=migrations.find(name=>name.startsWith('0032_'));
assert(preparationMigration,'Round 1 migration 0032 is required');
const migrate=name=>sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8').replaceAll(configuredOwnerEmail,fixtureOwnerEmail));
for(const name of migrations.filter(name=>name<preparationMigration))migrate(name);

let beforeBatch=null,beforeAuditRead=null,authorityReadsBeforeAudit=0;
function statement(sql,values=[]){
  const execute=arrays=>{
    if(beforeAuditRead){
      if(/\bAS\s+canManageAdministrators\b/i.test(sql))authorityReadsBeforeAudit++;
      if(/^\s*SELECT\b[\s\S]*?\bFROM\s+(?:"audit"|audit)(?:\s|$)/i.test(sql)){const hook=beforeAuditRead;beforeAuditRead=null;hook();}
    }
    const prepared=sqlite.prepare(sql);if(arrays)prepared.setReturnArrays(true);return prepared.columns().length?{results:prepared.all(...values),meta:{changes:0}}:{results:[],meta:prepared.run(...values)};
  };
  return {sql,bind:(...next)=>statement(sql,next),first:async()=>execute(false).results[0]||null,all:async()=>execute(false),raw:async()=>execute(true).results,run:async()=>execute(false),execute:()=>execute(false)};
}
const d1={prepare:statement,async batch(items){
  const writesDraft=items.some(item=>/^(?:UPDATE admin_permission_profiles|INSERT INTO admin_permission_profiles)/.test(item.sql));
  const hook=beforeBatch;if(hook){beforeBatch=null;await hook();}
  sqlite.exec('BEGIN');
  try{const values=items.map(item=>item.execute());sqlite.exec('COMMIT');return values;}
  catch(error){sqlite.exec('ROLLBACK');throw error;}
}};
let cookieValues={},requestHeaders=new Headers();
class JsonResponse extends Response{
  static json(data,options){const response=new JsonResponse(JSON.stringify(data),{...options,headers:{'content-type':'application/json',...options?.headers}});response.cookies={set:(name,value)=>cookieValues[name]=value,delete:name=>delete cookieValues[name]};return response;}
}
const runtime={env:{DB:d1,ADMIN_PERMISSIONS_MODE:'enforced',GOOGLE_CLIENT_ID:'permissions-fixture-client'},cookies:async()=>({get:name=>cookieValues[name]?{value:cookieValues[name]}:undefined}),headers:async()=>requestHeaders,NextResponse:JsonResponse,getDb:()=>drizzle(d1)};
globalThis.__adminPermissions=runtime;
const stub='data:text/javascript;base64,'+Buffer.from('export const {env,cookies,headers,NextResponse,getDb}=globalThis.__adminPermissions;').toString('base64');
const applicationRoot=new URL('../',import.meta.url).href;
const hooks=registerHooks({
  resolve(specifier,context,nextResolve){
    if(['cloudflare:workers','next/headers','next/server','@/db'].includes(specifier))return {url:stub,shortCircuit:true};
    if(specifier.startsWith('@/'))return {url:new URL(specifier.slice(2)+'.ts',applicationRoot).href,shortCircuit:true};
    if(specifier.startsWith('.')&&context.parentURL?.startsWith(applicationRoot)&&context.parentURL.endsWith('.ts'))return {url:new URL(/\.[cm]?[jt]sx?$/.test(specifier)?specifier:specifier+'.ts',context.parentURL).href,shortCircuit:true};
    return nextResolve(specifier,context);
  },
  load(url,context,nextLoad){
    if(url.startsWith(applicationRoot)&&url.endsWith('.ts')){
      let source=readFileSync(new URL(url),'utf8');
      if(url===new URL('../lib/owner.ts',import.meta.url).href)source=source.replaceAll(configuredOwnerEmail,fixtureOwnerEmail);
      return {format:'module',source:ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
    }
    return nextLoad(url,context);
  },
});
const load=async file=>import(new URL('../'+file,import.meta.url));
const auth=await load('lib/auth.ts'),pw=await load('lib/password.ts');
const permission=await load('lib/admin-permissions.ts'),permissionServer=await load('lib/admin-permissions-server.ts');
const routes={};for(const name of ['admin-permissions','auth','action','groups','state','billing','learning','classrooms','academic-catalogues','manage','folders','class-sessions','attendance','student-promotions','conflicts','lesson-history','sheet-sync'])routes[name]=await load('app/api/'+name+'/route.ts');
const now=new Date().toISOString(),password='Fictional-permissions-password-123',passwordHash=await pw.hashPassword(password);
const groups={a:'next-genn-edu',b:'permissions-b',raceActor:'permissions-actor-race',raceTarget:'permissions-target-race',raceRevision:'permissions-revision-race',raceRead:'permissions-read-race'};
for(const id of Object.values(groups).filter(id=>id!==groups.a))sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,id,now,now);
function account(id,role='admin',groupId=groups.a,options={}){
  sqlite.prepare('INSERT INTO accounts(group_id,id,email,name,role,teacher_name,student_name,created_at,name_confirmed_at,activated_at,disabled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(groupId,id,options.email??'',id,role,options.teacherName??null,options.studentName??null,now,now,role==='pending'?null:now,options.disabled?now:null);
  sqlite.prepare('INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES(?,?,?,?,?)').run(id,id,passwordHash,options.temporary?1:0,now);
}
account('owner','admin',null,{email:fixtureOwnerEmail});
for(const id of ['chief-a','admin-a','admin-peer','draft-admin','audit-target','secret-private-target'])account(id);
account('admin-disabled','admin',groups.a,{disabled:true});
account('chief-b','admin',groups.b);account('admin-b','admin',groups.b);
account('local:owner-impostor','admin',groups.a,{email:fixtureOwnerEmail});
account('teacher-a','teacher',groups.a,{teacherName:'Fixture Teacher'});
account('student-a','student',groups.a,{studentName:'Fixture Student'});account('pending-a','pending');
for(const [group,chief,target,next]of [[groups.raceActor,'race-chief','race-admin','race-next'],[groups.raceTarget,'target-chief','target-admin','target-next'],[groups.raceRevision,'revision-chief','revision-admin','revision-next'],[groups.raceRead,'read-chief','read-admin','read-next']]){
  for(const id of [chief,target,next])account(id,'admin',group);
  sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run(chief,group);
}
sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('chief-a',groups.a);
sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('chief-b',groups.b);
sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(groups.a,'Fixture Teacher',now);
sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(groups.a,'Unused Teacher',now);
sqlite.prepare('INSERT INTO students(group_id,name,name_key,created_at,grade) VALUES(?,?,?,?,?)').run(groups.a,'Fixture Student','fixturestudent',now,'Form 3');
const tableNames=()=>sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
const snapshotTables=names=>JSON.stringify(names.map(name=>[name,sqlite.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()]));
const oldTables=tableNames(),beforeMigration=snapshotTables(oldTables);
migrate(preparationMigration);
const afterMigration=snapshotTables(oldTables);
const snapshot=()=>snapshotTables(tableNames());
const profileRow=id=>sqlite.prepare('SELECT * FROM admin_permission_profiles WHERE account_id=?').get(id);
const auditCount=()=>sqlite.prepare('SELECT count(*) AS n FROM audit').get().n;
async function login(id,groupId){
  const token='permissions-session-'+crypto.randomUUID();
  sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run(await auth.hashToken(token),id,new Date(Date.now()+86400000).toISOString());
  cookieValues.tuition_session=token;requestHeaders=new Headers(groupId?{'x-tickminder-group':groupId}:{});
}
function logout(){cookieValues={};requestHeaders=new Headers();}
function request(name,body,query='',options={}){
  return new Request('https://test.invalid/api/'+name+query,{...(body===undefined?{}:{method:'POST',headers:{origin:'https://test.invalid','content-type':'application/json'},body:JSON.stringify(body)}),...options});
}
async function call(name,body,query='',options){const response=await routes[name][body===undefined?'GET':'POST'](request(name,body,query,options));return {status:response.status,data:await response.json(),headers:response.headers};}
async function ok(name,body,query){const result=await call(name,body,query);assert.equal(result.status,200,JSON.stringify({name,status:result.status,data:result.data}));return result.data;}
async function denied(name,body,query='',statuses=[400,401,403,404,409]){const result=await call(name,body,query);assert.ok(statuses.includes(result.status),JSON.stringify({name,status:result.status,data:result.data}));return result;}
const query=id=>'?accountId='+encodeURIComponent(id);
const readProfile=id=>ok('admin-permissions',undefined,query(id));
const save=(id,expectedRevision,grants,extra={})=>ok('admin-permissions',{accountId:id,expectedRevision,grants,...extra});
async function unchanged(label,operation){const before=snapshot(),value=await operation();assert.equal(snapshot(),before,label+': no partial mutation or success audit');return value;}
async function section(name,operation){
  const begin=Date.now();
  try{await operation();results.push({name,status:'passed',durationMs:Date.now()-begin});record('PASS '+name);}
  catch(error){results.push({name,status:'failed',durationMs:Date.now()-begin,error:error.stack||String(error)});record('FAIL '+name+'\n'+(error.stack||String(error)));}
  finally{beforeBatch=null;beforeAuditRead=null;}
}
const canonical=values=>[...values].sort();
const contains=(values,key)=>assert.ok(values.includes(key),'Expected '+key);
function pendingState(data){assert.equal(data.rollout,'preparation');assert.equal(data.status,'pending');assert.equal(data.runtimeEnforcement,false);assert.equal(data.currentAccess,'legacy');assert.deepEqual(data.effectiveGrants,permission.LEGACY_ADMIN_GRANTS);}
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('Network access is forbidden in this isolated suite');};

function grant(id,keys){const normalized=permission.normalizeAdminGrants(keys);sqlite.prepare('UPDATE admin_permission_profiles SET grants_json=?,draft_grants_json=NULL WHERE account_id=?').run(JSON.stringify(normalized),id);return normalized;}
const adminId='admin-a',teacher='Fixture Teacher',student='Fixture Student';
let roomId,sessionId;
let networkRequests=0;
try{
await section('deny all grants rejects every owned route before business writes',async()=>{
  grant(adminId,[]);await login(adminId);
  const actions=['createLocalAccount','resetLocalPassword','activateAccount','deleteAccount','restoreAccount','bind','saveTeacher','saveStudent','updateStudentProfile','setStudentActive','savePlan','create','edit','cancel','attendance','review','proposeReschedule','respondReschedule','createClassSession','editClassSession','cancelClassSession','proposeClassReschedule','respondClassReschedule','updateClassSessionLink','futureAction'];
  for(const action of actions)await unchanged(action,()=>denied('action',{action},'',[403]));
  for(const action of ['createTerm','saveTerm','saveClassroom','archiveClassroom','saveAnnouncement','deleteAnnouncement','futureAction'])await unchanged('classrooms '+action,()=>denied('classrooms',{action},'',[403]));
  for(const action of ['create','rename','move','placeContent','previewDelete','delete','futureAction'])await unchanged('folders '+action,()=>denied('folders',{action},'',[403]));
  for(const [name,body,query]of [['attendance',undefined,'?sessionId=missing'],['class-sessions',undefined,''],['lesson-history',undefined,'?lessonId=missing'],['student-promotions',undefined,'?cycle=2027'],['student-promotions',{cycle:2027,students:[]},''],['conflicts',{action:'create'},''],['sheet-sync',{action:'preview',mode:'billable'},'']])await unchanged(name,()=>denied(name,body,query,[403]));
  const preview=await ok('manage',{action:'previewDelete',kind:'teacher',id:teacher});assert.equal(preview.items.length,0);assert.equal(preview.blocked.length,1);
  await unchanged('unknown delete action',()=>denied('manage',{action:'futureAction',kind:'teacher',id:teacher,confirm:true},'',[403]));
  await unchanged('actual permanent delete',()=>denied('manage',{kind:'teacher',id:teacher,confirm:true},'',[403]));
});

await section('student create grant cannot edit or disable a student or write teachers',async()=>{
  grant(adminId,['students.create']);await login(adminId);
  await ok('action',{action:'saveStudent',name:'Created Student',syllabusId:'spm',grade:'Form 4',age:16});
  const created=sqlite.prepare('SELECT * FROM students WHERE group_id=? AND name=?').get(groups.a,'Created Student');assert.equal(created.grade,'Form 4');assert.equal(created.age,16);
  for(const body of [{action:'updateStudentProfile',name:'Created Student',grade:'Form 5'},{action:'setStudentActive',name:'Created Student',active:false},{action:'saveTeacher',name:'Forbidden Teacher'}])await unchanged(body.action,()=>denied('action',body,'',[403]));
});

await section('teacher creation and restore are independently guarded with transactional revocation',async()=>{
  grant(adminId,['teachers.create']);await login(adminId);await ok('action',{action:'saveTeacher',name:'Created Teacher'});
  await unchanged('cannot disable existing teacher',()=>denied('action',{action:'saveTeacher',name:'Created Teacher',active:false},'',[403]));
  const oldAudit=auditCount();beforeBatch=()=>grant(adminId,[]);
  await denied('action',{action:'saveTeacher',name:'Revoked Teacher'},'',[403]);assert.equal(auditCount(),oldAudit);assert.equal(sqlite.prepare('SELECT name FROM teachers WHERE name=?').get('Revoked Teacher'),undefined);
  grant(adminId,['teachers.disable']);await ok('action',{action:'saveTeacher',name:'Created Teacher',active:false});assert.equal(sqlite.prepare('SELECT active FROM teachers WHERE name=?').get('Created Teacher').active,0);
  grant(adminId,['teachers.restore']);await ok('action',{action:'saveTeacher',name:'Created Teacher'});assert.equal(sqlite.prepare('SELECT active FROM teachers WHERE name=?').get('Created Teacher').active,1);
  grant(adminId,['teachers.delete']);await unchanged('unknown mutation cannot alias an authorized permanent delete',()=>denied('manage',{action:'futureAction',kind:'teacher',id:'Created Teacher',confirm:true},'',[403]));
});

await section('pairing creation avoids profile access while profile edits require student edit',async()=>{
  grant(adminId,['plans.create']);await login(adminId);
  await ok('action',{action:'savePlan',student,teacherName:teacher,subjectId:'mathematics',duration:1.5,syllabusId:'spm',grade:'Form 3'});
  const plan=sqlite.prepare('SELECT * FROM plans WHERE group_id=? AND student=?').get(groups.a,student);roomId=sqlite.prepare('SELECT classroom_id FROM classroom_members WHERE group_id=? AND student_name=?').get(groups.a,student).classroom_id;
  assert.ok(roomId);assert.equal(plan.duration,1.5);
  grant(adminId,['plans.edit']);await unchanged('cannot change profile under pairing edit',()=>denied('action',{action:'savePlan',editingKey:plan.key,student,teacherName:teacher,subjectId:'mathematics',duration:2,grade:'Form 4'},'',[403]));
  await ok('action',{action:'savePlan',editingKey:plan.key,student,teacherName:teacher,subjectId:'mathematics',duration:2});
  await unchanged('cannot disable without disable permission',()=>denied('action',{action:'savePlan',editingKey:plan.key,student,teacherName:teacher,subjectId:'mathematics',duration:2,active:false},'',[403]));
});

await section('identity grants retain protected administrator and cross-group ceilings',async()=>{
  grant(adminId,['accounts.create','accounts.assign','accounts.resetPassword','accounts.disable','accounts.restore','accounts.activate','accounts.delete']);await login(adminId);
  for(const userId of ['chief-a','admin-peer','admin-b','owner'])await unchanged('protected target '+userId,()=>denied('action',{action:'deleteAccount',userId},'',[403,404]));
  await unchanged('cannot create administrator',()=>denied('action',{action:'createLocalAccount',username:'blocked-admin',password,name:'Blocked Admin',role:'admin'},'',[403]));
  await ok('action',{action:'resetLocalPassword',userId:'teacher-a',password:'Fictional-new-teacher-password-456'});assert.equal(sqlite.prepare('SELECT must_change_password FROM local_credentials WHERE account_id=?').get('teacher-a').must_change_password,1);
  sqlite.prepare('UPDATE local_credentials SET must_change_password=0 WHERE account_id=?').run('teacher-a');
});

await section('terms classrooms and announcements maintain separate mutation grants',async()=>{
  grant(adminId,['terms.create']);await login(adminId);const term=await ok('classrooms',{action:'saveTerm',name:'Permission Term',isCurrent:false});
  await unchanged('term edit denied',()=>denied('classrooms',{action:'saveTerm',id:term.id,name:'Changed Term'},'',[403]));
  grant(adminId,['terms.edit']);await ok('classrooms',{action:'saveTerm',id:term.id,name:'Edited Term',isCurrent:false});
  grant(adminId,['announcements.create']);await ok('classrooms',{action:'saveAnnouncement',classroomId:roomId,title:'Fixture Notice',body:'Notice body'});
  const announcement=sqlite.prepare('SELECT id FROM classroom_announcements WHERE classroom_id=?').get(roomId);assert.ok(announcement);
  await unchanged('announcement delete denied',()=>denied('classrooms',{action:'deleteAnnouncement',classroomId:roomId,id:announcement.id},'',[403]));
  grant(adminId,['announcements.delete']);await ok('classrooms',{action:'deleteAnnouncement',classroomId:roomId,id:announcement.id});
  grant(adminId,['classrooms.edit']);await unchanged('cannot archive with edit',()=>denied('classrooms',{action:'archiveClassroom',id:roomId,archived:true},'',[403]));
});

await section('folder action grants support creates and deny edits or deletion independently',async()=>{
  grant(adminId,['folders.create']);await login(adminId);const state=await ok('folders',undefined,'?classroomId='+roomId);
  const folder=await ok('folders',{action:'create',classroomId:roomId,revision:state.revision,name:'Permission Folder'});assert.ok(folder.id);
  await unchanged('rename denied',()=>denied('folders',{action:'rename',classroomId:roomId,id:folder.id,name:'Renamed',revision:state.revision},'',[403]));
  await unchanged('delete preview denied',()=>denied('folders',{action:'previewDelete',classroomId:roomId,id:folder.id},'',[403]));
  grant(adminId,['folders.edit']);const fresh=await ok('folders',undefined,'?classroomId='+roomId);await ok('folders',{action:'rename',classroomId:roomId,id:folder.id,name:'Renamed Folder',revision:fresh.revision});
});

await section('schedule creation and attendance details require their own grants',async()=>{
  grant(adminId,['lessons.create']);await login(adminId);const options=await ok('class-sessions');const chosen=options.classes.find(item=>item.id===roomId);assert.ok(chosen);
  const start=new Date(Date.now()-86400000);start.setUTCHours(3,0,0,0);const local=value=>new Date(value.getTime()+8*3600000).toISOString().slice(0,16),end=new Date(start.getTime()+3600000);
  await ok('action',{action:'createClassSession',operationId:crypto.randomUUID(),classroomId:roomId,optionKey:chosen.optionKey,start:local(start),end:local(end)});
  sessionId=sqlite.prepare("SELECT id FROM class_sessions WHERE classroom_id=? AND session_type='group'").get(roomId).id;
  await denied('attendance',undefined,'?sessionId='+encodeURIComponent(sessionId),[403]);
  const service=await load('lib/class-sessions.ts'),actor=await auth.currentBusinessAccount(),state=await service.classSessionState(actor);assert.equal(state.byId.get(sessionId).attendanceRecordedBy,null);assert.equal(state.byId.get(sessionId).participants[0].chargeable,null);
  grant(adminId,['attendance.view']);const attendance=await ok('attendance',undefined,'?sessionId='+encodeURIComponent(sessionId));assert.equal(attendance.session.id,sessionId);
  await unchanged('view cannot write attendance',()=>denied('action',{action:'saveSessionAttendance',sessionId},'',[403]));
  grant(adminId,['attendance.edit']);const s=attendance.session;await ok('action',{action:'saveSessionAttendance',operationId:crypto.randomUUID(),sessionId,revision:s.revision,teachingStatus:'taught',actualStart:local(start),actualEnd:local(end),participants:s.participants.map(p=>({lessonId:p.lessonId,status:'present',chargeable:true}))});
  await unchanged('edit cannot review',()=>denied('action',{action:'reviewSessionAttendance',sessionId},'',[403]));
});

await section('history exposes only authorized attendance and rescheduling sections',async()=>{
  const lesson=sqlite.prepare('SELECT id FROM lessons WHERE session_id=? LIMIT 1').get(sessionId);assert.ok(lesson);
  grant(adminId,['lessons.view']);await login(adminId);let history=await ok('lesson-history',undefined,'?lessonId='+lesson.id);assert.deepEqual(history.attendanceEntries,[]);assert.deepEqual(history.entries,[]);
  grant(adminId,['attendance.view']);history=await ok('lesson-history',undefined,'?lessonId='+lesson.id);assert.ok(history.attendanceEntries.length>0);assert.deepEqual(history.entries,[]);
  grant(adminId,[]);await denied('lesson-history',undefined,'?lessonId='+lesson.id,[403]);
});

await section('revoked attendance visibility is checked inside session read transaction',async()=>{
  grant(adminId,['attendance.view']);await login(adminId);const actor=await auth.currentBusinessAccount(),service=await load('lib/class-sessions.ts');
  beforeBatch=()=>grant(adminId,['lessons.view']);
  await assert.rejects(()=>service.classSessionState(actor),/admin_permissions_authority_changed/);
  const state=await service.classSessionState(actor),session=state.byId.get(sessionId);assert.equal(session.actualStart,null);assert.equal(session.attendanceRecordedBy,null);assert.equal(session.participants[0].attendanceStatus,'pending');
});

await section('promotion preview and confirmed writes require explicit promotion permission',async()=>{
  grant(adminId,['students.view']);await login(adminId);await denied('student-promotions',undefined,'?cycle=2027',[403]);
  grant(adminId,['students.promote']);const list=await ok('student-promotions',undefined,'?cycle=2027'),item=list.items.find(item=>item.student===student);assert.equal(item.toGrade,'Form 4');
  await ok('student-promotions',{cycle:2027,students:[item]});assert.equal(sqlite.prepare('SELECT grade FROM students WHERE name=?').get(student).grade,'Form 4');
});

await section('sheet preview does not require statistics and cannot commit without commit grant',async()=>{
  runtime.env.SHEET_SYNC_URL='https://script.google.com/macros/s/fictional-test/exec';runtime.env.SHEET_SYNC_SECRET='fixture-only-secret';
  globalThis.fetch=async(url,options)=>{networkRequests++;const envelope=JSON.parse(options.body),data=JSON.parse(envelope.body);assert.ok(data.signature===undefined);return Response.json(data.action==='month'?{ok:true,month:'2026-10',displayMonth:'Oct 2026'}:{ok:true,changes:[],previewToken:'fixture-preview'});};
  grant(adminId,['sheetSync.preview']);await login(adminId);await ok('sheet-sync',{action:'preview',mode:'billable'});assert.equal(networkRequests,2);
  await unchanged('preview cannot commit',()=>denied('sheet-sync',{action:'commit',mode:'billable',month:'2026-10',previewToken:'fixture-preview'},'',[403]));assert.equal(networkRequests,2);
  grant(adminId,[]);await denied('sheet-sync',{action:'preview',mode:'billable'},'',[403]);assert.equal(networkRequests,2);
});

await section('chief and owner retain existing scope while teacher access stays unchanged',async()=>{
  for(const id of ['chief-a','owner']){grant(id,[]);await login(id,id==='owner'?groups.a:undefined);await ok('classrooms',{action:'saveTerm',name:'Privileged '+id,isCurrent:false});}
  await login('teacher-a');await ok('classrooms',{action:'createTerm',name:'Teacher Term',isCurrent:false});await denied('classrooms',{action:'saveTerm',name:'Teacher Current',isCurrent:true},'',[403]);
});

await section('preparation flag preserves legacy behavior and foreign keys remain sound',async()=>{
  delete runtime.env.ADMIN_PERMISSIONS_MODE;grant(adminId,[]);await login(adminId);await ok('action',{action:'saveTeacher',name:'Preparation Legacy Teacher'});assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal(sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
}finally{
  globalThis.fetch=originalFetch;hooks.deregister();delete globalThis.__adminPermissions;
  const summary={suite:'admin-permissions-core',round:2,productionWrites:false,networkRequests,sections:results.length,passed:results.filter(result=>result.status==='passed').length,failed:results.filter(result=>result.status==='failed').length,results};record(JSON.stringify({...summary,results:undefined}));
  writeFileSync(new URL('core-results.json',resultDirectory),JSON.stringify(summary,null,2)+'\n');writeFileSync(new URL('core-results.log',resultDirectory),log.join('\n')+'\n');sqlite.close();if(summary.failed)process.exitCode=1;
}
