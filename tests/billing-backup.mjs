import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {checkRestoredBillingStructure,checkRestoredFolderStructure,expectedSnapshotTables,historicalInsertTriggers,orderedSnapshotTables,snapshotVersion} from '../scripts/backup-order.mjs';

// All records are fictional, in-memory only. Exercise actual export and secure
// restore code without contacting production or writing decrypted backups.
globalThis.fetch=async()=>{throw Error('Network is forbidden in billing backup tests');};
const root=fileURLToPath(new URL('../',import.meta.url));
const migrations=fs.readdirSync(path.join(root,'drizzle')).filter(file=>file.endsWith('.sql')).sort();
const now='2032-06-01T00:00:00.000Z',date='2032-06-01',group='next-genn-edu',other='billing-backup-other';
function database(max=31){const db=new DatabaseSync(':memory:');for(const file of migrations.filter(file=>Number(file.slice(0,4))<=max))db.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));return db;}
function fixture(db){
 db.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(other,'Fictional Other','billing-backup-other',now,now);
 for(const groupId of [group,other]){
  db.prepare('INSERT INTO students(group_id,name,name_key,created_at,syllabus_id,grade) VALUES(?,?,?,?,?,?)').run(groupId,'Fictional Learner','fictional learner',now,'spm','Form 3');
  db.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(groupId,'Fictional Teacher',now);
  db.prepare('INSERT INTO plans(group_id,key,student,subject,teacher_name,duration,created_at) VALUES(?,?,?,?,?,?,?)').run(groupId,'fictional-plan','Fictional Learner','Mathematics','Fictional Teacher',1.5,now);
 }
}
function fees(db){
 for(const [index,groupId]of [group,other].entries()){
  const student=db.prepare('SELECT * FROM billing_students WHERE group_id=?').get(groupId),subject=db.prepare('SELECT * FROM billing_subjects WHERE group_id=?').get(groupId);
  const policy='fixture-policy-'+index,rate='fixture-rate-'+index;
  db.prepare('INSERT INTO billing_policies(group_id,revision,current_version_id,updated_at) VALUES(?,1,?,?)').run(groupId,policy,now);
  db.prepare('INSERT INTO billing_policy_versions(id,group_id,revision,currency,hour_rounding,attendance_basis,monthly_partial,effective_from,actor_id,created_at) VALUES(?,?,1,?,?,?,?,?,?,?)').run(policy,groupId,'MYR','minute','personal','manual',date,'historical-owner-id',now);
  db.prepare('INSERT INTO billing_rates(id,group_id,student_id,subject_key,revision,current_version_id,updated_at) VALUES(?,?,?,?,1,?,?)').run(rate,groupId,student.id,subject.subject_key,rate+'-version',now);
  db.prepare('INSERT INTO billing_rate_versions(id,group_id,rate_id,revision,mode,amount_cents,currency,effective_from,subject_snapshot,actor_id,created_at) VALUES(?,?,?,1,?,?,?,?,?,?,?)').run(rate+'-version',groupId,rate,'hour',index?9900:3500,'MYR',date,'Mathematics','historical-owner-id',now);
  db.prepare('INSERT INTO billing_operations(group_id,operation_id,actor_id,action,request_hash,result_json,created_at) VALUES(?,?,?,?,?,?,?)').run(groupId,'fixture-rate-operation','historical-owner-id','saveRate','a'.repeat(64),JSON.stringify({rateId:rate}),now);
  db.prepare('INSERT INTO billing_adjustments(id,group_id,student_id,month,line_id,revision,amount_cents,basis_hash,reason,actor_id,created_at) VALUES(?,?,?,?,?,1,?,?,?,?,?)').run('fixture-adjustment-'+index,groupId,student.id,'2032-06','month:'+student.id+':'+subject.subject_key,index?0:4200,'b'.repeat(64),'Fictional agreed monthly fee','historical-owner-id',now);
  if(!index){
   db.prepare('INSERT INTO billing_rate_versions(id,group_id,rate_id,revision,mode,amount_cents,currency,effective_from,subject_snapshot,actor_id,created_at) VALUES(?,?,?,2,?,?,?,?,?,?,?)').run(rate+'-version-2',groupId,rate,'lesson',4500,'MYR','2032-07-01','Mathematics','historical-owner-id',now);
   db.prepare('UPDATE billing_rates SET revision=2,current_version_id=? WHERE id=?').run(rate+'-version-2',rate);
   db.prepare('INSERT INTO billing_adjustments(id,group_id,student_id,month,line_id,revision,amount_cents,basis_hash,reason,actor_id,created_at) VALUES(?,?,?,?,?,2,NULL,?,?,?,?)').run('fixture-adjustment-clear',groupId,student.id,'2032-06','month:'+student.id+':'+subject.subject_key,'c'.repeat(64),'Fictional clear; keep previous adjustment history','historical-owner-id',now);
  }
 }
}
const exportTables=(db,version)=>Object.fromEntries(expectedSnapshotTables(version).map(name=>[name,{columns:db.prepare(`PRAGMA table_info("${name}")`).all().map(row=>row.name),rows:db.prepare(`SELECT * FROM "${name}"`).all()}]));
function replay(snapshot,max=31){
 const db=database(max),hasBilling=Boolean(snapshot.tables.billing_students);
 const dropped=historicalInsertTriggers.filter(name=>hasBilling||!name.startsWith('billing_')).map(name=>db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name=?").get(name)).filter(Boolean);
 db.exec('DELETE FROM academic_catalogues;DELETE FROM tuition_groups;BEGIN;');
 try{
  for(const trigger of dropped)db.exec(`DROP TRIGGER "${trigger.name}"`);
  for(const [name,table]of orderedSnapshotTables(snapshot.tables)){
   const insert=db.prepare(`INSERT INTO "${name}"(${table.columns.map(column=>'"'+column+'"').join(',')}) VALUES(${table.columns.map(()=>'?').join(',')})`);
   for(const row of table.rows)insert.run(...table.columns.map(column=>row[column]));
  }
  for(const trigger of dropped)db.exec(trigger.sql);
  checkRestoredFolderStructure(db);db.exec('COMMIT');return db;
 }catch(error){db.exec('ROLLBACK');db.close();throw error;}
}
let checks=0;const check=fn=>{fn();checks++;};
let secureSource=fs.readFileSync(path.join(root,'scripts/secure-d1-backup.mjs'),'utf8').split('\ntry {\n')[0];
secureSource=secureSource.replace("const projectRoot = resolve(import.meta.dirname, '..').toLowerCase();",'const projectRoot = '+JSON.stringify(path.resolve(root).toLowerCase())+';').replace("'./backup-order.mjs'",JSON.stringify(new URL('../scripts/backup-order.mjs',import.meta.url).href));
const {restoreInMemory}=await import('data:text/javascript;base64,'+Buffer.from(secureSource+'\nexport {restoreInMemory};').toString('base64'));
const old=database(30);fixture(old);const legacy={format:'timelyo-d1-v19',tables:exportTables(old,19)};
check(()=>assert.equal(restoreInMemory(legacy).students,2,'secure v19 snapshots still use the old schema exactly'));
const upgraded=replay(legacy);
check(()=>assert.equal(upgraded.prepare('SELECT count(*) count FROM billing_students').get().count,2,'old snapshots generate financial identity mappings when restored into current schema'));
check(()=>assert.equal(upgraded.prepare('SELECT count(*) count FROM billing_subjects').get().count,2));
check(()=>assert.equal(upgraded.prepare('SELECT count(*) count FROM billing_rate_versions').get().count,0,'old snapshots invent no prices'));
check(()=>assert.equal(upgraded.prepare('SELECT count(*) count FROM billing_policy_versions').get().count,0,'old snapshots invent no fee policies'));
upgraded.close();old.close();

const db=database();fixture(db);fees(db);const snapshot={format:'timelyo-d1-v20',tables:exportTables(db,20)};
check(()=>assert.equal(snapshotVersion(snapshot),20));
check(()=>assert.equal(expectedSnapshotTables(20).length,expectedSnapshotTables(19).length+8));
check(()=>assert.doesNotThrow(()=>checkRestoredBillingStructure(db)));
check(()=>assert.equal(restoreInMemory(snapshot).billing_rate_versions,3,'actual secure restore includes migration 0031 and rate history'));
const restored=replay(snapshot);
for(const name of expectedSnapshotTables(20).filter(name=>name.startsWith('billing_')))check(()=>assert.deepEqual(restored.prepare('SELECT * FROM '+name+' ORDER BY rowid').all(),db.prepare('SELECT * FROM '+name+' ORDER BY rowid').all(),'financial snapshot preserves '+name));
check(()=>assert.equal(new Set(restored.prepare('SELECT id FROM billing_students').all().map(row=>row.id)).size,2,'same-name learners in separate groups keep separate stable identities'));
check(()=>assert.deepEqual(restored.prepare('SELECT group_id,amount_cents FROM billing_rate_versions ORDER BY amount_cents').all().map(row=>[row.group_id,row.amount_cents]),[[group,3500],[group,4500],[other,9900]]));
check(()=>assert.equal(restored.prepare('SELECT amount_cents FROM billing_adjustments WHERE id=?').get('fixture-adjustment-clear').amount_cents,null,'clear operations retain the prior adjustment as an immutable history row'));
check(()=>assert.equal(restored.prepare('SELECT amount_cents FROM billing_adjustments WHERE id=?').get('fixture-adjustment-0').amount_cents,4200));
check(()=>assert.equal(restored.prepare('SELECT count(*) count FROM accounts WHERE id=?').get('historical-owner-id').count,0,'immutable financial authors may be retained after the actor account is removed'));
const mutate=(sql,values,test)=>{restored.exec('SAVEPOINT malformed_snapshot;PRAGMA defer_foreign_keys=ON');try{restored.prepare(sql).run(...values);test();}finally{restored.exec('ROLLBACK TO malformed_snapshot;RELEASE malformed_snapshot');}};
check(()=>mutate('UPDATE billing_rates SET current_version_id=? WHERE id=?',['fixture-rate-1-version','fixture-rate-0'],()=>assert.throws(()=>checkRestoredBillingStructure(restored),/billing/,'cross-group current pointers rejected')));
check(()=>mutate('UPDATE billing_policies SET revision=revision+1 WHERE group_id=?',[group],()=>assert.throws(()=>checkRestoredBillingStructure(restored),/billing/,'dangling current policy revision rejected')));
check(()=>mutate('UPDATE billing_rates SET student_id=? WHERE id=?',[restored.prepare('SELECT id FROM billing_students WHERE group_id=?').get(other).id,'fixture-rate-0'],()=>assert.throws(()=>checkRestoredBillingStructure(restored),/billing/,'forged financial student group rejected')));
check(()=>mutate('DELETE FROM billing_rate_versions WHERE id=?',['fixture-rate-0-version'],()=>assert.throws(()=>checkRestoredBillingStructure(restored),/billing/,'missing historical rate revisions rejected')));
check(()=>mutate('UPDATE billing_adjustments SET basis_hash=? WHERE id=?',['invalid','fixture-adjustment-0'],()=>assert.throws(()=>checkRestoredBillingStructure(restored),/billing/,'invalid adjustment basis rejected')));
restored.close();

// The real encrypted-export endpoint includes financial rows only behind the
// dedicated secret. User sessions do not grant access to whole-database exports.
const sourceUrl=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
globalThis.__billingBackupDatabase=db;
const statement=(sql,values=[])=>{const execute=()=>{const stmt=globalThis.__billingBackupDatabase.prepare(sql);return stmt.columns().length?{results:stmt.all(...values),meta:{changes:0}}:{results:[],meta:stmt.run(...values)};};return{bind:(...next)=>statement(sql,next),first:async()=>execute().results[0]||null,all:async()=>execute(),run:async()=>execute(),execute};};
globalThis.__billingBackupD1={prepare:statement,batch:async statements=>statements.map(item=>item.execute())};
const token='fictional-billing-export-token-at-least-thirty-two-characters';
const stub=sourceUrl(`export const env={BACKUP_EXPORT_TOKEN:${JSON.stringify(token)}};export const learningDb=()=>globalThis.__billingBackupD1;export const pdfBucket=()=>({});`);
let routeSource=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/backup-export/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
for(const name of ['cloudflare:workers','@/lib/learning-server','@/lib/pdf-storage'])routeSource=routeSource.replaceAll('"'+name+'"',JSON.stringify(stub));
const route=await import(sourceUrl(routeSource));
const request=secret=>new Request('https://fictional-billing.example.test/api/backup-export',{headers:secret?{authorization:'Bearer '+secret}:{}});
let response=await route.GET(request(token)),payload=await response.json();
check(()=>assert.equal(response.status,200));check(()=>assert.equal(payload.format,'timelyo-d1-v20'));
check(()=>assert.deepEqual(Object.keys(payload.tables).sort(),expectedSnapshotTables(20).sort()));
check(()=>assert.equal(payload.tables.billing_rate_versions.rows.length,3));
check(()=>assert.equal((payload.tables.billing_students.rows[0].id),snapshot.tables.billing_students.rows[0].id));
response=await route.GET(request());check(()=>assert.equal(response.status,404));const anonymousBody=await response.text();check(()=>assert.equal(anonymousBody,''));
response=await route.GET(request('incorrect-fictional-token'));check(()=>assert.equal(response.status,404));
const partial=database();partial.exec('DROP TABLE billing_operations');globalThis.__billingBackupDatabase=partial;
response=await route.GET(request(token));check(()=>assert.equal(response.status,503,'partial billing schema cannot yield an apparently complete older snapshot'));partial.close();db.close();
console.log(JSON.stringify({suite:'billing-backup',checks,network:'disabled',database:'in-memory',coverage:'real v20 export and secure restore, v19 compatibility/current upgrade, financial version identities and group references, export token and partial-schema rejection'}));
