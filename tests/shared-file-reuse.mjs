import originalAssert from 'node:assert/strict';
let checks=0;const assert=new Proxy(originalAssert,{get:(target,key)=>typeof target[key]==='function'? (...args)=>{checks++;return target[key](...args);}:target[key]});
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync,backup} from 'node:sqlite';
import ts from 'typescript';

// Actual handlers, access queries, storage cleanup and SQLite; identity and R2
// are local fixtures. No request or fixture is sent to a hosted environment.
const sqlite=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
let beforeStatement=null,beforeBatch=null,putHook=null,deleteHook=null,getHook=null,actor=null;
function statement(sql,values=[]){
 const execute=()=>{if(beforeStatement){const hook=beforeStatement;beforeStatement=null;hook(sql,values);}const st=sqlite.prepare(sql);return st.columns().length?{results:st.all(...values),meta:{changes:0}}:{results:[],meta:st.run(...values)};};
 return {bind:(...v)=>statement(sql,v),all:async()=>execute(),first:async()=>execute().results[0]||null,run:async()=>execute(),execute};
}
const db={prepare:statement,batch:async statements=>{if(beforeBatch){const hook=beforeBatch;beforeBatch=null;await hook();}sqlite.exec('BEGIN');try{const r=statements.map(s=>s.execute());sqlite.exec('COMMIT');return r;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
const objects=new Map(),deletes=[];
const bucket={put:async(key,bytes)=>{objects.set(key,Buffer.from(bytes));if(putHook){const hook=putHook;putHook=null;await hook();}},get:async key=>{if(getHook){const hook=getHook;getHook=null;await hook();}return objects.has(key)?{body:objects.get(key),size:objects.get(key).length}:null;},head:async key=>objects.has(key)?{size:objects.get(key).length}:null,delete:async key=>{deletes.push(key);if(deleteHook){const hook=deleteHook;deleteHook=null;await hook();}objects.delete(key);}};
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
function fixturePdf(){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R >>','<< /Length 0 >>\nstream\n\nendstream'];
 let content='%PDF-1.4\n',offsets=[0];for(const [index,object]of objects.entries()){offsets.push(Buffer.byteLength(content));content+=(index+1)+' 0 obj\n'+object+'\nendobj\n';}
 const start=Buffer.byteLength(content);content+='xref\n0 5\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n';return Buffer.from(content);
}
const [a,b]=groups,pdfBytes=fixturePdf();
function quota(group){return sqlite.prepare('SELECT used_bytes AS n FROM storage_quota WHERE group_id=? AND id=1').get(group).n;}
function seedFile(group,{kind='material',context=classes[group],owner=teachers[group].id,status='staged',createdAt=now,bytes=pdfBytes.length}={}){
 const id=crypto.randomUUID(),key='fixture/'+id;
 sqlite.prepare('INSERT INTO pdf_files(id,group_id,object_key,owner_id,kind,context_id,filename,bytes,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,group,key,owner,kind,context,'fixture.pdf',bytes,status,createdAt);
 sqlite.prepare('UPDATE storage_quota SET used_bytes=used_bytes+? WHERE group_id=? AND id=1').run(bytes,group);objects.set(key,bytes===pdfBytes.length?Buffer.from(pdfBytes):Buffer.alloc(bytes));return{id,key,bytes};
}
async function upload(as,kind='material',extra={}){
 actor=as;const form=new FormData();form.set('kind',kind);form.set('classroomId',classes[as.groupId]);if(kind==='submission')form.set('homeworkId',homework[as.groupId]);for(const [k,v]of Object.entries(extra))form.set(k,v);form.set('file',new File([pdfBytes],'fixture.pdf',{type:'application/pdf'}));
 const r=await uploads.POST(new Request('https://files.test/api/files',{method:'POST',headers:{origin:'https://files.test'},body:form}));return {status:r.status,data:await r.json()};
}
async function getFile(as,id,query=''){actor=as;return files.GET(new Request('https://files.test/api/files/'+id+query),{params:Promise.resolve({id})});}

const resources=await load('lib/resource-catalog-server.ts'),binary=await load('app/api/resources/file/route.ts'),sources=await load('lib/shared-pdf.ts'),refs=await load('lib/file-references.ts'),versions=await load('lib/learning-versions.ts'),sessions=await load('lib/account-session.ts');
const teacher2={...teachers[a],id:'file-group-a-teacher2',email:'teacher2@example.test',teacherName:'Second Teacher',name:'Second Teacher'};
sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(a,teacher2.teacherName,now);
sqlite.prepare('INSERT INTO accounts(id,group_id,email,name,role,teacher_name,created_at) VALUES(?,?,?,?,?,?,?)').run(teacher2.id,a,teacher2.email,teacher2.name,'teacher',teacher2.teacherName,now);
sqlite.prepare('INSERT INTO plans(group_id,key,student,subject,teacher_name,created_at,subject_id) VALUES(?,?,?,?,?,?,?)').run(a,'second-science','Same Student','Science',teacher2.teacherName,now,'science');
const class2=crypto.randomUUID();
sqlite.prepare('INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_at,updated_at,created_by) VALUES(?,?,?,?,?,?,?,?)').run(class2,a,'Second Science','Science',teacher2.teacherName,now,now,teacher2.id);
sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),a,class2,'Same Student',now);
const pdf=seedFile(a,{status:'attached'}),initial=crypto.randomUUID();
sqlite.prepare('INSERT INTO teaching_materials(id,group_id,owner_id,title,file_id,created_at,classroom_id) VALUES(?,?,?,?,?,?,?)').run(initial,a,teachers[a].id,'Authorized textbook v1',pdf.id,now,classes[a]);
const fields={title:'Authorized shared textbook',description:'Local fictional fixture',syllabusId:'spm',subjectId:'science',resourceType:'original',sourceName:'Fictional author',sourceUrl:'https://example.test/textbook',licenseType:'original',authorizationNote:'The fictional author explicitly permits group reuse.'};
const op=()=>crypto.randomUUID();
const created=await resources.saveResource(teachers[a],{...fields,action:'create',operationId:op(),kind:'file',fileId:pdf.id});
const resourceId=created.id;
assert.equal((await sources.assertReusablePdfSource(teachers[a],pdf.id)).fileId,pdf.id);
await assert.rejects(sources.assertReusablePdfSource(teacher2,pdf.id));
await assert.rejects(sources.assertReusablePdfSource(teachers[b],pdf.id));
const staged=seedFile(a);await assert.rejects(sources.assertReusablePdfSource(teachers[a],staged.id));
const privateSubmission=seedFile(a,{kind:'submission',status:'attached'});await assert.rejects(sources.assertReusablePdfSource(teachers[a],privateSubmission.id));

const stateRevision=id=>sqlite.prepare('SELECT revision FROM classroom_content_state WHERE classroom_id=?').get(id).revision;
async function assign(as,classroomId){return resources.saveResource(as,{action:'assign',id:resourceId,classroomId,folderId:'',contentRevision:stateRevision(classroomId),resourceRevision:1,operationId:op()});}
const placed1=await assign(teachers[a],classes[a]),placed2=await assign(teacher2,class2);
assert.equal(sqlite.prepare('SELECT count(*) n FROM resource_assignments WHERE file_id=?').get(pdf.id).n,2);
const quotaBefore=quota(a),objectsBefore=objects.size;
async function publish(as,action,extra={}){
 actor=as;const response=await learningRoute.POST(new Request('https://files.test/api/learning',{method:'POST',headers:{origin:'https://files.test','content-type':'application/json'},body:JSON.stringify({action,title:'Reused '+action,description:'Fictional practice',subject:'Science',classroomId:class2,startsAt:'2020-01-01T08:00',dueAt:'2099-01-01T08:00',resourceId,...extra})}));return{status:response.status,body:await response.json()};
}
const m2=await publish(teacher2,'saveMaterial'),h2=await publish(teacher2,'publishHomework');
assert.equal(m2.status,200,JSON.stringify(m2));assert.equal(h2.status,200,JSON.stringify(h2));
assert.equal(sqlite.prepare('SELECT file_id FROM teaching_materials WHERE id=?').get(m2.body.id).file_id,pdf.id);
assert.equal(sqlite.prepare('SELECT attachment_file_id FROM homework WHERE id=?').get(h2.body.id).attachment_file_id,pdf.id);
assert.equal(quota(a),quotaBefore);assert.equal(objects.size,objectsBefore);
assert.equal((await getFile(teacher2,pdf.id)).status,200,'recipient teacher follows own material, not original ownership');
async function resourceGet(as,assignmentId='',extra=''){actor=as;return binary.GET(new Request('https://files.test/api/resources/file?resourceId='+resourceId+(assignmentId?'&assignmentId='+assignmentId:'')+extra));}
assert.equal((await resourceGet(students[a],placed1.assignmentId)).status,200);
assert.equal((await resourceGet(students[a])).status,403);
assert.equal((await resourceGet(students[b],placed1.assignmentId)).status,404);
assert.equal((await resourceGet(teachers[b])).status,404);
assert.equal((await resourceGet(null)).status,401);
const successful=await resourceGet(teachers[a]);assert.equal(successful.headers.get('cache-control'),'private, no-store');assert.equal(successful.headers.get('content-security-policy'),'sandbox');
const catalog=await resources.resourceCatalogList(teacher2,new URLSearchParams({view:'catalog',kind:'file',scope:'group'}));
assert.equal(catalog.items.find(item=>item.id===resourceId).fileId,pdf.id);
assert.equal(JSON.stringify(catalog).includes('objectKey'),false);assert.equal(JSON.stringify(catalog).includes('sha256'),false);
assert.throws(()=>sqlite.prepare('UPDATE pdf_files SET object_key=? WHERE id=?').run('overwritten',pdf.id),/immutable PDF/);
assert.throws(()=>sqlite.prepare('UPDATE pdf_files SET bytes=bytes+1 WHERE id=?').run(pdf.id),/immutable PDF/);
assert.throws(()=>sqlite.prepare('UPDATE resource_catalog SET file_id=? WHERE id=?').run(staged.id,resourceId),/immutable/);
assert.throws(()=>sqlite.prepare('UPDATE learning_versions SET snapshot_json=? WHERE record_id=?').run('{}',h2.body.id),/immutable learning/);

const submitted=seedFile(a,{owner:students[a].id,kind:'submission',context:h2.body.id});actor=students[a];
const submissionResponse=await learningRoute.POST(new Request('https://files.test/api/learning',{method:'POST',headers:{origin:'https://files.test','content-type':'application/json'},body:JSON.stringify({action:'submitHomework',homeworkId:h2.body.id,fileId:submitted.id,revision:1,previousSubmissionId:''})}));
assert.equal(submissionResponse.status,200,await submissionResponse.text());

// Replacement creates a new physical entity and a new immutable content version.
const replacement=seedFile(a,{owner:teacher2.id,kind:'homework',context:class2});
const edit={id:h2.body.id,revision:1,requestId:op(),title:'Homework version two',description:'New requirements',startsAt:'2020-01-01T08:00',dueAt:'2099-01-01T08:00',fileId:replacement.id};
assert.equal((await versions.editPublishedContent(teacher2,'homework',edit)).revision,2);
assert.equal(sqlite.prepare("SELECT file_id FROM learning_versions WHERE record_id=? AND revision=1").get(h2.body.id).file_id,pdf.id);
assert.equal(sqlite.prepare("SELECT file_id FROM learning_versions WHERE record_id=? AND revision=2").get(h2.body.id).file_id,replacement.id);
assert.equal((await getFile(teacher2,pdf.id)).status,200);
assert.equal((await versions.editPublishedContent(teacher2,'homework',edit)).replayed,true);
assert.equal(sqlite.prepare('SELECT homework_revision FROM homework_submissions WHERE file_id=?').get(submitted.id).homework_revision,1);
assert.equal((await getFile(students[a],pdf.id)).status,200,'authorized old content version remains readable');
const restoreFromCatalog={...edit,revision:2,requestId:op(),fileId:'',resourceId,title:'Homework shared version three'};
assert.equal((await versions.editPublishedContent(teacher2,'homework',restoreFromCatalog)).revision,3);
assert.equal(sqlite.prepare('SELECT file_id FROM learning_versions WHERE record_id=? AND revision=3').get(h2.body.id).file_id,pdf.id);
assert.equal(sqlite.prepare('SELECT file_id FROM learning_versions WHERE record_id=? AND revision=2').get(h2.body.id).file_id,replacement.id);

// Existing native URLs also recheck after the R2 await, including identity/session.
getHook=()=>sqlite.prepare('DELETE FROM classroom_members WHERE classroom_id=?').run(class2);
assert.equal((await getFile(students[a],pdf.id)).status,404,'membership revoked while R2 yields');
sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(op(),a,class2,'Same Student',now);
getHook=()=>sqlite.prepare('UPDATE plans SET active=0 WHERE group_id=? AND teacher_name=?').run(a,teacher2.teacherName);
assert.equal((await getFile(students[a],pdf.id)).status,404,'plan revoked while R2 yields');
sqlite.prepare('UPDATE plans SET active=1 WHERE group_id=? AND teacher_name=?').run(a,teacher2.teacherName);
getHook=()=>sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,teachers[a].id);
assert.equal((await getFile(teachers[a],pdf.id)).status,404,'owner disabled while R2 yields');
sqlite.prepare('UPDATE accounts SET disabled_at=NULL WHERE id=?').run(teachers[a].id);
const nativeSessionActor={...teacher2},nativeSession='fictional-pdf-read-session';sessions.bindAccountSession(nativeSessionActor,nativeSession);
sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run(nativeSession,teacher2.id,'2099-01-01T00:00:00.000Z');
getHook=()=>sqlite.prepare('DELETE FROM sessions WHERE token_hash=?').run(nativeSession);
assert.equal((await getFile(nativeSessionActor,pdf.id)).status,404,'logout while R2 yields');
const admin={id:a+'-admin',groupId:a,role:'admin',name:'admin',email:a+'-admin@example.test',teacherName:null,studentName:null};
sqlite.prepare("INSERT INTO admin_permission_profiles(group_id,account_id,grants_json,origin,updated_at) VALUES(?,?,?,'new',?)").run(a,admin.id,'["materials.view"]',now);
runtime.env.ADMIN_PERMISSIONS_MODE='enforced';
assert.equal((await getFile(admin,pdf.id)).status,200,'materials-only admin can read a material');
getHook=()=>sqlite.prepare('UPDATE admin_permission_profiles SET grants_json=? WHERE group_id=? AND account_id=?').run('[]',a,admin.id);
assert.equal((await getFile(admin,pdf.id)).status,404,'admin material grant revoked while R2 yields');
runtime.env.ADMIN_PERMISSIONS_MODE=undefined;

// Optional export for a local browser fixture. It contains only invented data
// and local session cookies, before withdrawal/cleanup deliberately alter it.
if(process.env.SHARED_FILE_QA_DIR){
 const output=path.resolve(process.env.SHARED_FILE_QA_DIR);fs.mkdirSync(output,{recursive:true});
 const identities=[teachers[a],teacher2,students[a],teachers[b],students[b]],cookies=[];
 for(const identity of identities){const value='fictional-shared-file-'+identity.id,hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('base64url');sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run(hash,identity.id,'2099-01-01T00:00:00.000Z');cookies.push({accountId:identity.id,role:identity.role,groupId:identity.groupId,name:'tuition_session',value});}
 await backup(sqlite,path.join(output,'fixture.sqlite'));
 fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify({groupId:a,classes:[classes[a],class2],resourceId,assignments:[placed1.assignmentId,placed2.assignmentId],materialId:m2.body.id,homeworkId:h2.body.id,cookies,objects:[...objects].map(([key,value])=>({key,base64:value.toString('base64')}))},null,2));
 console.log('Fictional shared file browser fixture exported to '+output);
}

