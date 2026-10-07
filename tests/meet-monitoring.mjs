import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import ts from 'typescript';
const db=new DatabaseSync(':memory:');
for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
db.exec('PRAGMA foreign_keys=ON');
function statement(sql,values=[]){return{bind(...v){return statement(sql,v);},async first(){return db.prepare(sql).get(...values)||null;},async all(){return{results:db.prepare(sql).all(...values)};},async run(){return{meta:db.prepare(sql).run(...values)};},execute(){const s=db.prepare(sql);return /^\s*(SELECT|PRAGMA)/i.test(sql)?{results:s.all(...values)}:{meta:s.run(...values)};}};}
const d1={prepare:statement,async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.execute());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const now=Date.now(),at=new Date(now).toISOString(),start=new Date(now-7200000).toISOString(),end=new Date(now-3600000).toISOString();
let account={id:'ta',role:'teacher',teacherName:'Teacher A',studentName:null};
const env={DB:d1,MEET_OAUTH_CLIENT_ID:'test-client',MEET_OAUTH_CLIENT_SECRET:'test-secret',MEET_OAUTH_REDIRECT_URI:'https://test.invalid/api/meet/callback',MEET_TOKEN_KEY:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'),MEET_CRON_TOKEN:'test-meet-cron-'.repeat(3)};
const cookieMap=new Map();const cookies=async()=>({get:k=>cookieMap.has(k)?{value:cookieMap.get(k)}:undefined,set:(k,v)=>cookieMap.set(k,v),delete:k=>cookieMap.delete(k)});
const hashToken=async s=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('base64url');
globalThis.__meetTest={env,hashToken,cookies,learningDb:()=>d1,rows:async(sql,...v)=>(await statement(sql,v).all()).results,first:async(sql,...v)=>statement(sql,v).first(),currentBusinessAccount:async()=>account};
const stub='data:text/javascript;base64,'+Buffer.from('export const {env,hashToken,cookies,learningDb,rows,first,currentBusinessAccount}=globalThis.__meetTest;').toString('base64'),cache=new Map();
async function load(file){if(cache.has(file))return cache.get(file);let s=readFileSync(new URL('../'+file,import.meta.url),'utf8');for(const [,spec] of [...s.matchAll(/from ["']([^"']+)["']/g)]){const url=['cloudflare:workers','next/headers','@/lib/learning-server','@/lib/auth'].includes(spec)?stub:spec.startsWith('@/')?(await load(spec.slice(2)+'.ts')).url:import.meta.resolve(spec);s=s.replaceAll('"'+spec+'"','"'+url+'"');}const url='data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'),r={url,module:await import(url)};cache.set(file,r);return r;}
const pure=(await load('lib/meet.ts')).module,server=(await load('lib/meet-server.ts')).module,provider=(await load('lib/meet-provider.ts')).module;
const route=(await load('app/api/meet/route.ts')).module,callback=(await load('app/api/meet/callback/route.ts')).module,dispatch=(await load('app/api/meet/dispatch/route.ts')).module;
for(const [id,role,teacher,student] of [['ta','teacher','Teacher A',null],['tb','teacher','Teacher B',null],['sa','student',null,'Student A'],['sb','student',null,'Student B'],['admin','admin',null,null]])db.prepare('INSERT INTO accounts (id,email,name,role,teacher_name,student_name,created_at,activated_at) VALUES (?,?,?,?,?,?,?,?)').run(id,'',id,role,teacher,student,at,at);
for(const n of ['Teacher A','Teacher B'])db.prepare('INSERT INTO teachers (name,active,created_at) VALUES (?,1,?)').run(n,at);
for(const n of ['Student A','Student B'])db.prepare('INSERT INTO students (name,name_key,active,created_at) VALUES (?,?,1,?)').run(n,n.toLowerCase(),at);
for(const [s,t,c] of [['Student A','Teacher A','abc-defg-hij'],['Student B','Teacher B','klm-nopq-rst']])db.prepare('INSERT INTO plans (key,student,subject,teacher_name,duration,active,online_link,created_at) VALUES (?,?,?,?,1,1,?,?)').run(s,s,'Science',t,'https://meet.google.com/'+c,at);
for(const [id,s,t] of [['la','Student A','Teacher A'],['lb','Student B','Teacher B']])db.prepare('INSERT INTO lessons (id,student,subject,teacher_name,planned_start,planned_end,status,created_by,updated_at) VALUES (?,?,?,?,?,?,\'scheduled\',?,?)').run(id,s,'Science',t,start,end,'ta',at);
for(const [subject,id] of [['101','ta'],['201','sa'],['202','sb']])db.prepare('INSERT INTO google_identities (subject,account_id,email,linked_at) VALUES (?,?,?,?)').run(subject,id,id+'@example.test',at);
const mk=(minutes)=>new Date(Date.parse(start)+minutes*60000).toISOString();
let mode='normal',calls=[];
globalThis.fetch=async(url,init={})=>{
 const u=new URL(url);calls.push(u.pathname);
 if(mode==='network')throw new TypeError('fetch failed');
 if(mode==='denied'&&u.hostname==='meet.googleapis.com')return new Response('{}',{status:403});
 if(u.hostname==='oauth2.googleapis.com')return Response.json({access_token:'fake-access',refresh_token:'fake-refresh',scope:'openid email https://www.googleapis.com/auth/meetings.space.readonly'});
 if(u.hostname==='openidconnect.googleapis.com')return Response.json({sub:'101',email:'teacher@example.test',email_verified:true});
 if(u.pathname==='/v2/conferenceRecords'){
  if(mode==='reassign')db.prepare("UPDATE lessons SET teacher_name='Teacher B' WHERE id='la'").run();
  assert.match(u.searchParams.get('filter'),/space.meeting_code = "abc-defg-hij"/);
  return Response.json({conferenceRecords:[{name:'conferenceRecords/c1',startTime:mk(-15),endTime:mk(70)}]});
 }
 if(u.pathname==='/v2/conferenceRecords/c1/participants')return Response.json(u.searchParams.get('pageToken')?{participants:[{name:'conferenceRecords/c1/participants/guest',anonymousUser:{displayName:'PRIVATE PEER'},latestEndTime:mk(50)}]}:{participants:[{name:'conferenceRecords/c1/participants/t',signedinUser:{user:'users/101',displayName:'Teacher A'},latestEndTime:mk(70)},{name:'conferenceRecords/c1/participants/s',signedinUser:{user:'users/201',displayName:'Student A'},latestEndTime:mk(50)}],nextPageToken:'page-2'});
 if(u.pathname.includes('/participantSessions')){
  const p=u.pathname.includes('/participants/t/')?'t':'s';
  const windows=p==='t'?[[-15,70]]:[[5,20],[30,50],[10,25]];
  return Response.json({participantSessions:windows.map(([s,e],i)=>({name:`conferenceRecords/c1/participants/${p}/participantSessions/s${i}`,startTime:mk(s),endTime:mk(e)}))});
 }
 throw Error('Unexpected provider URL');
};
const req=(body,origin='https://test.invalid')=>new Request('https://test.invalid/api/meet',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const get=(id)=>route.GET(new Request('https://test.invalid/api/meet'+(id?'?lessonId='+id:'')));
const call=body=>route.POST(req(body));
// Strict provider URL parsing and adjacent-course interval boundaries.
for(const link of ['http://meet.google.com/abc-defg-hij','https://meet.google.com.attacker.test/abc-defg-hij','https://user@meet.google.com/abc-defg-hij','https://meet.google.com:444/abc-defg-hij','https://example.test/abc-defg-hij','https://meet.google.com/lookup/test'])assert.equal(pure.meetCode(link),null);
assert.equal(pure.meetCode('https://meet.google.com/abc-defg-hij?authuser=1'),'abc-defg-hij');
assert.equal(pure.overlapSeconds([[0,3600000]],[[3600000,7200000]]),0);
assert.deepEqual(pure.mergeIntervals([[0,10],[5,15],[20,30],[15,20]]),[[0,30]]);
assert.equal(server.meetConfigured(),true);
const sealed=await server.sealMeet('private-refresh','ta:refresh');assert.ok(!sealed.includes('private-refresh'));
assert.equal(await server.openMeet(sealed,'ta:refresh'),'private-refresh');await assert.rejects(()=>server.openMeet(sealed,'tb:refresh'));
// OAuth: origin, role, state ownership, PKCE, one-use code and partial grants.
assert.equal((await route.POST(req({action:'connect'},'https://attacker.test'))).status,403);
let r=await call({action:'connect'});assert.equal(r.status,200);let oauth=new URL((await r.json()).url);assert.equal(oauth.searchParams.get('code_challenge_method'),'S256');assert.equal(oauth.searchParams.get('access_type'),'offline');assert.equal(oauth.hostname,'accounts.google.com');
const state=oauth.searchParams.get('state');assert.ok(cookieMap.get('tickminder_meet_state'));
account={id:'tb',role:'teacher',teacherName:'Teacher B',studentName:null};await assert.rejects(()=>server.finishMeetOAuth(account,state,'code'));
account={id:'ta',role:'teacher',teacherName:'Teacher A',studentName:null};await server.finishMeetOAuth(account,state,'code');await assert.rejects(()=>server.finishMeetOAuth(account,state,'replay'));
const conn=db.prepare('SELECT * FROM meet_connections').get();assert.notEqual(conn.refresh_cipher,'fake-refresh');assert.ok(!JSON.stringify(await(await get()).json()).includes('refresh_cipher'));
// No grant/token leaks; browser cancellation and missing state are safe.
const cb=await callback.GET(new Request('https://test.invalid/api/meet/callback?state=wrong&code=SECRET_CODE'));assert.equal(cb.status,303);assert.ok(!cb.headers.get('location').includes('SECRET_CODE'));
// Permission boundaries, including forged IDs and admin access.
assert.equal((await get('lb')).status,403);
assert.equal((await call({action:'sync',lessonId:'lb'})).status,403);
const lessonsBefore=db.prepare('SELECT * FROM lessons ORDER BY id').all();
r=await call({action:'sync',lessonId:'la'});assert.equal(r.status,200);const evidence=await r.json();
assert.equal(evidence.current.summary.teacherSeconds,3600);assert.equal(evidence.current.summary.studentSeconds,2400);assert.equal(evidence.current.summary.commonSeconds,2400);assert.equal(evidence.current.summary.status,'ended');
assert.ok(!calls.some(p=>p.includes('/participants/guest/')),'Unrelated/anonymous sessions must not be queried');
assert.deepEqual(db.prepare('SELECT * FROM lessons ORDER BY id').all(),lessonsBefore,'Detection must not change attendance/hours/fees');
assert.equal((await call({action:'sync',lessonId:'la'})).status,409,'Repeated clicks must not cause duplicate polling');
account={id:'sa',role:'student',teacherName:null,studentName:'Student A'};
assert.equal((await get('lb')).status,403);assert.equal((await call({action:'sync',lessonId:'la'})).status,403);assert.equal((await call({action:'connect'})).status,403);
const student=await(await get('la')).json();assert.ok(!JSON.stringify(student).includes('PRIVATE PEER'));assert.ok(!JSON.stringify(student).includes('users/'));assert.ok(!JSON.stringify(student).includes('example.test'));assert.equal(student.current.participants.length,2);
account={id:'tb',role:'teacher',teacherName:'Teacher B',studentName:null};assert.equal((await get('la')).status,403);
account={id:'admin',role:'admin',teacherName:null,studentName:null};assert.equal((await get('la')).status,200);
// Stale live data, unmatched identities and multiple devices cannot imply presence.
const currentEvidence=JSON.parse(db.prepare('SELECT evidence_json FROM meet_observations').get().evidence_json);
currentEvidence.conferences[0].endTime=null;currentEvidence.observedAt=new Date(now-300000).toISOString();
assert.equal(pure.summarizeMeet(currentEvidence,start,end,new Set(['users/101']),new Set(['users/201'])).status,'stale');
assert.equal(pure.summarizeMeet(currentEvidence,start,end,new Set(['users/101']),new Set(['users/999'])).commonSeconds,null);
// Link/time edits preserve old immutable snapshots and require a fresh snapshot.
db.prepare('UPDATE lessons SET planned_start=?,planned_end=? WHERE id=?').run(mk(120),mk(180),'la');
let edited=await(await get('la')).json();assert.equal(edited.current,null);assert.equal(edited.history.length,1);
db.prepare('UPDATE lessons SET planned_start=?,planned_end=? WHERE id=?').run(start,end,'la');
db.prepare('UPDATE meet_observations SET attempted_at=NULL,next_sync_at=?').run(at);mode='denied';
account={id:'ta',role:'teacher',teacherName:'Teacher A',studentName:null};assert.equal((await call({action:'sync',lessonId:'la'})).status,403);assert.equal(db.prepare('SELECT last_error FROM meet_observations').get().last_error,'denied');assert.ok(db.prepare('SELECT evidence_json FROM meet_observations').get().evidence_json);
assert.equal((await call({action:'sync',lessonId:'la'})).status,409,'Failure retries are throttled too');
db.prepare('UPDATE meet_observations SET attempted_at=NULL').run();mode='network';assert.equal((await call({action:'sync',lessonId:'la'})).status,503);
db.prepare('UPDATE meet_observations SET attempted_at=NULL').run();mode='normal';
const pair=await Promise.all([call({action:'sync',lessonId:'la'}),call({action:'sync',lessonId:'la'})]);assert.deepEqual(pair.map(r=>r.status).sort(),[200,409]);

// Reassignment to a teacher using the same URL/times must reject in-flight data.
db.prepare('INSERT INTO plans (key,student,subject,teacher_name,duration,active,online_link,created_at) VALUES (?,?,?,?,1,1,?,?)').run('reassigned-plan','Student A','Science','Teacher B','https://meet.google.com/abc-defg-hij',at);
const beforeReassignment=db.prepare('SELECT evidence_json FROM meet_observations').get().evidence_json;
db.prepare('UPDATE meet_observations SET attempted_at=NULL').run();mode='reassign';
assert.equal((await call({action:'sync',lessonId:'la'})).status,409);
assert.equal(db.prepare('SELECT evidence_json FROM meet_observations').get().evidence_json,beforeReassignment);
account={id:'admin',role:'admin',teacherName:null,studentName:null};assert.equal((await(await get('la')).json()).current,null);
db.prepare("UPDATE lessons SET teacher_name='Teacher A' WHERE id='la'").run();db.prepare("DELETE FROM plans WHERE key='reassigned-plan'").run();mode='normal';
account={id:'ta',role:'teacher',teacherName:'Teacher A',studentName:null};
db.prepare('UPDATE lessons SET status=\'cancelled\' WHERE id=\'la\'').run();assert.equal((await call({action:'sync',lessonId:'la'})).status,403);db.prepare('UPDATE lessons SET status=\'scheduled\' WHERE id=\'la\'').run();
// Protected dispatch; unconfigured integration cannot claim it is running.
assert.equal((await dispatch.POST(new Request('https://test.invalid/api/meet/dispatch',{method:'POST'}))).status,404);
const savedKey=env.MEET_TOKEN_KEY;env.MEET_TOKEN_KEY=undefined;assert.equal(server.meetConfigured(),false);assert.equal((await call({action:'sync',lessonId:'la'})).status,503);env.MEET_TOKEN_KEY=savedKey;
await server.dispatchMeet();assert.ok(db.prepare('SELECT last_dispatch_at FROM meet_runtime').get());
// Separate clock configuration cannot dispatch staging calls to production.
const clock=(await load('services/lesson-reminder-clock/src/index.ts')).module.default,providerFetch=globalThis.fetch;
let clockCalls=[];globalThis.fetch=async(url,init)=>{clockCalls.push([new URL(url).origin,new URL(url).pathname,init.headers.Authorization]);return new Response(null,{status:200});};
async function runClock(origin,meetToken){const pending=[];await clock.scheduled({}, {TICKMINDER_ORIGIN:origin,NOTIFICATIONS_CRON_TOKEN:'fake-notifications-'.repeat(3),MEET_CRON_TOKEN:meetToken}, {waitUntil:p=>pending.push(p)});await Promise.all(pending);}
await runClock('https://timelyo-learning-staging.zezhou2009.chatgpt.site',env.MEET_CRON_TOKEN);
assert.equal(clockCalls.length,2);assert.ok(clockCalls.every(c=>c[0]==='https://timelyo-learning-staging.zezhou2009.chatgpt.site'));assert.equal(clockCalls[1][1],'/api/meet/dispatch');assert.equal(clockCalls[1][2],'Bearer '+env.MEET_CRON_TOKEN);
clockCalls=[];await runClock('https://www.tickminder.com');assert.equal(clockCalls.length,1);assert.equal(clockCalls[0][1],'/api/notifications/dispatch');
await assert.rejects(()=>runClock('https://attacker.test',env.MEET_CRON_TOKEN));globalThis.fetch=providerFetch;
// Expanded encrypted backup restores all 32 tables, without embedding token keys.
const tables={};for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){const columns=db.prepare(`PRAGMA table_info("${name}")`).all().map(r=>r.name);tables[name]={columns,rows:db.prepare(`SELECT * FROM "${name}"`).all()};}
const temp=mkdtempSync(path.join(tmpdir(),'tickminder-meet-backup-'));
try{const target=path.join(temp,'db.dpapi'),input=JSON.stringify({format:'timelyo-d1-v8',tables});const result=spawnSync(process.execPath,[new URL('../scripts/secure-d1-backup.mjs',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),'backup','--out',target],{input,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);const restored=spawnSync(process.execPath,[new URL('../scripts/secure-d1-backup.mjs',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),'verify','--in',target],{encoding:'utf8',windowsHide:true});assert.equal(restored.status,0,restored.stderr);assert.equal(Object.keys(JSON.parse(restored.stdout).counts).length,32);}finally{rmSync(temp,{recursive:true,force:true});}
// Account and lesson deletion cascade private OAuth data and observations.
await server.disconnectMeet(account);assert.equal(db.prepare('SELECT count(*) n FROM meet_connections').get().n,0);
db.prepare('DELETE FROM lessons WHERE id=?').run('la');assert.equal(db.prepare('SELECT count(*) n FROM meet_observations').get().n,0);
db.prepare('INSERT INTO meet_oauth_states (state_hash,account_id,verifier_cipher,expires_at) VALUES (?,?,?,?)').run('test-state','ta','cipher',at);db.prepare('DELETE FROM google_identities WHERE account_id=?').run('ta');db.prepare('DELETE FROM accounts WHERE id=?').run('ta');assert.equal(db.prepare('SELECT count(*) n FROM meet_oauth_states').get().n,0);
console.log('PASS Meet OAuth/PKCE, encryption, permissions, pagination, intervals, retries, concurrency, snapshots, attendance isolation and 32-table encrypted restore.');
