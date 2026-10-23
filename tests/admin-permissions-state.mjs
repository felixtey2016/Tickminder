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

let beforeStateRead=null,beforeBatch=null,beforeAuditRead=null,authorityReadsBeforeAudit=0;
function statement(sql,values=[]){
  const execute=arrays=>{
    assert(values.length<=100,'D1 statement exceeds 100 bound parameters: '+values.length);
    if(beforeAuditRead){
      if(/\bAS\s+canManageAdministrators\b/i.test(sql))authorityReadsBeforeAudit++;
      if(/^\s*SELECT\b[\s\S]*?\bFROM\s+(?:"audit"|audit)(?:\s|$)/i.test(sql)){const hook=beforeAuditRead;beforeAuditRead=null;hook();}
    }
    if(beforeStateRead&&/^\s*SELECT[\s\S]*?FROM\s+"students"/i.test(sql)){const hook=beforeStateRead;beforeStateRead=null;hook();}
    const prepared=sqlite.prepare(sql);if(arrays)prepared.setReturnArrays(true);return prepared.columns().length?{results:prepared.all(...values),meta:{changes:0}}:{results:[],meta:prepared.run(...values)};
  };
  return {sql,bind:(...next)=>statement(sql,next),first:async()=>execute(false).results[0]||null,all:async()=>execute(false),raw:async()=>execute(true).results,run:async()=>execute(false),execute:()=>execute(false)};
}
const d1={prepare:statement,async batch(items){
  const writesDraft=items.some(item=>/^(?:UPDATE admin_permission_profiles|INSERT INTO admin_permission_profiles)/.test(item.sql));
  const hook=writesDraft?beforeBatch:null;if(hook){beforeBatch=null;await hook();}
  sqlite.exec('BEGIN');
  try{const values=items.map(item=>item.execute());sqlite.exec('COMMIT');return values;}
  catch(error){sqlite.exec('ROLLBACK');throw error;}
}};
let cookieValues={},requestHeaders=new Headers();
class JsonResponse extends Response{
  static json(data,options){const response=new JsonResponse(JSON.stringify(data),{...options,headers:{'content-type':'application/json',...options?.headers}});response.cookies={set:(name,value)=>cookieValues[name]=value,delete:name=>delete cookieValues[name]};return response;}
}
const runtime={env:{DB:d1,GOOGLE_CLIENT_ID:'permissions-fixture-client'},cookies:async()=>({get:name=>cookieValues[name]?{value:cookieValues[name]}:undefined}),headers:async()=>requestHeaders,NextResponse:JsonResponse,getDb:()=>drizzle(d1)};
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
const routes={};for(const name of ['admin-permissions','auth','action','groups','state','billing','learning','classrooms','academic-catalogues'])routes[name]=await load('app/api/'+name+'/route.ts');
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
for(const name of migrations.filter(name=>name>preparationMigration))migrate(name);
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
  if(name==='state'&&!new URLSearchParams(query.slice(1)).has('month'))query+=(query?'&':'?')+'month=2030-01';
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


