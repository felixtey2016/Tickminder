import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createFixtureLoader} from './fixture-loader.mjs';

const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
let actor=null,beforeRead=null,checks=0;
const queries=[];
function statement(sql,values=[]){
 const execute=()=>{assert(values.length<=100,'D1 bind limit');queries.push(sql);beforeRead?.(sql);const s=sqlite.prepare(sql);return s.columns().length?{results:s.all(...values),meta:{changes:0}}:{results:[],meta:s.run(...values)};};
 return{bind:(...v)=>statement(sql,v),all:async()=>execute(),first:async()=>execute().results[0]||null,run:async()=>execute(),execute};
}
const db={prepare:statement,batch:async statements=>{sqlite.exec('BEGIN');try{const r=statements.map(s=>s.execute());sqlite.exec('COMMIT');return r;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
globalThis.__parentsCalendarRuntime={learningDb:()=>db,first:async(sql,...values)=>statement(sql,values).first(),rows:async(sql,...values)=>(await statement(sql,values).all()).results,pdfLimits:()=>({total:100000000,perFile:20000000}),pdfBucket:()=>({}),currentBusinessAccount:async()=>actor,OWNER_EMAIL:'owner@calendar.example.test',isOwnerAccount:a=>a.role==='admin'&&a.email==='owner@calendar.example.test',operationHash:async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))).toString('hex')};
const dataUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64'),runtimeUrl=dataUrl('export const {learningDb,first,rows,pdfLimits,pdfBucket,currentBusinessAccount,OWNER_EMAIL,isOwnerAccount,operationHash}=globalThis.__parentsCalendarRuntime;'),environmentUrl=dataUrl("export const env={ADMIN_PERMISSIONS_MODE:'enforced'};"),nextUrl=dataUrl('export const NextResponse={json:(data,options)=>Response.json(data,options)};');
const load=createFixtureLoader({runtimeUrl,environmentUrl,runtimeFiles:['lib/auth.ts','lib/owner.ts','lib/learning-server.ts','lib/learning-operations.ts','lib/pdf-storage.ts'],transform:(_file,code)=>code.replaceAll("'next/server'",JSON.stringify(nextUrl)).replaceAll('"next/server"',JSON.stringify(nextUrl))});
const route=(await load('app/api/parents/route.ts')).module,session=(await load('lib/account-session.ts')).module;
const group='calendar-school',foreign='calendar-other',month='2026-10',now='2026-10-01T00:00:00.000Z';
for(const id of[group,foreign])sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,id,now,now);
function account(id,role='parent',groupId=group){const a={id,email:id+'@calendar.example.test',name:id,role,groupId,teacherName:null,studentName:null,disabledAt:null};sqlite.prepare('INSERT INTO accounts(id,email,name,role,group_id,created_at) VALUES(?,?,?,?,?,?)').run(id,a.email,id,role,groupId,now);return a;}
function learner(name,groupId=group){sqlite.prepare('INSERT INTO students(group_id,name,name_key,created_at) VALUES(?,?,?,?)').run(groupId,name,name.toLowerCase(),now);return sqlite.prepare('SELECT id FROM billing_students WHERE group_id=? AND student_name=?').get(groupId,name).id;}
const parent=account('calendar-parent'),otherParent=account('calendar-other-parent','parent',foreign),admin=account('calendar-admin','admin'),studentActor=account('calendar-student','student');
const alpha=learner('Alpha'),beta=learner('Beta'),sameForeign=learner('Alpha',foreign);
function setLink(active,studentId=alpha,parentAccount=parent){
 const groupId=parentAccount.groupId,operation=crypto.randomUUID(),existing=sqlite.prepare('SELECT id,revision FROM parent_child_links WHERE group_id=? AND parent_account_id=? AND student_id=?').get(groupId,parentAccount.id,studentId);
 sqlite.prepare('INSERT INTO parent_operations(group_id,operation_id,actor_id,request_hash,execution_id,result_json,created_at) VALUES(?,?,?,?,?,?,?)').run(groupId,operation,admin.id,'fixture',operation,'{}',now);
 if(existing)sqlite.prepare('UPDATE parent_child_links SET active=?,revision=revision+1,operation_id=?,updated_at=? WHERE id=?').run(active?1:0,operation,now,existing.id);
 else sqlite.prepare('INSERT INTO parent_child_links(id,group_id,parent_account_id,student_id,active,revision,updated_by,updated_at,operation_id,reason) VALUES(?,?,?,?,1,1,?,?,?,?)').run(crypto.randomUUID(),groupId,parentAccount.id,studentId,admin.id,now,operation,'Fictional verified relationship');
}
setLink(true);setLink(true,sameForeign,otherParent);
function lesson(id,start,end,status='scheduled',student='Alpha',groupId=group){sqlite.prepare('INSERT INTO lessons(id,group_id,student,subject,teacher_name,planned_start,planned_end,status,note,created_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,groupId,student,'Mathematics','Teacher '+id,start,end,status,'PRIVATE TEACHER NOTE',admin.id,now);}
lesson('spill-in','2026-09-30T15:30:00Z','2026-09-30T16:30:00Z');
lesson('spill-out','2026-10-31T15:30:00Z','2026-10-31T16:30:00Z');
lesson('midnight','2026-10-02T15:30:00Z','2026-10-02T16:30:00Z');
lesson('ends-midnight','2026-10-04T15:00:00Z','2026-10-04T16:00:00Z');
lesson('starts-midnight','2026-10-04T16:00:00Z','2026-10-04T17:00:00Z');
lesson('legacy-offset','2026-10-07T00:00:00+08:00','2026-10-07T01:00:00+08:00');
const statuses=['scheduled','completed','student_absent','teacher_absent','cancelled','completed','cancelled'];
for(const [i,status]of statuses.entries()){const start=new Date(Date.UTC(2026,9,6,i+2)),end=new Date(start.getTime()+3600000);lesson('status-'+i,start.toISOString(),end.toISOString(),status);}
sqlite.prepare("UPDATE class_session_participants SET attendance_status='absent' WHERE lesson_id IN ('status-5','status-6')").run();
for(let i=0;i<25;i++){const start=new Date(Date.UTC(2026,9,15,0,i*10)),end=new Date(start.getTime()+5*60000);lesson('page-'+String(i).padStart(2,'0'),start.toISOString(),end.toISOString());}
lesson('other-child','2026-10-15T00:00:00Z','2026-10-15T00:05:00Z','scheduled','Beta');
lesson('other-group','2026-10-15T00:00:00Z','2026-10-15T00:05:00Z','scheduled','Alpha',foreign);
lesson('old-history','2020-01-01T00:00:00Z','2020-01-01T01:00:00Z');lesson('future-history','2090-01-01T00:00:00Z','2090-01-01T01:00:00Z');
async function get(params={},as=parent){actor=as;const r=await route.GET(new Request('https://calendar.example.test/api/parents?'+new URLSearchParams({view:'calendar',studentId:alpha,month,...params})));return{status:r.status,data:await r.json(),headers:r.headers};}
const check=fn=>{fn();checks++;},expect=(r,status,label)=>{check(()=>assert.equal(r.status,status,label+': '+JSON.stringify(r.data)));return r.data;},day=(data,date)=>data.days.find(d=>d.date===date);

const summary=expect(await get(),200,'monthly calendar');
check(()=>assert.deepEqual(Object.keys(summary).sort(),['child','days','month']));check(()=>assert.equal(summary.days.length,31));check(()=>assert.equal(summary.month,month));
check(()=>assert.equal(summary.days.reduce((n,d)=>n+d.total,0),39));
for(const d of summary.days)check(()=>assert.equal(d.total,d.scheduled+d.completed+d.absent+d.cancelled,'mutually exclusive daily categories'));
check(()=>assert.deepEqual(day(summary,'2026-10-06'),{date:'2026-10-06',total:7,scheduled:1,completed:1,absent:3,cancelled:2}));
check(()=>assert.equal(day(summary,'2026-10-15').total,25));check(()=>assert.equal(day(summary,'2026-10-08').total,0));
check(()=>assert(!/PRIVATE|chargeable|billing|invoice|student_name/.test(JSON.stringify(summary))));
const summarySql=queries.find(q=>q.includes('WITH RECURSIVE calendar_days'));
check(()=>assert.match(summarySql,/l\.group_id=\? AND l\.student=\?/));check(()=>assert.match(summarySql,/julianday\(l\.planned_start\)/));check(()=>assert(!summarySql.includes('LIMIT 20')));
const cached=await get();check(()=>assert.match(cached.headers.get('cache-control'),/no-store/));

for(const [date,id]of[['2026-10-01','spill-in'],['2026-10-02','midnight'],['2026-10-03','midnight'],['2026-10-04','ends-midnight'],['2026-10-05','starts-midnight'],['2026-10-07','legacy-offset'],['2026-10-31','spill-out']]){
 check(()=>assert.equal(day(summary,date).total,1,date+' summary overlap'));
 const detail=expect(await get({view:'lessons',date}),200,date+' detail overlap');check(()=>assert.equal(detail.date,date));check(()=>assert.deepEqual(detail.items.map(l=>l.id),[id]));
}
const september=expect(await get({month:'2026-09'}),200,'previous month overlap'),november=expect(await get({month:'2026-11'}),200,'next month overlap');
check(()=>assert.equal(day(september,'2026-09-30').total,1));check(()=>assert.equal(day(november,'2026-11-01').total,1));
expect(await get({view:'lessons',month:'2026-11',date:'2026-11-01'}),200,'next month details');
const monthPage1=expect(await get({view:'lessons'}),200,'month first page'),monthPage2=expect(await get({view:'lessons',page:'2'}),200,'month second page');
check(()=>assert.equal(monthPage1.total,38));check(()=>assert.equal(monthPage1.pages,2));check(()=>assert.equal(monthPage1.items.length,20));check(()=>assert.equal(monthPage2.items.length,18));
check(()=>assert(monthPage1.items.every(l=>!monthPage2.items.some(other=>other.id===l.id))));check(()=>assert.equal(monthPage1.date,undefined));
const datePage1=expect(await get({view:'lessons',date:'2026-10-15'}),200,'day first page'),datePage2=expect(await get({view:'lessons',date:'2026-10-15',page:'2'}),200,'day second page');
check(()=>assert.equal(datePage1.total,25));check(()=>assert.equal(datePage1.pages,2));check(()=>assert.equal(datePage1.items.length,20));check(()=>assert.equal(datePage2.items.length,5));
check(()=>assert([...datePage1.items,...datePage2.items].every(l=>l.id.startsWith('page-'))));check(()=>assert(!JSON.stringify(datePage1).includes('PRIVATE')));
const noLessons=expect(await get({view:'lessons',date:'2026-10-08'}),200,'empty day');check(()=>assert.equal(noLessons.total,0));check(()=>assert.deepEqual(noLessons.items,[]));
const leap=expect(await get({month:'2028-02'}),200,'leap February');check(()=>assert.equal(leap.days.length,29));expect(await get({view:'lessons',month:'2028-02',date:'2028-02-29'}),200,'valid leap date');
for(const [otherMonth,date]of[[month,'2026-09-30'],[month,'2026-10-32'],[month,'2026-10-00'],[month,'2026-10-1'],[month,''],['2027-02','2027-02-29'],['2026-02','2026-02-30']])expect(await get({view:'lessons',month:otherMonth,date}),400,'invalid or out-of-month date');
for(const invalidMonth of['1999-12','2100-01','2026-00','2026-13'])expect(await get({month:invalidMonth}),400,'invalid month');
expect(await get({view:'lessons',date:'2026-10-15',page:'0'}),400,'invalid daily page');

expect(await get({},null),401,'anonymous calendar denied');expect(await get({},admin),403,'admin cannot use parent projection');expect(await get({},studentActor),403,'student cannot use parent projection');
expect(await get({studentId:beta}),404,'unlinked child calendar denied');expect(await get({view:'lessons',studentId:beta,date:'2026-10-15'}),404,'unlinked child detail denied');
expect(await get({studentId:sameForeign}),404,'same-name foreign child denied');expect(await get({},otherParent),404,'foreign parent own-child impersonation denied');
const foreignCalendar=expect(await get({studentId:sameForeign},otherParent),200,'foreign parent own linked child');check(()=>assert.equal(day(foreignCalendar,'2026-10-15').total,1));
for(const view of['calendar','lessons']){
 let readDone=false;beforeRead=sql=>{if(sql.includes(view==='calendar'?'WITH RECURSIVE calendar_days':'SELECT l.id,l.subject'))readDone=true;else if(readDone&&sql.startsWith('SELECT 1 AS ok WHERE')){beforeRead=null;setLink(false);}};
 expect(await get({view,...view==='lessons'?{date:'2026-10-15'}:{}}),404,'revoke after '+view+' data query is rechecked');beforeRead=null;
 expect(await get(),404,'revoked old calendar URL');expect(await get({view:'lessons',date:'2026-10-15'}),404,'revoked old detail URL');setLink(true);
}
beforeRead=sql=>{if(sql.includes('WITH RECURSIVE calendar_days')){beforeRead=null;setLink(false);}};
expect(await get(),404,'revoke before aggregate query');beforeRead=null;setLink(true);
sqlite.prepare('UPDATE students SET active=0 WHERE group_id=? AND name=?').run(group,'Alpha');expect(await get(),404,'inactive child denied');sqlite.prepare('UPDATE students SET active=1 WHERE group_id=? AND name=?').run(group,'Alpha');
sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,parent.id);expect(await get(),404,'disabled parent stale actor denied');sqlite.prepare('UPDATE accounts SET disabled_at=NULL WHERE id=?').run(parent.id);
sqlite.prepare('UPDATE tuition_groups SET active=0 WHERE id=?').run(group);expect(await get(),404,'disabled group denied');sqlite.prepare('UPDATE tuition_groups SET active=1 WHERE id=?').run(group);
const bound=session.bindAccountSession({...parent},'calendar-session-hash');sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run('calendar-session-hash',parent.id,'2099-01-01T00:00:00Z');
expect(await get({},bound),200,'live parent session');sqlite.prepare('DELETE FROM sessions WHERE token_hash=?').run('calendar-session-hash');expect(await get({},bound),404,'logged-out stale actor denied');
check(()=>assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]));
console.log('Parent calendar SQL aggregates, GMT+8 overlap, daily pagination and live authorization: '+checks+' checks passed');
