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
  return {sql,bind:(...v)=>statement(sql,v),first:async()=>execute(false).results[0]||null,all:async()=>execute(false),raw:async()=>execute(true).results,run:async()=>execute(false),execute:()=>execute(false)};
}
const d1={prepare:statement,async batch(items){
  const hook=beforeBatch;beforeBatch=null;if(hook)await hook(items);
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

// This suite reuses the real SQLite/auth adapter above, not mocked account authority.
// No fetch is forwarded: fictional certificates and mail are held only in memory.
const originalFetch=globalThis.fetch,mail=[];let checks=0;
const check=(condition,label)=>{assert.ok(condition,label);checks++;};
const equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const key=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']),jwk=await crypto.subtle.exportKey('jwk',key.publicKey);
globalThis.fetch=async(input,options)=>{if(String(input)==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[{...jwk,kid:'removal-fixture-key'}]},{headers:{'cache-control':'max-age=3600'}});assert.equal(String(input),'https://api.brevo.com/v3/smtp/email','No external network allowed');mail.push(JSON.parse(options.body));return Response.json({messageId:'fictional-only'},{status:201});};
async function credential(subject,email){const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url'),input=encode({alg:'RS256',kid:'removal-fixture-key'})+'.'+encode({sub:subject,email,name:'Fictional account',aud:runtime.env.GOOGLE_CLIENT_ID,iss:'https://accounts.google.com',email_verified:true,exp:Math.floor(Date.now()/1000)+600});return input+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key.privateKey,new TextEncoder().encode(input))).toString('base64url');}
const tableNames=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name);
function allTables(){return Object.fromEntries(tableNames.map(t=>[t,JSON.stringify(sqlite.prepare('SELECT * FROM "'+t+'" ORDER BY rowid').all())]));}
function preserved(before,exceptions=[]){const after=allTables();for(const [table,value]of Object.entries(before))if(!exceptions.includes(table))equal(after[table],value,table+' unchanged');}
function armWriteRace(effect){const hook=items=>{if(!items.some(s=>/UPDATE accounts SET disabled_at=/.test(s.sql))){beforeBatch=hook;return;}effect();};beforeBatch=hook;}
async function preview(ids){return ok('manage',{action:'previewDelete',entries:ids.map(id=>({kind:'account',id}))});}
async function remove(ids,p){return ok('manage',{action:'permanentDelete',confirm:true,entries:ids.map(id=>({kind:'account',id})),previewAt:p.previewAt,fingerprint:p.fingerprint});}
try{
 sqlite.exec('PRAGMA foreign_keys=ON');
 account('removal-teacher','teacher',groups.a,{teacherName:'Fixture Teacher',email:'remove-teacher@example.test',google:'remove-google-teacher'});
 account('removal-student','student',groups.a,{studentName:'Fixture Student',email:'remove-student@example.test',google:'remove-google-student'});
 sqlite.prepare('INSERT INTO plans(group_id,key,student,subject,teacher_name,created_at) VALUES(?,?,?,?,?,?)').run(groups.a,'retained-plan','Fixture Student','Science','Fixture Teacher',now);
 sqlite.prepare('INSERT INTO assignments(id,group_id,account_id,plan_key) VALUES(?,?,?,?)').run('retained-assignment',groups.a,'removal-student','retained-plan');
 sqlite.prepare('INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('retained-class',groups.a,'Fictional retained class','Science','Fixture Teacher','removal-teacher',now,now);
 sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run('retained-member',groups.a,'retained-class','Fixture Student',now);
 sqlite.prepare('INSERT INTO lessons(id,group_id,student,subject,teacher_name,planned_start,planned_end,created_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('retained-lesson',groups.a,'Fixture Student','Science','Fixture Teacher',now,new Date(Date.now()+3600000).toISOString(),'removal-teacher',now);
 sqlite.prepare('INSERT INTO homework(id,group_id,owner_id,title,subject,description,starts_at,due_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run('retained-homework',groups.a,'removal-teacher','Fictional homework','Science','',now,now,now);
 sqlite.prepare('INSERT INTO quizzes(id,group_id,owner_id,title,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('retained-quiz',groups.a,'removal-teacher','Fictional quiz',now,now);
 const billingStudentId=sqlite.prepare('SELECT id FROM billing_students WHERE group_id=? AND student_name=?').get(groups.a,'Fixture Student').id;
 sqlite.prepare('INSERT INTO invoices(id,group_id,student_id,month,status,revision,created_at,updated_at,created_by,due_date,currency,source_hash,source_basis_json,adjustment_basis_json,document_json,total_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('retained-invoice',groups.a,billingStudentId,'2026-11','draft',1,now,now,'removal-teacher','2026-11-30','MYR','fixture','{}','{}','{}',10000);
 const teacherSession=await auth.createSession('removal-teacher'),studentSession=await auth.createSession('removal-student');
 const recovery=await load('lib/password-recovery.ts'),config={db:d1,apiKey:'fictional-not-transmitted',senderEmail:'noreply@example.test',senderName:'Fixture',secret:'fictional-recovery-secret-'.repeat(3)},deferred=[];
 const pending=await recovery.requestPasswordRecovery(config,'removal-student','192.0.2.1','en',p=>deferred.push(p));await Promise.all(deferred);
 const code=mail.at(-1).textContent.match(/\b\d{6}\b/)[0],verified=await recovery.verifyPasswordRecovery(config,pending.challenge,code);
 await login('admin-a');const beforePreview=allTables(),p=await preview(['removal-teacher','removal-student']);equal(allTables(),beforePreview,'Preview has no writes');equal(p.blocked,[],'Business/quiz references do not block');
 equal(p.items[0].effects.find(e=>e.table==='accounts').action,'disable','Preview states login suspension');check(p.items[0].effects.find(e=>e.table==='accounts').retained,'Account retained');equal(p.items[0].effects.find(e=>e.table==='sessions').action,'revoke','Sessions revoked');
 const before=allTables(),result=await remove(['removal-teacher','removal-student'],p);equal(result.deactivatedCount,2,'Two logins deactivated');equal(result.retainedData,true,'Data preservation contract');
 preserved(before,['accounts','sessions','session_devices','audit']);
 for(const id of ['removal-teacher','removal-student']){check(row(id).disabled_at,id+' retained but disabled');equal(sessionCount(id),0,id+' sessions gone');const original=JSON.parse(before.accounts).find(a=>a.id===id),current=row(id);equal({...current,disabled_at:original.disabled_at},original,'Only disabled_at changes');}
 equal(sqlite.prepare('SELECT count(*) n FROM session_devices WHERE token_hash IN (?,?)').get(await auth.hashToken(teacherSession.token),await auth.hashToken(studentSession.token)).n,0,'Device metadata cascades with sessions');
 const audits=sqlite.prepare("SELECT action,after_json FROM audit WHERE lesson_id IN('account:removal-teacher','account:removal-student') ORDER BY rowid").all();equal(audits.length,2,'One audit each');check(audits.every(a=>a.action==='deleteAccount'&&JSON.parse(a.after_json).retainedData),'Audits describe suspension');
 cookieValues.tuition_session=studentSession.token;equal(await auth.currentAccount(),null,'Old session cannot authenticate');equal((await routes.auth.POST(request('auth',{username:'removal-student',password}))).status,403,'Password rejects disabled');
 equal((await routes.auth.POST(request('auth',{username:'remove-student@example.test',password}))).status,403,'Verified email login rejects disabled');
 const google=await credential('remove-google-student','remove-student@example.test'),count=sqlite.prepare('SELECT count(*) n FROM accounts').get().n;
 for(const groupCode of [groups.a,groups.b])equal((await routes.auth.POST(request('auth',{credential:google,groupCode}))).status,403,'Invite cannot re-register disabled identity');equal(sqlite.prepare('SELECT count(*) n FROM accounts').get().n,count,'No replacement account created');
 await assert.rejects(auth.createSession('removal-student'),auth.StaleSessionCredentialError);checks++;await assert.rejects(auth.createSession('removal-student',undefined,passwordHash),auth.StaleSessionCredentialError);checks++;
 await assert.rejects(recovery.verifyPasswordRecovery(config,pending.challenge,code),/INVALID_CODE/);checks++;await assert.rejects(recovery.resetVerifiedPassword(config,verified.resetToken,'Fictional-new-password-789'),/INVALID_CODE/);checks++;
 const mailBefore=mail.length,work=[];await recovery.requestPasswordRecovery(config,'remove-student@example.test','192.0.2.2','en',p=>work.push(p));await Promise.all(work);equal(mail.length,mailBefore,'Disabled recovery sends no email');equal(sqlite.prepare('SELECT password_hash FROM local_credentials WHERE account_id=?').get('removal-student').password_hash,passwordHash,'Recovery cannot change password');
 const lifecycle=await load('lib/pending-cleanup.ts');account('suspended-pending','pending',groups.a,{google:'suspended-pending-google',email:'pending@example.test'});sqlite.prepare('UPDATE accounts SET pending_expires_at=? WHERE id=?').run('2000-01-01T00:00:00Z','suspended-pending');await login('admin-a');await ok('manage',{kind:'account',id:'suspended-pending',confirm:true});const pendingBefore=allTables();await lifecycle.cleanupPendingAccounts(d1,'2099-01-01T00:00:00Z');equal(allTables(),pendingBefore,'Cleanup preserves disabled identity and credentials');
 account('cleanup-race','pending');sqlite.prepare('UPDATE accounts SET pending_expires_at=? WHERE id=?').run('2000-01-01T00:00:00Z','cleanup-race');beforeBatch=()=>sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,'cleanup-race');const racedCleanup=await lifecycle.cleanupPendingAccounts(d1,'2099-01-01T00:00:00Z');equal(racedCleanup.deleted,0,'Expiry batch rechecks concurrent suspension');check(row('cleanup-race').disabled_at,'Concurrent suspended pending identity retained');check(sqlite.prepare('SELECT account_id FROM local_credentials WHERE account_id=?').get('cleanup-race'),'Concurrent suspended credential retained');
 account('cleanup-eligible','pending');sqlite.prepare('UPDATE accounts SET pending_expires_at=? WHERE id=?').run('2000-01-01T00:00:00Z','cleanup-eligible');const normalCleanup=await lifecycle.cleanupPendingAccounts(d1,'2099-01-01T00:00:00Z');equal(normalCleanup.deleted,1,'Normal unassigned expiry still works');equal(row('cleanup-eligible'),undefined,'Only eligible account expired');
 account('google-race','teacher',groups.a,{teacherName:'Fixture Teacher'});beforeBatch=()=>sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,'google-race');await assert.rejects(auth.createSession('google-race'),auth.StaleSessionCredentialError);checks++;equal(sessionCount('google-race'),0,'Late suspension wins Google session issuance');
 account('race-target','teacher',groups.a,{teacherName:'Fixture Teacher'});await login('admin-a');const racePreview=await preview(['race-target']);armWriteRace(()=>sqlite.prepare("UPDATE accounts SET role='admin' WHERE id='race-target'").run());await denied('manage',{action:'permanentDelete',confirm:true,entries:[{kind:'account',id:'race-target'}],previewAt:racePreview.previewAt,fingerprint:racePreview.fingerprint},[403,409]);equal(row('race-target').disabled_at,null,'Changed target identity blocks stale suspension');
 await login('owner',groups.a);for(const target of ['owner','chief-a'])await denied('manage',{kind:'account',id:target,confirm:true},[403,404]);await login('admin-a');for(const target of ['admin-a','admin-peer','admin-b'])await denied('manage',{kind:'account',id:target,confirm:true},[403,404]);checks+=5;
 // Successful deletion of a linked account does not permit its disabled Google
 // identity to be merged into another login.
 const merge=await load('lib/account-merge.ts'),active=await auth.currentBusinessAccount(),mergeResult=await merge.prepareAccountMerge(active,'removal-teacher',true);equal(mergeResult.statements.length,0,'Disabled identity cannot be merged away');
 equal(sqlite.prepare('PRAGMA foreign_key_check').all(),[],'Foreign keys intact');
 console.log(JSON.stringify({ok:true,checks,tablesCompared:tableNames.length,productionDatabaseQueries:0,productionWrites:false,externalRequestsForwarded:0,actualEmailsSent:0}));
}finally{globalThis.fetch=originalFetch;hooks.deregister();sqlite.close();delete globalThis.__adminHierarchy;}
