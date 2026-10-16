import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

// Actual handlers, access queries, storage cleanup and SQLite; identity and R2
// are local fixtures. No request or fixture is sent to a hosted environment.
const sqlite=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
let beforeStatement=null,beforeBatch=null,putHook=null,deleteHook=null,actor=null;
function statement(sql,values=[]){
 const execute=()=>{if(beforeStatement){const hook=beforeStatement;beforeStatement=null;hook(sql,values);}const st=sqlite.prepare(sql);return st.columns().length?{results:st.all(...values),meta:{changes:0}}:{results:[],meta:st.run(...values)};};
 return {bind:(...v)=>statement(sql,v),all:async()=>execute(),first:async()=>execute().results[0]||null,run:async()=>execute(),execute};
}
const db={prepare:statement,batch:async statements=>{if(beforeBatch){const hook=beforeBatch;beforeBatch=null;await hook();}sqlite.exec('BEGIN');try{const r=statements.map(s=>s.execute());sqlite.exec('COMMIT');return r;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
const objects=new Map(),deletes=[];
const bucket={put:async(key,bytes)=>{objects.set(key,Buffer.from(bytes));if(putHook){const hook=putHook;putHook=null;await hook();}},get:async key=>objects.has(key)?{body:objects.get(key),size:objects.get(key).length}:null,head:async key=>objects.has(key)?{size:objects.get(key).length}:null,delete:async key=>{deletes.push(key);if(deleteHook){const hook=deleteHook;deleteHook=null;await hook();}objects.delete(key);}};
class JsonResponse extends Response{static json(data,options){return new JsonResponse(JSON.stringify(data),{...options,headers:{'content-type':'application/json',...options?.headers}});}}
const runtime={env:{DB:db,BUCKET:bucket,PDF_TOTAL_STORAGE_LIMIT_BYTES:'1000000'},NextResponse:JsonResponse,currentBusinessAccount:async()=>actor};
globalThis.__part01Files=runtime;
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-part01-files-')),stubPath=path.join(temporary,'runtime.mjs'),cache=new Map();
fs.writeFileSync(stubPath,'export const {env,NextResponse,currentBusinessAccount}=globalThis.__part01Files;');
process.once('exit',()=>{const resolved=path.resolve(temporary);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('tickminder-part01-files-'))fs.rmSync(resolved,{recursive:true,force:true});});
process.on('uncaughtException',error=>{console.error(error.name+': '+error.message);console.error(String(error.stack).split('\n').filter(x=>!x.includes('data:text/')).slice(0,7).join('\n'));process.exit(1);});
function compile(file){if(cache.has(file))return cache.get(file);const output=path.join(temporary,file.replace(/\.ts$/,'.mjs')),url=pathToFileURL(output).href;cache.set(file,url);let source=ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;for(const [,spec]of [...source.matchAll(/from ["']([^"']+)["']/g)]){const replacement=['cloudflare:workers','next/server','@/lib/auth'].includes(spec)?pathToFileURL(stubPath).href:spec.startsWith('@/')?compile(spec.slice(2)+'.ts'):spec.startsWith('.')?compile(path.posix.normalize(path.posix.join(path.posix.dirname(file),spec))+(spec.endsWith('.ts')?'':'.ts')):import.meta.resolve(spec);source=source.replaceAll('"'+spec+'"','"'+replacement+'"').replaceAll("'"+spec+"'","'"+replacement+"'");}fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,source);return url;}
const load=async file=>import(compile(file));
const storage=await load('lib/pdf-storage.ts'),learning=await load('lib/learning-server.ts'),uploads=await load('app/api/files/route.ts'),files=await load('app/api/files/[id]/route.ts'),learningRoute=await load('app/api/learning/route.ts');
const now=new Date().toISOString(),old='2000-01-01T00:00:00.000Z',groups=['file-group-a','file-group-b'],teachers={},students={},classes={},homework={};
for(const group of groups){
 sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,active,created_at,updated_at) VALUES(?,?,?,1,?,?)').run(group,group,group,now,now);
 sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(group,'Same Teacher',now);
 sqlite.prepare('INSERT INTO students(group_id,name,name_key,created_at,grade) VALUES(?,?,?,?,?)').run(group,'Same Student','samestudent',now,'Form 3');
 sqlite.prepare('INSERT INTO plans(group_id,key,student,subject,teacher_name,created_at,subject_id) VALUES(?,?,?,?,?,?,?)').run(group,'same-science','Same Student','Science','Same Teacher',now,'science');
 for(const role of ['teacher','student','admin']){
  const id=group+'-'+role,a={id,email:id+'@example.test',name:role,role,groupId:group,teacherName:role==='teacher'?'Same Teacher':null,studentName:role==='student'?'Same Student':null};
  sqlite.prepare('INSERT INTO accounts(id,group_id,email,name,role,teacher_name,student_name,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,group,a.email,role,role,a.teacherName,a.studentName,now);
  sqlite.prepare('INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES(?,?,?,0,?)').run(id,id,'local-fixture-not-a-login',now);
  if(role==='teacher')teachers[group]=a;if(role==='student')students[group]=a;
 }
 const classroom=crypto.randomUUID();classes[group]=classroom;
 sqlite.prepare('INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_at,updated_at,created_by) VALUES(?,?,?,?,?,?,?,?)').run(classroom,group,'Science','Science','Same Teacher',now,now,teachers[group].id);
 sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),group,classroom,'Same Student',now);
 const task=crypto.randomUUID();homework[group]=task;
 sqlite.prepare('INSERT INTO homework(id,group_id,owner_id,title,subject,description,starts_at,due_at,created_at,classroom_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(task,group,teachers[group].id,'Fixture homework','Science','Practice','2000-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z',now,classroom);
 sqlite.prepare('INSERT INTO homework_recipients(id,group_id,homework_id,student_name) VALUES(?,?,?,?)').run(crypto.randomUUID(),group,task,'Same Student');
 sqlite.prepare('INSERT INTO storage_quota(group_id,id,used_bytes) VALUES(?,1,0)').run(group);
}
const [a,b]=groups,pdfBytes=Buffer.from('%PDF-1.7\nFixture\nstartxref\n0\n%%EOF');
function quota(group){return sqlite.prepare('SELECT used_bytes AS n FROM storage_quota WHERE group_id=? AND id=1').get(group).n;}
function seedFile(group,{kind='material',context=classes[group],owner=teachers[group].id,status='staged',createdAt=now,bytes=17}={}){
 const id=crypto.randomUUID(),key='fixture/'+id;
 sqlite.prepare('INSERT INTO pdf_files(id,group_id,object_key,owner_id,kind,context_id,filename,bytes,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,group,key,owner,kind,context,'fixture.pdf',bytes,status,createdAt);
 sqlite.prepare('UPDATE storage_quota SET used_bytes=used_bytes+? WHERE group_id=? AND id=1').run(bytes,group);objects.set(key,Buffer.alloc(bytes));return{id,key,bytes};
}
async function upload(as,kind='material',extra={}){
 actor=as;const form=new FormData();form.set('kind',kind);form.set('classroomId',classes[as.groupId]);if(kind==='submission')form.set('homeworkId',homework[as.groupId]);for(const [k,v]of Object.entries(extra))form.set(k,v);form.set('file',new File([pdfBytes],'fixture.pdf',{type:'application/pdf'}));
 const r=await uploads.POST(new Request('https://files.test/api/files',{method:'POST',headers:{origin:'https://files.test'},body:form}));return {status:r.status,data:await r.json()};
}
async function getFile(as,id,query=''){actor=as;return files.GET(new Request('https://files.test/api/files/'+id+query),{params:Promise.resolve({id})});}

// Same names never bridge groups; anonymous, non-recipient and staged access fail.
const materialFile=seedFile(a,{status:'attached'}),materialId=crypto.randomUUID();
sqlite.prepare('INSERT INTO teaching_materials(id,group_id,owner_id,title,file_id,created_at,classroom_id) VALUES(?,?,?,?,?,?,?)').run(materialId,a,teachers[a].id,'Private material',materialFile.id,now,classes[a]);
sqlite.prepare('INSERT INTO material_recipients(id,group_id,material_id,student_name,subject) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),a,materialId,'Same Student','Science');
assert.equal((await getFile(null,materialFile.id)).status,401);
assert.equal((await getFile(students[b],materialFile.id)).status,404);
assert.equal((await getFile(teachers[b],materialFile.id,'?download=1')).status,404);
for(const as of [students[a],teachers[a]])for(const query of ['','?download=1']){const r=await getFile(as,materialFile.id,query);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('cross-origin-resource-policy'),'same-origin');}
const privateStaged=seedFile(a);assert.equal((await getFile(students[a],privateStaged.id)).status,404);
sqlite.prepare('DELETE FROM classroom_members WHERE classroom_id=?').run(classes[a]);assert.equal(await learning.pdfMayRead(students[a],materialFile.id),null,'removed membership revokes material access');
sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),a,classes[a],'Same Student',now);

