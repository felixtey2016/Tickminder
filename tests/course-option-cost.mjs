import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Miniflare} from 'miniflare';

// Executes SQL captured from the actual routes against real local workerd D1.
// No hosted requests; migrations/triggers ran in the caller's fictional SQLite.
export async function measureCourseOptionReads({sqlite,reads,get,getBefore,admin,reader,teacher,student,group,now}){
 const historyRows=1000;
 const insert=sqlite.prepare("INSERT INTO lessons(id,group_id,student,subject,teacher_name,planned_start,planned_end,status,reviewed_at,created_by,updated_at) VALUES(?,?,?,'Mathematics','Teacher A',?,?,'completed',?,?,?)");
 sqlite.exec('BEGIN');for(let i=0;i<historyRows;i++){const start=new Date(Date.UTC(2000,0,1,0,i)).toISOString();insert.run('cost-'+i,group,'Alpha',start,new Date(Date.parse(start)+1800000).toISOString(),now,admin.id,now);}sqlite.exec('COMMIT');
 const scenarios=[];
 for(const as of[admin,reader,teacher,student]){
  const variants={};
  for(const [label,params,call]of[
   ['baseline',{mode:'timetable',timetableType:'teacher',teacher:'Teacher A'},getBefore],
   ['baselineOptions',{mode:'timetable',timetableType:'teacher',optionsOnly:'1'},getBefore],
   ['full',{mode:'timetable',timetableType:'teacher',teacher:'Teacher A'},get],
   ['lean',{mode:'timetable',timetableType:'teacher',teacher:'Teacher A',includeOptions:'0'},get],
   ['options',{mode:'timetable',timetableType:'teacher',optionsOnly:'1'},get],
  ]){reads.length=0;const response=await call(params,as);assert.equal(response.status,200);variants[label]={queries:reads.map(read=>({...read,values:[...read.values]})),data:response.data};}
  assert.deepEqual(variants.full.data,variants.baseline.data,'removed join preserves complete response');
  assert.deepEqual(variants.options.data,variants.baselineOptions.data,'removed join preserves complete options');
  const {teacherStudentPairs,studentOptions,...expected}=variants.full.data;assert.deepEqual(variants.lean.data,expected);
  scenarios.push({actor:as.id,role:as.role,variants});
 }
 const mf=new Miniflare({host:'127.0.0.1',port:0,modules:true,script:'export default {async fetch(request,env){try{const statements=await request.json();return Response.json(await env.DB.batch(statements.map(s=>env.DB.prepare(s.sql).bind(...s.values))));}catch(error){return Response.json({error:String(error)},{status:500});}}}',compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'fictional-course-cost'},outboundService:async()=>new Response('No external networking',{status:403})});
 try{
  const origin=(await mf.ready).origin;assert.match(origin,/^http:\/\/127\.0\.0\.1:/);
  const run=async queries=>{const response=await fetch(origin,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(queries)}),value=await response.json();assert(response.ok,value.error);return value;};
  const tables=sqlite.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all(),indexes=sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all();
  const seed=[{sql:'PRAGMA defer_foreign_keys=ON',values:[]},...tables.map(t=>({sql:t.sql,values:[]})),...indexes.map(i=>({sql:i.sql,values:[]}))];
  for(const table of tables){const columns=sqlite.prepare('PRAGMA table_info("'+table.name+'")').all().map(c=>c.name),rows=sqlite.prepare('SELECT * FROM "'+table.name+'"');rows.setReturnArrays(true);for(const values of rows.all())seed.push({sql:'INSERT INTO "'+table.name+'"('+columns.map(c=>'"'+c+'"').join(',')+') VALUES('+columns.map(()=>'?').join(',')+')',values});}
  await run(seed);const measurements=[];
  for(const scenario of scenarios){const totals={};for(const[label,{queries}]of Object.entries(scenario.variants)){const results=await run(queries);assert(results.every(r=>Number.isFinite(r.meta.rows_read)));totals[label]={queries:queries.length,rowsRead:results.reduce((sum,r)=>sum+r.meta.rows_read,0),relationRowsRead:results.reduce((sum,r,i)=>sum+(/SELECT DISTINCT .*AS teacher|SELECT DISTINCT teacher,student FROM/.test(queries[i].sql)?r.meta.rows_read:0),0)};}
   assert(totals.lean.rowsRead<totals.full.rowsRead,'lean details avoid real D1 reads');assert(totals.full.rowsRead<=totals.baseline.rowsRead,'unused session join cannot increase measured reads');
   measurements.push({actor:scenario.actor,role:scenario.role,...totals,optionsAndTwoDetailReads:{before:totals.baselineOptions.rowsRead+2*totals.baseline.rowsRead,after:totals.options.rowsRead+2*totals.lean.rowsRead,note:'Sum of measured options request and twice the measured detail request; excludes browser retries and revision-change fallback'}});
  }
  const output=path.resolve('../evidence/course-option-d1-cost.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({ok:true,fictional:true,productionRequests:0,historyRows,measurement:'Actual workerd D1 meta.rows_read; actual route SQL captured with unchanged live authorization wrappers',measurements},null,2));console.log(JSON.stringify({courseD1Evidence:output,measurements}));
 }finally{await mf.dispose();}
}