const access=await load('lib/admin-permission-access.ts');
routes['admin-options']=await load('app/api/admin-options/route.ts');
routes.revision=await load('app/api/revision/route.ts');
runtime.env.ADMIN_PERMISSIONS_MODE='enforced';
const grant=keys=>sqlite.prepare('UPDATE admin_permission_profiles SET grants_json=?,revision=revision+1 WHERE account_id=?').run(JSON.stringify(permission.normalizeAdminGrants(keys)),'admin-a');
sqlite.prepare('UPDATE students SET age=14 WHERE name=?').run('Fixture Student');
sqlite.prepare('INSERT INTO plans(group_id,key,student,subject,teacher_name,duration,created_at) VALUES(?,?,?,?,?,?,?)').run(groups.a,'Fixture Student|Mathematics','Fixture Student','Mathematics','Fixture Teacher',1.5,now);
sqlite.prepare('INSERT INTO lessons(id,group_id,student,subject,teacher_name,planned_start,planned_end,actual_start,actual_end,status,note,created_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('fixture-private-lesson',groups.a,'Fixture Student','Mathematics','Fixture Teacher','2030-01-04T02:00:00.000Z','2030-01-04T03:30:00.000Z','2030-01-04T02:00:00.000Z','2030-01-04T03:30:00.000Z','completed','ATTENDANCE_PRIVATE_NOTE','chief-a',now);
sqlite.prepare('UPDATE lessons SET reviewed_at=? WHERE id=?').run(now,'fixture-private-lesson');
sqlite.prepare('INSERT INTO audit(id,group_id,lesson_id,actor_id,action,before_json,after_json,at) VALUES(?,?,?,?,?,?,?,?)').run('fixture-private-audit',groups.a,'fixture-private-lesson','chief-a','saveStudent','{"age":14}','{"name":"PROFILE_PRIVATE_NOTE","private":"UNKNOWN_PRIVATE_NOTE"}',now);
sqlite.prepare('INSERT INTO audit(id,group_id,lesson_id,actor_id,action,before_json,after_json,at) VALUES(?,?,?,?,?,?,?,?)').run('fixture-plan-audit',groups.a,'fixture-private-lesson','chief-a','savePlan',null,'{"teacherName":"Fixture Teacher","profile":{"age":82}}',now);
sqlite.prepare('INSERT INTO audit(id,group_id,lesson_id,actor_id,action,before_json,after_json,at) VALUES(?,?,?,?,?,?,?,?)').run('fixture-lesson-audit',groups.a,'fixture-private-lesson','chief-a','edit','{"note":"ATTENDANCE_PRIVATE_NOTE","actualStart":"2030-01-04T02:00:00.000Z","plannedStart":"2030-01-04T02:00:00.000Z"}',null,now);
await login('admin-a');
try {
await section('zero grants cannot recover datasets through the default full-state endpoint',async()=>{
 grant([]);const data=await ok('state');assert.equal(data.account.adminPermissions.enforced,true);assert.deepEqual(data.account.adminPermissions.grants,[]);
 for(const key of ['lessons','plans','allPlans','students','allStudents','teachers','allTeachers','attendanceSessions','classSessions','summary'])assert.deepEqual(data[key],[],key);
 assert.equal(data.users,undefined);assert.equal(data.activity,undefined);assert.deepEqual(data.learning.materials,[]);assert.deepEqual(data.learning.homework,[]);
 for(const scope of ['accounts','activity'])await denied('state',undefined,'?scope='+scope,[403]);
 assert(!JSON.stringify(data).includes('ATTENDANCE_PRIVATE_NOTE'));assert(!JSON.stringify(data).includes('PROFILE_PRIVATE_NOTE'));
});
await section('scheduling-only grants provide minimal selectors without people or plan records',async()=>{
 grant(['lessons.create']);const data=await ok('state',undefined,'?scope=core');
 assert(data.students.includes('Fixture Student'));assert(data.teachers.includes('Fixture Teacher'));assert.equal(data.studentOptions[0].age,undefined);
 assert(data.planOptions.some(plan=>plan.key==='Fixture Student|Mathematics'));assert.deepEqual(data.allStudents,[]);assert.deepEqual(data.allTeachers,[]);assert.deepEqual(data.allPlans,[]);
 assert.equal(data.lessons.length,1);assert.equal(data.lessons[0].note,undefined);assert.equal(data.lessons[0].actualStart,undefined);assert.deepEqual(data.attendanceSessions,[]);
 const options=await ok('admin-options',undefined,'?purpose=lesson');assert.equal(options.studentOptions[0].age,undefined);assert.equal(options.studentOptions[0].email,undefined);assert.equal(options.teacherOptions[0].createdAt,undefined);
});
await section('student and teacher profile grants remain independent',async()=>{
 grant(['students.view']);let data=await ok('state',undefined,'?scope=core');assert.equal(data.allStudents[0].age,14);assert.deepEqual(data.allTeachers,[]);assert.deepEqual(data.lessons,[]);
 grant(['teachers.view']);data=await ok('state',undefined,'?scope=core');assert(data.allTeachers.length>0);assert.deepEqual(data.allStudents,[]);
});
await section('read-only schedules retain their filters and online links without plan access',async()=>{
 sqlite.prepare('UPDATE plans SET online_link=? WHERE key=?').run('https://example.invalid/schedule-link','Fixture Student|Mathematics');
 grant(['lessons.view']);const data=await ok('state',undefined,'?scope=core');assert.equal(data.lessons[0].onlineLink,'https://example.invalid/schedule-link');assert.deepEqual(data.planOptions,[]);assert.deepEqual(data.allPlans,[]);assert(data.teacherOptions.some(row=>row.name==='Fixture Teacher'));assert(data.students.includes('Fixture Student'));
});
await section('statistics-only access returns aggregates without attendance notes or profiles',async()=>{
 grant(['statistics.view']);const data=await ok('state',undefined,'?scope=core&month=2030-01');assert.equal(data.summary.length,1);assert.equal(data.summary[0].completed,1.5);assert.equal(data.records,undefined);assert.equal(data.checkins,undefined);
 assert(!JSON.stringify(data).includes('ATTENDANCE_PRIVATE_NOTE'));assert.deepEqual(data.lessons,[]);assert.deepEqual(data.attendanceSessions,[]);assert.deepEqual(data.allStudents,[]);
});
await section('statistics use canonical class subject identities without lesson-view access',async()=>{
 sqlite.prepare('UPDATE plans SET subject_id=? WHERE key=?').run('math-fixture','Fixture Student|Mathematics');
 sqlite.prepare('INSERT INTO classrooms(id,group_id,title,subject,subject_id,syllabus_id,teacher_name,created_at,updated_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)').run('fixture-stat-class',groups.a,'Statistics fixture','Mathematics','math-fixture','spm','Fixture Teacher',now,now,'chief-a');
 sqlite.prepare('INSERT INTO class_sessions(id,group_id,session_type,classroom_id,teacher_name,subject,planned_start,planned_end,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('fixture-stat-session',groups.a,'one_to_one','fixture-stat-class','Fixture Teacher','Former mathematics label','2030-01-04T02:00:00.000Z','2030-01-04T03:30:00.000Z','chief-a',now,now);
 sqlite.prepare('UPDATE lessons SET subject=?,session_id=? WHERE id=?').run('Former mathematics label','fixture-stat-session','fixture-private-lesson');
 grant(['statistics.view']);const data=await ok('state',undefined,'?scope=core&month=2030-01');assert.equal(data.summary[0].completed,1.5);assert.deepEqual(data.lessons,[]);assert.deepEqual(data.classSessions,[]);
 sqlite.prepare('UPDATE lessons SET subject=?,session_id=NULL WHERE id=?').run('Mathematics','fixture-private-lesson');
});
await section('term-only settings survive the compatible full-state response',async()=>{
 sqlite.prepare('INSERT INTO academic_terms(id,group_id,name,is_current,created_at) VALUES(?,?,?,1,?)').run('fixture-term',groups.a,'Fixture term',now);
 grant(['terms.view']);const data=await ok('state');assert(data.terms.some(term=>term.id==='fixture-term'));assert.deepEqual(data.classrooms,[]);assert.deepEqual(data.allStudents,[]);
});
await section('activity access does not disclose unrelated profile snapshots',async()=>{
 grant(['audit.view']);const data=await ok('state',undefined,'?scope=activity');const item=data.activity.find(row=>row.id==='fixture-private-audit');assert(item);assert.deepEqual(item.beforeSummary,[]);assert.deepEqual(item.afterSummary,[]);assert.equal(item.lessonName,'fixture-private-lesson');assert(!JSON.stringify(data).includes('PROFILE_PRIVATE_NOTE'));
 grant(['audit.view','students.view']);const full=await ok('state',undefined,'?scope=activity');assert(full.activity.find(row=>row.id==='fixture-private-audit').afterSummary.some(field=>field.field==='name'&&field.value==='PROFILE_PRIVATE_NOTE'));assert(!JSON.stringify(full).includes('UNKNOWN_PRIVATE_NOTE'));
 grant(['audit.view','plans.view','lessons.view']);const limited=await ok('state',undefined,'?scope=activity');const plan=limited.activity.find(row=>row.id==='fixture-plan-audit').afterSummary,lesson=limited.activity.find(row=>row.id==='fixture-lesson-audit').beforeSummary;assert(!plan.some(field=>field.field==='age'));assert(plan.some(field=>field.field==='teacherName'&&field.value==='Fixture Teacher'));assert(!lesson.some(field=>field.field==='note'||field.field==='actualStart'));assert(lesson.some(field=>field.field==='plannedStart'&&field.value==='2030-01-04T02:00:00.000Z'));
});
await section('live read guards reject a grant revoked after request preflight',async()=>{
 grant(['students.view']);beforeStateRead=()=>grant([]);const result=await call('state',undefined,'?scope=core');assert.equal(result.status,403);assert.equal(result.data.allStudents,undefined);beforeStateRead=null;
});
await section('auth and revision expose only the current actor permission metadata',async()=>{
 grant(['accounts.view']);let authData=await ok('auth');assert.deepEqual(authData.account.adminPermissions.grants,['accounts.view']);assert.equal(authData.account.adminPermissions.privileged,false);
 let revision=await ok('revision');assert.deepEqual(revision.adminPermissions.grants,['accounts.view']);grant([]);revision=await ok('revision');assert.deepEqual(revision.adminPermissions.grants,[]);
});
await section('malformed and incomplete stored profiles deny both SQL and context access',async()=>{
 for(const value of ['["students.view","students.view"]','["lessons.edit","lessons.edit"]','["students.view","lessons.edit"]','["students.view","future.view"]']){
  sqlite.prepare('UPDATE admin_permission_profiles SET grants_json=? WHERE account_id=?').run(value,'admin-a');const data=await ok('state',undefined,'?scope=core');assert.deepEqual(data.account.adminPermissions.grants,[]);assert.deepEqual(data.allStudents,[]);assert.equal(await access.hasAdminPermission((await auth.currentBusinessAccount()),'students.view'),false);
 }
 grant([]);
});
await section('fee viewing supplies minimal student selectors without roster or write access',async()=>{
 await login('admin-a');grant(['fees.view']);const data=await ok('state',undefined,'?scope=core');assert(data.students.includes('Fixture Student'));assert.deepEqual(data.allStudents,[]);assert.deepEqual(data.allTeachers,[]);assert.deepEqual(data.allPlans,[]);assert.equal(JSON.stringify(data.studentOptions).includes('age'),false);assert.equal((await call('billing',undefined,'?month=2030-01')).status,200);assert.equal((await call('billing',{action:'savePolicy'})).status,403);
 grant([]);assert.equal((await call('billing',undefined,'?month=2030-01')).status,403);
});
await section('chief and selected-group Owner retain platform ceilings and tenant scope',async()=>{
 await login('chief-a');let data=await ok('state',undefined,'?scope=core');assert.equal(data.account.adminPermissions.privileged,true);assert.equal(data.allStudents.length,1);assert.equal((await call('billing',undefined,'?month=2030-01')).status,200);
 await login('owner',groups.a);data=await ok('state',undefined,'?scope=core');assert.equal(data.account.adminPermissions.privileged,true);assert.equal(data.allStudents.length,1);
 await login('admin-b',groups.b);const own=await ok('state',undefined,'?scope=core');assert.equal(own.allStudents.length,0);assert(!JSON.stringify(own).includes('Fixture Student'));
});
await section('teacher/student workflows and default preparation remain compatible',async()=>{
 await login('teacher-a');let data=await ok('state',undefined,'?scope=core');assert.equal(data.account.adminPermissions,undefined);assert(data.lessons.length===1);
 await login('student-a');data=await ok('state',undefined,'?scope=core');assert.equal(data.lessons[0].note,undefined);assert.equal(data.account.adminPermissions,undefined);
 runtime.env.ADMIN_PERMISSIONS_MODE=undefined;await login('admin-a');grant([]);data=await ok('state',undefined,'?scope=core');assert.equal(data.account.adminPermissions.enforced,false);assert.equal(data.allStudents.length,1);
});
} finally {globalThis.fetch=originalFetch;hooks.deregister();sqlite.close();}
const failed=results.filter(result=>result.status!=='passed');
console.log(JSON.stringify({suite:'admin-permissions-state',sections:results.length,failed:failed.length,productionWrites:false,actualAuthentication:true}));
writeFileSync(new URL('state-results.json',resultDirectory),JSON.stringify({results,productionWrites:false},null,2));
if(failed.length)process.exitCode=1;

