import assert from 'node:assert/strict';
import {createCipheriv,createHash,randomBytes} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {expectedSnapshotTables} from '../scripts/backup-order.mjs';

// Run the actual recovery script through decryption and SQL replay. Only its
// process boundary and DPAPI key unwrap are replaced; no child or cloud tool runs.
const repo=path.resolve(import.meta.dirname,'..');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-permissions-recovery-'));
const checkout=path.join(temporary,'checkout');
const migrations=fs.readdirSync(path.join(repo,'drizzle')).filter(name=>/^\d{4}_.*\.sql$/.test(name)).sort();
const source=fs.readFileSync(path.join(repo,'scripts','restore-cloudflare-backup.mjs'),'utf8');
const approved={accountId:'a'.repeat(32),databaseId:'11111111-2222-4333-8444-555555555555',bucketName:'fictional-permissions-recovery'};
const now='2032-06-01T00:00:00.000Z',group='next-genn-edu';
const dataUrl=value=>'data:text/javascript;base64,'+Buffer.from(value).toString('base64');
let checks=0,sequence=0;
const check=(label,fn)=>{fn();checks++;console.log('PASS '+label);};

function database(max){
 const db=new DatabaseSync(':memory:');
 try{for(const file of migrations.filter(name=>Number(name.slice(0,4))<=max))db.exec(fs.readFileSync(path.join(repo,'drizzle',file),'utf8'));return db;}
 catch(error){db.close();throw error;}
}
function account(db,id,role='admin'){
 db.prepare('INSERT INTO accounts(id,group_id,email,name,role,created_at) VALUES(?,?,?,?,?,?)').run(id,group,id+'@example.invalid',id,role,now);
}
function snapshot(db,version){
 const tables=Object.fromEntries(expectedSnapshotTables(version).map(name=>[name,{
  columns:db.prepare('PRAGMA table_info("'+name+'")').all().map(column=>column.name),
  rows:db.prepare('SELECT * FROM "'+name+'"').all(),
 }]));
 return{format:'timelyo-d1-v'+version,tables};
}
function encryptedFixture(name,contents){
 const directory=path.join(temporary,name),key=randomBytes(32),iv=randomBytes(12);
 fs.mkdirSync(directory);
 const plain=Buffer.from(JSON.stringify(contents)),cipher=createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);
 const wrappedKey='fictional-dpapi-envelope-'+name;
 fs.writeFileSync(path.join(directory,'database.json.aes'),encrypted);
 fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({
  format:'timelyo-full-backup-v2',createdAt:now,wrappedKey,files:[],
  database:{iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),sha256:createHash('sha256').update(plain).digest('hex')},
 }));
 plain.fill(0);
 return{directory,key,wrappedKey};
}
async function recover(fixture,expectedTarget){
 const name='__adminPermissionsRecovery'+sequence++,calls=[],captures=[],printed=[],errors=[];
 globalThis[name]={
  DatabaseSync,key:fixture.key,calls,wrappedKey:fixture.wrappedKey,
  capture(db){
   const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name);
   if(!names.includes('admin_permission_profiles'))return;
   const accounts=db.prepare('SELECT id,role FROM accounts ORDER BY id').all();
   if(accounts.length)captures.push({accounts,profiles:db.prepare('SELECT * FROM admin_permission_profiles ORDER BY account_id').all(),integrity:db.prepare('PRAGMA integrity_check').get().integrity_check});
  },
 };
 const processStub=dataUrl(`const state=globalThis[${JSON.stringify(name)}];
 export function spawnSync(executable,args){
  state.calls.push({kind:'spawn',executable,args});
  if(args[0]!==${JSON.stringify(path.join(checkout,'scripts','secure-full-backup.mjs'))}||args[1]!=='verify'||args[2]!=='--in'||args[3]!==${JSON.stringify(fixture.directory)}||args.length!==4)throw Error('Real child and cloud processes are forbidden in recovery tests');
  return{status:0,stdout:Buffer.alloc(0),stderr:Buffer.alloc(0)};
 }
 export function execFileSync(executable,args,options){
  state.calls.push({kind:'exec',executable,args});
  if(executable!=='powershell.exe'||options.input!==state.wrappedKey||!args.includes('-NonInteractive')||!args.at(-1).includes('ProtectedData]::Unprotect'))throw Error('Only fictional DPAPI unwrap is allowed in recovery tests');
  return Buffer.from(state.key).toString('base64');
 }`);
 const sqliteStub=dataUrl(`const state=globalThis[${JSON.stringify(name)}];
 export class DatabaseSync extends state.DatabaseSync{
  close(){try{state.capture(this);}finally{super.close();}}
 }`);
 const code=source.replace("const root = resolve(import.meta.dirname, '..');",'const root = '+JSON.stringify(checkout)+';')
  .replace('const args = process.argv.slice(2);','const args = '+JSON.stringify(['--in',fixture.directory,'--expected-target',expectedTarget])+';')
  .replace("'node:child_process'",JSON.stringify(processStub))
  .replace("'node:sqlite'",JSON.stringify(sqliteStub))
  .replace("'./backup-order.mjs'",JSON.stringify(pathToFileURL(path.join(repo,'scripts','backup-order.mjs')).href));
 const previousLog=console.log,previousError=console.error,previousExitCode=process.exitCode;
 let failure=null,exitCode;
 console.log=(...values)=>printed.push(values.join(' '));console.error=(...values)=>errors.push(values.join(' '));
 try{await import(dataUrl(code));exitCode=process.exitCode;}catch(error){failure=error;}
 finally{console.log=previousLog;console.error=previousError;process.exitCode=previousExitCode;delete globalThis[name];}
 assert.equal(failure,null,'actual recovery script must not throw');
 assert.deepEqual(errors,[],'actual recovery script must complete without reporting failure');
 assert.notEqual(exitCode,1,'actual recovery script must complete its local dry run');
 assert.equal(captures.length,1,'capture the actual populated replay database before it closes');
 return{...captures[0],calls,printed};
}

const previousFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('Network is forbidden in permissions recovery tests');};
const keys=[];
try{
 fs.mkdirSync(checkout);
 fs.cpSync(path.join(repo,'drizzle'),path.join(checkout,'drizzle'),{recursive:true});
 fs.writeFileSync(path.join(checkout,'wrangler.recovery.json'),JSON.stringify({account_id:approved.accountId,d1_databases:[{database_id:approved.databaseId}],r2_buckets:[{bucket_name:approved.bucketName}]}));
 const expectedTarget=path.join(temporary,'private-expected-target.json');
 fs.writeFileSync(expectedTarget,JSON.stringify(approved));

 const old=database(31);let legacy;
 try{
  account(old,'fixture-v20-chief');account(old,'fixture-v20-admin');account(old,'fixture-v20-teacher','teacher');
  old.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('fixture-v20-chief',group);
  legacy=snapshot(old,20);
 }finally{old.close();}
 const oldFixture=encryptedFixture('v20',legacy);keys.push(oldFixture.key);
 const restoredOld=await recover(oldFixture,expectedTarget);
 check('actual v20 recovery upgrades to current permission schema',()=>{assert.equal(restoredOld.integrity,'ok');assert.equal(restoredOld.profiles.length,2);});
 check('restored existing administrators receive frozen nonempty legacy baselines',()=>{
  const seed=fs.readFileSync(path.join(repo,'drizzle','0032_admin_permissions.sql'),'utf8').match(/SELECT a\.group_id,a\.id,1,'([^']+)'/);
  assert.ok(seed,'the migration has an explicit frozen legacy baseline');
  for(const profile of restoredOld.profiles){assert.equal(profile.origin,'legacy');assert.equal(profile.revision,1);assert.equal(profile.grants_json,seed[1]);assert.ok(JSON.parse(profile.grants_json).length>0);assert.equal(profile.draft_grants_json,null);}
 });
 check('recovery preserves the chief baseline and excludes teacher profiles',()=>{assert.ok(restoredOld.profiles.some(profile=>profile.account_id==='fixture-v20-chief'));assert.equal(restoredOld.profiles.some(profile=>profile.account_id==='fixture-v20-teacher'),false);});

 const current=database(31);let modern;
 try{
  account(current,'fixture-v21-chief');account(current,'fixture-v21-draft');
  current.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run('fixture-v21-chief',group);
  current.exec(fs.readFileSync(path.join(repo,'drizzle','0032_admin_permissions.sql'),'utf8'));
  account(current,'fixture-v21-new');account(current,'fixture-v21-teacher','teacher');
  current.prepare('UPDATE admin_permission_profiles SET revision=3,draft_grants_json=?,updated_by=?,updated_at=? WHERE account_id=?').run('["lessons.view","lessons.edit"]','fixture-v21-chief',now,'fixture-v21-draft');
  modern=snapshot(current,21);
 }finally{current.close();}
 const modernFixture=encryptedFixture('v21',modern);keys.push(modernFixture.key);
 const restoredModern=await recover(modernFixture,expectedTarget);
 check('actual v21 recovery preserves every stored permission profile field',()=>{assert.equal(restoredModern.integrity,'ok');assert.deepEqual(restoredModern.profiles,modern.tables.admin_permission_profiles.rows.toSorted((left,right)=>left.account_id.localeCompare(right.account_id)));});
 check('v21 administrators without a profile remain absent after recovery',()=>{assert.ok(restoredModern.accounts.some(account=>account.id==='fixture-v21-new'&&account.role==='admin'));assert.equal(restoredModern.profiles.some(profile=>profile.account_id==='fixture-v21-new'),false);});
 check('v21 saved permission draft and revision survive actual SQL replay',()=>{const profile=restoredModern.profiles.find(profile=>profile.account_id==='fixture-v21-draft');assert.equal(profile.draft_grants_json,'["lessons.view","lessons.edit"]');assert.equal(profile.revision,3);assert.equal(profile.updated_by,'fixture-v21-chief');assert.equal(profile.updated_at,now);});
 check('both recovery runs finish local dry runs without cloud or real child processes',()=>{
  for(const result of [restoredOld,restoredModern]){
   assert.equal(result.calls.length,2);assert.deepEqual(result.calls.map(call=>call.kind),['spawn','exec']);
   assert.ok(result.printed.some(line=>{try{return JSON.parse(line).mode==='local-dry-run';}catch{return false;}}));
   assert.equal(result.calls.some(call=>call.args.includes('--remote')),false);
  }
 });
 console.log(JSON.stringify({suite:'admin-permissions-recovery',passed:checks,networkRequests:0,productionWrites:false,coverage:'actual encrypted v20/v21 recovery script, current SQL replay and pre-close database capture'}));
}finally{
 globalThis.fetch=previousFetch;
 keys.forEach(key=>key.fill(0));
 const resolved=path.resolve(temporary);
 if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('tickminder-permissions-recovery-'))throw Error('Refusing cleanup outside the fictional recovery fixture directory');
 fs.rmSync(resolved,{recursive:true,force:true});
}
