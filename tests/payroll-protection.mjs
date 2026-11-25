import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {getTableConfig} from 'drizzle-orm/sqlite-core';
import {createFixtureLoader} from './fixture-loader.mjs';

// Exercise the production permanent-delete route with fictional data only.
// Authentication, file storage and the D1 transport are the external boundaries.
globalThis.fetch=async()=>{throw Error('Network forbidden in payroll protection fixture');};
const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
for(const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
let actor=null,beforeBatch=null,checks=0;
function statement(sql,values=[]){const execute=()=>{assert(values.length<=100,'D1 binding limit');const s=sqlite.prepare(sql);return s.columns().length?{results:s.all(...values),meta:{changes:0}}:{results:[],meta:s.run(...values)};};return{bind:(...v)=>statement(sql,v),all:async()=>execute(),first:async()=>execute().results[0]||null,run:async()=>execute(),execute};}
const db={prepare:statement,batch:async statements=>{beforeBatch?.();beforeBatch=null;sqlite.exec('BEGIN');try{const results=statements.map(s=>s.execute());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const gid='delete-school',foreign='delete-foreign',now=new Date().toISOString(),owner={id:'delete-owner',role:'admin',email:'owner@delete.example.test',name:'Fictional owner',groupId:gid};
globalThis.__payrollProtectionRuntime={
 learningDb:()=>db,currentBusinessAccount:async()=>actor,
 first:async(sql,...values)=>sqlite.prepare(sql).get(...values)||null,
 rows:async(sql,...values)=>sqlite.prepare(sql).all(...values),
 OWNER_EMAIL:owner.email,isOwnerAccount:a=>a?.role==='admin'&&a.email===owner.email&&!a.id.startsWith('local:'),
 classroomMayManage:async(a,id)=>Boolean(sqlite.prepare('SELECT 1 FROM classrooms WHERE group_id=? AND id=? AND (?=\'admin\' OR teacher_name=?)').get(a.groupId,id,a.role,a.teacherName||'')),
 deleteUnreferencedFile:async()=>{throw Error('Unexpected file deletion in payroll fixture');},
 env:{DB:db,ADMIN_PERMISSIONS_MODE:'enforced'},
};
const dataUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64'),runtimeUrl=dataUrl('export const {learningDb,currentBusinessAccount,first,rows,OWNER_EMAIL,isOwnerAccount,classroomMayManage,deleteUnreferencedFile,env}=globalThis.__payrollProtectionRuntime;'),nextUrl=dataUrl('export const NextResponse={json:(value,options)=>Response.json(value,options)};');
const load=createFixtureLoader({runtimeUrl,environmentUrl:runtimeUrl,runtimeFiles:['lib/auth.ts','lib/owner.ts','lib/learning-server.ts','lib/classrooms-server.ts','lib/pdf-storage.ts'],transform:(_file,code)=>code.replaceAll("'next/server'",JSON.stringify(nextUrl)).replaceAll('"next/server"',JSON.stringify(nextUrl))});
const manage=(await load('app/api/manage/route.ts')).module,payroll=(await load('lib/payroll-server.ts')).module,schema=(await load('db/schema.ts')).module;
for(const groupId of[gid,foreign])sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(groupId,groupId,groupId,now,now);
sqlite.prepare('INSERT INTO accounts(id,email,name,role,group_id,created_at) VALUES(?,?,?,?,?,?)').run(owner.id,owner.email,owner.name,owner.role,gid,now);
const check=fn=>{fn();checks++;};
async function post(body,as=owner){actor=as;const r=await manage.POST(new Request('https://delete.example.test/api/manage',{method:'POST',headers:{origin:'https://delete.example.test','content-type':'application/json'},body:JSON.stringify(body)}));return{status:r.status,data:await r.json()};}
function expect(result,status,label){check(()=>assert.equal(result.status,status,label+': '+JSON.stringify(result.data)));return result.data;}
function teacher(name,groupId=gid){sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(groupId,name,now);}
function classroom(id,name,groupId=gid){sqlite.prepare('INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,groupId,'Fictional '+id,'Mathematics',name,owner.id,now,now);}
async function rate(name,{classroomId,groupId=gid}){return payroll.savePayroll({...owner,groupId},{action:'saveRate',teacherId:await payroll.payrollTeacherId(groupId,name),classroomId,revision:0,amountCents:3000,effectiveFrom:'2020-01-01',operationId:crypto.randomUUID()});}
teacher('Rate History');teacher('Salary History');teacher('Read Only');teacher('Shared Name');teacher('Shared Name',foreign);teacher('Free Teacher');teacher('Race Teacher');teacher('Foreign Only',foreign);
classroom('rate-class','Rate History');classroom('empty-class','Rate History');classroom('foreign-class','Foreign Only',foreign);classroom('foreign-shared-class','Shared Name',foreign);classroom('race-class','Rate History');
await rate('Rate History',{classroomId:'rate-class'});await rate('Shared Name',{classroomId:'foreign-shared-class',groupId:foreign});
sqlite.prepare("INSERT INTO class_sessions(id,group_id,session_type,teacher_name,subject,planned_start,planned_end,status,teaching_status,actual_start,actual_end,attendance_reviewed_at,created_by,created_at,updated_at) VALUES('salary-session',?,'one_to_one','Salary History','Mathematics','2025-01-03T02:00:00Z','2025-01-03T03:00:00Z','completed','taught','2025-01-03T02:00:00Z','2025-01-03T03:00:00Z',?,?,?,?)").run(gid,now,owner.id,now,now);
const generated=await payroll.savePayroll(owner,{action:'generate',teacherId:await payroll.payrollTeacherId(gid,'Salary History'),month:'2025-01',operationId:crypto.randomUUID()});
const payBefore=sqlite.prepare('SELECT document_json FROM payroll_runs WHERE id=?').get(generated.payrollId).document_json;
const snapshot=()=>JSON.stringify(['teachers','classrooms','payroll_teachers','payroll_rate_scopes','payroll_rate_versions','payroll_runs','payroll_operations'].map(table=>[table,sqlite.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()]));
for(const [kind,id,message]of[['teacher','Rate History',/时薪设置或薪资历史/],['teacher','Salary History',/时薪设置或薪资历史/],['classroom','rate-class',/老师时薪设置/]]){
 const before=snapshot(),preview=expect(await post({action:'previewDelete',kind,id}),200,'financial history preview');
 check(()=>assert.equal(preview.items.length,0));check(()=>assert.equal(preview.blocked.length,1));check(()=>assert.match(preview.blocked[0].error,message));
 const deleted=expect(await post({action:'permanentDelete',kind,id,confirm:true}),409,'financial history cannot be permanently deleted');check(()=>assert.match(deleted.error,message));check(()=>assert.equal(snapshot(),before,'blocked preview and delete leave all history unchanged'));
}
// The roster's read-only configuration views must never create delete blockers.
await payroll.payrollRates(owner,await payroll.payrollTeacherId(gid,'Read Only'));
check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM payroll_teachers WHERE group_id=? AND teacher_name=?').get(gid,'Read Only').n,0));
expect(await post({action:'permanentDelete',kind:'teacher',id:'Read Only',confirm:true}),200,'teacher without financial history can delete');
expect(await post({action:'permanentDelete',kind:'teacher',id:'Shared Name',confirm:true}),200,'same label in foreign payroll does not block own teacher');check(()=>assert(sqlite.prepare('SELECT 1 FROM teachers WHERE group_id=? AND name=?').get(foreign,'Shared Name'),'foreign teacher remains'));
expect(await post({action:'permanentDelete',kind:'teacher',id:'Foreign Only',confirm:true}),404,'foreign-only teacher cannot delete');expect(await post({action:'permanentDelete',kind:'classroom',id:'foreign-class',confirm:true}),404,'foreign classroom cannot delete');
expect(await post({action:'permanentDelete',kind:'classroom',id:'empty-class',confirm:true}),200,'teacher rate on another classroom does not lock unrelated empty classroom');check(()=>assert(!sqlite.prepare('SELECT 1 FROM classrooms WHERE id=?').get('empty-class')));
// A mixed batch cannot delete the free entry before discovering a protected one.
const entries=[{kind:'teacher',id:'Free Teacher'},{kind:'teacher',id:'Salary History'}],batchPreview=expect(await post({action:'previewDelete',entries}),200,'mixed teacher preview');check(()=>assert.equal(batchPreview.items.length,1));check(()=>assert.equal(batchPreview.blocked.length,1));expect(await post({action:'permanentDelete',entries,confirm:true,previewAt:batchPreview.previewAt,fingerprint:batchPreview.fingerprint}),409,'protected teacher blocks whole delete batch');check(()=>assert(sqlite.prepare('SELECT 1 FROM teachers WHERE group_id=? AND name=?').get(gid,'Free Teacher')));
// A financial identity inserted exactly at the write boundary is protected by
// the additive FK as well as the route's earlier user-facing history check.
beforeBatch=()=>sqlite.prepare('INSERT INTO payroll_teachers(id,group_id,teacher_name,created_at) VALUES(?,?,?,?)').run('race-teacher-financial',gid,'Race Teacher',now);
const race=await post({action:'permanentDelete',kind:'teacher',id:'Race Teacher',confirm:true});check(()=>assert.notEqual(race.status,200));check(()=>assert(sqlite.prepare('SELECT 1 FROM teachers WHERE group_id=? AND name=?').get(gid,'Race Teacher')));check(()=>assert(sqlite.prepare('SELECT 1 FROM payroll_teachers WHERE id=?').get('race-teacher-financial')));
beforeBatch=()=>sqlite.prepare('INSERT INTO payroll_rate_scopes(id,group_id,teacher_id,classroom_id,scope_key,revision,updated_at) VALUES(?,?,?,?,?,0,?)').run('race-class-scope',gid,sqlite.prepare('SELECT id FROM payroll_teachers WHERE group_id=? AND teacher_name=?').get(gid,'Rate History').id,'race-class','race-class',now);
const classRace=await post({action:'permanentDelete',kind:'classroom',id:'race-class',confirm:true});check(()=>assert.notEqual(classRace.status,200));check(()=>assert(sqlite.prepare('SELECT 1 FROM classrooms WHERE id=?').get('race-class')));check(()=>assert(sqlite.prepare('SELECT 1 FROM payroll_rate_scopes WHERE id=?').get('race-class-scope')));
check(()=>assert.equal(sqlite.prepare('SELECT document_json FROM payroll_runs WHERE id=?').get(generated.payrollId).document_json,payBefore,'salary draft is retained byte-for-byte'));

// Audit each new ORM table against the real cumulative migrations. Test actual
// metadata, not a source regex, so misspelled, missing and extra columns fail.
for(const exportName of['payrollTeachers','payrollRateScopes','payrollRateVersions','payrollRuns','payrollOperations','payrollEvents','financeExpenseOperations','financeExpenses','financeExpenseEvents']){
 const config=getTableConfig(schema[exportName]),actual=sqlite.prepare('PRAGMA table_info('+config.name+')').all(),declared=config.columns;
 check(()=>assert.deepEqual(declared.map(c=>c.name).sort(),actual.map(c=>c.name).sort(),config.name+' exact columns'));
 for(const column of declared){const sql=actual.find(c=>c.name===column.name);check(()=>assert.equal(column.getSQLType().toUpperCase(),sql.type.toUpperCase(),config.name+'.'+column.name+' SQL type'));if(!sql.pk)check(()=>assert.equal(column.notNull,Boolean(sql.notnull),config.name+'.'+column.name+' nullability'));if(column.default!==undefined)check(()=>assert.equal(String(column.default),String(sql.dflt_value).replace(/^'(.*)'$/,'$1'),config.name+'.'+column.name+' default'));}
}
check(()=>assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]));check(()=>assert.equal(sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok'));
console.log(JSON.stringify({suite:'payroll-protection',checks,raceStatuses:[race.status,classRace.status],productionWrites:false}));
