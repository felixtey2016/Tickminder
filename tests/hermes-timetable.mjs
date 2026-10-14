import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const sqlite=new DatabaseSync(':memory:');
for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
function statement(sql,values=[]){return{bind(...v){return statement(sql,v);},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return{results:sqlite.prepare(sql).all(...values)};},execute(){const s=sqlite.prepare(sql);return /^\s*SELECT/i.test(sql)?{results:s.all(...values)}:{meta:s.run(...values)};}};}
let beforeBatch=()=>{};
const d1={prepare:statement,async batch(stmts){beforeBatch();sqlite.exec('BEGIN');try{const r=stmts.map(s=>s.execute());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const secret='test-dedicated-timetable-token-'.repeat(3);
const env={HERMES_TIMETABLE_TOKEN:secret,HERMES_TIMETABLE_BINDINGS:JSON.stringify({course_a:{student:'Student A',teacherName:'Teacher A',subject:'Maths'}})};
globalThis.__timetableTest={env,learningDb:()=>d1,rows:async(sql,...v)=>(await statement(sql,v).all()).results,first:async(sql,...v)=>statement(sql,v).first()};
const stub='data:text/javascript;base64,'+Buffer.from('export const {env,learningDb,rows,first}=globalThis.__timetableTest;').toString('base64'),cache=new Map();
async function load(file){if(cache.has(file))return cache.get(file);let s=readFileSync(new URL('../'+file,import.meta.url),'utf8');for(const [,spec] of [...s.matchAll(/from ["']([^"']+)["']/g)]){const url=['cloudflare:workers','@/lib/learning-server'].includes(spec)?stub:spec.startsWith('@/')?(await load(spec.slice(2)+'.ts')).url:import.meta.resolve(spec);s=s.replaceAll('"'+spec+'"','"'+url+'"');}const url='data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'),r={url,module:await import(url)};cache.set(file,r);return r;}
const route=(await load('app/api/hermes/timetable/route.ts')).module;
async function call(body,token=secret){const r=await route.POST(new Request('https://test.invalid/api/hermes/timetable',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(body)}));return{status:r.status,data:await r.json()};}
const now=new Date().toISOString();
for(const name of ['Teacher A','Teacher B'])sqlite.prepare('INSERT INTO teachers (name,active,created_at) VALUES (?,1,?)').run(name,now);
for(const name of ['Student A','Student B'])sqlite.prepare('INSERT INTO students (name,name_key,active,created_at) VALUES (?,?,1,?)').run(name,name.toLowerCase(),now);
sqlite.prepare('INSERT INTO plans (key,student,subject,teacher_name,active,created_at) VALUES (?,?,?,?,1,?)').run('Student A|Maths','Student A','Maths','Teacher A',now);
const start=new Date(Date.now()+30*86400000);start.setUTCHours(10,0,0,0);
const at=n=>new Date(start.getTime()+n*3600000).toISOString();
function lesson(id,student='Student A',teacher='Teacher A',hour=0){sqlite.prepare("INSERT INTO lessons (id,student,subject,teacher_name,planned_start,planned_end,status,created_by,updated_at) VALUES (?,?,?,?,?,?,'scheduled','test',?)").run(id,student,'Maths',teacher,at(hour),at(hour+1),now);}
lesson('own');lesson('other','Student A','Teacher B',5);lesson('foreign','Student B','Teacher B',9);
const snapshot=()=>call({action:'snapshot',classroomId:'course_a'});
assert.equal((await call({action:'snapshot',classroomId:'course_a'},'wrong')).status,401);
assert.equal((await call({action:'snapshot',classroomId:'unbound'})).status,403);
let s=(await snapshot()).data;
assert.equal(s.lessons.length,1);assert.equal(s.busy.length,1);assert.ok(!JSON.stringify(s).includes('Teacher B'));assert.ok(!JSON.stringify(s).includes('Student B'));
const body={action:'commit',classroomId:'course_a',operationId:'op1',expectedRevision:s.revision,confirmations:{teacher:'wa-teacher-1',student:'wa-student-1'},changes:[{localId:'L1',websiteId:'own',start:at(2),end:at(3),expected:{start:at(0),end:at(1),updatedAt:now}}]};
assert.equal((await call({...body,confirmations:{teacher:'wa-teacher-1'}})).status,403);
assert.equal((await call({...body,confirmations:{teacher:'same',student:'same'}})).status,403);
assert.equal((await call({...body,changes:[{...body.changes[0],websiteId:'foreign'}]})).status,403);
assert.equal((await call({...body,changes:[{...body.changes[0],start:at(5),end:at(6)}]})).data.error,'schedule_conflict');
assert.equal((await call({...body,changes:[{...body.changes[0],start:'2028-02-31T10:00:00Z',end:'2028-02-31T11:00:00Z'}]})).status,400);
assert.equal((await call({...body,action:'attendance'})).status,400);
let r=await call(body);assert.equal(r.status,200,JSON.stringify(r));assert.equal(sqlite.prepare("SELECT planned_start FROM lessons WHERE id='own'").get().planned_start,at(2));
assert.equal((await call(body)).data.alreadyApplied,true);assert.equal(sqlite.prepare("SELECT count(*) n FROM audit WHERE action='hermesTimetable'").get().n,1);
assert.equal((await call({...body,changes:[{...body.changes[0],start:at(3),end:at(4)}]})).data.error,'operation_payload_changed');
assert.equal((await call({...body,operationId:'stale'})).data.error,'website_changed_refresh_first');
s=(await snapshot()).data;
// An unrelated website edit between the precheck and the write must roll back the whole batch.
const concurrent={...body,operationId:'concurrent',expectedRevision:s.revision,changes:[{localId:'L1',websiteId:'own',start:at(3),end:at(4),expected:{start:s.lessons[0].plannedStart,end:s.lessons[0].plannedEnd,updatedAt:s.lessons[0].updatedAt}},{localId:'new-1',start:at(7),end:at(8)}]};
beforeBatch=()=>sqlite.prepare("INSERT INTO audit (id,lesson_id,actor_id,action,at) VALUES ('manual-race','other','admin','edit',?)").run(now);
assert.equal((await call(concurrent)).status,409);beforeBatch=()=>{};
assert.equal(sqlite.prepare("SELECT planned_start FROM lessons WHERE id='own'").get().planned_start,at(2));assert.equal(sqlite.prepare('SELECT count(*) n FROM lessons').get().n,3);
// Conflict inserted without an audit revision is also detected within the transaction.
s=(await snapshot()).data;beforeBatch=()=>lesson('race','Student B','Teacher A',3);
assert.equal((await call({...concurrent,operationId:'conflict-race',expectedRevision:s.revision})).status,409);beforeBatch=()=>{};
assert.equal(sqlite.prepare("SELECT planned_start FROM lessons WHERE id='own'").get().planned_start,at(2));assert.equal(sqlite.prepare("SELECT count(*) n FROM lessons WHERE id LIKE 'hermes-%'").get().n,0);
s=(await snapshot()).data;
r=await call({...concurrent,operationId:'new-month',expectedRevision:s.revision,changes:[{localId:'new-1',start:at(7),end:at(8)},{localId:'new-2',start:at(8),end:at(9)}]});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.applied.length,2);
// Existing attendance/financial fields cannot be modified by a timetable payload.
sqlite.prepare("UPDATE lessons SET status='completed',actual_start=planned_start,actual_end=planned_end,chargeable=1 WHERE id='own'").run();s=(await snapshot()).data;
assert.equal((await call({...body,operationId:'completed',expectedRevision:s.revision})).status,403);
assert.equal(sqlite.prepare("SELECT chargeable FROM lessons WHERE id='own'").get().chargeable,1);
sqlite.prepare("UPDATE plans SET active=0").run();assert.equal((await snapshot()).status,403);
sqlite.close();console.log('PASS timetable API: real SQLite routes; dedicated auth; fixed enrollment; no unrelated names; both consents; invalid dates; conflict and stale checks; transactional rollback/races; idempotency; initial lessons; attendance protection; disabled binding. No live data or WhatsApp messages.');
