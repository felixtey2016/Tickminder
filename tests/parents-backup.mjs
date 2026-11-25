import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createFixtureLoader} from './fixture-loader.mjs';
import {snapshotVersion,expectedSnapshotTables,orderedSnapshotTables,checkRestoredParents} from '../scripts/backup-order.mjs';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
function database(max=999){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const name of fs.readdirSync(path.join(root,'drizzle')).filter(n=>n.endsWith('.sql')&&Number(n.slice(0,4))<=max).sort())db.exec(fs.readFileSync(path.join(root,'drizzle',name),'utf8'));return db;}
const sqlite=database();let active=sqlite;
function statement(sql,values=[]){const execute=()=>{assert(values.length<=100,'D1 parameter limit');const s=active.prepare(sql);return s.columns().length?{results:s.all(...values),meta:{changes:0}}:{results:[],meta:s.run(...values)};};return{bind:(...v)=>statement(sql,v),first:async()=>execute().results[0]||null,all:async()=>execute(),run:async()=>execute(),execute};}
const db={prepare:statement,batch:async statements=>{active.exec('BEGIN');try{const result=statements.map(s=>s.execute());active.exec('COMMIT');return result;}catch(error){active.exec('ROLLBACK');throw error;}}};
const token='fictional-parent-backup-token-123456789012345',owner={id:'parent-backup-owner',email:'owner@parent.example.test',role:'admin',groupId:'parent-school',name:'Fictional owner'};
globalThis.__parentBackup={learningDb:()=>db,currentBusinessAccount:async()=>owner,OWNER_EMAIL:owner.email,isOwnerAccount:a=>a?.role==='admin'&&a.email===owner.email&&!a.id.startsWith('local:'),pdfLimits:()=>({total:10000000}),pdfBucket:()=>({}),env:{ADMIN_PERMISSIONS_MODE:'enforced',BACKUP_EXPORT_TOKEN:token}};
const dataUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64'),runtimeUrl=dataUrl('export const {learningDb,currentBusinessAccount,OWNER_EMAIL,isOwnerAccount,pdfLimits,pdfBucket,env}=globalThis.__parentBackup;'),nextUrl=dataUrl('export const NextResponse={json:(data,options)=>Response.json(data,options)};');
const load=createFixtureLoader({runtimeUrl,environmentUrl:runtimeUrl,runtimeFiles:['lib/auth.ts','lib/owner.ts','lib/learning-server.ts','lib/pdf-storage.ts'],transform:(_file,code)=>code.replaceAll("'next/server'",JSON.stringify(nextUrl)).replaceAll('"next/server"',JSON.stringify(nextUrl))});
const service=(await load('lib/parents-server.ts')).module,route=(await load('app/api/backup-export/route.ts')).module;
const now=new Date().toISOString(),gid=owner.groupId,op=()=>crypto.randomUUID();
function group(id=gid){active.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,'Fictional Parent School',id+'-join',now,now);}
function account(id,role='parent'){active.prepare('INSERT INTO accounts(id,email,name,role,group_id,created_at) VALUES(?,?,?,?,?,?)').run(id,id+'@parent.example.test',id,role,gid,now);}
function learner(name){active.prepare('INSERT INTO students(group_id,name,name_key,created_at) VALUES(?,?,?,?)').run(gid,name,name.toLowerCase(),now);return active.prepare('SELECT id FROM billing_students WHERE group_id=? AND student_name=?').get(gid,name).id;}
group();account(owner.id,'admin');sqlite.prepare('UPDATE accounts SET email=? WHERE id=?').run(owner.email,owner.id);for(const id of['parent-active','parent-revoked','parent-deleted','parent-disabled','parent-converted'])account(id);
const first=learner('Child A'),second=learner('Child B');
const link=async(parentId,studentId,action='grant',revision=0)=>service.saveParentLink(owner,{action,parentId,studentId,revision,operationId:op(),verified:action==='grant',reason:action==='grant'?'Verified relationship\nSchool administrator checked':'Confirmed unlink request'});
await link('parent-active',first);await link('parent-active',second);
await link('parent-revoked',first);await link('parent-revoked',first,'revoke',1);
await link('parent-deleted',second);sqlite.prepare('DELETE FROM accounts WHERE id=?').run('parent-deleted');
await link('parent-disabled',second);sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now,'parent-disabled');
await link('parent-converted',first);await link('parent-converted',first,'revoke',1);sqlite.prepare("UPDATE accounts SET role='pending' WHERE id='parent-converted'").run();
sqlite.prepare("UPDATE students SET name='Child A Renamed',name_key='child a renamed' WHERE group_id=? AND name='Child A'").run(gid);
sqlite.prepare("UPDATE students SET active=0 WHERE group_id=? AND name='Child B'").run(gid);
let checks=0;const check=(label,fn)=>{fn();checks++;console.log('PASS '+label);};
check('disabled parents inactive students and revoked former parent identities retain valid history',()=>assert.doesNotThrow(()=>checkRestoredParents(sqlite)));
check('account deletion removes current grants while retaining immutable history',()=>{assert.equal(sqlite.prepare("SELECT count(*) n FROM parent_child_links WHERE parent_account_id='parent-deleted'").get().n,0);assert.equal(sqlite.prepare("SELECT count(*) n FROM parent_link_events WHERE parent_account_id='parent-deleted'").get().n,1);});
check('grant and revoke operations are append only',()=>{assert.throws(()=>sqlite.prepare("UPDATE parent_link_events SET reason='tamper'").run(),/parent_history_immutable/);assert.throws(()=>sqlite.prepare('DELETE FROM parent_link_events').run(),/parent_history_immutable/);assert.throws(()=>sqlite.prepare('DELETE FROM parent_operations').run(),/parent_history_immutable/);});
const request=()=>new Request('https://fictional.test/api/backup-export',{headers:{authorization:'Bearer '+token}}),response=await route.GET(request()),snapshot=await response.json();
let secure=fs.readFileSync(path.join(root,'scripts/secure-d1-backup.mjs'),'utf8').replace(/\r\n/g,'\n').split('\ntry {\n')[0];secure=secure.replace("const projectRoot = resolve(import.meta.dirname, '..').toLowerCase();",'const projectRoot = '+JSON.stringify(root.toLowerCase())+';').replace("'./backup-order.mjs'",JSON.stringify(new URL('../scripts/backup-order.mjs',import.meta.url).href));const {restoreInMemory}=await import(dataUrl(secure+'\nexport {restoreInMemory};'));
check('actual export is complete v31 and replay does not regenerate history',()=>{assert.equal(response.status,200);assert.equal(snapshotVersion(snapshot),31);assert.deepEqual(Object.keys(snapshot.tables).sort(),expectedSnapshotTables(31).sort());const counts=restoreInMemory(snapshot);assert.equal(counts.parent_operations,8);assert.equal(counts.parent_link_events,8);assert.equal(counts.parent_child_links,5);});
check('dependency restore order scopes parent grants after both identities and operations',()=>{const names=orderedSnapshotTables(snapshot.tables).map(([name])=>name);for(const [a,b]of[['accounts','parent_child_links'],['billing_students','parent_child_links'],['parent_operations','parent_child_links'],['parent_child_links','parent_link_events']])assert(names.indexOf(a)<names.indexOf(b));});
function corrupt(label,edit){check(label,()=>{const bad=structuredClone(snapshot);edit(bad);assert.throws(()=>restoreInMemory(bad),/parent|constraint|Incomplete|Schema mismatch/i);});}
corrupt('tampered cached link revision rejected',s=>s.tables.parent_child_links.rows[0].revision++);
corrupt('grant cannot be changed without matching immutable event',s=>s.tables.parent_child_links.rows[0].active=0);
corrupt('cross group parent grant rejected',s=>s.tables.parent_child_links.rows[0].group_id='next-genn-edu');
corrupt('parent role cannot inherit an active grant after conversion',s=>s.tables.accounts.rows.find(a=>a.id==='parent-active').role='teacher');
corrupt('missing current link cannot hide a still existing pair of identities',s=>s.tables.parent_child_links.rows.shift());
corrupt('history gap rejected even when newest cache remains valid',s=>s.tables.parent_link_events.rows=s.tables.parent_link_events.rows.filter(e=>!(e.parent_account_id==='parent-revoked'&&e.revision===1)));
corrupt('event action cannot disagree with operation replay',s=>s.tables.parent_link_events.rows[0].action='revoke');
corrupt('operation hash is independently reconstructed from its verified event',s=>s.tables.parent_operations.rows[0].request_hash='0'.repeat(64));
corrupt('operation actor cannot disagree with event actor',s=>s.tables.parent_operations.rows[0].actor_id='other-admin');
corrupt('operation replay cannot restore different child privileges',s=>{const o=s.tables.parent_operations.rows[0],r=JSON.parse(o.result_json);r.link.active=!r.link.active;o.result_json=JSON.stringify(r);});
corrupt('incomplete parent table set rejected',s=>delete s.tables.parent_child_links);
corrupt('orphan operation cannot restore a fabricated success',s=>{const o=structuredClone(s.tables.parent_operations.rows[0]);o.operation_id=op();s.tables.parent_operations.rows.push(o);});
// An old snapshot is restored to its exact schema, with no implicit parent grants.
const old=database(47);active=old;group();account('legacy-parent');learner('Legacy Child');const legacy=await(await route.GET(request())).json();
check('nonempty v28 snapshot remains readable without any new grants',()=>{assert.equal(snapshotVersion(legacy),28);assert(!legacy.tables.parent_child_links);const counts=restoreInMemory(legacy);assert.equal(counts.accounts,1);assert.equal(counts.students,1);});
old.close();active=sqlite;
check('historical identity names survive rename and parent deletion byte exactly',()=>{const frozen=sqlite.prepare("SELECT student_name,parent_name FROM parent_link_events WHERE parent_account_id='parent-revoked' ORDER BY revision").all();assert(frozen.every(e=>e.student_name==='Child A'));const expected=createHash('sha256').update(JSON.stringify(snapshot.tables.parent_link_events.rows)).digest('hex');assert.equal(expected,createHash('sha256').update(JSON.stringify(sqlite.prepare('SELECT * FROM parent_link_events').all())).digest('hex'));});
sqlite.close();console.log(JSON.stringify({suite:'parents-backup',checks,productionWrites:false}));
