import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {checkRestoredAdminPermissionsStructure,checkRestoredFolderStructure,expectedSnapshotTables,orderedSnapshotTables,snapshotVersion} from '../scripts/backup-order.mjs';

// Actual export route, secure restore migration map, and independent SQLite.
// No cloud requests, credentials or existing user records are used.
globalThis.fetch=async()=>{throw Error('Network forbidden in permissions backup tests');};
const root=fileURLToPath(new URL('../',import.meta.url)),migrations=fs.readdirSync(path.join(root,'drizzle')).filter(file=>file.endsWith('.sql')).sort();
const now='2032-06-01T00:00:00.000Z',group='next-genn-edu';let checks=0;
const check=(label,fn)=>{fn();checks++;console.log('PASS '+label);};
function database(max){const db=new DatabaseSync(':memory:');for(const file of migrations.filter(file=>Number(file.slice(0,4))<=max))db.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));return db;}
function account(db,id,role='admin'){db.prepare('INSERT INTO accounts(id,group_id,email,name,role,created_at) VALUES(?,?,?,?,?,?)').run(id,group,id+'@example.invalid',id,role,now);}
const sql32=fs.readFileSync(path.join(root,'drizzle',migrations.find(file=>file.startsWith('0032_'))),'utf8');
const db=database(31);account(db,'fixture-existing-admin');account(db,'fixture-chief');db.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('fixture-chief',group);
const oldAccounts=JSON.stringify(db.prepare('SELECT * FROM accounts ORDER BY id').all());db.exec(sql32);account(db,'fixture-new-admin');
check('migration materializes only existing admin identities',()=>assert.equal(db.prepare('SELECT count(*) count FROM admin_permission_profiles').get().count,2));
check('chief baseline is retained for a later handover',()=>assert.equal(db.prepare('SELECT origin FROM admin_permission_profiles WHERE account_id=?').get('fixture-chief').origin,'legacy'));
check('migration preserves existing account records',()=>assert.equal(JSON.stringify(db.prepare("SELECT * FROM accounts WHERE id<>'fixture-new-admin' ORDER BY id").all()),oldAccounts));
check('new admin has no automatically granted profile',()=>assert.equal(db.prepare('SELECT 1 FROM admin_permission_profiles WHERE account_id=?').get('fixture-new-admin'),undefined));
db.prepare('UPDATE admin_permission_profiles SET draft_grants_json=?,revision=2,updated_by=?,updated_at=? WHERE account_id=?').run(JSON.stringify(['lessons.view','lessons.edit']),'fixture-chief',now,'fixture-existing-admin');
db.prepare('INSERT INTO admin_permission_profiles(group_id,account_id,revision,grants_json,draft_grants_json,origin,updated_by,updated_at) VALUES(?,?,1,?,?,\'new\',?,?)').run(group,'fixture-new-admin','[]','[]','fixture-chief',now);
check('valid legacy and empty new profiles pass structural validation',()=>checkRestoredAdminPermissionsStructure(db));

function statement(database,sql,values=[]){const execute=()=>{const s=database.prepare(sql);return s.columns().length?{results:s.all(...values),meta:{changes:0}}:{results:[],meta:s.run(...values)};};return{bind:(...v)=>statement(database,sql,v),first:async()=>execute().results[0]||null,all:async()=>execute(),run:async()=>execute(),execute};}
let activeDb=db;const d1={prepare:(sql)=>statement(activeDb,sql),batch:async items=>{activeDb.exec('BEGIN');try{const values=items.map(s=>s.execute());activeDb.exec('COMMIT');return values;}catch(e){activeDb.exec('ROLLBACK');throw e;}}};
const token='fictional-permissions-backup-token-123456789';globalThis.__permissionBackup={env:{BACKUP_EXPORT_TOKEN:token},learningDb:()=>d1,pdfBucket:()=>({})};
const stub='data:text/javascript;base64,'+Buffer.from('export const {env,learningDb,pdfBucket}=globalThis.__permissionBackup;').toString('base64');
let routeSource=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/backup-export/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
for(const spec of ['cloudflare:workers','@/lib/learning-server','@/lib/pdf-storage'])routeSource=routeSource.replaceAll('"'+spec+'"','"'+stub+'"').replaceAll("'"+spec+"'","'"+stub+"'");
const route=await import('data:text/javascript;base64,'+Buffer.from(routeSource).toString('base64'));
const request=provided=>new Request('https://fixture.invalid/api/backup-export',{headers:provided?{authorization:'Bearer '+provided}:{}});
check('anonymous export is hidden',()=>{});assert.equal((await route.GET(request())).status,404);
const response=await route.GET(request(token)),snapshot=await response.json();
check('real export uses v21 when permission profiles exist',()=>{assert.equal(response.status,200);assert.equal(snapshotVersion(snapshot),21);});
check('all 62 tables are exported including staged grants',()=>{assert.equal(Object.keys(snapshot.tables).length,62);assert.equal(snapshot.tables.admin_permission_profiles.rows.length,3);});
check('restore orders profile rows after accounts and groups',()=>{const names=orderedSnapshotTables(snapshot.tables).map(([name])=>name);assert(names.indexOf('accounts')<names.indexOf('admin_permission_profiles'));assert(names.indexOf('tuition_groups')<names.indexOf('admin_permission_profiles'));});

