import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createCipheriv,createHash,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createFixtureLoader} from './fixture-loader.mjs';
import {expectedSnapshotTables,snapshotVersion,checkRestoredNotificationPreferences} from '../scripts/backup-order.mjs';
import {NOTIFICATION_PREFERENCE_COLUMNS} from '../scripts/notification-preferences-backup.mjs';

const root=path.resolve(import.meta.dirname,'..'),now='2032-07-01T00:00:00.000Z',cutoff='2032-07-02T00:00:00.000Z',group='next-genn-edu';
globalThis.fetch=async()=>{throw Error('Network forbidden in notification preference backup fixture');};
const sql=name=>fs.readFileSync(path.join(root,'drizzle',name),'utf8');
function database(max){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')&&Number(f.slice(0,4))<=max).sort())db.exec(sql(file));return db;}
let active=database(61),checks=0;
function check(label,run){run();checks++;console.log('PASS '+label);}
function statement(query,values=[]){const execute=()=>{const s=active.prepare(query);return s.columns().length?{results:s.all(...values)}:{results:[],meta:s.run(...values)};};return{bind:(...args)=>statement(query,args),first:async()=>execute().results[0]||null,all:async()=>execute(),execute};}
const d1={prepare:statement,batch:async statements=>statements.map(s=>s.execute())},token='fictional-preference-backup-token-123456789';
globalThis.__preferenceBackup={learningDb:()=>d1,pdfBucket:()=>({}),env:{BACKUP_EXPORT_TOKEN:token}};
const dataUrl=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const runtimeUrl=dataUrl('export const {learningDb,pdfBucket,env}=globalThis.__preferenceBackup;');
const load=createFixtureLoader({runtimeUrl,environmentUrl:runtimeUrl,runtimeFiles:['lib/learning-server.ts','lib/pdf-storage.ts']});
const route=(await load('app/api/backup-export/route.ts')).module;
const request=()=>new Request('https://preferences.example.test/api/backup-export',{headers:{authorization:'Bearer '+token}});
async function exported(){const response=await route.GET(request());assert.equal(response.status,200);return response.json();}
let secure=fs.readFileSync(path.join(root,'scripts/secure-d1-backup.mjs'),'utf8').replaceAll('\r\n','\n').split('\ntry {\n')[0];
secure=secure.replace("const projectRoot = resolve(import.meta.dirname, '..').toLowerCase();",'const projectRoot = '+JSON.stringify(root.toLowerCase())+';').replace("'./backup-order.mjs'",JSON.stringify(new URL('../scripts/backup-order.mjs',import.meta.url).href)).replace('checkRestoredFolderStructure(db);','checkRestoredFolderStructure(db);globalThis.__inspectPreferenceRestore?.(db);');
const {restoreInMemory}=await import(dataUrl(secure+'\nexport {restoreInMemory};'));
for(const id of ['fixture-owner','fixture-learner','fixture-default'])active.prepare('INSERT INTO accounts(id,group_id,email,name,role,created_at) VALUES(?,?,?,?,?,?)').run(id,group,id+'@example.test',id,id==='fixture-owner'?'teacher':'student',now);
active.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run('a'.repeat(64),'fixture-learner','2099-01-01T00:00:00.000Z');
const question={id:'question-1',type:'mcq',points:1,options:[{id:'option-a',text:{primary:'A',en:''},imageId:null},{id:'option-b',text:{primary:'B',en:''},imageId:null}],extraImageIds:[],imageId:null,prompt:{primary:'Fictional question',en:''},difficulty:'easy',sourceId:'',chapter:'',level:''};
const content={schemaVersion:1,title:'Fictional Backup Quiz',instructions:'',subject:'Mathematics',exam:'SPM',year:null,region:'',paper:'',difficulty:'easy',primaryLanguage:'en',timeLimitSeconds:60,shuffleQuestions:false,shuffleOptions:false,questions:[question]};
active.prepare('INSERT INTO quizzes(id,group_id,owner_id,title,subject,exam,revision,question_count,total_score,time_limit_seconds,created_at,updated_at) VALUES(?,?,?,?,?,?,1,1,1,60,?,?)').run('fixture-quiz',group,'fixture-owner',content.title,content.subject,content.exam,now,now);
active.prepare('INSERT INTO quiz_versions(id,group_id,quiz_id,revision,content_json,actor_id,operation_id,request_hash,created_at) VALUES(?,?,?,1,?,?,?,?,?)').run('fixture-version',group,'fixture-quiz',JSON.stringify(content),'fixture-owner','fixture-version-operation-0001','a'.repeat(64),now);
active.prepare('INSERT INTO quiz_answer_keys(version_id,group_id,answers_json) VALUES(?,?,?)').run('fixture-version',group,JSON.stringify([{questionId:question.id,mode:'choice',correctOptionId:'option-a',accepted:[],caseSensitive:false,tolerance:0,unit:'',rubric:'',explanation:''}]));
active.prepare("INSERT INTO quiz_practice_attempts(id,group_id,account_id,quiz_id,version_id,immediate,status,order_json,answers_json,started_at,deadline_at,updated_at,total_score,operation_id,request_hash) VALUES(?,?,?,?,?,0,'in_progress',?,?,?,?,?,1,?,?)").run('fixture-attempt',group,'fixture-learner','fixture-quiz','fixture-version',JSON.stringify({questionIds:['question-1'],options:{'question-1':['option-a','option-b']}}),JSON.stringify({'question-1':{optionId:'option-b'}}),now,'2032-07-01T00:01:00.000Z',now,'fixture-attempt-operation-0001','b'.repeat(64));
const old=await exported(),before=JSON.stringify(active.prepare('SELECT * FROM quiz_practice_attempts').all());
check('genuine v37 remains valid without resume or notification preference metadata',()=>{assert.equal(snapshotVersion(old),37);assert.equal(restoreInMemory(old).accounts,3);assert(!old.tables.quiz_practice_attempts.columns.includes('current_question_id'));assert(!old.tables.notification_preferences);});
// TEST already has 0063/0064. Rehearse adding 0062 later without replaying them.
const outOfOrder=database(61);
for(const name of ['accounts','sessions','quizzes','quiz_versions','quiz_answer_keys','quiz_practice_attempts']){const table=old.tables[name],insert=outOfOrder.prepare('INSERT INTO '+name+'('+table.columns.join(',')+') VALUES('+table.columns.map(()=>'?').join(',')+')');for(const row of table.rows)insert.run(...table.columns.map(c=>row[c]));}
outOfOrder.exec(sql('0063_notification_preferences.sql'));outOfOrder.exec(sql('0064_session_devices.sql'));
outOfOrder.prepare('INSERT INTO notification_preferences(account_id,fees_enabled,updated_at) VALUES(?,0,?)').run('fixture-learner',now);
const oldShapes=outOfOrder.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>({name,columns:outOfOrder.prepare('PRAGMA table_info('+name+')').all().map(r=>r.name)}));
const fingerprint=()=>JSON.stringify(oldShapes.map(({name,columns})=>[name,outOfOrder.prepare('SELECT '+columns.join(',')+' FROM '+name).all()])),unchanged=fingerprint();
outOfOrder.exec(sql('0062_quiz_resume_position.sql'));
check('TEST order 0063/0064 then 0062 preserves every pre-existing table column and row',()=>{assert.equal(fingerprint(),unchanged);assert.equal(outOfOrder.prepare('SELECT current_question_id FROM quiz_practice_attempts').get().current_question_id,null);assert.deepEqual(outOfOrder.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(outOfOrder.prepare('PRAGMA integrity_check').get().integrity_check,'ok');});outOfOrder.close();
active.exec(sql('0062_quiz_resume_position.sql'));
check('0062 only adds a null resume position to an existing attempt',()=>{const rows=active.prepare('SELECT * FROM quiz_practice_attempts').all();assert.equal(rows[0].current_question_id,null);for(const row of rows)delete row.current_question_id;assert.equal(JSON.stringify(rows),before);});
active.prepare('UPDATE quiz_practice_attempts SET current_question_id=?').run('question-1');
const v38=await exported();
check('genuine v38 includes and verifies the saved resume position',()=>{assert.equal(snapshotVersion(v38),38);assert.equal(v38.tables.quiz_practice_attempts.rows[0].current_question_id,'question-1');assert.equal(restoreInMemory(v38).quiz_practice_attempts,1);});
active.exec(sql('0063_notification_preferences.sql'));active.exec(sql('0064_session_devices.sql'));
active.prepare('INSERT INTO notification_preferences(account_id,courses_enabled,homework_enabled,fees_enabled,courses_since,homework_since,fees_since,updated_at) VALUES(?,0,1,0,?,?,?,?)').run('fixture-learner','',cutoff,now,cutoff);
active.prepare('INSERT INTO notification_preferences(account_id,updated_at) VALUES(?,?)').run('fixture-owner',now);
active.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run('b'.repeat(64),'fixture-learner','2099-01-01T00:00:00.000Z');
active.prepare('INSERT INTO session_devices(id,token_hash,created_at,browser,os) VALUES(?,?,?,?,?)').run('revoked-device','b'.repeat(64),now,'chrome','windows');active.prepare('DELETE FROM sessions WHERE token_hash=?').run('b'.repeat(64));
const snapshot=await exported();
check('v39 exports exact preference columns, false choices and original re-enable cutoffs',()=>{assert.equal(snapshotVersion(snapshot),39);assert.deepEqual(Object.keys(snapshot.tables).sort(),expectedSnapshotTables(39).sort());assert.deepEqual(snapshot.tables.notification_preferences.columns.slice().sort(),NOTIFICATION_PREFERENCE_COLUMNS.slice().sort());const row=snapshot.tables.notification_preferences.rows.find(r=>r.account_id==='fixture-learner');assert.deepEqual([row.courses_enabled,row.homework_enabled,row.fees_enabled,row.courses_since,row.homework_since,row.fees_since],[0,1,0,'',cutoff,now]);assert.equal(snapshot.tables.notification_preferences.rows.length,2);});
check('reconstructible device metadata is excluded; a revoked session is not exported',()=>{assert(!snapshot.tables.session_devices);assert.equal(snapshot.tables.sessions.rows.length,1);assert.equal(snapshot.tables.sessions.rows[0].token_hash,'a'.repeat(64));assert.equal(active.prepare('SELECT count(*) n FROM session_devices WHERE id=?').get('revoked-device').n,0);});
let restoredShape;
globalThis.__inspectPreferenceRestore=db=>{restoredShape={preferences:db.prepare('SELECT * FROM notification_preferences ORDER BY account_id').all(),deviceColumns:db.prepare('PRAGMA table_info(session_devices)').all().map(r=>r.name),deviceRows:db.prepare('SELECT * FROM session_devices').all(),sessions:db.prepare('SELECT * FROM sessions').all()};};
const counts=restoreInMemory(snapshot);delete globalThis.__inspectPreferenceRestore;
check('v39 secure roundtrip preserves preferences and creates the login-required device schema',()=>{assert.equal(counts.notification_preferences,2);assert.deepEqual(JSON.parse(JSON.stringify(restoredShape.preferences)),snapshot.tables.notification_preferences.rows.slice().sort((a,b)=>a.account_id.localeCompare(b.account_id)));assert.deepEqual(restoredShape.deviceColumns,['id','token_hash','created_at','browser','os']);assert.deepEqual(restoredShape.deviceRows,[]);assert.equal(restoredShape.sessions.length,1);assert.equal(restoredShape.sessions[0].token_hash,'a'.repeat(64));});
function damaged(label,change){check(label,()=>{const bad=structuredClone(snapshot);change(bad);assert.throws(()=>restoreInMemory(bad));});}
damaged('v39 cannot omit preferences',bad=>delete bad.tables.notification_preferences);
damaged('preferences cannot masquerade as v38',bad=>bad.format='timelyo-d1-v38');
damaged('v39 cannot omit the resume column',bad=>{bad.tables.quiz_practice_attempts.columns=bad.tables.quiz_practice_attempts.columns.filter(c=>c!=='current_question_id');for(const row of bad.tables.quiz_practice_attempts.rows)delete row.current_question_id;});
damaged('invalid quiz resume position is rejected',bad=>bad.tables.quiz_practice_attempts.rows[0].current_question_id='other-question');
damaged('preferences cannot refer to a missing account',bad=>bad.tables.notification_preferences.rows[0].account_id='missing-account');
damaged('duplicate preference owner is rejected',bad=>bad.tables.notification_preferences.rows.push({...bad.tables.notification_preferences.rows[0]}));
damaged('preference column omissions are rejected even with zero rows',bad=>{bad.tables.notification_preferences.rows=[];bad.tables.notification_preferences.columns.pop();});
for(const [field,value] of [['courses_enabled',2],['homework_enabled','0'],['fees_enabled',null],['courses_since','invalid'],['homework_since','2032-07-02'],['fees_since',null],['updated_at',''],['updated_at','2032-07-01T08:00:00+08:00']])damaged('rejects invalid '+field+' '+JSON.stringify(value),bad=>bad.tables.notification_preferences.rows[0][field]=value);
const previous=active;active=database(62);active.exec('CREATE TABLE notification_preferences(account_id TEXT PRIMARY KEY)');const partialResponse=await route.GET(request());check('partial preference schema fails export visibly',()=>assert.equal(partialResponse.status,503));active.close();active=previous;
check('unknown future snapshot versions are rejected',()=>{assert.equal(snapshotVersion({format:'timelyo-d1-v43'}),0);assert.throws(()=>restoreInMemory({...snapshot,format:'timelyo-d1-v41'}));});
check('strict preference validation accepts the complete current schema',()=>assert.doesNotThrow(()=>checkRestoredNotificationPreferences(active)));

// Execute the actual recovery script's local dry run with genuine AES-GCM bytes,
// fictional identity/targets and child-process stubs. No real process or network runs.
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-preference-recovery-'));
const approved={accountId:'a'.repeat(32),databaseId:'11111111-2222-4333-8444-555555555555',bucketName:'fictional-preference-recovery'};
const expectedPath=path.join(temporary,'expected-target.json');fs.writeFileSync(expectedPath,JSON.stringify(approved));
const target={account_id:approved.accountId,d1_databases:[{database_id:approved.databaseId}],r2_buckets:[{bucket_name:approved.bucketName}]};
const original=fs.readFileSync(path.join(root,'scripts/restore-cloudflare-backup.mjs'),'utf8');let sequence=0;
async function recovery(data){
 const folder=path.join(temporary,'snapshot-'+sequence++);fs.mkdirSync(folder);
 const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),bytes=Buffer.from(JSON.stringify(data)),encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);
 fs.writeFileSync(path.join(folder,'database.json.aes'),encrypted);
 fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({format:'timelyo-full-backup-v2',createdAt:now,wrappedKey:'fictional-key',database:{iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')},files:[]}));
 globalThis.__recoveryChildren=[];let shape;
 globalThis.__inspectCurrentRecovery=db=>{shape={resume:db.prepare('SELECT current_question_id FROM quiz_practice_attempts').get().current_question_id,preferences:db.prepare('SELECT * FROM notification_preferences ORDER BY account_id').all(),deviceColumns:db.prepare('PRAGMA table_info(session_devices)').all().map(r=>r.name),devices:db.prepare('SELECT * FROM session_devices').all(),sessions:db.prepare('SELECT * FROM sessions').all()};};
 const child=dataUrl(`export function spawnSync(script,args){globalThis.__recoveryChildren.push(args);if(args[1]!=='verify')throw Error('No real recovery processes permitted');return{status:0,stdout:Buffer.alloc(0)};}export function execFileSync(){return '${key.toString('base64')}';}`);
 let source=original.replace("const root = resolve(import.meta.dirname, '..');",'const root = '+JSON.stringify(root)+';').replace('const args = process.argv.slice(2);','const args = '+JSON.stringify(['--in',folder,'--expected-target',expectedPath])+';').replace("const target = JSON.parse(readFileSync(join(root, 'wrangler.recovery.json'), 'utf8'));",'const target = '+JSON.stringify(target)+';').replace("'node:child_process'",JSON.stringify(child)).replace("'./backup-order.mjs'",JSON.stringify(new URL('../scripts/backup-order.mjs',import.meta.url).href)).replace('local.exec(sql);','local.exec(sql);globalThis.__inspectCurrentRecovery(local);');
 const priorLog=console.log,priorError=console.error,priorExit=process.exitCode,logs=[],errors=[];console.log=(...v)=>logs.push(v.join(' '));console.error=(...v)=>errors.push(v.join(' '));
 try{await import(dataUrl(source));assert.deepEqual(errors,[]);assert.equal(JSON.parse(logs[0]).mode,'local-dry-run');assert.equal(globalThis.__recoveryChildren.length,1);return shape;}finally{console.log=priorLog;console.error=priorError;process.exitCode=priorExit;key.fill(0);bytes.fill(0);delete globalThis.__inspectCurrentRecovery;delete globalThis.__recoveryChildren;}
}
try{
 for(const data of [old,v38,snapshot]){
  const shape=await recovery(data),version=snapshotVersion(data);
  check('actual v'+version+' recovery upgrades to current schema without inventing preferences or sessions',()=>{assert.deepEqual(shape.deviceColumns,['id','token_hash','created_at','browser','os']);assert.deepEqual(shape.devices,[]);assert.equal(shape.resume,version<38?null:'question-1');assert.deepEqual(JSON.parse(JSON.stringify(shape.sessions)),data.tables.sessions.rows);assert.equal(shape.preferences.length,version<39?0:2);if(version===39)assert.deepEqual(JSON.parse(JSON.stringify(shape.preferences)),restoredShape.preferences.map(r=>({...r})));});
 }
}finally{const resolved=path.resolve(temporary);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('tickminder-preference-recovery-'))fs.rmSync(resolved,{recursive:true,force:true});active.close();}
console.log(JSON.stringify({suite:'notification-preferences-backup',checks,networkRequests:0,realChildProcesses:0,productionWrites:false}));
