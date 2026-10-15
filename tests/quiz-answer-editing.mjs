import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

// Actual route, authorization, answer validation and SQL; no hosted requests.
const sqlite=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
function statement(sql,values=[]){const execute=()=>{const st=sqlite.prepare(sql);return st.columns().length?{results:st.all(...values),meta:{changes:0}}:{results:[],meta:st.run(...values)};};return{bind:(...args)=>statement(sql,args),all:async()=>execute(),first:async()=>execute().results[0]||null,run:async()=>execute(),execute};}
const db={prepare:statement,batch:async statements=>{sqlite.exec('BEGIN');try{const result=statements.map(st=>st.execute());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
let actor;
globalThis.__answerEditing={env:{DB:db},learningDb:()=>db,rows:async(sql,...values)=>sqlite.prepare(sql).all(...values),first:async(sql,...values)=>sqlite.prepare(sql).get(...values)||null,currentBusinessAccount:async()=>actor,pdfBucket:()=>({}),pdfLimits:()=>({total:100000000}),isOwnerAccount:()=>false,operationHash:async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))).toString('hex')};
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-answer-editing-')),runtimePath=path.join(temporary,'runtime.mjs'),runtimeFiles=new Set(['lib/auth.ts','lib/learning-server.ts','lib/owner.ts','lib/learning-operations.ts','lib/pdf-storage.ts']),cache=new Map();
process.once('exit',()=>{const resolved=path.resolve(temporary);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('tickminder-answer-editing-'))fs.rmSync(resolved,{recursive:true,force:true});});
fs.writeFileSync(runtimePath,'export const {env,learningDb,rows,first,currentBusinessAccount,pdfBucket,pdfLimits,isOwnerAccount,operationHash}=globalThis.__answerEditing;');
const stub=pathToFileURL(runtimePath).href;
function compile(file){if(cache.has(file))return cache.get(file);const output=path.join(temporary,file.replace(/\.ts$/,'.mjs')),url=pathToFileURL(output).href;cache.set(file,url);let code=ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;for(const [,spec]of [...code.matchAll(/from ["']([^"']+)["']/g)]){const resolved=spec.startsWith('@/')?spec.slice(2)+'.ts':spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(file),spec+'.ts')):null;const replacement=spec==='cloudflare:workers'||resolved&&runtimeFiles.has(resolved)?stub:resolved?compile(resolved):import.meta.resolve(spec);code=code.replaceAll('"'+spec+'"','"'+replacement+'"').replaceAll("'"+spec+"'","'"+replacement+"'");}fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,code);return url;}
const route=await import(compile('app/api/quiz-practice/route.ts')),server=await import(compile('lib/quiz-server.ts')),quiz=await import(compile('lib/quiz.ts'));
const group='answer-editing-fixture',otherGroup='answer-editing-other',now=new Date().toISOString(),op=()=>crypto.randomUUID();
for(const id of [group,otherGroup])sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,id,now,now);
function account(id,role,name,groupId=group){sqlite.prepare('INSERT INTO accounts(id,group_id,email,name,role,teacher_name,student_name,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,groupId,id+'@example.test',name,role,role==='teacher'?name:null,role==='student'?name:null,now);if(role==='teacher')sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(groupId,name,now);if(role==='student')sqlite.prepare('INSERT INTO students(group_id,name,name_key,created_at) VALUES(?,?,?,?)').run(groupId,name,name.toLowerCase(),now);return{id,email:id+'@example.test',role,name,groupId,teacherName:role==='teacher'?name:null,studentName:role==='student'?name:null};}
const teacher=account('editing-teacher-one','teacher','Editing Teacher'),otherTeacher=account('editing-teacher-other','teacher','Other Teacher'),student=account('editing-student-one','student','Editing Student'),unassigned=account('editing-student-unassigned','student','Unassigned Student'),foreign=account('editing-student-foreign','student','Foreign Student',otherGroup);
sqlite.prepare('INSERT INTO plans(group_id,key,student,subject,subject_id,teacher_name,created_at) VALUES(?,?,?,?,?,?,?)').run(group,'editing-plan',student.name,'Mathematics','mathematics',teacher.name,now);
const classroom=op();sqlite.prepare('INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_by,created_at,updated_at,syllabus_id,subject_id,grade) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(classroom,group,'Editing Form 4','Mathematics',teacher.name,teacher.id,now,now,'spm','mathematics','Form 4');
sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(op(),group,classroom,student.name,now);
const content={...quiz.emptyQuiz(),title:'Assigned answer editing fixture',subject:'Mathematics',exam:'SPM',syllabusId:'spm',subjectId:'mathematics',shuffleQuestions:false,shuffleOptions:false},keys=[];
for(let n=0;n<3;n++){const item=quiz.newQuestion('mcq');item.question.prompt.primary='Fixture question '+(n+1);item.question.options.forEach((option,index)=>option.text.primary='Fixture option '+index);content.questions.push(item.question);keys.push(item.key);}
const quizId=op();actor=teacher;await server.saveQuiz(actor,{id:quizId,revision:0,operationId:op(),content,keys});await server.shareQuiz(actor,{id:quizId,revision:1,operationId:op(),visibility:'public'});
let checks=0;
function check(value,message){assert(value,message);checks++;}
async function post(body,as=student,status=200){actor=as;const response=await route.POST(new Request('https://quiz.test/api/quiz-practice',{method:'POST',headers:{origin:'https://quiz.test','content-type':'application/json'},body:JSON.stringify(body)}));const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));checks++;return value;}
async function getAttempt(id,as=student,status=200){actor=as;const response=await route.GET(new Request('https://quiz.test/api/quiz-practice?attemptId='+id));const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));checks++;return value;}
async function assign(kind,immediate=false){const assignmentId=op();await post({action:'assign',id:assignmentId,quizId,bank:true,classroomId:classroom,immediate,settings:{kind,...(kind==='practice'?{}:{dueAt:'2035-01-01T00:00:00.000Z'})},operationId:op()},teacher);return assignmentId;}
const [first,second,third]=content.questions,correct=keys[0].correctOptionId,wrong=first.options.find(option=>option.id!==correct).id;
const answer=(question,correctAnswer)=>({optionId:correctAnswer?keys.find(key=>key.questionId===question.id).correctOptionId:question.options.find(option=>option.id!==keys.find(key=>key.questionId===question.id).correctOptionId).id});
const mutate=(attempt,action,answers,extra={})=>post({action,attemptId:attempt.id,revision:attempt.revision,answers,operationId:op(),...extra});

