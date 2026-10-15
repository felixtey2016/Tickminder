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
globalThis.__studentClassrooms={OWNER_EMAIL:'owner@example.test',env:{DB:db},learningDb:()=>db,rows:async(sql,...values)=>sqlite.prepare(sql).all(...values),first:async(sql,...values)=>sqlite.prepare(sql).get(...values)||null,currentBusinessAccount:async()=>actor,pdfBucket:()=>({}),pdfLimits:()=>({total:100000000}),isOwnerAccount:()=>false,operationHash:async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))).toString('hex')};
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-student-classrooms-')),runtimePath=path.join(temporary,'runtime.mjs'),runtimeFiles=new Set(['lib/auth.ts','lib/learning-server.ts','lib/owner.ts','lib/learning-operations.ts','lib/pdf-storage.ts']),cache=new Map();
process.once('exit',()=>{const resolved=path.resolve(temporary);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('tickminder-student-classrooms-'))fs.rmSync(resolved,{recursive:true,force:true});});
fs.writeFileSync(runtimePath,'export const {OWNER_EMAIL,env,learningDb,rows,first,currentBusinessAccount,pdfBucket,pdfLimits,isOwnerAccount,operationHash}=globalThis.__studentClassrooms;');
const stub=pathToFileURL(runtimePath).href;
function compile(file){if(cache.has(file))return cache.get(file);const output=path.join(temporary,file.replace(/\.ts$/,'.mjs')),url=pathToFileURL(output).href;cache.set(file,url);let code=ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;for(const [,spec]of [...code.matchAll(/from ["']([^"']+)["']/g)]){const resolved=spec.startsWith('@/')?spec.slice(2)+'.ts':spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(file),spec+'.ts')):null;const replacement=spec==='cloudflare:workers'||resolved&&runtimeFiles.has(resolved)?stub:resolved?compile(resolved):import.meta.resolve(spec);code=code.replaceAll('"'+spec+'"','"'+replacement+'"').replaceAll("'"+spec+"'","'"+replacement+"'");}fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,code);return url;}
const provision=await import(compile('lib/student-classrooms.ts'));
const api=await import(compile('lib/classroom-coverage.ts'));
const group='classroom-fixture',other='classroom-foreign',now=new Date().toISOString(),op=()=>crypto.randomUUID();
for(const id of [group,other])sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,id,now,now);
function account(id,name,role='teacher',groupId=group){sqlite.prepare('INSERT INTO accounts(id,group_id,email,name,role,teacher_name,created_at) VALUES(?,?,?,?,?,?,?)').run(id,groupId,id+'@example.test',name,role,role==='teacher'?name:null,now);if(role==='teacher')sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(groupId,name,now);return id;}
const admin=account('classroom-admin','Admin','admin'),teacher=account('classroom-teacher','Teacher A'),teacherTwo=account('classroom-teacher-two','Teacher B');account('foreign-admin','Admin','admin',other);account('foreign-teacher','Teacher A','teacher',other);
function student(name,groupId=group,grade='Form 4'){sqlite.prepare('INSERT INTO students(group_id,name,name_key,syllabus_id,grade,created_at) VALUES(?,?,?,?,?,?)').run(groupId,name,name.toLowerCase(),'spm',grade,now);}
function plan(name,teacherName='Teacher A',subject='Mathematics',subjectId='mathematics',groupId=group){const key=name+'|'+subject;sqlite.prepare('INSERT INTO plans(group_id,key,student,subject,subject_id,teacher_name,duration,created_at) VALUES(?,?,?,?,?,?,?,?)').run(groupId,key,name,subject,subjectId,teacherName,1,now);return key;}
let checks=0;const check=(v,label)=>{assert(v,label);checks++;};
student('Coverage Student');const key=plan('Coverage Student');const room=await provision.ensurePlanClassroom(group,key,admin);
check((await api.classroomPlanKeys(group,room.id)).includes(key),'Active exact pairing is covered by its real classroom');
check((await api.classroomPlanKeys(other,room.id)).length===0,'Foreign group cannot claim affected plans');
async function blocked(statements,label){let failure;try{await db.batch([...statements,api.classroomCoverageGuard(group,[key])]);}catch(error){failure=error;}check(failure&&api.isClassroomCoverageFailure(failure),label);}
await blocked([statement('UPDATE classrooms SET archived=1 WHERE id=?',[room.id])],'Archiving the final classroom is rejected');
check(sqlite.prepare('SELECT archived FROM classrooms WHERE id=?').get(room.id).archived===0,'Failed archive rolls back');
await blocked([statement('DELETE FROM classroom_members WHERE classroom_id=?',[room.id])],'Removing the last membership is rejected');
check(sqlite.prepare('SELECT count(*) AS n FROM classroom_members WHERE classroom_id=?').get(room.id).n===1,'Failed membership removal rolls back');
await blocked([statement('DELETE FROM classrooms WHERE id=?',[room.id])],'Deleting the last classroom is rejected');
check(Boolean(sqlite.prepare('SELECT id FROM classrooms WHERE id=?').get(room.id)),'Failed deletion retains class');
const second=op();sqlite.prepare('INSERT INTO classrooms(group_id,id,title,subject,teacher_name,created_by,created_at,updated_at,syllabus_id,subject_id,grade) SELECT group_id,?,?,subject,teacher_name,created_by,created_at,updated_at,syllabus_id,subject_id,grade FROM classrooms WHERE id=?').run(second,'Second class',room.id);sqlite.prepare('INSERT INTO classroom_members(group_id,id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(group,op(),second,'Coverage Student',now);
await db.batch([statement('UPDATE classrooms SET archived=1 WHERE id=?',[room.id]),api.classroomCoverageGuard(group,[key])]);check(sqlite.prepare('SELECT archived FROM classrooms WHERE id=?').get(room.id).archived===1,'Archive allowed if another matching classroom covers pairing');
sqlite.prepare('UPDATE classrooms SET archived=0 WHERE id=?').run(room.id);
await blocked([statement('DELETE FROM classrooms WHERE id IN (?,?)',[room.id,second])],'Bulk deletion cannot jointly orphan a pairing');
check(sqlite.prepare('SELECT count(*) AS n FROM classrooms WHERE id IN (?,?)').get(room.id,second).n===2,'Bulk rollback retains both classes');
sqlite.prepare('UPDATE classrooms SET teacher_name=? WHERE id=?').run('Teacher B',second);
await blocked([statement('DELETE FROM classrooms WHERE id=?',[room.id])],'Different teacher classroom does not cover pairing');
sqlite.prepare('UPDATE classrooms SET teacher_name=?,subject_id=?,subject=? WHERE id=?').run('Teacher A','science','Science',second);
await blocked([statement('DELETE FROM classrooms WHERE id=?',[room.id])],'Different subject classroom does not cover pairing');
sqlite.prepare('UPDATE classrooms SET subject_id=?,subject=?,syllabus_id=? WHERE id=?').run('mathematics','Mathematics','igcse',second);
await blocked([statement('DELETE FROM classrooms WHERE id=?',[room.id])],'Different syllabus classroom does not cover pairing');
sqlite.prepare('UPDATE classrooms SET subject_id=NULL,subject=?,syllabus_id=? WHERE id=?').run('mAtHs','spm',second);
await db.batch([statement('UPDATE classrooms SET archived=1 WHERE id=?',[room.id]),api.classroomCoverageGuard(group,[key])]);check(true,'Case-insensitive legacy alias supplies valid coverage');
sqlite.prepare('UPDATE plans SET active=0 WHERE group_id=? AND key=?').run(group,key);
await db.batch([statement('DELETE FROM classrooms WHERE id IN (?,?)',[room.id,second]),api.classroomCoverageGuard(group,[key])]);check(sqlite.prepare('SELECT count(*) AS n FROM classrooms WHERE id IN (?,?)').get(room.id,second).n===0,'Inactive pairing does not force a live classroom');
await db.batch([api.classroomCoverageGuard(group,[])]);check(true,'Empty affected list accepts unrelated work');
student('Concurrent Pairing');const concurrent=plan('Concurrent Pairing');let globalFailure;try{await db.batch([statement('UPDATE plans SET duration=2 WHERE group_id=? AND key=?',[group,key]),api.classroomCoverageGuard(group)]);}catch(error){globalFailure=error;}check(globalFailure&&api.isClassroomCoverageFailure(globalFailure),'Global final assertion catches a pairing added after a pre-read');check(sqlite.prepare('SELECT duration FROM plans WHERE group_id=? AND key=?').get(group,key).duration===1,'Global assertion rolls back preceding work');await provision.ensurePlanClassroom(group,concurrent,admin);await db.batch([api.classroomCoverageGuard(group)]);check(true,'Global assertion accepts a covered active roster');student('Foreign Uncovered',other);plan('Foreign Uncovered','Teacher A','Mathematics','mathematics',other);await db.batch([api.classroomCoverageGuard(group)]);check(true,'Foreign uncovered roster cannot affect current group assertion');
check(sqlite.prepare('PRAGMA foreign_key_check').all().length===0,'Foreign keys remain valid');check(sqlite.prepare('PRAGMA integrity_check').get().integrity_check==='ok','SQLite integrity remains valid');
console.log(JSON.stringify({suite:'classroom-coverage',passed:checks,scope:'Real SQL and transactions with fictional data.'},null,2));sqlite.close();
