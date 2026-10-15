import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {checkRestoredFolderStructure,expectedSnapshotTables,orderedSnapshotTables,snapshotVersion} from '../scripts/backup-order.mjs';

globalThis.fetch=async()=>{throw Error('Network is forbidden in discard backup tests');};
const root=fileURLToPath(new URL('../',import.meta.url)),migrations=fs.readdirSync(path.join(root,'drizzle')).filter(file=>file.endsWith('.sql')).sort();
const sql=file=>fs.readFileSync(path.join(root,'drizzle',file),'utf8');
function database(max){const db=new DatabaseSync(':memory:');for(const file of migrations.filter(file=>Number(file.slice(0,4))<=max))db.exec(sql(file));return db;}
const now='2032-06-01T00:00:00.000Z',discarded='2032-06-01T00:02:00.000Z',group='next-genn-edu';
const question={id:'question-1',type:'mcq',points:1,options:[{id:'option-a',text:{primary:'A',en:''},imageId:null},{id:'option-b',text:{primary:'B',en:''},imageId:null}],extraImageIds:[],imageId:null,prompt:{primary:'Fictional question',en:''},difficulty:'easy',sourceId:'',chapter:'',level:''};
const content={schemaVersion:1,title:'Fictional Backup Quiz',instructions:'',subject:'Mathematics',exam:'SPM',year:null,region:'',paper:'',difficulty:'easy',primaryLanguage:'en',timeLimitSeconds:60,shuffleQuestions:false,shuffleOptions:false,questions:[question]};
const key={questionId:question.id,mode:'choice',correctOptionId:'option-a',accepted:[],caseSensitive:false,tolerance:0,unit:'',rubric:'',explanation:''};
function fixture(db){
 for(const [id,role]of [['fixture-owner','teacher'],['fixture-learner','student']])db.prepare('INSERT INTO accounts(id,group_id,email,name,role,created_at) VALUES(?,?,?,?,?,?)').run(id,group,id+'@example.test',id,role,now);
 db.prepare('INSERT INTO quizzes(id,group_id,owner_id,title,subject,exam,revision,question_count,total_score,time_limit_seconds,created_at,updated_at) VALUES(?,?,?,?,?,?,1,1,1,60,?,?)').run('fixture-quiz',group,'fixture-owner',content.title,content.subject,content.exam,now,now);
 db.prepare('INSERT INTO quiz_versions(id,group_id,quiz_id,revision,content_json,actor_id,operation_id,request_hash,created_at) VALUES(?,?,?,1,?,?,?,?,?)').run('fixture-version',group,'fixture-quiz',JSON.stringify(content),'fixture-owner','fixture-version-operation-0001','a'.repeat(64),now);
 db.prepare('INSERT INTO quiz_answer_keys(version_id,group_id,answers_json) VALUES(?,?,?)').run('fixture-version',group,JSON.stringify([key]));
 db.prepare('INSERT INTO quiz_practice_attempts(id,group_id,account_id,quiz_id,version_id,immediate,status,order_json,answers_json,started_at,deadline_at,updated_at,total_score,operation_id,request_hash) VALUES(?,?,?,?,?,0,\'in_progress\',?,?,?,?,?,1,?,?)').run('fixture-attempt',group,'fixture-learner','fixture-quiz','fixture-version',JSON.stringify({questionIds:['question-1'],options:{'question-1':['option-a','option-b']}}),JSON.stringify({'question-1':{optionId:'option-b'}}),now,'2032-06-01T00:01:00.000Z',now,'fixture-attempt-operation-0001','b'.repeat(64));
}
const exportTables=(db,version)=>Object.fromEntries(expectedSnapshotTables(version).map(name=>[name,{columns:db.prepare(`PRAGMA table_info("${name}")`).all().map(row=>row.name),rows:db.prepare(`SELECT * FROM "${name}"`).all()}]));
function replay(snapshot,max){const db=database(max);db.exec('DELETE FROM academic_catalogues;DELETE FROM tuition_groups;');for(const [name,table]of orderedSnapshotTables(snapshot.tables)){const insert=db.prepare(`INSERT INTO "${name}"(${table.columns.map(column=>'"'+column+'"').join(',')}) VALUES(${table.columns.map(()=>'?').join(',')})`);for(const row of table.rows)insert.run(...table.columns.map(column=>row[column]));}checkRestoredFolderStructure(db);return db;}
let checks=0;const check=fn=>{fn();checks++;};