for(const kind of ['practice','quiz','homework']){
 const assignmentId=await assign(kind),started=await post({action:'start',assignmentId,immediate:true,operationId:op()});let attempt=started.attempt;
 check(attempt.assignmentId===assignmentId&&attempt.immediate===false,'Teacher feedback setting overrides student start preference: '+kind);
 attempt=(await mutate(attempt,'save',{[first.id]:{optionId:wrong}})).attempt;
 attempt=(await mutate(attempt,'save',{[first.id]:{optionId:correct},[second.id]:answer(second,true)})).attempt;
 check(attempt.status==='in_progress'&&attempt.answers[first.id].optionId===correct,'Saved first answer can be changed before submission: '+kind);
 attempt=(await mutate(attempt,'save',{[first.id]:{optionId:wrong}})).attempt;
 check(attempt.answers[first.id].optionId===wrong&&attempt.answers[second.id].optionId===answer(second,true).optionId,'Returning to a previous answer can change it again without erasing another answer: '+kind);
 check(attempt.checkedQuestionIds.length===0&&attempt.results.length===0,'Autosave does not check or reveal deferred answers: '+kind);
 const fetched=(await getAttempt(attempt.id)).attempt;check(fetched.answers[first.id].optionId===wrong&&fetched.answers[second.id].optionId===answer(second,true).optionId,'Edits persist after reload: '+kind);
 await post({action:'check',attemptId:attempt.id,revision:attempt.revision,answers:{},questionId:first.id,operationId:op()},student,400);
 attempt=(await mutate(attempt,'submit',{[first.id]:{optionId:correct}})).attempt;check(attempt.status==='submitted'&&attempt.answers[first.id].optionId===correct,'Final submission accepts last edits: '+kind);
 const rejected=await post({action:'save',attemptId:attempt.id,revision:attempt.revision,answers:{[first.id]:{optionId:wrong}},operationId:op()},student,409);check(rejected.error==='quiz.practiceFinished','Submitted answers cannot be edited: '+kind);
 check((await getAttempt(attempt.id)).attempt.answers[first.id].optionId===correct,'Rejected post-submission edit leaves recorded answer unchanged: '+kind);
}