// Live scopes are re-evaluated in the write, including session logout and source withdrawal.
beforeBatch=()=>sqlite.prepare('UPDATE resource_catalog SET active=0 WHERE id=?').run(resourceId);
const denied=await publish(teacher2,'saveMaterial');assert.equal(denied.status,409);assert.equal(sqlite.prepare('SELECT count(*) n FROM teaching_materials WHERE file_id=?').get(pdf.id).n,2);
sqlite.prepare('UPDATE resource_catalog SET active=1 WHERE id=?').run(resourceId);
const sessionActor={...teacher2},token='fictional-bound-session';sessions.bindAccountSession(sessionActor,token);
sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run(token,teacher2.id,'2099-01-01T00:00:00.000Z');
beforeBatch=()=>sqlite.prepare('DELETE FROM sessions WHERE token_hash=?').run(token);
assert.equal((await publish(sessionActor,'publishHomework')).status,409);

// Remove one placement: the other class and its homework stay readable.
await resources.saveResource(teachers[a],{action:'revoke',id:resourceId,classroomId:classes[a],contentRevision:stateRevision(classes[a]),resourceRevision:1,assignmentRevision:1,operationId:op()});
assert.equal((await resourceGet(students[a],placed1.assignmentId)).status,404);
assert.equal((await resourceGet(students[a],placed2.assignmentId)).status,200);
await storage.deleteUnreferencedFile(pdf.id);assert.ok(objects.has(pdf.key));assert.equal(quota(a),quotaBefore+replacement.bytes+submitted.bytes);
await resources.saveResource(teacher2,{action:'revoke',id:resourceId,classroomId:class2,contentRevision:stateRevision(class2),resourceRevision:1,assignmentRevision:1,operationId:op()});
await resources.saveResource(teachers[a],{action:'archive',id:resourceId,revision:1,operationId:op()});
sqlite.prepare('DELETE FROM teaching_materials WHERE id IN(?,?)').run(initial,m2.body.id);
sqlite.prepare('DELETE FROM homework WHERE id=?').run(h2.body.id);
await storage.deleteUnreferencedFile(pdf.id);assert.ok(objects.has(pdf.key),'archived catalogue and assignment history retain bytes');
assert.equal((await resourceGet(teacher2)).status,404,'archive closes new catalog access');

