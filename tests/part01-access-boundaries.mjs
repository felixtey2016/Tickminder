import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {drizzle} from 'drizzle-orm/d1';
process.on('uncaughtException',error=>{console.error(error.name+': '+error.message);console.error(String(error.stack).split('\n').filter(line=>!line.includes('data:text/')).slice(0,8).join('\n'));process.exit(1);});

const sqlite=new DatabaseSync(':memory:');
const migrations=fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort();
for(const file of migrations)sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
function statement(sql,values=[]) {
  const execute=arrays=>{const st=sqlite.prepare(sql);if(arrays)st.setReturnArrays(true);const reading=st.columns().length>0;return reading?{results:st.all(...values),meta:{changes:0}}:{results:[],meta:st.run(...values)};};
  return {bind:(...v)=>statement(sql,v),all:async()=>execute(false),raw:async()=>execute(true).results,first:async()=>execute(false).results[0]||null,run:async()=>execute(false),execute:()=>execute(false)};
}
const d1={prepare:statement,batch:async stmts=>{sqlite.exec('BEGIN');try{const results=stmts.map(s=>s.execute());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const objects=new Map(),bucket={put:async(k,b)=>objects.set(k,Buffer.from(b)),delete:async k=>objects.delete(k),get:async k=>objects.has(k)?{body:objects.get(k),size:objects.get(k).length,httpMetadata:{contentType:'application/pdf'}}:null};
let cookieValues={},requestHeaders=new Headers(),googleProfile=null;
class JsonResponse extends Response {static json(data,options){const r=new JsonResponse(JSON.stringify(data),{...options,headers:{'content-type':'application/json',...options?.headers}});r.cookies={set:(name,value)=>cookieValues[name]=value,delete:name=>delete cookieValues[name]};return r;}}
const runtime={env:{DB:d1,BUCKET:bucket,GOOGLE_CLIENT_ID:'fixture-client'},cookies:async()=>({get:name=>cookieValues[name]?{value:cookieValues[name]}:undefined}),headers:async()=>requestHeaders,NextResponse:JsonResponse};
globalThis.__groups=runtime;
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-groups-')),stubPath=path.join(temporary,'runtime.mjs');
process.once('exit',()=>{const resolved=path.resolve(temporary);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('tickminder-groups-'))fs.rmSync(resolved,{recursive:true,force:true});});
fs.writeFileSync(stubPath,'export const {env,cookies,headers,NextResponse}=globalThis.__groups;'+['getDb','currentAccount','currentIdentity','currentBusinessAccount','createSession','hashToken','verifyGoogleCredential'].map(name=>`export const ${name}=(...args)=>globalThis.__groups.${name}(...args);`).join(''));
const stub=pathToFileURL(stubPath).href,cache=new Map();
function compile(file){if(cache.has(file))return cache.get(file);const output=path.join(temporary,file.replace(/\.ts$/,'.mjs')),url=pathToFileURL(output).href;cache.set(file,url);let source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');for(const [,spec]of [...source.matchAll(/from ["']([^"']+)["']/g)]){const replacement=['cloudflare:workers','next/headers','next/server','@/db','@/lib/auth'].includes(spec)?stub:spec.startsWith('@/')?compile(spec.slice(2)+'.ts'):spec.startsWith('.')?compile(path.posix.normalize(path.posix.join(path.posix.dirname(file),spec))+(spec.endsWith('.ts')?'':'.ts')):import.meta.resolve(spec);source=source.replaceAll('"'+spec+'"','"'+replacement+'"').replaceAll("'"+spec+"'","'"+replacement+"'");}fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);return url;}
async function load(file){const url=compile(file);return{url,module:await import(url)};}

const schema=(await load('db/schema.ts')).module;runtime.getDb=()=>drizzle(d1,{schema});
const auth=(await load('lib/auth.ts')).module;Object.assign(runtime,auth);runtime.verifyGoogleCredential=async()=>{if(!googleProfile)throw Error('No verified fixture identity');return googleProfile;};
const pw=(await load('lib/password.ts')).module;
const now=new Date().toISOString(),password='Fixture-pass-123',passwordHash=await pw.hashPassword(password);
sqlite.prepare("INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES('school-b','Test School B','school-b',?,?)").run(now,now);
for(const group of ['next-genn-edu','school-b']) {
  sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(group,'Teacher Same',now);
  sqlite.prepare('INSERT INTO students(group_id,name,name_key,created_at,grade) VALUES(?,?,?,?,?)').run(group,'Student Same','studentsame',now,'Form 3');
  sqlite.prepare('INSERT INTO plans(group_id,key,student,subject,teacher_name,created_at,subject_id) VALUES(?,?,?,?,?,?,?)').run(group,'Student Same|Science','Student Same','Science','Teacher Same',now,'science');
  for(const [suffix,role]of [['admin','admin'],['teacher','teacher'],['student','student'],['pending','pending']]) {
    const id=group+'-'+suffix;
    sqlite.prepare('INSERT INTO accounts(group_id,id,email,name,role,teacher_name,student_name,created_at,name_confirmed_at,activated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(group,id,id+'@example.test',id,role,role==='teacher'?'Teacher Same':null,role==='student'?'Student Same':null,now,now,role==='pending'?null:now);
    sqlite.prepare('INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES(?,?,?,0,?)').run(id,id,passwordHash,now);
  }
}
sqlite.prepare("INSERT INTO accounts(group_id,id,email,name,role,created_at,name_confirmed_at,activated_at) VALUES(NULL,'owner','felixtey2016@gmail.com','Platform Owner','admin',?,?,?)").run(now,now,now);
sqlite.prepare("INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES('owner','owner',?,0,?)").run(passwordHash,now);
async function login(id,groupHeader) {
  const token='fixture-session-'+crypto.randomUUID();cookieValues.tuition_session=token;requestHeaders=new Headers(groupHeader?{'x-tickminder-group':groupHeader}:{});
  sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run(await auth.hashToken(token),id,new Date(Date.now()+86400000).toISOString());
}
const routes={};for(const name of ['groups','state','action','classrooms','learning','files','manage','conflicts','lesson-history','notifications','auth','sheet-sync'])routes[name]=(await load('app/api/'+name+'/route.ts')).module;
const fileRoute=(await load('app/api/files/[id]/route.ts')).module;
const learning=(await load('lib/learning-server.ts')).module;
const groupData=(await load('lib/group-data.ts')).module;
const engine=(await load('lib/notifications-server.ts')).module;
function req(name,body,query='') {return new Request('https://test.invalid/api/'+name+query,body?{method:'POST',headers:{origin:'https://test.invalid','content-type':'application/json'},body:JSON.stringify(body)}:{});}
async function call(name,body,query=''){const response=await routes[name][body?'POST':'GET'](req(name,body,query));const data=await response.json();return{status:response.status,data};}
const ok=async(name,body,query)=>{const r=await call(name,body,query);assert.equal(r.status,200,JSON.stringify({name,status:r.status,data:r.data}));return r.data;};
const deny=async(name,body,query)=>{const r=await call(name,body,query);assert.ok([400,401,403,404,409,503].includes(r.status),JSON.stringify({name,...r}));return r;};

// Additional Part 01 boundaries run with real identity resolution and handlers.
// All identities/data are fictional; outbound requests are denied except for a
// local stub of the organisation-specific Sheet bridge.
for(const name of ['account-setup','academic-catalogues','student-promotions','class-sessions','attendance','revision','folders','quiz-practice','quizzes','quiz-images','learning/versions','learning/review'])routes[name]=(await load('app/api/'+name+'/route.ts')).module;
let checks=0;
function check(value,label){assert.ok(value,label);checks++;}
const business=[['state',null,'?scope=core'],['revision'],['class-sessions'],['attendance',null,'?sessionId=foreign'],['learning/versions',null,'?kind=homework&id=foreign'],['learning/review',null,'?homeworkId=foreign'],['quizzes',null,'?bank=1'],['quiz-practice'],['quiz-images',null,'?id=foreign'],['academic-catalogues',null,'?scope=quiz'],['student-promotions',null,'?cycle=2032'],['notifications'],['lesson-history',null,'?lessonId=foreign'],['action',{action:'create'}],['classrooms',{action:'saveClassroom'}],['learning',{action:'submitHomework'}],['folders',{action:'create'}],['manage',{action:'permanentDelete'}],['conflicts',{action:'edit'}],['files',{}],['quizzes',{action:'save'}],['quiz-practice',{action:'start'}],['quiz-images',{}],['academic-catalogues',{scope:'quiz'}],['student-promotions',{}],['sheet-sync',{action:'preview',mode:'billable'}]];
async function businessDenied(label){for(const[name,body,query]of business){const result=await call(name,body,query||'');check([401,403].includes(result.status),`${label}: ${name} ${body?'POST':'GET'} rejected, got ${result.status}`);}}
cookieValues={};requestHeaders=new Headers();await businessDenied('anonymous');
await login('next-genn-edu-admin');sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,'next-genn-edu-admin');await businessDenied('disabled old session');sqlite.prepare('UPDATE accounts SET disabled_at=NULL WHERE id=?').run('next-genn-edu-admin');
await login('next-genn-edu-admin');sqlite.prepare('UPDATE local_credentials SET must_change_password=1 WHERE account_id=?').run('next-genn-edu-admin');await businessDenied('initial-password gate');sqlite.prepare('UPDATE local_credentials SET must_change_password=0 WHERE account_id=?').run('next-genn-edu-admin');
await login('next-genn-edu-admin','school-b');await businessDenied('forged group header');
await login('next-genn-edu-admin');sqlite.prepare('UPDATE sessions SET expires_at=? WHERE account_id=?').run('2000-01-01T00:00:00Z','next-genn-edu-admin');await businessDenied('expired old session');
await login('next-genn-edu-pending');sqlite.prepare('UPDATE accounts SET pending_expires_at=? WHERE id=?').run('2000-01-01T00:00:00Z','next-genn-edu-pending');await businessDenied('expired pending');
await login('next-genn-edu-admin');sqlite.prepare('UPDATE tuition_groups SET active=0 WHERE id=?').run('next-genn-edu');await businessDenied('paused group old session');sqlite.prepare('UPDATE tuition_groups SET active=1 WHERE id=?').run('next-genn-edu');

// Shared catalogues intentionally readable across groups and roles. The two
// catalogue scopes stay separate; no non-owner can update global menus.
for(const group of ['next-genn-edu','school-b'])for(const role of ['admin','teacher','student']){await login(group+'-'+role);const result=await call('academic-catalogues',null,'?scope=quiz');check(result.status===200&&!result.data.canManage,'authenticated shared catalogue '+group+' '+role);const denied=await call('academic-catalogues',{scope:'quiz',expectedRevision:1,syllabuses:[]});check(denied.status===403,'non-owner catalogue write');}
await login('owner','school-b');check((await ok('academic-catalogues',null,'?scope=student')).canManage,'Owner scope switch retains global catalogue authority');
// Fake actor IDs and body group IDs cannot confer platform ownership.
await login('school-b-admin');check((await call('academic-catalogues',{scope:'quiz',actorId:'owner',groupId:'next-genn-edu',expectedRevision:1,syllabuses:[]})).status===403,'forged catalogue actor');
for(const name of ['quizzes','quiz-practice','classrooms','folders','action','learning','manage','conflicts','student-promotions','academic-catalogues','notifications','files','quiz-images','sheet-sync']){const r=await routes[name].POST(new Request('https://test.invalid/api/'+name,{method:'POST',headers:{origin:'https://other.invalid','content-type':'application/json'},body:'{}'}));check(r.status===403,'cross-origin write '+name);}

// A global Sheet secret is bound to its original group before any network call.
Object.assign(runtime.env,{SHEET_SYNC_URL:'https://script.google.com/macros/s/fictional-test/exec',SHEET_SYNC_SECRET:'fictional-test-secret-at-least-32-characters'});
let bridgeCalls=0;globalThis.fetch=async(url,options)=>{check(String(url)===runtime.env.SHEET_SYNC_URL,'only synthetic bridge URL');bridgeCalls++;const signed=JSON.parse(options.body),payload=JSON.parse(signed.body);return Response.json(payload.action==='month'?{ok:true,month:'2032-06',displayMonth:'June 2032'}:{ok:true,changes:[],skipped:[],previewToken:'fictional-preview'});};
for(const id of ['school-b-admin','owner']){await login(id,'school-b');check((await call('sheet-sync',{action:'preview',mode:'billable',groupId:'next-genn-edu'})).status===503,'foreign group bridge denied');}
check(bridgeCalls===0,'foreign group never contacts original Sheet');
await login('next-genn-edu-admin');check((await call('sheet-sync',{action:'preview',mode:'billable'})).status===200,'original group Sheet works');check(bridgeCalls===2,'expected month and preview only');
await login('next-genn-edu-teacher');check((await call('sheet-sync',{action:'preview',mode:'billable'})).status===403,'teacher cannot import Sheet');

// Google password setup uses stored group ownership even with a forged header.
const setupId='fictional-google-group-b';sqlite.prepare('INSERT INTO accounts(id,email,name,role,group_id,created_at,pending_expires_at) VALUES(?,?,?,?,?,?,?)').run(setupId,setupId+'@example.test','Google Setup','pending','school-b',now,new Date(Date.now()+86400000).toISOString());
sqlite.prepare('INSERT INTO google_identities(subject,account_id,email,linked_at) VALUES(?,?,?,?)').run(setupId,setupId,setupId+'@example.test',now);
await login(setupId,'next-genn-edu');check((await call('account-setup',{username:'fictional.setup.b',password:'Fictional-new-pass-123'})).status===200,'Google setup works before business access');
const setupAudit=sqlite.prepare("SELECT group_id FROM audit WHERE actor_id=? AND action='setupCredentials'").all(setupId);check(setupAudit.length===1&&setupAudit[0].group_id==='school-b','setup audit belongs only to stored Group B');
const rejectedId='fictional-google-revoked';sqlite.prepare('INSERT INTO accounts(id,email,name,role,group_id,created_at,pending_expires_at) VALUES(?,?,?,?,?,?,?)').run(rejectedId,rejectedId+'@example.test','Revoked Setup','pending','school-b',now,new Date(Date.now()+86400000).toISOString());sqlite.prepare('INSERT INTO google_identities(subject,account_id,email,linked_at) VALUES(?,?,?,?)').run(rejectedId,rejectedId,rejectedId+'@example.test',now);
await login(rejectedId);const originalBatch=d1.batch;d1.batch=async statements=>{sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,rejectedId);d1.batch=originalBatch;return originalBatch(statements);};
check((await call('account-setup',{username:'fictional.setup.revoked',password:'Fictional-new-pass-123'})).status===409,'revoked during setup rejected');check(!sqlite.prepare('SELECT 1 FROM local_credentials WHERE account_id=?').get(rejectedId),'no revoked credential');check(!sqlite.prepare("SELECT 1 FROM audit WHERE actor_id=? AND action='setupCredentials'").get(rejectedId),'no false setup-success audit');
// A browser session or a token for another privileged task is not export,
// dispatch or cleanup authority. Never execute those tasks in this suite.
Object.assign(runtime.env,{BACKUP_EXPORT_TOKEN:'fictional-backup-secret-with-32-characters',NOTIFICATIONS_CRON_TOKEN:'fictional-notification-secret-with-32-characters',PENDING_CLEANUP_TOKEN:'fictional-cleanup-secret-with-32-characters'});
await login('owner');
for(const [name,method,foreignToken,status] of [['backup-export','GET',runtime.env.NOTIFICATIONS_CRON_TOKEN,404],['notifications/dispatch','POST',runtime.env.PENDING_CLEANUP_TOKEN,404],['pending-cleanup','POST',runtime.env.BACKUP_EXPORT_TOKEN,403]]){
 const handler=(await load('app/api/'+name+'/route.ts')).module;
 for(const token of ['',foreignToken]){
  const response=await handler[method](new Request('https://test.invalid/api/'+name,{method,headers:token?{authorization:'Bearer '+token}:{}}));
  check(response.status===status,'dedicated task secret required '+name);
 }
}
check(sqlite.prepare('PRAGMA integrity_check').get().integrity_check==='ok','SQLite integrity');sqlite.close();
console.log(JSON.stringify({suite:'part01-access-boundaries',checks,database:'isolated SQLite',network:'synthetic Sheet stub only',productionWrites:false}));