const immediateId=await assign('practice',true);let immediate=(await post({action:'start',assignmentId:immediateId,immediate:false,operationId:op()})).attempt;
check(immediate.immediate===true,'Student cannot turn off teacher-enabled correctness checks');
immediate=(await mutate(immediate,'save',{[first.id]:answer(first,false),[second.id]:answer(second,false)})).attempt;
check(immediate.checkedQuestionIds.length===0,'Merely selecting/saving an answer does not lock an unchecked question');
immediate=(await mutate(immediate,'save',{[first.id]:answer(first,true)})).attempt;
immediate=(await mutate(immediate,'check',{[first.id]:answer(first,false)},{questionId:first.id})).attempt;
check(immediate.checkedQuestionIds.length===1&&immediate.checkedQuestionIds[0]===first.id&&immediate.results[0].status==='incorrect','Only the checked question locks when correctness is shown');
check(!immediate.results[0].key,'Immediate correctness does not reveal the answer key');
const lockedRevision=immediate.revision,locked=await post({action:'save',attemptId:immediate.id,revision:immediate.revision,answers:{[first.id]:answer(first,true)},operationId:op()},student,409);check(locked.error==='quiz.practiceLocked','Changing a checked answer is rejected');
check((await getAttempt(immediate.id)).attempt.revision===lockedRevision,'Rejected checked-answer edit leaves the attempt revision unchanged');
immediate=(await mutate(immediate,'save',{[second.id]:answer(second,true),[third.id]:answer(third,false)})).attempt;
immediate=(await mutate(immediate,'save',{[second.id]:answer(second,false),[third.id]:answer(third,true)})).attempt;
check(immediate.answers[first.id].optionId===answer(first,false).optionId&&immediate.answers[second.id].optionId===answer(second,false).optionId&&immediate.answers[third.id].optionId===answer(third,true).optionId,'Other questions remain editable while the checked answer stays unchanged');
await getAttempt(immediate.id,unassigned,404);await getAttempt(immediate.id,foreign,404);await getAttempt(immediate.id,otherTeacher,404);
await post({action:'start',assignmentId:immediateId,operationId:op()},unassigned,404);await post({action:'start',assignmentId:immediateId,operationId:op()},foreign,404);
sqlite.prepare('DELETE FROM classroom_members WHERE classroom_id=? AND student_name=?').run(classroom,student.name);
await post({action:'save',attemptId:immediate.id,revision:immediate.revision,answers:{[third.id]:answer(third,false)},operationId:op()},student,404);
sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(op(),group,classroom,student.name,now);
immediate=(await mutate(immediate,'submit',{})).attempt;check(immediate.status==='submitted'&&immediate.answers[first.id].optionId===answer(first,false).optionId,'Submission preserves the checked answer');
await post({action:'save',attemptId:immediate.id,revision:immediate.revision,answers:{[third.id]:answer(third,false)},operationId:op()},student,409);
await post({action:'assign',id:op(),quizId,bank:true,classroomId:classroom,immediate:true,settings:{kind:'quiz',dueAt:'2035-01-01T00:00:00.000Z'},operationId:op()},teacher,400);
await post({action:'assign',id:op(),quizId,bank:true,studentNames:[student.name],operationId:op()},otherTeacher,403);
check(sqlite.prepare('PRAGMA integrity_check').get().integrity_check==='ok','Database integrity after answer edits and rejected mutations');
sqlite.close();console.log(`PASS quiz answer editing: ${checks} checks; practice/quiz/homework pre-submit edits, checked-question-only locking, teacher feedback policy, submission immutability and assignment access.`);
