import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {drizzle} from 'drizzle-orm/d1';
import ts from 'typescript';

// Real auth, linking, password and skip routes against a fresh fictional SQLite.
// Google keys are fictional and fetch rejects every non-certificate request.
const sqlite=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
function statement(sql,values=[]){
 const execute=arrays=>{const st=sqlite.prepare(sql);if(arrays)st.setReturnArrays(true);return st.columns().length?{results:st.all(...values),meta:{changes:0}}:{results:[],meta:st.run(...values)};};
 return {bind:(...args)=>statement(sql,args),async first(){return execute(false).results[0]||null;},async all(){return execute(false);},async raw(){return execute(true).results;},async run(){return execute(false);},execute:()=>execute(false)};
}
let beforeBatch=null;
const d1={prepare:statement,async batch(items){if(beforeBatch){const hook=beforeBatch;beforeBatch=null;await hook();}sqlite.exec('BEGIN');try{const result=items.map(s=>s.execute());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
let token='',requestHeaders=new Headers();
const env={DB:d1,GOOGLE_CLIENT_ID:'fictional-google-onboarding-client'};
const NextResponse={json(body,options){const response=Response.json(body,options);response.cookies={set(name,value){response.headers.set('set-cookie',name+'='+value+'; Path=/; HttpOnly; Secure');},delete(name){response.headers.set('set-cookie',name+'=; Max-Age=0');}};return response;}};
globalThis.__studentContact={env,NextResponse,headers:async()=>requestHeaders,cookies:async()=>({get:name=>name==='tuition_session'&&token?{value:token}:undefined}),getDb:()=>drizzle(d1)};
const stub='data:text/javascript;base64,'+Buffer.from('export const {env,NextResponse,headers,cookies,getDb}=globalThis.__studentContact;').toString('base64');
const root=new URL('../',import.meta.url).href;
const hooks=registerHooks({
 resolve(specifier,context,next){if(['cloudflare:workers','next/server','next/headers','@/db'].includes(specifier))return {url:stub,shortCircuit:true};if(specifier.startsWith('@/'))return {url:new URL(specifier.slice(2)+'.ts',root).href,shortCircuit:true};if(specifier.startsWith('.')&&context.parentURL?.startsWith(root)&&context.parentURL.endsWith('.ts'))return {url:new URL(/\.[cm]?[jt]sx?$/.test(specifier)?specifier:specifier+'.ts',context.parentURL).href,shortCircuit:true};return next(specifier,context);},
 load(url,context,next){if(url.startsWith(root)&&url.endsWith('.ts'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};return next(url,context);},
});
const load=async file=>import(new URL('../'+file,import.meta.url).href);

const authRoute=await load('app/api/auth/route.ts'),contact=await load('app/api/student-contact/route.ts'),pure=await load('lib/student-contact.ts'),{createSession}=await load('lib/auth.ts');
const now=new Date().toISOString(),group='next-genn-edu';
let checks=0;function check(fn){fn();checks++;}function expect(result,status,label){assert.equal(result.status,status,label+': '+JSON.stringify(result.data));checks++;return result.data;}
function add(id,role='student',opts={}){if(role==='student')sqlite.prepare('INSERT INTO students(group_id,name,name_key,active,created_at) VALUES(?,?,?,1,?)').run(group,id,id,now);sqlite.prepare('INSERT INTO accounts(group_id,id,email,name,role,student_name,created_at,activated_at,name_confirmed_at) VALUES(?,?,?,?,?,?,?,?,?)').run(group,id,'',id,role,role==='student'?id:null,now,now,now);if(opts.local!==false)sqlite.prepare('INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES(?,?,?,0,?)').run(id,id,'fixture-not-used',now);if(opts.google)sqlite.prepare('INSERT INTO google_identities(subject,account_id,email,linked_at) VALUES(?,?,?,?)').run('google-'+id,id,id+'@example.invalid',now);}
async function login(id){token=(await createSession(id)).token;}
const req=(body,origin='https://fictional.invalid',extra={})=>new Request('https://fictional.invalid/api/student-contact',{method:'POST',headers:{origin,'content-type':'application/json',...extra},body:JSON.stringify(body)});
const post=async(body,origin,extra)=>{const response=await contact.POST(req(body,origin,extra));return{status:response.status,data:await response.json()};},get=async()=>{const response=await contact.GET();return{status:response.status,data:await response.json()};},account=async()=>((await (await authRoute.GET()).json()).account);
const phone={phone:'+60 12-345 6789',kind:'student'};
for(const [input,expected]of [['+60 12-345 6789','+60123456789'],['0065 8123 4567','+6581234567'],['60123456789','+60123456789']])check(()=>assert.equal(pure.normalizeStudentContactPhone(input),expected));
for(const invalid of ['',null,123,'0123456789','+600','+60123456789012345','+60<script>','+60\n123456789','++60123456789'])check(()=>assert.throws(()=>pure.normalizeStudentContactPhone(invalid)));
for(const invalid of [null,[],{}, {...phone,accountId:'other'},{...phone,name:'rename'},{...phone,role:'admin'},{...phone,groupId:'foreign'},{...phone,verified:true},{...phone,kind:'teacher'}])check(()=>assert.throws(()=>pure.parseStudentContactInput(invalid)));
check(()=>assert.match(pure.studentContactMessage('请选择学生本人或家长的联系电话','en'),/student/));
add('Alpha');add('Beta');add('Teacher','teacher');add('Parent','parent');add('Admin','admin');add('Pending','pending');add('GoogleFirst','student',{local:false,google:true});
expect(await get(),401,'anonymous GET');expect(await post(phone),401,'anonymous POST');
await login('Alpha');const first=await account();check(()=>assert.equal(first.requiresStudentPhone,true));check(()=>assert.equal(first.name,'Alpha'));check(()=>assert.equal(first.contactPhone,null));expect(await post(phone,'https://evil.invalid'),403,'cross-origin denied');
expect(await post({...phone,accountId:'Beta'}),400,'cannot choose target');expect(await post({...phone,kind:'teacher'}),400,'invalid kind');expect(await post({...phone,phone:'0123456789'}),400,'national phone rejected');expect(await post(phone,undefined,{'content-type':'text/plain'}),400,'bad content type');
const originalWhatsApp=JSON.stringify(sqlite.prepare('SELECT * FROM whatsapp_contacts').all()),originalChallenges=JSON.stringify(sqlite.prepare('SELECT * FROM whatsapp_challenges').all());
const saved=expect(await post(phone),200,'save own phone');check(()=>assert.equal(saved.contactPhone,'+60123456789'));const read=expect(await get(),200,'read own phone');check(()=>assert.equal(read.name,'Alpha'));check(()=>assert.equal(read.studentName,'Alpha'));check(()=>assert.equal(read.contactPhoneKind,'student'));const complete=await account();check(()=>assert.equal(complete.requiresStudentPhone,false));
check(()=>assert.equal(sqlite.prepare('SELECT name FROM accounts WHERE id=?').get('Alpha').name,'Alpha'));check(()=>assert.equal(sqlite.prepare('SELECT contact_phone FROM accounts WHERE id=?').get('Beta').contact_phone,null));check(()=>assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM whatsapp_contacts').all()),originalWhatsApp));check(()=>assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM whatsapp_challenges').all()),originalChallenges));
check(()=>assert(!JSON.stringify(sqlite.prepare('SELECT before_json,after_json FROM audit WHERE action=?').all('studentContact.update')).includes('60123456789')));
await login('Beta');expect(await post({phone:'+60123456789',kind:'parent'}),200,'siblings may share parent phone');check(()=>assert.equal(sqlite.prepare('SELECT contact_phone_kind FROM accounts WHERE id=?').get('Beta').contact_phone_kind,'parent'));
for(const id of ['Teacher','Parent','Admin','Pending','GoogleFirst']){await login(id);expect(await post(phone),403,id+' cannot update student contact');}
await login('Alpha');sqlite.prepare('UPDATE local_credentials SET must_change_password=1 WHERE account_id=?').run('Alpha');expect(await post(phone),403,'mandatory password setup first');const passwordPending=await account();check(()=>assert.equal(passwordPending.requiresStudentPhone,false));sqlite.prepare('UPDATE local_credentials SET must_change_password=0 WHERE account_id=?').run('Alpha');
sqlite.prepare('UPDATE students SET active=0 WHERE group_id=? AND name=?').run(group,'Alpha');expect(await post(phone),409,'inactive roster denied');sqlite.prepare('UPDATE students SET active=1 WHERE group_id=? AND name=?').run(group,'Alpha');
const rowsBefore=()=>sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='studentContact.update'").get().n;
for(const [name,change,undo]of [
 ['disable',()=>sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,'Alpha'),()=>sqlite.prepare('UPDATE accounts SET disabled_at=NULL WHERE id=?').run('Alpha')],
 ['role',()=>sqlite.prepare("UPDATE accounts SET role='teacher' WHERE id=?").run('Alpha'),()=>sqlite.prepare("UPDATE accounts SET role='student' WHERE id=?").run('Alpha')],
 ['roster binding',()=>sqlite.prepare('UPDATE accounts SET student_name=? WHERE id=?').run('Beta','Alpha'),()=>sqlite.prepare('UPDATE accounts SET student_name=? WHERE id=?').run('Alpha','Alpha')],
 ['group availability',()=>sqlite.prepare('UPDATE tuition_groups SET active=0 WHERE id=?').run(group),()=>sqlite.prepare('UPDATE tuition_groups SET active=1 WHERE id=?').run(group)],
 ['initial password',()=>sqlite.prepare('UPDATE local_credentials SET must_change_password=1 WHERE account_id=?').run('Alpha'),()=>sqlite.prepare('UPDATE local_credentials SET must_change_password=0 WHERE account_id=?').run('Alpha')],
 ['roster availability',()=>sqlite.prepare('UPDATE students SET active=0 WHERE group_id=? AND name=?').run(group,'Alpha'),()=>sqlite.prepare('UPDATE students SET active=1 WHERE group_id=? AND name=?').run(group,'Alpha')],
 ['session revoke',()=>sqlite.prepare('DELETE FROM sessions WHERE account_id=?').run('Alpha'),()=>{}],
]){await login('Alpha');const auditBefore=rowsBefore(),valueBefore=sqlite.prepare('SELECT contact_phone FROM accounts WHERE id=?').get('Alpha').contact_phone;beforeBatch=change;expect(await post({phone:'+6581234567',kind:'parent'}),409,name+' revoked at commit');check(()=>assert.equal(rowsBefore(),auditBefore));check(()=>assert.equal(sqlite.prepare('SELECT contact_phone FROM accounts WHERE id=?').get('Alpha').contact_phone,valueBefore));undo();}
await login('Alpha');beforeBatch=()=>sqlite.prepare('UPDATE accounts SET contact_phone=?,contact_phone_kind=?,contact_phone_updated_at=? WHERE id=?').run('+6588888888','parent',now,'Alpha');expect(await post({phone:'+6599999999',kind:'student'}),409,'concurrent contact edit not overwritten');check(()=>assert.equal(sqlite.prepare('SELECT contact_phone FROM accounts WHERE id=?').get('Alpha').contact_phone,'+6588888888'));
check(()=>assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0));
hooks.deregister();sqlite.close();console.log(JSON.stringify({suite:'student-contact',checks,networkRequests:0,productionWrites:false}));
