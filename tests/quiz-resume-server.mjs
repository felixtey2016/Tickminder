import {createFixtureLoader} from './fixture-loader.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {snapshotVersion,orderedSnapshotTables,historicalInsertTriggers,checkRestoredFolderStructure} from '../scripts/backup-order.mjs';
import {DatabaseSync} from 'node:sqlite';

// Real handlers, grading and SQL, isolated in-memory D1/R2. No hosted requests.
const sqlite=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')&&Number(n.slice(0,4))<=61).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
if(!sqlite.prepare("SELECT 1 FROM pragma_table_info('quizzes') WHERE name='deleted_at'").get())sqlite.exec('ALTER TABLE quizzes ADD COLUMN deleted_at TEXT; ALTER TABLE quizzes ADD COLUMN deleted_by TEXT;');
function statement(sql,values=[]){const execute=()=>{const st=sqlite.prepare(sql);return st.columns().length?{results:st.all(...values),meta:{changes:0}}:{results:[],meta:st.run(...values)};};return {bind:(...v)=>statement(sql,v),all:async()=>execute(),first:async()=>execute().results[0]||null,run:async()=>execute(),execute};}
let beforeBatch=null;const db={prepare:statement,batch:async statements=>{if(beforeBatch){const f=beforeBatch;beforeBatch=null;f();}sqlite.exec('BEGIN');try{const results=statements.map(s=>s.execute());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const objects=new Map(),bucket={get:async k=>objects.has(k)?{body:objects.get(k),size:objects.get(k).length}:null,put:async(k,b)=>objects.set(k,Buffer.from(b))};
let actor=null;globalThis.__quizPracticeRuntime={learningDb:()=>db,rows:async(sql,...values)=>(await db.prepare(sql).bind(...values).all()).results,first:async(sql,...values)=>db.prepare(sql).bind(...values).first(),currentBusinessAccount:async()=>actor,pdfBucket:()=>bucket,pdfLimits:()=>({total:100000000}),isOwnerAccount:a=>a.id==='platform-owner-0001',operationHash:async x=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x)))).toString('hex')};
const stub='data:text/javascript;base64,'+Buffer.from('export const {learningDb,rows,first,currentBusinessAccount,pdfBucket,pdfLimits,OWNER_EMAIL,isOwnerAccount,operationHash}=globalThis.__quizPracticeRuntime;').toString('base64');
const load=createFixtureLoader({runtimeUrl:stub,environmentUrl:'data:text/javascript;base64,'+Buffer.from('export const env={DB:globalThis.__quizPracticeRuntime.learningDb(),BACKUP_EXPORT_TOKEN:"fictional-quiz-resume-backup-token-123456789"};').toString('base64')});
process.on('uncaughtException',error=>{console.error(error.name+': '+error.message);console.error(String(error.stack).split('\n').filter(s=>!s.includes('data:text/')).slice(0,9).join('\n'));process.exit(1);});
const route=(await load('app/api/quiz-practice/route.ts')).module,server=(await load('lib/quiz-server.ts')).module,quiz=(await load('lib/quiz.ts')).module;
const now=new Date().toISOString(),g='practice-group-a',other='practice-group-b';
for(const groupId of [g,other])sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,active,created_at,updated_at) VALUES(?,?,?,1,?,?)').run(groupId,groupId,groupId,now,now);
function account(id,role,name,groupId=g){sqlite.prepare('INSERT INTO accounts(id,email,name,role,group_id,teacher_name,student_name,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,id+'@example.test',name,role,groupId,role==='teacher'?name:null,role==='student'?name:null,now);if(role==='teacher')sqlite.prepare('INSERT INTO teachers(group_id,name,active,created_at) VALUES(?,?,1,?)').run(groupId,name,now);if(role==='student')sqlite.prepare('INSERT INTO students(group_id,name,name_key,active,created_at) VALUES(?,?,?,1,?)').run(groupId,name,name.toLowerCase(),now);return {id,email:id+'@example.test',name,role,groupId,teacherName:role==='teacher'?name:null,studentName:role==='student'?name:null};}
const teacher=account('teacher-alpha-0001','teacher','老师甲'),student=account('student-alpha-0001','student','学生甲'),student2=account('student-beta-00001','student','学生乙'),foreign=account('student-other-001','student','外集团学生',other);
for(const s of [student,student2])sqlite.prepare('INSERT INTO plans(group_id,key,student,subject,teacher_name,duration,active,created_at) VALUES(?,?,?,?,?,1,1,?)').run(g,crypto.randomUUID(),s.studentName,'Mathematics',teacher.teacherName,now);
const classroom='classroom-alpha-01';sqlite.prepare('INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(classroom,g,'中四数学','Mathematics',teacher.teacherName,teacher.id,now,now);for(const s of [student,student2])sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),g,classroom,s.studentName,now);
function fixture(){const c={...quiz.emptyQuiz(),title:'数学练习测试',subject:'Mathematics',exam:'SPM',shuffleQuestions:true,shuffleOptions:true};const keys=[];for(const type of ['mcq','blank','math','written']){const item=quiz.newQuestion(type);item.question.prompt={primary:'测试 '+type,en:''};item.question.options.forEach((o,i)=>{o.text.primary='答案 '+i;});if(type==='blank')item.key.accepted=['Kuala Lumpur','吉隆坡'];if(type==='math'){item.key.accepted=['1/2'];item.key.tolerance=.001;}if(type==='written')item.key.rubric='说明解题步骤';c.questions.push(item.question);keys.push(item.key);}return {c,keys};}
const {c,keys}=fixture(),quizId=crypto.randomUUID();actor=teacher;await server.saveQuiz(actor,{id:quizId,revision:0,operationId:crypto.randomUUID(),content:c,keys});await server.shareQuiz(actor,{id:quizId,revision:1,operationId:crypto.randomUUID(),visibility:'public'});
async function post(data,a=actor){actor=a;const r=await route.POST(new Request('https://quiz.test/api/quiz-practice',{method:'POST',headers:{origin:'https://quiz.test','content-type':'application/json'},body:JSON.stringify(data)}));return {status:r.status,data:await r.json()};}
async function get(query='',a=actor){actor=a;const r=await route.GET(new Request('https://quiz.test/api/quiz-practice'+query));return {status:r.status,data:await r.json()};}
const op=()=>crypto.randomUUID();
const backupRoute=(await load('app/api/backup-export/route.ts')).module;
async function exported(){const response=await backupRoute.GET(new Request('https://quiz.test/api/backup-export',{headers:{authorization:'Bearer fictional-quiz-resume-backup-token-123456789'}}));assert.equal(response.status,200,'Real backup exporter succeeds');return response.json();}
const root=path.resolve(import.meta.dirname,'..'),dataUrl=value=>'data:text/javascript;base64,'+Buffer.from(value).toString('base64');
let secure=fs.readFileSync(path.join(root,'scripts/secure-d1-backup.mjs'),'utf8').replaceAll('\r\n','\n').split('\ntry {\n')[0];
secure=secure.replace("const projectRoot = resolve(import.meta.dirname, '..').toLowerCase();",'const projectRoot = '+JSON.stringify(root)+';').replace("'./backup-order.mjs'",JSON.stringify(new URL('../scripts/backup-order.mjs',import.meta.url).href));
const {restoreInMemory}=await import(dataUrl(secure.replace('return counts;',"return {counts,attempts:db.prepare('SELECT * FROM quiz_practice_attempts').all()};")+'\nexport {restoreInMemory};'));
function restoreLegacyIntoCurrent(snapshot){
 const recovery=new DatabaseSync(':memory:');try{
  for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(name=>name.endsWith('.sql')).sort())recovery.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
  recovery.exec('DELETE FROM tuition_groups; DELETE FROM academic_catalogues;');
  const triggers=historicalInsertTriggers.map(name=>recovery.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name=?").get(name)).filter(Boolean);
  for(const trigger of triggers)recovery.exec('DROP TRIGGER "'+trigger.name+'"');
  for(const [name,table]of orderedSnapshotTables(snapshot.tables)){
   if(['classroom_content_state','parent_notification_runtime'].includes(name))recovery.exec('DELETE FROM "'+name+'"');
   const statement=recovery.prepare('INSERT INTO "'+name+'" ('+table.columns.map(column=>'"'+column+'"').join(',')+') VALUES('+table.columns.map(()=>'?').join(',')+')');
   for(const row of table.rows)statement.run(...table.columns.map(column=>row[column]));
  }
  for(const trigger of triggers)recovery.exec(trigger.sql);checkRestoredFolderStructure(recovery);
  assert.deepEqual(recovery.prepare('PRAGMA foreign_key_check').all(),[]);
  return recovery.prepare('SELECT * FROM quiz_practice_attempts').all();
 }finally{recovery.close();}
}

let checks=0;function check(value,message){assert(value,message);checks++;}
const nativeFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Fictional tests prohibit external requests');};
try{
 let response=await post({action:'start',quizId,bank:true,operationId:op()},student);check(response.status===200,'Existing-schema start remains compatible before additive migration');
 let attempt=response.data.attempt;const first=attempt.content.questions[0],second=attempt.content.questions[1],last=attempt.content.questions.at(-1);
 const answer=question=>question.options.length?{optionId:question.options[0].id}:{text:'Legacy saved answer'};
 const legacyAnswers={[first.id]:answer(first)};sqlite.prepare('UPDATE quiz_practice_attempts SET answers_json=? WHERE id=?').run(JSON.stringify(legacyAnswers),attempt.id);
 const legacySnapshot=await exported();check(snapshotVersion(legacySnapshot)===37,'Pre-position export remains version37');
 const restoredLegacy=restoreInMemory(legacySnapshot);check(!('current_question_id' in restoredLegacy.attempts[0]),'Secure legacy restore retains its historical schema');
 const upgradedLegacy=restoreLegacyIntoCurrent(legacySnapshot);check(upgradedLegacy.length===1&&upgradedLegacy[0].current_question_id===null,'Legacy snapshot inserted into current recovery schema defaults position to NULL');
 check(upgradedLegacy[0].answers_json===JSON.stringify(legacyAnswers),'Legacy recovery preserves saved answers');
 const before=sqlite.prepare('SELECT * FROM quiz_practice_attempts WHERE id=?').get(attempt.id);
 sqlite.exec(fs.readFileSync(new URL('../drizzle/0062_quiz_resume_position.sql',import.meta.url),'utf8'));
 const after=sqlite.prepare('SELECT * FROM quiz_practice_attempts WHERE id=?').get(attempt.id);delete after.current_question_id;check(JSON.stringify(before)===JSON.stringify(after),'Migration preserves every legacy column/value');
 attempt=(await get('?attemptId='+attempt.id,student)).data.attempt;
 check(attempt.currentQuestionId===second.id,'Legacy records resume first unanswered in persisted shuffle order');
 check(attempt.answeredCount===1&&attempt.questionCount===4,'Summary progress counts selected questions');
 const save={action:'save',attemptId:attempt.id,revision:attempt.revision,answers:attempt.answers,currentQuestionId:last.id,operationId:op()};response=await post(save,student);check(response.status===200,'Owner can save navigation position');attempt=response.data.attempt;
 check(attempt.currentQuestionId===last.id,'Returned position matches saved question');check(JSON.stringify(attempt.answers)===JSON.stringify(legacyAnswers),'Navigation save preserves answers');
 check((await get('?attemptId='+attempt.id,student)).data.attempt.currentQuestionId===last.id,'Position persists through fresh request');
 check((await post(save,student)).data.attempt.revision===attempt.revision,'Save replay idempotent');
 check((await post({...save,currentQuestionId:first.id,operationId:op()},student)).status===409,'Stale navigation cannot overwrite current revision');
 check((await post({...save,revision:attempt.revision,currentQuestionId:'unknown-question',operationId:op()},student)).status===400,'Foreign question rejected');
 check((await post({...save,revision:attempt.revision,currentQuestionId:null,operationId:op()},student)).status===400,'Malformed position rejected');
 check((await post({...save,revision:attempt.revision,operationId:op()},student2)).status===404,'Other student cannot save position');
 check((await post({...save,revision:attempt.revision,operationId:op()},teacher)).status===403,'Reviewer cannot save learner position');
 check((await post({...save,revision:attempt.revision,operationId:op()},foreign)).status===404,'Other tenant cannot save position');
 assert.throws(()=>sqlite.prepare('UPDATE quiz_practice_attempts SET order_json=? WHERE id=?').run('{}',attempt.id));checks++;
 const assignmentId=op();check((await post({action:'assign',id:assignmentId,quizId,bank:true,classroomId:classroom,operationId:op()},teacher)).status===200,'Teacher creates actual assignment');
 const assigned=(await post({action:'start',assignmentId,operationId:op()},student)).data.attempt;
 const student2Attempt=(await post({action:'start',quizId,bank:true,operationId:op()},student2)).data.attempt;
 const teacherAttempt=(await post({action:'start',quizId,bank:true,operationId:op()},teacher)).data.attempt;
 let state=(await get('?ownInProgress=1',student)).data;
 check(state.attempts.length===2&&state.attempts.every(a=>a.accountId===student.id),'Own pending includes assigned and self only');check(state.assignments.length===0,'Resume query omits assignment reports');
 state=(await get('?ownInProgress=1&scope=self&quizId='+quizId,student)).data;check(state.attempts.length===1&&state.attempts[0].id===attempt.id,'Self link resumes exact own quiz');
 state=(await get('?ownInProgress=1&scope=assigned',student)).data;check(state.attempts.length===1&&state.attempts[0].id===assigned.id,'Assigned pending scoped correctly');
 state=(await get('?ownInProgress=1',teacher)).data;check(state.attempts.length===1&&state.attempts[0].id===teacherAttempt.id,'Teacher resume never includes reviewed student work');
 state=(await get('?scope=self',teacher)).data;check(state.attempts.some(a=>a.id===student2Attempt.id)&&state.attempts.every(a=>!a.assignmentId),'Teacher self-practice records retain current student visibility');
 state=(await get('?scope=assigned',teacher)).data;check(state.attempts.some(a=>a.id===assigned.id)&&state.attempts.every(a=>a.assignmentId),'Teacher assigned responses separated');
 check((await get('?ownInProgress=1&quizId='+op(),student)).data.attempts.length===0,'Unknown quiz yields no unrelated resume');
 check((await get('?scope=invalid',student)).status===400,'Invalid record scope rejected');check((await get('?ownInProgress=yes',student)).status===400,'Invalid pending query rejected');check((await get('?quizId=x',student)).status===400,'Invalid quiz id rejected');
 beforeBatch=()=>sqlite.prepare('UPDATE quiz_practice_attempts SET revision=revision+1 WHERE id=?').run(attempt.id);
 response=await post({...save,revision:attempt.revision,currentQuestionId:first.id,operationId:op()},student);check(response.status===409,'Concurrent revision guarded atomically');check((await get('?attemptId='+attempt.id,student)).data.attempt.currentQuestionId===last.id,'Race leaves saved position intact');
 const snapshot=await exported();check(snapshotVersion(snapshot)===38,'Current position schema exports as version38');
 const restored=restoreInMemory(snapshot);check(restored.attempts.find(row=>row.id===attempt.id).current_question_id===last.id,'Secure backup roundtrip retains last question');
 check(restored.attempts.find(row=>row.id===attempt.id).answers_json===JSON.stringify(legacyAnswers),'Secure backup roundtrip retains answers');
 const damaged=structuredClone(snapshot);damaged.tables.quiz_practice_attempts.rows.find(row=>row.id===attempt.id).current_question_id='unknown-question';assert.throws(()=>restoreInMemory(damaged),/quiz resume position/);checks++;
 const mismatched=structuredClone(snapshot);mismatched.format='timelyo-d1-v37';assert.throws(()=>restoreInMemory(mismatched),/Schema mismatch/);checks++;
 check(sqlite.prepare('PRAGMA foreign_key_check').all().length===0,'Foreign key integrity');
 console.log(JSON.stringify({suite:'quiz-resume-server',passed:checks,scope:'Fictional SQLite, additive migration, permission and revision guards, no hosted requests'}));
}finally{globalThis.fetch=nativeFetch;sqlite.close();}
