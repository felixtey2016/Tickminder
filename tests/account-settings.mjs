import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {drizzle} from 'drizzle-orm/d1';
import ts from 'typescript';

// Actual username/auth routes, credentials and all migrations, isolated fictional SQLite.
// Only D1's transport and framework cookies/responses are adapted; no remote services.
const sqlite=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
function statement(sql,values=[]){
 const execute=arrays=>{const st=sqlite.prepare(sql);if(arrays)st.setReturnArrays(true);return st.columns().length?{results:st.all(...values),meta:{changes:0}}:{results:[],meta:st.run(...values)};};
 return{bind:(...args)=>statement(sql,args),async first(){return execute(false).results[0]||null;},async all(){return execute(false);},async raw(){return execute(true).results;},async run(){return execute(false);},execute:()=>execute(false)};
}
let beforeBatch=null;
const d1={prepare:statement,async batch(items){if(beforeBatch){const hook=beforeBatch;beforeBatch=null;await hook();}sqlite.exec('BEGIN');try{const result=items.map(item=>item.execute());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
let token='',requestHeaders=new Headers();
const env={DB:d1,GOOGLE_CLIENT_ID:'fictional-username-client'};
const NextResponse={json(body,options){const response=Response.json(body,options);response.cookies={set(name,value){response.headers.set('set-cookie',name+'='+value+'; Path=/; HttpOnly; Secure');},delete(name){response.headers.set('set-cookie',name+'=; Max-Age=0');}};return response;}};
globalThis.__usernameQa={env,NextResponse,headers:async()=>requestHeaders,cookies:async()=>({get:name=>name==='tuition_session'&&token?{value:token}:undefined}),getDb:()=>drizzle(d1)};
const stub='data:text/javascript;base64,'+Buffer.from('export const {env,NextResponse,headers,cookies,getDb}=globalThis.__usernameQa;').toString('base64');
const root=new URL('../',import.meta.url).href;
const hooks=registerHooks({
 resolve(specifier,context,next){if(['cloudflare:workers','next/server','next/headers','@/db'].includes(specifier))return{url:stub,shortCircuit:true};if(specifier.startsWith('@/'))return{url:new URL(specifier.slice(2)+'.ts',root).href,shortCircuit:true};if(specifier.startsWith('.')&&context.parentURL?.startsWith(root)&&context.parentURL.endsWith('.ts'))return{url:new URL(/\.[cm]?[jt]sx?$/.test(specifier)?specifier:specifier+'.ts',context.parentURL).href,shortCircuit:true};return next(specifier,context);},
 load(url,context,next){if(url.startsWith(root)&&url.endsWith('.ts'))return{format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};return next(url,context);},
});
const load=async file=>import(new URL('../'+file,import.meta.url).href);
const route=await load('app/api/username/route.ts'),authRoute=await load('app/api/auth/route.ts');
const {createSession}=await load('lib/auth.ts'),{hashPassword}=await load('lib/password.ts');
const {OWNER_EMAIL}=await load('lib/owner.ts');
const {auditActionLabel}=await load('lib/audit-i18n.ts'),{setLanguage}=await load('lib/i18n.ts');
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('External calls are forbidden in username API tests');};
const group='next-genn-edu',now=new Date().toISOString(),password='Fictional-Username-26!';
const passwordHash=await hashPassword(password);
sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run('foreign-group','Fictional second group','foreign-group',now,now);
let checks=0;function check(fn){fn();checks++;}function expect(result,status,label){assert.equal(result.status,status,label+': '+JSON.stringify(result.data));checks++;return result.data;}
const row=id=>sqlite.prepare('SELECT * FROM local_credentials WHERE account_id=?').get(id);
const count=()=>sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='accountUsername.update'").get().n;
function add(id,role='student',opts={}){
 const ownGroup=opts.group===undefined?group:opts.group;
 if(role==='student')sqlite.prepare('INSERT INTO students(group_id,name,name_key,active,created_at) VALUES(?,?,?,1,?)').run(ownGroup,id,id,now);
 sqlite.prepare('INSERT INTO accounts(group_id,id,email,name,role,student_name,created_at,activated_at,name_confirmed_at) VALUES(?,?,?,?,?,?,?,?,?)').run(ownGroup,id,ownGroup===null?OWNER_EMAIL:'',id,role,role==='student'?id:null,now,now,now);
 if(opts.local!==false)sqlite.prepare('INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES(?,?,?,?,?)').run(id,opts.username||id,passwordHash,opts.mustChange?1:0,now);
 if(opts.google)sqlite.prepare('INSERT INTO google_identities(subject,account_id,email,linked_at) VALUES(?,?,?,?)').run('google-'+id,id,id+'@example.invalid',now);
}
async function login(id){token=(await createSession(id)).token;}
function request(body,{origin='https://fictional.invalid',contentType='application/json',raw,headers={}}={}){return new Request('https://fictional.invalid/api/username',{method:'POST',headers:{origin,'content-type':contentType,...headers},body:raw===undefined?JSON.stringify(body):raw});}
async function post(body,options){const response=await route.POST(request(body,options));return{status:response.status,data:await response.json(),headers:response.headers};}
async function passwordLogin(username){const response=await authRoute.POST(new Request('https://fictional.invalid/api/auth',{method:'POST',headers:{origin:'https://fictional.invalid','content-type':'application/json'},body:JSON.stringify({username,password})}));return{status:response.status,data:await response.json()};}
for(const [id,role,opts]of [['alpha','student',{google:true}],['beta','student',{}],['teacher','teacher',{}],['admin','admin',{}],['parent','parent',{}],['pending','pending',{}],['google-only','student',{local:false,google:true}],['initial','student',{mustChange:true}],['foreign','student',{group:'foreign-group',username:'global.taken'}],['legacy','student',{username:'Legacy.Mixed'}],['owner','admin',{group:null}]])add(id,role,opts);

sqlite.exec('PRAGMA foreign_keys=ON');
const devices=await load('app/api/account-devices/route.ts'),prefs=await load('app/api/notification-preferences/route.ts');
const {hashToken,currentIdentity}=await load('lib/auth.ts');
const {notificationPreferenceSql}=await load('lib/notification-preferences.ts');
const {sessionDeviceLabel}=await load('lib/session-device-label.ts');
async function get(api){const r=await api.GET();return{status:r.status,data:await r.json(),headers:r.headers};}
async function set(api,body,options){const r=await api.POST(request(body,options));return{status:r.status,data:await r.json()};}
expect(await get(devices),401,'anonymous devices');expect(await get(prefs),401,'anonymous preferences');
await login('alpha');
for(const api of[devices,prefs]){
 expect(await set(api,{},{origin:'https://evil.invalid'}),403,'cross origin');
 expect(await set(api,{},{contentType:'text/plain'}),400,'JSON only');
 expect(await set(api,{},{raw:'{'}),400,'malformed');
 for(const value of[null,[],{}, {accountId:'beta'}])expect(await set(api,value),400,'invalid shape');
}
let state=expect(await get(prefs),200,'student default');
check(()=>assert.deepEqual(state.availableCategories,['courses','homework']));check(()=>assert.deepEqual(state.preferences,{courses:true,homework:true,fees:true}));
check(()=>assert.equal(state.pushConfigured,false));
expect(await set(prefs,{category:'fees',enabled:false}),403,'student cannot set fees');
expect(await set(prefs,{category:'courses',enabled:0}),400,'boolean only');
expect(await set(prefs,{category:'courses',enabled:false,accountId:'beta'}),400,'cannot target other account');
state=expect(await set(prefs,{category:'courses',enabled:false}),200,'disable course push');
check(()=>assert.equal(state.preferences.courses,false));check(()=>assert.equal(state.preferences.homework,true));
check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM notification_preferences WHERE account_id=?').get('beta').n,0));
const courseAllowed=()=>sqlite.prepare('SELECT '+notificationPreferenceSql("'alpha'",'courses',"'2000-01-01T00:00:00.000Z'")+' AS enabled').get().enabled;
check(()=>assert.equal(courseAllowed(),0));
expect(await set(prefs,{category:'courses',enabled:true}),200,'reenable');
check(()=>assert.match(sqlite.prepare('SELECT courses_since FROM notification_preferences WHERE account_id=?').get('alpha').courses_since,/^20/));
check(()=>assert.equal(courseAllowed(),0)); // re-enabling cannot replay old reminders
const preferenceHeaders=(await get(prefs)).headers;check(()=>assert.match(preferenceHeaders.get('cache-control'),/no-store/));
await login('teacher');state=expect(await get(prefs),200,'teacher prefs');check(()=>assert.deepEqual(state.availableCategories,['courses']));
for(const id of['parent','admin','pending']){await login(id);state=expect(await get(prefs),200,id+' empty categories');check(()=>assert.deepEqual(state.availableCategories,[]));}
for(const id of['initial','google-only']){await login(id);expect(await get(devices),403,id+' gated');expect(await get(prefs),403,id+' gated');}
await login('alpha');const current=token,currentHash=await hashToken(token);
const second=await createSession('alpha',new Request('https://fictional.invalid',{headers:{'user-agent':'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'}}));
const foreignSession=await createSession('foreign');
state=expect(await get(devices),200,'devices');check(()=>assert.equal(state.devices.filter(d=>d.current).length,1));
check(()=>assert.equal(state.devices.find(d=>d.current).browser,'unknown'));
const otherHash=await hashToken(second.token),other=sqlite.prepare('SELECT * FROM session_devices WHERE token_hash=?').get(otherHash),foreignDevice=sqlite.prepare('SELECT * FROM session_devices WHERE token_hash=?').get(await hashToken(foreignSession.token));
check(()=>assert.equal(other.browser,'Chrome'));check(()=>assert.equal(other.os,'Android'));
check(()=>assert(!JSON.stringify(state).includes(currentHash)&&!JSON.stringify(state).includes(otherHash)&&!JSON.stringify(state).includes(current)));
expect(await set(devices,{action:'revoke',deviceId:state.devices.find(d=>d.current).id}),400,'keep current');
expect(await set(devices,{action:'revoke',deviceId:foreignDevice.id}),404,'cannot revoke foreign');
expect(await set(devices,{action:'revoke',deviceId:other.id,accountId:'foreign'}),400,'no explicit account');
const countSessions=()=>sqlite.prepare('SELECT count(*) n FROM sessions WHERE account_id=?').get('alpha').n;
const countBefore=countSessions();
sqlite.exec("CREATE TRIGGER fail_device_audit BEFORE INSERT ON audit WHEN NEW.action='accountSessions.revoke' BEGIN SELECT RAISE(ABORT,'fixture audit failure');END;");
expect(await set(devices,{action:'revoke',deviceId:other.id}),503,'audit failure rolls back');check(()=>assert.equal(countSessions(),countBefore));sqlite.exec('DROP TRIGGER fail_device_audit');
expect(await set(devices,{action:'revoke',deviceId:other.id}),200,'revoke single');check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM session_devices WHERE id=?').get(other.id).n,0));
token=second.token;check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE token_hash=?').get(otherHash).n,0));assert.equal(await currentIdentity(),null);checks++;
token=current;expect(await set(devices,{action:'revokeOthers'}),200,'revoke others');check(()=>assert.equal(countSessions(),1));check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE token_hash=?').get(currentHash).n,1));
check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE token_hash=?').get(foreignDevice.token_hash).n,1));assert.equal((await currentIdentity()).account.id,'alpha');checks++;
// Missing legacy metadata is enriched for the caller only.
sqlite.prepare('DELETE FROM session_devices WHERE token_hash=?').run(currentHash);state=expect(await get(devices),200,'legacy metadata repair');check(()=>assert.equal(state.devices.length,1));check(()=>assert.equal(state.devices[0].createdAt,null));
beforeBatch=()=>sqlite.prepare("UPDATE accounts SET disabled_at='2026-01-01' WHERE id=?").run('alpha');
expect(await set(prefs,{category:'homework',enabled:false}),409,'account disabled during mutation');check(()=>assert.equal(sqlite.prepare('SELECT homework_enabled FROM notification_preferences WHERE account_id=?').get('alpha').homework_enabled,1));sqlite.prepare('UPDATE accounts SET disabled_at=NULL WHERE id=?').run('alpha');
beforeBatch=()=>sqlite.prepare('DELETE FROM sessions WHERE token_hash=?').run(currentHash);
expect(await set(devices,{action:'revokeOthers'}),409,'session revoked during mutation');
check(()=>assert.deepEqual(sessionDeviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18) AppleWebKit/605 Safari/604'),{browser:'Safari',os:'iOS'}));
check(()=>assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]));
console.log(JSON.stringify({ok:true,checks,fixtureOnly:true}));globalThis.fetch=originalFetch;hooks.deregister();sqlite.close();
