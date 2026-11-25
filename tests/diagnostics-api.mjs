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
let beforeQuery=null,queryCount=0;
function statement(sql,values=[]){
 const execute=arrays=>{queryCount++;if(beforeQuery)beforeQuery(sql);const st=sqlite.prepare(sql);if(arrays)st.setReturnArrays(true);return st.columns().length?{results:st.all(...values),meta:{changes:0}}:{results:[],meta:st.run(...values)};};
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

class Bucket{
 objects=new Map();calls=[];fail=null;failNextPrefix=null;rejectConditional=false;sequence=0;
 async put(key,body,options={}){this.calls.push({method:'put',key});if(this.fail==='put')throw Error('Private storage error');if(this.failNextPrefix&&key.startsWith(this.failNextPrefix)){this.failNextPrefix=null;throw Error('Private index storage error');}const old=this.objects.get(key),headers=options.onlyIf instanceof Headers?options.onlyIf:null;if(headers?.get('if-none-match')==='*'&&old||options.onlyIf?.etagMatches&&options.onlyIf.etagMatches!==old?.etag||this.rejectConditional){this.rejectConditional=false;return null;}const value=String(body),record={key,etag:'e'+(++this.sequence),body:value};this.objects.set(key,record);return{key,etag:record.etag};}
 async get(key){this.calls.push({method:'get',key});if(this.fail==='get')throw Error('Private storage error');const found=this.objects.get(key);return found?{...found,json:async()=>JSON.parse(found.body)}:null;}
 async delete(keys){for(const key of Array.isArray(keys)?keys:[keys]){this.calls.push({method:'delete',key});this.objects.delete(key);}}
 async list({prefix='',limit=1000,cursor}={}){this.calls.push({method:'list',prefix,limit,cursor});if(this.fail==='list')throw Error('Private storage error');const offset=cursor?Number(cursor.replace('offset:','')):0;if(!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid opaque cursor');const keys=[...this.objects.keys()].filter(k=>k.startsWith(prefix)).sort(),page=keys.slice(offset,offset+limit),truncated=offset+page.length<keys.length;return{objects:page.map(key=>({key,etag:this.objects.get(key).etag})),truncated,cursor:truncated?'offset:'+(offset+page.length):undefined};}
}

const diag=await load('app/api/diagnostics/route.ts'),ingest=await load('app/api/diagnostics/ingest/route.ts'),feedRoute=await load('app/api/diagnostics/feed/route.ts'),store=await load('lib/diagnostics-store.ts'),server=await load('lib/diagnostics-server.ts'),context=await load('lib/diagnostics-context.ts'),{createSession,currentBusinessAccount}=await load('lib/auth.ts');
const bucket=new Bucket();env.DIAGNOSTICS=bucket;env.DIAGNOSTICS_FEED_URL='https://clock.example.invalid/diagnostics/feed';
const now=new Date().toISOString(),group='next-genn-edu';let checks=0;const logs=[],oldConsole=console.error;console.error=(...value)=>logs.push(value);globalThis.fetch=async()=>{throw Error('Network forbidden in diagnostic API fixture');};
function check(label,fn){fn();checks++;}function expect(response,status,label){assert.equal(response.status,status,label+': '+JSON.stringify(response.data));checks++;return response.data;}
function add(id,role='student',email=''){if(role==='student')sqlite.prepare('INSERT INTO students(group_id,name,name_key,active,created_at) VALUES(?,?,?,1,?)').run(group,id,id,now);sqlite.prepare('INSERT INTO accounts(group_id,id,email,name,role,student_name,created_at,activated_at,name_confirmed_at) VALUES(?,?,?,?,?,?,?,?,?)').run(group,id,email,id,role,role==='student'?id:null,now,now,now);sqlite.prepare('INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES(?,?,?,0,?)').run(id,id,'fictional-never-used',now);}
add('Alpha');add('Teacher','teacher');add('Admin','admin');add('Owner','admin','felixtey2016@gmail.com');
sqlite.prepare("INSERT INTO tuition_groups(id,name,join_code,active,created_at,updated_at) VALUES('beta','Beta fictional','beta-code',1,?,?)").run(now,now);
async function login(id){token=(await createSession(id)).token;}
const req=(path,body,headers={})=>new Request('https://fictional.invalid'+path,body===undefined?{headers}:{method:'POST',headers:{origin:'https://fictional.invalid','content-type':'application/json',...headers},body:JSON.stringify(body)});
async function call(route,path,body,headers){const response=await route[body===undefined?'GET':'POST'](req(path,body,headers));return{status:response.status,data:await response.json(),headers:response.headers};}
const item={source:'browser',code:'runtime_exception',route:'/quiz/some-private-name',status:500},input={events:[item]};
try{
 expect(await call(ingest,'/api/diagnostics/ingest',input),401,'anonymous ingest denied');expect(await call(diag,'/api/diagnostics'),401,'anonymous owner console denied');expect(await call(feedRoute,'/api/diagnostics/feed?token=fake'),401,'URL token not authorization');
 await login('Alpha');expect(await call(diag,'/api/diagnostics'),403,'student cannot read owner console');expect(await call(feedRoute,'/api/diagnostics/feed'),401,'session cookie never authorizes AI feed');
 expect(await call(ingest,'/api/diagnostics/ingest',input,{origin:'https://evil.invalid'}),403,'cross-origin ingest denied');
 expect(await call(ingest,'/api/diagnostics/ingest',{events:[{...item,message:'Private SQL or student name'}]}),400,'raw message rejected');
 expect(await call(ingest,'/api/diagnostics/ingest',{events:[{...item,groupId:'beta'}]}),400,'client cannot attribute group');
 for(const source of ['worker','cron','platform','background'])expect(await call(ingest,'/api/diagnostics/ingest',{events:[{...item,source}]}),400,'client cannot claim '+source);
 expect(await call(ingest,'/api/diagnostics/ingest',{events:Array(11).fill(item)}),400,'batch cap10');expect(await call(ingest,'/api/diagnostics/ingest',{events:[]}),400,'empty batch rejected');
 expect(await call(ingest,'/api/diagnostics/ingest',{events:[{...item,frame:{asset:'x'.repeat(9000)}}]}),413,'payload byte cap8KB');
 const ordinary=expect(await call(ingest,'/api/diagnostics/ingest',{events:[{...item,status:409}]}),202,'ordinary4xx ignored');check('expected validation creates no report',()=>assert.equal(ordinary.accepted,0));
 store.resetDiagnosticMemoryForTests();expect(await call(ingest,'/api/diagnostics/ingest',input),202,'authenticated untrusted report accepted');
 let reports=await store.readDiagnosticFeed(bucket,{scope:'all',groupId:null});check('ingest assigns actual group and marks client data untrusted',()=>{assert.equal(reports.events.length,1);assert.equal(reports.events[0].groupId,group);assert.equal(reports.events[0].route,'/quiz/[id]');assert.equal(reports.events[0].trust,'untrusted_client');assert(!JSON.stringify(reports).includes('some-private-name'));});
 for(const [name,change,undo]of[
 ['role',()=>sqlite.prepare("UPDATE accounts SET role='teacher' WHERE id='Alpha'").run(),()=>sqlite.prepare("UPDATE accounts SET role='student' WHERE id='Alpha'").run()],
 ['group',()=>sqlite.prepare("UPDATE tuition_groups SET active=0 WHERE id=?").run(group),()=>sqlite.prepare("UPDATE tuition_groups SET active=1 WHERE id=?").run(group)],
 ['session',()=>sqlite.prepare("DELETE FROM sessions WHERE account_id='Alpha'").run(),()=>{}],
 ['password',()=>sqlite.prepare("UPDATE local_credentials SET must_change_password=1 WHERE account_id='Alpha'").run(),()=>sqlite.prepare("UPDATE local_credentials SET must_change_password=0 WHERE account_id='Alpha'").run()],
 ]){await login('Alpha');const before=bucket.objects.size;beforeQuery=sql=>{if(sql.startsWith('SELECT 1 FROM accounts a JOIN tuition_groups g ON g.id=?')){beforeQuery=null;change();}};expect(await call(ingest,'/api/diagnostics/ingest',{events:[{...item,code:'network_failure'}]}),403,name+' revoked before ingest guard');check(name+' revocation writes no diagnostic',()=>assert.equal(bucket.objects.size,before));undo();}
 await login('Owner');const created=expect(await call(diag,'/api/diagnostics',{action:'createKey',label:'Fictional read alpha',scope:'group',groupId:group,expiresDays:30}),200,'owner creates scoped key');check('secret returned once only',()=>assert.match(created.token,/^tmd1_/));
 let keys=expect(await call(diag,'/api/diagnostics?view=keys'),200,'owner reads key metadata');check('metadata omits token and hash',()=>{assert.equal(keys.keys.length,1);assert(!JSON.stringify(keys).includes(created.token));assert(!JSON.stringify(keys).includes('tokenHash'));assert.equal(keys.feedUrl,env.DIAGNOSTICS_FEED_URL);});
 const scoped=expect(await call(feedRoute,'/api/diagnostics/feed',undefined,{authorization:'Bearer '+created.token}),200,'bearer reads fixed tenant');check('feed scoped to tenant',()=>assert(scoped.events.every(e=>e.groupId===group)));
 expect(await call(feedRoute,'/api/diagnostics/feed?groupId=beta',undefined,{authorization:'Bearer '+created.token}),403,'bearer cannot change tenant');expect(await call(feedRoute,'/api/diagnostics/feed?limit=31',undefined,{authorization:'Bearer '+created.token}),400,'feed max30');
 expect(await call(diag,'/api/diagnostics',{action:'createKey',label:'No group',scope:'group',groupId:'no-such-group',expiresDays:30}),404,'key group must exist');
 expect(await call(diag,'/api/diagnostics',{action:'revokeKey',id:created.key.id}),200,'owner revokes key');expect(await call(feedRoute,'/api/diagnostics/feed',undefined,{authorization:'Bearer '+created.token}),401,'revoked key denied');
 const originalList=bucket.list.bind(bucket);let revokeOwner=true;bucket.list=async options=>{const result=await originalList(options);if(revokeOwner){revokeOwner=false;sqlite.prepare("UPDATE accounts SET role='teacher' WHERE id='Owner'").run();}return result;};expect(await call(diag,'/api/diagnostics?view=keys'),403,'owner revocation after R2 blocks key metadata');bucket.list=originalList;sqlite.prepare("UPDATE accounts SET role='admin' WHERE id='Owner'").run();
 // The actual request context keeps concurrent groups isolated and never queries D1 for logging.
 store.resetDiagnosticMemoryForTests();const tasks=[],request=new Request('https://fictional.invalid/api/billing?student=PRIVATE-NAME'),c=context.newDiagnosticContext(request,{DIAGNOSTICS:bucket,CF_VERSION_METADATA:{id:'12345678-abcd-1234-abcd-123456789abc'}},p=>tasks.push(p));
 await context.withDiagnosticContext(c,async()=>{await login('Alpha');const actor=await currentBusinessAccount();assert.equal(actor.groupId,group);const n=queryCount;server.reportUnexpectedError(new Error('D1_ERROR SQLITE_LIMIT SELECT PRIVATE_NAME phone=60123456789'),{operation:'api-billing'});server.reportUnexpectedError(new Error('D1_ERROR other'),{operation:'api-billing'});assert.equal(queryCount,n);});await Promise.all(tasks);
 reports=await store.readDiagnosticFeed(bucket,{scope:'all',groupId:null});const serverEvent=reports.events.find(e=>e.operation==='api-billing');check('existing auth sets trusted group without a logging query',()=>{assert(serverEvent);assert.equal(serverEvent.groupId,group);assert.equal(serverEvent.trust,'server');assert.equal(serverEvent.code,'database_limit');assert.equal(serverEvent.requestId,c.requestId);assert(!JSON.stringify(reports).includes('PRIVATE_NAME'));assert(!JSON.stringify(reports).includes('60123456789'));});
 const isolated=new Bucket(),pending=[],ca=context.newDiagnosticContext(new Request('https://fictional.invalid/api/action'),{DIAGNOSTICS:isolated},p=>pending.push(p)),cb=context.newDiagnosticContext(new Request('https://fictional.invalid/api/state'),{DIAGNOSTICS:isolated},p=>pending.push(p));let release;const barrier=new Promise(resolve=>release=resolve);
 await Promise.all([context.withDiagnosticContext(ca,async()=>{context.setDiagnosticActor({groupId:'alpha'});await barrier;server.reportUnexpectedError(null,{operation:'api-action'});}),context.withDiagnosticContext(cb,async()=>{context.setDiagnosticActor({groupId:'beta'});release();await Promise.resolve();server.reportUnexpectedError(null,{operation:'api-state'});})]);await Promise.all(pending);const both=await store.readDiagnosticFeed(isolated,{scope:'all',groupId:null});check('concurrent ALS requests cannot cross tenant attribution',()=>{assert.equal(both.events.length,2);assert.equal(both.events.find(e=>e.operation==='api-action').groupId,'alpha');assert.equal(both.events.find(e=>e.operation==='api-state').groupId,'beta');});
 check('ordinary business audit is not used for diagnostic events',()=>assert.equal(sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action LIKE '%diagnostic%'").get().n,0));
 console.log(JSON.stringify({suite:'diagnostics-api-identity-context',checks,productionWrites:false,networkRequests:0}));
}finally{console.error=oldConsole;hooks.deregister();sqlite.close();}
