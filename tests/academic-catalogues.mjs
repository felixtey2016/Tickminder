import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import {orderedSnapshotTables,expectedSnapshotTables,snapshotVersion,checkRestoredAcademicStructure} from '../scripts/backup-order.mjs';

// The real migration, handlers, SQL CAS and client cache run against fictional
// accounts and an in-memory database. No external requests are permitted.
globalThis.fetch=async()=>{throw Error('Network is forbidden in academic catalogue tests');};
const sqlite=new DatabaseSync(':memory:');
const migrations=fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort();
for(const file of migrations)sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
let actor=null,beforeBatch=null,failAudit=false;
function statement(sql,values=[]){
 const execute=()=>{if(failAudit&&/INSERT INTO audit/.test(sql))throw Error('Fictional audit failure');const stmt=sqlite.prepare(sql);return stmt.columns().length?{results:stmt.all(...values),meta:{changes:0}}:{results:[],meta:stmt.run(...values)};};
 return {bind:(...next)=>statement(sql,next),first:async()=>execute().results[0]||null,all:async()=>execute(),run:async()=>execute(),execute};
}
const db={prepare:statement,batch:async statements=>{beforeBatch?.();beforeBatch=null;sqlite.exec('BEGIN');try{const results=statements.map(stmt=>stmt.execute());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
const ownerEmail='catalogue-owner@example.test';
globalThis.__catalogueRuntime={learningDb:()=>db,pdfBucket:()=>({}),currentBusinessAccount:async()=>actor,OWNER_EMAIL:ownerEmail,isOwnerAccount:value=>value.id==='catalogue-owner'&&value.role==='admin',groupFetch:(...args)=>globalThis.__catalogueFetch(...args)};
const sourceUrl=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const stub=sourceUrl('export const {learningDb,pdfBucket,currentBusinessAccount,OWNER_EMAIL,isOwnerAccount,groupFetch}=globalThis.__catalogueRuntime;');
const cache=new Map();
async function load(file){
 if(cache.has(file))return cache.get(file);
 let code=ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 if(file==='lib/use-academic-catalogue.ts')code+='\nexport const catalogueTest={load,entries};';
 for(const match of [...code.matchAll(/from ["']([^"']+)["']/g)]){
  const spec=match[1],resolved=spec.startsWith('@/')?spec.slice(2)+'.ts':spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(file),spec+'.ts')):null;
  const url=spec==='react'?sourceUrl('export const useCallback=x=>x,useEffect=()=>{},useState=()=>[0,()=>{}];'):spec==='cloudflare:workers'?sourceUrl("export const env={DB:globalThis.__catalogueRuntime.learningDb(),BACKUP_EXPORT_TOKEN:'fictional-catalogue-backup-token-with-32-characters'};"):resolved&&['lib/auth.ts','lib/owner.ts','lib/learning-server.ts','lib/group-client.ts','lib/pdf-storage.ts'].includes(resolved)?stub:resolved?(await load(resolved)).url:import.meta.resolve(spec);
  code=code.replaceAll(`'${spec}'`,`'${url}'`).replaceAll(`"${spec}"`,`"${url}"`);
 }
 const url=sourceUrl(code),result={url,module:await import(url)};cache.set(file,result);return result;
}
const pure=(await load('lib/academic-catalogue.ts')).module,server=(await load('lib/academic-catalogue-server.ts')).module,route=(await load('app/api/academic-catalogues/route.ts')).module;
let checks=0;
const check=fn=>{fn();checks++;};
const checkAsync=async fn=>{await fn();checks++;};
const now='2032-06-01T00:00:00.000Z',group='catalogue-group-one',group2='catalogue-group-two';
for(const id of [group,group2])sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,active,created_at,updated_at) VALUES(?,?,?,1,?,?)').run(id,id,id,now,now);
function account(id,role,groupId=group){const value={id,email:id==='catalogue-owner'?ownerEmail:id+'@example.test',role,name:id,groupId,teacherName:null,studentName:null};sqlite.prepare('INSERT INTO accounts(id,email,name,role,group_id,created_at) VALUES(?,?,?,?,?,?)').run(id,value.email,id,role,groupId,now);return value;}
const owner=account('catalogue-owner','admin'),admin=account('catalogue-admin','admin'),student=account('catalogue-student','student'),teacher=account('catalogue-teacher','teacher'),parent=account('catalogue-parent','parent',group2),future=account('catalogue-new-role','new_future_role',group2);
async function get(scope='student',as=owner){actor=as;const response=await route.GET(new Request('https://catalogue.example.test/api/academic-catalogues?scope='+scope));return {status:response.status,data:await response.json()};}
async function post(body,as=owner,origin='https://catalogue.example.test'){actor=as;const response=await route.POST(new Request('https://catalogue.example.test/api/academic-catalogues',{method:'POST',headers:{origin,'content-type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)}));return {status:response.status,data:await response.json()};}
const seed=pure.defaultAcademicCatalogue('student'),quizSeed=pure.defaultAcademicCatalogue('quiz');
check(()=>assert.deepEqual(seed.syllabuses.map(s=>s.name),['SPM','IGCSE','STPM','A-Level']));
check(()=>assert.deepEqual(quizSeed.syllabuses.map(s=>s.name),['SPM','IGCSE']));
check(()=>assert.equal(seed.syllabuses[1].grades.at(-1),'Year 11'));
check(()=>assert.deepEqual(seed.syllabuses.find(item=>item.id==='stpm').grades,['Semester 1','Semester 2','Semester 3']));
check(()=>assert.deepEqual(seed.syllabuses.find(item=>item.id==='a-level').grades,['AS Level','A2']));
check(()=>assert.equal(pure.catalogueGradeValid(seed.syllabuses.find(item=>item.id==='stpm'),'Lower 6'),false));
check(()=>assert.equal(pure.catalogueGradeValid(seed.syllabuses.find(item=>item.id==='a-level'),'Year 12'),false));
for(const scope of ['student','quiz'])check(()=>assert.deepEqual(JSON.parse(sqlite.prepare('SELECT content_json FROM academic_catalogues WHERE scope=?').get(scope).content_json),{syllabuses:pure.defaultAcademicCatalogue(scope).syllabuses}));
check(()=>assert.equal(pure.catalogueKey('  ＳＣＩＥＮＣＥ\t '),'science'));
check(()=>assert.equal(pure.resolveCatalogueSelection(seed,'SPM','sCiEnCe').subject.id,'science'));
check(()=>assert.equal(pure.resolveCatalogueSelection(seed,'IGCSE','数学').subject.id,'mathematics'));
check(()=>assert.equal(pure.findCatalogueGrade(seed.syllabuses[1],' year 7 '),'Year 7'));
check(()=>assert.equal(pure.catalogueGradeValid(seed.syllabuses[0],null),true));
check(()=>assert.equal(pure.catalogueGradeValid(seed.syllabuses[0],'Year 7'),false));
const disabled=structuredClone(seed);disabled.syllabuses[0].subjects.find(s=>s.id==='science').active=false;
check(()=>assert.equal(pure.resolveCatalogueSelection(disabled,'spm','Science'),null));
check(()=>assert.equal(pure.resolveCatalogueSelection(disabled,'spm','Science',{allowInactive:true}).subject.id,'science'));
const empty=structuredClone(seed.syllabuses);empty.push({id:crypto.randomUUID(),name:'Fictional Curriculum',active:true,grades:[],subjects:[]});
check(()=>assert.equal(pure.validateCatalogueSyllabuses(empty,seed.syllabuses).at(-1).subjects.length,0));
const badAlias=structuredClone(seed.syllabuses);badAlias[0].subjects[0].aliases.push('science');
check(()=>assert.throws(()=>pure.validateCatalogueSyllabuses(badAlias),/别名/));
for(const mutate of [list=>list.shift(),list=>list[0].name='Renamed',list=>list[0].subjects.shift(),list=>list[0].subjects[0].name='Renamed Subject',list=>list[0].grades.reverse(),list=>list[0].grades.splice(0,1),list=>list[0].subjects[0].aliases=[]]){const list=structuredClone(seed.syllabuses);mutate(list);check(()=>assert.throws(()=>pure.validateCatalogueSyllabuses(list,seed.syllabuses)));}

for(const as of [owner,admin,student,teacher,parent,future]){const response=await get('student',as);check(()=>assert.equal(response.status,200));check(()=>assert.deepEqual(response.data.syllabuses,seed.syllabuses));check(()=>assert.equal(response.data.canManage,as===owner));}
await checkAsync(async()=>assert.equal((await get('student',null)).status,401));
await checkAsync(async()=>assert.equal((await get('unknown')).status,400));
for(const as of [admin,student,teacher,parent,future])await checkAsync(async()=>assert.equal((await post({scope:'student',expectedRevision:1,syllabuses:empty},as)).status,403));
await checkAsync(async()=>assert.equal((await post({},owner,'https://other.example.test')).status,403));
await checkAsync(async()=>assert.equal((await post('{bad json')).status,400));
await checkAsync(async()=>assert.equal((await post('x'.repeat(512*1024+1))).status,413));

const added=structuredClone(seed.syllabuses);added[0].subjects.push({id:crypto.randomUUID(),name:'Fictional Subject',aliases:['Fictional Alias'],active:true});
let response=await post({scope:'student',expectedRevision:1,syllabuses:added});
check(()=>assert.equal(response.status,200));check(()=>assert.equal(response.data.revision,2));
check(()=>assert.equal(sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='catalogue.update'").get().n,1));
check(()=>assert.equal(sqlite.prepare("SELECT revision FROM academic_catalogues WHERE scope='quiz'").get().revision,1));
await checkAsync(async()=>assert.equal((await post({scope:'student',expectedRevision:1,syllabuses:added})).status,409));
await checkAsync(async()=>assert.equal((await get('student',future)).data.syllabuses[0].subjects.at(-1).name,'Fictional Subject'));
const latest=response.data,change=structuredClone(added);change[0].subjects.at(-1).active=false;
beforeBatch=()=>sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,owner.id);
await checkAsync(async()=>assert.equal((await post({scope:'student',expectedRevision:2,syllabuses:change})).status,409));
check(()=>assert.equal(sqlite.prepare("SELECT revision FROM academic_catalogues WHERE scope='student'").get().revision,2));
check(()=>assert.equal(sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='catalogue.update'").get().n,1));
sqlite.prepare('UPDATE accounts SET disabled_at=NULL WHERE id=?').run(owner.id);
failAudit=true;response=await post({scope:'student',expectedRevision:2,syllabuses:change});failAudit=false;
check(()=>assert.equal(response.status,503));check(()=>assert.equal(sqlite.prepare("SELECT revision FROM academic_catalogues WHERE scope='student'").get().revision,2));
response=await post({scope:'student',expectedRevision:2,syllabuses:change});check(()=>assert.equal(response.status,200));check(()=>assert.equal(response.data.revision,3));
const quizChanged=structuredClone(quizSeed.syllabuses);quizChanged[1].active=false;
await checkAsync(async()=>assert.equal((await post({scope:'quiz',expectedRevision:1,syllabuses:quizChanged})).status,200));
await checkAsync(async()=>assert.equal((await server.readAcademicCatalogue('student')).revision,3));
await checkAsync(async()=>assert.equal((await server.readAcademicCatalogue('quiz')).revision,2));
check(()=>assert.throws(()=>server.assertCatalogueSelection(seed,'spm','Science','Year 7'),/有效年级/));

check(()=>assert.equal(snapshotVersion({format:'timelyo-d1-v18'}),18));
check(()=>assert.equal(expectedSnapshotTables(18).length,expectedSnapshotTables(17).length+2));
check(()=>assert.equal(expectedSnapshotTables(18).includes('academic_catalogues'),true));
check(()=>assert.equal(expectedSnapshotTables(18).includes('student_grade_promotions'),true));
sqlite.prepare('INSERT INTO students(group_id,name,name_key,active,created_at,syllabus_id,grade,age) VALUES(?,?,?,1,?,?,?,?)').run(group,'Fictional Learner','fictional learner',now,'spm','Form 3',14);
sqlite.prepare('INSERT INTO student_grade_promotions(group_id,student_name,cycle,syllabus_id,from_grade,to_grade,confirmed_by,confirmed_at) VALUES(?,?,2032,?,?,?,?,?)').run(group,'Fictional Learner','spm','Form 2','Form 3',owner.id,now);
check(()=>assert.doesNotThrow(()=>checkRestoredAcademicStructure(sqlite)));
sqlite.prepare('UPDATE students SET grade=? WHERE name=?').run('Invalid Grade','Fictional Learner');
check(()=>assert.throws(()=>checkRestoredAcademicStructure(sqlite),/classification/));
sqlite.prepare('UPDATE students SET grade=? WHERE name=?').run('Form 3','Fictional Learner');
const backupRoute=(await load('app/api/backup-export/route.ts')).module;
const backupRequest=()=>new Request('https://catalogue.example.test/api/backup-export',{headers:{authorization:'Bearer fictional-catalogue-backup-token-with-32-characters'}});
const exportResponse=await backupRoute.GET(backupRequest()),snapshot=await exportResponse.json();
check(()=>assert.equal(exportResponse.status,200));check(()=>assert.equal(snapshot.format,'timelyo-d1-v19'));
check(()=>assert.deepEqual(Object.keys(snapshot.tables).sort(),expectedSnapshotTables(18).sort()));
check(()=>assert.equal(snapshot.tables.academic_catalogues.rows.length,2));
check(()=>assert.equal(snapshot.tables.student_grade_promotions.rows.length,1));
const savedQuizCatalogue=sqlite.prepare("SELECT * FROM academic_catalogues WHERE scope='quiz'").get();
sqlite.prepare("DELETE FROM academic_catalogues WHERE scope='quiz'").run();
await checkAsync(async()=>assert.equal((await backupRoute.GET(backupRequest())).status,503,'partial global configuration fails closed'));
sqlite.prepare('INSERT INTO academic_catalogues(scope,revision,content_json,updated_at,updated_by) VALUES(?,?,?,?,?)').run(...['scope','revision','content_json','updated_at','updated_by'].map(key=>savedQuizCatalogue[key]));
const tables=Object.fromEntries(expectedSnapshotTables(18).map(name=>[name,{columns:sqlite.prepare(`PRAGMA table_info("${name}")`).all().map(row=>row.name),rows:sqlite.prepare(`SELECT * FROM "${name}"`).all()}]));
const ordered=orderedSnapshotTables(tables).map(([name])=>name);
check(()=>assert.equal(ordered[0],'academic_catalogues'));
check(()=>assert.ok(ordered.indexOf('student_grade_promotions')>ordered.indexOf('students')));
const restored=new DatabaseSync(':memory:');for(const file of migrations)restored.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
restored.exec('DELETE FROM academic_catalogues;DELETE FROM tuition_groups;');
for(const [name,table] of orderedSnapshotTables(tables)){const stmt=restored.prepare(`INSERT INTO "${name}"(${table.columns.map(c=>'"'+c+'"').join(',')}) VALUES(${table.columns.map(()=>'?').join(',')})`);for(const row of table.rows)stmt.run(...table.columns.map(c=>row[c]));}
check(()=>assert.doesNotThrow(()=>checkRestoredAcademicStructure(restored)));
for(const name of ['academic_catalogues','students','student_grade_promotions'])check(()=>assert.deepEqual(restored.prepare(`SELECT * FROM "${name}"`).all(),sqlite.prepare(`SELECT * FROM "${name}"`).all()));
check(()=>assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok'));
restored.prepare('DELETE FROM students WHERE group_id=? AND name=?').run(group,'Fictional Learner');
check(()=>assert.equal(restored.prepare('SELECT count(*) AS n FROM student_grade_promotions').get().n,0,'permanent student deletion cascades its promotion records'));
check(()=>assert.throws(()=>sqlite.prepare('UPDATE students SET age=101').run(),/CHECK constraint/));restored.close();

const old=new DatabaseSync(':memory:');for(const file of migrations.filter(name=>name<'0029'))old.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
old.prepare('INSERT INTO teachers(group_id,name,active,created_at) VALUES(?,?,1,?)').run('next-genn-edu','Fictional Legacy Teacher',now);
old.prepare('INSERT INTO students(group_id,name,name_key,active,created_at) VALUES(?,?,?,1,?)').run('next-genn-edu','Fictional Legacy Learner','fictional legacy learner',now);
old.prepare('INSERT INTO plans(group_id,key,student,subject,teacher_name,duration,active,created_at) VALUES(?,?,?,?,?,1,1,?)').run('next-genn-edu','Fictional Legacy Learner|sCiEnCe','Fictional Legacy Learner','sCiEnCe','Fictional Legacy Teacher',now);
old.exec(fs.readFileSync(new URL('../drizzle/0029_academic_catalogues.sql',import.meta.url),'utf8'));
check(()=>assert.equal(old.prepare('SELECT key FROM plans').get().key,'Fictional Legacy Learner|sCiEnCe'));
check(()=>assert.deepEqual({...old.prepare('SELECT syllabus_id,grade,age FROM students').get()},{syllabus_id:'spm',grade:null,age:null}));old.close();

// Exercise the actual shared cache with deliberately reordered HTTP responses.
const client=(await load('lib/use-academic-catalogue.ts')).module.catalogueTest;
let pending=[],fetchCount=0;
globalThis.__catalogueFetch=(url,init)=>{fetchCount++;return new Promise(resolve=>pending.push({url,init,resolve}));};
const ready=value=>Response.json({...value,canManage:true});
const first=client.load('student',true),joined=client.load('student',true);await Promise.resolve();
check(()=>assert.equal(fetchCount,1));pending.shift().resolve(ready(seed));await Promise.all([first,joined]);
check(()=>assert.equal(client.entries.student.catalogue.canManage,undefined));
const slow=client.load('student',true);await Promise.resolve();const firstPending=pending.shift();
const fast=client.load('student',true,true);await Promise.resolve();const secondPending=pending.shift();
secondPending.resolve(ready({...seed,revision:5}));await fast;firstPending.resolve(ready({...seed,revision:4}));await slow;
check(()=>assert.equal(client.entries.student.catalogue.revision,5));
check(()=>assert.equal(firstPending.init.signal.aborted,true));
const other=client.load('quiz',true);await Promise.resolve();pending.shift().resolve(ready(quizSeed));await other;
check(()=>assert.equal(client.entries.student.catalogue.revision,5));check(()=>assert.equal(client.entries.quiz.catalogue.revision,1));
const outdated=client.load('student',true);await Promise.resolve();pending.shift().resolve(ready({...seed,revision:2}));await outdated;
check(()=>assert.equal(client.entries.student.catalogue.revision,5));
sqlite.close();
console.log(JSON.stringify({suite:'academic-catalogues',checks,network:'disabled',database:'isolated in-memory',coverage:'shared scopes, future roles, owner CAS, stale permission, audit rollback, additive migration, backup restore, cache races'}));
