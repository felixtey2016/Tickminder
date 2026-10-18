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

const route=(await load('app/api/whatsapp/route.ts')).module;
runtime.env.WHATSAPP_SELF_ENROLL_GROUPS='next-genn-edu';runtime.env.WHATSAPP_BOT_NUMBER='60100000000';
const request=body=>new Request('https://test.invalid/api/whatsapp',body?{method:'POST',headers:{origin:'https://test.invalid','content-type':'application/json'},body:JSON.stringify(body)}:{});
async function call(body){const response=await route[body?'POST':'GET'](request(body));return {status:response.status,data:await response.json()};}
// Existing centre administrators can bind themselves without becoming students
// or receiving participant Bot permissions. Global owners retain tenant checks.
await login('next-genn-edu-admin');
assert.equal((await call()).data.botAccess,'contact_only');
assert.equal((await call({action:'start',phone:runtime.env.WHATSAPP_BOT_NUMBER,consent:true})).status,400);
let adminResult=await call({action:'start',phone:'60777777777',consent:true});assert.equal(adminResult.status,200);
assert.equal(sqlite.prepare('SELECT identity_name FROM whatsapp_challenges WHERE account_id=?').get('next-genn-edu-admin').identity_name,'next-genn-edu-admin');
assert.equal((await call({action:'finish'})).status,409);
sqlite.prepare("INSERT INTO whatsapp_contacts(account_id,group_id,phone,identity_role,identity_name,verified_at) VALUES('next-genn-edu-admin','next-genn-edu','60777777777','admin','next-genn-edu-admin',?)").run(now);
assert.equal((await call()).data.verified,true);assert.equal((await call({action:'finish'})).status,200);
assert.equal(sqlite.prepare('SELECT role FROM accounts WHERE id=?').get('next-genn-edu-admin').role,'admin');
assert.equal(sqlite.prepare('SELECT count(*) n FROM students WHERE name=?').get('next-genn-edu-admin').n,0);
await login('next-genn-edu-admin','school-b');assert.equal((await call()).status,403);
await login('school-b-admin');assert.equal((await call()).status,403);
await login('owner');assert.equal((await call()).status,200);assert.equal((await call()).data.botAccess,'contact_only');
await login('owner','school-b');assert.equal((await call()).status,403);
sqlite.prepare("UPDATE tuition_groups SET active=0 WHERE id='next-genn-edu'").run();await login('owner');assert.equal((await call()).status,403);sqlite.prepare("UPDATE tuition_groups SET active=1 WHERE id='next-genn-edu'").run();
cookieValues={};
const pending='next-genn-edu-pending';
let result=await call();assert.equal(result.status,403);
await login(pending);
result=await call({action:'start',phone:'+60123456789',consent:false});assert.equal(result.status,400);
result=await call({action:'start',phone:'0123456789',consent:true});assert.equal(result.status,400);
result=await call({action:'finish'});assert.equal(result.status,409);
result=await route.POST(new Request('https://test.invalid/api/whatsapp',{method:'POST',headers:{origin:'https://evil.invalid','content-type':'application/json'},body:'{}'}));assert.equal(result.status,403);
result=await call({action:'start',phone:'+60 1234 56789',consent:true,role:'teacher'});assert.equal(result.status,200,JSON.stringify(result));assert.match(result.data.code,/^NG-[A-F0-9]{32}$/);assert.ok(result.data.url.startsWith('https://wa.me/60100000000?text=NG-'));
assert.equal(sqlite.prepare('SELECT identity_role FROM whatsapp_challenges WHERE account_id=?').get(pending).identity_role,'pending');
assert.equal(sqlite.prepare('SELECT token_hash FROM whatsapp_challenges WHERE account_id=?').get(pending).token_hash,await auth.hashToken(result.data.code));
assert.equal((await call()).data.verified,false);
const stamp=new Date().toISOString();
sqlite.prepare("INSERT INTO google_identities VALUES('fixture-google',?,'newstudent@example.test',?)").run(pending,stamp);
sqlite.prepare("INSERT INTO whatsapp_contacts(account_id,group_id,phone,identity_role,identity_name,verified_at) VALUES(?,'next-genn-edu','60123456789','pending',?,?)").run(pending,pending,stamp);
assert.equal((await call()).data.verified,true);
result=await call({action:'finish'});assert.equal(result.status,200,JSON.stringify(result));
assert.equal(sqlite.prepare('SELECT role FROM accounts WHERE id=?').get(pending).role,'student');
assert.equal(sqlite.prepare('SELECT count(*) n FROM students WHERE group_id=? AND name=?').get('next-genn-edu',pending).n,1);
assert.equal(sqlite.prepare('SELECT identity_role FROM whatsapp_contacts WHERE account_id=?').get(pending).identity_role,'student');
assert.equal(sqlite.prepare('SELECT count(*) n FROM plans WHERE student=?').get(pending).n,0);
assert.equal((await call({action:'finish'})).status,200);
// A second Google registration must not inherit a same-name student's records.
const second='pending-second';sqlite.prepare("INSERT INTO accounts(id,group_id,email,name,role,created_at,name_confirmed_at) VALUES(?,'next-genn-edu','duplicate@example.test','Student Same','pending',?,?)").run(second,stamp,stamp);
sqlite.prepare("INSERT INTO local_credentials VALUES(?,?,'unused',0,?)").run(second,second,stamp);
sqlite.prepare("INSERT INTO google_identities VALUES('google-second',?,'duplicate@example.test',?)").run(second,stamp);
sqlite.prepare("INSERT INTO whatsapp_contacts(account_id,group_id,phone,identity_role,identity_name,verified_at) VALUES(?,'next-genn-edu','60987654321','pending','Student Same',?)").run(second,stamp);
await login(second);assert.equal((await call({action:'finish'})).status,409);assert.equal(sqlite.prepare('SELECT role FROM accounts WHERE id=?').get(second).role,'pending');
assert.equal((await call({action:'start',phone:'60123456789',consent:true})).status,409);
await login('next-genn-edu-teacher','school-b');assert.equal((await call()).status,403);
await login('next-genn-edu-teacher');for(let i=0;i<5;i++)assert.equal((await call({action:'start',phone:'60888888888',consent:true})).status,200);assert.equal((await call({action:'start',phone:'60888888888',consent:true})).status,429);
sqlite.prepare("UPDATE accounts SET disabled_at='disabled' WHERE id='next-genn-edu-teacher'").run();assert.equal((await call()).status,403);
console.log('PASS WhatsApp onboarding: existing admin binding, owner scope, unchanged admin role/contact-only access, origin, account setup, consent, country code, challenge hashes, duplicate phones, rate limits, group isolation, verified student self-registration, no same-name inheritance, no inferred courses.');