let secureSource=fs.readFileSync(path.join(root,'scripts/secure-d1-backup.mjs'),'utf8').split('\ntry {\n')[0];
secureSource=secureSource.replace("const projectRoot = resolve(import.meta.dirname, '..').toLowerCase();",'const projectRoot = '+JSON.stringify(path.resolve(root).toLowerCase())+';').replace("'./backup-order.mjs'",JSON.stringify(new URL('../scripts/backup-order.mjs',import.meta.url).href));
const {restoreInMemory}=await import('data:text/javascript;base64,'+Buffer.from(secureSource+'\nexport {restoreInMemory};').toString('base64'));
check('actual secure v21 restore preserves staged and legacy profiles',()=>assert.equal(restoreInMemory(snapshot).admin_permission_profiles,3));
const restored=database(32);restored.exec('DELETE FROM tuition_groups;DELETE FROM academic_catalogues;');
for(const [name,table]of orderedSnapshotTables(snapshot.tables)){const insert=restored.prepare(`INSERT INTO "${name}"(${table.columns.map(column=>'"'+column+'"').join(',')}) VALUES(${table.columns.map(()=>'?').join(',')})`);for(const row of table.rows)insert.run(...table.columns.map(column=>row[column]));}
check('independent replay preserves all permission row values',()=>assert.deepEqual(restored.prepare('SELECT * FROM admin_permission_profiles ORDER BY account_id').all(),db.prepare('SELECT * FROM admin_permission_profiles ORDER BY account_id').all()));
check('independent full database structure remains valid',()=>checkRestoredFolderStructure(restored));
const corrupt=(label,sql,...values)=>check(label,()=>{restored.exec('SAVEPOINT malformed_profile');try{restored.prepare(sql).run(...values);assert.throws(()=>checkRestoredAdminPermissionsStructure(restored),/permission/);}finally{restored.exec('ROLLBACK TO malformed_profile;RELEASE malformed_profile');}});
for(const [label,grants]of [['reserved finance grant',['finance.view']],['unknown module',['unknown.view']],['unsupported teacher-only write',['materials.edit']],['wildcard grant',['*']],['duplicate grants',['lessons.view','lessons.view']],['missing view dependency',['lessons.edit']]])corrupt('restore rejects '+label,'UPDATE admin_permission_profiles SET draft_grants_json=? WHERE account_id=?',JSON.stringify(grants),'fixture-existing-admin');
corrupt('restore rejects invalid metadata timestamp','UPDATE admin_permission_profiles SET updated_at=? WHERE account_id=?','not-a-date','fixture-existing-admin');
restored.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run('fixture-other','Other','fixture-other',now,now);
corrupt('restore rejects a mismatched group profile','UPDATE admin_permission_profiles SET group_id=? WHERE account_id=?','fixture-other','fixture-existing-admin');
restored.exec('PRAGMA foreign_keys=ON');restored.prepare('DELETE FROM accounts WHERE id=?').run('fixture-new-admin');
check('permanent account removal also removes its permission profile',()=>assert.equal(restored.prepare('SELECT 1 FROM admin_permission_profiles WHERE account_id=?').get('fixture-new-admin'),undefined));
const old=database(31);account(old,'fixture-v20-admin');activeDb=old;const oldResponse=await route.GET(request(token)),legacy=await oldResponse.json();
check('unmigrated database retains the v20 export contract',()=>{assert.equal(oldResponse.status,200);assert.equal(snapshotVersion(legacy),20);assert.equal(Object.keys(legacy.tables).length,61);});
check('actual secure old v20 restore remains supported',()=>assert.equal(restoreInMemory(legacy).accounts,1));
check('version-specific table lists exclude profiles from old backups',()=>{assert.equal(expectedSnapshotTables(20).includes('admin_permission_profiles'),false);assert.equal(expectedSnapshotTables(21).includes('admin_permission_profiles'),true);});
old.close();restored.close();db.close();
console.log(JSON.stringify({suite:'admin-permissions-backup',passed:checks,networkRequests:0,productionWrites:false}));
