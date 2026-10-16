import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {drizzle} from 'drizzle-orm/d1';
import ts from 'typescript';

// Real migrations, SQLite transactions, password hashes, authentication, and
// route handlers. All identities are fictional; no hosted binding is present.
const resultDirectory=new URL('../../../work/part03-permissions-round3/',import.meta.url);
mkdirSync(resultDirectory,{recursive:true});
const startedAt=new Date().toISOString(),results=[],log=[];
const record=message=>{log.push(message);console.log(message);};
const sqlite=new DatabaseSync(':memory:');
const fixtureOwnerEmail='permissions-owner@example.test';
const configuredOwnerEmail=readFileSync(new URL('../lib/owner.ts',import.meta.url),'utf8').match(/export const OWNER_EMAIL\s*=\s*"([^"]+)";/)?.[1];
assert(configuredOwnerEmail,'Owner constant required for the isolated fixture');
const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();
const preparationMigration=migrations.find(name=>name.startsWith('0032_'));
assert(preparationMigration,'Round 1 migration 0032 is required');
const migrate=name=>sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8').replaceAll(configuredOwnerEmail,fixtureOwnerEmail));
for(const name of migrations.filter(name=>name<preparationMigration))migrate(name);

let beforeBatch=null,beforeAuditRead=null,authorityReadsBeforeAudit=0,failLifecycleAudit=false;
function statement(sql,values=[]){
  const execute=arrays=>{
    if(failLifecycleAudit&&/INSERT INTO audit/.test(sql)&&values.some(value=>value==="adminPermissions.applyDraft"||value==="adminPermissions.discardDraft"))throw new Error("Fictional lifecycle audit failure");
    if(beforeAuditRead){
      if(/\bAS\s+canManageAdministrators\b/i.test(sql))authorityReadsBeforeAudit++;
      if(/^\s*SELECT\b[\s\S]*?\bFROM\s+(?:"audit"|audit)(?:\s|$)/i.test(sql)){const hook=beforeAuditRead;beforeAuditRead=null;hook();}
    }
    const prepared=sqlite.prepare(sql);if(arrays)prepared.setReturnArrays(true);return prepared.columns().length?{results:prepared.all(...values),meta:{changes:0}}:{results:[],meta:prepared.run(...values)};
  };
  return {sql,bind:(...next)=>statement(sql,next),first:async()=>execute(false).results[0]||null,all:async()=>execute(false),raw:async()=>execute(true).results,run:async()=>execute(false),execute:()=>execute(false)};
}
const d1={prepare:statement,async batch(items){
  const writesDraft=items.some(item=>/^(?:UPDATE admin_permission_profiles|INSERT INTO admin_permission_profiles)/.test(item.sql));
  const hook=writesDraft?beforeBatch:null;if(hook){beforeBatch=null;await hook();}
  sqlite.exec('BEGIN');
  try{const values=items.map(item=>item.execute());sqlite.exec('COMMIT');return values;}
  catch(error){sqlite.exec('ROLLBACK');throw error;}
}};
let cookieValues={},requestHeaders=new Headers();
class JsonResponse extends Response{
  static json(data,options){const response=new JsonResponse(JSON.stringify(data),{...options,headers:{'content-type':'application/json',...options?.headers}});response.cookies={set:(name,value)=>cookieValues[name]=value,delete:name=>delete cookieValues[name]};return response;}
}
const runtime={env:{DB:d1,ADMIN_PERMISSIONS_MODE:'enforced',GOOGLE_CLIENT_ID:'permissions-fixture-client'},cookies:async()=>({get:name=>cookieValues[name]?{value:cookieValues[name]}:undefined}),headers:async()=>requestHeaders,NextResponse:JsonResponse,getDb:()=>drizzle(d1)};
globalThis.__adminPermissions=runtime;
const stub='data:text/javascript;base64,'+Buffer.from('export const {env,cookies,headers,NextResponse,getDb}=globalThis.__adminPermissions;').toString('base64');
const applicationRoot=new URL('../',import.meta.url).href;
const hooks=registerHooks({
  resolve(specifier,context,nextResolve){
    if(['cloudflare:workers','next/headers','next/server','@/db'].includes(specifier))return {url:stub,shortCircuit:true};
    if(specifier.startsWith('@/'))return {url:new URL(specifier.slice(2)+'.ts',applicationRoot).href,shortCircuit:true};
    if(specifier.startsWith('.')&&context.parentURL?.startsWith(applicationRoot)&&context.parentURL.endsWith('.ts'))return {url:new URL(/\.[cm]?[jt]sx?$/.test(specifier)?specifier:specifier+'.ts',context.parentURL).href,shortCircuit:true};
    return nextResolve(specifier,context);
  },
  load(url,context,nextLoad){
    if(url.startsWith(applicationRoot)&&url.endsWith('.ts')){
      let source=readFileSync(new URL(url),'utf8');
      if(url===new URL('../lib/owner.ts',import.meta.url).href)source=source.replaceAll(configuredOwnerEmail,fixtureOwnerEmail);
      return {format:'module',source:ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
    }
    return nextLoad(url,context);
  },
});
const load=async file=>import(new URL('../'+file,import.meta.url));
const auth=await load('lib/auth.ts'),pw=await load('lib/password.ts');
const permission=await load('lib/admin-permissions.ts'),permissionServer=await load('lib/admin-permissions-server.ts');
const routes={};for(const name of ['admin-permissions','auth','action','groups','state','billing','learning','classrooms','academic-catalogues','manage','folders','class-sessions','attendance','student-promotions','conflicts','lesson-history','sheet-sync'])routes[name]=await load('app/api/'+name+'/route.ts');
const now=new Date().toISOString(),password='Fictional-permissions-password-123',passwordHash=await pw.hashPassword(password);
const groups={a:'next-genn-edu',b:'permissions-b',raceActor:'permissions-actor-race',raceTarget:'permissions-target-race',raceRevision:'permissions-revision-race',raceRead:'permissions-read-race'};
for(const id of Object.values(groups).filter(id=>id!==groups.a))sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,id,now,now);
function account(id,role='admin',groupId=groups.a,options={}){
  sqlite.prepare('INSERT INTO accounts(group_id,id,email,name,role,teacher_name,student_name,created_at,name_confirmed_at,activated_at,disabled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(groupId,id,options.email??'',id,role,options.teacherName??null,options.studentName??null,now,now,role==='pending'?null:now,options.disabled?now:null);
  sqlite.prepare('INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES(?,?,?,?,?)').run(id,id,passwordHash,options.temporary?1:0,now);
}
account('owner','admin',null,{email:fixtureOwnerEmail});
for(const id of ['chief-a','admin-a','admin-peer','draft-admin','audit-target','secret-private-target'])account(id);
account('admin-disabled','admin',groups.a,{disabled:true});
account('chief-b','admin',groups.b);account('admin-b','admin',groups.b);
account('local:owner-impostor','admin',groups.a,{email:fixtureOwnerEmail});
account('teacher-a','teacher',groups.a,{teacherName:'Fixture Teacher'});
account('student-a','student',groups.a,{studentName:'Fixture Student'});account('pending-a','pending');
for(const [group,chief,target,next]of [[groups.raceActor,'race-chief','race-admin','race-next'],[groups.raceTarget,'target-chief','target-admin','target-next'],[groups.raceRevision,'revision-chief','revision-admin','revision-next'],[groups.raceRead,'read-chief','read-admin','read-next']]){
  for(const id of [chief,target,next])account(id,'admin',group);
  sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run(chief,group);
}
sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('chief-a',groups.a);
sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('chief-b',groups.b);
sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(groups.a,'Fixture Teacher',now);
sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(groups.a,'Unused Teacher',now);
sqlite.prepare('INSERT INTO students(group_id,name,name_key,created_at,grade) VALUES(?,?,?,?,?)').run(groups.a,'Fixture Student','fixturestudent',now,'Form 3');
const tableNames=()=>sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
const snapshotTables=names=>JSON.stringify(names.map(name=>[name,sqlite.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()]));
const oldTables=tableNames(),beforeMigration=snapshotTables(oldTables);
migrate(preparationMigration);
const afterMigration=snapshotTables(oldTables);
const snapshot=()=>snapshotTables(tableNames());
const profileRow=id=>sqlite.prepare('SELECT * FROM admin_permission_profiles WHERE account_id=?').get(id);
const auditCount=()=>sqlite.prepare('SELECT count(*) AS n FROM audit').get().n;
async function login(id,groupId){
  const token='permissions-session-'+crypto.randomUUID();
  sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run(await auth.hashToken(token),id,new Date(Date.now()+86400000).toISOString());
  cookieValues.tuition_session=token;requestHeaders=new Headers(groupId?{'x-tickminder-group':groupId}:{});
}
function logout(){cookieValues={};requestHeaders=new Headers();}
function request(name,body,query='',options={}){
  return new Request('https://test.invalid/api/'+name+query,{...(body===undefined?{}:{method:'POST',headers:{origin:'https://test.invalid','content-type':'application/json'},body:JSON.stringify(body)}),...options});
}
async function call(name,body,query='',options){const response=await routes[name][body===undefined?'GET':'POST'](request(name,body,query,options));return {status:response.status,data:await response.json(),headers:response.headers};}
async function ok(name,body,query){const result=await call(name,body,query);assert.equal(result.status,200,JSON.stringify({name,status:result.status,data:result.data}));return result.data;}
async function denied(name,body,query='',statuses=[400,401,403,404,409]){const result=await call(name,body,query);assert.ok(statuses.includes(result.status),JSON.stringify({name,status:result.status,data:result.data}));return result;}
const query=id=>'?accountId='+encodeURIComponent(id);
const readProfile=id=>ok('admin-permissions',undefined,query(id));
const save=(id,expectedRevision,grants,extra={})=>ok('admin-permissions',{accountId:id,expectedRevision,grants,...extra});
async function unchanged(label,operation){const before=snapshot(),value=await operation();assert.equal(snapshot(),before,label+': no partial mutation or success audit');return value;}
async function section(name,operation){
  const begin=Date.now();
  try{await operation();results.push({name,status:'passed',durationMs:Date.now()-begin});record('PASS '+name);}
  catch(error){results.push({name,status:'failed',durationMs:Date.now()-begin,error:error.stack||String(error)});record('FAIL '+name+'\n'+(error.stack||String(error)));}
  finally{beforeBatch=null;beforeAuditRead=null;}
}
const canonical=values=>[...values].sort();
const contains=(values,key)=>assert.ok(values.includes(key),'Expected '+key);
function pendingState(data){assert.equal(data.rollout,'preparation');assert.equal(data.status,'pending');assert.equal(data.runtimeEnforcement,false);assert.equal(data.currentAccess,'legacy');assert.deepEqual(data.effectiveGrants,permission.LEGACY_ADMIN_GRANTS);}
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('Network access is forbidden in this isolated suite');};

