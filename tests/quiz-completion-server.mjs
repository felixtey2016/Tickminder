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
let beforeBatch=null;const db={prepare:statement,batch:async statements=>{const hook=beforeBatch;beforeBatch=null;if(hook)await hook();sqlite.exec('BEGIN');try{const result=statements.map(st=>st.execute());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
let actor;
globalThis.__completionRules={env:{DB:db},learningDb:()=>db,rows:async(sql,...values)=>sqlite.prepare(sql).all(...values),first:async(sql,...values)=>sqlite.prepare(sql).get(...values)||null,currentBusinessAccount:async()=>actor,pdfBucket:()=>({}),pdfLimits:()=>({total:100000000}),isOwnerAccount:()=>false,operationHash:async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))).toString('hex')};
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-completion-rules-')),runtimePath=path.join(temporary,'runtime.mjs'),runtimeFiles=new Set(['lib/auth.ts','lib/learning-server.ts','lib/owner.ts','lib/learning-operations.ts','lib/pdf-storage.ts']),cache=new Map();
process.once('exit',()=>{const resolved=path.resolve(temporary);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('tickminder-completion-rules-'))fs.rmSync(resolved,{recursive:true,force:true});});
fs.writeFileSync(runtimePath,'export const {env,learningDb,rows,first,currentBusinessAccount,pdfBucket,pdfLimits,OWNER_EMAIL,isOwnerAccount,operationHash}=globalThis.__completionRules;');
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

// Completion uses real handlers, grading, guards and persisted revision state.
async function reject(body,key='quiz.allAnswersRequired',as=student,status=400){const rejected=await post(body,as,status);check(rejected.error===key,'Expected rejection '+key);return rejected;}
const change=(attempt,action,answers={},extra={})=>({action,attemptId:attempt.id,revision:attempt.revision,answers,operationId:op(),...extra});
const row=id=>sqlite.prepare('SELECT * FROM quiz_practice_attempts WHERE id=?').get(id);
const completeChoices=Object.fromEntries(content.questions.map(question=>[question.id,answer(question,true)]));
const startSelf=(quizSource=quizId,immediate=false,as=student)=>post({action:'start',quizId:quizSource,bank:true,immediate,operationId:op()},as).then(result=>result.attempt);
let partial=await startSelf();
partial=(await post(change(partial,'save',{[first.id]:answer(first,true)}))).attempt;
const partialBefore=row(partial.id);
await reject(change(partial,'submit'));
check(JSON.stringify(row(partial.id))===JSON.stringify(partialBefore),'Rejected incomplete self submission does not mutate persisted state');
const premature=await post(change(partial,'submit',completeChoices,{automatic:true}));
check(premature.attempt.status==='in_progress'&&premature.attempt.revision===partial.revision,'Early automatic request cannot end a live attempt or insert incoming answers');
await reject(change(partial,'save',{}, {deferCompletion:'yes'}),'quiz.invalidFields');
const completing=change(partial,'save',completeChoices);
partial=(await post(completing)).attempt;
check(partial.status==='submitted'&&partial.submittedAt&&partial.results.length===3,'Final saved answer automatically completes self practice');
check(partial.score===3&&partial.answersVisible,'Completed self practice shows final results');
const revision=partial.revision;
check((await post(completing)).attempt.revision===revision,'Automatic completion retry is idempotent');
const completionEvent=sqlite.prepare('SELECT after_json FROM quiz_practice_events WHERE id=?').get(completing.operationId);
check(JSON.parse(completionEvent.after_json).autoCompleted===true,'Completion is recorded in the save audit event');
await reject(change(partial,'save',{}),'quiz.practiceFinished',student,409);

// Every current role can complete its own exercise; no reviewer may finish it.
const admin=account('completion-admin-one','admin','Completion Admin');
for(const as of [teacher,admin]){let own=await startSelf(quizId,false,as);own=(await post(change(own,'save',completeChoices),as)).attempt;check(own.status==='submitted'&&own.canAnswer,'Own self practice completes for '+as.role);}
let reviewTarget=await startSelf();
await reject(change(reviewTarget,'save',completeChoices),'quiz.forbidden',teacher,403);
await reject(change(reviewTarget,'submit',completeChoices),'quiz.forbidden',admin,403);
await getAttempt(reviewTarget.id,foreign,404);