// Invoke the real secure backup restore function without its command-line/DPAPI
// wrapper, so both snapshot schema versions exercise the actual migration map.
let secureSource=fs.readFileSync(path.join(root,'scripts/secure-d1-backup.mjs'),'utf8').split('\ntry {\n')[0];
secureSource=secureSource.replace("const projectRoot = resolve(import.meta.dirname, '..').toLowerCase();",'const projectRoot = '+JSON.stringify(path.resolve(root).toLowerCase())+';').replace("'./backup-order.mjs'",JSON.stringify(new URL('../scripts/backup-order.mjs',import.meta.url).href));
const {restoreInMemory}=await import('data:text/javascript;base64,'+Buffer.from(secureSource+'\nexport {restoreInMemory};').toString('base64'));
const old=database(29);fixture(old);const original=old.prepare('SELECT * FROM quiz_practice_attempts').get(),snapshot18={format:'timelyo-d1-v18',tables:exportTables(old,18)};
check(()=>assert.equal(snapshotVersion(snapshot18),18));
check(()=>assert.equal(snapshot18.tables.quiz_practice_attempts.columns.includes('discarded_at'),false));
check(()=>assert.equal(restoreInMemory(snapshot18).quiz_practice_attempts,1,'real secure v18 restore map remains usable'));
const legacyReplay=replay(snapshot18,30);
check(()=>assert.equal(legacyReplay.prepare('SELECT discarded_at FROM quiz_practice_attempts').get().discarded_at,null,'restoring v18 into current schema defaults new metadata to null'));
check(()=>assert.deepEqual(Object.fromEntries(Object.keys(original).map(key=>[key,legacyReplay.prepare('SELECT * FROM quiz_practice_attempts').get()[key]])),{...original}));legacyReplay.close();

