import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {drizzle} from 'drizzle-orm/d1';
import ts from 'typescript';

// Real identity resolution, password hashes, route handlers and SQLite SQL.
// Only Workers/Next bindings and Google's certificate HTTP transport are local.
// Every fixture is fictional; this suite cannot reach a hosted database.
const sqlite=new DatabaseSync(':memory:');
const fixtureOwnerEmail='hierarchy-owner@example.test';
const configuredOwnerEmail=readFileSync(new URL('../lib/owner.ts',import.meta.url),'utf8').match(/export const OWNER_EMAIL\s*=\s*"([^"]+)";/)?.[1];
assert(configuredOwnerEmail,'Owner constant required for isolated identity fixture');
for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()){
  sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8').replaceAll(configuredOwnerEmail,fixtureOwnerEmail));
}
let beforeBatch=null;
function statement(sql,values=[]){
  const execute=arrays=>{const s=sqlite.prepare(sql);if(arrays)s.setReturnArrays(true);return s.columns().length?{results:s.all(...values),meta:{changes:0}}:{results:[],meta:s.run(...values)};};
  return {bind:(...v)=>statement(sql,v),first:async()=>execute(false).results[0]||null,all:async()=>execute(false),raw:async()=>execute(true).results,run:async()=>execute(false),execute:()=>execute(false)};
}
const d1={prepare:statement,async batch(items){
  const hook=beforeBatch;beforeBatch=null;if(hook)await hook();
  sqlite.exec('BEGIN');try{const result=items.map(s=>s.execute());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}
}};
let cookieValues={},requestHeaders=new Headers();
class JsonResponse extends Response{static json(data,options){const response=new JsonResponse(JSON.stringify(data),{...options,headers:{'content-type':'application/json',...options?.headers}});response.cookies={set:(name,value)=>cookieValues[name]=value,delete:name=>delete cookieValues[name]};return response;}}
const runtime={env:{DB:d1,GOOGLE_CLIENT_ID:'hierarchy-fixture-client'},cookies:async()=>({get:name=>cookieValues[name]?{value:cookieValues[name]}:undefined}),headers:async()=>requestHeaders,NextResponse:JsonResponse,getDb:()=>drizzle(d1)};
globalThis.__adminHierarchy=runtime;
const stub='data:text/javascript;base64,'+Buffer.from('export const {env,cookies,headers,NextResponse,getDb}=globalThis.__adminHierarchy;').toString('base64');
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
const routes={};for(const name of ['auth','action','groups','manage','password','account-link','state','billing'])routes[name]=await load('app/api/'+name+'/route.ts');
const now=new Date().toISOString(),password='Fictional-initial-password-123',changedPassword='Fictional-changed-password-456',passwordHash=await pw.hashPassword(password);
const groups={a:'next-genn-edu',b:'hierarchy-b',empty:'hierarchy-empty',race:'hierarchy-race'};
for(const id of Object.values(groups).filter(id=>id!==groups.a))sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,id,now,now);
function account(id,role='admin',groupId=groups.a,options={}){
  const email=options.email??'',teacherName=options.teacherName??null,studentName=options.studentName??null;
  sqlite.prepare('INSERT INTO accounts(group_id,id,email,name,role,teacher_name,student_name,created_at,name_confirmed_at,activated_at,disabled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(groupId,id,email,id,role,teacherName,studentName,now,now,role==='pending'?null:now,options.disabled?now:null);
  if(options.local!==false)sqlite.prepare('INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES(?,?,?,?,?)').run(id,options.username??id,passwordHash,options.temporary?1:0,now);
  if(options.google)sqlite.prepare('INSERT INTO google_identities(subject,account_id,email,linked_at) VALUES(?,?,?,?)').run(options.google,id,email,now);
}
account('owner','admin',null,{email:fixtureOwnerEmail,google:'fixture-owner-google'});
for(const [id,group]of [['chief-a',groups.a],['admin-a',groups.a],['admin-peer',groups.a],['admin-disabled',groups.a],['chief-b',groups.b],['admin-b',groups.b],['race-chief',groups.race],['race-admin',groups.race],['race-other',groups.race]])account(id,'admin',group,{disabled:id==='admin-disabled'});
account('teacher-a','teacher',groups.a,{teacherName:'Fixture Teacher'});account('student-a','student',groups.a,{studentName:'Fixture Student'});account('pending-a','pending');
account('google-only-admin','admin',groups.a,{local:false,email:'google-only@example.test',google:'google-only-subject'});
account('local:owner-impostor','admin',groups.a,{email:fixtureOwnerEmail});
for(const group of Object.values(groups)){
  sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(group,'Fixture Teacher',now);
  sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(group,'Unused Teacher',now);
  sqlite.prepare('INSERT INTO students(group_id,name,name_key,created_at,grade) VALUES(?,?,?,?,?)').run(group,'Fixture Student','fixturestudent',now,'Form 3');
  sqlite.prepare('INSERT INTO students(group_id,name,name_key,created_at,grade) VALUES(?,?,?,?,?)').run(group,'Unused Student','unusedstudent',now,'Form 3');
}
sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('chief-a',groups.a);
sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('race-chief',groups.race);
async function addSession(id){const token='fixture-session-'+crypto.randomUUID();sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run(await auth.hashToken(token),id,new Date(Date.now()+86400000).toISOString());return token;}
async function login(id,groupHeader){cookieValues.tuition_session=await addSession(id);requestHeaders=new Headers(groupHeader?{'x-tickminder-group':groupHeader}:{});return cookieValues.tuition_session;}
function request(name,body,query=''){return new Request('https://test.invalid/api/'+name+query,body===undefined?{}:{method:'POST',headers:{origin:'https://test.invalid','content-type':'application/json'},body:JSON.stringify(body)});}
async function call(name,body,query=''){const response=await routes[name][body===undefined?'GET':'POST'](request(name,body,query));return {status:response.status,data:await response.json()};}
const ok=async(name,body,query)=>{const result=await call(name,body,query);assert.equal(result.status,200,JSON.stringify({name,...result}));return result.data;};
const denied=async(name,body,statuses=[400,401,403,404,409])=>{const result=await call(name,body);assert.ok(statuses.includes(result.status),JSON.stringify({name,...result}));return result;};
const row=id=>sqlite.prepare('SELECT * FROM accounts WHERE id=?').get(id);
const sessionCount=id=>sqlite.prepare('SELECT count(*) n FROM sessions WHERE account_id=?').get(id).n;
const auditCount=()=>sqlite.prepare('SELECT count(*) n FROM audit').get().n;
const chief=group=>sqlite.prepare('SELECT chief_admin_id FROM tuition_groups WHERE id=?').get(group).chief_admin_id;
function snapshot(){return JSON.stringify(['accounts','local_credentials','google_identities','sessions','audit','tuition_groups','assignments','study_blocks'].map(table=>[table,sqlite.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()]));}
async function unchanged(label,operation){const before=snapshot();const result=await operation();assert.equal(snapshot(),before,label+': rejected operation has no partial mutation or success audit');return result;}
let sections=0;
async function section(name,operation){await operation();sections++;console.log('PASS '+name);}
const originalFetch=globalThis.fetch;
const key=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',key.publicKey);
globalThis.fetch=async url=>{assert.equal(String(url),'https://www.googleapis.com/oauth2/v3/certs','only fictional Google certificate transport is permitted');return Response.json({keys:[{...jwk,kid:'hierarchy-fixture-key'}]},{headers:{'cache-control':'public, max-age=3600'}});};
async function googleCredential(subject,email){const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');const header=encode({alg:'RS256',kid:'hierarchy-fixture-key'}),payload=encode({sub:subject,email,name:'Fictional Google administrator',aud:runtime.env.GOOGLE_CLIENT_ID,iss:'https://accounts.google.com',email_verified:true,exp:Math.floor(Date.now()/1000)+600}),input=header+'.'+payload;return input+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key.privateKey,new TextEncoder().encode(input))).toString('base64url');}

try{
await section('identity flags and administrator scope',async()=>{
  await login('admin-a');let data=await ok('auth');assert.equal(data.account.isGroupChief,false);assert.equal(data.account.canManageAdministrators,false);
  await login('chief-a');data=await ok('auth');assert.equal(data.account.isGroupChief,true);assert.equal(data.account.canManageAdministrators,true);assert.equal(data.account.isOwner,false);
  await login('owner',groups.a);data=await ok('auth');assert.equal(data.account.isGroupChief,false);assert.equal(data.account.canManageAdministrators,true);assert.equal(data.account.isOwner,true);
  for(const id of ['admin-a','chief-a','owner']){
    await login(id,id==='owner'?groups.a:undefined);const identity=(await ok('auth')).account,core=(await ok('state',undefined,'?scope=core')).account;
    for(const field of ['isOwner','isGroupChief','canManageAdministrators'])assert.equal(core[field],identity[field],'core refresh preserves '+field+' for '+id);
  }
  await login('chief-a');const directory=await ok('state',undefined,'?scope=accounts');
  assert.equal(directory.users.find(user=>user.id==='chief-a').isGroupChief,true);assert.equal(directory.users.find(user=>user.id==='admin-a').isGroupChief,false);
  assert.equal(directory.users.find(user=>user.id==='local:owner-impostor').isOwner,false,'directory uses the real Owner algorithm, including local identity exclusion');assert.ok(directory.users.every(user=>user.groupId===groups.a),'account authority tags stay within the selected group');
  await login('local:owner-impostor');data=await ok('auth');assert.equal(data.account.isOwner,false);assert.equal(data.account.canManageAdministrators,false);
  await login('chief-a',groups.b);assert.equal(await auth.currentBusinessAccount(),null);await unchanged('spoofed group header',()=>denied('action',{action:'createLocalAccount',username:'spoofed-admin',password,name:'Spoofed',role:'admin'}));
});

await section('Owner bootstrap, required expectation and chief CAS',async()=>{
  await login('owner',groups.a);
  await unchanged('missing CAS expectation',()=>denied('groups',{action:'setChief',id:groups.b,chiefAdminId:'chief-b'},[400]));
  await unchanged('foreign bootstrap target',()=>denied('groups',{action:'setChief',id:groups.b,chiefAdminId:'admin-a',expectedChiefAdminId:null}));
  await unchanged('teacher bootstrap target',()=>denied('groups',{action:'setChief',id:groups.a,chiefAdminId:'teacher-a',expectedChiefAdminId:'chief-a'}));
  await unchanged('disabled bootstrap target',()=>denied('groups',{action:'setChief',id:groups.a,chiefAdminId:'admin-disabled',expectedChiefAdminId:'chief-a'}));
  await unchanged('Owner cannot become group chief',()=>denied('groups',{action:'setChief',id:groups.a,chiefAdminId:'owner',expectedChiefAdminId:'chief-a'}));
  const audits=auditCount();await ok('groups',{action:'setChief',id:groups.b,chiefAdminId:'chief-b',expectedChiefAdminId:null});assert.equal(chief(groups.b),'chief-b');assert.equal(auditCount(),audits+1);
  await unchanged('same chief assignment is idempotent',()=>ok('groups',{action:'setChief',id:groups.b,chiefAdminId:'chief-b',expectedChiefAdminId:'chief-b'}));
  await unchanged('stale CAS expectation',()=>denied('groups',{action:'setChief',id:groups.b,chiefAdminId:'admin-b',expectedChiefAdminId:null},[409]));
  await unchanged('configured chief cannot be cleared',()=>denied('groups',{action:'setChief',id:groups.b,chiefAdminId:null,expectedChiefAdminId:'chief-b'}));
  for(const id of ['admin-a','chief-a']){await login(id);await unchanged('only Owner assigns chief '+id,()=>denied('groups',{action:'setChief',id:groups.a,chiefAdminId:'admin-a',expectedChiefAdminId:'chief-a'},[403]));}
  await login('owner',groups.empty);assert.equal(chief(groups.empty),null);
  await ok('action',{action:'createLocalAccount',username:'empty-group-bootstrap',password,name:'Bootstrap admin',role:'admin'});
  const bootstrap=sqlite.prepare('SELECT account_id FROM local_credentials WHERE username=?').get('empty-group-bootstrap').account_id;assert.equal(row(bootstrap).group_id,groups.empty);
  await ok('groups',{action:'setChief',id:groups.empty,chiefAdminId:bootstrap,expectedChiefAdminId:null});assert.equal(chief(groups.empty),bootstrap);
});

await section('ordinary administrators cannot create or take over administrators',async()=>{
  await login('admin-a');
  for(const body of [
    {action:'createLocalAccount',username:'ordinary-forbidden-admin',password,name:'Forbidden',role:'admin'},
    {action:'bind',userId:'pending-a',role:'admin'},
    {action:'bind',userId:'admin-disabled',role:'admin'},
    {action:'bind',userId:'admin-peer',role:'teacher',teacherName:'Unused Teacher'},
    {action:'bind',userId:'admin-a',role:'teacher',teacherName:'Unused Teacher'},
    {action:'bind',userId:'chief-a',role:'teacher',teacherName:'Unused Teacher'},
    {action:'resetLocalPassword',userId:'chief-a',password:changedPassword},
    {action:'resetLocalPassword',userId:'admin-peer',password:changedPassword},
    {action:'resetLocalPassword',userId:'admin-disabled',password:changedPassword},
    {action:'deleteAccount',userId:'chief-a'},
    {action:'deleteAccount',userId:'admin-peer'},
    {action:'deleteAccount',userId:'admin-disabled'},
    {action:'restoreAccount',userId:'admin-disabled'},
  ])await unchanged('ordinary administrator '+body.action,()=>denied('action',body));
  for(const id of ['chief-a','admin-peer','admin-disabled'])await unchanged('ordinary permanent administrator deletion',()=>denied('manage',{kind:'account',id,confirm:true},[403]));
  const preview=await ok('manage',{action:'previewDelete',entries:[{kind:'account',id:'admin-disabled'}]});assert.equal(preview.items.length,0);assert.equal(preview.blocked.length,1);
  // Ordinary administrators keep existing teacher/student administration.
  await ok('action',{action:'createLocalAccount',username:'ordinary-teacher',password,name:'Teacher from ordinary admin',role:'teacher',teacherName:'Unused Teacher'});
  const teacher=sqlite.prepare('SELECT account_id FROM local_credentials WHERE username=?').get('ordinary-teacher').account_id;
  await ok('action',{action:'resetLocalPassword',userId:teacher,password:changedPassword});await ok('action',{action:'deleteAccount',userId:teacher});await ok('action',{action:'restoreAccount',userId:teacher});assert.equal(row(teacher).disabled_at,null);
  await ok('action',{action:'saveTeacher',name:'Preserved Ordinary Business',active:true});assert.ok(sqlite.prepare('SELECT name FROM teachers WHERE group_id=? AND name=?').get(groups.a,'Preserved Ordinary Business'));
});

await section('chief administrator lifecycle and global credential identity',async()=>{
  await login('chief-a');
  await unchanged('cross-group administrator reset',()=>denied('action',{action:'resetLocalPassword',userId:'admin-b',password:changedPassword}));
  await unchanged('cross-group administrator disable',()=>denied('action',{action:'deleteAccount',userId:'admin-b'}));
  await unchanged('cross-group administrator delete',()=>denied('manage',{kind:'account',id:'admin-b',confirm:true}));
  await unchanged('global duplicate username',()=>denied('action',{action:'createLocalAccount',username:'ADMIN-B',password,name:'Duplicate elsewhere',role:'admin'}));
  await unchanged('Google account has no local password to reset',()=>denied('action',{action:'resetLocalPassword',userId:'google-only-admin',password:changedPassword}));
  await addSession('admin-peer');await ok('action',{action:'resetLocalPassword',userId:'admin-peer',password:changedPassword});assert.equal(sessionCount('admin-peer'),0);
  await ok('action',{action:'createLocalAccount',username:'  NEW.GROUP.ADMIN  ',password,name:'New group administrator',role:'admin',teacherName:'Fixture Teacher',studentName:'Fixture Student'});
  const credential=sqlite.prepare('SELECT * FROM local_credentials WHERE username=?').get('new.group.admin'),created=row(credential.account_id);assert.equal(created.group_id,groups.a);assert.equal(created.role,'admin');assert.equal(created.teacher_name,null);assert.equal(created.student_name,null);assert.equal(credential.must_change_password,1);assert.ok(created.activated_at);assert.equal(credential.password_hash.includes(password),false);
  assert.equal(JSON.stringify(sqlite.prepare('SELECT before_json,after_json FROM audit').all()).includes(password),false,'temporary passwords never enter audit payloads');
  await addSession(created.id);await addSession(created.id);await ok('action',{action:'resetLocalPassword',userId:created.id,password:changedPassword});assert.equal(sessionCount(created.id),0);assert.equal(sqlite.prepare('SELECT must_change_password FROM local_credentials WHERE account_id=?').get(created.id).must_change_password,1);
  await addSession(created.id);await ok('action',{action:'deleteAccount',userId:created.id});assert.ok(row(created.id).disabled_at);assert.equal(sessionCount(created.id),0);
  await ok('action',{action:'restoreAccount',userId:created.id});assert.equal(row(created.id).disabled_at,null);assert.equal(sessionCount(created.id),0);
  await ok('action',{action:'bind',userId:'pending-a',role:'admin'});assert.equal(row('pending-a').role,'admin');
  await addSession('pending-a');await ok('action',{action:'bind',userId:'pending-a',role:'student',studentName:'Unused Student'});assert.equal(row('pending-a').role,'student');assert.equal(sessionCount('pending-a'),0,'administrator privilege loss revokes all sessions');
  await addSession(created.id);await ok('manage',{kind:'account',id:created.id,confirm:true});assert.equal(row(created.id),undefined);assert.equal(sessionCount(created.id),0);assert.equal(sqlite.prepare('SELECT account_id FROM local_credentials WHERE account_id=?').get(created.id),undefined);
});

await section('temporary passwords gate chief powers and rotate sessions',async()=>{
  // Exercise the actual username/password transport, including the shared
  // must-change flag when the same account later signs in through Google.
  await login('admin-a');
  await unchanged('ordinary administrator cannot create a second administrator',()=>denied('action',{action:'createLocalAccount',username:'first-change-admin',password,name:'Gated administrator',role:'admin'},[403]));
  await login('chief-a');await ok('action',{action:'createLocalAccount',username:'first-change-admin',password,name:'Gated administrator',role:'admin'});
  const temporaryId=sqlite.prepare('SELECT account_id FROM local_credentials WHERE username=?').get('first-change-admin').account_id;
  const signin=await ok('auth',{username:'FIRST-CHANGE-ADMIN',password});assert.equal(signin.account.id,temporaryId);assert.equal(signin.account.mustChangePassword,true);assert.equal(await auth.currentBusinessAccount(),null);
  sqlite.prepare('INSERT INTO google_identities(subject,account_id,email,linked_at) VALUES(?,?,?,?)').run('temporary-google-subject',temporaryId,'temporary-google@example.test',now);
  await ok('auth',{credential:await googleCredential('temporary-google-subject','temporary-google@example.test')});assert.equal((await ok('auth')).account.id,temporaryId);assert.equal(await auth.currentBusinessAccount(),null,'Google sign-in cannot bypass a local temporary password');
  await unchanged('temporary administrator cannot perform business writes',()=>denied('action',{action:'saveTeacher',name:'Gated business write',active:true},[401,403]));
  await ok('password',{currentPassword:password,newPassword:changedPassword});assert.equal((await auth.currentBusinessAccount()).id,temporaryId);assert.equal((await ok('auth')).account.mustChangePassword,false);
  await ok('auth',{username:'temporary-google@example.test',password:changedPassword});assert.equal((await auth.currentBusinessAccount()).id,temporaryId,'verified Google email signs in to the original local identity');
  await login('chief-a');sqlite.prepare('UPDATE local_credentials SET must_change_password=1 WHERE account_id=?').run('chief-a');
  assert.equal(await auth.currentBusinessAccount(),null);
  for(const [name,body]of [['action',{action:'createLocalAccount',username:'gate-forbidden',password,name:'Gated',role:'admin'}],['action',{action:'resetLocalPassword',userId:'admin-a',password:changedPassword}],['manage',{kind:'account',id:'admin-a',confirm:true}],['groups',{action:'setChief',id:groups.a,chiefAdminId:'admin-a',expectedChiefAdminId:'chief-a'}]])await unchanged('first-change gate '+name,()=>denied(name,body,[401,403]));
  await unchanged('Google linking cannot bypass first-change gate',()=>denied('account-link',{password,credential:'unverified'},[403]));
  const oldToken=cookieValues.tuition_session;await ok('password',{currentPassword:password,newPassword:changedPassword});const newToken=cookieValues.tuition_session;assert.notEqual(newToken,oldToken);cookieValues.tuition_session=oldToken;assert.equal(await auth.currentAccount(),null);cookieValues.tuition_session=newToken;assert.equal((await auth.currentBusinessAccount()).id,'chief-a');
  assert.equal((await ok('auth')).account.isGroupChief,true);
});

await section('current chief and platform Owner cannot be removed',async()=>{
  for(const actor of ['chief-a','admin-a','owner']){
    await login(actor,actor==='owner'?groups.a:undefined);
    for(const target of ['chief-a','owner']){
      for(const body of [{action:'deleteAccount',userId:target},{action:'bind',userId:target,role:'teacher',teacherName:'Unused Teacher'}])await unchanged('protected identity '+actor+' '+target+' '+body.action,()=>denied('action',body));
      await unchanged('protected identity permanent delete '+actor+' '+target,()=>denied('manage',{kind:'account',id:target,confirm:true}));
    }
  }
  await login('chief-a');await unchanged('chief cannot reset self',()=>denied('action',{action:'resetLocalPassword',userId:'chief-a',password}));await unchanged('chief cannot reset Owner',()=>denied('action',{action:'resetLocalPassword',userId:'owner',password}));
  await login('owner',groups.a);await addSession('chief-a');await ok('action',{action:'resetLocalPassword',userId:'chief-a',password});assert.equal(chief(groups.a),'chief-a');assert.equal(sessionCount('chief-a'),0,'Owner password recovery retains chief assignment and signs out target');
  sqlite.prepare('UPDATE local_credentials SET must_change_password=0 WHERE account_id=?').run('chief-a');
});

await section('chief handover revokes former chief authority with unchanged base role',async()=>{
  const oldToken=await login('chief-a');await addSession('chief-a');await login('owner',groups.a);const audits=auditCount();
  await ok('groups',{action:'setChief',id:groups.a,chiefAdminId:'admin-a',expectedChiefAdminId:'chief-a'});assert.equal(chief(groups.a),'admin-a');assert.equal(row('chief-a').role,'admin');assert.equal(sessionCount('chief-a'),0);assert.equal(auditCount(),audits+1);
  cookieValues.tuition_session=oldToken;requestHeaders=new Headers();assert.equal(await auth.currentAccount(),null);await unchanged('old chief session is revoked',()=>denied('action',{action:'deleteAccount',userId:'admin-disabled'},[401]));
  await login('chief-a');const data=await ok('auth');assert.equal(data.account.isGroupChief,false);assert.equal(data.account.canManageAdministrators,false);await unchanged('former chief cannot manage administrators after relogin',()=>denied('action',{action:'restoreAccount',userId:'admin-disabled'},[403]));
  await login('admin-a');assert.equal((await ok('auth')).account.isGroupChief,true);await ok('action',{action:'restoreAccount',userId:'admin-disabled'});await ok('action',{action:'deleteAccount',userId:'admin-disabled'});
  const refreshed=await ok('state',undefined,'?scope=accounts');assert.equal(refreshed.account.isGroupChief,true);assert.equal(refreshed.users.find(user=>user.id==='admin-a').isGroupChief,true);assert.equal(refreshed.users.find(user=>user.id==='chief-a').isGroupChief,false,'directory tags follow the committed handover');
  await login('owner',groups.a);await unchanged('late tab cannot overwrite handover',()=>denied('groups',{action:'setChief',id:groups.a,chiefAdminId:'chief-a',expectedChiefAdminId:'chief-a'},[409]));
});

await section('bulk deletion enforces hierarchy and all-or-nothing review',async()=>{
  account('bulk-normal-admin');account('bulk-normal-student','student',groups.a,{studentName:'Bulk Fixture Student'});
  await login('chief-a');const deniedPreview=await ok('manage',{action:'previewDelete',entries:[{kind:'account',id:'bulk-normal-admin'},{kind:'account',id:'bulk-normal-student'}]});assert.equal(deniedPreview.blocked.length,1);assert.equal(deniedPreview.items.length,1);
  await unchanged('ordinary bulk cannot smuggle administrator removal',()=>denied('manage',{entries:[{kind:'account',id:'bulk-normal-student'},{kind:'account',id:'bulk-normal-admin'}],confirm:true,fingerprint:deniedPreview.fingerprint,previewAt:deniedPreview.previewAt},[403]));assert.ok(row('bulk-normal-student'));
  await login('admin-a');const entries=[{kind:'account',id:'bulk-normal-admin'},{kind:'account',id:'bulk-normal-student'}],preview=await ok('manage',{action:'previewDelete',entries});assert.equal(preview.blocked.length,0);assert.equal(preview.items.length,2);await addSession('bulk-normal-admin');
  // Session state participates in deletion proof: obtain a fresh preview after
  // adding another device, then delete both entries in one real transaction.
  const fresh=await ok('manage',{action:'previewDelete',entries});await ok('manage',{entries,confirm:true,fingerprint:fresh.fingerprint,previewAt:fresh.previewAt});assert.equal(row('bulk-normal-admin'),undefined);assert.equal(row('bulk-normal-student'),undefined);assert.equal(sessionCount('bulk-normal-admin'),0);
  account('bulk-rollback-a');account('bulk-rollback-b');const rollbackEntries=[{kind:'account',id:'bulk-rollback-a'},{kind:'account',id:'bulk-rollback-b'}],rollbackPreview=await ok('manage',{action:'previewDelete',entries:rollbackEntries});
  beforeBatch=()=>sqlite.exec("CREATE TEMP TRIGGER hierarchy_injected_delete_failure BEFORE DELETE ON accounts WHEN OLD.id='bulk-rollback-b' BEGIN SELECT RAISE(ABORT,'Fictional injected write failure'); END");
  await unchanged('bulk transaction rolls back on database failure',()=>denied('manage',{entries:rollbackEntries,confirm:true,fingerprint:rollbackPreview.fingerprint,previewAt:rollbackPreview.previewAt},[409,503]));sqlite.exec('DROP TRIGGER hierarchy_injected_delete_failure');
  beforeBatch=()=>sqlite.exec("CREATE TEMP TRIGGER hierarchy_injected_audit_failure BEFORE INSERT ON audit WHEN NEW.action='createLocalAccount' BEGIN SELECT RAISE(ABORT,'Fictional injected audit failure'); END");
  await unchanged('account and credentials roll back with failed audit',()=>denied('action',{action:'createLocalAccount',username:'failed-audit-admin',password,name:'Atomic creation failure',role:'admin'},[503]));sqlite.exec('DROP TRIGGER hierarchy_injected_audit_failure');
});

await section('live transaction checks close handover and lifecycle races',async()=>{
  // Simulate a committed Owner handover after a chief read and before its batch.
  // The pending lifecycle request must lose, with no target/audit side effects.
  await login('race-chief');await addSession('race-other');const audits=auditCount(),sessions=sessionCount('race-other');
  beforeBatch=()=>{sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('race-admin',groups.race);sqlite.prepare('DELETE FROM sessions WHERE account_id=?').run('race-chief');};
  await denied('action',{action:'deleteAccount',userId:'race-other'},[403,409]);assert.equal(chief(groups.race),'race-admin');assert.equal(row('race-other').disabled_at,null);assert.equal(sessionCount('race-other'),sessions);assert.equal(auditCount(),audits);
  // A target becoming chief cannot be disabled by an already planned Owner call.
  await login('owner',groups.race);beforeBatch=()=>sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('race-other',groups.race);
  await denied('action',{action:'deleteAccount',userId:'race-other'},[403,409]);assert.equal(chief(groups.race),'race-other');assert.equal(row('race-other').disabled_at,null);assert.equal(auditCount(),audits);
  // Conversely, if target disable wins first, chief assignment must fail its
  // in-transaction validity check and cannot append a successful handover audit.
  await login('owner',groups.race);const chiefBefore=chief(groups.race);beforeBatch=()=>sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,'race-admin');
  await denied('groups',{action:'setChief',id:groups.race,chiefAdminId:'race-admin',expectedChiefAdminId:chiefBefore},[403,409]);assert.equal(chief(groups.race),chiefBefore);assert.equal(auditCount(),audits);
  // A former chief's deletion preview also expires as authority changes, even
  // when the target snapshots and preview fingerprint themselves are unchanged.
  sqlite.prepare('UPDATE accounts SET disabled_at=NULL WHERE id=?').run('race-admin');await login('race-other');const entries=[{kind:'account',id:'race-admin'}],preview=await ok('manage',{action:'previewDelete',entries});const beforeTarget=JSON.stringify(row('race-admin'));
  beforeBatch=()=>{sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('race-chief',groups.race);sqlite.prepare('DELETE FROM sessions WHERE account_id=?').run('race-other');};
  await denied('manage',{entries,confirm:true,fingerprint:preview.fingerprint,previewAt:preview.previewAt},[403,409]);assert.equal(JSON.stringify(row('race-admin')),beforeTarget);assert.equal(auditCount(),audits);
  await login('owner',groups.race);beforeBatch=()=>sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('race-other',groups.race);
  await denied('groups',{action:'setChief',id:groups.race,chiefAdminId:'race-admin',expectedChiefAdminId:'race-chief'},[409]);assert.equal(chief(groups.race),'race-other');assert.equal(auditCount(),audits,'CAS is checked again after preflight and before commit');
});

await section('Google merge rechecks pending identity before removing accounts',async()=>{
  account('merge-actor','teacher',groups.race,{teacherName:'Merge Fixture Teacher'});
  account('merge-pending','pending',groups.race,{local:false,email:'merge-race@example.test',google:'merge-race-google'});
  sqlite.prepare('INSERT INTO study_blocks(group_id,id,account_id,title,starts_at,ends_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(groups.race,'merge-race-plan','merge-pending','Fictional personal study history',now,new Date(Date.now()+3600000).toISOString(),now,now);
  await addSession('merge-pending');await login('merge-actor');let committedExternalSnapshot;
  beforeBatch=()=>{
    sqlite.prepare("UPDATE accounts SET role='admin',activated_at=? WHERE id=?").run(now,'merge-pending');sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('merge-pending',groups.race);
    committedExternalSnapshot=snapshot();
  };
  const result=await denied('account-link',{password,credential:await googleCredential('merge-race-google','merge-race@example.test'),confirmMerge:true},[409]);assert.equal(result.data.error,'admin.authorityChanged');assert.equal(snapshot(),committedExternalSnapshot,'promotion/chief assignment wins without removing account, Google identity, session, study history or adding success audits');assert.equal(chief(groups.race),'merge-pending');assert.equal(row('merge-pending').role,'admin');
  // An unchanged pending identity still merges through the real verified Google
  // route, preserving the local actor and transferring its personal study data.
  account('merge-valid-pending','pending',groups.race,{local:false,email:'merge-valid@example.test',google:'merge-valid-google'});
  sqlite.prepare('INSERT INTO study_blocks(group_id,id,account_id,title,starts_at,ends_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(groups.race,'merge-valid-plan','merge-valid-pending','Fictional retained study plan',now,new Date(Date.now()+3600000).toISOString(),now,now);
  const audits=auditCount();await ok('account-link',{password,credential:await googleCredential('merge-valid-google','merge-valid@example.test'),confirmMerge:true});assert.equal(row('merge-valid-pending'),undefined);assert.ok(row('merge-actor'));assert.equal(sqlite.prepare('SELECT account_id FROM google_identities WHERE subject=?').get('merge-valid-google').account_id,'merge-actor');assert.equal(sqlite.prepare('SELECT account_id FROM study_blocks WHERE id=?').get('merge-valid-plan').account_id,'merge-actor');assert.equal(auditCount(),audits+2,'one merge event and one Google link event');
});

await section('chief financial access remains Owner-only',async()=>{
  await login('admin-a');const result=await call('billing',undefined,'?month=2032-01');assert.equal(result.status,403);await unchanged('chief cannot save Owner financial settings',()=>denied('billing',{action:'saveRate'},[403]));
  assert.equal(sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
console.log(JSON.stringify({suite:'admin-hierarchy',sections,database:'isolated SQLite',productionWrites:false}));
}finally{globalThis.fetch=originalFetch;hooks.deregister();delete globalThis.__adminHierarchy;sqlite.close();}
