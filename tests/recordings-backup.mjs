import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createFixtureLoader} from './fixture-loader.mjs';
import {expectedSnapshotTables,orderedSnapshotTables,snapshotVersion,checkRestoredRecordingsAndContacts} from '../scripts/backup-order.mjs';

// Exercise the actual export and secure restore against fictional SQLite data.
// No network requests, cloud tools, credentials or user records are involved.
globalThis.fetch=async()=>{throw Error('Network forbidden in recordings backup tests');};
const root=path.resolve(import.meta.dirname,'..'),now='2032-06-15T04:00:00.000Z',group='next-genn-edu';
const added=['whatsapp_contacts','whatsapp_challenges','whatsapp_contact_requests','class_recordings','recording_recipients','recording_operations'];
let checks=0;const check=(label,fn)=>{fn();checks++;console.log('PASS '+label);};
function database(max=37){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const name of fs.readdirSync(path.join(root,'drizzle')).filter(n=>n.endsWith('.sql')&&Number(n.slice(0,4))<=max).sort())db.exec(fs.readFileSync(path.join(root,'drizzle',name),'utf8'));return db;}
const db=database();
db.prepare('INSERT INTO accounts(id,group_id,email,name,role,created_at) VALUES(?,?,?,?,?,?)').run('backup-admin',group,'backup@example.invalid','Backup Admin','admin',now);
db.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(group,'Fixture Teacher',now);
db.prepare('INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('backup-class',group,'Fixture Class','Mathematics','Fixture Teacher','backup-admin',now,now);
db.prepare("INSERT INTO class_sessions(id,group_id,session_type,classroom_id,classroom_title,teacher_name,subject,planned_start,planned_end,created_by,created_at,updated_at) VALUES(?,?,'group',?,?,?,?,?,?,?,?,?)").run('backup-session',group,'backup-class','Fixture Class','Fixture Teacher','Mathematics','2032-06-15T02:00:00Z','2032-06-15T03:00:00Z','backup-admin',now,now);
db.prepare('INSERT INTO class_recordings(id,group_id,classroom_id,session_id,title,description,drive_url,lesson_date,status,revision,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('backup-recording',group,'backup-class','backup-session','Saved recording','Historical recipient snapshot','https://drive.google.com/file/d/fictional-recording-1234/view?resourcekey=fictional-key','2032-06-15','published',3,'backup-admin',now,now);
db.prepare("UPDATE class_recordings SET audience_mode='selected' WHERE id=?").run('backup-recording');
db.prepare('INSERT INTO recording_recipients(group_id,recording_id,student_name) VALUES(?,?,?)').run(group,'backup-recording','Former class member');
db.prepare('INSERT INTO recording_operations(group_id,operation_id,actor_id,request_hash,execution_id,result_json,created_at) VALUES(?,?,?,?,?,?,?)').run(group,'fixture-operation','backup-admin','a'.repeat(64),'fixture-execution','{"id":"backup-recording"}',now);
db.prepare('INSERT INTO whatsapp_contacts(account_id,group_id,phone,identity_role,identity_name,verified_at) VALUES(?,?,?,?,?,?)').run('backup-admin',group,'60123456789','admin','backup-admin',now);
db.prepare('INSERT INTO whatsapp_challenges(token_hash,account_id,group_id,phone,identity_role,identity_name,created_at,expires_at,status) VALUES(?,?,?,?,?,?,?,?,?)').run('b'.repeat(64),'backup-admin',group,'60123456789','admin','backup-admin',now,'2032-06-15T04:08:00.000Z','pending');
db.prepare('INSERT INTO whatsapp_contact_requests(account_id,group_id,phone,identity_role,identity_name,collected_from,updated_at) VALUES(?,?,?,?,?,?,?)').run('backup-admin',group,'60123456789','admin','backup-admin','fictional-fixture',now);
let activeDb=db;
function statement(sql,values=[]){const execute=()=>{const s=activeDb.prepare(sql);return s.columns().length?{results:s.all(...values),meta:{changes:0}}:{results:[],meta:s.run(...values)};};return{bind:(...v)=>statement(sql,v),first:async()=>execute().results[0]||null,all:async()=>execute(),execute};}
const d1={prepare:statement,batch:async items=>{activeDb.exec('BEGIN');try{const results=items.map(s=>s.execute());activeDb.exec('COMMIT');return results;}catch(error){activeDb.exec('ROLLBACK');throw error;}}};
const token='fictional-recording-backup-token-123456789012345';
globalThis.__recordingBackup={learningDb:()=>d1,pdfBucket:()=>({}),env:{BACKUP_EXPORT_TOKEN:token}};
const dataUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64'),runtimeUrl=dataUrl('export const {learningDb,pdfBucket,env}=globalThis.__recordingBackup;');
const load=createFixtureLoader({runtimeUrl,environmentUrl:runtimeUrl,runtimeFiles:['lib/learning-server.ts','lib/pdf-storage.ts']});
const route=(await load('app/api/backup-export/route.ts')).module;
const request=()=>new Request('https://fixture.invalid/api/backup-export',{headers:{authorization:'Bearer '+token}});
const response=await route.GET(request()),snapshot=await response.json();
check('v23 exports every WhatsApp and recording table',()=>{assert.equal(response.status,200);assert.equal(snapshotVersion(snapshot),23);assert.deepEqual(Object.keys(snapshot.tables).sort(),expectedSnapshotTables(23).sort());for(const table of added)assert.equal(snapshot.tables[table].rows.length,1);});
check('replay order places parents before contacts and recording recipients',()=>{const names=orderedSnapshotTables(snapshot.tables).map(([name])=>name);for(const table of added)assert(names.indexOf('accounts')<names.indexOf(table));assert(names.indexOf('class_sessions')<names.indexOf('class_recordings'));assert(names.indexOf('class_recordings')<names.indexOf('recording_recipients'));});
check('valid historical recipients and contacts pass structural checks',()=>checkRestoredRecordingsAndContacts(db));
let secureSource=fs.readFileSync(path.join(root,'scripts/secure-d1-backup.mjs'),'utf8').split('\ntry {\n')[0];
secureSource=secureSource.replace("const projectRoot = resolve(import.meta.dirname, '..').toLowerCase();",'const projectRoot = '+JSON.stringify(root.toLowerCase())+';').replace("'./backup-order.mjs'",JSON.stringify(new URL('../scripts/backup-order.mjs',import.meta.url).href));
const {restoreInMemory}=await import(dataUrl(secureSource+'\nexport {restoreInMemory};'));
check('actual secure v23 restore preserves every column in all six new tables',()=>{const counts=restoreInMemory(snapshot);for(const table of added)assert.equal(counts[table],1);});
check('whole-class visibility restores without freezing a recipient list',()=>{const wholeClass=structuredClone(snapshot);wholeClass.tables.class_recordings.rows[0].audience_mode='classroom';wholeClass.tables.recording_recipients.rows=[];assert.equal(restoreInMemory(wholeClass).recording_recipients,0);});
check('restore rejects an invalid recording audience mode',()=>{const malformed=structuredClone(snapshot);malformed.tables.class_recordings.rows[0].audience_mode='public';assert.throws(()=>restoreInMemory(malformed),/CHECK|recordings/);});
check('incomplete v23 snapshots are rejected',()=>{const malformed=structuredClone(snapshot);delete malformed.tables.whatsapp_contact_requests;assert.throws(()=>restoreInMemory(malformed),/Incomplete database export/);});
check('restore rejects unsafe recording links',()=>{const malformed=structuredClone(snapshot);malformed.tables.class_recordings.rows[0].drive_url='javascript:alert(1)';assert.throws(()=>restoreInMemory(malformed),/recordings/);});
check('restore rejects cross-group recording recipients',()=>{const malformed=structuredClone(snapshot);malformed.tables.recording_recipients.rows[0].group_id='another-group';assert.throws(()=>restoreInMemory(malformed),/FOREIGN KEY|recordings/);});
check('restore rejects orphan WhatsApp identities',()=>{const malformed=structuredClone(snapshot);malformed.tables.whatsapp_contacts.rows[0].account_id='missing-account';assert.throws(()=>restoreInMemory(malformed),/FOREIGN KEY|WhatsApp/);});
const externalOption=process.argv.indexOf('--external-schema');
if(externalOption>=0){
 const schema=JSON.parse(fs.readFileSync(process.argv[externalOption+1],'utf8'));
 for(const object of schema.filter(item=>item.type==='table')){
  db.exec(object.sql);const columns=db.prepare('PRAGMA table_info('+object.name+')').all().map(row=>row.name);
  db.prepare('INSERT INTO '+object.name+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...columns.map(column=>column==='enforced'?1:column==='at'?now:column.endsWith('_json')?'{}':'fictional-'+column));
 }
 // These historical rows intentionally fail the live guard triggers if replayed
 // with triggers enabled, so successful restoration proves they were deferred.
 for(const object of schema.filter(item=>item.type==='trigger'))db.exec(object.sql);
 const externalResponse=await route.GET(request()),extended=await externalResponse.json();
 check('actual export includes all three optional Bot tables and exact schema',()=>{assert.equal(externalResponse.status,200);assert.equal(Object.keys(extended.tables).length,78);assert.equal(extended.externalSchema.length,11);assert.deepEqual(Object.keys(extended.tables).sort(),expectedSnapshotTables(23,extended.tables).sort());});
 check('optional Bot history restores without firing activation or revocation triggers',()=>{const counts=restoreInMemory(extended);for(const name of ['admin_phone_activations','admin_phone_revocations','console_plan_deactivations'])assert.equal(counts[name],1);});
 check('arbitrary SQL substituted into external schema is rejected',()=>{const malformed=structuredClone(extended);malformed.externalSchema[0].sql+='; DELETE FROM accounts';assert.throws(()=>restoreInMemory(malformed),/external Bot/);});
 check('missing external trigger metadata is rejected',()=>{const malformed=structuredClone(extended);malformed.externalSchema.pop();assert.throws(()=>restoreInMemory(malformed),/external Bot/);});
 db.exec('DROP TRIGGER admin_phone_apply_v1');
 check('changed live external schema cannot silently produce a partial backup',()=>{});assert.equal((await route.GET(request())).status,503);
}
const old=database(35);activeDb=old;const oldResponse=await route.GET(request()),oldSnapshot=await oldResponse.json();
check('old invoice-only v22 export remains supported',()=>{assert.equal(oldResponse.status,200);assert.equal(snapshotVersion(oldSnapshot),22);assert.deepEqual(Object.keys(oldSnapshot.tables).sort(),expectedSnapshotTables(22).sort());});
check('actual secure v22 restore remains compatible',()=>assert.equal(restoreInMemory(oldSnapshot).accounts,0));
activeDb=db;db.exec('DROP TABLE recording_operations');const incomplete=await route.GET(request());
check('partially migrated databases fail instead of silently omitting data',()=>assert.equal(incomplete.status,503));
db.close();old.close();
console.log(JSON.stringify({suite:'recordings-backup',checks,networkRequests:0,productionWrites:false}));