old.exec(sql('0030_quiz_practice_discard.sql'));
check(()=>assert.equal(old.prepare('SELECT discarded_at FROM quiz_practice_attempts').get().discarded_at,null));
check(()=>assert.deepEqual(Object.fromEntries(Object.keys(original).map(key=>[key,old.prepare('SELECT * FROM quiz_practice_attempts').get()[key]])),{...original},'additive migration preserves every old field'));
old.prepare('UPDATE quiz_practice_attempts SET discarded_at=?,revision=revision+1,updated_at=? WHERE id=?').run(discarded,discarded,'fixture-attempt');
old.prepare('INSERT INTO quiz_practice_operations(id,group_id,actor_id,record_id,kind,request_hash,created_at) VALUES(?,?,?,?,?,?,?)').run('fixture-discard-operation',group,'fixture-learner','fixture-attempt','discard','c'.repeat(64),discarded);
old.prepare('INSERT INTO quiz_practice_events(id,group_id,attempt_id,actor_id,action,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?)').run('fixture-discard-event',group,'fixture-attempt','fixture-learner','discard',JSON.stringify({revision:1}),JSON.stringify({discardedAt:discarded}),discarded);
const snapshot19={format:'timelyo-d1-v19',tables:exportTables(old,19)};
check(()=>assert.equal(snapshotVersion(snapshot19),19));
check(()=>assert.equal(snapshot19.tables.quiz_practice_attempts.columns.includes('discarded_at'),true));
check(()=>assert.equal(Object.keys(snapshot19.tables).length,53));
check(()=>assert.deepEqual(expectedSnapshotTables(19),expectedSnapshotTables(18)));
check(()=>assert.equal(restoreInMemory(snapshot19).quiz_practice_attempts,1,'real secure v19 restore includes migration 0030'));
const restored=replay(snapshot19,30);
for(const table of ['quiz_practice_attempts','quiz_practice_operations','quiz_practice_events','quiz_versions','quiz_answer_keys'])check(()=>assert.deepEqual(restored.prepare(`SELECT * FROM "${table}"`).all(),old.prepare(`SELECT * FROM "${table}"`).all()));
check(()=>assert.equal(restored.prepare('SELECT status FROM quiz_practice_attempts').get().status,'in_progress','expired but discarded practice does not become a submitted homework result'));
check(()=>assert.equal(restored.prepare('SELECT answers_json FROM quiz_practice_attempts').get().answers_json,original.answers_json));
restored.prepare('INSERT INTO quiz_practice_assignments(id,group_id,quiz_id,version_id,created_by,title,subject,created_at,operation_id,request_hash) VALUES(?,?,?,?,?,?,?,?,?,?)').run('fixture-assigned',group,'fixture-quiz','fixture-version','fixture-owner',content.title,content.subject,now,'fixture-assignment-operation','d'.repeat(64));
restored.prepare('INSERT INTO quiz_practice_recipients(assignment_id,group_id,student_name) VALUES(?,?,?)').run('fixture-assigned',group,'Fictional Student');
const assigned={...restored.prepare('SELECT * FROM quiz_practice_attempts').get(),id:'fixture-assigned-attempt',assignment_id:'fixture-assigned',student_name:'Fictional Student',operation_id:'fixture-assigned-attempt-operation'};
const columns=Object.keys(assigned);restored.prepare(`INSERT INTO quiz_practice_attempts(${columns.map(value=>'"'+value+'"').join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(key=>assigned[key]));
check(()=>assert.throws(()=>checkRestoredFolderStructure(restored),/discarded quiz/,'assigned attempts cannot be discarded even in a malformed snapshot'));
restored.prepare('DELETE FROM quiz_practice_attempts WHERE id=?').run('fixture-assigned-attempt');
restored.prepare('DELETE FROM quiz_practice_recipients WHERE assignment_id=?').run('fixture-assigned');
restored.prepare('DELETE FROM quiz_practice_assignments WHERE id=?').run('fixture-assigned');
restored.prepare('UPDATE quiz_practice_attempts SET discarded_at=?').run('2032');
check(()=>assert.throws(()=>checkRestoredFolderStructure(restored),/discarded quiz/,'discard timestamp must be canonical ISO'));
restored.prepare('UPDATE quiz_practice_attempts SET discarded_at=?').run('invalid date');
check(()=>assert.throws(()=>checkRestoredFolderStructure(restored),/discarded quiz/));
restored.prepare('UPDATE quiz_practice_attempts SET discarded_at=?,status=\'submitted\',submitted_at=?').run(discarded,discarded);
check(()=>assert.throws(()=>checkRestoredFolderStructure(restored),/discarded quiz/));
restored.close();

// Run the actual export route before and after the additive column migration.
let routeSource=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/backup-export/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const token='fictional-discard-backup-token-with-thirty-two-characters',url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
globalThis.__discardBackupDatabase=old;
const statement=(sql,values=[])=>{const execute=()=>{const result=globalThis.__discardBackupDatabase.prepare(sql);return result.columns().length?{results:result.all(...values),meta:{changes:0}}:{results:[],meta:result.run(...values)};};return {bind:(...next)=>statement(sql,next),first:async()=>execute().results[0]||null,all:async()=>execute(),run:async()=>execute(),execute};};
globalThis.__discardBackupD1={prepare:statement,batch:async statements=>statements.map(item=>item.execute())};
const stub=url(`export const env={BACKUP_EXPORT_TOKEN:${JSON.stringify(token)}};export const learningDb=()=>globalThis.__discardBackupD1;export const pdfBucket=()=>({});`);
routeSource=routeSource.replaceAll('"cloudflare:workers"',JSON.stringify(stub)).replaceAll('"@/lib/learning-server"',JSON.stringify(stub)).replaceAll('"@/lib/pdf-storage"',JSON.stringify(stub));
const route=await import(url(routeSource)),request=()=>new Request('https://fictional.example.test/api/backup-export',{headers:{authorization:'Bearer '+token}});
let response=await route.GET(request()),payload=await response.json();
check(()=>assert.equal(response.status,200));check(()=>assert.equal(payload.format,'timelyo-d1-v19'));check(()=>assert.equal(payload.tables.quiz_practice_attempts.rows[0].discarded_at,discarded));
check(()=>assert.equal(payload.tables.quiz_practice_events.rows[0].action,'discard'));check(()=>assert.equal(payload.tables.quiz_practice_operations.rows[0].kind,'discard'));
const beforeMigration=database(29);fixture(beforeMigration);globalThis.__discardBackupDatabase=beforeMigration;
response=await route.GET(request());payload=await response.json();
check(()=>assert.equal(response.status,200));check(()=>assert.equal(payload.format,'timelyo-d1-v18'));check(()=>assert.equal(payload.tables.quiz_practice_attempts.columns.includes('discarded_at'),false));
beforeMigration.close();old.close();
console.log(JSON.stringify({suite:'quiz-discard-backup',checks,network:'disabled',database:'in-memory',coverage:'v18/v19 real export and secure restore map, additive column, retained answers/version/keys/events/operations, malformed discard rejection'}));