const adminId='draft-admin',profileFor=profileRow,profileKeys=id=>JSON.parse(profileFor(id)?.grants_json||'[]'),draftKeys=id=>{const value=profileFor(id)?.draft_grants_json;return value===null||value===undefined?null:JSON.parse(value);};
const baseline=(id,keys)=>sqlite.prepare('UPDATE admin_permission_profiles SET grants_json=?,draft_grants_json=NULL WHERE account_id=?').run(JSON.stringify(permission.normalizeAdminGrants(keys)),id);
const lifecycle=(action,id,revision,extra={})=>call('admin-permissions',{action,accountId:id,expectedRevision:revision,...extra});
async function transition(action,id,revision,extra={}){const result=await lifecycle(action,id,revision,extra);assert.equal(result.status,200,JSON.stringify(result));return result.data;}
async function stage(id,keys){const current=await readProfile(id);return save(id,current.profile.revision,keys);}
const lastAudit=()=>sqlite.prepare('SELECT * FROM audit ORDER BY rowid DESC LIMIT 1').get();
function activeResponse(data,draft){assert.equal(data.rollout,'active');assert.equal(data.runtimeEnforcement,true);assert.equal(data.currentAccess,'configured');assert.equal(data.status,draft?'pending':'active');assert.equal(data.draftStatus,draft?'saved':'none');assert.equal(data.canApplyDraft,draft);assert.equal(data.canDiscardDraft,draft);}

