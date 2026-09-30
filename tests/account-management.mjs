import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// Execute the actual route and merge SQL in an isolated in-memory database.
// Only authentication/network bindings are substituted; no production bypass exists.
const db = new DatabaseSync(':memory:');
for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter(n => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8'));
const prepare = sql => ({ bind(...values) { return {
  first: async () => db.prepare(sql).get(...values) || null,
  all: async () => ({ results: db.prepare(sql).all(...values) }),
  run: async () => ({ meta: db.prepare(sql).run(...values) }),
  execute: () => db.prepare(sql).run(...values),
}; } });
const d1 = { prepare, async batch(statements) { db.exec('BEGIN'); try { const results = statements.map(s => s.execute()); db.exec('COMMIT'); return results; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
let actor;
const harness = {
  learningDb: () => d1,
  first: async (sql, ...args) => db.prepare(sql).get(...args) || null,
  rows: async (sql, ...args) => db.prepare(sql).all(...args),
  change: async (action, actorId, id, after) => db.prepare('INSERT INTO audit (id,lesson_id,actor_id,action,after_json,at) VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(),id,actorId,action,JSON.stringify(after),new Date().toISOString()),
  teacherMayAssign: async () => false,
  classroomMemberNames: async id => db.prepare('SELECT student_name FROM classroom_members WHERE classroom_id=?').all(id).map(r=>r.student_name),
  currentAccount: async () => actor,
  verifyPassword: async (password, stored) => password === stored,
  verifyGoogleCredential: async token => { if (token !== 'verified-google-proof') throw new Error('Bad proof'); return { id: 'duplicate', email: 'teacher@example.test' }; },
  OWNER_EMAIL: 'owner@example.test',
  isOwnerAccount: a => a.id === 'owner' && a.role === 'admin',
  classroomMayManage: async (a, id) => Boolean(db.prepare('SELECT id FROM classrooms WHERE id = ? AND (teacher_name = ? OR ? = ?)').get(id, a.teacherName || '', a.role, 'admin')),
  deleteUnreferencedFile: async id => {
    const used = db.prepare('SELECT 1 FROM teaching_materials WHERE file_id = ? UNION SELECT 1 FROM homework WHERE attachment_file_id = ? UNION SELECT 1 FROM homework_submissions WHERE file_id = ?').get(id,id,id);
    if (!used) db.prepare('DELETE FROM pdf_files WHERE id = ?').run(id);
  },
  NextResponse: { json: (data, options) => Response.json(data, options) },
};
globalThis.__accountTest = harness;
const stub = `data:text/javascript;base64,${Buffer.from('export const {learningDb,first,rows,change,teacherMayAssign,classroomMemberNames,currentAccount,verifyPassword,verifyGoogleCredential,OWNER_EMAIL,isOwnerAccount,classroomMayManage,deleteUnreferencedFile,NextResponse}=globalThis.__accountTest;').toString('base64')}`;
async function load(file, mergeUrl) {
  let source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  source = source.replace(/from "(@\/[^\"]+|next\/server)"/g, (_, path) => `from "${path === '@/lib/account-merge' ? mergeUrl : stub}"`);
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const url = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
  return { url, module: await import(url) };
}
const merge = await load('lib/account-merge.ts');
const link = (await load('app/api/account-link/route.ts', merge.url)).module;
const manage = (await load('app/api/manage/route.ts')).module;
const now = new Date().toISOString();
function account(id, role, teacher = null, email = '') { db.prepare('INSERT INTO accounts (id,email,name,role,teacher_name,created_at) VALUES (?,?,?,?,?,?)').run(id,email,id,role,teacher,now); }
account('local:teacher','teacher','Teacher'); account('duplicate','teacher','Teacher','teacher@example.test'); account('other','teacher','Other'); account('admin','admin'); account('owner','admin',null,'owner@example.test');
db.prepare('INSERT INTO local_credentials VALUES (?,?,?,?,?)').run('local:teacher','teacher','correct-password',0,now);
db.prepare('INSERT INTO google_identities VALUES (?,?,?,?)').run('duplicate','duplicate','teacher@example.test',now);
db.prepare('INSERT INTO classrooms (id,title,subject,teacher_name,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('class','Science','Science','Teacher','duplicate',now,now);
const request = body => new Request('https://test.invalid/api/action', { method:'POST',headers:{origin:'https://test.invalid','content-type':'application/json'},body:JSON.stringify(body) });
actor = { id:'local:teacher',role:'teacher',teacherName:'Teacher',email:'' };
assert.equal((await link.POST(request({password:'bad',credential:'verified-google-proof'}))).status,403);
assert.equal((await link.POST(request({password:'correct-password',credential:'invalid'}))).status,400);
const pending = await link.POST(request({password:'correct-password',credential:'verified-google-proof'}));
assert.equal(pending.status,409); assert.equal((await pending.json()).mergeName,'duplicate');
assert.ok(db.prepare('SELECT id FROM accounts WHERE id = ?').get('duplicate'),'Preview must not mutate');
assert.equal((await merge.module.prepareAccountMerge(actor,'other',true)).statements.length,0,'Different identities denied');
assert.equal((await link.POST(request({password:'correct-password',credential:'verified-google-proof',confirmMerge:true}))).status,200);
assert.equal(db.prepare('SELECT account_id FROM google_identities').get().account_id,'local:teacher');
assert.equal(db.prepare('SELECT created_by FROM classrooms').get().created_by,'local:teacher');
assert.equal(db.prepare('SELECT id FROM accounts WHERE id = ?').get('duplicate'),undefined);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'mergeAccount'").get().n,1);
// Strict uniqueness must roll the entire transaction back on conflicting linkage.
await assert.rejects(d1.batch([prepare("UPDATE classrooms SET title = 'bad'").bind(),prepare('INSERT INTO google_identities VALUES (?,?,?,?)').bind('another','local:teacher','x@test.invalid',now)]));
assert.equal(db.prepare('SELECT title FROM classrooms').get().title,'Science');
actor = {id:'other',role:'teacher',teacherName:'Other',email:''};
assert.equal((await manage.POST(request({kind:'classroom',id:'class',confirm:true}))).status,404);
actor = {id:'admin',role:'admin',email:''};
assert.equal((await manage.POST(request({kind:'account',id:'owner',confirm:true}))).status,403);
assert.equal((await manage.POST(request({kind:'classroom',id:'class'}))).status,400);
assert.equal((await manage.POST(request({kind:'classroom',id:'class',confirm:true}))).status,200);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM classrooms').get().n,0);
// PDFs referenced by another homework survive deleting a different homework.
db.prepare('INSERT INTO pdf_files (id,owner_id,kind,object_key,filename,bytes,context_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run('pdf','local:teacher','material','key','handout.pdf',100,null,'attached',now);
for (const id of ['hw1','hw2']) db.prepare('INSERT INTO homework (id,owner_id,title,subject,description,starts_at,due_at,attachment_file_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id,'local:teacher',id,'Science','','2026-01-01','2026-12-01','pdf',now);
assert.equal((await manage.POST(request({kind:'homework',id:'hw1',confirm:true}))).status,200);
assert.ok(db.prepare('SELECT id FROM pdf_files WHERE id = ?').get('pdf'));
assert.equal((await manage.POST(request({kind:'account',id:'local:teacher',confirm:true}))).status,409,'Owned resources must be handled first');
assert.equal((await manage.POST(request({kind:'homework',id:'hw2',confirm:true}))).status,200);
assert.equal(db.prepare('SELECT id FROM pdf_files WHERE id = ?').get('pdf'),undefined);
actor = {id:'student',role:'student'};
assert.equal((await manage.POST(request({kind:'account',id:'other',confirm:true}))).status,403);
actor = null;
assert.equal((await link.POST(request({}))).status,401);
// Previews use the actual deletion route, remain read-only and reject stale state.
actor={id:'admin',role:'admin',email:''};
for(const id of ['lesson-a','lesson-b']) db.prepare('INSERT INTO lessons (id,student,subject,teacher_name,planned_start,planned_end,actual_start,actual_end,status,chargeable,reviewed_at,created_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'Synthetic Student','Science','Teacher','2026-09-01T00:00:00Z','2026-09-01T01:00:00Z','2026-09-01T00:00:00Z','2026-09-01T01:00:00Z','completed',1,now,'admin',now);
db.prepare('INSERT INTO reschedule_requests (id,lesson_id,original_start,original_end,proposed_start,proposed_end,requested_by,requested_at) VALUES (?,?,?,?,?,?,?,?)').run('req','lesson-a','a','b','c','d','admin',now);
const entries=['lesson-a','lesson-b'].map(id=>({kind:'lesson',id}));
const previewResponse=await manage.POST(request({action:'previewDelete',entries}));assert.equal(previewResponse.status,200);const preview=await previewResponse.json();
assert.equal(preview.items.length,2);assert.equal(preview.items.reduce((s,i)=>s+i.hours,0),2);assert.equal(preview.items[0].effects.find(e=>e.table==='reschedule_requests').count,1);
assert.equal(db.prepare('SELECT count(*) AS n FROM lessons').get().n,2);
db.prepare("UPDATE lessons SET note='updated' WHERE id='lesson-a'").run();
assert.equal((await manage.POST(request({entries,confirm:true,fingerprint:preview.fingerprint,previewAt:preview.previewAt}))).status,409);
assert.equal(db.prepare('SELECT count(*) AS n FROM lessons').get().n,2);
const fresh=await (await manage.POST(request({action:'previewDelete',entries}))).json();
assert.equal((await manage.POST(request({entries,confirm:true,fingerprint:fresh.fingerprint,previewAt:'2020-01-01T00:00:00Z'}))).status,409);
assert.equal((await manage.POST(request({entries,confirm:true,fingerprint:fresh.fingerprint,previewAt:fresh.previewAt}))).status,200);
assert.equal(db.prepare('SELECT count(*) AS n FROM lessons').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM reschedule_requests').get().n,0);
const blocked=await (await manage.POST(request({action:'previewDelete',entries:[{kind:'account',id:'admin'},{kind:'account',id:'other'}]}))).json();
assert.equal(blocked.blocked.length,1);assert.equal(blocked.items.length,1);
assert.equal((await manage.POST(request({entries:[{kind:'account',id:'other'},{kind:'account',id:'admin'}],confirm:true,fingerprint:blocked.fingerprint,previewAt:blocked.previewAt}))).status,403);
assert.ok(db.prepare("SELECT id FROM accounts WHERE id='other'").get(),'Blocked batch deletes nothing');
actor={id:'student',role:'student'};
const denied=await (await manage.POST(request({action:'previewDelete',entries:[{kind:'homework',id:'unrelated'}]}))).json();assert.equal(denied.items.length,0);assert.equal(denied.blocked.length,1);
actor=null;assert.equal((await manage.POST(request({action:'previewDelete',entries}))).status,401);
const classes=(await load('app/api/classrooms/route.ts')).module;
actor={id:'other',role:'teacher',teacherName:'Other'};assert.equal((await classes.POST(request({action:'saveTerm',name:'2026 Semester 2'}))).status,403);
actor={id:'admin',role:'admin'};
const term1=await (await classes.POST(request({action:'saveTerm',name:'2026 Semester 2',isCurrent:true}))).json();assert.ok(term1.id);
const term2=await (await classes.POST(request({action:'saveTerm',name:'2027 Semester 1',isCurrent:true}))).json();assert.ok(term2.id);
assert.equal(db.prepare('SELECT count(*) AS n FROM academic_terms WHERE is_current=1').get().n,1);
assert.equal(db.prepare('SELECT id FROM academic_terms WHERE is_current=1').get().id,term2.id);
assert.equal((await classes.POST(request({action:'saveTerm',name:'2027 Semester 1'}))).status,409);
assert.equal((await classes.POST(request({action:'saveTerm',name:'Updated',id:'missing'}))).status,404);
// Inline classroom term creation can add labels, never edit or change the current term.
db.prepare('INSERT INTO teachers (name,active,created_at) VALUES (?,1,?)').run('Other',now);
actor={id:'other',role:'teacher',teacherName:'Other'};
const inlineResponse=await classes.POST(request({action:'createTerm',name:'2027 Term 2'}));assert.equal(inlineResponse.status,200,JSON.stringify(await inlineResponse.clone().json()));
const inline=await inlineResponse.json();assert.equal(db.prepare('SELECT is_current FROM academic_terms WHERE id=?').get(inline.id).is_current,0);
assert.equal(db.prepare('SELECT id FROM academic_terms WHERE is_current=1').get().id,term2.id);
assert.equal((await classes.POST(request({action:'createTerm',name:'2027 term 2'}))).status,409);
assert.equal((await classes.POST(request({action:'createTerm',name:'No',isCurrent:true}))).status,403);
assert.equal((await classes.POST(request({action:'createTerm',name:'Rename',id:inline.id}))).status,403);
actor={id:'unbound',role:'teacher',teacherName:null};assert.equal((await classes.POST(request({action:'createTerm',name:'No'}))).status,403);
actor={id:'student',role:'student'};assert.equal((await classes.POST(request({action:'createTerm',name:'No'}))).status,403);
actor={id:'admin',role:'admin'};assert.equal((await classes.POST(request({action:'createTerm',name:'2027 Term 3'}))).status,200);
delete globalThis.__accountTest; db.close();
console.log('Account proof, explicit merge, rollback, deletion permissions and shared PDF preservation passed');
