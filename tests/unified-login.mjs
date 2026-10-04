import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {drizzle} from 'drizzle-orm/d1';
import ts from 'typescript';

// Real route handlers, Google signature checks, password hashes and SQLite SQL.
// Only runtime bindings, cookie transport and Google's certificate HTTP response
// are substituted. This harness can never reach a hosted database.
const sqlite=new DatabaseSync(':memory:');
const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort();
for(const file of migrations)sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
function statement(sql,values=[]){return {bind(...args){return statement(sql,args);},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async raw(){const s=sqlite.prepare(sql);s.setReturnArrays(true);return s.all(...values);},async run(){return {meta:sqlite.prepare(sql).run(...values)};},execute(){const s=sqlite.prepare(sql);if(/^\s*(SELECT|PRAGMA|.*RETURNING)/is.test(sql))return {results:s.all(...values),meta:{changes:0}};return {results:[],meta:s.run(...values)};}};}
const d1={prepare:statement,async batch(items){sqlite.exec('BEGIN');try{const results=items.map(s=>s.execute());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
let token='';
const env={DB:d1,GOOGLE_CLIENT_ID:'isolated-test-client',PENDING_CLEANUP_TOKEN:'isolated-cleanup-secret'};
const next={json(data,options){const response=Response.json(data,options);response.cookies={set(name,value){response.headers.set('set-cookie',name+'='+value+'; Path=/; HttpOnly; Secure');},delete(name){response.headers.set('set-cookie',name+'=; Path=/; Max-Age=0');}};return response;}};
globalThis.__unifiedTest={env,NextResponse:next,cookies:async()=>({get:()=>token?{value:token}:undefined}),getDb:()=>drizzle(d1)};
const stub='data:text/javascript;base64,'+Buffer.from('export const {env,NextResponse,cookies,getDb}=globalThis.__unifiedTest;').toString('base64');
const cache=new Map();
async function load(file){if(cache.has(file))return cache.get(file);let source=readFileSync(new URL('../'+file,import.meta.url),'utf8');const imports=[...source.matchAll(/from ["']([^"']+)["']/g)];for(const item of imports){const spec=item[1];let url;if(['cloudflare:workers','next/server','next/headers','@/db'].includes(spec))url=stub;else if(spec.startsWith('@/'))url=(await load(spec.slice(2)+'.ts')).url;else url=import.meta.resolve(spec);source=source.replaceAll(`"${spec}"`,`"${url}"`).replaceAll(`'${spec}'`,`'${url}'`);}const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');const result={url,module:await import(url)};cache.set(file,result);return result;}
const auth=(await load('app/api/auth/route.ts')).module,setup=(await load('app/api/account-setup/route.ts')).module,password=(await load('app/api/password/route.ts')).module,action=(await load('app/api/action/route.ts')).module,state=(await load('app/api/state/route.ts')).module,cleanup=(await load('app/api/pending-cleanup/route.ts')).module;
const authLib=(await load('lib/auth.ts')).module,life=(await load('lib/account-lifecycle.ts')).module;
const key=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',key.publicKey);const originalFetch=globalThis.fetch;
let certificateFetches=0;
globalThis.fetch=async url=>{assert.equal(String(url),'https://www.googleapis.com/oauth2/v3/certs');certificateFetches++;return Response.json({keys:[{...jwk,kid:'test-key'}]},{headers:{'cache-control':'public, max-age=3600'}});};
async function google(id,email){const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const head=enc({alg:'RS256',kid:'test-key'}),body=enc({sub:id,email,name:'Isolated user',aud:env.GOOGLE_CLIENT_ID,iss:'https://accounts.google.com',email_verified:true,exp:Math.floor(Date.now()/1000)+600});return head+'.'+body+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key.privateKey,new TextEncoder().encode(head+'.'+body))).toString('base64url');}
function req(body,path='/api/auth',headers={}){return new Request('https://test.invalid'+path,{method:'POST',headers:{origin:'https://test.invalid','content-type':'application/json',...headers},body:JSON.stringify(body)});}
async function call(handler,body,path){const r=await handler.POST(req(body,path));const data=await r.json();if(r.headers.has('set-cookie'))token=r.headers.get('set-cookie').split(';')[0].split('=')[1];return {status:r.status,data};}
const now=new Date().toISOString(),credential=await google('new-google','student@example.test');
const signedIn=await call(auth,{credential});assert.equal(signedIn.status,200);assert.equal(signedIn.data.account.id,'new-google');assert.equal(signedIn.data.account.requiresAccountSetup,true);let a=(await (await auth.GET()).json()).account;
assert.equal(a.id,'new-google');assert.equal(a.requiresAccountSetup,true);assert.equal(a.assignmentStatus,'PENDING_ASSIGNMENT');assert.equal(Date.parse(a.pendingExpiresAt)-Date.parse(sqlite.prepare('SELECT created_at FROM accounts WHERE id=?').get(a.id).created_at),7*86400000);
const deadline=a.pendingExpiresAt;
assert.equal(await authLib.currentBusinessAccount(),null);assert.equal((await state.GET(new Request('https://test.invalid/api/state'))).status,401);
assert.equal((await call(setup,{username:'ab',password:'12345678'})).status,400);assert.equal((await call(setup,{username:'Student.One',password:'short'})).status,400);
assert.equal((await call(setup,{username:'Student.One',password:'StudentPass26!'})).status,200);
a=(await (await auth.GET()).json()).account;assert.equal(a.id,'new-google');assert.equal(a.username,'student.one');assert.equal(a.requiresAccountSetup,false);assert.equal(a.pendingExpiresAt,deadline);assert.equal(a.emailLoginAvailable,true);
let s=await state.GET(new Request('https://test.invalid/api/state'));assert.equal(s.status,200);s=await s.json();assert.deepEqual(s.lessons,[]);assert.equal('users' in s,false);
assert.equal((await call(action,{action:'activateAccount',userId:a.id},'/api/action')).status,403);
for(const username of ['STUDENT.ONE',' STUDENT@EXAMPLE.TEST ']){token='';const login=await call(auth,{username,password:'StudentPass26!'});assert.equal(login.status,200);assert.deepEqual(login.data.account,(await (await auth.GET()).json()).account);assert.equal(login.data.account.id,a.id);assert.ok(!JSON.stringify(login.data).includes('passwordHash'));}
assert.equal((await call(auth,{credential})).status,200);assert.equal((await (await auth.GET()).json()).account.pendingExpiresAt,deadline,'Re-login never extends expiry');
assert.equal((await call(setup,{username:'replacement',password:'StudentPass26!'})).status,409);
const badSignature=credential.slice(0,-4)+'AAAA';assert.equal((await call(auth,{credential:badSignature})).status,400);
assert.equal(certificateFetches,1,'Google public keys reuse the advertised lifetime without bypassing signature verification');
const unknownKey=Buffer.from(JSON.stringify({alg:'RS256',kid:'unknown-key'})).toString('base64url')+'.'+credential.split('.').slice(1).join('.');
assert.equal((await call(auth,{credential:unknownKey})).status,400);assert.equal(certificateFetches,2,'Unknown key IDs trigger one refresh and are still rejected');
assert.equal((await call(password,{currentPassword:'wrong',newPassword:'NewStudentPass26!'})).status,403);
const oldToken=token;assert.equal((await call(password,{currentPassword:'StudentPass26!',newPassword:'NewStudentPass26!'})).status,200);const newToken=token;token=oldToken;assert.equal(await authLib.currentAccount(),null);token=newToken;

const adminCredential=await google('test-admin','felixtey2016@gmail.com');assert.equal((await call(auth,{credential:adminCredential})).status,200);assert.equal((await call(setup,{username:'test.admin',password:'AdminPass26!'})).status,200);
const adminToken=token;
assert.equal((await call(action,{action:'activateAccount',userId:'new-google'},'/api/action')).status,200);
let row=sqlite.prepare('SELECT * FROM accounts WHERE id=?').get('new-google');assert.ok(row.activated_at);assert.equal(row.pending_expires_at,null);
await call(auth,{credential:await google('bound-student','bound@example.test')});await call(setup,{username:'bound.student',password:'StudentPass26!'});
sqlite.prepare('INSERT INTO students VALUES (?,?,1,?)').run('Test Student','teststudent',now);token=adminToken;
assert.equal((await call(action,{action:'bind',userId:'bound-student',role:'student',studentName:'Test Student'},'/api/action')).status,200);assert.ok(sqlite.prepare('SELECT activated_at FROM accounts WHERE id=?').get('bound-student').activated_at);

function pending(id,expires,activated=null,role='pending'){sqlite.prepare('INSERT INTO accounts (id,email,name,role,created_at,pending_expires_at,activated_at) VALUES (?,?,?,?,?,?,?)').run(id,'',id,role,now,expires,activated);}
pending('expired','2000-01-01T00:00:00.000Z');pending('legacy',null);pending('former-active','2000-01-01T00:00:00.000Z',now);pending('teacher-protected','2000-01-01T00:00:00.000Z',null,'teacher');pending('not-due','2999-01-01T00:00:00.000Z');pending('assigned-protected','2000-01-01T00:00:00.000Z');
sqlite.prepare('INSERT INTO assignments VALUES (?,?,?)').run('test-assignment','assigned-protected','Test Student|Science');
sqlite.prepare('INSERT INTO local_credentials VALUES (?,?,?,?,?)').run('expired','expired-user','irrelevant-hash',0,now);sqlite.prepare('INSERT INTO google_identities VALUES (?,?,?,?)').run('expired-sub','expired','expired@example.test',now);sqlite.prepare('INSERT INTO sessions VALUES (?,?,?)').run('expired-session','expired','2999-01-01T00:00:00.000Z');
assert.equal((await cleanup.POST(req({},'/api/pending-cleanup'))).status,403);
let result=await cleanup.POST(req({},'/api/pending-cleanup',{authorization:'Bearer isolated-cleanup-secret'}));assert.equal(result.status,200);assert.equal((await result.json()).deleted,1);assert.equal(sqlite.prepare('SELECT id FROM accounts WHERE id=?').get('expired'),undefined);
for(const table of ['local_credentials','google_identities','sessions'])assert.equal(sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE account_id=?`).get('expired').n,0);
for(const id of ['legacy','former-active','teacher-protected','not-due','assigned-protected'])assert.ok(sqlite.prepare('SELECT id FROM accounts WHERE id=?').get(id));
assert.equal((await (await cleanup.POST(req({},'/api/pending-cleanup',{authorization:'Bearer isolated-cleanup-secret'}))).json()).deleted,0,'Retry is idempotent');
assert.equal(life.pendingExpired({role:'pending',activatedAt:now,pendingExpiresAt:'2000-01-01'}),false);

// An assignment committed after selection is checked again inside the batch.
pending('race','2000-01-01T00:00:00.000Z');const rawBatch=d1.batch;d1.batch=async items=>{sqlite.prepare('UPDATE accounts SET activated_at=? WHERE id=?').run(now,'race');return rawBatch(items);};
result=await cleanup.POST(req({},'/api/pending-cleanup',{authorization:'Bearer isolated-cleanup-secret'}));assert.equal((await result.json()).deleted,0);assert.ok(sqlite.prepare('SELECT id FROM accounts WHERE id=?').get('race'));d1.batch=rawBatch;
// Unique usernames and concurrent setup cannot create a second credential.
token='';await call(auth,{credential:await google('other-google','other@example.test')});assert.equal((await call(setup,{username:'STUDENT.ONE',password:'StudentPass26!'})).status,409);
assert.equal(sqlite.prepare('SELECT count(*) AS n FROM local_credentials WHERE account_id=?').get('other-google').n,0);
globalThis.fetch=originalFetch;sqlite.close();
console.log('PASS: verified Google signature; original IDs; username/email/password login; mandatory setup; Pending privacy; owner/admin activation; binding; immutable activation; 7-day expiry; legacy protection; guarded atomic cleanup; race; idempotence; username uniqueness; session invalidation. Isolated SQLite only.');
