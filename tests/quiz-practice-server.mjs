import {createFixtureLoader} from './fixture-loader.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

// Real handlers, grading and SQL, isolated in-memory D1/R2. No hosted requests.
const sqlite=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
if(!sqlite.prepare("SELECT 1 FROM pragma_table_info('quizzes') WHERE name='deleted_at'").get())sqlite.exec('ALTER TABLE quizzes ADD COLUMN deleted_at TEXT; ALTER TABLE quizzes ADD COLUMN deleted_by TEXT;');
function statement(sql,values=[]){const execute=()=>{const st=sqlite.prepare(sql);return st.columns().length?{results:st.all(...values),meta:{changes:0}}:{results:[],meta:st.run(...values)};};return {bind:(...v)=>statement(sql,v),all:async()=>execute(),first:async()=>execute().results[0]||null,run:async()=>execute(),execute};}
let beforeBatch=null;const db={prepare:statement,batch:async statements=>{if(beforeBatch){const f=beforeBatch;beforeBatch=null;f();}sqlite.exec('BEGIN');try{const results=statements.map(s=>s.execute());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const objects=new Map(),bucket={get:async k=>objects.has(k)?{body:objects.get(k),size:objects.get(k).length}:null,put:async(k,b)=>objects.set(k,Buffer.from(b))};
let actor=null;globalThis.__quizPracticeRuntime={learningDb:()=>db,rows:async(sql,...values)=>(await db.prepare(sql).bind(...values).all()).results,first:async(sql,...values)=>db.prepare(sql).bind(...values).first(),currentBusinessAccount:async()=>actor?.role==='learner'?null:actor,currentIdentity:async()=>actor?{account:actor,local:null,google:null}:null,pdfBucket:()=>bucket,pdfLimits:()=>({total:100000000}),isOwnerAccount:a=>a.id==='platform-owner-0001',operationHash:async x=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x)))).toString('hex')};
const stub='data:text/javascript;base64,'+Buffer.from('export const {learningDb,rows,first,currentBusinessAccount,currentIdentity,pdfBucket,pdfLimits,OWNER_EMAIL,isOwnerAccount,operationHash}=globalThis.__quizPracticeRuntime;').toString('base64'),cache=new Map();
globalThis.__quizPracticeRuntime.OWNER_EMAIL='platform-owner@example.test';
const runtimeFiles=new Set(['lib/auth.ts','lib/learning-server.ts','lib/owner.ts','lib/learning-operations.ts','lib/pdf-storage.ts']);
const load=createFixtureLoader({runtimeUrl:stub,environmentUrl:'data:text/javascript,export const env={DB:globalThis.__quizPracticeRuntime.learningDb(),get TICKLEARN_FREE_UNLIMITED(){return globalThis.__quizPracticeRuntime.unlimited}};'});
process.on('uncaughtException',error=>{console.error(error.name+': '+error.message);console.error(String(error.stack).split('\n').filter(s=>!s.includes('data:text/')).slice(0,9).join('\n'));process.exit(1);});
const route=(await load('app/api/quiz-practice/route.ts')).module,server=(await load('lib/quiz-server.ts')).module,quiz=(await load('lib/quiz.ts')).module,images=(await load('app/api/quiz-images/route.ts')).module,practice=(await load('lib/quiz-practice.ts')).module,catalogRoute=(await load('app/api/quizzes/route.ts')).module;
const now=new Date().toISOString(),g='practice-group-a',other='practice-group-b';
for(const groupId of [g,other])sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,active,created_at,updated_at) VALUES(?,?,?,1,?,?)').run(groupId,groupId,groupId,now,now);
function account(id,role,name,groupId=g){sqlite.prepare('INSERT INTO accounts(id,email,name,role,group_id,teacher_name,student_name,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,id+'@example.test',name,role,groupId,role==='teacher'?name:null,role==='student'?name:null,now);if(role==='teacher')sqlite.prepare('INSERT INTO teachers(group_id,name,active,created_at) VALUES(?,?,1,?)').run(groupId,name,now);if(role==='student')sqlite.prepare('INSERT INTO students(group_id,name,name_key,active,created_at) VALUES(?,?,?,1,?)').run(groupId,name,name.toLowerCase(),now);return {id,email:id+'@example.test',name,role,groupId,teacherName:role==='teacher'?name:null,studentName:role==='student'?name:null};}
const teacher=account('teacher-alpha-0001','teacher','老师甲'),teacher2=account('teacher-beta-00001','teacher','老师乙'),admin=account('admin-alpha-00001','admin','管理员'),student=account('student-alpha-0001','student','学生甲'),student2=account('student-beta-00001','student','学生乙'),foreign=account('student-other-001','student','外集团学生',other);
for(const s of [student,student2])sqlite.prepare('INSERT INTO plans(group_id,key,student,subject,teacher_name,duration,active,created_at) VALUES(?,?,?,?,?,1,1,?)').run(g,crypto.randomUUID(),s.studentName,'Mathematics',teacher.teacherName,now);
const classroom='classroom-alpha-01';sqlite.prepare('INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(classroom,g,'中四数学','Mathematics',teacher.teacherName,teacher.id,now,now);for(const s of [student,student2])sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),g,classroom,s.studentName,now);
function fixture(){const c={...quiz.emptyQuiz(),title:'数学练习测试',subject:'Mathematics',exam:'SPM',shuffleQuestions:true,shuffleOptions:true};const keys=[];for(const type of ['mcq','blank','math','written']){const item=quiz.newQuestion(type);item.question.prompt={primary:'测试 '+type,en:''};item.question.options.forEach((o,i)=>{o.text.primary='答案 '+i;});if(type==='blank')item.key.accepted=['Kuala Lumpur','吉隆坡'];if(type==='math'){item.key.accepted=['1/2'];item.key.tolerance=.001;}if(type==='written')item.key.rubric='说明解题步骤';c.questions.push(item.question);keys.push(item.key);}return {c,keys};}
const {c,keys}=fixture(),quizId=crypto.randomUUID();
const choiceSolution='1. Compare the choices.\n2. Select the verified result.';
const unopenedSolution='1. Review the source phrase.\n2. Match the exact location.';
keys[0].explanation=choiceSolution;
keys[1].explanation=unopenedSolution;
actor=teacher;await server.saveQuiz(actor,{id:quizId,revision:0,operationId:crypto.randomUUID(),content:c,keys});await server.shareQuiz(actor,{id:quizId,revision:1,operationId:crypto.randomUUID(),visibility:'public'});
async function post(data,a=actor){actor=a;const r=await route.POST(new Request('https://quiz.test/api/quiz-practice',{method:'POST',headers:{origin:'https://quiz.test','content-type':'application/json'},body:JSON.stringify(data)}));return {status:r.status,data:await r.json()};}
async function get(query='',a=actor){actor=a;const r=await route.GET(new Request('https://quiz.test/api/quiz-practice'+query));return {status:r.status,data:await r.json()};}
const op=()=>crypto.randomUUID();
async function catalogPost(data,a){actor=a;const r=await catalogRoute.POST(new Request('https://quiz.test/api/quizzes',{method:'POST',headers:{origin:'https://quiz.test','content-type':'application/json'},body:JSON.stringify(data)}));return {status:r.status,data:await r.json()};}
async function catalogGet(query,a){actor=a;const r=await catalogRoute.GET(new Request('https://quiz.test/api/quizzes'+query));return {status:r.status,data:await r.json()};}
assert.equal((await catalogGet('?bank=1&facets=1',student)).status,200);assert.equal((await catalogGet('?bank=1&facets=1',student)).data.facets.maintenanceImport,false);assert.equal((await catalogGet('?bank=1&id='+quizId,student)).status,403,'students cannot request keys');assert.equal((await catalogGet('?bank=1&id='+quizId+'&preview=1',student)).data.keys,undefined);assert.equal((await catalogGet('',student)).status,403,'students cannot request mine collection');
const importBody={action:'maintenanceImport',id:op(),revision:0,operationId:op(),content:{...c,title:'教师 ZIP 导入'},keys,sourceKey:'b'.repeat(64)};let r=await catalogPost(importBody,teacher);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal((await catalogPost({...importBody,id:op(),operationId:op()},teacher)).data.id,importBody.id,'same owner source dedup');const secondImport=await catalogPost({...importBody,id:op(),operationId:op()},teacher2);assert.equal(secondImport.status,200,'different owner source identity isolated');assert.notEqual(secondImport.data.id,importBody.id);assert.equal((await catalogPost({...importBody,id:op(),operationId:op()},student)).status,403);assert.equal((await catalogPost({action:'save',id:importBody.id,revision:1,operationId:op(),content:{...c,title:'更新自己的导入测验'},keys},teacher)).status,200);assert.equal((await catalogPost({action:'save',id:importBody.id,revision:2,operationId:op(),content:c,keys},teacher2)).status,404);
const platform={...c,bankKind:'platform',catalog:{kind:'level_overall',level:'Form 4',chapterCode:'',chapterTitle:'',subtopicCode:'',subtopicTitle:'',setNumber:1},difficulty:'easy',questions:Array.from({length:40},()=>{const item=quiz.newQuestion();item.question.prompt.primary='平台试题';item.question.difficulty='easy';item.question.options.forEach((o,i)=>o.text.primary=String(i));return item;})};const platformKeys=platform.questions.map(x=>x.key),platformContent={...platform,questions:platform.questions.map(x=>x.question)};assert.equal((await catalogPost({...importBody,id:op(),operationId:op(),content:platformContent,keys:platformKeys},teacher)).status,403,'teacher cannot forge platform bank');
const startBody={action:'start',quizId,bank:true,immediate:true,operationId:op()};r=await post(startBody,student);assert.equal(r.status,200,JSON.stringify(r.data));let attempt=r.data.attempt;assert.equal(attempt.immediate,true);assert.equal(attempt.results.length,0);assert.equal(JSON.stringify(attempt).includes('correctOptionId'),false);const firstOrder=attempt.content.questions.map(q=>[q.id,q.options.map(o=>o.id)]);assert.equal((await post(startBody,student)).data.attempt.id,attempt.id,'start idempotency');assert.deepEqual((await get('?attemptId='+attempt.id,student)).data.attempt.content.questions.map(q=>[q.id,q.options.map(o=>o.id)]),firstOrder,'shuffle persists');
const choice=c.questions[0],choiceKey=keys[0],wrong=choice.options.find(o=>o.id!==choiceKey.correctOptionId).id,answers={[choice.id]:{optionId:wrong},[c.questions[1].id]:{text:'  kuala   lumpur '},[c.questions[2].id]:{text:'0.5005'},[c.questions[3].id]:{text:'先代入，再整理。'}};
const check={action:'check',attemptId:attempt.id,revision:attempt.revision,answers,questionId:choice.id,operationId:op()};r=await post(check,student);assert.equal(r.status,200,JSON.stringify(r.data));attempt=r.data.attempt;
assert.equal(attempt.results.length,1,'other answers are not revealed');
assert.equal(attempt.results[0].status,'incorrect');
assert.equal(attempt.results[0].correctOptionId,choiceKey.correctOptionId,'the checked option can be highlighted');
assert.equal(attempt.results[0].solution,choiceSolution,'the checked question can show its worked steps');
assert.equal(attempt.results[0].key,undefined,'immediate feedback only returns the checked solution and option');
assert.equal(JSON.stringify(attempt).includes(unopenedSolution),false,'unchecked answers and steps stay protected');
assert.deepEqual((await get('?attemptId='+attempt.id,student)).data.attempt.results,attempt.results,'resuming retains the checked answer feedback');
assert.equal((await post(check,student)).data.attempt.revision,attempt.revision);
assert.equal((await post({...check,operationId:op()},student)).status,409,'stale revision');assert.equal((await post({action:'save',attemptId:attempt.id,revision:attempt.revision,answers:{[choice.id]:{optionId:choiceKey.correctOptionId}},operationId:op()},student)).data.error,'quiz.practiceLocked');
r=await post({action:'submit',attemptId:attempt.id,revision:attempt.revision,answers,operationId:op()},student);assert.equal(r.status,200,JSON.stringify(r.data));attempt=r.data.attempt;assert.equal(attempt.status,'submitted');assert.equal(attempt.score,2);assert.equal(attempt.pendingManual,1);assert.equal(attempt.results.find(q=>q.questionId===choice.id).key.correctOptionId,choiceKey.correctOptionId);assert.equal(attempt.results.find(q=>q.questionId===c.questions[1].id).status,'correct');assert.equal(attempt.results.find(q=>q.questionId===c.questions[2].id).status,'correct');
assert.equal((await get('?attemptId='+attempt.id,student2)).status,404,'another student cannot read');assert.equal((await get('?attemptId='+attempt.id,foreign)).status,404,'cross-group cannot read');assert.equal((await get('?attemptId='+attempt.id,teacher2)).status,404,'unrelated teacher cannot read');assert.equal((await get('?attemptId='+attempt.id,teacher)).data.attempt.canGrade,true);
r=await post({action:'grade',attemptId:attempt.id,revision:attempt.revision,questionId:c.questions[3].id,points:1,feedback:'步骤正确',operationId:op()},teacher);assert.equal(r.status,200,JSON.stringify(r.data));attempt=r.data.attempt;assert.equal(attempt.score,3);assert.equal(attempt.pendingManual,0);
const assignmentId=op(),assignBody={action:'assign',id:assignmentId,quizId,bank:true,classroomId:classroom,operationId:op()};r=await post(assignBody,teacher);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal((await post(assignBody,teacher)).data.id,assignmentId);assert.equal((await get('',student)).data.assignments.length,1);assert.equal((await get('?targets=1',teacher2)).data.classrooms.length,0);
const staffAssigned=(await get('?panel=assigned',teacher)).data;
assert.deepEqual(staffAssigned.assignments.map(row=>row.id),[assignmentId],'assigned list keeps staff roster summary');
assert.deepEqual(staffAssigned.attempts,[],'staff assigned list omits attempt history');
r=await post({action:'start',assignmentId,immediate:true,operationId:op()},student);assert.equal(r.status,200,JSON.stringify(r.data));const assignedAttempt=r.data.attempt;assert.equal(assignedAttempt.immediate,false,'teacher default overrides student');assert.equal((await post({action:'check',attemptId:assignedAttempt.id,revision:1,questionId:choice.id,answers:{[choice.id]:{optionId:wrong}},operationId:op()},student)).status,400);
const learnerAssigned=(await get('?panel=assigned',student)).data;
assert.equal(learnerAssigned.assignments[0].resumeAttemptId,assignedAttempt.id,'assignment resume ID remains in the summary');
assert(learnerAssigned.attempts.every(row=>!row.assignmentId&&row.status==='in_progress'),'learner assigned list includes only resumable self practices');
const learnerHistory=(await get('?panel=history&scope=assigned',student)).data;
assert.deepEqual(learnerHistory.attempts.map(row=>row.id),[assignedAttempt.id],'history returns the scoped attempts');
assert.deepEqual(learnerHistory.assignments.map(row=>row.id),[assignmentId],'learner history keeps linked retake policy');
assert.deepEqual((await get('?panel=history',teacher)).data.assignments,[],'staff history omits the assignment roster');
assert.deepEqual(assignedAttempt.results,[],'deferred attempt starts with no results or steps');
sqlite.prepare('DELETE FROM classroom_members WHERE classroom_id=? AND student_name=?').run(classroom,student.studentName);assert.equal((await post({action:'save',attemptId:assignedAttempt.id,revision:1,answers:{},operationId:op()},student)).status,404,'removed class member cannot mutate');sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(op(),g,classroom,student.studentName,now);
const direct={action:'assign',id:op(),quizId,bank:true,studentNames:[student.studentName],immediate:true,settings:{kind:'practice',scoreRelease:'manual',answerRelease:'manual'},operationId:op()};assert.equal((await post(direct,teacher2)).status,403,'other teacher cannot allocate');assert.equal((await post(direct,teacher)).status,200);assert.equal((await post({...direct,id:op(),studentNames:[foreign.studentName],operationId:op()},admin)).status,403,'foreign targets denied');
const immediateAssigned=(await post({action:'start',assignmentId:direct.id,operationId:op()},student)).data.attempt;
assert.equal(immediateAssigned.immediate,true);
assert.deepEqual(immediateAssigned.results,[]);
const immediateChecked=(await post({...check,attemptId:immediateAssigned.id,revision:immediateAssigned.revision,operationId:op()},student)).data.attempt;
const immediateSubmitted=(await post({action:'submit',attemptId:immediateChecked.id,revision:immediateChecked.revision,answers,operationId:op()},student)).data.attempt;
assert.equal(immediateSubmitted.scoreVisible,false);
assert.equal(immediateSubmitted.answersVisible,false);
assert.deepEqual(immediateSubmitted.results,[{questionId:choice.id,status:'incorrect',points:null,correctOptionId:choiceKey.correctOptionId,solution:choiceSolution}],'only the previously checked choice and its steps stay visible before release');
assert.equal((await get('?attemptId='+immediateSubmitted.id,student2)).status,404);
const deferredAssignment={...direct,id:op(),immediate:false,operationId:op()};
assert.equal((await post(deferredAssignment,teacher)).status,200);
const deferredAttempt=(await post({action:'start',assignmentId:deferredAssignment.id,operationId:op()},student)).data.attempt;
const deferredSubmitted=(await post({action:'submit',attemptId:deferredAttempt.id,revision:deferredAttempt.revision,answers,operationId:op()},student)).data.attempt;
assert.equal(deferredSubmitted.answersVisible,false);
assert.deepEqual(deferredSubmitted.results,[],'a deferred assignment keeps all solutions private until release');
const defaultSubmitted=(await post({action:'submit',attemptId:assignedAttempt.id,revision:assignedAttempt.revision,answers,operationId:op()},student)).data.attempt;
assert.equal(defaultSubmitted.answersVisible,true);
assert.equal(defaultSubmitted.results.find(result=>result.questionId===choice.id).key.explanation,choiceSolution);
assert.equal(defaultSubmitted.results.find(result=>result.questionId===c.questions[2].id).key.explanation,'','previous questions can still have no steps');
const controlled={...direct,id:op(),operationId:op(),settings:{kind:'practice',timeLimitSeconds:180,shuffleQuestions:false,shuffleOptions:false,showSolutions:false}};
assert.equal((await post({...controlled,id:op(),operationId:op(),settings:{...controlled.settings,showSolutions:'true'}},teacher)).status,400);
assert.equal((await post(controlled,teacher)).status,200);
const controlledStart=await post({action:'start',assignmentId:controlled.id,timeLimitSeconds:null,showSolutions:true,shuffleQuestions:true,operationId:op()},student);
assert.equal(controlledStart.status,200,JSON.stringify(controlledStart.data));
const teacherAttempt=controlledStart.data.attempt;
assert.equal(Date.parse(teacherAttempt.deadlineAt)-Date.parse(teacherAttempt.startedAt),180000,'the student cannot override the teacher timer');
const orderedIds=teacherAttempt.content.questions.map(q=>[q.id,q.options.map(o=>o.id)]);
assert.deepEqual(orderedIds,c.questions.map(q=>[q.id,q.options.map(o=>o.id)]),'teacher can override the authored shuffling defaults');
const checkedWithoutSteps=(await post({...check,attemptId:teacherAttempt.id,revision:teacherAttempt.revision,operationId:op()},student)).data.attempt;
assert.equal(checkedWithoutSteps.results[0].correctOptionId,choiceKey.correctOptionId,'correctness feedback still works');
assert.equal(JSON.stringify(checkedWithoutSteps).includes(choiceSolution),false,'disabled steps are withheld in immediate feedback');
const submittedWithoutSteps=(await post({action:'submit',attemptId:teacherAttempt.id,revision:checkedWithoutSteps.revision,answers,operationId:op()},student)).data.attempt;
assert.equal(submittedWithoutSteps.answersVisible,true);
assert.equal(JSON.stringify(submittedWithoutSteps).includes(choiceSolution),false,'answer release never overrides disabled steps');
assert.equal((await get('?attemptId='+teacherAttempt.id,teacher)).data.attempt.results.find(q=>q.questionId===choice.id).key.explanation,choiceSolution,'teacher can still review the original steps');
const allowed={...controlled,id:op(),operationId:op(),immediate:false,settings:{...controlled.settings,showSolutions:true,answerRelease:'manual'}};
assert.equal((await post(allowed,teacher)).status,200);
const allowedStart=(await post({action:'start',assignmentId:allowed.id,operationId:op()},student)).data.attempt;
const beforeRelease=(await post({action:'submit',attemptId:allowedStart.id,revision:allowedStart.revision,answers,operationId:op()},student)).data.attempt;
assert.equal(JSON.stringify(beforeRelease).includes(choiceSolution),false,'enabled steps are still held until release in deferred mode');
assert.equal((await post({action:'release',assignmentId:allowed.id,revision:1,release:'answers',operationId:op()},teacher)).status,200);
assert.equal((await get('?attemptId='+allowedStart.id,student)).data.attempt.results.find(q=>q.questionId===choice.id).key.explanation,choiceSolution);
sqlite.prepare('UPDATE classrooms SET archived=1 WHERE id=?').run(classroom);assert.equal((await post({action:'start',assignmentId,operationId:op()},student)).status,404,'archived classes cannot start');sqlite.prepare('UPDATE classrooms SET archived=0 WHERE id=?').run(classroom);
beforeBatch=()=>sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,student.id);r=await post({action:'start',quizId,bank:true,operationId:op()},student);assert.equal(r.status,409,'disabled race mutation guard');sqlite.prepare('UPDATE accounts SET disabled_at=NULL WHERE id=?').run(student.id);
// Source withdrawal/deletion prevents new starts while historical attempt keys and image grants survive.
const imageId=op();sqlite.prepare("INSERT INTO quiz_images(id,group_id,owner_id,object_key,filename,mime,bytes,sha256,status,created_at) VALUES(?,?,?,?,?,'image/png',4,?,'ready',?)").run(imageId,g,teacher.id,'fixture/image','test.png','a'.repeat(64),now);sqlite.prepare('INSERT INTO quiz_version_images(version_id,image_id,group_id) VALUES(?,?,?)').run(attempt.versionId,imageId,g);objects.set('fixture/image',Buffer.from('test'));
sqlite.prepare("UPDATE quizzes SET visibility='private',shared_revision=NULL,deleted_at=? WHERE id=?").run(now,quizId);assert.equal((await post({action:'start',quizId,bank:true,operationId:op()},student)).status,404);assert.equal((await post({action:'start',assignmentId,operationId:op()},student)).status,200,'Existing assignment retains its immutable publication grant');assert.equal((await get('?attemptId='+attempt.id,student)).status,200);actor=student;assert.equal((await images.GET(new Request('https://quiz.test/api/quiz-images?id='+imageId))).status,200,'historical image');actor=student2;assert.equal((await images.GET(new Request('https://quiz.test/api/quiz-images?id='+imageId))).status,404,'unrelated image denial');

// Live authority is checked inside writes, even if an account/class changes after the initial read.

const timed={...c,title:'计时数学',timeLimitSeconds:60},timedId=op();actor=teacher;await server.saveQuiz(actor,{id:timedId,revision:0,operationId:op(),content:timed,keys});await server.shareQuiz(actor,{id:timedId,revision:1,operationId:op(),visibility:'public'});r=await post({action:'start',quizId:timedId,bank:true,operationId:op()},student);assert.equal(r.status,200,JSON.stringify(r.data));const timedAttempt=r.data.attempt;assert.equal(Date.parse(timedAttempt.deadlineAt)-Date.parse(timedAttempt.startedAt),60000);assert.equal((await get('?attemptId='+timedAttempt.id,student)).data.attempt.deadlineAt,timedAttempt.deadlineAt);
assert.equal((await post({action:'start',quizId:timedId,bank:true,timeLimitSeconds:59,operationId:op()},student2)).status,400,'sub-minute overrides are rejected');
const untimed=(await post({action:'start',quizId:timedId,bank:true,timeLimitSeconds:null,operationId:op()},student2)).data.attempt;
assert.equal(untimed.deadlineAt,null,'an explicit self-practice choice wins over the legacy authored timer');
assert.equal(untimed.content.timeLimitSeconds,null);
const resumed=(await post({action:'start',quizId:timedId,bank:true,timeLimitSeconds:120,operationId:op()},student2)).data.attempt;
assert.equal(resumed.id,untimed.id);assert.equal(resumed.deadlineAt,null,'resuming does not replace the timer');
const personal=(await post({action:'start',quizId:timedId,bank:true,timeLimitSeconds:300,operationId:op()},foreign)).data.attempt;
assert.equal(Date.parse(personal.deadlineAt)-Date.parse(personal.startedAt),300000,'fresh self-practice can choose its own duration');
assert.equal((await get('?attemptId='+personal.id,foreign)).data.attempt.content.timeLimitSeconds,300,'the saved duration is returned after reload');
// Trigger correctly forbids changing a deadline. Expiry test uses a fixed server clock after start.
const RealDate=Date,clock=Date.parse(timedAttempt.deadlineAt)+1000;globalThis.Date=class extends RealDate{constructor(...v){super(...(v.length?v:[clock]));}static now(){return clock;}};r=await post({action:'save',attemptId:timedAttempt.id,revision:1,answers:{[choice.id]:{optionId:choiceKey.correctOptionId}},operationId:op()},student);globalThis.Date=RealDate;assert.equal(r.status,200);assert.equal(r.data.attempt.status,'submitted');assert.deepEqual(r.data.attempt.answers,{},'late answers not accepted');
// JSON prototype keys and invalid options never enter an attempt.
assert.throws(()=>practice.checkedPracticeAnswers(c,JSON.parse('{"__proto__":{"text":"evil"}}')));assert.throws(()=>practice.checkedPracticeAnswers(c,{[choice.id]:{optionId:'missing'}}));assert.throws(()=>practice.checkedPracticeAnswers(c,{[choice.id]:{optionId:wrong,points:999}}));
const learner={id:'ticklearn-fixture-001',role:'learner',name:'TickLearn Learner',email:'',groupId:null,teacherName:null,studentName:null,activationReason:'ticklearn_signup'};
sqlite.prepare('INSERT INTO accounts(id,group_id,email,name,role,created_at,activation_reason) VALUES(?,NULL,?,?,?,?,?)')
 .run(learner.id,learner.email,learner.name,learner.role,now,learner.activationReason);
const sets=[];
for(let index=0;index<21;index++){
 const set=op();
 await server.saveQuiz(teacher,{id:set,revision:0,operationId:op(),content:{...c,title:'TickLearn Set '+index},keys});
 await server.shareQuiz(teacher,{id:set,revision:1,operationId:op(),visibility:'public'});
 sets.push(set);
}
const free=(await catalogGet('?bank=1',learner)).data.items;
assert.equal(free.length,20,'free pool is limited before pagination or filtering');
const ids=free.map(item=>item.id),locked=sets.find(set=>!ids.includes(set));
assert.equal((await catalogGet('?bank=1&preview=1&id='+locked,learner)).status,404,'direct links cannot exceed the free pool');
assert.equal((await catalogGet('?bank=1&preview=1&id='+importBody.id,learner)).status,404,'private drafts are never in the free pool');
assert.equal((await catalogPost({action:'save',id:op(),revision:0,operationId:op(),content:c,keys},learner)).status,401);
const freeAttempts=[];
for(const quizId of ids.slice(0,3)){
 const result=await post({action:'start',quizId,operationId:op()},learner);
 assert.equal(result.status,200,JSON.stringify(result.data));
 freeAttempts.push(result.data.attempt.id);
}
assert.equal((await post({action:'start',quizId:ids[0],operationId:op()},learner)).data.attempt.id,freeAttempts[0],'resuming does not use another attempt');
assert.equal((await post({action:'start',quizId:ids[3],operationId:op()},learner)).data.error,'quiz.freeLimit');
assert.equal((await post({action:'start',assignmentId,operationId:op()},learner)).status,403,'no tuition assignments before conversion');

globalThis.__quizPracticeRuntime.unlimited='1';
try {
 assert.equal((await catalogGet('?bank=1&preview=1&id='+locked,learner)).status,200,'unlimited learners can open a published quiz outside the former pool');
 assert.equal((await catalogGet('?bank=1&preview=1&id='+importBody.id,learner)).status,404,'unlimited learners cannot open private drafts');
 for(const quizId of [ids[3],ids[4],locked]){
  const result=await post({action:'start',quizId,operationId:op()},learner);
  assert.equal(result.status,200,JSON.stringify(result.data));
  const attemptId=result.data.attempt.id;
  sqlite.prepare('DELETE FROM quiz_practice_events WHERE attempt_id=?').run(attemptId);
  sqlite.prepare('DELETE FROM quiz_practice_operations WHERE record_id=?').run(attemptId);
  sqlite.prepare('DELETE FROM quiz_practice_attempts WHERE id=?').run(attemptId);
 }
 const {readTickLearnDashboard}= (await load('lib/ticklearn-dashboard.ts')).module;
 assert.deepEqual((await readTickLearnDashboard()).plan,{unlimited:true});
} finally { delete globalThis.__quizPracticeRuntime.unlimited; }

const adminUsers=(await load('app/api/ticklearn/users/route.ts')).module;
const tuition=account('ticklearn-admin-001','admin','TickLearn Admin','next-genn-edu');
sqlite.prepare("UPDATE tuition_groups SET chief_admin_id=? WHERE id='next-genn-edu'").run(tuition.id);
const usersUrl='https://quiz.test/api/ticklearn/users';
actor=learner;
assert.equal((await adminUsers.GET(new Request(usersUrl))).status,403);
actor=tuition;
assert.equal((await adminUsers.GET(new Request(usersUrl))).status,200);
const enroll=await adminUsers.POST(new Request(usersUrl,{method:'POST',headers:{origin:'https://quiz.test','content-type':'application/json'},
 body:JSON.stringify({id:learner.id,name:'TickLearn Learner',identityMode:'new',syllabusId:'spm',grade:'Form 4'})}));
assert.equal(enroll.status,200,JSON.stringify(await enroll.json()));
const enrolled={...learner,role:'student',groupId:'next-genn-edu',studentName:'TickLearn Learner'};
assert.equal((await get('?attemptId='+freeAttempts[0],enrolled)).data.attempt.canAnswer,true,'converted users keep their original attempts');
assert.equal((await post({action:'start',quizId:locked,operationId:op()},enrolled)).status,200,'conversion unlocks the existing student catalogue and bypasses the free quota');
assert.equal(sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='enrollTickLearnStudent'").get().n,1);
const {readTickLearnDashboard,spmPeriod}=(await load('lib/ticklearn-dashboard.ts')).module;
actor=learner;
const fixtureClock=Date.now()+1000;
const {malaysiaDayStart}=(await load('lib/ticklearn-free.ts')).module;
const timestamp=(day)=>new Date(Date.parse(malaysiaDayStart(fixtureClock))+day*86400000).toISOString();
const mark=sqlite.prepare("UPDATE quiz_practice_attempts SET submitted_at=?,updated_at=?,status='submitted',results_json=?,score=?,pending_manual=0 WHERE id=?");
mark.run(timestamp(-1),timestamp(-1),JSON.stringify([{status:'incorrect'},{status:'correct'},{status:'manual'}]),1,freeAttempts[0]);
mark.run(timestamp(0),new Date(fixtureClock).toISOString(),JSON.stringify([{status:'correct'},{status:'correct'}]),3,freeAttempts[1]);
sqlite.prepare("UPDATE quiz_practice_attempts SET discarded_at=? WHERE id=?").run(timestamp(0),freeAttempts[2]);
const dashboard=await readTickLearnDashboard(fixtureClock);
assert.deepEqual(dashboard.plan,{daily:3,remaining:0,quizzes:20});
assert.equal(dashboard.completed,2);
assert.equal(dashboard.accuracy,75);
assert.equal(dashboard.streak,2);
assert.equal(dashboard.recent.id,freeAttempts[1]);
assert.equal(dashboard.recent.status,'submitted');
assert.equal(dashboard.recent.canRetry,true);
assert.equal(typeof dashboard.recent.score,'number');
const tomorrow=await readTickLearnDashboard(fixtureClock+86400000);
assert.equal(tomorrow.plan.remaining,3);
assert.equal(tomorrow.streak,2);
assert.equal((await readTickLearnDashboard(fixtureClock+2*86400000)).streak,0);
assert.equal(spmPeriod(Date.parse('2026-11-24T09:00:00+08:00')).inProgress,true);
assert.equal(spmPeriod(Date.parse('2026-12-18T00:00:00+08:00')),null);
actor=enrolled;
assert.equal((await readTickLearnDashboard()).plan,null);
actor=account('dashboard-empty-001','student','Empty Dashboard',other);
const emptyDashboard=await readTickLearnDashboard(fixtureClock);
assert.equal(emptyDashboard.completed,0);
assert.equal(emptyDashboard.accuracy,null);
assert.equal(emptyDashboard.recent,null);
console.log('TickLearn dashboard: quota reset, private statistics, accuracy, streak, and recent practice passed.');

assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
console.log('Quiz practice runtime/SQLite: server grading, concealed keys, immediate lock, CAS/replay, group/class live gates, allocations, manual grading, historical images, deadlines and malformed answers passed.');
