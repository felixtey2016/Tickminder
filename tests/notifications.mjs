import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const sqlite=new DatabaseSync(':memory:');
for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
function statement(sql,values=[]){return{bind(...v){return statement(sql,v);},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return{results:sqlite.prepare(sql).all(...values)};},async run(){return{meta:sqlite.prepare(sql).run(...values)};},execute(){const s=sqlite.prepare(sql);return /^\s*(SELECT|PRAGMA)/i.test(sql)?{results:s.all(...values)}:{meta:s.run(...values)};}};}
const d1={prepare:statement,async batch(stmts){sqlite.exec('BEGIN');try{const r=stmts.map(s=>s.execute());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
let account={id:'student-a',role:'student',studentName:'Student A'};
const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),jwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
const encode=b=>Buffer.from(b).toString('base64url');
const vapidPublic=encode(await crypto.subtle.exportKey('raw',pair.publicKey));
const env={DB:d1,VAPID_PUBLIC_KEY:vapidPublic,VAPID_PRIVATE_KEY:jwk.d,VAPID_SUBJECT:'mailto:contact@example.test',NOTIFICATIONS_CRON_TOKEN:'test-clock-secret-'.repeat(3)};
globalThis.__pushTest={env,learningDb:()=>d1,rows:async(sql,...v)=>(await statement(sql,v).all()).results,first:async(sql,...v)=>statement(sql,v).first(),currentBusinessAccount:async()=>account};
const stub='data:text/javascript;base64,'+Buffer.from('export const {env,learningDb,rows,first,currentBusinessAccount}=globalThis.__pushTest;').toString('base64');const cache=new Map();
async function load(file){if(cache.has(file))return cache.get(file);let s=readFileSync(new URL('../'+file,import.meta.url),'utf8');for(const [,spec] of [...s.matchAll(/from ["']([^"']+)["']/g)]){const url=['cloudflare:workers','@/lib/learning-server','@/lib/auth'].includes(spec)?stub:spec.startsWith('@/')?(await load(spec.slice(2)+'.ts')).url:import.meta.resolve(spec);s=s.replaceAll('"'+spec+'"','"'+url+'"');}const url='data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'),r={url,module:await import(url)};cache.set(file,r);return r;}
const engine=(await load('lib/notifications-server.ts')).module,route=(await load('app/api/notifications/route.ts')).module,dispatch=(await load('app/api/notifications/dispatch/route.ts')).module;
function req(body,origin='https://test.invalid'){return new Request('https://test.invalid/api/notifications',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});}
async function call(body){const r=await route.POST(req(body));return{status:r.status,data:await r.json()};}
const now=Date.now(),at=new Date(now).toISOString();
for(const [id,role,teacher,student] of [['student-a','student',null,'Student A'],['student-b','student',null,'Student B'],['teacher-a','teacher','Teacher A',null],['teacher-b','teacher','Teacher B',null],['disabled','student',null,'Student A'],['pending','pending',null,null]])sqlite.prepare('INSERT INTO accounts (id,email,name,role,teacher_name,student_name,created_at,disabled_at) VALUES (?,?,?,?,?,?,?,?)').run(id,'',id,role,teacher,student,at,id==='disabled'?at:null);
sqlite.prepare('INSERT INTO teachers (name,active,created_at) VALUES (?,1,?)').run('Teacher A',at);sqlite.prepare('INSERT INTO teachers (name,active,created_at) VALUES (?,1,?)').run('Teacher B',at);
for(const name of ['Student A','Student B'])sqlite.prepare('INSERT INTO students (name,name_key,active,created_at) VALUES (?,?,1,?)').run(name,name.toLowerCase(),at);
for(const [student,teacher] of [['Student A','Teacher A'],['Student B','Teacher B']])sqlite.prepare('INSERT INTO plans (key,student,subject,teacher_name,duration,active,created_at) VALUES (?,?,?,?,1,1,?)').run(student,student,'Science',teacher,at);
function lesson(id,start,status='scheduled',student='Student A',teacher='Teacher A'){sqlite.prepare('INSERT INTO lessons (id,student,subject,teacher_name,planned_start,planned_end,status,created_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id,student,'Science',teacher,new Date(start).toISOString(),new Date(start+3600000).toISOString(),status,'teacher-a',at);}
lesson('thirty',now+30*60000);lesson('five',now+5*60000);lesson('start',now);lesson('past',now-5*60000);lesson('cancel',now+30*60000,'cancelled');lesson('foreign',now+30*60000,'scheduled','Student B','Teacher B');
for(const url of ['http://fcm.googleapis.com/push','https://localhost/push','https://fcm.googleapis.com.attacker.test/push','https://attacker.test/push','https://fcm.googleapis.com:444/push','https://user@fcm.googleapis.com/push'])assert.equal(engine.allowedPushEndpoint(url),false,url);
for(const url of ['https://fcm.googleapis.com/push','https://updates.push.services.mozilla.com/push','https://web.push.apple.com/push','https://wns2-bl2p.notify.windows.com/push'])assert.equal(engine.allowedPushEndpoint(url),true);
const receiver=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),receiverPublic=encode(await crypto.subtle.exportKey('raw',receiver.publicKey)),auth=encode(crypto.getRandomValues(new Uint8Array(16)));
const subscription={endpoint:'https://fcm.googleapis.com/test-student',keys:{p256dh:receiverPublic,auth}};
assert.equal((await call({action:'subscribe',subscription:{endpoint:'https://attacker.test/push',keys:subscription.keys}})).status,400);
assert.equal((await call({action:'subscribe',subscription:{...subscription,keys:{auth,p256dh:encode(new Uint8Array(65))}}})).status,400);
assert.equal((await route.POST(req({action:'subscribe',subscription},'https://attacker.test'))).status,403);
let response=await call({action:'subscribe',subscription,language:'en'});assert.equal(response.status,200);const subId=response.data.id;
sqlite.prepare('UPDATE push_subscriptions SET created_at=? WHERE id=?').run(new Date(now-3600000).toISOString(),subId);
account={id:'student-b',role:'student',studentName:'Student B'};assert.equal((await call({action:'subscribe',subscription})).status,409);
await engine.generateReminders(now);await engine.generateReminders(now);
assert.equal(sqlite.prepare('SELECT count(*) n FROM notification_items WHERE account_id=?').get('student-a').n,3);
assert.deepEqual(sqlite.prepare('SELECT offset_minutes m FROM notification_items WHERE account_id=? ORDER BY m').all('student-a').map(x=>x.m),[0,5,30]);
assert.equal(sqlite.prepare('SELECT count(*) n FROM notification_items WHERE account_id IN (?,?)').get('disabled','pending').n,0);
assert.equal(sqlite.prepare('SELECT count(*) n FROM notification_items WHERE lesson_id IN (?,?)').get('past','cancel').n,0);
const foreign=(await route.GET());assert.equal((await foreign.json()).items.length,1);const aItem=sqlite.prepare('SELECT id FROM notification_items WHERE account_id=? LIMIT 1').get('student-a').id;
await call({action:'read',id:aItem});assert.equal(sqlite.prepare('SELECT read_at FROM notification_items WHERE id=?').get(aItem).read_at,null);
await call({action:'unsubscribe',id:subId});assert.ok(sqlite.prepare('SELECT id FROM push_subscriptions WHERE id=?').get(subId));
account={id:'teacher-b',role:'teacher',teacherName:'Teacher B'};assert.equal((await (await route.GET()).json()).items.length,1);
account={id:'student-a',role:'student',studentName:'Student A'};assert.equal((await (await route.GET()).json()).items.length,3);
assert.equal((await dispatch.POST(new Request('https://test.invalid/api/notifications/dispatch',{method:'POST',headers:{Authorization:'Bearer wrong'}}))).status,404);
const originalFetch=globalThis.fetch;let sent=[];
globalThis.fetch=async(endpoint,payload)=>{assert.ok(engine.allowedPushEndpoint(String(endpoint)));assert.equal(payload.redirect,'manual');assert.ok(payload.signal);assert.equal(payload.headers['Content-Encoding']||payload.headers['content-encoding'],'aes128gcm');assert.ok(payload.body);sent.push({endpoint,payload});return new Response(null,{status:201});};
await Promise.all([engine.dispatchReminders(now),engine.dispatchReminders(now)]);assert.equal(sent.length,3);assert.deepEqual(sent.map(s=>Number(s.payload.headers.TTL || s.payload.headers.ttl)).sort((a,b)=>a-b),[300,600,1500]);assert.ok(sent.every(s=>(s.payload.headers.Urgency || s.payload.headers.urgency)==='high'));assert.equal(sqlite.prepare("SELECT count(*) n FROM notification_deliveries WHERE status='sent'").get().n,3);
// Decrypt an actual Web Push envelope using the device private key (RFC 8291).
const bytes=new Uint8Array(sent[0].payload.body),salt=bytes.slice(0,16),sender=bytes.slice(21,21+bytes[20]);
const senderKey=await crypto.subtle.importKey('raw',sender,{name:'ECDH',namedCurve:'P-256'},false,[]),shared=await crypto.subtle.deriveBits({name:'ECDH',public:senderKey},receiver.privateKey,256);
const hkdf=async(ikm,salt,info,len)=>crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']),len*8);
const concat=(...p)=>{const r=new Uint8Array(p.reduce((n,b)=>n+b.length,0));let i=0;for(const b of p){r.set(b,i);i+=b.length;}return r;},enc=new TextEncoder();
const ikm=await hkdf(shared,Buffer.from(auth,'base64url'),concat(enc.encode('WebPush: info\0'),Buffer.from(receiverPublic,'base64url'),sender),32);
const cek=await hkdf(ikm,salt,enc.encode('Content-Encoding: aes128gcm\0'),16),nonce=await hkdf(ikm,salt,enc.encode('Content-Encoding: nonce\0'),12);
const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']),bytes.slice(21+bytes[20])));
let end=plain.length-1;while(plain[end]===0)end--;assert.equal(plain[end],2);const message=JSON.parse(new TextDecoder().decode(plain.slice(0,end)));assert.ok(message.body);assert.equal(message.url,'/?view=notifications');assert.ok(!JSON.stringify(message).includes('Student A'));
await call({action:'test',id:subId});assert.equal((await call({action:'test',id:subId})).status,429);
assert.equal((await call({action:'test',id:'missing-device'})).status,409);
sqlite.prepare('UPDATE push_subscriptions SET last_test_at=NULL WHERE id=?').run(subId);
let redirects=0;globalThis.fetch=async(endpoint,payload)=>{redirects++;assert.equal(payload.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://attacker.test/push'}});};
assert.equal((await call({action:'test',id:subId})).status,503);assert.equal(redirects,1);
sqlite.prepare("UPDATE lessons SET planned_start=? WHERE id='thirty'").run(new Date(now+60*60000).toISOString());
sqlite.prepare("UPDATE lessons SET status='cancelled' WHERE id='five'").run();assert.equal((await (await route.GET()).json()).items.length,1);
// Transient failure retries; a provider-expired endpoint is permanently removed.
lesson('retry',now+30*60000);let attempts=0;globalThis.fetch=async()=>{attempts++;return new Response(null,{status:attempts===1?503:410});};
await engine.dispatchReminders(now);assert.equal(attempts,1);await engine.dispatchReminders(now+60000);assert.equal(attempts,2);assert.equal(sqlite.prepare('SELECT count(*) n FROM push_subscriptions').get().n,0);
const data=(await (await route.GET()).json());assert.equal(data.schedulerReady,true);assert.equal(data.publicKey,vapidPublic);assert.ok(!JSON.stringify(data).includes(jwk.d));
account=null;assert.equal((await route.GET()).status,401);
globalThis.fetch=originalFetch;sqlite.close();console.log('PASS notifications: real routes/SQL; course ownership; endpoint SSRF; crypto/key validation; CSRF; foreign IDs; 30/5/start bounds; cancellation/reschedule; atomic concurrent claims; AES128GCM decryption; retry/410; test rate limit; expiry; no personal data in pushes; authenticated centre.');