// Each reference family independently prevents R2 deletion and quota changes.
const retained=[materialFile];
const attachment=seedFile(a,{kind:'homework',status:'attached'});sqlite.prepare('UPDATE homework SET attachment_file_id=? WHERE id=?').run(attachment.id,homework[a]);retained.push(attachment);
const submitted=seedFile(a,{kind:'submission',context:homework[a],owner:students[a].id,status:'attached'}),submissionId=crypto.randomUUID();
sqlite.prepare('INSERT INTO homework_submissions(id,group_id,homework_id,student_name,file_id,submitted_at,late,attempt) VALUES(?,?,?,?,?,?,0,1)').run(submissionId,a,homework[a],'Same Student',submitted.id,now);retained.push(submitted);
const historical=seedFile(a,{status:'attached'});sqlite.prepare('INSERT INTO learning_versions(id,group_id,kind,record_id,revision,file_id,snapshot_json,actor_id,changed_at,reason) VALUES(?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),a,'material',materialId,2,historical.id,'{}',teachers[a].id,now,'fixture');retained.push(historical);
const feedback=seedFile(a,{kind:'feedback',context:submissionId,status:'attached'});sqlite.prepare('INSERT INTO homework_feedback(id,group_id,homework_id,submission_id,teacher_id,comment,file_id,created_at,request_hash) VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),a,homework[a],submissionId,teachers[a].id,'Feedback',feedback.id,now,'fixture');retained.push(feedback);
for(const f of retained){const before=quota(a),deleted=deletes.length;await storage.deleteUnreferencedFile(f.id);assert.ok(objects.has(f.key));assert.equal(quota(a),before);assert.equal(deletes.length,deleted);}

// Correct-group deduction, idempotence, simultaneous cleanup and R2 failure retry.
const disposable=seedFile(b),aBefore=quota(a),bBefore=quota(b);await Promise.all([storage.deleteUnreferencedFile(disposable.id),storage.deleteUnreferencedFile(disposable.id)]);assert.equal(quota(b),bBefore-disposable.bytes);assert.equal(quota(a),aBefore);assert.equal(objects.has(disposable.key),false);await storage.deleteUnreferencedFile(disposable.id);assert.equal(quota(b),bBefore-disposable.bytes);
const retry=seedFile(b),retryQuota=quota(b);deleteHook=async()=>{throw Error('simulated object deletion failure');};await assert.rejects(storage.deleteUnreferencedFile(retry.id));assert.equal(sqlite.prepare('SELECT status FROM pdf_files WHERE id=?').get(retry.id).status,'deleting');assert.equal(quota(b),retryQuota);assert.ok(objects.has(retry.key));await storage.deleteUnreferencedFile(retry.id);assert.equal(quota(b),retryQuota-retry.bytes);
const oldUnused=seedFile(b,{createdAt:old}),oldRetained=seedFile(b,{createdAt:old,status:'attached'});sqlite.prepare('INSERT INTO learning_versions(id,group_id,kind,record_id,revision,file_id,snapshot_json,actor_id,changed_at,reason) VALUES(?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),b,'homework',homework[b],2,oldRetained.id,'{}',teachers[b].id,now,'fixture');await storage.cleanOldStagedFiles();assert.equal(objects.has(oldUnused.key),false);assert.ok(objects.has(oldRetained.key));assert.equal(quota(a),aBefore);

// Legitimate uploads and forged group/class/homework identifiers.
let result=await upload(teachers[a]);assert.equal(result.status,200,JSON.stringify(result.data));
assert.equal((await upload(students[a],'submission')).status,200,'eligible student can upload');
assert.equal((await upload(teachers[a],'feedback',{submissionId})).status,200,'own submitted homework can receive feedback PDF');
assert.equal((await upload(teachers[a],'material',{classroomId:classes[b],groupId:b})).status,403);
assert.equal((await upload(students[a],'submission',{homeworkId:homework[b],groupId:b})).status,403);
const foreignQuota=quota(b);

// Revoke permission after initial checks but before reservation and during R2.
const unchangedQuota=quota(a),unchangedCount=sqlite.prepare('SELECT count(*) n FROM pdf_files').get().n;
const originalDigest=crypto.subtle.digest.bind(crypto.subtle);
crypto.subtle.digest=async(...args)=>{const value=await originalDigest(...args);sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,teachers[a].id);crypto.subtle.digest=originalDigest;return value;};
result=await upload(teachers[a]);assert.equal(result.status,403,'disabled actor must not reserve/upload after body hashing');assert.equal(quota(a),unchangedQuota);assert.equal(sqlite.prepare('SELECT count(*) n FROM pdf_files').get().n,unchangedCount);
sqlite.prepare('UPDATE accounts SET disabled_at=NULL WHERE id=?').run(teachers[a].id);
putHook=async()=>sqlite.prepare('UPDATE classrooms SET archived=1 WHERE id=?').run(classes[a]);result=await upload(teachers[a]);assert.equal(result.status,403,'class archived during object write must not leave accessible file');assert.equal(quota(a),unchangedQuota);assert.equal(sqlite.prepare('SELECT count(*) n FROM pdf_files').get().n,unchangedCount);sqlite.prepare('UPDATE classrooms SET archived=0 WHERE id=?').run(classes[a]);
putHook=async()=>sqlite.prepare('DELETE FROM classroom_members WHERE classroom_id=?').run(classes[a]);result=await upload(students[a],'submission');assert.equal(result.status,403,'membership removed during object write is rejected');assert.equal(quota(a),unchangedQuota);sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),a,classes[a],'Same Student',now);assert.equal(quota(b),foreignQuota);

