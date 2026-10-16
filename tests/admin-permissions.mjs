import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {drizzle} from 'drizzle-orm/d1';
import ts from 'typescript';

// Real migrations, SQLite transactions, password hashes, authentication, and
// route handlers. All identities are fictional; no hosted binding is present.
const resultDirectory=new URL('../../../work/part03-permissions-round1/',import.meta.url);
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

let beforeBatch=null,beforeAuditRead=null,authorityReadsBeforeAudit=0;
function statement(sql,values=[]){
  const execute=arrays=>{
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
const runtime={env:{DB:d1,GOOGLE_CLIENT_ID:'permissions-fixture-client'},cookies:async()=>({get:name=>cookieValues[name]?{value:cookieValues[name]}:undefined}),headers:async()=>requestHeaders,NextResponse:JsonResponse,getDb:()=>drizzle(d1)};
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
const routes={};for(const name of ['admin-permissions','auth','action','groups','state','billing','learning','classrooms','academic-catalogues'])routes[name]=await load('app/api/'+name+'/route.ts');
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

try{
await section('migration preserves all existing business rows and legacy access',async()=>{
  assert.equal(afterMigration,beforeMigration,'additive migration cannot alter identity, chief, lessons, financial or business rows');
  const admins=sqlite.prepare("SELECT id FROM accounts WHERE role='admin' AND group_id IS NOT NULL").all();
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM admin_permission_profiles').get().n,admins.length);
  for(const {id}of admins){const row=profileRow(id);assert.equal(row.origin,'legacy');assert.equal(row.revision,1);assert.deepEqual(JSON.parse(row.grants_json),permission.LEGACY_ADMIN_GRANTS);assert.equal(row.draft_grants_json,null);}
  await login('chief-a');const data=await readProfile('admin-a');pendingState(data);assert.equal(data.profile.origin,'legacy');assert.deepEqual(data.configuredGrants,permission.LEGACY_ADMIN_GRANTS);assert.equal(data.profile.draftGrants,null);
  for(const key of ['accounts.assign','accounts.resetPassword','lessons.create','attendance.review','students.promote','sheetSync.commit','materials.view','homework.view','quizzes.share','quizAssignments.grade'])contains(data.profile.grants,key);
});

await section('catalog and templates deny unknown future financial and unsupported powers',async()=>{
  await login('chief-a');const data=await readProfile('admin-a'),keys=data.catalog.flatMap(module=>module.actions.map(action=>action.key));
  assert.equal(new Set(keys).size,keys.length);assert.ok(keys.length>60);
  assert.ok(keys.every(key=>/^[A-Za-z]+\.[A-Za-z]+$/.test(key)),'all grants are explicit module.action keys');
  for(const id of ['finance','invoices','parents','resources','progress','publicModeration','exports','adminIdentity','groups','academicCatalogues','backup']){const module=data.catalog.find(item=>item.id===id);assert.ok(module,id+' reserved entry exists');assert.equal(module.availability,'reserved');assert.deepEqual(module.actions,[]);assert.deepEqual(module.supportedActions,[]);}
  assert.deepEqual(data.catalog.find(module=>module.id==='materials').supportedActions,['view']);
  for(const key of ['materials.create','materials.edit','homework.create','homework.edit','homework.grade','finance.view','finance.edit','invoices.view','adminIdentity.assign','groups.edit','backup.export','futureWidget.view','*','lessons.*','*.view','LESSONS.view','lessons.view ']){
    assert.equal(permission.hasAdminGrant([key],key),false,'unknown/unsupported grant must default deny: '+key);
    assert.throws(()=>permission.normalizeAdminGrants([key]),permission.AdminPermissionValidationError,key);
    await unchanged('invalid grant '+key,()=>denied('admin-permissions',{accountId:'admin-a',expectedRevision:1,grants:[key]},'',[400]));
  }
  assert.deepEqual(data.templates.map(template=>template.id),['none','readOnly','scheduling','academicSupport','legacy']);
  assert.deepEqual(data.templates.find(template=>template.id==='none').grants,[]);
  assert.ok(data.templates.find(template=>template.id==='readOnly').grants.every(key=>key.endsWith('.view')));
  for(const template of data.templates){assert.ok(template.grants.every(key=>keys.includes(key)));assert.equal(template.grants.some(key=>/^(finance|invoices|adminIdentity|groups|backup)\./.test(key)),false);}
  assert.equal(permission.hasAdminGrant([], 'students.view'),false);
});

await section('write grants require their view and cross-module prerequisites',async()=>{
  assert.deepEqual(canonical(permission.normalizeAdminGrants(['students.edit','students.edit'])),['students.edit','students.view']);
  assert.deepEqual(canonical(permission.normalizeAdminGrants(['attendance.review'])),['attendance.review','attendance.view','lessons.view']);
  assert.deepEqual(canonical(permission.normalizeAdminGrants(['sheetSync.commit'])),['sheetSync.commit','sheetSync.preview','sheetSync.view']);
  assert.deepEqual(canonical(permission.normalizeAdminGrants(['quizAssignments.assign'])),['quizAssignments.assign','quizAssignments.view','quizzes.view']);
  await login('chief-a');const before=await readProfile('draft-admin'),audits=auditCount();
  const saved=await save('draft-admin',before.profile.revision,['attendance.review','students.edit','students.edit']);pendingState(saved);
  assert.equal(saved.profile.revision,before.profile.revision+1);assert.equal(auditCount(),audits+1);
  assert.deepEqual(canonical(saved.profile.draftGrants),['attendance.review','attendance.view','lessons.view','students.edit','students.view']);
  assert.deepEqual(saved.profile.grants,before.profile.grants,'draft save cannot change the stored future baseline');
  assert.deepEqual(saved.configuredGrants,before.configuredGrants);
  const audit=sqlite.prepare('SELECT * FROM audit ORDER BY rowid DESC LIMIT 1').get();assert.equal(audit.actor_id,'chief-a');assert.equal(audit.group_id,groups.a);
  assert.ok((audit.before_json+audit.after_json).includes('draftGrants'),'audit describes the pending configuration');
  assert.equal(JSON.stringify(audit).includes(password),false);assert.equal(JSON.stringify(audit).includes(passwordHash),false);
});

await section('future configured-access predicate denies absent profiles wildcards and unsupported keys',async()=>{
  const allowed=(actor,key)=>{const predicate=permissionServer.configuredAdminGrantPredicate(actor,key);return sqlite.prepare('SELECT CASE WHEN '+predicate.sql+' THEN 1 ELSE 0 END AS allowed').get(...predicate.args).allowed;};
  account('predicate-new-admin');await login('predicate-new-admin');let actor=await auth.currentBusinessAccount();assert.ok(actor);assert.equal(allowed(actor,'students.view'),0,'new future profile defaults to no grants');
  await login('admin-a');actor=await auth.currentBusinessAccount();assert.equal(allowed(actor,'students.edit'),1,'existing explicit legacy baseline is preserved');
  const original=profileRow('admin-a');
  try{
    sqlite.prepare('UPDATE admin_permission_profiles SET grants_json=? WHERE account_id=?').run('["*","students.*","futureWidget.view","finance.view"]','admin-a');
    assert.equal(allowed(actor,'students.view'),0,'wildcards cannot create implicit grants');assert.equal(allowed(actor,'futureWidget.view'),0);assert.equal(allowed(actor,'finance.view'),0);
    assert.throws(()=>sqlite.prepare('UPDATE admin_permission_profiles SET grants_json=? WHERE account_id=?').run('{"students.view":true}','admin-a'),/CHECK constraint failed/,'database rejects non-array permission JSON');
    assert.equal(allowed(actor,'students.view'),0,'invalid write cannot turn wildcard input into implicit access');
    assert.throws(()=>sqlite.prepare('UPDATE admin_permission_profiles SET grants_json=? WHERE account_id=?').run('invalid json','admin-a'),/CHECK constraint failed/,'database rejects malformed permission JSON');
    sqlite.prepare('UPDATE admin_permission_profiles SET grants_json=? WHERE account_id=?').run('["students.view","finance.view"]','admin-a');
    assert.equal(allowed(actor,'students.view'),0,'mixed unsupported stored grants invalidate the future configuration');
    sqlite.prepare('UPDATE admin_permission_profiles SET grants_json=? WHERE account_id=?').run('["students.edit"]','admin-a');
    assert.equal(allowed(actor,'students.edit'),0,'persisted write grant without its required view fails closed');
    sqlite.prepare('UPDATE admin_permission_profiles SET grants_json=? WHERE account_id=?').run('["students.view","students.edit"]','admin-a');
    assert.equal(allowed(actor,'students.edit'),1,'explicit supported write and view grants work within the existing ceiling');
  }finally{sqlite.prepare('UPDATE admin_permission_profiles SET grants_json=? WHERE account_id=?').run(original.grants_json,'admin-a');}
  for(const id of ['chief-a','owner']){
    await login(id,id==='owner'?groups.a:undefined);actor=await auth.currentBusinessAccount();assert.equal(allowed(actor,'students.view'),1);
    for(const key of ['finance.view','adminIdentity.assign','futureWidget.view','*'])assert.equal(allowed(actor,key),0,'unsupported key is denied even for '+id);
  }
  await login('teacher-a');assert.equal(allowed(await auth.currentBusinessAccount(),'students.view'),0,'future configuration never converts teachers to administrators');
});

await section('new administrator starts with empty future configuration and legacy current access',async()=>{
  await login('chief-a');await ok('action',{action:'createLocalAccount',username:'new-permissions-admin',password,name:'Fictional new administrator',role:'admin'});
  const id=sqlite.prepare('SELECT account_id FROM local_credentials WHERE username=?').get('new-permissions-admin').account_id;
  assert.equal(profileRow(id),undefined,'new administrator is never automatically seeded with legacy future grants');
  const data=await readProfile(id);pendingState(data);assert.equal(data.profile.origin,'new');assert.equal(data.profile.revision,0);assert.deepEqual(data.profile.grants,[]);assert.equal(data.profile.draftGrants,null);assert.deepEqual(data.configuredGrants,[]);
  const saved=await save(id,0,['lessons.create']);assert.equal(saved.profile.origin,'new');assert.equal(saved.profile.revision,1);assert.deepEqual(saved.profile.grants,[]);assert.deepEqual(canonical(saved.profile.draftGrants),['lessons.create','lessons.view']);pendingState(saved);
  const own=await ok('admin-permissions',undefined,'?userId='+encodeURIComponent(id));assert.equal(own.target.id,id,'supported old client target alias remains scoped');
});

await section('Owner and current chief alone manage same-group ordinary admin drafts',async()=>{
  await login('chief-a');const disabled=await readProfile('admin-disabled');assert.equal(disabled.target.disabledAt,now);
  const saved=await save('admin-disabled',disabled.profile.revision,['lessons.view']);assert.equal(saved.profile.revision,disabled.profile.revision+1);
  await login('owner',groups.a);const peer=await readProfile('admin-peer');await save('admin-peer',peer.profile.revision,[]);
  for(const id of ['admin-a','admin-peer','local:owner-impostor','teacher-a','student-a','pending-a']){
    await login(id);await unchanged('read denied '+id,()=>denied('admin-permissions',undefined,query('secret-private-target'),[401,403]));
    await unchanged('write denied '+id,()=>denied('admin-permissions',{accountId:'secret-private-target',expectedRevision:1,grants:[]},'',[401,403]));
  }
  await login('chief-a');await unchanged('chief cannot cross groups',()=>denied('admin-permissions',undefined,query('admin-b'),[403,404]));
  await unchanged('chief cannot mutate foreign profile',()=>denied('admin-permissions',{accountId:'admin-b',expectedRevision:1,grants:[]},'',[403,404]));
  await login('chief-a',groups.b);await unchanged('spoofed selected-group header',()=>denied('admin-permissions',undefined,query('admin-b'),[401,403]));
  await login('owner',groups.a);await unchanged('Owner target must belong to selected group',()=>denied('admin-permissions',undefined,query('admin-b'),[403,404]));
  await login('owner',groups.b);assert.equal((await readProfile('admin-b')).target.id,'admin-b');
});

await section('chief Owner self and non-administrator targets stay protected',async()=>{
  for(const actor of ['chief-a','owner']){
    await login(actor,actor==='owner'?groups.a:undefined);
    for(const target of ['chief-a','owner','teacher-a','student-a','pending-a']){
      await unchanged('protected read '+actor+' '+target,()=>denied('admin-permissions',undefined,query(target),[400,403,404]));
      await unchanged('protected save '+actor+' '+target,()=>denied('admin-permissions',{accountId:target,expectedRevision:1,grants:[]},'',[400,403,404]));
    }
  }
  await login('admin-a');await unchanged('ordinary admin self cannot edit permission profile',()=>denied('admin-permissions',{accountId:'admin-a',expectedRevision:1,grants:[]},'',[403]));
});

await section('required revisions stale pages and normalized no-ops cannot overwrite drafts',async()=>{
  await login('chief-a');let data=await readProfile('draft-admin');
  for(const value of [undefined,null,-1,0.5,'1',Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1]){
    const body={accountId:'draft-admin',grants:[]};if(value!==undefined)body.expectedRevision=value;
    await unchanged('invalid/missing expected revision '+String(value),()=>denied('admin-permissions',body,'',[400]));
  }
  for(const grants of [null,'students.view',{},[null],[1]])await unchanged('malformed grants',()=>denied('admin-permissions',{accountId:'draft-admin',expectedRevision:data.profile.revision,grants},'',[400]));
  await unchanged('stale page CAS',()=>denied('admin-permissions',{accountId:'draft-admin',expectedRevision:data.profile.revision-1,grants:[]},'',[409]));
  await unchanged('same normalized draft is a no-op',()=>save('draft-admin',data.profile.revision,[...data.profile.draftGrants].reverse()));
  await unchanged('missing grants is rejected',()=>denied('admin-permissions',{accountId:'draft-admin',expectedRevision:data.profile.revision},'',[400]));
  for(const extra of [{action:'activate'},{runtimeEnforcement:true},{origin:'legacy'},{status:'active'},{grants_json:'["*"]'}])await unchanged('draft API cannot accept activation or stored-profile fields',()=>denied('admin-permissions',{accountId:'draft-admin',expectedRevision:data.profile.revision,grants:[],...extra},'',[400]));
  const foreignOrigin=await call('admin-permissions',{accountId:'draft-admin',expectedRevision:data.profile.revision,grants:[]},'',{headers:{origin:'https://evil.invalid','content-type':'application/json'}});assert.equal(foreignOrigin.status,403);
  data=await save('draft-admin',data.profile.revision,[]);assert.deepEqual(data.profile.draftGrants,[]);
  await unchanged('repeated deny-all draft is a no-op',()=>save('draft-admin',data.profile.revision,[]));
});

await section('draft and success audit commit together or roll back together',async()=>{
  await login('chief-a');const before=await readProfile('audit-target'),audits=auditCount();
  beforeBatch=()=>sqlite.exec("CREATE TEMP TRIGGER permissions_injected_audit_failure BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'Fictional injected audit failure'); END");
  try{await unchanged('failed success audit rolls back draft and revision',()=>denied('admin-permissions',{accountId:'audit-target',expectedRevision:before.profile.revision,grants:[]},'',[503]));}
  finally{sqlite.exec('DROP TRIGGER IF EXISTS permissions_injected_audit_failure');}
  assert.equal(auditCount(),audits);assert.deepEqual((await readProfile('audit-target')).profile,before.profile);
  const saved=await save('audit-target',before.profile.revision,[]);assert.equal(saved.profile.revision,before.profile.revision+1);assert.equal(auditCount(),audits+1);
  account('audit-new-admin');assert.equal(profileRow('audit-new-admin'),undefined);
  beforeBatch=()=>sqlite.exec("CREATE TEMP TRIGGER permissions_injected_insert_audit_failure BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'Fictional initial profile audit failure'); END");
  try{await unchanged('initial profile insert rolls back with failed audit',()=>denied('admin-permissions',{accountId:'audit-new-admin',expectedRevision:0,grants:['students.view']},'',[503]));}
  finally{sqlite.exec('DROP TRIGGER IF EXISTS permissions_injected_insert_audit_failure');}
  assert.equal(profileRow('audit-new-admin'),undefined);assert.equal(auditCount(),audits+1);
});

await section('in-flight chief handover revokes the actor before any draft commit',async()=>{
  await login('race-chief');const current=await readProfile('race-admin'),before=JSON.stringify(profileRow('race-admin')),audits=auditCount();let committed;
  beforeBatch=()=>{sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('race-next',groups.raceActor);sqlite.prepare('DELETE FROM sessions WHERE account_id=?').run('race-chief');committed=snapshot();};
  await denied('admin-permissions',{accountId:'race-admin',expectedRevision:current.profile.revision,grants:[]},'',[403,409]);
  assert.equal(snapshot(),committed,'only the already committed handover survives');assert.equal(JSON.stringify(profileRow('race-admin')),before);assert.equal(auditCount(),audits);
  await login('race-chief');await unchanged('former chief loses configuration authority after relogin',()=>denied('admin-permissions',undefined,query('race-admin'),[403]));
});

await section('in-flight target promotion to chief blocks even an Owner draft save',async()=>{
  await login('owner',groups.raceTarget);const current=await readProfile('target-admin'),before=JSON.stringify(profileRow('target-admin')),audits=auditCount();let committed;
  beforeBatch=()=>{sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('target-admin',groups.raceTarget);committed=snapshot();};
  await denied('admin-permissions',{accountId:'target-admin',expectedRevision:current.profile.revision,grants:[]},'',[403,409]);
  assert.equal(snapshot(),committed,'chief assignment survives without permission or audit side effects');assert.equal(JSON.stringify(profileRow('target-admin')),before);assert.equal(auditCount(),audits);
});

await section('competing save after preflight fails revision CAS inside the transaction',async()=>{
  await login('revision-chief');const current=await readProfile('revision-admin'),audits=auditCount();let committed;
  beforeBatch=()=>{sqlite.prepare('UPDATE admin_permission_profiles SET revision=revision+1,draft_grants_json=?,updated_by=?,updated_at=? WHERE account_id=?').run('["students.view"]','revision-chief',now,'revision-admin');committed=snapshot();};
  await denied('admin-permissions',{accountId:'revision-admin',expectedRevision:current.profile.revision,grants:[]},'',[409]);
  assert.equal(snapshot(),committed,'winner configuration is preserved exactly');assert.equal(auditCount(),audits);
  account('first-save-race','admin',groups.raceRevision);assert.equal((await readProfile('first-save-race')).profile.revision,0);
  beforeBatch=()=>{sqlite.prepare("INSERT INTO admin_permission_profiles(group_id,account_id,revision,grants_json,draft_grants_json,origin,updated_by,updated_at) VALUES(?,?,1,'[]',?,'new',?,?)").run(groups.raceRevision,'first-save-race','["students.view"]','revision-chief',now);committed=snapshot();};
  await denied('admin-permissions',{accountId:'first-save-race',expectedRevision:0,grants:[]},'',[409]);assert.equal(snapshot(),committed,'revision zero first-save race preserves the first committed profile');assert.equal(auditCount(),audits);
});

await section('unauthenticated and ordinary users receive no permission configuration even during handover',async()=>{
  logout();for(const body of [undefined,{accountId:'secret-private-target',expectedRevision:1,grants:[]}]){
    const result=await unchanged('unauthenticated private permission request',()=>denied('admin-permissions',body,body===undefined?query('secret-private-target'):'',[401]));
    for(const field of ['profile','catalog','templates','target','configuredGrants','effectiveGrants'])assert.equal(Object.hasOwn(result.data,field),false);
  }
  for(const actor of ['teacher-a','student-a','pending-a','admin-a']){
    await login(actor);const result=await denied('admin-permissions',undefined,query('secret-private-target'),[401,403]);
    assert.equal(JSON.stringify(result.data).includes('secret-private-target'),false);
    for(const field of ['profile','catalog','templates','target','configuredGrants','effectiveGrants'])assert.equal(Object.hasOwn(result.data,field),false);
    const identity=await ok('auth'),state=await ok('state',undefined,'?scope=core');
    for(const value of [identity,state])assert.equal(/draftGrants|draft_grants_json|configuredGrants|admin_permission_profiles/.test(JSON.stringify(value)),false,'private draft stays out of shared identity and business state');
    if(actor==='admin-a'){const activity=await ok('state',undefined,'?scope=activity');assert.equal(/draftGrants|draft_grants_json|configuredGrants/.test(JSON.stringify(activity)),false,'ordinary administrators cannot read manager-only configuration through activity audits');}
  }
  await login('chief-a');const response=await call('admin-permissions',undefined,query('secret-private-target'));assert.match(response.headers.get('cache-control')||'',/no-store/);
  await login('read-chief');const profile=await readProfile('read-admin');await save('read-admin',profile.profile.revision,['students.view']);
  await ok('action',{action:'saveTeacher',name:'Fictional read-race business activity',active:true});
  const privateAudit=sqlite.prepare("SELECT id FROM audit WHERE group_id=? AND action='adminPermissions.saveDraft' ORDER BY rowid DESC LIMIT 1").get(groups.raceRead);
  const businessAudit=sqlite.prepare("SELECT id FROM audit WHERE group_id=? AND action='saveTeacher' ORDER BY rowid DESC LIMIT 1").get(groups.raceRead);
  assert.ok(privateAudit);assert.ok(businessAudit);
  assert.ok((await ok('state',undefined,'?scope=activity')).activity.some(item=>item.id===privateAudit.id),'chief can read permission audit before handover');
  let auditReadReached=false,committed;
  authorityReadsBeforeAudit=0;
  // This hook runs in the shared statement executor used by D1 .all()/raw(),
  // after the request's authority read and immediately before its audit SELECT.
  beforeAuditRead=()=>{
    assert.ok(authorityReadsBeforeAudit>0,'request already read chief authority before the handover');
    sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('read-next',groups.raceRead);
    sqlite.prepare('DELETE FROM sessions WHERE account_id=?').run('read-chief');
    committed=snapshot();auditReadReached=true;
  };
  const raced=await ok('state',undefined,'?scope=activity');assert.equal(auditReadReached,true,'handover was injected at the actual audit SELECT');
  assert.equal(snapshot(),committed,'activity read adds no mutation after the independently committed handover');
  assert.equal(raced.activity.some(item=>item.id===privateAudit.id),false,'former chief cannot read permission snapshots after the handover commits');
  assert.equal(/draftGrants|draft_grants_json|configuredGrants/.test(JSON.stringify(raced.activity)),false,'stale preflight authority cannot leak a private snapshot');
  assert.ok(raced.activity.some(item=>item.id===businessAudit.id),'ordinary business activity remains readable');
  for(const actor of ['read-next','owner']){
    await login(actor,actor==='owner'?groups.raceRead:undefined);
    const activity=(await ok('state',undefined,'?scope=activity')).activity,entry=activity.find(item=>item.id===privateAudit.id);
    assert.ok(entry,'new chief and Owner retain permission-audit access: '+actor);
    assert.deepEqual(JSON.parse(entry.after).profile.draftGrants,['students.view'],'authorized reader receives the stored permission snapshot');
  }
});

await section('deny-all draft does not enforce runtime restrictions or grant financial and teacher powers',async()=>{
  await login('chief-a');let data=await readProfile('admin-a');data=await save('admin-a',data.profile.revision,[]);pendingState(data);assert.deepEqual(data.profile.draftGrants,[]);
  await login('admin-a');const identity=await ok('auth');assert.equal(identity.account.role,'admin');assert.equal(identity.account.canManageAdministrators,false);
  for(const scope of ['core','learning','classrooms','accounts','activity']){const state=await ok('state',undefined,'?scope='+scope);assert.ok(state.loadedScopes.includes(scope),'existing '+scope+' access remains available');}
  await ok('action',{action:'saveTeacher',name:'Business write after deny-all draft',active:true});
  assert.ok(sqlite.prepare('SELECT name FROM teachers WHERE group_id=? AND name=?').get(groups.a,'Business write after deny-all draft'));
  await ok('classrooms',{action:'saveTerm',name:'Fictional term after deny-all draft',isCurrent:false});
  assert.ok(sqlite.prepare('SELECT id FROM academic_terms WHERE group_id=? AND name=?').get(groups.a,'Fictional term after deny-all draft'));
  await ok('action',{action:'resetLocalPassword',userId:'teacher-a',password:'Fictional-reset-after-draft-456'});
  await unchanged('ordinary admin still cannot create an administrator',()=>denied('action',{action:'createLocalAccount',username:'forbidden-after-draft',password,name:'Forbidden administrator',role:'admin'},'',[403]));
  await unchanged('admin still cannot publish teacher-owned material',()=>denied('learning',{action:'saveMaterial'},'',[403]));
  await unchanged('admin still cannot publish teacher-owned homework',()=>denied('learning',{action:'saveHomework'},'',[403]));
  for(const actor of ['admin-a','chief-a']){
    await login(actor);assert.equal((await call('billing',undefined,'?month=2032-01')).status,403);
    await unchanged('financial write remains Owner-only '+actor,()=>denied('billing',{action:'saveRate'},'',[403]));
    await unchanged('global course menus remain Owner-only '+actor,()=>denied('academic-catalogues',{scope:'student',expectedRevision:1,syllabuses:[]},'',[403]));
  }
  assert.equal(sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
}finally{
  globalThis.fetch=originalFetch;hooks.deregister();delete globalThis.__adminPermissions;
  const summary={suite:'admin-permissions',round:1,rollout:'preparation',runtimeEnforcement:false,startedAt,finishedAt:new Date().toISOString(),database:'isolated SQLite with D1 transaction adapter',actualAuthentication:true,productionWrites:false,networkRequests:0,sections:results.length,passed:results.filter(result=>result.status==='passed').length,failed:results.filter(result=>result.status==='failed').length,results};
  record(JSON.stringify({...summary,results:undefined}));
  writeFileSync(new URL('test-results.json',resultDirectory),JSON.stringify(summary,null,2)+'\n');
  writeFileSync(new URL('test-results.log',resultDirectory),log.join('\n')+'\n');
  sqlite.close();if(summary.failed)process.exitCode=1;
}