// All assigned kinds stay editable until a complete, explicit submission.
for(const kind of ['practice','quiz','homework']){
 const assignmentId=await assign(kind);let assigned=(await post({action:'start',assignmentId,operationId:op()})).attempt;
 await reject(change(assigned,'submit',{[first.id]:answer(first,true)}));
 check(row(assigned.id).answers_json==='{}'&&row(assigned.id).revision===1,'Partial assigned submit is atomic: '+kind);
 assigned=(await post(change(assigned,'save',completeChoices))).attempt;
 check(assigned.status==='in_progress'&&assigned.results.length===0,'Full assigned autosave does not submit or release keys: '+kind);
 assigned=(await post(change(assigned,'save',{[first.id]:answer(first,false)}))).attempt;
 check(assigned.answers[first.id].optionId===answer(first,false).optionId,'Assigned answers remain editable before submission: '+kind);
 assigned=(await post(change(assigned,'submit'))).attempt;
 check(assigned.status==='submitted'&&assigned.submissionReason==='student','Complete assigned work requires explicit submit: '+kind);
}

// Build a paper spanning every supported answer kind, including manual marking.
const mixed=structuredClone(content),mixedKeys=structuredClone(keys);mixed.title='Mixed answer completion fixture';
for(const type of ['blank','math','written','true_false']){const item=quiz.newQuestion(type);item.question.prompt.primary='Completion '+type;item.question.options.forEach((option,index)=>option.text.primary='Choice '+index);if(type==='blank')item.key.accepted=['alpha'];if(type==='math')item.key.accepted=['42'];if(type==='written')item.key.rubric='A fictional explanation';mixed.questions.push(item.question);mixedKeys.push(item.key);}
const mixedId=op();actor=teacher;await server.saveQuiz(actor,{id:mixedId,revision:0,operationId:op(),content:mixed,keys:mixedKeys});await server.shareQuiz(actor,{id:mixedId,revision:1,operationId:op(),visibility:'public'});
const allMixed=Object.fromEntries(mixed.questions.map((question,index)=>[question.id,question.type==='mcq'||question.type==='true_false'?{optionId:mixedKeys[index].correctOptionId}:{text:question.type==='blank'?'alpha':question.type==='math'?'42':'First sentence. Second sentence.'}]));
const blank=mixed.questions.find(question=>question.type==='blank'),math=mixed.questions.find(question=>question.type==='math'),written=mixed.questions.find(question=>question.type==='written');
let mixedAttempt=await startSelf(mixedId);
await reject(change(mixedAttempt,'submit',{...allMixed,[blank.id]:{text:' \n  \t '}}));
await reject(change(mixedAttempt,'submit',{...allMixed,[math.id]:{unit:'cm'}}));
await reject(change(mixedAttempt,'submit',{...allMixed,[written.id]:{text:'   '}}));
mixedAttempt=(await post(change(mixedAttempt,'save',allMixed,{deferCompletion:true}))).attempt;
check(mixedAttempt.status==='in_progress'&&mixedAttempt.results.length===0,'Saving a still-focused complete textarea does not finish or grade the paper');
mixedAttempt=(await post(change(mixedAttempt,'save',{[written.id]:{text:'A longer final response.'}},{deferCompletion:true}))).attempt;
check(mixedAttempt.status==='in_progress'&&mixedAttempt.answers[written.id].text==='A longer final response.','Continued text editing stays writable after an autosave pause');
mixedAttempt=(await post(change(mixedAttempt,'save',{}))).attempt;
check(mixedAttempt.status==='submitted'&&mixedAttempt.pendingManual===1&&mixedAttempt.results.length===mixed.questions.length,'Blur flush automatically completes every answer kind without guessing manual grades');

