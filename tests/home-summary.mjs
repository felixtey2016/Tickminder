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
const route = await load('app/api/home-summary/route.ts'), auth = await load('lib/auth.ts'), grants = await load('lib/admin-permissions.ts');
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
const check = (condition, message) => { assert.ok(condition, message); checks++; };
async function get(as = admin, gid = as?.gid, query='') { cookie = as?.token; selectedGroup = gid; const response = await route.GET(new Request('https://example.test/api/home-summary'+query)); return { status: response.status, data: await response.json(), headers: response.headers }; }
async function expected(as) {
  cookie = as.token; selectedGroup = as.gid;
  const actor = await auth.currentBusinessAccount();
  const params = { view: 'lessons', mode: 'month', from: date, to: '2026-11-05' };
  const first = await courses.courseList(actor, new URLSearchParams(params));
  let items = first.items;
  for (let page = 2; page <= first.pages; page++) items = [...items, ...(await courses.courseList(actor, new URLSearchParams({ ...params, page: String(page) }))).items];
  return { actor, items: actor.role === 'student' ? items : display.uniqueSessionLessons(items), aggregates: await courses.courseAggregates(actor, '2026-11', []), learning: await learning.learningState(actor) };
}
try {
  for (const as of [admin, teacher, student, foreign]) {
    const before = await expected(as); reads.length = 0;
    const result = await get(as); check(result.status === 200, as.id + ' summary succeeds');
    check(result.data.today.total === before.items.length, as.id + ' exact full-day visible count');
    check(JSON.stringify(result.data.today.items.map(row => row.id)) === JSON.stringify(before.items.slice(0, 3).map(row => row.id)), as.id + ' first three logical lessons match old authorised course service');
    for (const row of result.data.today.items) {
      const previous = before.items.find(item => item.id === row.id);
      check(['student', 'subject', 'teacherName', 'plannedStart', 'plannedEnd', 'status', 'onlineLink', 'sessionType'].every(key => row[key] === previous[key]), as.id + ' preview fields and lesson link preserved');
    }
    if (as === admin) check(result.data.taskCounts.attention === before.aggregates.taskCounts.attention, 'Admin backlog includes old attendance/review/makeup, excludes existing replacements');
    if (as === teacher) check(result.data.taskCounts.todayPendingAttendance === before.aggregates.taskCounts.todayPendingAttendance, 'Teacher today attendance count preserved');
    check(JSON.stringify(result.data.navigationCounts)===JSON.stringify(before.aggregates.taskCounts), as.id+' navigation counts match old authorised aggregate service');
    if ([teacher, student].includes(as)) {
      check(result.data.learning.homeworkCount === before.learning.homework.length, as.id + ' homework count matches full learning state');
      if (as === student) {
        const submitted = new Set(before.learning.submissions.map(row => row.homeworkId));
        check(result.data.learning.pendingHomeworkCount === before.learning.homework.filter(row => !submitted.has(row.id)).length, 'Student pending includes future work and excludes submitted attempts exactly as before');
        check(result.data.learning.nextStudy.id === 'next-study', 'Next study excludes expired and other accounts');
      }
    }
    check(result.data.today.items.length <= 3 && reads.every(read => read.rows <= 3), 'No homepage query transfers an unbounded row list');
    check(!/PRIVATE|description|answers_json|allStudents|allTeachers|submissions|materials|recipients|chargeable|reviewedBy|teacherStudentPairs/.test(JSON.stringify(result.data)), 'Homepage response is a narrow allowlist');
    check(result.headers.get('cache-control') === 'private, no-store' && /x-tickminder-group/.test(result.headers.get('vary')), 'Identity-sensitive cache headers');
    reads.length=0;
    const navigation=await get(as,as.gid,'?scope=navigation');
    check(navigation.status===200&&JSON.stringify(navigation.data.navigationCounts)===JSON.stringify(before.aggregates.taskCounts),as.id+' navigation-only count parity');
    check(Object.keys(navigation.data).sort().join(',')==='accountId,groupId,navigationCounts'&&!reads.some(read=>/homework|study_blocks|count\(\*\) OVER/.test(read.sql)), 'Navigation scope never reads home courses, homework or study blocks');
  }
  const restricted = await get(limited); check(restricted.status === 200 && restricted.data.today.items.length === 3 && restricted.data.taskCounts.attention === 0, 'Course-only admin gets lessons without attendance count');
  const attendanceOnly = await get(attendance); check(attendanceOnly.status === 200 && attendanceOnly.data.today.items.length === 3 && attendanceOnly.data.taskCounts.attention > 0, 'Attendance profile preserves its required course-view dependency');
  reads.length=0;
  const none = await get(noGrants); check(none.status === 200 && none.data.today.total === 0 && none.data.taskCounts.attention === 0, 'No grant still permits empty home greeting');
  check(!reads.some(read=>/FROM lessons|FROM homework|FROM study_blocks/.test(read.sql)), 'Admin without course grants does not query course/homework/study data');
  check((await get(teacher)).data.navigationCounts.reschedule===1,'Teacher badge excludes own request, same-role requests, resolved/cancelled lessons and other groups');
  check((await get(student)).data.navigationCounts.reschedule===1,'Student badge includes teacher request only');
  check((await get(admin)).data.navigationCounts.reschedule===3,'Admin badge includes all three local pending requests');
  check((await get(limited)).data.navigationCounts.reschedule===0,'Course-view alone does not expose reschedule counts');
  const learningBefore=(await get(student)).data.learning;
  reads.length=0;await get(student);
  const homeworkSql=reads.find(read=>read.sql.includes('AS pending')&&read.sql.includes('FROM homework h')).sql;
  check(['homework','homework_recipients','homework_submissions','classroom_members','classrooms','plans','students','teachers'].every(table=>homeworkSql.includes('"'+table+'" AS (SELECT * FROM main."'+table+'" WHERE group_id = ?')), 'Every nested classroom/homework table uses the same group-scoped CTE');
  for(const table of ['plans','students','teachers']) {
    const selector=table==='plans'?"student='Alpha'":table==='students'?"name='Alpha'":"name='Teacher A'";
    sqlite.prepare('UPDATE '+table+' SET active=0 WHERE group_id=? AND '+selector).run(group);
    const actual=await get(student),old=await expected(student);
    check(actual.status===200&&actual.data.learning.homeworkCount===learningBefore.homeworkCount-1&&actual.data.learning.homeworkCount===old.learning.homework.length,table+' withdrawal cannot be bypassed by same-name active rows in another tenant');
    sqlite.prepare('UPDATE '+table+' SET active=1 WHERE group_id=? AND '+selector).run(group);
  }
  sqlite.prepare("DELETE FROM classroom_members WHERE id='home-membership'").run();
  check((await get(student)).data.learning.homeworkCount===learningBefore.homeworkCount-1,'Revoked classroom membership removes classroom homework from count');
  sqlite.prepare("INSERT INTO classroom_members(id,group_id,classroom_id,student_name,created_at) VALUES('home-membership',?,'allowed-home-class','Alpha',?)").run(group,now);
  sqlite.prepare("UPDATE class_sessions SET teaching_status='teacher_absent' WHERE id='home-big-class'").run();
  check((await get(teacher)).data.today.items.find(row=>row.sessionId==='home-big-class').status==='teacher_absent','Teacher sees recorded group teaching status');
  check((await get(student)).data.today.items.find(row=>row.sessionId==='home-big-class').status==='scheduled','Student still sees personal lesson status');
  sqlite.prepare("UPDATE class_sessions SET teaching_status='pending' WHERE id='home-big-class'").run();
  check((await get(admin,group,'?scope=invalid')).status===400&&(await get(admin,group,'?scope=home&scope=navigation')).status===400,'Unknown or duplicate scopes cannot silently widen response');
  check((await get(null)).status === 401, 'Anonymous denied'); check((await get(parent)).status === 403, 'Parent retains its own home API'); check((await get(pending)).status === 403, 'Pending role denied');
  check((await get(student, other)).status === 401, 'Forged group selection cannot read another tenant');
  const ownerForeign = await get(owner, other); check(ownerForeign.status === 200 && ownerForeign.data.today.items.every(row => row.id === 'foreign-private'), 'Owner may select a group but remains scoped to it');
  sqlite.prepare('UPDATE tuition_groups SET active=0 WHERE id=?').run(other);
  check((await get(owner,other)).status===200&&(await get(foreign)).status===401,'Existing owner-only inspection of inactive groups is preserved; ordinary members denied');
  sqlite.prepare('UPDATE tuition_groups SET active=1 WHERE id=?').run(other);
  sqlite.prepare('UPDATE local_credentials SET must_change_password=1 WHERE account_id=?').run(student.id); check((await get(student)).status === 401, 'Initial password requirement retained'); sqlite.prepare('UPDATE local_credentials SET must_change_password=0 WHERE account_id=?').run(student.id);
  sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(now, teacher.id); check((await get(teacher)).status === 401, 'Disabled account denied'); sqlite.prepare('UPDATE accounts SET disabled_at=NULL WHERE id=?').run(teacher.id);
  for (const mutation of ['permission', 'session', 'binding', 'group']) {
    const as = mutation === 'permission' ? limited : teacher;
    beforeRead = sql => { if (!sql.includes('count(*) OVER()')) return; beforeRead = null;
      if (mutation === 'permission') profile(limited, []);
      if (mutation === 'session') sqlite.prepare('DELETE FROM sessions WHERE account_id=?').run(teacher.id);
      if (mutation === 'binding') sqlite.prepare("UPDATE accounts SET teacher_name='Changed teacher' WHERE id=?").run(teacher.id);
      if (mutation === 'group') sqlite.prepare('UPDATE tuition_groups SET active=0 WHERE id=?').run(group);
    };
    check((await get(as)).status === 403, mutation + ' revoked during read rejects the whole response');
    profile(limited, ['lessons.view']); sqlite.prepare("UPDATE accounts SET teacher_name='Teacher A' WHERE id=?").run(teacher.id); sqlite.prepare('UPDATE tuition_groups SET active=1 WHERE id=?').run(group);
    sqlite.prepare('INSERT OR IGNORE INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').run(await auth.hashToken(teacher.token), teacher.id, '2099-01-01T00:00:00.000Z');
  }
  // With no lessons today the next visible course can be outside this month.
  sqlite.prepare("UPDATE lessons SET status='cancelled' WHERE group_id=? AND id<>'replacement'").run(group);
  const empty = await get(student); check(empty.status === 200 && empty.data.today.total === 0 && empty.data.nextLesson.id === 'replacement', 'No-today home returns the first future lesson without a month restriction');
  check(sqlite.prepare('PRAGMA foreign_key_check').all().length === 0, 'Fixture foreign keys preserved');
  console.log(`PASS home summary: ${checks} assertions; real auth/tenant SQL and old-service parity; fictional in-memory database only.`);
} finally { globalThis.Date = OriginalDate; globalThis.fetch = originalFetch; hooks.deregister(); sqlite.close(); delete globalThis.__homeSummaryFixture; }
