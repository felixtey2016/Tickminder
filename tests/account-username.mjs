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
expect(await post({username:'replacement'}),401,'anonymous');
await login('alpha');
expect(await post({username:'replacement'},{origin:'https://evil.invalid'}),403,'cross-origin denied');
expect(await post({username:'replacement'},{origin:''}),403,'missing origin denied');
for(const body of [null,[],{},'alpha',{username:123},{username:'a'},{username:'.abc'},{username:'a b'},{username:'名字'},{username:'a'.repeat(41)},{username:'abc',accountId:'beta'},{username:'abc',groupId:'foreign-group'},{username:'abc',role:'admin'},{username:'abc',password:'new password'}])expect(await post(body),400,'invalid body or target rejected');
expect(await post({}, {raw:'{' }),400,'malformed JSON');
expect(await post({username:'alpha'},{contentType:'text/plain'}),400,'non-JSON rejected');
expect(await post({username:'alpha'},{raw:' '.repeat(2050)+'{}'}),400,'oversize body');
check(()=>assert.equal(count(),0));

// Stable account/course identifiers and existing login throttles must not be rewritten.
sqlite.prepare('INSERT INTO assignments(group_id,id,account_id,plan_key) VALUES(?,?,?,?)').run(group,'alpha-assignment','alpha','alpha|Mathematics');
sqlite.prepare('INSERT INTO lessons(group_id,id,student,subject,teacher_name,planned_start,planned_end,created_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(group,'alpha-lesson','alpha','Mathematics','teacher',now,now,'alpha',now);
sqlite.prepare('INSERT INTO login_attempts(username,failures,window_start,blocked_until) VALUES(?,?,?,?)').run('global.taken',4,now,null);
sqlite.prepare('INSERT INTO login_attempts(username,failures,window_start,blocked_until) VALUES(?,?,?,?)').run('alpha',3,now,null);
const tables=['accounts','students','google_identities','sessions','assignments','lessons','login_attempts'];
const snapshot=()=>Object.fromEntries(tables.map(table=>[table,JSON.stringify(sqlite.prepare('SELECT * FROM '+table).all())]));
const protectedBefore=snapshot(),credentialBefore=row('alpha'),otherBefore=row('beta');
requestHeaders=new Headers({'x-tickminder-group':'foreign-group'});
const renamed=await post({username:'  ALPHA.New  '});expect(renamed,200,'normalized change');
check(()=>assert.deepEqual(renamed.data,{ok:true,username:'alpha.new',changed:true}));
check(()=>assert.match(renamed.headers.get('cache-control'),/no-store/));
check(()=>assert.equal(renamed.headers.has('set-cookie'),false));
check(()=>assert.deepEqual(snapshot(),protectedBefore));
check(()=>assert.equal(row('alpha').password_hash,credentialBefore.password_hash));
check(()=>assert.equal(row('alpha').must_change_password,credentialBefore.must_change_password));
check(()=>assert.deepEqual(row('beta'),otherBefore));
const audit=sqlite.prepare("SELECT * FROM audit WHERE action='accountUsername.update'").get();
check(()=>assert.equal(audit.group_id,group));check(()=>assert.equal(audit.actor_id,'alpha'));
check(()=>assert.equal(JSON.parse(audit.before_json).username,'alpha'));check(()=>assert.equal(JSON.parse(audit.after_json).username,'alpha.new'));
check(()=>assert(!JSON.stringify(audit).includes(passwordHash)));check(()=>assert(!JSON.stringify(audit).includes(token)));
requestHeaders=new Headers();
const saved=row('alpha'),auditCount=count();
const unchanged=expect(await post({username:' ALPHA.NEW '}),200,'idempotent same name');
check(()=>assert.deepEqual(unchanged,{ok:true,username:'alpha.new',changed:false}));
check(()=>assert.deepEqual(row('alpha'),saved));check(()=>assert.equal(count(),auditCount));
expect(await post({username:'GLOBAL.TAKEN'}),409,'global cross-group duplicate');
expect(await post({username:'legacy.mixed'}),409,'legacy mixed-case duplicate');
check(()=>assert.deepEqual(row('alpha'),saved));check(()=>assert.equal(count(),auditCount));
const currentAuth=await (await authRoute.GET()).json();check(()=>assert.equal(currentAuth.account.username,'alpha.new'));
expect(await passwordLogin('alpha.new'),200,'new username uses original password');
expect(await passwordLogin('alpha'),401,'old username stops resolving');
expect(await passwordLogin('alpha@example.invalid'),200,'verified Google email password login unchanged');

for(const id of ['teacher','admin','parent','pending','owner']){await login(id);const before=row(id);expect(await post({username:id+'.new'}),200,id+' changes own username');check(()=>assert.equal(row(id).password_hash,before.password_hash));}
check(()=>assert.equal(sqlite.prepare("SELECT group_id FROM audit WHERE actor_id='owner' AND action='accountUsername.update'").get().group_id,group));
await login('google-only');expect(await post({username:'google.new'}),403,'Google-only account must use setup');check(()=>assert.equal(row('google-only'),undefined));
await login('initial');expect(await post({username:'initial.new'}),403,'initial password cannot bypass setup');
await login('alpha');

// Changes after authentication are guarded again within the same transaction.
const races=[
 ['session revoked',()=>sqlite.prepare('DELETE FROM sessions WHERE account_id=?').run('alpha'),async()=>login('alpha')],
 ['account disabled',()=>sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,'alpha'),()=>sqlite.prepare('UPDATE accounts SET disabled_at=NULL WHERE id=?').run('alpha')],
 ['forced password reset',()=>sqlite.prepare('UPDATE local_credentials SET must_change_password=1 WHERE account_id=?').run('alpha'),()=>sqlite.prepare('UPDATE local_credentials SET must_change_password=0 WHERE account_id=?').run('alpha')],
 ['password changed',()=>sqlite.prepare('UPDATE local_credentials SET password_hash=? WHERE account_id=?').run('changed-by-other-request','alpha'),()=>sqlite.prepare('UPDATE local_credentials SET password_hash=? WHERE account_id=?').run(passwordHash,'alpha')],
 ['username changed',()=>sqlite.prepare('UPDATE local_credentials SET username=? WHERE account_id=?').run('alpha.other','alpha'),()=>sqlite.prepare('UPDATE local_credentials SET username=? WHERE account_id=?').run('alpha.new','alpha')],
 ['pending expired',()=>sqlite.prepare("UPDATE accounts SET role='pending',activated_at=NULL,student_name=NULL,pending_expires_at='2000-01-01T00:00:00.000Z' WHERE id='alpha'").run(),()=>sqlite.prepare("UPDATE accounts SET role='student',activated_at=?,student_name='alpha',pending_expires_at=NULL WHERE id='alpha'").run(now)],
];
for(const [label,mutate,undo]of races){const n=count();beforeBatch=mutate;expect(await post({username:'alpha.race'}),409,label);check(()=>assert.notEqual(row('alpha').username,'alpha.race'));check(()=>assert.equal(count(),n));await undo();}
check(()=>assert.throws(()=>sqlite.prepare('UPDATE accounts SET group_id=? WHERE id=?').run('foreign-group','alpha'),/Account group is immutable/));
const beforeRace=row('alpha'),beforeRaceCount=count();
beforeBatch=()=>sqlite.prepare('UPDATE local_credentials SET username=? WHERE account_id=?').run('race.taken','beta');
expect(await post({username:'race.taken'}),409,'concurrent other-account collision');
check(()=>assert.deepEqual(row('alpha'),beforeRace));check(()=>assert.equal(count(),beforeRaceCount));
sqlite.prepare('UPDATE local_credentials SET username=? WHERE account_id=?').run('beta','beta');

