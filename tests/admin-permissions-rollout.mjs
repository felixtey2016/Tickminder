import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {drizzle} from 'drizzle-orm/d1';
import ts from 'typescript';

// Real migrations, SQLite transactions, password hashes, authentication, and
// route handlers. All identities are fictional; no hosted binding is present.
const resultDirectory=new URL('../../../work/part03-permissions-round3/',import.meta.url);
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

let beforeBatch=null,beforeAuditRead=null,beforeDataRead=null,authorityReadsBeforeAudit=0,maximumBindParams=0;
function statement(sql,values=[]){
  maximumBindParams=Math.max(maximumBindParams,values.length);assert(values.length<=100,`D1 bound parameter limit exceeded: ${values.length}`);
  const execute=arrays=>{
    if(beforeDataRead){const hook=beforeDataRead;if(hook(sql))beforeDataRead=null;}
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
  finally{beforeBatch=null;beforeAuditRead=null;beforeDataRead=null;}
}
const canonical=values=>[...values].sort();
const contains=(values,key)=>assert.ok(values.includes(key),'Expected '+key);
function pendingState(data){assert.equal(data.rollout,'preparation');assert.equal(data.status,'pending');assert.equal(data.runtimeEnforcement,false);assert.equal(data.currentAccess,'legacy');assert.deepEqual(data.effectiveGrants,permission.LEGACY_ADMIN_GRANTS);}
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('Network access is forbidden in this isolated suite');};


function grant(id,keys){const normalized=permission.normalizeAdminGrants(keys);sqlite.prepare('UPDATE admin_permission_profiles SET grants_json=?,draft_grants_json=NULL WHERE account_id=?').run(JSON.stringify(normalized),id);return normalized;}
const accountId='admin-a',businessTables=tableNames().filter(name=>!['accounts','sessions','local_credentials','admin_permission_profiles','tuition_groups'].includes(name)),businessSnapshot=()=>snapshotTables(businessTables);
const objects=new Map();let putHook=null,getHook=null;
runtime.env.BUCKET={put:async(key,bytes)=>{objects.set(key,Buffer.from(bytes));if(putHook){const f=putHook;putHook=null;await f();}},get:async key=>{if(getHook){const f=getHook;getHook=null;await f();}return objects.has(key)?{body:objects.get(key),size:objects.get(key).length}:null;},head:async key=>objects.has(key)?{size:objects.get(key).length}:null,delete:async key=>objects.delete(key)};
runtime.env.PDF_TOTAL_STORAGE_LIMIT_BYTES='100000000';
for(const name of ['quizzes','quiz-images','quiz-practice'])routes[name]=await load('app/api/'+name+'/route.ts');
const pdfRoute=await load('app/api/files/route.ts'),pdfReadRoute=await load('app/api/files/[id]/route.ts'),quiz=await load('lib/quiz.ts');
const changedAccounts=()=>{sqlite.prepare('UPDATE accounts SET disabled_at=NULL,role=\'admin\',group_id=? WHERE id=?').run(groups.a,accountId);sqlite.prepare('UPDATE local_credentials SET must_change_password=0 WHERE account_id=?').run(accountId);sqlite.prepare('UPDATE tuition_groups SET active=1 WHERE id=?').run(groups.a);};
let network=[];
try {
await section('bulk deletion revocation prevents both records and success audits',async()=>{
 grant(accountId,['teachers.delete']);await login(accountId);
 for(const name of ['Rollout bulk one','Rollout bulk two'])sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(groups.a,name,now);
 const entries=['Rollout bulk one','Rollout bulk two'].map(id=>({kind:'teacher',id}));
 const preview=await ok('manage',{action:'previewDelete',entries});assert.equal(preview.items.length,2);
 const before=businessSnapshot();beforeBatch=()=>grant(accountId,[]);
 await denied('manage',{action:'permanentDelete',confirm:true,entries,previewAt:preview.previewAt,fingerprint:preview.fingerprint},'',[403]);assert.equal(businessSnapshot(),before);
});
await section('late fault in bulk deletion rolls back every earlier delete',async()=>{
 grant(accountId,['teachers.delete']);await login(accountId);const entries=['Rollout bulk one','Rollout bulk two'].map(id=>({kind:'teacher',id})),preview=await ok('manage',{action:'previewDelete',entries});
 sqlite.exec("CREATE TRIGGER rollout_bulk_failure BEFORE DELETE ON teachers WHEN OLD.name='Rollout bulk two' BEGIN SELECT RAISE(ABORT,'fixture late bulk fault'); END");
 const before=businessSnapshot();await denied('manage',{action:'permanentDelete',confirm:true,entries,previewAt:preview.previewAt,fingerprint:preview.fingerprint},'',[503]);assert.equal(businessSnapshot(),before);sqlite.exec('DROP TRIGGER rollout_bulk_failure');
});
for(const [label,change] of [
 ['account disabled',()=>sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,accountId)],
 ['role changed',()=>sqlite.prepare("UPDATE accounts SET role='teacher' WHERE id=?").run(accountId)],
 ['group deactivated',()=>sqlite.prepare('UPDATE tuition_groups SET active=0 WHERE id=?').run(groups.a)],
 ['initial password reset',()=>sqlite.prepare('UPDATE local_credentials SET must_change_password=1 WHERE account_id=?').run(accountId)],
 ['current session expired',()=>sqlite.prepare("UPDATE sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE account_id=?").run(accountId)],
 ['current session revoked',()=>sqlite.prepare('DELETE FROM sessions WHERE account_id=?').run(accountId)],
 ['password change revokes old sessions',()=>{sqlite.prepare('UPDATE local_credentials SET password_hash=?,updated_at=? WHERE account_id=?').run(passwordHash,new Date(Date.now()+1000).toISOString(),accountId);sqlite.prepare('DELETE FROM sessions WHERE account_id=?').run(accountId);}]
 ])await section('authenticated in-flight write rejects '+label,async()=>{
  changedAccounts();grant(accountId,['teachers.create']);await login(accountId);const before=businessSnapshot(),name='Blocked '+label;beforeBatch=change;
  await denied('action',{action:'saveTeacher',name},'',[403]);assert.equal(businessSnapshot(),before);changedAccounts();
 });
