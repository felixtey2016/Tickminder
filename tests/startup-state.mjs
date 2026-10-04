import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {drizzle} from 'drizzle-orm/sqlite-proxy';
import {and, eq, gt, desc, inArray, sql} from 'drizzle-orm';
import ts from 'typescript';

const sqlite = new DatabaseSync(':memory:');
for (const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
const queries=[];
const db=drizzle(async(sql,values,method)=>{
  queries.push(sql);
  const statement=sqlite.prepare(sql); statement.setReturnArrays(true);
  if(method==='run') return {rows:statement.run(...values)};
  return {rows:method==='get'?statement.get(...values):statement.all(...values)};
});
const runtime={and,eq,gt,desc,inArray,sql,getDb:()=>db,cookies:async()=>({get:()=>token?{value:token}:undefined}),env:{},pendingExpired:a=>Boolean(a.pendingExpiresAt&&!a.activatedAt&&a.pendingExpiresAt<=new Date().toISOString()),lifecycleView:a=>({assignmentStatus:a.activatedAt?'ACTIVE':'PENDING_ASSIGNMENT'}),NextResponse:{json:(data,options)=>Response.json(data,options)},learningCalls:0,classCalls:0};
globalThis.__startup=runtime;
async function module(path) {
  let source=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
  source=source.replace(/^import [\s\S]*? from ["'][^"']+["'];\s*/gm,match=>{
    const names=match.match(/import \{([\s\S]*?)\}/)?.[1];
    if(!names)throw Error('Unexpected import: '+match);
    const clean=names.split(',').map(x=>x.trim()).filter(x=>!x.startsWith('type ')).map(x=>x.replace(/\s+as\s+/g,':')).join(',');
    return `const {${clean}}=globalThis.__startup;\n`;
  });
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}
const schemaSource=fs.readFileSync(new URL('../db/schema.ts',import.meta.url),'utf8');
const schemaJS=ts.transpileModule(schemaSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace('"drizzle-orm/sqlite-core"',JSON.stringify(new URL('../node_modules/drizzle-orm/sqlite-core/index.js',import.meta.url).href));
Object.assign(runtime,await import('data:text/javascript;base64,'+Buffer.from(schemaJS).toString('base64')));
const now=new Date().toISOString(); let token='session-a';
for(const [id,role,teacher,student] of [['teacher-a','teacher','Teacher A',null],['teacher-b','teacher','Teacher B',null],['student-a','student',null,'Student A'],['admin','admin',null,null],['google-setup','student',null,'Student A']]) sqlite.prepare('INSERT INTO accounts(id,email,name,role,teacher_name,student_name,created_at,name_confirmed_at,activated_at)VALUES(?,?,?,?,?,?,?,?,?)').run(id,id+'@example.test',id,role,teacher,student,now,now,now);
for(const id of ['teacher-a','teacher-b','student-a','admin'])sqlite.prepare('INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES(?,?,?,0,?)').run(id,id,'fixture-only',now);
sqlite.prepare('INSERT INTO google_identities(subject,account_id,email,linked_at)VALUES(?,?,?,?)').run('proof','google-setup','setup@example.test',now);
const auth=await module('lib/auth.ts');Object.assign(runtime,auth);
async function login(id,expires=Date.now()+60000){token='session-'+id;sqlite.prepare('INSERT OR REPLACE INTO sessions(token_hash,account_id,expires_at)VALUES(?,?,?)').run(await auth.hashToken(token),id,new Date(expires).toISOString());}
await login('teacher-a');queries.length=0;assert.equal((await auth.currentBusinessAccount()).id,'teacher-a');assert.equal(queries.length,1,'Identity must be fetched with a single query');assert.ok(!queries[0].includes('password_hash'));
await login('google-setup');assert.equal(await auth.currentBusinessAccount(),null);assert.equal((await auth.currentAccount()).id,'google-setup');
await login('teacher-a',Date.now()-1000);assert.equal(await auth.currentAccount(),null);
await login('teacher-a');sqlite.prepare("UPDATE accounts SET disabled_at=? WHERE id='teacher-a'").run(now);assert.equal(await auth.currentAccount(),null);sqlite.prepare("UPDATE accounts SET disabled_at=NULL WHERE id='teacher-a'").run();
sqlite.prepare("UPDATE local_credentials SET must_change_password=1 WHERE account_id='teacher-a'").run();assert.equal(await auth.currentBusinessAccount(),null);sqlite.prepare("UPDATE local_credentials SET must_change_password=0 WHERE account_id='teacher-a'").run();
Object.assign(runtime,await module('lib/roster.ts'),await module('lib/access.ts'),await module('lib/lesson-rules.ts'),await module('lib/revision.ts'));
runtime.currentAccount=auth.currentBusinessAccount;
runtime.rows=async(sql,...args)=>sqlite.prepare(sql).all(...args);
runtime.mergedAccountNames=async()=>new Map();
runtime.learningState=async()=>{runtime.learningCalls++;return{materials:[],homework:[],submissions:[],studyBlocks:[],eligible:[]};};
runtime.classroomsState=async()=>{runtime.classCalls++;return[];};
for(const suffix of ['A','B']){sqlite.prepare('INSERT INTO teachers(name,created_at)VALUES(?,?)').run('Teacher '+suffix,now);sqlite.prepare('INSERT INTO students(name,name_key,created_at)VALUES(?,?,?)').run('Student '+suffix,suffix,now);sqlite.prepare('INSERT INTO plans(key,student,subject,teacher_name,created_at)VALUES(?,?,?,?,?)').run('Student '+suffix+'|Science','Student '+suffix,'Science','Teacher '+suffix,now);}
for(const [id,student,teacher,status] of [['own','Student A','Teacher A','scheduled'],['cancel','Student A','Teacher A','cancelled'],['foreign','Student B','Teacher B','scheduled'],['inactive','Student B','Teacher A','scheduled']])sqlite.prepare('INSERT INTO lessons(id,student,subject,teacher_name,planned_start,planned_end,status,created_by,updated_at)VALUES(?,?,?,?,?,?,?,?,?)').run(id,student,'Science',teacher,'2026-10-10T12:00:00Z','2026-10-10T13:00:00Z',status,'fixture',now);
const route=await module('app/api/state/route.ts');
const get=async scope=>{const response=await route.GET(new Request('https://example.test/api/state?month=2026-10'+(scope?'&scope='+scope:'')));return{status:response.status,data:await response.json()};};
await login('teacher-a');queries.length=0;let response=await get('core');assert.equal(response.status,200);assert.deepEqual(response.data.lessons.map(l=>l.id).sort(),['cancel','own']);assert.equal(runtime.learningCalls,0);assert.equal(runtime.classCalls,0);assert.equal(response.data.users,undefined);assert.ok(queries.some(q=>q.includes('"lessons"."teacher_name" = ?')));assert.equal((await get('accounts')).status,403);assert.equal((await get('activity')).status,403);
response=await get('learning');assert.deepEqual(response.data.loadedScopes,['learning']);assert.equal(response.data.lessons,undefined);assert.equal(runtime.learningCalls,1);
response=await get();assert.ok(response.data.learning);assert.ok(response.data.classrooms);assert.ok(response.data.terms);assert.deepEqual(response.data.lessons.map(l=>l.id).sort(),['cancel','own']);
await login('student-a');response=await get('core');assert.deepEqual(response.data.lessons.map(l=>l.id),['own']);assert.equal(response.data.plans,undefined);assert.equal(response.data.users,undefined);
await login('admin');response=await get('core');assert.equal(response.data.lessons.length,4);assert.equal(response.data.users,undefined);response=await get('accounts');assert.equal(response.data.users.length,5);assert.ok(!JSON.stringify(response.data).includes('fixture-only'));assert.equal((await get('invalid')).status,400);
token=null;assert.equal((await get('core')).status,401);
sqlite.close();console.log('PASS startup: one identity query; expiry/disabled/setup/password gates; role-filtered SQL; teacher active plans; student cancellation privacy; lazy scopes; admin-only scopes; compatible full response; no credential hashes returned.');
