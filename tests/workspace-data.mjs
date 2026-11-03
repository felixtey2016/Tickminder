import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { drizzle } from 'drizzle-orm/d1';
import ts from 'typescript';

// Real auth, tenant/permission SQL and old services; only storage/headers are
// replaced. No network call, production data or persistent database is used.
const sqlite = new DatabaseSync(':memory:');
for (const file of fs.readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
sqlite.exec('PRAGMA foreign_keys=ON');
let cookie, selectedGroup, beforeRead, checks = 0;
const reads = [];
function statement(sql, values = []) {
  const execute = (raw = false) => {
    assert.ok(values.length <= 100, 'D1 parameter bound');
    beforeRead?.(sql);
    const prepared = sqlite.prepare(sql); if (raw) prepared.setReturnArrays(true);
    const result = prepared.columns().length ? { results: prepared.all(...values), meta: { changes: 0 } } : { results: [], meta: prepared.run(...values) };
    reads.push({ sql, rows: result.results.length }); return result;
  };
  return { bind: (...args) => statement(sql, args), first: async () => execute().results[0] || null, all: async () => execute(), raw: async () => execute(true).results, run: async () => execute(), execute };
}
const db = { prepare: statement, async batch(items) { sqlite.exec('BEGIN'); try { const result = items.map(item => item.execute()); sqlite.exec('COMMIT'); return result; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
globalThis.__homeSummaryFixture = { env: { DB: db, ADMIN_PERMISSIONS_MODE: 'enforced' }, getDb: () => drizzle(db), cookies: async () => ({ get: name => name === 'tuition_session' && cookie ? { value: cookie } : undefined }), headers: async () => new Headers(selectedGroup ? { 'x-tickminder-group': selectedGroup } : {}), NextResponse: { json: (value, options) => Response.json(value, options) } };
const stub = 'data:text/javascript;base64,' + Buffer.from('export const {env,getDb,cookies,headers,NextResponse}=globalThis.__homeSummaryFixture;').toString('base64');
const applicationRoot = new URL('../', import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (['cloudflare:workers', 'next/headers', 'next/server', '@/db'].includes(specifier)) return { url: stub, shortCircuit: true };
    if (specifier.startsWith('@/')) return { url: new URL(specifier.slice(2) + '.ts', applicationRoot).href, shortCircuit: true };
    if (specifier.startsWith('.') && context.parentURL?.startsWith(applicationRoot) && context.parentURL.endsWith('.ts')) return { url: new URL(/\.[cm]?[jt]sx?$/.test(specifier) ? specifier : specifier + '.ts', context.parentURL).href, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) { return url.startsWith(applicationRoot) && url.endsWith('.ts') ? { format: 'module', source: ts.transpileModule(fs.readFileSync(new URL(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true } : next(url, context); },
});
const OriginalDate = Date, originalFetch = globalThis.fetch;
const clock = OriginalDate.parse('2026-11-04T04:00:00.000Z');
globalThis.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
globalThis.fetch = async () => { throw new Error('Network is forbidden in home-summary fixtures'); };
const load = file => import(new URL('../' + file, import.meta.url));
const route = await load('app/api/workspace-data/route.ts'), auth = await load('lib/auth.ts'), grants = await load('lib/admin-permissions.ts');
const courses = await load('lib/course-query.ts'), learning = await load('lib/learning-server.ts'), display = await load('lib/class-session-display.ts');
const ownerModule = await load('lib/owner.ts');
const group = 'fictional-home-a', other = 'fictional-home-b', now = new Date().toISOString(), date = '2026-11-04';
for (const id of [group, other]) sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(id, id, id, now, now);
async function account(id, role, person, gid = group, email = id + '@example.test') {
  sqlite.prepare('INSERT INTO accounts(id,group_id,email,name,role,teacher_name,student_name,created_at,name_confirmed_at,activated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, gid, email, id, role, role === 'teacher' ? person : null, role === 'student' ? person : null, now, now, now);
  sqlite.prepare('INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES(?,?,?,0,?)').run(id, id, 'fictional-unused-password-hash', now);
  const token = 'fictional-session-' + id;
  sqlite.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run(await auth.hashToken(token), id, '2099-01-01T00:00:00.000Z');
  return { id, token, gid };
}
const admin = await account('home-admin', 'admin'), limited = await account('home-course-only', 'admin'), attendance = await account('home-attendance-only', 'admin'), noGrants = await account('home-no-grants', 'admin');
const teacher = await account('home-teacher', 'teacher', 'Teacher A'), student = await account('home-student', 'student', 'Alpha');
const foreign = await account('home-foreign', 'student', 'Alpha', other), parent = await account('home-parent', 'parent'), pending = await account('home-pending', 'pending');
const owner = await account('home-owner', 'admin', null, null, ownerModule.OWNER_EMAIL);
function profile(a, allowed) { sqlite.prepare("INSERT OR REPLACE INTO admin_permission_profiles(group_id,account_id,revision,grants_json,origin,updated_at) VALUES(?,?,1,?,'new',?)").run(group, a.id, JSON.stringify(grants.normalizeAdminGrants(allowed)), now); }
profile(admin, grants.SUPPORTED_ADMIN_GRANTS); profile(limited, ['lessons.view']); profile(attendance, ['attendance.view']); profile(noGrants, ['statistics.view']);
for (const gid of [group, other]) {
  sqlite.prepare('INSERT INTO teachers(group_id,name,active,created_at) VALUES(?,?,1,?)').run(gid, 'Teacher A', now);
  for (const name of ['Alpha', 'Beta', 'Removed']) {
    sqlite.prepare('INSERT INTO students(group_id,name,name_key,active,created_at) VALUES(?,?,?,1,?)').run(gid, name, name.toLowerCase(), now);
    sqlite.prepare('INSERT INTO plans(key,group_id,student,subject,teacher_name,online_link,active,created_at) VALUES(?,?,?,?,?,?,?,?)').run(gid + name, gid, name, 'Mathematics', 'Teacher A', 'https://example.test/lesson', name === 'Removed' ? 0 : 1, now);
  }
}
sqlite.prepare("INSERT INTO class_sessions(id,group_id,session_type,classroom_title,teacher_name,subject,planned_start,planned_end,online_link,status,created_by,created_at,updated_at) VALUES('home-big-class',?,'group','Large fictional class','Teacher A','Mathematics','2026-11-04T01:00:00Z','2026-11-04T02:00:00.000Z','https://example.test/group','scheduled',?,?,?)").run(group, admin.id, now, now);
function lesson(id, name, start, status = 'scheduled', sessionId = null, gid = group) {
  sqlite.prepare('INSERT INTO lessons(id,group_id,student,subject,teacher_name,planned_start,planned_end,status,session_id,note,created_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, gid, name, 'Mathematics', 'Teacher A', start, new Date(Date.parse(start) + 3600000).toISOString(), status, sessionId, 'PRIVATE ATTENDANCE NOTE', admin.id, now);
}
for (let i = 0; i < 25; i++) {
  const name = i === 0 ? 'Alpha' : 'Class member ' + i;
  if (i) sqlite.prepare('INSERT INTO students(group_id,name,name_key,active,created_at) VALUES(?,?,?,1,?)').run(group, name, name.toLowerCase(), now);
  lesson('big-' + String(i).padStart(2, '0'), name, '2026-11-04T01:00:00Z', 'scheduled', 'home-big-class');
}
lesson('today-second', 'Alpha', '2026-11-04T05:00:00Z'); lesson('today-third', 'Beta', '2026-11-04T06:00:00Z', 'completed'); lesson('today-fourth', 'Alpha', '2026-11-04T07:00:00Z');
lesson('cancelled', 'Alpha', '2026-11-04T00:00:00Z', 'cancelled'); lesson('old-absent', 'Alpha', '2026-09-01T01:00:00Z', 'student_absent');
lesson('old-replaced', 'Alpha', '2026-09-02T01:00:00Z', 'teacher_absent'); lesson('replacement', 'Alpha', '2026-12-01T01:00:00Z'); sqlite.prepare("UPDATE lessons SET replacement_for='old-replaced' WHERE id='replacement'").run();
lesson('removed-plan', 'Removed', '2026-11-04T08:00:00Z'); lesson('foreign-private', 'Alpha', '2026-11-04T03:00:00Z', 'scheduled', null, other);
lesson('midnight-end', 'Alpha', '2026-11-03T15:00:00Z'); lesson('midnight-start', 'Alpha', '2026-11-03T16:00:00Z');
for(const [id,lessonId,requester,role,gid,status] of [
  ['student-request','today-second',student.id,'student',group,'pending'],
  ['teacher-request','today-fourth',teacher.id,'teacher',group,'pending'],
  ['own-request','today-second',teacher.id,'student',group,'pending'],
  ['resolved-request','today-second',student.id,'student',group,'accepted'],
  ['cancelled-request','cancelled',student.id,'student',group,'pending'],
  ['foreign-request','foreign-private',foreign.id,'student',other,'pending'],
]) sqlite.prepare('INSERT INTO reschedule_requests(id,group_id,lesson_id,original_start,original_end,proposed_start,proposed_end,status,requested_by,requested_role,requested_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,gid,lessonId,now,now,now,now,status,requester,role,now);
function homework(id, gid = group, ownerId = teacher.id, room = null) {
  sqlite.prepare('INSERT INTO homework(id,group_id,owner_id,title,subject,description,starts_at,due_at,classroom_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, gid, ownerId, id, 'Mathematics', 'PRIVATE HOMEWORK DESCRIPTION', id.includes('future') ? '2099-01-01T00:00:00Z' : '2020-01-01T00:00:00Z', '2099-02-01T00:00:00Z', room, now);
  sqlite.prepare('INSERT INTO homework_recipients(id,group_id,homework_id,student_name) VALUES(?,?,?,?)').run('recipient-' + id, gid, id, 'Alpha');
}
homework('pending-work'); homework('submitted-work'); homework('future-work'); homework('other-teacher-work', group, admin.id); homework('foreign-work', other);
sqlite.prepare("INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_by,created_at,updated_at) VALUES('allowed-home-class',?,'Allowed','Mathematics','Teacher A',?,?,?)").run(group, admin.id, now, now);
sqlite.prepare("INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES('home-membership',?,'allowed-home-class','Alpha',?)").run(group, now);
homework('class-work', group, teacher.id, 'allowed-home-class');
sqlite.prepare("INSERT INTO pdf_files(id,group_id,object_key,owner_id,kind,filename,bytes,status,created_at) VALUES('home-submit',?,'fictional/home',?,'submission','fictional.pdf',10,'attached',?)").run(group, student.id, now);
sqlite.prepare("INSERT INTO homework_submissions(id,group_id,homework_id,student_name,file_id,submitted_at,late) VALUES('home-submission',?,'submitted-work','Alpha','home-submit',?,0)").run(group, now);
for (const [id, ownerId, starts, ends] of [['expired', student.id, '2026-10-01T00:00:00Z', '2026-10-01T01:00:00Z'], ['next-study', student.id, '2026-11-04T05:00:00Z', '2026-11-04T06:00:00Z'], ['later-study', student.id, '2026-11-05T05:00:00Z', '2026-11-05T06:00:00Z'], ['other-study', foreign.id, '2026-11-04T04:01:00Z', '2026-11-04T05:00:00Z']]) sqlite.prepare('INSERT INTO study_blocks(id,group_id,account_id,title,subject,note,starts_at,ends_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, ownerId === foreign.id ? other : group, ownerId, id, 'Math', 'PRIVATE STUDY NOTE', starts, ends, now, now);
const stateRoute = await load('app/api/state/route.ts');
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)),message); checks++; };
const normal = rows => [...rows].sort((a,b)=>String(a.id||a.key||a.name).localeCompare(String(b.id||b.key||b.name)));
const pick = (rows, keys) => normal(rows.map(row=>Object.fromEntries(keys.map(key=>[key,row[key]??null]))));
async function get(as=admin, view='calendar', query='', gid=as?.gid) {
 cookie=as?.token; selectedGroup=gid;
 const range=['calendar','study'].includes(view)?'&from=2026-11-04&to=2026-11-05':'';
 const response=await route.GET(new Request('https://example.test/api/workspace-data?view='+view+range+query));
 return {status:response.status,data:await response.json(),headers:response.headers};
}
async function legacy(as, scope='core') {
 cookie=as.token;selectedGroup=as.gid;
 const response=await stateRoute.GET(new Request('https://example.test/api/state?scope='+scope+'&month=2026-11&from=2026-11-04&to=2026-11-05'));
 assert.equal(response.status,200);return response.json();
}
async function actor(as){cookie=as.token;selectedGroup=as.gid;return auth.currentBusinessAccount();}
const planFields=['key','student','subject','subjectId','teacher','duration','onlineLink','syllabusId','grade'];
// Active and inactive selector semantics must survive removing the broad roster.
for(const gid of [group,other]) {
 sqlite.prepare('INSERT INTO teachers(group_id,name,active,created_at) VALUES(?,?,0,?)').run(gid,'Inactive teacher',now);
 sqlite.prepare('INSERT INTO students(group_id,name,name_key,active,created_at) VALUES(?,?,?,0,?)').run(gid,'Inactive student','inactive',now);
 sqlite.prepare('INSERT INTO plans(key,group_id,student,subject,teacher_name,active,created_at) VALUES(?,?,?,?,?,0,?)').run(gid+'inactive',gid,'Inactive student','History','Inactive teacher',now);
}
for(const [id,gid,who,room] of [['material',group,teacher.id,null],['class-material',group,teacher.id,'allowed-home-class'],['foreign-material',other,foreign.id,null]]) {
 sqlite.prepare('INSERT INTO pdf_files(id,group_id,object_key,owner_id,kind,filename,bytes,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id+'-pdf',gid,id,who,'material','fictional.pdf',10,'attached',now);
 sqlite.prepare('INSERT INTO teaching_materials(id,group_id,owner_id,title,description,file_id,classroom_id,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,gid,who,id,'fictional',id+'-pdf',room,now);
 sqlite.prepare('INSERT INTO material_recipients(id,group_id,material_id,student_name,subject) VALUES(?,?,?,?,?)').run(id+'-recipient',gid,id,'Alpha','Mathematics');
}
sqlite.prepare('INSERT INTO academic_terms(id,group_id,name,is_current,created_at) VALUES(?,?,?,1,?)').run('local-term',group,'Local term',now);
sqlite.prepare('INSERT INTO academic_terms(id,group_id,name,is_current,created_at) VALUES(?,?,?,1,?)').run('foreign-term',other,'Foreign term',now);
try {
 for(const as of [admin,teacher,student,foreign]) {
  const old=await legacy(as);reads.length=0;
  const calendar=await get(as);
  check(calendar.status===200,as.id+' calendar succeeds');
  for(const key of ['lessons','attendanceSessions','classSessions','classSessionRequests','proposals','courseRange']) equal(calendar.data.data[key],old[key]||[],as.id+' calendar '+key+' matches old scoped state');
  check(!reads.some(read=>/FROM (homework|teaching_materials|study_blocks)|AS pendingAttendance|AS allTeachers/i.test(read.sql)), 'Calendar never reads learning or monthly aggregate data');
  check(!['summary','teachingSummary','taskCounts','allStudents','allTeachers','learning'].some(key=>key in calendar.data.data),'Calendar response is only calendar data');
  check(calendar.headers.get('cache-control')==='private, no-store'&&calendar.headers.get('vary').includes('Cookie'),'Identity cache headers');
  for(const view of ['materials','homework']) {
   const previous=(await legacy(as,'learning')).learning;reads.length=0;
   const result=await get(as,view);check(result.status===200,as.id+' '+view+' succeeds');
   for(const key of view==='materials'?['materials','eligible','limits']:['homework','submissions','eligible','limits']) equal(result.data.data[key],previous[key],as.id+' '+key+' exactly matches legacy learning');
   check(!reads.some(read=>/FROM study_blocks/.test(read.sql)),view+' omits study history');
   check(!reads.some(read=>view==='materials'?/FROM homework(?:\s|_)/.test(read.sql):/FROM teaching_materials/.test(read.sql)),view+' does not query the other category');
  }
 }
 for(const as of [admin,teacher]) {
  const old=await legacy(as),result=await get(as,'schedule');check(result.status===200,as.id+' schedule succeeds');
  equal(pick(result.data.data.plans,planFields),pick(old.plans,planFields),as.id+' active schedule plans preserved');
  if(as===admin)for(const key of ['students','teachers'])equal(result.data.data[key],old[key],key+' active names preserved');
 }
 const teacherPlans=await get(teacher,'teacher-plans');equal(pick(teacherPlans.data.data.plans,planFields),pick((await legacy(teacher)).plans,planFields),'Teacher plan projection retains only own active assignments');
 const oldAdmin=await legacy(admin);
 const beforeReadOnly=sqlite.prepare('SELECT total_changes() AS total').get().total;
 await get(admin,'course-options');
 check(sqlite.prepare('SELECT total_changes() AS total').get().total===beforeReadOnly,'Projection never synchronizes or writes business records');
 for(const [view,key] of [['students','allStudents'],['teachers','allTeachers']]) {
  reads.length=0;const result=await get(admin,view);check(result.status===200,view+' succeeds');equal(normal(result.data.data[key]),normal(oldAdmin[key]),view+' full profile parity');
  check(!reads.some(read=>/FROM lessons|FROM homework|FROM teaching_materials|FROM study_blocks/.test(read.sql)),view+' avoids unrelated records');
 }
 const opts=await get(admin,'course-options');equal(opts.data.data.students,oldAdmin.students,'Course active students preserved');equal(opts.data.data.teachers,oldAdmin.teachers,'Course active teachers preserved');equal(normal(opts.data.data.teacherOptions),normal(oldAdmin.teacherOptions),'Timetable retains inactive teacher selector');
 const subjects=await get(admin,'subjects');equal(pick(subjects.data.data.allPlans,['key','student','subject','subjectId','teacherName','duration','onlineLink','active','syllabusId','grade']),pick(oldAdmin.allPlans,['key','student','subject','subjectId','teacherName','duration','onlineLink','active','syllabusId','grade']),'Subject allocation plan parity');
 const accounts=await get(admin,'account-options');equal(normal(accounts.data.data.studentOptions),normal(oldAdmin.studentOptions),'Account student options parity');equal(normal(accounts.data.data.teacherOptions),normal(oldAdmin.teacherOptions),'Account teacher options parity');
 const rooms=await get(admin,'classroom-options');equal(pick(rooms.data.data.plans,planFields),pick(oldAdmin.plans,planFields),'Classroom active plans parity');
 equal((await get(admin,'terms')).data.data.terms,[{id:'local-term',name:'Local term',isCurrent:1}],'Term projection excludes other tenant');
 const learningBefore=(await legacy(student,'learning')).learning;
 const study=await get(student,'study');check(study.status===200,'Student study succeeds');
 equal(pick(study.data.data.studyBlocks,['id','title','subject','note','startsAt','endsAt','homeworkId']),pick(learningBefore.studyBlocks.filter(block=>Date.parse(block.startsAt)<Date.parse('2026-11-04T16:00:00Z')&&Date.parse(block.endsAt)>Date.parse('2026-11-03T16:00:00Z')),['id','title','subject','note','startsAt','endsAt','homeworkId']),'Study only overlaps selected Malaysia day');
 equal(study.data.data.homeworkSubjects,[...new Set(learningBefore.homework.map(row=>row.subject))].sort(),'Study subject selector includes legacy assigned homework without full contents');
 check(!JSON.stringify(study.data.data).includes('PRIVATE HOMEWORK'),'Study does not serialize homework description/submissions');
 // Former broad-read dependencies must not become profile permissions.
 profile(limited,['lessons.create']);const scheduleOnly=await get(limited,'schedule');check(scheduleOnly.status===200&&scheduleOnly.data.data.planOptions.length>0,'Lesson creator without plans.view retains options');
 check((await get(limited,'students')).status===403&&(await get(limited,'subjects')).status===403,'Selectors never grant full student or plan pages');
 check(!JSON.stringify(scheduleOnly.data.data).includes('age'),'Selector omits private full-profile age');
 profile(limited,['materials.view']);check((await get(limited,'materials')).status===200&&(await get(limited,'homework')).status===403,'Materials grant cannot read homework');
 profile(limited,['homework.view']);check((await get(limited,'homework')).status===200&&(await get(limited,'materials')).status===403,'Homework grant cannot read materials');
 profile(limited,['accounts.view']);check((await get(limited,'account-options')).status===200&&(await get(limited,'account-options')).data.data.students.length===0,'Account view alone does not invent assignment selector privilege');
 for(const as of [teacher,student])for(const view of ['students','teachers','subjects','account-options','terms'])check((await get(as,view)).status===403,as.id+' cannot open '+view);
 check((await get(teacher,'study')).status===403&&(await get(student,'schedule')).status===403,'Role-specific study/schedule boundaries');
 check((await get(null)).status===401&&(await get(parent)).status===403&&(await get(pending)).status===403,'Anonymous/parent/pending cannot use legacy projections');
 check((await get(student,'calendar','',other)).status===401,'Forged tenant header denied');
 const foreignView=await get(owner,'calendar','',other);check(foreignView.status===200&&foreignView.data.data.lessons.every(row=>row.id==='foreign-private'),'Owner inspection remains selected-tenant scoped');
 for(const table of ['plans','students','teachers']) {
  const selector=table==='plans'?"student='Alpha'":table==='students'?"name='Alpha'":"name='Teacher A'";
  sqlite.prepare('UPDATE '+table+' SET active=0 WHERE group_id=? AND '+selector).run(group);
  for(const view of ['materials','homework']) {
   const result=await get(student,view),old=(await legacy(student,'learning')).learning;
   equal(result.data.data[view],old[view],table+' withdrawal preserves old '+view+' authorization despite cross-tenant same names');
   check(!result.data.data[view].some(row=>String(row.id).startsWith('class-')),'Inactive '+table+' removes classroom content');
  }
  sqlite.prepare('UPDATE '+table+' SET active=1 WHERE group_id=? AND '+selector).run(group);
 }
 sqlite.prepare("DELETE FROM classroom_members WHERE id='home-membership'").run();check(!(await get(student,'homework')).data.data.homework.some(row=>row.id==='class-work'),'Membership withdrawal removes classroom homework');
 sqlite.prepare("INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES('home-membership',?,'allowed-home-class','Alpha',?)").run(group,now);
 for(const query of ['&unexpected=x','&view=materials','&from=2026-11-04','&to=2026-11-04'])check((await get(student,'calendar',query)).status===400,'Invalid/duplicate query cannot widen projection: '+query);
 for(const [from,to,status] of [['2026-11-01','2027-01-02',200],['2026-11-01','2027-01-03',400],['2026-02-29','2026-03-01',400],['2026-11-04','2026-11-04',400]]) {
  cookie=student.token;selectedGroup=group;const result=await route.GET(new Request('https://example.test/api/workspace-data?view=study&from='+from+'&to='+to));check(result.status===status,'Range exact validity '+from+' '+to);
 }
 check((await get(student)).data.data.lessons.some(row=>row.id==='midnight-start')&&!(await get(student)).data.data.lessons.some(row=>row.id==='midnight-end'),'Half-open Malaysia midnight course boundary');
 // Additive page proposals preserve student action state without the broad core request.
 const page=await courses.courseList(await actor(student),new URLSearchParams({view:'lessons',mode:'month',month:'2026-11'}));
 check(page.proposals.length>0&&page.proposals.every(row=>row.status==='pending'&&page.items.some(item=>item.id===row.lessonId)),'Student page proposals are pending and page-bound');
 check(!JSON.stringify(page.proposals).includes('requestedBy')&&!JSON.stringify(page.proposals).includes('respondedBy'),'Student proposals retain existing redaction');
 sqlite.prepare("INSERT INTO student_offboarding(group_id,student_name,status,revision,marked_by,marked_at,updated_by,updated_at,cleaned_at) VALUES(?,?,'cleaned',1,?,?,?,?,?)").run(group,'Inactive student',admin.id,now,admin.id,now,now);
 const cleanedStudents=await get(admin,'students'),cleanedSubjects=await get(admin,'subjects'),cleanedAccount=await get(admin,'account-options');
 check(!cleanedStudents.data.data.allStudents.some(row=>row.name==='Inactive student')&&!cleanedAccount.data.data.studentOptions.some(row=>row.name==='Inactive student')&&!cleanedSubjects.data.data.allPlans.some(row=>row.student==='Inactive student'),'Cleaned students and plans disappear from profiles and selectors');
 const cleanedOld=await legacy(admin);equal(normal(cleanedStudents.data.data.allStudents),normal(cleanedOld.allStudents),'Cleaned roster remains exactly equivalent to old operational view');
 // Before-data guard and after-read recheck must both reject stale authority.
 for(const stage of ['guard','data'])for(const mutation of ['permission','session','binding','group']) {
  const as=mutation==='permission'?limited:teacher;profile(limited,['materials.view']);
  beforeRead=sql=>{
   if(stage==='guard'?!sql.includes('workspace_actor_changed'):!sql.includes('FROM teaching_materials m'))return;
   beforeRead=null;
   if(mutation==='permission')profile(limited,[]);
   if(mutation==='session')sqlite.prepare('DELETE FROM sessions WHERE account_id=?').run(teacher.id);
   if(mutation==='binding')sqlite.prepare("UPDATE accounts SET teacher_name='Changed teacher' WHERE id=?").run(teacher.id);
   if(mutation==='group')sqlite.prepare('UPDATE tuition_groups SET active=0 WHERE id=?').run(group);
  };
  const result=await get(as,'materials');check(result.status===403,stage+' '+mutation+' race rejects entire projection');
  beforeRead=null;sqlite.prepare("UPDATE accounts SET teacher_name='Teacher A' WHERE id=?").run(teacher.id);sqlite.prepare('UPDATE tuition_groups SET active=1 WHERE id=?').run(group);
  sqlite.prepare('INSERT OR IGNORE INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run(await auth.hashToken(teacher.token),teacher.id,'2099-01-01T00:00:00.000Z');
 }
 check(sqlite.prepare('PRAGMA foreign_key_check').all().length===0,'Fixture FK integrity');
 console.log(`PASS workspace data: ${checks} assertions; real route/auth/SQLite, legacy result parity, range and revocation races; fictional in-memory DB only.`);
} finally {globalThis.Date=OriginalDate;globalThis.fetch=originalFetch;hooks.deregister();sqlite.close();delete globalThis.__homeSummaryFixture;}
