import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {drizzle} from 'drizzle-orm/d1';
import {createFixtureLoader} from './fixture-loader.mjs';

globalThis.fetch=async()=>{throw Error('Hosted requests forbidden in attendance history fixture');};
const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
let actor=null,beforeRead=null,checks=0;
function statement(sql,values=[]){const execute=(arrays=false)=>{assert(values.length<=100);if(beforeRead&&sql.includes('a.actor_id AS actorId')){const hook=beforeRead;beforeRead=null;hook();}const st=sqlite.prepare(sql);if(arrays)st.setReturnArrays(true);return st.columns().length?{results:st.all(...values),meta:{changes:0}}:{results:[],meta:st.run(...values)};};return{bind:(...v)=>statement(sql,v),all:async()=>execute(),first:async()=>execute().results[0]||null,raw:async()=>execute(true).results,run:async()=>execute(),execute};}
const db={prepare:statement,batch:async statements=>{sqlite.exec('BEGIN');try{const values=statements.map(s=>s.execute());sqlite.exec('COMMIT');return values;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
globalThis.__attendanceHistory={env:{DB:db,ADMIN_PERMISSIONS_MODE:'enforced'},getDb:()=>drizzle(db),learningDb:()=>db,currentBusinessAccount:async()=>actor,OWNER_EMAIL:'owner@history.example.test',isOwnerAccount:()=>false,rows:async(sql,...v)=>(await statement(sql,v).all()).results,first:async(sql,...v)=>statement(sql,v).first(),pdfLimits:()=>({}),pdfBucket:()=>({}),operationHash:async()=>'',operationId:String};
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64'),runtimeUrl=data('export const {env,getDb,learningDb,currentBusinessAccount,OWNER_EMAIL,isOwnerAccount,rows,first,pdfLimits,pdfBucket,operationHash,operationId}=globalThis.__attendanceHistory;'),nextUrl=data('export const NextResponse={json:(value,options)=>Response.json(value,options)};');
const load=createFixtureLoader({runtimeUrl,environmentUrl:runtimeUrl,runtimeFiles:['lib/auth.ts','lib/owner.ts','lib/learning-server.ts','lib/learning-operations.ts','lib/pdf-storage.ts'],transform:(_f,s)=>s.replaceAll("'next/server'",JSON.stringify(nextUrl)).replaceAll('"next/server"',JSON.stringify(nextUrl)).replaceAll("'@/db'",JSON.stringify(runtimeUrl)).replaceAll('"@/db"',JSON.stringify(runtimeUrl))});
const route=(await load('app/api/lesson-history/route.ts')).module,gid='history-school',other='history-foreign',now='2026-10-20T04:00:00.000Z';
for(const id of[gid,other])sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,id,now,now);
function account(id,role='admin',groupId=gid,person='Alpha'){const value={id,email:id+'@history.example.test',name:id,role,groupId,teacherName:role==='teacher'?'Teacher A':null,studentName:role==='student'?person:null};sqlite.prepare('INSERT INTO accounts(id,email,name,role,group_id,teacher_name,student_name,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,value.email,id,role,groupId,value.teacherName,value.studentName,now);return value;}
const admin=account('history-admin'),reader=account('history-reader'),teacher=account('history-teacher','teacher'),student=account('history-student','student'),peer=account('history-peer','student',gid,'Beta'),foreign=account('history-foreign-admin','admin',other);
function grant(who,keys){sqlite.prepare("INSERT INTO admin_permission_profiles(group_id,account_id,revision,grants_json,origin,updated_at) VALUES(?,?,1,?,'new',?) ON CONFLICT(group_id,account_id) DO UPDATE SET grants_json=excluded.grants_json,revision=revision+1").run(who.groupId,who.id,JSON.stringify(keys),now);}
grant(admin,['lessons.view','attendance.view']);grant(reader,['lessons.view']);grant(foreign,['lessons.view','attendance.view']);
sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(gid,'Teacher A',now);
for(const name of['Alpha','Beta']){sqlite.prepare('INSERT INTO students(group_id,name,name_key,created_at) VALUES(?,?,?,?)').run(gid,name,name.toLowerCase(),now);sqlite.prepare('INSERT INTO plans(group_id,key,student,subject,teacher_name,created_at) VALUES(?,?,?,?,?,?)').run(gid,'history-plan-'+name,name,'Science','Teacher A',now);}
sqlite.prepare("INSERT INTO lessons(id,group_id,student,subject,teacher_name,planned_start,planned_end,status,created_by,updated_at) VALUES(?,?,'Alpha','Science','Teacher A','2026-10-10T01:00:00.000Z','2026-10-10T02:30:00.000Z','scheduled',?,?)").run('history-lesson',gid,admin.id,now);
const before={status:'completed',attendanceKind:'late',participantStatus:'late',actualStart:'2026-10-10T01:10:00.000Z',actualEnd:'2026-10-10T02:30:00.000Z',teachingStatus:'taught',teachingStart:'2026-10-10T01:00:00.000Z',teachingEnd:'2026-10-10T02:30:00.000Z',chargeable:1,invoiceId:'PRIVATE_INVOICE_ID',reason:'PRIVATE_FINANCE_REASON',note:'PRIVATE_FINANCE_NOTE'},after={status:'student_absent',attendanceKind:'absent',actualStart:null,actualEnd:null,teachingStatus:'taught',teachingStart:before.teachingStart,teachingEnd:before.teachingEnd,chargeable:0,financialAmountCents:87654321,financialKind:'credit',invoiceId:'PRIVATE_INVOICE_ID',eventId:'PRIVATE_EVENT_ID',reason:'PRIVATE_FINANCE_REASON',_audit:{actorName:'Historical Admin Name',objectName:'PRIVATE_FINANCE_OBJECT'}};
function audit(id,previous,next){sqlite.prepare('INSERT INTO audit(id,group_id,lesson_id,actor_id,action,before_json,after_json,at) VALUES(?,?,?,?,?,?,?,?)').run(id,gid,'history-lesson','removed-historical-admin','invoice.correctAttendance',typeof previous==='string'?previous:JSON.stringify(previous),typeof next==='string'?next:JSON.stringify(next),now);}
audit('correction-current',before,after);
const {teachingStart:_start,teachingEnd:_end,teachingStatus:_teaching,...legacy}=after;audit('correction-legacy',before,{...legacy,status:'completed',attendanceKind:'early_leave',actualStart:before.teachingStart,actualEnd:'2026-10-10T02:00:00.000Z'});
audit('correction-reset',before,{...after,status:'scheduled',attendanceKind:'pending',teachingStatus:'pending',teachingStart:null,teachingEnd:null,chargeable:null});audit('correction-malformed','null','{invalid');
sqlite.prepare('INSERT INTO audit(id,group_id,lesson_id,actor_id,action,before_json,after_json,at) VALUES(?,?,?,?,?,?,?,?)').run('legacy-attendance-secrets',gid,'history-lesson',admin.id,'adminResetSessionAttendance',JSON.stringify({status:'present',password:'PRIVATE_LEGACY_PASSWORD',nested:{token:'PRIVATE_LEGACY_TOKEN'}}),JSON.stringify({status:'pending',note:'Attendance reset note',cookie:'PRIVATE_LEGACY_COOKIE'}),now);
const check=fn=>{fn();checks++;};
async function get(who=teacher){actor=who;const response=await route.GET(new Request('https://history.example.test/api/lesson-history?lessonId=history-lesson'));return{status:response.status,data:await response.json()};}
function expect(result,status){check(()=>assert.equal(result.status,status,JSON.stringify(result.data)));return result.data;}
const absentPrivate=value=>check(()=>assert(!/PRIVATE_|87654321|financialAmount|financialKind|invoiceId|eventId|beforeJson|afterJson/.test(JSON.stringify(value))));
for(const who of[teacher,admin,student]){
 const body=expect(await get(who),200);check(()=>assert.equal(body.attendanceTotal,5));absentPrivate(body);
 const current=body.attendanceEntries.find(e=>e.id==='correction-current');check(()=>assert.equal(current.before.status,'late'));check(()=>assert.equal(current.before.actualStart,before.teachingStart));check(()=>assert.equal(current.before.arrivedAt,before.actualStart));check(()=>assert.equal(current.after.status,'absent'));check(()=>assert.equal(current.after.actualStart,before.teachingStart));check(()=>assert.equal(current.after.arrivedAt,null));
 const old=body.attendanceEntries.find(e=>e.id==='correction-legacy');check(()=>assert.equal(old.after.actualEnd,before.teachingEnd));check(()=>assert.equal(old.after.leftAt,'2026-10-10T02:00:00.000Z'));
 const reset=body.attendanceEntries.find(e=>e.id==='correction-reset');check(()=>assert.equal(reset.after.status,'pending'));check(()=>assert.equal(reset.after.actualStart,null));
 if(who.role==='student'){check(()=>assert(!JSON.stringify(body).includes('chargeable')));check(()=>assert(!JSON.stringify(body).includes('Historical Admin Name')));}else check(()=>assert.equal(current.actor,'Historical Admin Name'));
 check(()=>assert.deepEqual(body.attendanceEntries.find(e=>e.id==='correction-malformed').after,{}));
 check(()=>assert.equal(body.attendanceEntries.find(e=>e.id==='legacy-attendance-secrets').after.status,'pending'));
}
const limited=expect(await get(reader),200);check(()=>assert.equal(limited.attendanceTotal,0));check(()=>assert.deepEqual(limited.attendanceEntries,[]));absentPrivate(limited);
expect(await get(peer),404);expect(await get(foreign),404);expect(await get(null),401);
beforeRead=()=>grant(admin,['lessons.view']);absentPrivate(expect(await get(admin),403));grant(admin,['lessons.view','attendance.view']);
beforeRead=()=>sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,teacher.id);absentPrivate(expect(await get(teacher),403));
check(()=>assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]));
console.log(JSON.stringify({suite:'attendance-history-privacy',checks,productionWrites:false,networkCalls:0}));
