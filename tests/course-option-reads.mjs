import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {drizzle} from 'drizzle-orm/d1';import {createFixtureLoader} from './fixture-loader.mjs';
const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');for(const name of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
let actor=null,hook=null,checks=0;const queries=[],reads=[];
function statement(sql,values=[]){const execute=(arrays=false)=>{assert(values.length<=100);queries.push(sql);reads.push({sql,values:[...values]});hook?.(sql);const s=sqlite.prepare(sql);if(arrays)s.setReturnArrays(true);return s.columns().length?{results:s.all(...values),meta:{changes:0}}:{results:[],meta:s.run(...values)};};return{bind:(...v)=>statement(sql,v),all:async()=>execute(),first:async()=>execute().results[0]||null,raw:async()=>execute(true).results,run:async()=>execute(),execute};}
const db={prepare:statement,batch:async items=>{sqlite.exec('BEGIN');try{const result=items.map(s=>s.execute());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
globalThis.__courseOptionsRuntime={getDb:()=>drizzle(db),learningDb:()=>db,currentBusinessAccount:async()=>actor,OWNER_EMAIL:'owner@options.example.test',isOwnerAccount:()=>false,first:async(sql,...v)=>statement(sql,v).first(),rows:async(sql,...v)=>(await statement(sql,v).all()).results,pdfLimits:()=>({total:1000000,perFile:100000}),pdfBucket:()=>({}),operationId:value=>String(value),operationHash:async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))).toString('hex')};
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64'),runtimeUrl=data('export const {getDb,learningDb,currentBusinessAccount,OWNER_EMAIL,isOwnerAccount,first,rows,pdfLimits,pdfBucket,operationId,operationHash}=globalThis.__courseOptionsRuntime;'),environmentUrl=data("export const env={DB:globalThis.__courseOptionsRuntime.learningDb(),ADMIN_PERMISSIONS_MODE:'enforced'};"),next=data('export const NextResponse={json:(value,options)=>Response.json(value,options)};');
const load=createFixtureLoader({runtimeUrl,environmentUrl,runtimeFiles:['lib/auth.ts','lib/learning-server.ts','lib/owner.ts','lib/learning-operations.ts','lib/pdf-storage.ts'],transform:(_f,s)=>s.replaceAll("'next/server'",JSON.stringify(next)).replaceAll('"next/server"',JSON.stringify(next)).replaceAll("'@/db'",JSON.stringify(runtimeUrl)).replaceAll('"@/db"',JSON.stringify(runtimeUrl))});
const route=(await load('app/api/courses/route.ts')).module,permissions=(await load('lib/admin-permissions.ts')).module,sessions=(await load('lib/account-session.ts')).module;
const g='options-school',other='options-other',month='2026-11',now=new Date().toISOString(),op=()=>crypto.randomUUID();for(const id of[g,other])sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,id,now,now);
function account(id,role='admin',groupId=g,person=null){const a={id,name:id,email:id+'@options.example.test',role,groupId,teacherName:role==='teacher'?person:null,studentName:role==='student'?person:null};sqlite.prepare('INSERT INTO accounts(id,email,name,role,group_id,teacher_name,student_name,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,a.email,id,role,groupId,a.teacherName,a.studentName,now);return a;}
function profile(a,grants){sqlite.prepare("INSERT OR REPLACE INTO admin_permission_profiles(group_id,account_id,revision,grants_json,origin,updated_at) VALUES(?,?,1,?,'new',?)").run(a.groupId,a.id,JSON.stringify(permissions.normalizeAdminGrants(grants)),now);}
const admin=account('admin'),reader=account('reader'),denied=account('stats-only'),teacher=account('teacher','teacher',g,'Teacher A'),student=account('student','student',g,'Alpha'),parent=account('parent','parent'),foreign=account('foreign','teacher',other,'Teacher A');profile(admin,[...permissions.SUPPORTED_ADMIN_GRANTS]);profile(reader,['lessons.view']);profile(denied,['statistics.view']);
function teacherRow(name,active=1,gid=g){sqlite.prepare('INSERT INTO teachers(group_id,name,active,created_at) VALUES(?,?,?,?)').run(gid,name,active,now);}
for(const [name,active]of[['Teacher A',1],['Teacher B',1],['Inactive Teacher',0],['Historical Teacher',0]])teacherRow(name,active);teacherRow('Teacher A',1,other);
function learner(name,active=1,gid=g){sqlite.prepare('INSERT INTO students(group_id,name,name_key,active,created_at) VALUES(?,?,?,?,?)').run(gid,name,name.toLowerCase(),active,now);}
for(const name of['Alpha','Beta','Classroom Only','No Relation','Removed Plan'])learner(name);learner('Former Child',0);learner('Foreign Child',1,other);
function plan(student,teacher='Teacher A',active=1,subject='Mathematics',gid=g){sqlite.prepare('INSERT INTO plans(key,group_id,student,subject,teacher_name,active,created_at) VALUES(?,?,?,?,?,?,?)').run(op(),gid,student,subject,teacher,active,now);}
plan('Alpha');plan('Alpha','Teacher B',1,'Science');plan('Beta');plan('Removed Plan','Teacher A',0);plan('No Relation','Inactive Teacher');plan('Foreign Child','Teacher A',1,'Mathematics',other);
for(let i=0;i<25;i++){learner('Not Scheduled '+String(i).padStart(2,'0'));plan('Not Scheduled '+String(i).padStart(2,'0'));}
sqlite.prepare('INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('current-class',g,'Current class','Mathematics','Teacher B',admin.id,now,now);for(const name of['Alpha','Classroom Only'])sqlite.prepare('INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES(?,?,?,?,?)').run(op(),g,'current-class',name,now);
function lesson(id,name,teacher='Historical Teacher',start='2026-11-05T00:00:00Z',status='completed',sessionId=null,gid=g){sqlite.prepare('INSERT INTO lessons(id,group_id,student,subject,teacher_name,planned_start,planned_end,status,actual_start,actual_end,reviewed_at,note,session_id,created_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,gid,name,'Mathematics',teacher,start,new Date(Date.parse(start)+3600000).toISOString(),status,status==='completed'?start:null,status==='completed'?new Date(Date.parse(start)+3600000).toISOString():null,status==='completed'?now:null,'PRIVATE NOTE',sessionId,admin.id,now);}
for(let i=0;i<25;i++){const name='Historical '+String(i).padStart(2,'0');learner(name,0);lesson('history-'+i,name,'Historical Teacher',new Date(Date.UTC(2026,10,5+i,0)).toISOString());}
learner('Cancelled Only',0);lesson('cancelled-history','Cancelled Only','Historical Teacher','2026-11-02T00:00:00Z','cancelled');learner('December Only',0);lesson('december-history','December Only','Historical Teacher','2026-12-05T00:00:00Z');lesson('foreign-history','Foreign Child','Teacher A','2026-11-05T00:00:00Z','completed',null,other);
sqlite.prepare("INSERT INTO class_sessions(id,group_id,session_type,teacher_name,subject,planned_start,planned_end,status,teaching_status,actual_start,actual_end,created_by,created_at,updated_at) VALUES('own-old-group',?,'group','Teacher A','Mathematics','2026-11-01T00:00:00Z','2026-11-01T01:00:00.000Z','completed','taught','2026-11-01T00:00:00Z','2026-11-01T01:00:00Z',?,?,?)").run(g,admin.id,now,now);lesson('old-group-member','Former Child','Teacher A','2026-11-01T00:00:00Z','completed','own-old-group');
async function get(params={},as=admin){actor=as;const r=await route.GET(new Request('https://options.example.test/api/courses?'+new URLSearchParams({month,...params})));return{status:r.status,data:await r.json(),headers:r.headers};}
const check=fn=>{fn();checks++;},expect=(r,status,label)=>{check(()=>assert.equal(r.status,status,label+': '+JSON.stringify(r.data)));return r.data;},has=(data,teacher,student)=>data.teacherStudentPairs.some(pair=>pair.teacher===teacher&&pair.student===student);

// Actual route + migrated SQLite: omitted metadata must remove the expensive
// relation SQL, not page-filter the complete menus or bypass actor checks.
const relation=sql=>/SELECT DISTINCT .*AS teacher/.test(sql)||/SELECT DISTINCT teacher,student FROM/.test(sql);
const queryCounts=[];
for(const as of[admin,reader,teacher,student,foreign])for(const params of[{page:'2'},{teacher:'Teacher A',student:'Alpha'},{mode:'timetable',timetableType:'teacher',teacher:'Historical Teacher'},{mode:'timetable',timetableType:'student',student:'Historical 24'},{cancelled:'1'},{month:'2026-12'}]){
 queries.length=0;const full=expect(await get(params,as),200,'legacy default complete response'),fullQueries=queries.length,fullRelations=queries.filter(relation).length;
 queries.length=0;const lean=expect(await get({...params,includeOptions:'0'},as),200,'metadata omission');
 const {teacherStudentPairs,studentOptions,...expected}=full;
 check(()=>assert.deepEqual(lean,expected,'all page rows, totals, summaries, proposals and revision remain equal'));
 check(()=>assert.equal(queries.filter(relation).length,0,'no relation-list SQL executed'));
 check(()=>assert(fullRelations>=2&&queries.length<fullQueries,'actual query execution count is reduced'));
 queryCounts.push({role:as.role,mode:params.mode||'month',fullQueries,leanQueries:queries.length,relationQueriesAvoided:fullRelations});
}
for(const params of[{view:'sessions',mode:'month'},{view:'sessions',mode:'review'},{view:'reschedules',mode:'records'}]){
 const full=expect(await get(params),200,'legacy related projection'),lean=expect(await get({...params,includeOptions:'0'}),200,'lean related projection');
 const {teacherStudentPairs,...expected}=full;check(()=>assert.deepEqual(lean,expected,'classroom options and related records preserve original filters'));
}
const all=expect(await get({optionsOnly:'1',mode:'timetable',timetableType:'teacher'}),200,'complete timetable selector');check(()=>assert(has(all,'Historical Teacher','Historical 24')));check(()=>assert(has(all,'Teacher A','Not Scheduled 24')));
for(const as of[parent,denied,null])expect(await get({includeOptions:'0'},as),as?403:401,'metadata hint cannot bypass role/grant/login');
for(const params of[{includeOptions:'maybe'},{includeOptions:'0',optionsOnly:'1'},{includeOptions:'0',from:'2026-02-30',to:'2026-03-01'}])expect(await get(params),400,'invalid hint/range');
actor=admin;const duplicate=await route.GET(new Request('https://options.example.test/api/courses?month='+month+'&includeOptions=0&includeOptions=1'));check(()=>assert.equal(duplicate.status,400));
hook=sql=>{if(sql.includes('SELECT count(*) AS total')){hook=null;profile(reader,[]);}};expect(await get({includeOptions:'0'},reader),403,'grant revoked during lean read');profile(reader,['lessons.view']);
const bound=sessions.bindAccountSession({...teacher},'lean-live-session');sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run('lean-live-session',teacher.id,'2099-01-01T00:00:00Z');
hook=sql=>{if(sql.includes('SELECT count(*) AS total')){hook=null;sqlite.prepare("DELETE FROM sessions WHERE token_hash='lean-live-session'").run();}};expect(await get({includeOptions:'0'},bound),403,'session revoked during lean read');
hook=sql=>{if(sql.includes('SELECT count(*) AS total')){hook=null;sqlite.prepare('UPDATE accounts SET teacher_name=? WHERE id=?').run('Teacher B',teacher.id);}};expect(await get({includeOptions:'0'},teacher),403,'teacher rebound during lean read');sqlite.prepare('UPDATE accounts SET teacher_name=? WHERE id=?').run('Teacher A',teacher.id);
check(()=>assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]));console.log(JSON.stringify({ok:true,checks,queryCounts,measurement:'Actual migrated SQLite statement executions; query counts, not fabricated Cloudflare rows_read',productionRequests:0},null,2));

if(process.env.COURSE_OPTIONS_D1_BENCHMARK==='1'){
const baselineLoad=createFixtureLoader({runtimeUrl,environmentUrl,runtimeFiles:['lib/auth.ts','lib/learning-server.ts','lib/owner.ts','lib/learning-operations.ts','lib/pdf-storage.ts'],transform:(_f,s)=>{
 if(_f==='lib/course-query.ts'){
  const baselineJoin=/const pairBase\s*=[^\n]+;/;
  assert(baselineJoin.test(s),'benchmark baseline must restore the original historical-pairs join');
  s=s.replace(baselineJoin,'const pairBase=from;');
 }
 return s.replaceAll("'next/server'",JSON.stringify(next)).replaceAll('"next/server"',JSON.stringify(next)).replaceAll("'@/db'",JSON.stringify(runtimeUrl)).replaceAll('"@/db"',JSON.stringify(runtimeUrl));
}});
const beforeRoute=(await baselineLoad('app/api/courses/route.ts')).module;const getBefore=async(params,as)=>{actor=as;const r=await beforeRoute.GET(new Request('https://options.example.test/api/courses?'+new URLSearchParams({month,...params})));return {status:r.status,data:await r.json()};};
const {measureCourseOptionReads}=await import('./course-option-cost.mjs');await measureCourseOptionReads({sqlite,reads,get,getBefore,admin,reader,teacher,student,group:g,now});
}