try{
await section('preparation remains off and cannot apply even an explicitly saved draft',async()=>{
  delete runtime.env.ADMIN_PERMISSIONS_MODE;await login('chief-a');const saved=await stage(adminId,[]);pendingState(saved);assert.equal(saved.draftStatus,'saved');assert.equal(saved.canApplyDraft,false);assert.equal(saved.canDiscardDraft,true);
  for(const action of [['applyDraft'],['discardDraft'],null,true,false,{}])await unchanged('preparation rejects non-string lifecycle action',()=>denied('admin-permissions',{action,accountId:adminId,expectedRevision:saved.profile.revision},'',[400]));
  await unchanged('preparation cannot activate',()=>denied('admin-permissions',{action:'applyDraft',accountId:adminId,expectedRevision:saved.profile.revision},'',[409]));
  assert.equal((await lifecycle('applyDraft',adminId,saved.profile.revision)).data.error,'permissions.applyUnavailable');
  const discarded=await transition('discardDraft',adminId,saved.profile.revision);pendingState(discarded);assert.equal(discarded.profile.draftGrants,null);assert.deepEqual(discarded.profile.grants,permission.LEGACY_ADMIN_GRANTS);assert.equal(discarded.canApplyDraft,false);assert.equal(discarded.canDiscardDraft,false);
});

await section('enforced lifecycle reports active baseline and saved draft independently',async()=>{
  runtime.env.ADMIN_PERMISSIONS_MODE='enforced';await login('chief-a');const current=await readProfile(adminId);activeResponse(current,false);assert.equal(current.profile.origin,'legacy');assert.deepEqual(current.effectiveGrants,permission.LEGACY_ADMIN_GRANTS);
  const saved=await stage(adminId,['students.create']);activeResponse(saved,true);assert.deepEqual(saved.profile.draftGrants,permission.normalizeAdminGrants(['students.create']));assert.deepEqual(saved.profile.grants,current.profile.grants);assert.deepEqual(saved.effectiveGrants,current.effectiveGrants);
  const audit=lastAudit();assert.equal(audit.action,'adminPermissions.saveDraft');assert.equal(JSON.parse(audit.after_json).rollout,'active');
});

await section('new administrators gain business access only after applying the saved draft',async()=>{
  account('lifecycle-new');await login('chief-a');const initial=await readProfile('lifecycle-new');activeResponse(initial,false);assert.equal(initial.profile.revision,0);assert.deepEqual(initial.effectiveGrants,[]);
  const saved=await stage('lifecycle-new',['students.create']);assert.deepEqual(saved.effectiveGrants,[]);assert.deepEqual(saved.profile.grants,[]);assert.equal(saved.profile.origin,'new');
  await login('lifecycle-new');await unchanged('saved draft grants nothing',()=>denied('action',{action:'saveStudent',name:'Before Apply Student',syllabusId:'spm',grade:'Form 3'},'',[403]));
  await login('chief-a');const beforeRevision=sqlite.prepare('SELECT max(rowid) AS n FROM audit').get().n,applied=await transition('applyDraft','lifecycle-new',saved.profile.revision);activeResponse(applied,false);assert.equal(applied.profile.revision,saved.profile.revision+1);assert.deepEqual(applied.effectiveGrants,permission.normalizeAdminGrants(['students.create']));assert.equal(applied.profile.draftGrants,null);assert.equal(applied.profile.origin,'new');assert.equal(applied.profile.updatedBy,'chief-a');assert.ok(sqlite.prepare('SELECT max(rowid) AS n FROM audit').get().n>beforeRevision);
  const audit=lastAudit();assert.equal(audit.action,'adminPermissions.applyDraft');assert.equal(JSON.parse(audit.before_json).profile.grants.length,0);assert.equal(JSON.parse(audit.after_json).effectiveChanged,true);
  await login('lifecycle-new');const authReply=await ok('auth');assert.deepEqual(authReply.account.adminPermissions.grants,applied.profile.grants);await ok('action',{action:'saveStudent',name:'After Apply Student',syllabusId:'spm',grade:'Form 3'});assert.ok(sqlite.prepare('SELECT name FROM students WHERE name=?').get('After Apply Student'));
});

await section('applying an empty draft revokes every granular grant and preserves the library',async()=>{
  await login('chief-a');const saved=await stage('lifecycle-new',[]);assert.equal(saved.canApplyDraft,true);assert.deepEqual(saved.profile.draftGrants,[]);assert.ok(saved.effectiveGrants.length>0);
  const applied=await transition('applyDraft','lifecycle-new',saved.profile.revision);activeResponse(applied,false);assert.deepEqual(applied.effectiveGrants,[]);assert.deepEqual(profileKeys('lifecycle-new'),[]);assert.equal(draftKeys('lifecycle-new'),null);
  await login('lifecycle-new');await unchanged('revoked user cannot create students',()=>denied('action',{action:'saveStudent',name:'Revoked Student',syllabusId:'spm'},'',[403]));assert.ok(sqlite.prepare('SELECT name FROM students WHERE name=?').get('After Apply Student'));
});

await section('discard removes only the pending draft and is an idempotent guarded no-op',async()=>{
  await login('chief-a');baseline(adminId,['lessons.view']);const saved=await stage(adminId,['students.view']),audits=auditCount();const discarded=await transition('discardDraft',adminId,saved.profile.revision);activeResponse(discarded,false);assert.deepEqual(discarded.effectiveGrants,['lessons.view']);assert.equal(discarded.profile.revision,saved.profile.revision+1);assert.equal(auditCount(),audits+1);assert.equal(lastAudit().action,'adminPermissions.discardDraft');assert.equal(JSON.parse(lastAudit().after_json).effectiveChanged,false);
  const rows=snapshot(),again=await transition('discardDraft',adminId,discarded.profile.revision);assert.equal(again.profile.revision,discarded.profile.revision);assert.equal(snapshot(),rows);await denied('admin-permissions',{action:'discardDraft',accountId:adminId,expectedRevision:saved.profile.revision},'',[409]);
  account('lifecycle-no-profile');const initial=await readProfile('lifecycle-no-profile');await unchanged('discard absent profile never creates one',()=>transition('discardDraft','lifecycle-no-profile',initial.profile.revision));assert.equal(profileFor('lifecycle-no-profile'),undefined);
});

await section('identical draft saves are no-ops while explicit equal-baseline apply clears the draft',async()=>{
  await login('chief-a');baseline(adminId,['lessons.view']);const first=await stage(adminId,['lessons.view']),audits=auditCount(),same=await save(adminId,first.profile.revision,['lessons.view','lessons.view']);assert.equal(same.profile.revision,first.profile.revision);assert.equal(auditCount(),audits);
  const applied=await transition('applyDraft',adminId,same.profile.revision);assert.equal(applied.profile.revision,same.profile.revision+1);assert.equal(applied.profile.draftGrants,null);assert.equal(auditCount(),audits+1);assert.equal(JSON.parse(lastAudit().after_json).effectiveChanged,false);
  await unchanged('cannot reapply a consumed draft',()=>denied('admin-permissions',{action:'applyDraft',accountId:adminId,expectedRevision:applied.profile.revision},'',[409]));
});

await section('lifecycle validation rejects inline grants unknown actions and stale revisions',async()=>{
  await login('chief-a');const saved=await stage(adminId,['students.view']);for(const action of ['applyDraft','discardDraft'])for(const extra of [{grants:[]},{activate:true},{force:true}])await unchanged(action+' unexpected fields',()=>denied('admin-permissions',{action,accountId:adminId,expectedRevision:saved.profile.revision,...extra},'',[400]));
  for(const action of ['activateDraft','apply','activate','*',null,['applyDraft'],['discardDraft'],{action:'applyDraft'},123,true,false])await unchanged('unknown or non-string lifecycle action',()=>denied('admin-permissions',{action,accountId:adminId,expectedRevision:saved.profile.revision},'',[400]));
  await unchanged('mismatched aliases',()=>denied('admin-permissions',{action:'applyDraft',accountId:adminId,userId:'admin-peer',expectedRevision:saved.profile.revision},'',[400]));
  for(const revision of [-1,null,'1',1.5,Number.MAX_SAFE_INTEGER])await unchanged('invalid revision',()=>denied('admin-permissions',{action:'applyDraft',accountId:adminId,expectedRevision:revision},'',[400]));
  await unchanged('stale apply',()=>denied('admin-permissions',{action:'applyDraft',accountId:adminId,expectedRevision:saved.profile.revision-1},'',[409]));
});

await section('ordinary administrators and protected identities never gain permission management',async()=>{
  for(const id of ['admin-a','teacher-a','student-a','pending-a']){await login(id);for(const action of ['applyDraft','discardDraft'])await unchanged(id+' '+action,()=>denied('admin-permissions',{action,accountId:adminId,expectedRevision:profileFor(adminId).revision},'',[403]));}
  await login('chief-a');for(const id of ['chief-a','owner','teacher-a','student-a','admin-b'])for(const action of ['applyDraft','discardDraft'])await unchanged('protected target '+id,()=>denied('admin-permissions',{action,accountId:id,expectedRevision:profileFor(id)?.revision||0},'',[403,404]));
  await login('owner',groups.a);await unchanged('Owner cannot configure chief through ordinary profile',()=>denied('admin-permissions',{action:'applyDraft',accountId:'chief-a',expectedRevision:profileFor('chief-a').revision},'',[403]));
});

await section('disabled target can receive a saved baseline without becoming enabled',async()=>{
  await login('chief-a');const saved=await stage('admin-disabled',['students.view']);const applied=await transition('applyDraft','admin-disabled',saved.profile.revision);assert.ok(applied.target.disabledAt);assert.deepEqual(applied.effectiveGrants,[]);assert.deepEqual(applied.profile.grants,['students.view']);assert.ok(sqlite.prepare('SELECT disabled_at FROM accounts WHERE id=?').get('admin-disabled').disabled_at);
});

await section('competing saved draft blocks a stale apply inside the mutation transaction',async()=>{
  await login('chief-a');const saved=await stage(adminId,['students.view']),audits=auditCount();beforeBatch=()=>sqlite.prepare('UPDATE admin_permission_profiles SET draft_grants_json=?,revision=revision+1 WHERE account_id=?').run('["teachers.view"]',adminId);
  await denied('admin-permissions',{action:'applyDraft',accountId:adminId,expectedRevision:saved.profile.revision},'',[409]);assert.deepEqual(profileKeys(adminId),['lessons.view']);assert.deepEqual(draftKeys(adminId),['teachers.view']);assert.equal(auditCount(),audits);
  const current=await readProfile(adminId);const applied=await transition('applyDraft',adminId,current.profile.revision);assert.deepEqual(applied.effectiveGrants,['teachers.view']);
});

await section('unchanged revision cannot conceal an altered stored draft or active baseline',async()=>{
  await login('chief-a');const saved=await stage(adminId,['students.view']),audits=auditCount();beforeBatch=()=>sqlite.prepare('UPDATE admin_permission_profiles SET draft_grants_json=? WHERE account_id=?').run('["teachers.view"]',adminId);
  await denied('admin-permissions',{action:'applyDraft',accountId:adminId,expectedRevision:saved.profile.revision},'',[409]);assert.deepEqual(profileKeys(adminId),['teachers.view']);assert.deepEqual(draftKeys(adminId),['teachers.view']);assert.equal(auditCount(),audits);
});

await section('stale revoke-all and discard cannot overwrite a concurrent permission restoration',async()=>{
  await login('chief-a');const empty=await stage(adminId,[]),audits=auditCount();beforeBatch=()=>sqlite.prepare('UPDATE admin_permission_profiles SET grants_json=?,draft_grants_json=NULL,revision=revision+1 WHERE account_id=?').run('["teachers.view"]',adminId);
  await denied('admin-permissions',{action:'applyDraft',accountId:adminId,expectedRevision:empty.profile.revision},'',[409]);assert.deepEqual(profileKeys(adminId),['teachers.view']);assert.equal(draftKeys(adminId),null);assert.equal(auditCount(),audits);
  const saved=await stage(adminId,['students.view']),discardAudits=auditCount();beforeBatch=()=>sqlite.prepare('UPDATE admin_permission_profiles SET draft_grants_json=?,revision=revision+1 WHERE account_id=?').run('[]',adminId);
  await denied('admin-permissions',{action:'discardDraft',accountId:adminId,expectedRevision:saved.profile.revision},'',[409]);assert.deepEqual(profileKeys(adminId),['teachers.view']);assert.deepEqual(draftKeys(adminId),[]);assert.equal(auditCount(),discardAudits);
});

await section('in-flight chief handover prevents a former chief from applying permissions',async()=>{
  await login('chief-a');const saved=await stage(adminId,['students.view']),audits=auditCount(),before=profileFor(adminId);beforeBatch=()=>sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('admin-peer',groups.a);
  try{await denied('admin-permissions',{action:'applyDraft',accountId:adminId,expectedRevision:saved.profile.revision},'',[409]);assert.deepEqual(profileFor(adminId),before);assert.equal(auditCount(),audits);}finally{sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('chief-a',groups.a);}
});

await section('target promotion to chief blocks application even by the platform Owner',async()=>{
  await login('owner',groups.a);const saved=await stage(adminId,['students.view']),audits=auditCount(),before=profileFor(adminId);beforeBatch=()=>sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run(adminId,groups.a);
  try{await denied('admin-permissions',{action:'applyDraft',accountId:adminId,expectedRevision:saved.profile.revision},'',[409]);assert.deepEqual(profileFor(adminId),before);assert.equal(auditCount(),audits);}finally{sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('chief-a',groups.a);}
});

await section('logout and session expiry during a request prevent saved-draft application',async()=>{
  for(const expire of [false,true]){await login('chief-a');const saved=await stage(adminId,['students.view']),audits=auditCount(),before=profileFor(adminId);beforeBatch=()=>expire?sqlite.prepare('UPDATE sessions SET expires_at=? WHERE account_id=?').run('2000-01-01T00:00:00.000Z','chief-a'):sqlite.prepare('DELETE FROM sessions WHERE account_id=?').run('chief-a');await denied('admin-permissions',{action:'applyDraft',accountId:adminId,expectedRevision:saved.profile.revision},'',[409]);assert.deepEqual(profileFor(adminId),before);assert.equal(auditCount(),audits);}
});

await section('profile mutation and lifecycle audit are one rollback unit',async()=>{
  await login('chief-a');const saved=await stage(adminId,['students.view']);for(const action of ['applyDraft','discardDraft']){const before=snapshot();failLifecycleAudit=true;try{await denied('admin-permissions',{action,accountId:adminId,expectedRevision:saved.profile.revision},'',[503]);assert.equal(snapshot(),before);}finally{failLifecycleAudit=false;}}
  const applied=await transition('applyDraft',adminId,saved.profile.revision);assert.deepEqual(applied.effectiveGrants,['students.view']);
});

await section('malformed stored grants cannot be normalized into a silently broader profile',async()=>{
  await login('chief-a');const before=profileFor(adminId);for(const keys of [['students.edit'],['students.view','students.view'],['students.view','finance.view'],['*']]){sqlite.prepare('UPDATE admin_permission_profiles SET grants_json=? WHERE account_id=?').run(JSON.stringify(keys),adminId);await denied('admin-permissions',undefined,query(adminId),[503]);const revision=profileFor(adminId).revision;await denied('admin-permissions',{action:'saveDraft',accountId:adminId,expectedRevision:revision,grants:[]},'',[503]);}
  sqlite.prepare('UPDATE admin_permission_profiles SET grants_json=?,draft_grants_json=? WHERE account_id=?').run(before.grants_json,before.draft_grants_json,adminId);
  for(const keys of [['lessons.*'],['homework.grade'],['finance.view'],['futureModule.view']])await unchanged('unknown future grant remains disabled',()=>denied('admin-permissions',{action:'saveDraft',accountId:adminId,expectedRevision:before.revision,grants:keys},'',[400]));
});

await section('lifecycle snapshots contain no credentials and maintain database integrity',async()=>{
  const text=JSON.stringify(sqlite.prepare("SELECT before_json,after_json FROM audit WHERE action LIKE 'adminPermissions.%'").all());assert.equal(text.includes(password),false);assert.equal(text.includes(passwordHash),false);assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal(sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(permission.ADMIN_PERMISSIONS_ROLLOUT,'preparation','source deployment status remains unactivated');
});
}finally{
  globalThis.fetch=originalFetch;hooks.deregister();delete globalThis.__adminPermissions;
  const summary={suite:'admin-permissions-lifecycle',round:3,productionWrites:false,networkRequests:0,deploymentActivated:false,sections:results.length,passed:results.filter(result=>result.status==='passed').length,failed:results.filter(result=>result.status==='failed').length,results};record(JSON.stringify({...summary,results:undefined}));writeFileSync(new URL('lifecycle-results.json',resultDirectory),JSON.stringify(summary,null,2)+'\n');writeFileSync(new URL('lifecycle-tests.log',resultDirectory),log.join('\n')+'\n');sqlite.close();if(summary.failed)process.exitCode=1;
}
