import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {drizzle} from 'drizzle-orm/d1';
import ts from 'typescript';

// Real routes, validators, grants, authority checks and all migrations. Only
// authentication and the hosted runtime are replaced; every record is fictional.
const sqlite=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
sqlite.exec('PRAGMA foreign_keys=ON');
let beforeBatch=null,failAt=-1,actor;
function statement(sql,values=[]){
 const execute=arrays=>{const prepared=sqlite.prepare(sql);if(arrays)prepared.setReturnArrays(true);return prepared.columns().length?{results:prepared.all(...values),meta:{changes:0}}:{results:[],meta:prepared.run(...values)};};
 return {sql,bind:(...next)=>statement(sql,next),first:async()=>execute(false).results[0]||null,all:async()=>execute(false),raw:async()=>execute(true).results,run:async()=>execute(false),execute:()=>execute(false)};
}
const d1={prepare:statement,async batch(items){const hook=beforeBatch,fail=failAt;beforeBatch=null;failAt=-1;hook?.();sqlite.exec('BEGIN');try{const results=items.map((item,index)=>{if(index===fail)throw Error('fictional injected failure');return item.execute();});sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
const runtime={env:{DB:d1,ADMIN_PERMISSIONS_MODE:'enforced'},currentBusinessAccount:async()=>actor,currentAccount:async()=>actor,NextResponse:{json:(value,options)=>Response.json(value,options)},getDb:()=>drizzle(d1)};
globalThis.__accountProvisioning=runtime;
const stub='data:text/javascript;base64,'+Buffer.from('export const {env,currentBusinessAccount,currentAccount,NextResponse,getDb}=globalThis.__accountProvisioning;').toString('base64'),root=new URL('../',import.meta.url).href;
registerHooks({resolve(specifier,context,next){
 if(['cloudflare:workers','next/server','@/db','@/lib/auth'].includes(specifier)||specifier==='./auth'&&context.parentURL?.startsWith(root))return {url:stub,shortCircuit:true};
 if(specifier.startsWith('@/'))return {url:new URL(specifier.slice(2)+'.ts',root).href,shortCircuit:true};
 if(specifier.startsWith('.')&&context.parentURL?.startsWith(root)&&context.parentURL.endsWith('.ts'))return {url:new URL(/\.[cm]?[jt]sx?$/.test(specifier)?specifier:specifier+'.ts',context.parentURL).href,shortCircuit:true};
 return next(specifier,context);
},load(url,context,next){if(url.startsWith(root)&&url.endsWith('.ts'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};return next(url,context);}});
const classroomRoute=await import('../app/api/classrooms/route.ts'),manage=await import('../app/api/manage/route.ts'),action=await import('../app/api/action/route.ts'),permissions=await import('../lib/admin-permissions.ts'),names=await import('../lib/student-names.ts');

const now=new Date().toISOString(),group='next-genn-edu',otherGroup='classroom-foreign';
sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(otherGroup,'Fictional other','classroom-foreign',now,now);
function account(id,role='admin',groupId=group,teacherName=null,studentName=null){sqlite.prepare('INSERT INTO accounts(group_id,id,email,name,role,teacher_name,student_name,created_at,activated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(groupId,id,'',id,role,teacherName,studentName,now,now);return{id,groupId,email:'',name:id,role,teacherName,studentName};}
const chief=account('classroom-chief'),foreign=account('classroom-foreign-chief','admin',otherGroup),teacher=account('classroom-teacher','teacher',group,'Teacher A'),studentActor=account('classroom-student','student',group,null,'Unlinked Student');
for(const a of[chief,foreign])sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run(a.id,a.groupId);
const checks=[];function check(value,label){assert(value,label);checks.push(label);}
const count=(table)=>sqlite.prepare('SELECT count(*) n FROM '+table+' WHERE group_id=?').get(group).n;
async function call(route,body,expected=200,as=chief){actor=as;const response=await route.POST(new Request('https://fictional.invalid/api/'+(route===action?'action':route===manage?'manage':'classrooms'),{method:'POST',headers:{origin:'https://fictional.invalid','content-type':'application/json'},body:JSON.stringify(body)}));const value=await response.json();assert.equal(response.status,expected,JSON.stringify({body:{...body,password:undefined},value}));checks.push(body.action+' status '+expected);return value;}
await call(action,{action:'saveTeacher',name:'Teacher A',active:true});
for(const name of['Student A','Student B']){
 sqlite.prepare("INSERT INTO students(group_id,name,name_key,active,syllabus_id,grade,age,created_at) VALUES(?,?,?,1,'igcse','Year 7',12,?)").run(group,name,name.toLowerCase(),now);
 await call(action,{action:'savePlan',student:name,teacherName:'Teacher A',subjectId:'mathematics',duration:1,active:true});
}
check(count('classrooms')===0,'Saving active pairings never provisions classrooms');
const newClass={action:'saveClassroom',title:'Explicit classroom',teacherName:'Teacher A',syllabusId:'igcse',subjectId:'mathematics',grade:'Year 7',students:['Student A','Student B']};
const created=await call(classroomRoute,newClass);check(count('classrooms')===1,'Only explicit create adds a classroom');
await call(classroomRoute,{...newClass,id:created.id,students:['Student B']});
check(sqlite.prepare('SELECT count(*) n FROM classroom_members WHERE student_name=?').get('Student A').n===0,'Removing final membership is permitted');
check(sqlite.prepare('SELECT active FROM plans WHERE student=?').get('Student A').active===1,'Member removal leaves pairing active');
await call(classroomRoute,{action:'archiveClassroom',id:created.id,archived:true});
check(sqlite.prepare('SELECT active FROM plans WHERE student=?').get('Student B').active===1,'Archiving final class leaves pairing active');
await call(classroomRoute,{action:'archiveClassroom',id:created.id,archived:false});
check(sqlite.prepare('SELECT archived FROM classrooms WHERE id=?').get(created.id).archived===0,'Ordinary archive supports explicit manual restore');
await call(classroomRoute,{action:'archiveClassroom',id:created.id,archived:true},404,foreign);
await call(classroomRoute,{action:'archiveClassroom',id:created.id,archived:true},403,studentActor);
const entry=[{kind:'classroom',id:created.id}],preview=await call(manage,{action:'previewDelete',entries:entry},200,teacher);
check(preview.blocked.length===0,'Own teacher can remove a class without deleting pairings');
await call(manage,{action:'permanentDelete',entries:entry,confirm:true,previewAt:preview.previewAt,fingerprint:preview.fingerprint},200,teacher);
check(count('classrooms')===0,'A classroom without history is physically removed');
check(sqlite.prepare('SELECT sum(active) n FROM plans WHERE group_id=?').get(group).n===2,'Deleting last class preserves all active pairings');
await call(action,{action:'saveTeacher',name:'Teacher A',active:false});await call(action,{action:'saveTeacher',name:'Teacher A',active:true});
await call(action,{action:'setStudentActive',name:'Student A',active:false});await call(action,{action:'setStudentActive',name:'Student A',active:true});
await call(action,{action:'updateStudentProfile',name:'Student A',syllabusId:'igcse',grade:'Year 7',age:12});
await call(action,{action:'savePlan',editingKey:'Student A|Mathematics',student:'Student A',teacherName:'Teacher A',subjectId:'mathematics',duration:1,active:false});
await call(action,{action:'savePlan',editingKey:'Student A|Mathematics',student:'Student A',teacherName:'Teacher A',subjectId:'mathematics',duration:1,active:true});
await call(action,{action:'createLocalAccount',username:'fictional-existing',password:'Fictional-password-123',name:'Student A',role:'student',identityMode:'existing',studentName:'Student A'});
const login=sqlite.prepare("SELECT id FROM accounts WHERE student_name='Student A' AND id<>?").get(studentActor.id);
await call(action,{action:'deleteAccount',userId:login.id});await call(action,{action:'restoreAccount',userId:login.id});
check(count('classrooms')===0,'Teacher/student/profile/pairing/account restoration does not recreate removed classes');
const schedule={action:'create',student:'Student A',subject:'Mathematics',teacherName:'Teacher A',start:'2035-01-01T09:00',end:'2035-01-01T10:00'};
await call(action,schedule);
check(count('classrooms')===0&&count('lessons')===1,'One-to-one scheduling without a classroom succeeds without provisioning');
check(sqlite.prepare('SELECT classroom_id,classroom_title FROM class_sessions WHERE group_id=?').get(group).classroom_id===null,'Unassigned session keeps null classroom');
const nextSlot={...schedule,start:'2035-01-02T09:00',end:'2035-01-02T10:00'};
await call(action,{...nextSlot,classroomId:'nonexistent'},409);
const firstClass=await call(classroomRoute,{...newClass,title:'First explicit',students:['Student A']});
await call(action,nextSlot);
check(sqlite.prepare('SELECT classroom_id FROM class_sessions WHERE planned_start=?').get('2035-01-02T01:00:00.000Z').classroom_id===firstClass.id,'Unique matching class is associated');
const secondClass=await call(classroomRoute,{...newClass,title:'Second explicit',students:['Student A']});
const thirdSlot={...schedule,start:'2035-01-03T09:00',end:'2035-01-03T10:00'};
await call(action,thirdSlot,409);
await call(action,{...thirdSlot,classroomId:firstClass.id});
check(count('lessons')===3,'Explicit choice resolves multiple matching classrooms');
beforeBatch=()=>sqlite.prepare('DELETE FROM classroom_members WHERE classroom_id=? AND student_name=?').run(firstClass.id,'Student A');
await call(action,{...schedule,start:'2035-01-04T09:00',end:'2035-01-04T10:00',classroomId:firstClass.id},409);
check(count('lessons')===3,'Membership change between read and write rejects lesson creation');
sqlite.prepare('DELETE FROM classroom_members WHERE student_name=?').run('Student A');
beforeBatch=()=>sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run('late-membership',group,secondClass.id,'Student A',now);
await call(action,{...schedule,start:'2035-01-05T09:00',end:'2035-01-05T10:00'},409);
check(count('lessons')===3,'New membership during no-class scheduling rejects stale null association');

const retainedEntry=[{kind:'classroom',id:firstClass.id}],retainedPreview=await call(manage,{action:'previewDelete',entries:retainedEntry},200,teacher);
const courseTables=['lessons','class_sessions','class_session_participants','plans'],beforeCourse=Object.fromEntries(courseTables.map(t=>[t,JSON.stringify(sqlite.prepare('SELECT * FROM '+t+' ORDER BY rowid').all())]));
await call(manage,{action:'permanentDelete',entries:retainedEntry,confirm:true,previewAt:retainedPreview.previewAt,fingerprint:retainedPreview.fingerprint},200,teacher);
for(const t of courseTables)check(JSON.stringify(sqlite.prepare('SELECT * FROM '+t+' ORDER BY rowid').all())===beforeCourse[t],'Retirement preserves every column in '+t);
await call(classroomRoute,{action:'archiveClassroom',id:firstClass.id,archived:false},404);
check(sqlite.prepare('SELECT count(*) n FROM classroom_retirements WHERE classroom_id=?').get(firstClass.id).n===1,'Ordinary restore cannot revive explicitly removed history class');
const courses=await import('../app/api/courses/route.ts');
async function readCourses(as){actor=as;const res=await courses.GET(new Request('https://fictional.invalid/api/courses?view=lessons&month=2035-01'));assert.equal(res.status,200);checks.push('Authorized course read '+as.role);return res.json();}
check((await readCourses(chief)).items.length===3,'Admin still sees preserved lessons');
check((await readCourses(teacher)).items.length===3,'Assigned teacher still sees preserved lessons');
sqlite.prepare('UPDATE local_credentials SET must_change_password=0 WHERE account_id=?').run(login.id);
check((await readCourses({id:login.id,groupId:group,role:'student',name:'Student A',email:'',studentName:'Student A',teacherName:null})).items.length===3,'Student still sees own preserved lessons');
check((await readCourses(foreign)).items.length===0,'Foreign group gains no history access');
check((await readCourses(studentActor)).items.length===0,'Unlinked student gains no history access');
check(sqlite.prepare('PRAGMA foreign_key_check').all().length===0,'Foreign keys remain valid');
console.log(JSON.stringify({suite:'classroom-coverage',passed:checks.length,checks,scope:'Actual action/classrooms/manage routes; local fictional SQLite only.'},null,2));
