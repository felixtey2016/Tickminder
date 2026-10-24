import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {drizzle} from 'drizzle-orm/d1';
import ts from 'typescript';

// Real routes, validators, grants, authority checks and all migrations. Only
// authentication and the hosted runtime are replaced; every record is fictional.
const sqlite=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
sqlite.exec('PRAGMA foreign_keys=ON');
let beforeBatch=null,failAt=-1,actor;
function statement(sql,values=[]){
 const execute=arrays=>{const prepared=sqlite.prepare(sql);if(arrays)prepared.setReturnArrays(true);return prepared.columns().length?{results:prepared.all(...values),meta:{changes:0}}:{results:[],meta:prepared.run(...values)};};
 return {sql,bind:(...next)=>statement(sql,next),first:async()=>execute(false).results[0]||null,all:async()=>execute(false),raw:async()=>execute(true).results,run:async()=>execute(false),execute:()=>execute(false)};
}
const d1={prepare:statement,async batch(items){const hook=beforeBatch,fail=failAt;beforeBatch=null;failAt=-1;hook?.();sqlite.exec('BEGIN');try{const results=items.map((item,index)=>{if(index===fail)throw Error('fictional injected failure');return item.execute();});sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
const runtime={env:{DB:d1,ADMIN_PERMISSIONS_MODE:'enforced'},currentBusinessAccount:async()=>actor,currentAccount:async()=>actor,NextResponse:{json:(value,options)=>Response.json(value,options)},getDb:()=>drizzle(d1)};
globalThis.__accountProvisioning=runtime;
const stub='data:text/javascript;base64,'+Buffer.from('export const {env,currentBusinessAccount,currentAccount,NextResponse,getDb}=globalThis.__accountProvisioning;').toString('base64'),root=new URL('../',import.meta.url).href;
registerHooks({resolve(specifier,context,next){
 if(['cloudflare:workers','next/server','@/db','@/lib/auth'].includes(specifier)||specifier==='./auth'&&context.parentURL?.startsWith(root))return {url:stub,shortCircuit:true};
 if(specifier.startsWith('@/'))return {url:new URL(specifier.slice(2)+'.ts',root).href,shortCircuit:true};
 if(specifier.startsWith('.')&&context.parentURL?.startsWith(root)&&context.parentURL.endsWith('.ts'))return {url:new URL(/\.[cm]?[jt]sx?$/.test(specifier)?specifier:specifier+'.ts',context.parentURL).href,shortCircuit:true};
 return next(specifier,context);
},load(url,context,next){if(url.startsWith(root)&&url.endsWith('.ts'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};return next(url,context);}});
const action=await import('../app/api/action/route.ts'),permissions=await import('../lib/admin-permissions.ts'),names=await import('../lib/student-names.ts');
const now=new Date().toISOString(),group='next-genn-edu',otherGroup='provisioning-foreign';
sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(otherGroup,'Fictional Other School','provisioning-foreign',now,now);
function account(id,role='admin',groupId=group,options={}){sqlite.prepare('INSERT INTO accounts(group_id,id,email,name,role,teacher_name,student_name,created_at,activated_at,disabled_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(groupId,id,options.email||'',options.name||id,role,options.teacherName||null,options.studentName||null,now,role==='pending'?null:now,options.disabled?now:null);return {id,groupId,email:options.email||'',name:options.name||id,role,teacherName:options.teacherName||null,studentName:options.studentName||null};}
const chief=account('provision-chief'),manager=account('provision-manager'),teacher=account('provision-teacher','teacher');
sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run(chief.id,group);
function grant(keys){sqlite.prepare("INSERT INTO admin_permission_profiles(group_id,account_id,grants_json,origin,updated_at) VALUES(?,?,?,'new',?) ON CONFLICT(group_id,account_id) DO UPDATE SET grants_json=excluded.grants_json").run(group,manager.id,JSON.stringify(permissions.normalizeAdminGrants(keys)),now);}
function student(name,active=1,groupId=group){sqlite.prepare("INSERT INTO students(group_id,name,name_key,active,syllabus_id,grade,age,created_at) VALUES(?,?,?,?,'igcse','Year 7',12,?)").run(groupId,name,names.studentNameKey(name),active,now);}
function seedTeacher(name,active=1,groupId=group){sqlite.prepare('INSERT INTO teachers(group_id,name,active,created_at) VALUES(?,?,?,?)').run(groupId,name,active,now);}
const local=(name,role='student',extra={})=>({action:'createLocalAccount',username:'u-'+crypto.randomUUID(),password:'Fictional-password-123',role,identityMode:'new',name,syllabusId:'igcse',grade:'Year 7',age:12,...extra});
let checks=0;
async function call(body,status=200){const response=await action.POST(new Request('https://fictional.invalid/api/action',{method:'POST',headers:{origin:'https://fictional.invalid','content-type':'application/json'},body:JSON.stringify(body)}));const data=await response.json();assert.equal(response.status,status,JSON.stringify({body:{...body,password:undefined},status:response.status,data}));checks++;return data;}
const count=(table,where='',...args)=>sqlite.prepare('SELECT count(*) AS n FROM '+table+(where?' WHERE '+where:'')).get(...args).n;
const auditCount=()=>count('audit');
function absent(name){assert.equal(count('students','name=?',name)+count('teachers','name=?',name)+count('accounts','name=?',name),0);checks++;}
actor=chief;
const created=local('New Student');await call(created);
const createdAccount=sqlite.prepare('SELECT * FROM accounts WHERE student_name=?').get('New Student');
assert.equal(createdAccount.name,'New Student');assert.ok(createdAccount.activated_at);assert.ok(createdAccount.name_confirmed_at);assert.equal(createdAccount.role,'student');checks+=4;
assert.deepEqual({...sqlite.prepare('SELECT syllabus_id,grade,age FROM students WHERE name=?').get('New Student')},{syllabus_id:'igcse',grade:'Year 7',age:12});checks++;
assert.equal(sqlite.prepare('SELECT must_change_password FROM local_credentials WHERE account_id=?').get(createdAccount.id).must_change_password,1);checks++;
assert.equal(count('plans','student=?','New Student'),0);assert.equal(count('classrooms'),0);checks+=2;
await call(local('New Teacher','teacher'));assert.equal(count('teachers','name=? AND active=1','New Teacher'),1);checks++;
await call(local('New Admin','admin'));assert.equal(count('students','name=?','New Admin')+count('teachers','name=?','New Admin'),0);checks++;
await call(local('New Parent','parent'));assert.equal(count('accounts',"name=? AND role='parent'",'New Parent'),1);checks++;
for(const [name,extra]of [['No Syllabus',{syllabusId:''}],['Wrong Grade',{grade:'Form 3'}],['Invalid Age',{age:true}],['Too Old',{age:101}],['Bad|Name',{}]]){await call(local(name,'student',extra),400);absent(name);}
await call(local(' new   student '),409);assert.equal(count('students','name_key=?',names.studentNameKey('New Student')),1);checks++;
await call(local('new teacher','teacher'),409);assert.equal(count('teachers'),1);checks++;
student('Disabled Student',0);seedTeacher('Disabled Teacher',0);
await call(local('Disabled Student'),409);await call(local('Disabled Teacher','teacher'),409);
await call(local('Disabled Link','student',{identityMode:'existing',studentName:'Disabled Student'}),400);
await call(local('Disabled Teacher Link','teacher',{identityMode:'existing',teacherName:'Disabled Teacher'}),400);
student('Existing Student');const originalProfile=sqlite.prepare('SELECT * FROM students WHERE name=?').get('Existing Student');
await call(local('Student Login','student',{identityMode:'existing',studentName:'Existing Student',syllabusId:'spm',grade:'Form 5',age:18}));
assert.deepEqual(sqlite.prepare('SELECT * FROM students WHERE name=?').get('Existing Student'),originalProfile);checks++;
await call(local('Duplicate Login','student',{identityMode:'existing',studentName:'Existing Student'}),409);absent('Duplicate Login');
student('Legacy Student');await call(local('Legacy Login','student',{identityMode:undefined,studentName:'Legacy Student'}));
student('Disabled Account Student');account('disabled-account','student',group,{studentName:'Disabled Account Student',disabled:true});
await call(local('Cannot Take Over','student',{identityMode:'existing',studentName:'Disabled Account Student'}),409);
student('Foreign Student',1,otherGroup);await call(local('Foreign Link','student',{identityMode:'existing',studentName:'Foreign Student'}),400);
await call(local('Foreign Student'));assert.equal(count('students','name=?','Foreign Student'),2);checks++;

// Google-first approval creates the profile and activates the same proved account.
account('google-pending','pending',group,{email:'pending@fictional.invalid',name:'Old Google Name'});
sqlite.prepare('INSERT INTO google_identities(subject,account_id,email,linked_at) VALUES(?,?,?,?)').run('fictional-google-subject','google-pending','pending@fictional.invalid',now);
await call({action:'bind',userId:'google-pending',identityMode:'new',role:'student',name:'Google Student',syllabusId:'igcse',grade:'Year 8',age:''});
const bound=sqlite.prepare('SELECT * FROM accounts WHERE id=?').get('google-pending');assert.equal(bound.name,'Google Student');assert.equal(bound.student_name,'Google Student');assert.equal(bound.role,'student');assert.ok(bound.name_confirmed_at);assert.ok(bound.activated_at);assert.equal(count('google_identities','account_id=?','google-pending'),1);checks+=6;
account('google-teacher','pending');await call({action:'bind',userId:'google-teacher',identityMode:'new',role:'teacher',name:'Google Teacher'});assert.equal(count('teachers','name=?','Google Teacher'),1);checks++;
account('legacy-pending','pending',group,{name:'Preserved Display'});student('Legacy Binding');await call({action:'bind',userId:'legacy-pending',role:'student',studentName:'Legacy Binding'});assert.equal(sqlite.prepare('SELECT name FROM accounts WHERE id=?').get('legacy-pending').name,'Preserved Display');checks++;
account('existing-google-pending','pending');student('Existing Google Student');const existingGoogleProfile=sqlite.prepare('SELECT * FROM students WHERE name=?').get('Existing Google Student');
await call({action:'bind',userId:'existing-google-pending',identityMode:'existing',role:'student',name:'Google Display Name',studentName:'Existing Google Student',syllabusId:'spm',grade:'Form 5',age:18});assert.deepEqual(sqlite.prepare('SELECT * FROM students WHERE name=?').get('Existing Google Student'),existingGoogleProfile);assert.equal(sqlite.prepare('SELECT name FROM accounts WHERE id=?').get('existing-google-pending').name,'Google Display Name');checks+=2;
account('foreign-pending','pending',otherGroup);await call({action:'bind',userId:'foreign-pending',identityMode:'new',role:'teacher',name:'Foreign Takeover'},400);absent('Foreign Takeover');
actor=teacher;await call(local('Teacher Self Provision'),403);absent('Teacher Self Provision');

// Ordinary administrators require both action and personnel grants.
actor=manager;grant(['accounts.create']);await call(local('Missing Student Grant'),403);absent('Missing Student Grant');
await call(local('Missing Teacher Grant','teacher'),403);absent('Missing Teacher Grant');
student('Grant Existing');await call(local('Link Without Create','student',{identityMode:'existing',studentName:'Grant Existing'}));
grant(['accounts.create','students.create','teachers.create']);await call(local('Granted Student'));await call(local('Granted Teacher','teacher'));
await call(local('Unauthorized Admin','admin'),403);absent('Unauthorized Admin');
account('admin-pending','pending');grant(['accounts.assign']);await call({action:'bind',userId:'admin-pending',role:'admin',name:'Unauthorized Admin Binding'},403);assert.equal(sqlite.prepare('SELECT role FROM accounts WHERE id=?').get('admin-pending').role,'pending');checks++;
account('manager-pending','pending');grant(['accounts.assign']);await call({action:'bind',userId:'manager-pending',identityMode:'new',role:'teacher',name:'Missing Bind Grant'},403);absent('Missing Bind Grant');
grant(['accounts.assign','teachers.create']);await call({action:'bind',userId:'manager-pending',identityMode:'new',role:'teacher',name:'Granted Bind Teacher'});
grant(['accounts.create','students.create']);let audits=auditCount();beforeBatch=()=>grant(['accounts.create']);await call(local('Revoked Student Grant'),403);absent('Revoked Student Grant');assert.equal(auditCount(),audits);checks++;

actor=chief;
student('Race Existing');audits=auditCount();beforeBatch=()=>sqlite.prepare('UPDATE students SET active=0 WHERE name=?').run('Race Existing');await call(local('Race Existing Login','student',{identityMode:'existing',studentName:'Race Existing'}),409);absent('Race Existing Login');assert.equal(auditCount(),audits);checks++;
beforeBatch=()=>student('Concurrent Student');await call(local('Concurrent Student'),409);assert.equal(count('accounts','name=?','Concurrent Student'),0);assert.equal(count('students','name=?','Concurrent Student'),1);checks+=2;
beforeBatch=()=>seedTeacher('Concurrent Teacher');await call(local('Concurrent Teacher','teacher'),409);assert.equal(count('accounts','name=?','Concurrent Teacher'),0);checks++;
audits=auditCount();beforeBatch=()=>sqlite.prepare("UPDATE academic_catalogues SET revision=revision+1 WHERE scope='student'").run();await call(local('Changed Catalogue'),409);absent('Changed Catalogue');assert.equal(auditCount(),audits);checks++;
const duplicateUsername=local('Username Race');beforeBatch=()=>sqlite.prepare('INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES(?,?,?,0,?)').run(chief.id,duplicateUsername.username,'fictional',now);await call(duplicateUsername,409);absent('Username Race');
audits=auditCount();failAt=5;await call(local('Atomic Failure'),503);absent('Atomic Failure');assert.equal(auditCount(),audits);checks++;
account('race-pending','pending');beforeBatch=()=>sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,'race-pending');await call({action:'bind',userId:'race-pending',identityMode:'new',role:'teacher',name:'Disabled During Bind'},409);absent('Disabled During Bind');
account('name-race-pending','pending');beforeBatch=()=>sqlite.prepare('UPDATE accounts SET name=? WHERE id=?').run('Concurrent Display Name','name-race-pending');await call({action:'bind',userId:'name-race-pending',identityMode:'new',role:'teacher',name:'Stale Bind Name'},409);absent('Stale Bind Name');
actor=null;await call(local('Anonymous Provision'),401);absent('Anonymous Provision');
await import('../lib/account-provisioning-i18n.ts');const i18n=await import('../lib/i18n.ts');
for(const source of ['lib/account-provisioning.ts','app/api/action/route.ts']){
 const text=readFileSync(new URL('../'+source,import.meta.url),'utf8');
 for(const [,message]of text.matchAll(/(?:AccountProvisioningError|return bad)\('([^']+)'/g))if(/[\u4e00-\u9fff]/.test(message)&&!message.includes('admin.')){if(source.endsWith('route.ts')&&!['人员或账号资料已改变，请刷新后重试','姓名或账号已存在，请刷新后选择现有人员或账号','请输入不超过 80 个字符的姓名'].includes(message))continue;assert.notEqual(i18n.translate(message,'en'),message,message);checks++;}
}
console.log(JSON.stringify({suite:'account-provisioning',checks,status:'passed',productionDataWrites:0}));