await section('request account carries no enumerable session credential',async()=>{
 changedAccounts();grant(accountId,['students.view']);await login(accountId);const current=await auth.currentBusinessAccount(),token=cookieValues.tuition_session,hash=await auth.hashToken(token);
 assert(!JSON.stringify(current).includes(token));assert(!JSON.stringify(current).includes(hash));const data=await ok('state',undefined,'?scope=core');assert(!JSON.stringify(data).includes(token));assert(!JSON.stringify(data).includes(hash));
});
await section('ordinary administrator cannot select a foreign group by header',async()=>{
 changedAccounts();grant(accountId,['teachers.create']);await login(accountId,groups.b);const before=businessSnapshot();await denied('action',{action:'saveTeacher',name:'Foreign header leak'},'',[401,403]);assert.equal(businessSnapshot(),before);
});
await section('selected-group Owner writes stay in the request group after cookie change',async()=>{
 await login('owner',groups.a);const id='Owner group-bound teacher';beforeBatch=()=>{cookieValues.tickminder_group=groups.b;requestHeaders=new Headers({'x-tickminder-group':groups.b});};await ok('action',{action:'saveTeacher',name:id});
 assert(sqlite.prepare('SELECT 1 FROM teachers WHERE group_id=? AND name=?').get(groups.a,id));assert.equal(sqlite.prepare('SELECT 1 FROM teachers WHERE group_id=? AND name=?').get(groups.b,id),undefined);
});
await section('account group cannot be changed beneath a current request',async()=>{
 changedAccounts();grant(accountId,['students.view']);await login(accountId);const before=businessSnapshot();assert.throws(()=>sqlite.prepare('UPDATE accounts SET group_id=? WHERE id=?').run(groups.b,accountId),/Account group is immutable/);assert.equal(businessSnapshot(),before);assert.equal(sqlite.prepare('SELECT group_id AS id FROM accounts WHERE id=?').get(accountId).id,groups.a);
});
await section('live state read rejects revoked session after authentication',async()=>{
 changedAccounts();grant(accountId,['students.view']);await login(accountId);beforeDataRead=sql=>{if(!/FROM\s+"?students"?/i.test(sql))return false;sqlite.prepare('DELETE FROM sessions WHERE account_id=?').run(accountId);return true;};
 const r=await call('state',undefined,'?scope=core');assert.equal(r.status,403);assert.equal(r.data.allStudents,undefined);
});
const classId=crypto.randomUUID(),homeworkId=crypto.randomUUID(),uploadTeacher='teacher-a',uploadStudent='student-a',png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD+0AAAAASUVORK5CYII=','base64'),pdf=Buffer.from('%PDF-1.7\nRollout fixture\nstartxref\n0\n%%EOF');
sqlite.prepare('INSERT INTO plans(group_id,key,student,subject,teacher_name,duration,created_at) VALUES(?,?,?,?,?,1,?)').run(groups.a,'Fixture Student|Mathematics','Fixture Student','Mathematics','Fixture Teacher',now);
sqlite.prepare('INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(classId,groups.a,'Upload fixture','Mathematics','Fixture Teacher',uploadTeacher,now,now);
sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),groups.a,classId,'Fixture Student',now);
sqlite.prepare('INSERT INTO homework(id,group_id,owner_id,title,subject,description,starts_at,due_at,created_at,classroom_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(homeworkId,groups.a,uploadTeacher,'Upload fixture homework','Mathematics','Practice','2000-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z',now,classId);
sqlite.prepare('INSERT INTO homework_recipients(id,group_id,homework_id,student_name) VALUES(?,?,?,?)').run(crypto.randomUUID(),groups.a,homeworkId,'Fixture Student');
async function uploadPdf(id,kind='material'){await login(id);const form=new FormData();form.set('kind',kind);form.set('classroomId',classId);if(kind==='submission')form.set('homeworkId',homeworkId);form.set('file',new File([pdf],'fixture.pdf',{type:'application/pdf'}));const response=await pdfRoute.POST(new Request('https://test.invalid/api/files',{method:'POST',headers:{origin:'https://test.invalid'},body:form}));return {status:response.status,data:await response.json()};}
const fileState=()=>({files:sqlite.prepare('SELECT count(*) AS n FROM pdf_files').get().n,objects:objects.size,quota:sqlite.prepare('SELECT coalesce(sum(used_bytes),0) AS n FROM storage_quota').get().n});
await section('teacher PDF upload revoked after R2 write removes file and exact quota',async()=>{
 const before=fileState();putHook=()=>sqlite.prepare('DELETE FROM sessions WHERE account_id=?').run(uploadTeacher);const result=await uploadPdf(uploadTeacher);assert.equal(result.status,403,JSON.stringify(result));assert.deepEqual(fileState(),before);
});
await section('student PDF upload rejects a session revoked after R2 write',async()=>{
 const before=fileState();putHook=()=>sqlite.prepare('DELETE FROM sessions WHERE account_id=?').run(uploadStudent);const result=await uploadPdf(uploadStudent,'submission');assert.equal(result.status,403,JSON.stringify(result));assert.deepEqual(fileState(),before);
});
async function uploadImage(id,bytes=png){await login(id);const form=new FormData();form.set('file',new File([bytes],'fixture.png',{type:'image/png'}));const response=await routes['quiz-images'].POST(new Request('https://test.invalid/api/quiz-images',{method:'POST',headers:{origin:'https://test.invalid'},body:form}));return {status:response.status,data:await response.json()};}
const imageState=()=>({rows:sqlite.prepare('SELECT count(*) AS n FROM quiz_images').get().n,objects:objects.size,bytes:sqlite.prepare('SELECT coalesce(sum(bytes),0) AS n FROM quiz_images').get().n});
await section('Quiz image grant revoked after upload releases only its unused reservation',async()=>{
 changedAccounts();grant(accountId,['quizzes.import']);const before=imageState();putHook=()=>grant(accountId,[]);const result=await uploadImage(accountId);assert.equal(result.status,403,JSON.stringify(result));assert.deepEqual(imageState(),before);
});
await section('session-only image revocation preserves a reservation reusable by another session',async()=>{
 changedAccounts();grant(accountId,['quizzes.import']);const before=imageState();putHook=()=>sqlite.prepare('DELETE FROM sessions WHERE account_id=?').run(accountId);const denied=await uploadImage(accountId);assert.equal(denied.status,403,JSON.stringify(denied));const reserved=imageState();assert.equal(reserved.rows,before.rows+1);assert.equal(reserved.bytes,before.bytes+png.length);const result=await uploadImage(accountId);assert.equal(result.status,200,JSON.stringify(result));assert.deepEqual(imageState(),reserved);assert.equal(sqlite.prepare('SELECT status FROM quiz_images WHERE id=?').get(result.data.id).status,'ready');
});
await section('failed late upload cannot remove a concurrently ready image reservation',async()=>{
 changedAccounts();grant(accountId,['quizzes.import']);const bytes=Buffer.from(png);bytes[bytes.length-1]^=1;let published;
 putHook=()=>{const row=sqlite.prepare("SELECT id FROM quiz_images WHERE owner_id=? AND status='uploading' ORDER BY created_at DESC LIMIT 1").get(accountId);published=row.id;sqlite.prepare("UPDATE quiz_images SET status='ready' WHERE id=?").run(row.id);grant(accountId,[]);};const result=await uploadImage(accountId,bytes);assert.equal(result.status,403,JSON.stringify(result));assert.equal(sqlite.prepare('SELECT status FROM quiz_images WHERE id=?').get(published).status,'ready');assert(objects.has(sqlite.prepare('SELECT object_key AS key FROM quiz_images WHERE id=?').get(published).key));
});
await section('cross-group admin cannot dispatch to the default organisation Sheet',async()=>{
 runtime.env.SHEET_SYNC_URL='https://script.google.com/macros/s/fictional-rollout/exec';runtime.env.SHEET_SYNC_SECRET='fixture-only-secret';
 network=[];globalThis.fetch=async(url,options)=>{network.push(JSON.parse(JSON.parse(options.body).body));return Response.json({ok:true,month:'2026-10',displayMonth:'October 2026',changes:[]});};
 grant('admin-b',['sheetSync.commit']);await login('admin-b',groups.b);await denied('sheet-sync',{action:'preview',mode:'billable'},'',[503]);assert.equal(network.length,0);
});
await section('Sheet preflight revocation sends neither private pairs nor a commit',async()=>{
 network=[];globalThis.fetch=async(url,options)=>{const body=JSON.parse(JSON.parse(options.body).body);network.push(body);grant(accountId,[]);return Response.json({ok:true,month:'2026-10',displayMonth:'October 2026',changes:[]});};
 changedAccounts();grant(accountId,['sheetSync.commit']);await login(accountId);await denied('sheet-sync',{action:'commit',mode:'billable',month:'2026-10',previewToken:'fixture-preview'},'',[403]);assert.deepEqual(network.map(x=>x.action),['month']);assert.equal(network[0].pairs,undefined);
});
await section('Sheet checks live authority immediately before final external dispatch',async()=>{
 network=[];let signCalls=0;const sign=crypto.subtle.sign.bind(crypto.subtle);
 crypto.subtle.sign=async(...args)=>{const result=await sign(...args);if(++signCalls===2)grant(accountId,[]);return result;};
 globalThis.fetch=async(url,options)=>{const body=JSON.parse(JSON.parse(options.body).body);network.push(body);return Response.json({ok:true,month:'2026-10',displayMonth:'October 2026',changes:[]});};
 changedAccounts();grant(accountId,['sheetSync.commit']);await login(accountId);try{await denied('sheet-sync',{action:'commit',mode:'billable',month:'2026-10',previewToken:'fixture-preview'},'',[403]);assert.deepEqual(network.map(x=>x.action),['month']);}finally{crypto.subtle.sign=sign;}
});
await section('an already dispatched Sheet commit reports its acknowledgement honestly',async()=>{
 network=[];globalThis.fetch=async(url,options)=>{const body=JSON.parse(JSON.parse(options.body).body);network.push(body);if(body.action==='commit')grant(accountId,[]);return Response.json({ok:true,month:'2026-10',displayMonth:'October 2026',changes:[],written:body.action==='commit'?1:0});};
 changedAccounts();grant(accountId,['sheetSync.commit']);await login(accountId);const result=await ok('sheet-sync',{action:'commit',mode:'billable',month:'2026-10',previewToken:'fixture-preview'});assert.equal(result.written,1);assert.deepEqual(network.map(x=>x.action),['month','commit']);
});
}finally{
 globalThis.fetch=originalFetch;hooks.deregister();delete globalThis.__adminPermissions;
 const summary={suite:'admin-permissions-rollout',productionWrites:false,networkRequests:0,maximumBindParams,sections:results.length,passed:results.filter(x=>x.status==='passed').length,failed:results.filter(x=>x.status==='failed').length,results};
 record(JSON.stringify({...summary,results:undefined}));writeFileSync(new URL('rollout-results.json',resultDirectory),JSON.stringify(summary,null,2)+'\n');writeFileSync(new URL('rollout-results.log',resultDirectory),log.join('\n')+'\n');sqlite.close();if(summary.failed)process.exitCode=1;
}
