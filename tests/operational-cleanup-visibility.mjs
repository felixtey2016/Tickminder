import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createFixtureLoader} from './fixture-loader.mjs';

// All data are fictional and in memory. Raw accounting sources deliberately
// survive the operational view filters, including immutable legacy rate links.
const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
function statement(query,values=[]){const execute=()=>{const s=sqlite.prepare(query);return s.columns().length?{results:s.all(...values),meta:{changes:0}}:{results:[],meta:s.run(...values)};};return{bind:(...v)=>statement(query,v),all:async()=>execute(),first:async()=>execute().results[0]||null,run:async()=>execute()};}
globalThis.__cleanupVisibilityDb={prepare:statement};
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64'),runtimeUrl=data("export const learningDb=()=>globalThis.__cleanupVisibilityDb;export const isOwnerAccount=()=>false;export const OWNER_EMAIL='owner@cleanup.example.test';"),environmentUrl=data("export const env={DB:globalThis.__cleanupVisibilityDb,ADMIN_PERMISSIONS_MODE:'enforced'};");
const load=createFixtureLoader({runtimeUrl,environmentUrl,runtimeFiles:['lib/learning-server.ts','lib/owner.ts']}),views=(await load('lib/group-data.ts')).module,schema=(await load('db/schema.ts')).module;
const {drizzle}=await import('drizzle-orm/d1'),orm=drizzle(globalThis.__cleanupVisibilityDb),group='cleanup-school',foreign='cleanup-other',now='2035-01-20T01:00:00Z';let checks=0;
function check(fn){fn();checks++;}
for(const id of[group,foreign])sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,id,now,now);
for(const gid of[group,foreign]){
 sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(gid,'Teacher',now);
 for(const name of['Gone','Keep','Marked','Cancelled'])sqlite.prepare('INSERT INTO students(group_id,name,name_key,created_at) VALUES(?,?,?,?)').run(gid,name,name.toLowerCase(),now);
}
function account(id,role,student=null){sqlite.prepare('INSERT INTO accounts(id,group_id,name,email,role,student_name,created_at) VALUES(?,?,?,?,?,?,?)').run(id,group,id,id+'@cleanup.example.test',role,student,now);}
account('cleanup-admin','admin','Gone');account('gone-login','student','Gone');account('keep-login','student','Keep');account('cleanup-teacher','teacher');sqlite.prepare("UPDATE accounts SET teacher_name='Teacher' WHERE id='cleanup-teacher'").run();
function room(id){sqlite.prepare('INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,group,id,'Math','Teacher','cleanup-admin',now,now);}
for(const id of['retired-room','shared-room','empty-room'])room(id);
function lesson(id,name,classId=null,sessionId=null){sqlite.prepare('INSERT INTO lessons(id,group_id,student,subject,teacher_name,planned_start,planned_end,status,created_by,updated_at,session_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,group,name,'Math','Teacher','2035-01-01T01:00:00Z','2035-01-01T02:00:00Z','completed','cleanup-admin',now,sessionId);if(!sessionId&&classId)sqlite.prepare('UPDATE class_sessions SET classroom_id=? WHERE id=?').run(classId,'one:'+id);}
lesson('gone-retired','Gone','retired-room');lesson('gone-unclassified','Gone');lesson('keep-solo','Keep');lesson('marked-solo','Marked');
sqlite.prepare("INSERT INTO class_sessions(id,group_id,session_type,classroom_id,teacher_name,subject,planned_start,planned_end,created_by,created_at,updated_at) VALUES(?,?,'group',?,'Teacher','Math',?,?,?,?,?)").run('shared-session',group,'shared-room','2035-01-01T01:00:00Z','2035-01-01T02:00:00Z','cleanup-admin',now,now);
lesson('shared-gone','Gone','shared-room','shared-session');lesson('shared-keep','Keep','shared-room','shared-session');
sqlite.prepare("INSERT INTO class_sessions(id,group_id,session_type,classroom_id,teacher_name,subject,planned_start,planned_end,created_by,created_at,updated_at) VALUES(?,?,'group',?,'Teacher','Math',?,?,?,?,?)").run('empty-session',group,'empty-room','2035-01-03T01:00:00Z','2035-01-03T02:00:00Z','cleanup-admin',now,now);
for(const name of['Gone','Keep','Marked','Cancelled'])sqlite.prepare('INSERT INTO plans(group_id,key,student,subject,teacher_name,duration,created_at) VALUES(?,?,?,?,?,?,?)').run(group,name+'|Math',name,'Math','Teacher',1,now);
for(const [id,studentName,status] of[['g','Gone','cleaned'],['m','Marked','marked'],['c','Cancelled','cancelled']])sqlite.prepare('INSERT INTO student_offboarding(group_id,student_name,status,last_lesson_date,revision,marked_by,marked_at,updated_by,updated_at,cleaned_at) VALUES(?,?,?,?,1,?,?,?,?,?)').run(group,studentName,status,'2035-01-01','cleanup-admin',now,'cleanup-admin',now,status==='cleaned'?now:null);
sqlite.prepare('INSERT INTO classroom_retirements(group_id,classroom_id,student_name,retired_at,retired_by) VALUES(?,?,?,?,?)').run(group,'retired-room','Gone',now,'cleanup-admin');
for(const [id,classId] of[['shared-homework','shared-room'],['retired-homework','retired-room']])sqlite.prepare("INSERT INTO homework(id,group_id,owner_id,title,subject,description,starts_at,due_at,created_at,classroom_id) VALUES(?,?,?,?,?,'',?,?,?,?)").run(id,group,'cleanup-teacher',id,'Math',now,now,now,classId);
for(const name of['Gone','Keep'])sqlite.prepare('INSERT INTO homework_recipients(id,group_id,homework_id,student_name) VALUES(?,?,?,?)').run('recipient-'+name,group,'shared-homework',name);
sqlite.prepare('INSERT INTO payroll_teachers(id,group_id,teacher_name,created_at) VALUES(?,?,?,?)').run('pay-teacher',group,'Teacher',now);
sqlite.prepare("INSERT INTO payroll_rate_scopes(id,group_id,teacher_id,scope_key,revision,updated_at) VALUES(?,?,?,'',1,?)").run('pay-scope',group,'pay-teacher',now);
sqlite.prepare("INSERT INTO payroll_rate_versions(id,group_id,scope_id,revision,amount_cents,currency,effective_from,created_by,created_at,operation_id,mode) VALUES(?,?,?,1,5000,'MYR','2035-01-01',?,?,?,'hour')").run('pay-rate',group,'pay-scope','cleanup-admin',now,'fictional-rate');
sqlite.prepare('INSERT INTO payroll_legacy_rate_links(id,group_id,teacher_id,classroom_id,scope_id,max_revision,created_at) VALUES(?,?,?,?,?,1,?)').run('pay-link',group,'pay-teacher','retired-room','pay-scope',now);
const rows=query=>views.groupRows(group,query),names=await rows('SELECT name FROM students ORDER BY name');
check(()=>assert.deepEqual(names.map(r=>r.name),['Cancelled','Keep','Marked']));
check(()=>assert.deepEqual(sqlite.prepare('SELECT name FROM students WHERE group_id=? ORDER BY name').all(group).map(r=>r.name),['Cancelled','Gone','Keep','Marked']));
const drStudents=orm.select({name:schema.students.name}).from(schema.students).where(views.groupWhere(schema.students,group)).orderBy(schema.students.name).toSQL();check(()=>assert.deepEqual(sqlite.prepare(drStudents.sql).all(...drStudents.params).map(r=>r.name),['Cancelled','Keep','Marked']));
const plans=await rows('SELECT student FROM plans ORDER BY student');check(()=>assert.deepEqual(plans.map(r=>r.student),['Cancelled','Keep','Marked']));
const courses=await rows('SELECT id FROM lessons ORDER BY id');check(()=>assert.deepEqual(courses.map(r=>r.id),['keep-solo','marked-solo','shared-keep']));
const sessions=await rows('SELECT id FROM class_sessions ORDER BY id');check(()=>assert.deepEqual(sessions.map(r=>r.id),['empty-session','one:keep-solo','one:marked-solo','shared-session']));
const participants=await rows("SELECT student_name FROM class_session_participants WHERE session_id='shared-session'");check(()=>assert.deepEqual(participants.map(r=>r.student_name),['Keep']));
const classes=await rows('SELECT id FROM classrooms ORDER BY id');check(()=>assert.deepEqual(classes.map(r=>r.id),['empty-room','shared-room']));
const users=await rows('SELECT id FROM accounts ORDER BY id');check(()=>assert.deepEqual(users.map(r=>r.id),['cleanup-admin','cleanup-teacher','keep-login']));
const drUsers=orm.select({id:schema.accounts.id}).from(schema.accounts).where(views.groupWhere(schema.accounts,group)).orderBy(schema.accounts.id).toSQL();check(()=>assert.deepEqual(sqlite.prepare(drUsers.sql).all(...drUsers.params).map(r=>r.id),['cleanup-admin','cleanup-teacher','keep-login']));
const homework=await rows('SELECT id FROM homework ORDER BY id');check(()=>assert.deepEqual(homework.map(r=>r.id),['shared-homework']));
const recipients=await rows('SELECT student_name FROM homework_recipients');check(()=>assert.deepEqual(recipients.map(r=>r.student_name),['Keep']));
const other=await views.groupRows(foreign,"SELECT name FROM students WHERE name='Gone'");check(()=>assert.equal(other.length,1));
check(()=>assert.equal(sqlite.prepare("SELECT count(*) AS n FROM lessons WHERE group_id=? AND student='Gone'").get(group).n,3));
check(()=>assert.equal(sqlite.prepare("SELECT count(*) AS n FROM class_session_participants WHERE group_id=? AND student_name='Gone'").get(group).n,3));
check(()=>assert.equal(sqlite.prepare("SELECT amount_cents FROM payroll_rate_versions WHERE id='pay-rate'").get().amount_cents,5000));
check(()=>assert.equal(sqlite.prepare("SELECT classroom_id FROM payroll_legacy_rate_links WHERE id='pay-link'").get().classroom_id,'retired-room'));
check(()=>assert.throws(()=>sqlite.prepare("DELETE FROM payroll_legacy_rate_links WHERE id='pay-link'").run(),/payroll_immutable/));
sqlite.prepare("INSERT INTO admin_permission_profiles(group_id,account_id,revision,grants_json,origin,updated_at) VALUES(?,?,1,?,'new',?)").run(group,'cleanup-admin',JSON.stringify(['statistics.view','lessons.view','attendance.view','homework.view']),now);
const statistics=(await load('lib/teaching-statistics-server.ts')).module,actor={id:'cleanup-admin',groupId:group,role:'admin',name:'cleanup-admin',email:'cleanup-admin@cleanup.example.test',teacherName:null,studentName:'Gone'};
const stats=await statistics.teachingStatistics(actor,new URLSearchParams({month:'2035-01'}),Date.parse(now));
check(()=>assert.equal(stats.current.schedule.scheduledSessions,3));
check(()=>assert.equal(stats.current.schedule.studentCount,2));
check(()=>assert.equal(stats.current.homework.publishedCount,1));
check(()=>assert.equal(stats.current.homework.recipientCount,1));
check(()=>assert.equal(stats.options.classrooms.some(c=>c.id==='retired-room'),false));
check(()=>assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]));
console.log(`Operational cleanup visibility, shared sessions and retained finance: ${checks} checks passed`);