// Cleanup winning between staged-file validation and submission cannot leave a
// dangling reference. Retain the previous valid submission and grading history.
const raced=seedFile(a,{kind:'submission',context:homework[a],owner:students[a].id});actor=students[a];beforeBatch=()=>storage.deleteUnreferencedFile(raced.id);
const response=await learningRoute.POST(new Request('https://files.test/api/learning',{method:'POST',headers:{origin:'https://files.test','content-type':'application/json'},body:JSON.stringify({action:'submitHomework',homeworkId:homework[a],fileId:raced.id,revision:1,previousSubmissionId:submissionId})}));
assert.equal(response.status,409,'cleanup wins over stale staged-file validation');assert.equal(sqlite.prepare('SELECT count(*) n FROM homework_submissions WHERE file_id=?').get(raced.id).n,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM homework_submissions WHERE id=?').get(submissionId).n,1);

// Quiz images intentionally support public sharing across groups. Private and
// organisation-only sources cannot grant access; authorised copies retain it.
const imageRoute=await load('app/api/quiz-images/route.ts'),quiz=await load('lib/quiz.ts'),quizServer=await load('lib/quiz-server.ts'),quizRoute=await load('app/api/quizzes/route.ts');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD+0AAAAASUVORK5CYII=','base64');
async function uploadImage(as){actor=as;const form=new FormData();form.set('file',new File([png],'question.png',{type:'image/png'}));const r=await imageRoute.POST(new Request('https://files.test/api/quiz-images',{method:'POST',headers:{origin:'https://files.test'},body:form}));return {status:r.status,data:await r.json()};}
async function getImage(as,id){actor=as;return imageRoute.GET(new Request('https://files.test/api/quiz-images?id='+id));}
const image=await uploadImage(teachers[a]);assert.equal(image.status,200,JSON.stringify(image.data));assert.equal((await uploadImage(teachers[a])).data.id,image.data.id,'image hash deduplicates same owner');
assert.equal((await getImage(null,image.data.id)).status,401);assert.equal((await getImage(students[b],image.data.id)).status,404);
assert.equal((await uploadImage(students[a])).status,403,'students cannot upload bank images');
const question=quiz.newQuestion();question.question.prompt.primary='Image access fixture';question.question.imageId=image.data.id;question.question.options.forEach((o,i)=>o.text.primary='Option '+i);
const content={...quiz.emptyQuiz(),title:'File security fixture',subject:'Science',exam:'SPM',questions:[question.question]},quizId=crypto.randomUUID();
actor=teachers[a];await quizServer.saveQuiz(actor,{id:quizId,revision:0,operationId:crypto.randomUUID(),content,keys:[question.key]});
for(const visibility of ['private','organisation']){if(visibility!=='private')await quizServer.shareQuiz(teachers[a],{id:quizId,revision:1,operationId:crypto.randomUUID(),visibility});assert.equal((await getImage(teachers[b],image.data.id)).status,404,visibility+' source stays within scope');}
await quizServer.shareQuiz(teachers[a],{id:quizId,revision:1,operationId:crypto.randomUUID(),visibility:'public'});
for(const as of [teachers[b],students[b]])assert.equal((await getImage(as,image.data.id)).status,200,'public cross-group image is legal');
actor=teachers[b];const duplicateId=crypto.randomUUID(),duplicate=await quizRoute.POST(new Request('https://files.test/api/quizzes',{method:'POST',headers:{origin:'https://files.test','content-type':'application/json'},body:JSON.stringify({action:'duplicate',id:duplicateId,sourceId:quizId,bank:true,operationId:crypto.randomUUID()})}));assert.equal(duplicate.status,200,await duplicate.text());
await quizServer.shareQuiz(teachers[a],{id:quizId,revision:1,operationId:crypto.randomUUID(),visibility:'private'});
assert.equal((await getImage(students[b],image.data.id)).status,404,'withdrawal blocks new unrelated readers');assert.equal((await getImage(teachers[b],image.data.id)).status,200,'authorised private copy retains its image reference');
const copied=await quizServer.readQuiz(teachers[b],duplicateId);assert.equal(copied.content.questions[0].imageId,image.data.id);
const imageCount=sqlite.prepare('SELECT count(*) n FROM quiz_images WHERE group_id=?').get(b).n;putHook=async()=>{throw Error('simulated image object failure');};const failedImage=await uploadImage(teachers[b]);assert.equal(failedImage.status,503);const retriedImage=await uploadImage(teachers[b]);assert.equal(retriedImage.status,200);assert.equal(sqlite.prepare('SELECT count(*) n FROM quiz_images WHERE group_id=?').get(b).n,imageCount+1,'failed upload retries same reservation');
const usedImages=sqlite.prepare('SELECT sum(bytes) n FROM quiz_images WHERE group_id=?').get(a).n,usedPdf=quota(a);runtime.env.PDF_TOTAL_STORAGE_LIMIT_BYTES=String(usedPdf+usedImages+pdfBytes.length-1);assert.equal((await upload(teachers[a])).status,409,'PDF reservation includes image bytes');assert.equal(quota(a),usedPdf);runtime.env.PDF_TOTAL_STORAGE_LIMIT_BYTES='1000000';
assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
console.log('Part 01 files: private PDF authorization, two-group identity isolation, five reference families, shared quota, concurrent cleanup, R2 retries, revoked uploads, submission/cleanup race and public/copy image grants passed.');
