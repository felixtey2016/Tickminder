import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createFixtureLoader} from './fixture-loader.mjs';
import {snapshotVersion,expectedSnapshotTables} from '../scripts/backup-order.mjs';

const root=path.resolve(import.meta.dirname,'..'),now='2032-06-01T00:00:00.000Z';
globalThis.fetch=async()=>{throw Error('Network forbidden in monthly allowance backup tests');};
const files=fs.readdirSync(path.join(root,'drizzle')).filter(x=>x.endsWith('.sql')).sort();
const migration=files.find(x=>x.startsWith('0065_'));
assert(migration,'The reviewed monthly allowance migration is required');
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const file of files.filter(x=>Number(x.slice(0,4))<=64))db.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
const groups=['next-genn-edu','fictional-monthly-backup-other'];
db.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(groups[1],'Fictional monthly backup other','fictional-monthly-backup-other',now,now);
for(const [index,group]of groups.entries()){
 db.prepare('INSERT INTO students(group_id,name,name_key,created_at) VALUES(?,?,?,?)').run(group,'Fictional Learner','fictional learner',now);
 db.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(group,'Fictional Teacher',now);
 db.prepare('INSERT INTO plans(group_id,key,student,subject,teacher_name,duration,created_at) VALUES(?,?,?,?,?,?,?)').run(group,'fictional-monthly-plan','Fictional Learner','Mathematics','Fictional Teacher',1,now);
 const student=db.prepare('SELECT id FROM billing_students WHERE group_id=?').get(group).id;
 const subject=db.prepare('SELECT subject_key FROM billing_subjects WHERE group_id=?').get(group).subject_key;
 const rate='fictional-monthly-rate-'+index,version=rate+'-legacy';
 db.prepare('INSERT INTO billing_rates(id,group_id,student_id,subject_key,revision,current_version_id,updated_at) VALUES(?,?,?,?,1,?,?)').run(rate,group,student,subject,version,now);
 db.prepare('INSERT INTO billing_rate_versions(id,group_id,rate_id,revision,mode,amount_cents,currency,effective_from,subject_snapshot,actor_id,created_at) VALUES(?,?,?,1,?,?,\'MYR\',?,?,?,?)').run(version,group,rate,index?'hour':'month',index?5000:20000,'2032-06-01','Mathematics','fictional-history-author',now);
}
let checks=0;const check=(label,fn)=>{fn();checks++;console.log('PASS '+label);};
const oldTables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>({name,columns:db.prepare('PRAGMA table_info("'+name+'")').all().map(x=>x.name)}));
const oldData=()=>JSON.stringify(oldTables.map(({name,columns})=>[name,db.prepare('SELECT '+columns.map(x=>'"'+x+'"').join(',')+' FROM "'+name+'" ORDER BY rowid').all()]));
const before=oldData();
const dataUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
function statement(sql,values=[]){const execute=()=>{const stmt=db.prepare(sql);return stmt.columns().length?{results:stmt.all(...values)}:{results:[],meta:stmt.run(...values)};};return{bind:(...args)=>statement(sql,args),first:async()=>execute().results[0]||null,all:async()=>execute(),execute};}
const token='fictional-monthly-backup-token-minimum-length';
globalThis.__monthlyBackup={learningDb:()=>({prepare:statement,batch:async list=>list.map(x=>x.execute())}),pdfBucket:()=>({}),env:{BACKUP_EXPORT_TOKEN:token}};
const runtime=dataUrl('export const {learningDb,pdfBucket,env}=globalThis.__monthlyBackup;');
const load=createFixtureLoader({runtimeUrl:runtime,environmentUrl:runtime,runtimeFiles:['lib/learning-server.ts','lib/pdf-storage.ts']});
const route=(await load('app/api/backup-export/route.ts')).module;
async function exported(secret=token){const response=await route.GET(new Request('https://fictional.example.test/api/backup-export',{headers:secret?{authorization:'Bearer '+secret}:{}}));assert.equal(response.status,200);return response.json();}
let secure=fs.readFileSync(path.join(root,'scripts/secure-d1-backup.mjs'),'utf8').replaceAll('\r\n','\n').split('\ntry {\n')[0];
secure=secure.replace("const projectRoot = resolve(import.meta.dirname, '..').toLowerCase();",'const projectRoot = '+JSON.stringify(root.toLowerCase())+';').replace("'./backup-order.mjs'",JSON.stringify(new URL('../scripts/backup-order.mjs',import.meta.url).href)).replace('checkRestoredFolderStructure(db);','checkRestoredFolderStructure(db);globalThis.__inspectMonthlyRestore?.(db);');
const {restoreInMemory}=await import(dataUrl(secure+'\nexport {restoreInMemory};'));
const legacy=await exported();
check('unmigrated v39 backups retain exact legacy fields',()=>{assert.equal(snapshotVersion(legacy),39);assert(!legacy.tables.billing_rate_versions.columns.includes('included_sessions'));assert.equal(restoreInMemory(legacy).billing_rate_versions,2);});
db.exec(fs.readFileSync(path.join(root,'drizzle',migration),'utf8'));
check('additive migration preserves every pre-existing column and row',()=>{assert.equal(oldData(),before);assert.deepEqual(db.prepare('SELECT included_sessions FROM billing_rate_versions').all().map(x=>x.included_sessions),[null,null]);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');});
db.prepare('INSERT INTO billing_rate_versions(id,group_id,rate_id,revision,mode,amount_cents,currency,effective_from,subject_snapshot,actor_id,created_at,included_sessions) VALUES(?,?,?,2,\'month\',20000,\'MYR\',?,?,?,?,4)').run('fictional-monthly-four',groups[0],'fictional-monthly-rate-0','2032-07-01','Mathematics','fictional-history-author',now);
db.prepare('UPDATE billing_rates SET revision=2,current_version_id=? WHERE id=?').run('fictional-monthly-four','fictional-monthly-rate-0');
const current=await exported();
let restored;
globalThis.__inspectMonthlyRestore=local=>{restored=local.prepare('SELECT * FROM billing_rate_versions ORDER BY id').all();};
const counts=restoreInMemory(current);delete globalThis.__inspectMonthlyRestore;
check('v40 export and secure restore preserve old nulls and new four-lesson monthly versions',()=>{assert.equal(snapshotVersion(current),40);assert.deepEqual(Object.keys(current.tables).sort(),expectedSnapshotTables(40).sort());assert.equal(counts.billing_rate_versions,3);assert.deepEqual(JSON.parse(JSON.stringify(restored)),current.tables.billing_rate_versions.rows.slice().sort((a,b)=>a.id.localeCompare(b.id)));});
check('legacy v39 secure restore still uses its original schema',()=>assert.equal(restoreInMemory(legacy).billing_rate_versions,2));
function damaged(label,change){check(label,()=>{const copy=structuredClone(current);change(copy);assert.throws(()=>restoreInMemory(copy));});}
damaged('v40 cannot claim the old v39 shape',copy=>copy.format='timelyo-d1-v39');
damaged('v40 cannot omit the allowance column even with no rows',copy=>{const table=copy.tables.billing_rate_versions;table.rows=[];table.columns=table.columns.filter(x=>x!=='included_sessions');});
for(const value of [0,-1,63,1.5,'4',true])damaged('invalid allowance '+JSON.stringify(value)+' is rejected',copy=>copy.tables.billing_rate_versions.rows.find(x=>x.id==='fictional-monthly-four').included_sessions=value);
damaged('hourly rate cannot have a monthly allowance',copy=>copy.tables.billing_rate_versions.rows.find(x=>x.mode==='hour').included_sessions=4);
damaged('a foreign tenant cannot take the rate version',copy=>copy.tables.billing_rate_versions.rows.find(x=>x.id==='fictional-monthly-four').group_id=groups[1]);
check('future snapshots stay unsupported',()=>assert.equal(snapshotVersion({format:'timelyo-d1-v43'}),0));
const denied=await route.GET(new Request('https://fictional.example.test/api/backup-export'));
check('anonymous backup access remains unavailable',()=>assert.equal(denied.status,404));
db.close();delete globalThis.__monthlyBackup;
console.log(JSON.stringify({suite:'monthly-included-sessions-backup',checks,networkRequests:0,database:'in-memory',productionWrites:false}));