// Audit failure must roll the credential update back, not produce an unlogged rename.
sqlite.exec("CREATE TRIGGER username_audit_fail BEFORE INSERT ON audit WHEN NEW.action='accountUsername.update' BEGIN SELECT RAISE(ABORT,'fictional audit write failure'); END");
expect(await post({username:'alpha.rollback'}),503,'audit failure');
check(()=>assert.deepEqual(row('alpha'),beforeRace));check(()=>assert.equal(count(),beforeRaceCount));
sqlite.exec('DROP TRIGGER username_audit_fail');

// Current disabled/expired identities are rejected before reading or changing credentials.
sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,'alpha');expect(await post({username:'alpha.blocked'}),401,'disabled current identity');sqlite.prepare('UPDATE accounts SET disabled_at=NULL WHERE id=?').run('alpha');
sqlite.prepare("UPDATE accounts SET role='pending',activated_at=NULL,student_name=NULL,pending_expires_at='2000-01-01T00:00:00.000Z' WHERE id='alpha'").run();expect(await post({username:'alpha.expired'}),401,'expired pending identity');
sqlite.prepare("UPDATE accounts SET role='student',activated_at=?,student_name='alpha',pending_expires_at=NULL WHERE id='alpha'").run(now);
expect(await post({username:'a'.repeat(40)}),200,'40-character boundary');expect(await post({username:'a-1'}),200,'3-character boundary');
setLanguage('en');check(()=>assert.equal(auditActionLabel('accountUsername.update'),'Change login username'));setLanguage('zh');check(()=>assert.equal(auditActionLabel('accountUsername.update'),'修改登录用户名'));
globalThis.fetch=originalFetch;hooks.deregister();sqlite.close();
console.log('PASS account-username:',checks,'checks; actual routes/auth/SQLite; no external data or services.');