// Immediate feedback must be requested for every objective answer before finish.
let immediate=await startSelf(mixedId,true);
immediate=(await post(change(immediate,'save',allMixed))).attempt;
check(immediate.status==='in_progress'&&immediate.checkedQuestionIds.length===0,'Answering every immediate-feedback question alone does not bypass checks');
const objective=mixedKeys.filter(key=>key.mode!=='manual');
for(let index=0;index<objective.length;index++){
 immediate=(await post(change(immediate,'check',{}, {questionId:objective[index].questionId}))).attempt;
 check(immediate.status===(index===objective.length-1?'submitted':'in_progress'),'Immediate self completion waits for final objective check '+index);
 if(index<objective.length-1)check(immediate.results.every(result=>!result.key),'Live immediate feedback does not release answer keys');
}
check(immediate.pendingManual===1,'Final immediate self completion retains manual marking');
let manualLast=await startSelf(mixedId,true);
const withoutManual={...allMixed};delete withoutManual[written.id];
manualLast=(await post(change(manualLast,'save',withoutManual))).attempt;
for(const key of objective)manualLast=(await post(change(manualLast,'check',{}, {questionId:key.questionId}))).attempt;
check(manualLast.status==='in_progress','Completed objective checks do not finish an unanswered manual question');
manualLast=(await post(change(manualLast,'save',{[written.id]:{text:'Still typing'}},{deferCompletion:true}))).attempt;
check(manualLast.status==='in_progress','Manual last question can autosave without accidental completion');
manualLast=(await post(change(manualLast,'save',{}))).attempt;
check(manualLast.status==='submitted','Manual last question finishes on nondeferred flush');

// A timed-out or closed assignment still finalises only previously saved answers.
const RealDate=Date;let clock=RealDate.now();globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
const timedId=op();actor=teacher;await server.saveQuiz(actor,{id:timedId,revision:0,operationId:op(),content:{...content,timeLimitSeconds:60},keys});await server.shareQuiz(actor,{id:timedId,revision:1,operationId:op(),visibility:'public'});
let timed=await startSelf(timedId);timed=(await post(change(timed,'save',{[first.id]:answer(first,true)}))).attempt;clock=Date.parse(timed.deadlineAt)+1;
timed=(await post(change(timed,'submit',completeChoices,{automatic:true}))).attempt;
check(timed.status==='submitted'&&timed.submissionReason==='timer','Real timer expires incomplete self practice');
check(Object.keys(timed.answers).length===1&&timed.submittedAt===timed.deadlineAt,'Expired request ignores late incoming answers and retains effective timer time');
const dueAt=new Date(clock+60000).toISOString(),dueAssignment=op();await post({action:'assign',id:dueAssignment,quizId,bank:true,classroomId:classroom,settings:{kind:'homework',dueAt,timeLimitSeconds:null},operationId:op()},teacher);let due=(await post({action:'start',assignmentId:dueAssignment,operationId:op()})).attempt;clock+=60001;due=(await post(change(due,'submit',completeChoices))).attempt;
check(due.status==='submitted'&&due.submissionReason==='deadline'&&Object.keys(due.answers).length===0,'Actual deadline may finalise unanswered assigned work but never accept late answers');
globalThis.Date=RealDate;

// Auto-completion retains the same CAS, discard and live-authority guards.
let discarded=await startSelf();beforeBatch=async()=>{await post({action:'discard',attemptId:discarded.id,revision:discarded.revision,operationId:op()});};await reject(change(discarded,'save',completeChoices),'quiz.conflict',student,409);check(row(discarded.id).discarded_at&&row(discarded.id).status==='in_progress','In-flight full answer save cannot revive discarded attempt');
let disabled=await startSelf();beforeBatch=()=>sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,student.id);await reject(change(disabled,'save',completeChoices),'quiz.conflict',student,409);check(row(disabled.id).status==='in_progress'&&row(disabled.id).revision===1,'Live authority blocks auto-completion after account is disabled');sqlite.prepare('UPDATE accounts SET disabled_at=NULL WHERE id=?').run(student.id);
let conflicted=await startSelf();beforeBatch=async()=>{await post(change(conflicted,'save',{[first.id]:answer(first,false)}));};await reject(change(conflicted,'save',completeChoices),'quiz.conflict',student,409);check(row(conflicted.id).status==='in_progress'&&row(conflicted.id).revision===2,'Concurrent partial save defeats stale auto-completion');
check(sqlite.prepare('PRAGMA foreign_key_check').all().length===0,'Completion preserves foreign keys');check(sqlite.prepare('PRAGMA integrity_check').get().integrity_check==='ok','Completion preserves SQLite integrity');
console.log(JSON.stringify({suite:'quiz-completion-server',passed:checks,scope:'Fictional in-memory API, no hosted requests or production writes.'},null,2));sqlite.close();