// Extended references grant retention, never cross-group access. No active or
// historic references at all is the existing explicit reclamation boundary.
const disposable=seedFile(a,{status:'attached'}),otherBefore=quota(b),before=quota(a);
await refs.retainFileReference({groupId:a,assetKind:'pdf',fileId:disposable.id,sourceKind:'chat',sourceId:'fictional-message'}).run();
await storage.deleteUnreferencedFile(disposable.id);assert.ok(objects.has(disposable.key));assert.equal(quota(a),before);
await assert.rejects(refs.retainFileReference({groupId:b,assetKind:'pdf',fileId:disposable.id,sourceKind:'chat',sourceId:'cross-group'}).run(),/invalid stored file reference/);
await refs.releaseFileReference({groupId:a,assetKind:'pdf',fileId:disposable.id,sourceKind:'chat',sourceId:'fictional-message'}).run();
await Promise.all([storage.deleteUnreferencedFile(disposable.id),storage.deleteUnreferencedFile(disposable.id)]);
assert.equal(objects.has(disposable.key),false);assert.equal(quota(a),before-disposable.bytes);assert.equal(quota(b),otherBefore);
const raced=seedFile(a,{status:'attached'});
deleteHook=async()=>{await assert.rejects(refs.retainFileReference({groupId:a,assetKind:'pdf',fileId:raced.id,sourceKind:'chat',sourceId:'too-late'}).run(),/invalid stored file reference/);};
await storage.deleteUnreferencedFile(raced.id);assert.equal(objects.has(raced.key),false);
const retainedRace=seedFile(a,{status:'attached'});
const attachBeforeClaim=(sql)=>{if(sql.startsWith('UPDATE pdf_files AS f'))sqlite.prepare('INSERT INTO file_extra_references VALUES(?,?,?,?,?,?)').run(a,'pdf',retainedRace.id,'chat','claimed-before-collector',now);else beforeStatement=attachBeforeClaim;};beforeStatement=attachBeforeClaim;
await storage.deleteUnreferencedFile(retainedRace.id);assert.ok(objects.has(retainedRace.key));
// The final SQL transaction is retryable even if its quota update fails.
const retry=seedFile(a,{status:'attached'}),retryBefore=quota(a);
beforeBatch=()=>sqlite.exec("CREATE TRIGGER fail_fixture_quota BEFORE UPDATE ON storage_quota BEGIN SELECT RAISE(ABORT,'fictional quota failure'); END;");
await assert.rejects(storage.deleteUnreferencedFile(retry.id),/fictional quota failure/);
assert.equal(sqlite.prepare('SELECT status FROM pdf_files WHERE id=?').get(retry.id).status,'deleting');assert.equal(quota(a),retryBefore);
sqlite.exec('DROP TRIGGER fail_fixture_quota');await storage.deleteUnreferencedFile(retry.id);assert.equal(quota(a),retryBefore-retry.bytes);

