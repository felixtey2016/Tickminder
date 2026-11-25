import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createFixtureLoader} from './fixture-loader.mjs';

const sqlite=new DatabaseSync(':memory:');
for(const name of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
let actor=null,hook=null,checks=0;const queries=[];
function statement(sql,values=[]){return {bind:(...next)=>statement(sql,next),all:async()=>execute(),first:async()=>execute().results[0]||null,run:async()=>execute()};function execute(){
 assert(values.length<=100);assert(/^\s*SELECT\b/i.test(sql),'Selector must only read');queries.push(sql);
 if(hook?.phase==='before'&&sql.includes('FROM students s')){const run=hook.run;hook=null;run();}
 const results=sqlite.prepare(sql).all(...values);
 if(hook?.phase==='after'&&sql.includes('FROM students s')){const run=hook.run;hook=null;run();}
 return{results,meta:{changes:0}};
}}
const db={prepare:statement,batch:async()=>{throw Error('No writes or batches expected')}};
globalThis.__billingSelector={learningDb:()=>db,currentBusinessAccount:async()=>actor,OWNER_EMAIL:'owner@selector.example.test',isOwnerAccount:a=>a.role==='admin'&&a.email==='owner@selector.example.test'&&!a.id.startsWith('local:')};
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const runtimeUrl=url('export const {learningDb,currentBusinessAccount,OWNER_EMAIL,isOwnerAccount}=globalThis.__billingSelector;');
const environmentUrl=url("export const env={ADMIN_PERMISSIONS_MODE:'enforced'};");
const nextUrl=url('export const NextResponse={json:(data,options)=>Response.json(data,options)};');
const load=createFixtureLoader({runtimeUrl,environmentUrl,runtimeFiles:['lib/auth.ts','lib/owner.ts','lib/learning-server.ts'],transform:(_file,code)=>code.replaceAll("'next/server'",JSON.stringify(nextUrl)).replaceAll('"next/server"',JSON.stringify(nextUrl))});
const route=(await load('app/api/billing/route.ts')).module,session=(await load('lib/account-session.ts')).module;
const now=new Date().toISOString(),group='selector-school-a',foreign='selector-school-b';
for(const id of[group,foreign])sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,id,now,now);
function account(id,role='admin',groupId=group,email=id+'@selector.example.test'){const a={id,role,email,groupId,name:id};sqlite.prepare('INSERT INTO accounts(id,email,name,role,group_id,created_at) VALUES(?,?,?,?,?,?)').run(id,email,id,role,groupId,now);return a;}
const owner=account('selector-owner','admin',group,'owner@selector.example.test'),chief=account('selector-chief'),fees=account('selector-fees'),invoiceOnly=account('selector-invoices'),outside=account('selector-outside','admin',foreign),teacher=account('selector-teacher','teacher'),student=account('selector-student','student'),parent=account('selector-parent','parent');
sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run(chief.id,group);
function grants(a,keys){sqlite.prepare("INSERT INTO admin_permission_profiles(group_id,account_id,revision,grants_json,origin,updated_at) VALUES(?,?,1,?,'new',?) ON CONFLICT(group_id,account_id) DO UPDATE SET grants_json=excluded.grants_json,revision=revision+1").run(a.groupId,a.id,JSON.stringify(keys),now);}
grants(fees,['fees.view']);grants(invoiceOnly,['invoices.view']);grants(outside,['fees.view']);
for(const [name,g,active]of[['Active',group,1],['Inactive',group,0],['Shared',group,1],['Cleaned',group,0],['Shared',foreign,1],['Foreign Only',foreign,1]])sqlite.prepare('INSERT INTO students(group_id,name,name_key,active,created_at) VALUES(?,?,?,?,?)').run(g,name,name.toLowerCase(),active,now);
sqlite.prepare("INSERT INTO student_offboarding(group_id,student_name,status,revision,marked_by,marked_at,updated_by,updated_at,cleaned_at) VALUES(?,?,'cleaned',1,?,?,?,?,?)").run(group,'Cleaned',owner.id,now,owner.id,now,now);
const check=(condition,message)=>{assert(condition,message);checks++;};
async function get(a){actor=a;const response=await route.GET(new Request('https://selector.example.test/api/billing?view=students'));return{status:response.status,data:await response.json(),cache:response.headers.get('cache-control')};}
const totalChanges=()=>sqlite.prepare('SELECT total_changes() AS n').get().n;
for(const a of[owner,chief,fees]){const before=totalChanges(),start=queries.length,r=await get(a);check(r.status===200,'Authorized fees viewer can read options');assert.deepEqual(r.data,{students:['Active','Inactive','Shared']});checks++;check(totalChanges()===before,'Selector changes no rows');check(queries.slice(start).length===3,'Only start guard, names, and end guard are read');check(!queries.slice(start).some(q=>/\b(?:billing_students|billing_subjects|billing_rates|billing_policy_versions|lessons|class_sessions)\b/.test(q)),'No finance identity, fee or course read');check(r.cache==='private, no-store','Private no-store response');}
for(const a of[null,invoiceOnly,teacher,student,parent])check((await get(a)).status===(a?403:401),'Anonymous or unrelated permission cannot read fee selector');
assert.deepEqual((await get(outside)).data,{students:['Foreign Only','Shared']});checks++;
check((await get({...outside,groupId:group})).status===403,'Selecting another group cannot expand ordinary admin scope');
hook={phase:'before',run:()=>grants(fees,[])};check((await get(fees)).status===403,'Revocation before row query rejects response');grants(fees,['fees.view']);
hook={phase:'after',run:()=>grants(fees,[])};check((await get(fees)).status===403,'Revocation after row query rejects buffered rows');grants(fees,['fees.view']);
sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run('fictional-selector-session',fees.id,'9999-12-31T00:00:00.000Z');session.bindAccountSession(fees,'fictional-selector-session');check((await get(fees)).status===200,'Bound live session works');
hook={phase:'before',run:()=>sqlite.prepare('DELETE FROM sessions WHERE token_hash=?').run('fictional-selector-session')};check((await get(fees)).status===403,'Session invalidated during read is rejected');
sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,owner.id);check((await get(owner)).status===403,'Disabled owner is rejected');sqlite.prepare('UPDATE accounts SET disabled_at=NULL WHERE id=?').run(owner.id);
sqlite.prepare('UPDATE tuition_groups SET active=0 WHERE id=?').run(group);check((await get(owner)).status===403,'Inactive group is rejected');sqlite.close();
console.log(JSON.stringify({passed:true,checks,productionQueries:0,networkRequests:0,fixtures:'in-memory SQLite; real route and authorization SQL'}));
