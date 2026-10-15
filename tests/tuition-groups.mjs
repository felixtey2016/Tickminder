import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {drizzle} from 'drizzle-orm/d1';
process.on('uncaughtException',error=>{console.error(error.name+': '+error.message);console.error(String(error.stack).split('\n').filter(line=>!line.includes('data:text/')).slice(0,8).join('\n'));process.exit(1);});

const sqlite=new DatabaseSync(':memory:');
const migrations=fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort();
for(const file of migrations)sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
function statement(sql,values=[]) {
  const execute=arrays=>{const st=sqlite.prepare(sql);if(arrays)st.setReturnArrays(true);const reading=st.columns().length>0;return reading?{results:st.all(...values),meta:{changes:0}}:{results:[],meta:st.run(...values)};};
  return {bind:(...v)=>statement(sql,v),all:async()=>execute(false),raw:async()=>execute(true).results,first:async()=>execute(false).results[0]||null,run:async()=>execute(false),execute:()=>execute(false)};
}
const d1={prepare:statement,batch:async stmts=>{sqlite.exec('BEGIN');try{const results=stmts.map(s=>s.execute());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const objects=new Map(),bucket={put:async(k,b)=>objects.set(k,Buffer.from(b)),delete:async k=>objects.delete(k),get:async k=>objects.has(k)?{body:objects.get(k),size:objects.get(k).length,httpMetadata:{contentType:'application/pdf'}}:null};
let cookieValues={},requestHeaders=new Headers(),googleProfile=null;
class JsonResponse extends Response {static json(data,options){const r=new JsonResponse(JSON.stringify(data),{...options,headers:{'content-type':'application/json',...options?.headers}});r.cookies={set:(name,value)=>cookieValues[name]=value,delete:name=>delete cookieValues[name]};return r;}}
const runtime={env:{DB:d1,BUCKET:bucket,GOOGLE_CLIENT_ID:'fixture-client'},cookies:async()=>({get:name=>cookieValues[name]?{value:cookieValues[name]}:undefined}),headers:async()=>requestHeaders,NextResponse:JsonResponse};
globalThis.__groups=runtime;
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-groups-')),stubPath=path.join(temporary,'runtime.mjs');
process.once('exit',()=>{const resolved=path.resolve(temporary);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('tickminder-groups-'))fs.rmSync(resolved,{recursive:true,force:true});});
fs.writeFileSync(stubPath,'export const {env,cookies,headers,NextResponse}=globalThis.__groups;'+['getDb','currentAccount','currentIdentity','currentBusinessAccount','createSession','hashToken','verifyGoogleCredential'].map(name=>`export const ${name}=(...args)=>globalThis.__groups.${name}(...args);`).join(''));
const stub=pathToFileURL(stubPath).href,cache=new Map();
function compile(file){if(cache.has(file))return cache.get(file);const output=path.join(temporary,file.replace(/\.ts$/,'.mjs')),url=pathToFileURL(output).href;cache.set(file,url);let source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');for(const [,spec]of [...source.matchAll(/from ["']([^"']+)["']/g)]){const replacement=['cloudflare:workers','next/headers','next/server','@/db','@/lib/auth'].includes(spec)?stub:spec.startsWith('@/')?compile(spec.slice(2)+'.ts'):spec.startsWith('.')?compile(path.posix.normalize(path.posix.join(path.posix.dirname(file),spec))+(spec.endsWith('.ts')?'':'.ts')):import.meta.resolve(spec);source=source.replaceAll('"'+spec+'"','"'+replacement+'"').replaceAll("'"+spec+"'","'"+replacement+"'");}fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);return url;}
async function load(file){const url=compile(file);return{url,module:await import(url)};}

const schema=(await load('db/schema.ts')).module;runtime.getDb=()=>drizzle(d1,{schema});
const auth=(await load('lib/auth.ts')).module;Object.assign(runtime,auth);runtime.verifyGoogleCredential=async()=>{if(!googleProfile)throw Error('No verified fixture identity');return googleProfile;};
const pw=(await load('lib/password.ts')).module;
const now=new Date().toISOString(),password='Fixture-pass-123',passwordHash=await pw.hashPassword(password);
sqlite.prepare("INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES('school-b','Test School B','school-b',?,?)").run(now,now);
for(const group of ['next-genn-edu','school-b']) {
  sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(group,'Teacher Same',now);
  sqlite.prepare('INSERT INTO students(group_id,name,name_key,created_at,grade) VALUES(?,?,?,?,?)').run(group,'Student Same','studentsame',now,'Form 3');
  sqlite.prepare('INSERT INTO plans(group_id,key,student,subject,teacher_name,created_at,subject_id) VALUES(?,?,?,?,?,?,?)').run(group,'Student Same|Science','Student Same','Science','Teacher Same',now,'science');
  for(const [suffix,role]of [['admin','admin'],['teacher','teacher'],['student','student'],['pending','pending']]) {
    const id=group+'-'+suffix;
    sqlite.prepare('INSERT INTO accounts(group_id,id,email,name,role,teacher_name,student_name,created_at,name_confirmed_at,activated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(group,id,id+'@example.test',id,role,role==='teacher'?'Teacher Same':null,role==='student'?'Student Same':null,now,now,role==='pending'?null:now);
    sqlite.prepare('INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES(?,?,?,0,?)').run(id,id,passwordHash,now);
  }
}
sqlite.prepare("INSERT INTO accounts(group_id,id,email,name,role,created_at,name_confirmed_at,activated_at) VALUES(NULL,'owner','felixtey2016@gmail.com','Platform Owner','admin',?,?,?)").run(now,now,now);
sqlite.prepare("INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES('owner','owner',?,0,?)").run(passwordHash,now);
async function login(id,groupHeader) {
  const token='fixture-session-'+crypto.randomUUID();cookieValues.tuition_session=token;requestHeaders=new Headers(groupHeader?{'x-tickminder-group':groupHeader}:{});
  sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run(await auth.hashToken(token),id,new Date(Date.now()+86400000).toISOString());
}
const routes={};for(const name of ['groups','state','action','classrooms','learning','files','manage','conflicts','lesson-history','notifications','auth','sheet-sync'])routes[name]=(await load('app/api/'+name+'/route.ts')).module;
const fileRoute=(await load('app/api/files/[id]/route.ts')).module;
const learning=(await load('lib/learning-server.ts')).module;
const groupData=(await load('lib/group-data.ts')).module;
const engine=(await load('lib/notifications-server.ts')).module;
function req(name,body,query='') {return new Request('https://test.invalid/api/'+name+query,body?{method:'POST',headers:{origin:'https://test.invalid','content-type':'application/json'},body:JSON.stringify(body)}:{});}
async function call(name,body,query=''){const response=await routes[name][body?'POST':'GET'](req(name,body,query));const data=await response.json();return{status:response.status,data};}
const ok=async(name,body,query)=>{const r=await call(name,body,query);assert.equal(r.status,200,JSON.stringify({name,status:r.status,data:r.data}));return r.data;};
const deny=async(name,body,query)=>{const r=await call(name,body,query);assert.ok([400,401,403,404,409,503].includes(r.status),JSON.stringify({name,...r}));return r;};

await login('next-genn-edu-admin','school-b');assert.equal(await auth.currentBusinessAccount(),null,'Group header cannot override ordinary membership');
await login('next-genn-edu-admin');assert.equal((await auth.currentBusinessAccount()).groupId,'next-genn-edu');
assert.equal((await ok('groups')).groups.length,1);await deny('groups',{action:'create',name:'Denied school'});await deny('groups',{action:'switch',id:'school-b'});
await deny('action',{action:'bind',userId:'school-b-pending',role:'admin'});
await deny('action',{action:'resetLocalPassword',userId:'school-b-admin',password:'Replace-pass-123'});
await deny('action',{action:'deleteAccount',userId:'school-b-teacher'});
assert.equal(sqlite.prepare("SELECT disabled_at FROM accounts WHERE id='school-b-teacher'").get().disabled_at,null);
await login('owner');assert.equal((await ok('groups')).groups.length,2);
const added=await ok('groups',{action:'create',name:'New Empty Group'});assert.ok(added.id);await ok('groups',{action:'switch',id:added.id});
let state=await ok('state',null,'?scope=core');assert.equal(state.lessons.length,0);assert.equal(state.teachers.length,0);assert.equal(state.allStudents.length,0);assert.equal(state.account.groupId,added.id);
await ok('action',{action:'createLocalAccount',username:'new-group-admin',password,name:'New Admin',role:'admin'});
assert.equal(sqlite.prepare("SELECT group_id FROM accounts WHERE name='New Admin'").get().group_id,added.id);
// Explicit header isolates concurrent owner tabs from the shared selection cookie.
await login('owner','next-genn-edu');assert.equal((await auth.currentBusinessAccount()).groupId,'next-genn-edu');
await login('owner','school-b');assert.equal((await auth.currentBusinessAccount()).groupId,'school-b');
const beforeTermCount=sqlite.prepare("SELECT count(*) n FROM academic_terms WHERE group_id='next-genn-edu'").get().n;
const fixtures={};
for(const group of ['next-genn-edu','school-b']) {
  await login(group+'-admin');
  const term=await ok('classrooms',{action:'saveTerm',name:'2026 Semester',isCurrent:true});
  const classroom=await ok('classrooms',{action:'saveClassroom',title:'Science Class',subject:'Science',syllabusId:'spm',subjectId:'science',grade:'Form 3',teacherName:'Teacher Same',students:['Student Same'],termId:term.id});
  const start=new Date(Date.now()+24*3600000).toISOString().slice(0,16),end=new Date(Date.now()+25*3600000).toISOString().slice(0,16);
  await ok('action',{action:'create',student:'Student Same',subject:'Science',teacherName:'Teacher Same',start,end});
  const lesson=sqlite.prepare('SELECT id FROM lessons WHERE group_id=?').get(group).id;
  await login(group+'-teacher');
  const form=new FormData();form.set('kind','material');form.set('classroomId',classroom.id);form.set('file',new File([Buffer.from('%PDF-1.7\nFixture '+group+'\nstartxref\n0\n%%EOF')],'fixture.pdf',{type:'application/pdf'}));
  let response=await routes.files.POST(new Request('https://test.invalid/api/files',{method:'POST',headers:{origin:'https://test.invalid'},body:form}));
  assert.equal(response.status,200);const file=await response.json();
  const material=await ok('learning',{action:'saveMaterial',title:group+' Material',subject:'Science',fileId:file.id,classroomId:classroom.id});
  const homework=await ok('learning',{action:'publishHomework',title:group+' Homework',subject:'Science',description:'Science questions',startsAt:'2026-01-01T00:00',dueAt:'2027-01-01T00:00',classroomId:classroom.id,scoreEnabled:true,maxScore:10});
  fixtures[group]={term:term.id,classroom:classroom.id,lesson,file:file.id,material:material.id,homework:homework.id};
  state=await ok('state',null,'?scope=learning');assert.equal(state.learning.materials.length,1);assert.equal(state.learning.homework.length,1);
  state=await ok('state',null,'?scope=classrooms');assert.equal(state.classrooms.length,1);assert.equal(state.terms.length,1);
}
assert.equal(sqlite.prepare("SELECT count(*) n FROM academic_terms WHERE group_id='next-genn-edu'").get().n,beforeTermCount+1);
const a=fixtures['next-genn-edu'],b=fixtures['school-b'];
await login('school-b-student');
const submitForm=new FormData();submitForm.set('kind','submission');submitForm.set('homeworkId',b.homework);submitForm.set('file',new File([Buffer.from('%PDF-1.7\nSubmission\nstartxref\n0\n%%EOF')],'submission.pdf',{type:'application/pdf'}));
const submitUpload=await routes.files.POST(new Request('https://test.invalid/api/files',{method:'POST',headers:{origin:'https://test.invalid'},body:submitForm}));assert.equal(submitUpload.status,200);const submissionFile=await submitUpload.json();
await ok('learning',{action:'submitHomework',homeworkId:b.homework,fileId:submissionFile.id,revision:1});
await ok('learning',{action:'submitHomework',homeworkId:b.homework,fileId:submissionFile.id,revision:1});assert.equal(sqlite.prepare('SELECT count(*) n FROM homework_submissions WHERE homework_id=?').get(b.homework).n,1);
await login('school-b-teacher');await ok('learning',{action:'setHomeworkScore',homeworkId:b.homework,studentName:'Student Same',score:8,revision:1,scoreRevision:1,submissionId:sqlite.prepare('SELECT id FROM homework_submissions WHERE homework_id=?').get(b.homework).id});
await login('school-b-admin');assert.equal((await ok('state',null,'?scope=learning')).learning.homework[0].scores[0].score,8);
assert.equal(sqlite.prepare('SELECT count(*) n FROM storage_quota').get().n,2);
for(const role of ['admin','teacher','student','pending']) {
  await login('next-genn-edu-'+role);state=await ok('state',null,'?scope=core');assert.equal(state.lessons.length,role==='pending'?0:1);
  assert.ok(!JSON.stringify(state).includes(b.lesson));
  const account=await auth.currentBusinessAccount();assert.equal(await learning.pdfMayRead(account,b.file),null);
  if(role!=='pending'){assert.ok(await learning.pdfMayRead(account,a.file));const r=await fileRoute.GET(req('files'),{params:Promise.resolve({id:b.file})});assert.equal(r.status,404);}
  await deny('lesson-history',null,'?lessonId='+b.lesson);
}
await login('next-genn-edu-admin');
await deny('action',{action:'cancel',id:b.lesson});
await deny('classrooms',{action:'archiveClassroom',id:b.classroom,archived:true});
await deny('classrooms',{action:'saveTerm',id:b.term,name:'Changed foreign term'});
await deny('manage',{action:'permanentDelete',kind:'classroom',id:b.classroom,confirm:true});
await deny('conflicts',{action:'edit',id:b.lesson,start:'2026-10-25T18:00',end:'2026-10-25T19:00'});
await login('next-genn-edu-student');await deny('learning',{action:'submitHomework',homeworkId:b.homework,fileId:b.file});
await login('next-genn-edu-teacher');await deny('learning',{action:'setHomeworkScore',homeworkId:b.homework,studentName:'Student Same',score:10});
// Lessons with identical names and times in different groups do not conflict.
const same=sqlite.prepare('SELECT planned_start,planned_end FROM lessons WHERE id=?').get(a.lesson);assert.equal(sqlite.prepare('SELECT planned_start FROM lessons WHERE id=?').get(b.lesson).planned_start,same.planned_start);
// Course changes and background reminders never use same-name foreign recipients.
const inbox=(await load('lib/inbox-server.ts')).module;
await inbox.recordLessonChange({groupId:'next-genn-edu',lessonId:a.lesson,actorId:'next-genn-edu-admin',action:'reschedule',before:{plannedStart:same.planned_start},after:{plannedStart:same.planned_start},at:now});
assert.equal(sqlite.prepare("SELECT count(*) n FROM site_notifications WHERE account_id LIKE 'school-b-%'").get().n,0);
assert.equal(sqlite.prepare("SELECT count(*) n FROM site_notifications WHERE account_id='owner'").get().n,1);
await login('school-b-admin');assert.equal((await ok('notifications')).unreadCount,0);
await login('owner','next-genn-edu');assert.equal((await ok('notifications')).unreadCount,1);
await login('owner','school-b');assert.equal((await ok('notifications')).unreadCount,0);
const future=Date.now()+30*60000;for(const fixture of [a,b])sqlite.prepare('UPDATE lessons SET planned_start=?,planned_end=? WHERE id=?').run(new Date(future).toISOString(),new Date(future+3600000).toISOString(),fixture.lesson);
await engine.generateReminders(future-30*60000);
const wrong=sqlite.prepare('SELECT count(*) n FROM notification_items n JOIN accounts a ON a.id=n.account_id JOIN lessons l ON l.id=n.lesson_id WHERE n.group_id<>l.group_id OR a.group_id<>l.group_id').get().n;assert.equal(wrong,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM notification_items').get().n,4);
// Same-name removals only affect the current group's plan and roster.
await login('next-genn-edu-admin');await ok('action',{action:'saveTeacher',name:'Unused Same',active:true});
await login('school-b-admin');await ok('action',{action:'saveTeacher',name:'Unused Same',active:true});
await login('next-genn-edu-admin');await ok('manage',{action:'permanentDelete',kind:'teacher',id:'Unused Same',confirm:true});assert.equal(sqlite.prepare("SELECT count(*) n FROM teachers WHERE name='Unused Same' AND group_id='school-b'").get().n,1);
// Ordinary identity cannot move groups, including via merge or an old invitation.
assert.throws(()=>sqlite.prepare("UPDATE accounts SET group_id='school-b' WHERE id='next-genn-edu-admin'").run(),/immutable/);
const merger=(await load('lib/account-merge.ts')).module;assert.ok((await merger.prepareAccountMerge(await auth.currentBusinessAccount(),'school-b-pending',true)).error);
googleProfile={id:'new-google',name:'New Google',email:'new-google@example.test'};
let registered=await ok('auth',{credential:'fixture-verified-provider',groupCode:'school-b'});assert.equal(registered.account.groupId,'school-b');
registered=await ok('auth',{credential:'fixture-verified-provider',groupCode:'next-genn-edu'});assert.equal(registered.account.groupId,'school-b');
googleProfile={id:'invalid-google',name:'Invalid',email:'invalid@example.test'};await deny('auth',{credential:'fixture-verified-provider',groupCode:'not-an-invitation'});assert.equal(sqlite.prepare("SELECT count(*) n FROM accounts WHERE id='invalid-google'").get().n,0);
await login('school-b-admin');assert.equal((await call('sheet-sync',{action:'preview',mode:'billable'})).status,503,'Foreign groups cannot use Next Genn Sheet');
await login('owner');await ok('groups',{action:'update',id:'school-b',name:'Test School B',active:false});await login('school-b-admin');assert.equal(await auth.currentBusinessAccount(),null);assert.equal((await ok('auth')).account.groupUnavailable,true);assert.equal((await call('state',null,'?scope=core')).status,401);
await login('owner','school-b');assert.equal((await auth.currentBusinessAccount()).groupId,'school-b');await ok('groups',{action:'update',id:'school-b',name:'Test School B',active:true});
// SQLite statement views cannot be bypassed by a caller-supplied ID or nested join.
assert.equal((await groupData.groupRows('next-genn-edu','SELECT * FROM teachers WHERE name IN (SELECT teacher_name FROM plans)')).length,1);
assert.throws(()=>groupData.groupRead('next-genn-edu','SELECT * FROM main.accounts'),/Invalid group/);
assert.equal(sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
sqlite.close();
console.log('PASS tuition groups: same-name isolation; owner console/create/switch; ordinary scope spoof denied; account changes/PDF/homework/class/term/history/delete isolation; independent quotas; fixed identity/invitations; pause; background recipients; integration guard; integrity. Google signature provider is mocked only for registration routing.');