// The extension accepts separate asset families without merging their stores,
// visibility or accounting. PDF GC cannot reclaim a logo or a quiz image.
const logo=op(),image=op();
sqlite.prepare('INSERT INTO invoice_brand_assets(id,group_id,object_key,bytes,width,height,created_at,created_by) VALUES(?,?,?,?,1,1,?,?)').run(logo,a,'fixture-logo/'+logo,10,now,teachers[a].id);
sqlite.prepare("INSERT INTO quiz_images(id,group_id,owner_id,object_key,filename,mime,bytes,sha256,status,created_at) VALUES(?,?,?,?,?,'image/png',10,?,'ready',?)").run(image,a,teachers[a].id,'fixture-image/'+image,'fixture.png','fictional-hash',now);
for(const [assetKind,fileId,table]of [['invoice_logo',logo,'invoice_brand_assets'],['quiz_image',image,'quiz_images']]){
 assert.throws(()=>refs.retainFileReference({groupId:a,assetKind,fileId,sourceKind:'future_version',sourceId:'version1'}),/Unsupported retention asset kind/);
 assert.throws(()=>sqlite.prepare('INSERT INTO file_extra_references VALUES(?,?,?,?,?,?)').run(a,assetKind,fileId,'future_version','version1',now),/unsupported retention asset kind/);
 await storage.deleteUnreferencedFile(fileId);assert.ok(sqlite.prepare(`SELECT id FROM ${table} WHERE id=?`).get(fileId));
 await refs.releaseFileReference({groupId:a,assetKind,fileId,sourceKind:'future_version',sourceId:'version1'}).run();
}
assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
console.log(`Shared file reuse: ${checks} SQLite checks passed (one entity, two classes plus homework, current authorization, immutable history, archived refs, atomic quota and GC races).`);
