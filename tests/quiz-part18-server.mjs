import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createFixtureLoader} from './fixture-loader.mjs';

// Real handlers, fixed version snapshots, grading and SQLite JSON aggregation.
// Everything here is fictional and in-memory; network access is prohibited.
const NativeDate=Date,nativeFetch=globalThis.fetch;let clock=Date.parse('2033-03-01T00:00:00.000Z');
globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
globalThis.fetch=async()=>{throw Error('Part18 fixture cannot access a hosted service');};
const sqlite=new DatabaseSync(':memory:');for(const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
function statement(sql,args=[]){const execute=()=>{const query=sqlite.prepare(sql);return query.columns().length?{results:query.all(...args),meta:{changes:0}}:{results:[],meta:query.run(...args)};};return{bind:(...values)=>statement(sql,values),first:async()=>execute().results[0]||null,all:async()=>execute(),run:async()=>execute(),execute};}
const db={prepare:statement,async batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(item=>item.execute());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
const objects=new Map(),bucket={get:async key=>objects.has(key)?{body:objects.get(key),size:objects.get(key).length}:null};
let actor;globalThis.__part18={learningDb:()=>db,rows:async(sql,...args)=>sqlite.prepare(sql).all(...args),first:async(sql,...args)=>sqlite.prepare(sql).get(...args)||null,currentBusinessAccount:async()=>actor,pdfBucket:()=>bucket,pdfLimits:()=>({total:100000000}),isOwnerAccount:account=>account.id==='part18-owner-0001',OWNER_EMAIL:'part18-owner@example.test',operationHash:async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))).toString('hex')};
const runtime='data:text/javascript;base64,'+Buffer.from('export const {learningDb,rows,first,currentBusinessAccount,pdfBucket,pdfLimits,isOwnerAccount,OWNER_EMAIL,operationHash}=globalThis.__part18;').toString('base64'),load=createFixtureLoader({runtimeUrl:runtime,environmentUrl:'data:text/javascript,export const env={DB:globalThis.__part18.learningDb()};'});
const route=(await load('app/api/quiz-practice/route.ts')).module,images=(await load('app/api/quiz-images/route.ts')).module,server=(await load('lib/quiz-server.ts')).module,quiz=(await load('lib/quiz.ts')).module,sampling=(await load('lib/quiz-sampling.ts')).module;
const op=()=>crypto.randomUUID(),group='part18-group',foreignGroup='part18-foreign-group',now=new Date().toISOString();let checks=0;
for(const id of [group,foreignGroup])sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,id,now,now);
function account(id,role,name,groupId=group){sqlite.prepare('INSERT INTO accounts(id,group_id,email,name,role,teacher_name,student_name,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,groupId,id+'@example.test',name,role,role==='teacher'?name:null,role==='student'?name:null,now);if(role==='teacher')sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(groupId,name,now);if(role==='student')sqlite.prepare('INSERT INTO students(group_id,name,name_key,created_at) VALUES(?,?,?,?)').run(groupId,name,name.toLowerCase(),now);return{id,groupId,role,email:id+'@example.test',teacherName:role==='teacher'?name:null,studentName:role==='student'?name:null};}
const teacher=account('part18-teacher-001','teacher','Part18 Teacher'),otherTeacher=account('part18-teacher-002','teacher','Unrelated Teacher'),students=Array.from({length:5},(_,i)=>account('part18-student-00'+i,'student','Learner '+i)),foreign=account('part18-foreign-001','admin','Foreign Admin',foreignGroup),classroom=op();
sqlite.prepare('INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(classroom,group,'Part18 Classroom','Mathematics',teacher.teacherName,teacher.id,now,now);
for(const student of students)sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(op(),group,classroom,student.studentName,now);
function check(value,label){assert(value,label);checks++;}
async function call(body,as=students[0],status=200){actor=as;clock+=1000;const response=await route.POST(new Request('https://fixture.test/api/quiz-practice',{method:'POST',headers:{origin:'https://fixture.test','content-type':'application/json'},body:JSON.stringify(body)}));const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));checks++;return value;}
async function get(params,as=students[0],status=200){actor=as;const response=await route.GET(new Request('https://fixture.test/api/quiz-practice?'+new URLSearchParams(params)));const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));checks++;return value;}
async function save(content,keys){actor=teacher;const id=op();await server.saveQuiz(actor,{id,revision:0,operationId:op(),content,keys});return id;}
async function assign(quizId,settings={kind:'practice'}){const id=op();await call({action:'assign',id,quizId,classroomId:classroom,settings,operationId:op()},teacher);return id;}
const start=(assignmentId,student=students[0])=>call({action:'start',assignmentId,operationId:op()},student);
const mutate=(attempt,action,answers,student=students[0],extra={})=>call({action,attemptId:attempt.id,revision:attempt.revision,answers,operationId:op(),...extra},student);
const question=(type,points)=>{const item=quiz.newQuestion(type);item.question.points=points;item.question.prompt.primary='Fictional '+type+' '+points;item.question.options.forEach((option,i)=>option.text.primary='Choice '+i);return item;};
const correct=(q,keys)=>q.options.length?{optionId:keys.find(key=>key.questionId===q.id).correctOptionId}:{text:'Explanation'};
try{
 const content={...quiz.emptyQuiz(),title:'Random subset fixture',subject:'Mathematics',exam:'SPM',syllabusId:'spm',subjectId:'mathematics',shuffleQuestions:true,shuffleOptions:true,sampling:{count:3,types:['mcq']}},keys=[];
 for(let i=1;i<=6;i++){const item=question('mcq',i);content.questions.push(item.question);keys.push(item.key);}const written=question('written',9);content.questions.push(written.question);keys.push(written.key);
 const quizId=await save(content,keys),assignmentId=await assign(quizId);let attempt=(await start(assignmentId)).attempt;
 check(attempt.content.questions.length===3&&attempt.content.questions.every(q=>q.type==='mcq'),'Only the configured subset and types are sent');
 check(attempt.rawTotalScore===attempt.content.questions.reduce((sum,q)=>sum+q.points,0),'Total is the drawn points, including unequal values');
 const fixed=attempt.content.questions.map(q=>[q.id,q.options.map(option=>option.id)]),refetched=(await get({attemptId:attempt.id})).attempt;
 assert.deepEqual(refetched.content.questions.map(q=>[q.id,q.options.map(option=>option.id)]),fixed);checks++;
 check((await start(assignmentId)).attempt.id===attempt.id,'Restart resumes the same subset');
 const unselected=content.questions.find(q=>!attempt.content.questions.some(selected=>selected.id===q.id));
 await call({action:'save',attemptId:attempt.id,revision:attempt.revision,answers:{[unselected.id]:correct(unselected,keys)},operationId:op()},students[0],400);
 await call({action:'submit',attemptId:attempt.id,revision:attempt.revision,answers:{},operationId:op()},students[0],400);
 attempt=(await mutate(attempt,'submit',Object.fromEntries(attempt.content.questions.map(q=>[q.id,correct(q,keys)])))).attempt;
 check(attempt.results.length===3&&attempt.score===attempt.totalScore&&attempt.pendingManual===0,'Only selected questions are required, graded and counted');
 await call({action:'grade',attemptId:attempt.id,revision:attempt.revision,questionId:written.question.id,points:9,operationId:op()},teacher,400);
 await get({attemptId:attempt.id},students[1],404);
 const second=(await start(assignmentId,students[1])).attempt;check(second.content.questions.length===3&&new Set(second.content.questions.map(q=>q.id)).size===3,'A second student receives a valid unique sample');
 const immediateSource=op();actor=teacher;await server.saveQuiz(teacher,{id:immediateSource,revision:0,operationId:op(),content,keys});const immediateAssignment=op();await call({action:'assign',id:immediateAssignment,quizId:immediateSource,classroomId:classroom,immediate:true,operationId:op()},teacher);let immediate=(await start(immediateAssignment)).attempt;
 for(const q of immediate.content.questions){immediate=(await mutate(immediate,'check',{[q.id]:correct(q,keys)},students[0],{questionId:q.id})).attempt;}
 immediate=(await mutate(immediate,'submit',{})).attempt;check(immediate.results.length===3&&immediate.score===immediate.totalScore,'Immediate checks use only sampled answer keys');
 const timed=await assign(quizId,{kind:'quiz',timeLimitSeconds:60,dueAt:new Date(clock+86400000).toISOString()});const timedAttempt=(await start(timed)).attempt;clock=Date.parse(timedAttempt.deadlineAt)+1000;await get({attemptId:timedAttempt.id});const expired=(await get({attemptId:timedAttempt.id},teacher)).attempt;
 check(expired.status==='submitted'&&expired.results.length===3&&expired.pendingManual===0,'Timer finalisation excludes unselected manual questions');
 assert.throws(()=>sampling.practiceQuestions({...content,sampling:{count:7,types:['mcq']}}),error=>error.code==='quiz.samplingInsufficient');checks++;
 assert.throws(()=>sampling.practiceQuestions({...content,sampling:{count:0,types:['mcq']}}),error=>error.code==='quiz.samplingInvalid');checks++;
 const analysisContent={...quiz.emptyQuiz(),title:'Known analytics fixture',subject:'Mathematics',exam:'SPM',syllabusId:'spm',subjectId:'mathematics'},analysisKeys=[];
 for(const [type,points]of [['mcq',2],['mcq',3],['written',5]]){const item=question(type,points);analysisContent.questions.push(item.question);analysisKeys.push(item.key);}const analysisId=await save(analysisContent,analysisKeys),analysisAssignment=await assign(analysisId);
 const answers=(values)=>Object.fromEntries(analysisContent.questions.map((q,index)=>[q.id,q.options.length?{optionId:values[index]?analysisKeys[index].correctOptionId:q.options.find(option=>option.id!==analysisKeys[index].correctOptionId).id}:{text:'Fictional explanation'}]));
 async function finished(student,values,points){let a=(await start(analysisAssignment,student)).attempt;a=(await mutate(a,'submit',answers(values),student)).attempt;if(points!==null)a=(await call({action:'grade',attemptId:a.id,revision:a.revision,questionId:analysisContent.questions[2].id,points,operationId:op()},teacher)).attempt;return a;}
 await finished(students[0],[true,true],5);await finished(students[0],[false,false],5);await finished(students[1],[true,false],0);await finished(students[2],[true,true],null);await start(analysisAssignment,students[3]);
 const analysisParams={analytics:'1',assignmentId:analysisAssignment};const latest=await get(analysisParams,teacher);
 check(latest.mode==='latest'&&latest.summary.analysedAttempts===2&&latest.summary.averagePercent===35&&latest.summary.highestPercent===50&&latest.summary.lowestPercent===20,'Latest graded attempt per student has known average and extrema');
 check(latest.summary.pendingGradingAttempts===1&&latest.summary.inProgressAttempts===1&&latest.summary.notStartedStudents===1,'Ungraded, in-progress and not-started are kept separate');
 check(latest.questions[0].receivedCount===2&&latest.questions[0].errorRatePercent===50&&latest.questions[1].errorRatePercent===100,'Per-question wrong rate matches known answers');
 check(latest.questions[2].manual&&latest.questions[2].errorRatePercent===null&&latest.questions[2].averageScorePercent===50,'Manual questions show score rate instead of automatic wrong rate');
 check((await get({...analysisParams,attemptMode:'first'},teacher)).summary.averagePercent===60,'First per-student metric');
 check((await get({...analysisParams,attemptMode:'best'},teacher)).summary.averagePercent===60,'Best per-student metric');
 check((await get({...analysisParams,attemptMode:'all'},teacher)).summary.averagePercent===56.67,'All attempts metric');
 await get(analysisParams,students[0],403);await get(analysisParams,otherTeacher,404);await get(analysisParams,foreign,404);await get({...analysisParams,versionId:op()},teacher,404);await get({...analysisParams,attemptMode:'invented'},teacher,400);
 check(!JSON.stringify(latest).includes('correctOptionId')&&!JSON.stringify(latest).includes('studentName')&&!JSON.stringify(latest).includes('answers_json'),'Analytics responses contain no answer keys or individual answer payloads');
 const sampledAnalysis=await get({analytics:'1',assignmentId},teacher);check(sampledAnalysis.questions.reduce((sum,q)=>sum+q.receivedCount,0)===3,'Unselected questions do not enter the wrong-rate denominator');
 sqlite.prepare("UPDATE quizzes SET deleted_at=?,visibility='private',shared_revision=NULL WHERE id=?").run(new Date().toISOString(),quizId);
 check((await start(assignmentId,students[2])).attempt.content.questions.length===3,'Ordinary source withdrawal/deletion preserves existing assignment grant');
 const beforeBlock=(await start(immediateAssignment,students[1])).attempt;sqlite.prepare('UPDATE quizzes SET public_blocked_at=? WHERE id=?').run(new Date().toISOString(),immediateSource);await call({action:'start',assignmentId:immediateAssignment,operationId:op()},students[3],404);
 check((await get({attemptId:beforeBlock.id},students[1])).attempt.id===beforeBlock.id,'Platform takedown retains an already-started attempt');
 const large={...quiz.emptyQuiz(),title:'Paged analysis fixture',subject:'Mathematics',exam:'SPM',syllabusId:'spm',subjectId:'mathematics'},largeKeys=[];for(let n=0;n<22;n++){const item=question('mcq',1);large.questions.push(item.question);largeKeys.push(item.key);}const largeAssignment=await assign(await save(large,largeKeys)),page1=await get({analytics:'1',assignmentId:largeAssignment},teacher),page2=await get({analytics:'1',assignmentId:largeAssignment,page:'1'},teacher);
 check(page1.questions.length===20&&page1.hasMore&&page2.questions.length===2&&!page2.hasMore&&page2.questions[0].number===21,'Question analysis is paged in SQL');
 const imageId=op(),imageQuestion=question('mcq',1);imageQuestion.question.imageId=imageId;
 sqlite.prepare("INSERT INTO quiz_images(id,group_id,owner_id,object_key,filename,mime,bytes,sha256,status,created_at) VALUES(?,?,?,?,?,'image/png',4,?,'ready',?)").run(imageId,group,teacher.id,'part18/image','fixture.png','a'.repeat(64),new Date().toISOString());objects.set('part18/image',Buffer.from('test'));
 const imageQuiz=await save({...analysisContent,title:'Image policy fixture',questions:[imageQuestion.question]},[imageQuestion.key]),imageVersion=sqlite.prepare('SELECT id FROM quiz_versions WHERE quiz_id=?').get(imageQuiz).id;
 async function image(as,status){actor=as;const response=await images.GET(new Request('https://fixture.test/api/quiz-images?id='+imageId));assert.equal(response.status,status,'Image access');checks++;return response;}
 await image(students[0],404);sqlite.prepare("UPDATE quizzes SET visibility='public',shared_revision=1 WHERE id=?").run(imageQuiz);await image(students[0],404);await image(foreign,404);
 const publication=op();sqlite.prepare("INSERT INTO quiz_publications(id,group_id,quiz_id,version_id,applicant_id,source_type,rights_confirmed,status,created_at,updated_at) VALUES(?,?,?,?,?,'original',1,'approved',?,?)").run(publication,group,imageQuiz,imageVersion,teacher.id,new Date().toISOString(),new Date().toISOString());await image(students[0],200);await image(foreign,200);
 sqlite.prepare("UPDATE quiz_publications SET status='withdrawn' WHERE id=?").run(publication);await image(students[0],404);
 sqlite.prepare("UPDATE quizzes SET visibility='organisation' WHERE id=?").run(imageQuiz);await image(students[0],200);await image(foreign,404);
 const imageAssignment=await assign(imageQuiz);await start(imageAssignment);sqlite.prepare('UPDATE quizzes SET public_blocked_at=? WHERE id=?').run(new Date().toISOString(),imageQuiz);await image(students[1],404);await image(students[0],200);await image(teacher,200);
 sqlite.prepare("UPDATE quizzes SET visibility='private',shared_revision=NULL,deleted_at=? WHERE id=?").run(new Date().toISOString(),imageQuiz);await image(students[0],200);await image(students[1],404);
 console.log('PASS Part18: '+checks+' handler/SQL checks for fixed sampling, scoring, timers, selected keys, permissions, immutable assignment grants and known analytics.');
}finally{sqlite.close();globalThis.Date=NativeDate;globalThis.fetch=nativeFetch;delete globalThis.__part18;}
