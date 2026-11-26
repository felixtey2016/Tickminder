// Run from a checkout with the staging base in its Git history:
//   node tests/schedule-query-indexes.mjs
// Node runs the real readers against native SQLite; Python's stdlib SQLite
// progress callback separately counts VM instructions for the captured SQL.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {backup, DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {createFixtureLoader} from './fixture-loader.mjs';

const base = '6fe5a95224ae86d9af01795fff3ce3ad792c69ea';
const root = new URL('../', import.meta.url);
const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'});
const migration = '0074_schedule_query_indexes.sql';
const indexes = {
  lessons_group_session_student_idx: ['group_id','session_id','student'],
  class_session_participants_group_session_student_idx: ['group_id','session_id','student_name'],
};
const group = 'schedule-fixture', foreign = 'schedule-other';
const stamp = '2035-01-01T00:00:00.000Z';
globalThis.fetch = async () => { throw new Error('Hosted requests are forbidden'); };

function seed(db) {
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  db.exec('BEGIN');
  for (const gid of [group, foreign]) {
    run('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)', gid,gid,gid,stamp,stamp);
    for (const name of ['Teacher A','Teacher B']) run('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)', gid,name,stamp);
    for (const name of ['Keep','Peer','Gone','Marked','Cancelled', ...Array.from({length: 32}, (_,i) => `Learner ${i}`)]) {
      run('INSERT INTO students(group_id,name,name_key,created_at) VALUES(?,?,?,?)', gid,name,name.toLowerCase(),stamp);
    }
  }
  for (const [id,role,teacher,student] of [['admin','admin',null,null],['masked','admin',null,null],['teacher','teacher','Teacher A',null],['student','student',null,'Keep'],['cleaned','student',null,'Gone']]) {
    run('INSERT INTO accounts(id,group_id,name,email,role,teacher_name,student_name,created_at) VALUES(?,?,?,?,?,?,?,?)', id,group,id,id+'@example.test',role,teacher,student,stamp);
    if (role === 'admin') run("INSERT INTO admin_permission_profiles(group_id,account_id,revision,grants_json,origin,updated_at) VALUES(?,?,1,?,'new',?)", group,id,JSON.stringify(id==='admin'?['lessons.view','attendance.view']:['lessons.view']),stamp);
  }
  for (const [room,gid,teacher,archived] of [['room-a',group,'Teacher A',0],['room-b',group,'Teacher B',0],['archived',group,'Teacher A',1],['retired-ordinary',group,'Teacher A',0],['retired-offboard',group,'Teacher A',0],['foreign-room',foreign,'Teacher A',0]]) {
    run("INSERT INTO classrooms(id,group_id,title,subject,teacher_name,archived,created_by,created_at,updated_at,subject_id,syllabus_id) VALUES(?,?,?,'Science',?,?,'admin',?,?,'science','spm')", room,gid,room,teacher,archived,stamp,stamp);
  }
  const insertSession = db.prepare("INSERT INTO class_sessions(id,group_id,session_type,classroom_id,teacher_name,subject,planned_start,planned_end,created_by,created_at,updated_at,teaching_status,attendance_note) VALUES(?,?,?,?,?,'Science',?,?,'admin',?,?,'taught','fixture session note')");
  const insertLesson = db.prepare("INSERT INTO lessons(id,group_id,session_id,student,teacher_name,subject,planned_start,planned_end,status,chargeable,created_by,updated_at,replacement_for) VALUES(?,?,?,?,?,'Science',?,?,?,?,'admin',?,?)");
  const date = hours => new Date(Date.parse(stamp)+hours*3600000).toISOString();
  function add(id, hour, names, {gid=group, room='room-a', teacher='Teacher A', type='group', offset=false, length=1}={}) {
    const start = offset ? date(hour+8).replace('Z','+08:00') : date(hour);
    const end = offset ? date(hour+8+length).replace('Z','+08:00') : date(hour+length);
    insertSession.run(id,gid,type,room,teacher,start,end,stamp,stamp);
    for (const [i,entry] of names.entries()) {
      const [name,status='completed',chargeable=1,replaced=null] = Array.isArray(entry)?entry:[entry];
      insertLesson.run(`${id}-${i}`,gid,id,name,teacher,start,end,status,chargeable,stamp,replaced);
    }
  }
  for (let i=0;i<1800;i++) {
    const t=i%2===0, roster=[`Learner ${i%32}`,`Learner ${(i+1)%32}`];
    if (i%11===0) roster.push('Keep');
    if (i%23===0) roster.push('Gone');
    add(`session-${i}`,i*4,roster,{teacher:t?'Teacher A':'Teacher B',room:t?'room-a':'room-b'});
  }
  const edge = 3600;
  add('mixed',edge+1,[['Keep','student_absent',0],'Gone','Marked','Cancelled']);
  add('only-cleaned',edge+2,['Gone']);
  add('retired-empty-marker',edge+3,['Keep'],{room:'retired-ordinary'});
  add('retired-student-marker',edge+5,['Keep'],{room:'retired-offboard'});
  add('empty-session',edge+6,[]);
  add('archived-class',edge+7,['Keep'],{room:'archived',type:'one_to_one'});
  add('standalone',edge+9,['Keep'],{room:null,type:'one_to_one'});
  add('offset-class',edge+11,['Keep'],{offset:true});
  add('boundary-ends',edge+13,['Keep']);
  add('boundary-overlaps',edge+16,['Keep'],{length:2});
  add('boundary-starts',edge+19,['Keep']);
  add('foreign-session',edge+21,['Keep'],{room:'foreign-room',gid:foreign});
  add('already-replaced',edge+22,[['Keep','teacher_absent',0]]);
  add('replacement',edge+23,[['Keep','completed',1,'already-replaced-0']]);
  add('cancelled-original',edge+25,[['Keep','teacher_absent',0]]);
  add('cancelled-replacement',edge+26,[['Keep','cancelled',null,'cancelled-original-0']]);
  add('paid-absence',edge+27,[['Keep','student_absent',1]]);
  // Legal same-start sessions: preserve the public planned_start ordering.
  add('same-start',edge+27,['Peer']);
  for (const [student,status] of [['Gone','cleaned'],['Marked','marked'],['Cancelled','cancelled']]) {
    run('INSERT INTO student_offboarding(group_id,student_name,status,last_lesson_date,revision,marked_by,marked_at,updated_by,updated_at,cleaned_at) VALUES(?,?,?,?,1,?,?,?,?,?)', group,student,status,'2035-01-01','admin',stamp,'admin',stamp,status==='cleaned'?stamp:null);
  }
  for (const [room,student] of [['retired-ordinary',''],['retired-offboard','Gone']]) run("INSERT INTO classroom_retirements(group_id,classroom_id,student_name,retired_at,retired_by) VALUES(?,?,?,?,'admin')", group,room,student,stamp);
  run("UPDATE class_session_participants SET attendance_status='absent',attendance_note='fixture participant note' WHERE session_id='mixed' AND student_name='Keep'");
  db.exec('COMMIT');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  return {date, edge};
}

const before = new DatabaseSync(':memory:');
const baseMigrations = git('ls-tree','--name-only',`${base}:drizzle`).trim().split('\n').filter(name => /^\d+.*\.sql$/.test(name)).sort();
assert.equal(baseMigrations.at(-1), '0073_d1_hot_query_indexes.sql');
for (const file of baseMigrations) before.exec(git('show',`${base}:drizzle/${file}`));
const {date, edge} = seed(before);
const counts = Object.fromEntries(['class_sessions','lessons','class_session_participants'].map(table => [table,before.prepare(`SELECT count(*) AS n FROM ${table}`).get().n]));
assert(counts.class_sessions >= 1500 && counts.lessons >= 2000 && counts.class_session_participants >= 2500);
const temp = mkdtempSync(join(tmpdir(),'schedule-query-indexes-'));
try {
  const paths = {before:join(temp,'before.sqlite'), after:join(temp,'after.sqlite')};
  await backup(before,paths.before);
  await backup(before,paths.after);
  const after = new DatabaseSync(paths.after);
  const sql = readFileSync(new URL(`drizzle/${migration}`,root),'utf8');
  const indexColumns = (db,name) => db.prepare('SELECT name FROM pragma_index_info(?) ORDER BY seqno').all(name).map(row=>row.name);
  const rollback = Object.keys(indexes).map(name=>`DROP INDEX IF EXISTS ${name};`).join('\n');
  after.exec(sql);
  after.exec(sql); // Idempotent create.
  for (const [name,columns] of Object.entries(indexes)) assert.deepEqual(indexColumns(after,name),columns);
  after.exec(rollback);
  after.exec(rollback); // Idempotent rollback.
  for (const name of Object.keys(indexes)) {
    assert.deepEqual(indexColumns(after,name),[]);
    assert.deepEqual(indexColumns(before,name),[]);
  }
  after.exec(sql);

  let activeDb, queries;
  function statement(sql, args=[]) {
    const execute = () => {
      const prepared = activeDb.prepare(sql);
      const result = prepared.columns().length ? {results:prepared.all(...args),meta:{changes:0}} : {results:[],meta:prepared.run(...args)};
      if (/^WITH "class_sessions"/.test(sql)) queries.push({name:sql.includes('AS participantCount')?'sessions':'participants',sql,args});
      return result;
    };
    return {execute,bind:(...values)=>statement(sql,values),all:async()=>execute(),first:async()=>execute().results[0]??null,run:async()=>execute()};
  }
  globalThis.__scheduleFixtureDb = {prepare:statement,batch:async statements=>statements.map(s=>s.execute())};
  const data = source => 'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
  const fixture = {
    runtimeUrl:data("export const isOwnerAccount=()=>false;export const OWNER_EMAIL='owner@example.test';"),
    environmentUrl:data("export const env={DB:globalThis.__scheduleFixtureDb,ADMIN_PERMISSIONS_MODE:'enforced'};"),
    runtimeFiles:['lib/owner.ts'],
  };
  const compileBase = file => ts.transpileModule(git('show',`${base}:${file}`),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const baselineModules = new Map(['lib/class-sessions.ts','lib/group-data.ts'].map(file=>[file,compileBase(file)]));
  const loadBefore = createFixtureLoader({...fixture,transform:(file,js)=>baselineModules.get(file)??js});
  const loadAfter = createFixtureLoader(fixture);
  const states = {before:(await loadBefore('lib/class-sessions.ts')).module.classSessionState,after:(await loadAfter('lib/class-sessions.ts')).module.classSessionState};
  const actors = Object.fromEntries([['admin','admin'],['masked','admin'],['teacher','teacher','Teacher A'],['student','student',null,'Keep'],['cleaned','student',null,'Gone']].map(([id,role,teacherName=null,studentName=null]) => [id,{id,role,teacherName,studentName,groupId:group,name:id,email:id+'@example.test'}]));
  const window = {from:date(edge-24),to:date(edge+32)};
  const scenarios = [
    ['admin window','admin',window], ['admin all history','admin',{}], ['teacher window','teacher',window],
    ['student window','student',window], ['student all history','student',{}], ['cleaned student','cleaned',window],
    ['admin without attendance','masked',{...window,sessionId:'mixed'}],
    ['admin makeup','admin',{...window,makeupOnly:true,permissionKey:'attendance.view'}],
    ['teacher makeup','teacher',{...window,makeupOnly:true}], ['student makeup','student',{...window,makeupOnly:true}],
    ['narrow offsets','admin',{from:date(edge+10),to:date(edge+12)}],
    ['strict boundary','admin',{from:date(edge+14),to:date(edge+19)}],
    ['empty window','admin',{from:date(-100),to:date(-99)}], ['empty id list','admin',{sessionIds:[]}],
    ['single session','student',{sessionId:'mixed'}],
    ['own classroom','teacher',{...window,classroomId:'room-a'}], ['other classroom','teacher',{...window,classroomId:'room-b'}],
    ['id list and window','admin',{...window,sessionIds:['mixed','mixed','standalone','empty-session','foreign-session','session-1','only-cleaned','retired-student-marker','archived-class']}],
  ];
  const evidence = [];
  const scanFailures = [];
  for (const [name,actor,selection] of scenarios) {
    const result = {}, plans = {};
    for (const phase of ['before','after']) {
      activeDb = phase==='before'?before:after;
      queries = [];
      result[phase] = await states[phase](actors[actor],selection);
      assert.deepEqual(queries.map(q=>q.name).sort(),['participants','sessions'],`${name}: captured both schedule reads`);
      plans[phase] = queries.map(item => {
        const plan = activeDb.prepare('EXPLAIN QUERY PLAN '+item.sql).all(...item.args);
        // CTE-expanded reads name the base table or one of these query aliases.
        const scan = /(?:^SCAN (?:main\.)?(?:cleanup_lesson|lessons|replacement|l|class_session_participants|p)\b|\bSEARCH (?:main\.)?(?:cleanup_lesson|lessons|replacement|l|class_session_participants|p)\b.* \(group_id=\?\)$)/;
        if (phase==='after') for (const row of plan) if (scan.test(row.detail)) scanFailures.push(`${name} ${item.name}: ${row.detail}`);
        const prepared = activeDb.prepare(item.sql);
        prepared.all(...item.args);
        const times = Array.from({length:5},()=>{
          const start = performance.now();
          prepared.all(...item.args);
          return performance.now()-start;
        }).sort((a,b)=>a-b);
        return {...item,plan,medianMs:times[2]};
      });
    }
    assert.deepEqual(result.after,result.before,name);
    const {allSessions,byId} = result.after;
    if (name==='admin window') {
      assert.equal(byId.get('mixed').participantCount,3);
      assert.deepEqual(byId.get('mixed').participants.map(p=>p.studentName),['Cancelled','Keep','Marked']);
      assert.equal(byId.get('mixed').subjectId,'science');
      assert.equal(byId.get('mixed').syllabusId,'spm');
      for (const id of ['retired-empty-marker','empty-session','archived-class','standalone','offset-class']) assert(byId.has(id),id);
      for (const id of ['retired-student-marker','only-cleaned','foreign-session']) assert(!byId.has(id),id);
      assert.equal(byId.get('retired-empty-marker').subjectId,null);
      assert.equal(byId.get('empty-session').participantCount,0);
    }
    if (name==='admin without attendance') {
      assert.equal(allSessions[0].attendanceNote,null);
      assert.equal(allSessions[0].teachingStatus,'pending');
      assert(allSessions[0].participants.every(p=>p.attendanceStatus==='pending'&&p.attendanceNote===null&&p.chargeable===null));
    }
    if (name==='teacher window') {
      assert(allSessions.every(s=>s.teacherName==='Teacher A'));
      assert.equal(byId.get('mixed').canManage,true);
      assert.equal(byId.get('archived-class').canManage,false);
    }
    if (name==='single session') {
      assert.equal(allSessions[0].participantCount,3);
      assert.deepEqual(allSessions[0].participants.map(p=>p.studentName),['Keep']);
      assert.equal(allSessions[0].participants[0].attendanceStatus,'absent');
    }
    if (name==='admin makeup') {
      assert.deepEqual(byId.get('mixed').participants.map(p=>p.studentName),['Keep']);
      assert.equal(byId.get('cancelled-original').participants.length,1);
      assert.equal(byId.get('already-replaced').participants.length,0);
      assert.equal(byId.get('paid-absence').participants.length,0);
    }
    if (name==='narrow offsets') assert(byId.has('offset-class'));
    if (name==='strict boundary') {
      assert(byId.has('boundary-overlaps'));
      assert(!byId.has('boundary-ends')&&!byId.has('boundary-starts'));
    }
    if (name==='own classroom') assert(byId.has('mixed')&&allSessions.every(s=>s.classroomId==='room-a'));
    if (['cleaned student','empty window','empty id list','other classroom'].includes(name)) assert.equal(allSessions.length,0);
    evidence.push({name,sessions:allSessions.length,plans});
  }
  for (const phase of ['before','after']) {
    activeDb = phase==='before'?before:after;
    await assert.rejects(states[phase](actors.masked,{permissionKey:'attendance.view'}), {status:403});
  }

  for (const [phase,db] of [['before',before],['after',after]]) {
    console.log(`${phase} Node SQLite ${db.prepare('SELECT sqlite_version() AS version').get().version}`);
    for (const {name,sessions,plans} of evidence) for (const q of plans[phase]) {
      console.log(`${name} (${sessions} sessions) ${q.name}: ${q.medianMs.toFixed(3)} ms median`);
      for (const row of q.plan) console.log(`  ${row.id} ${row.parent} ${row.notused} ${row.detail}`);
    }
  }
  assert.deepEqual(scanFailures,[], 'No full-table or group-only lesson/participant scans on the optimized lookup paths');
  // Reuse the exact captured statements and fixture snapshots, not hand-copied SQL.
  const vmSource = `
import json, sqlite3, sys
paths, evidence = json.load(sys.stdin)
print('Python SQLite', sqlite3.sqlite_version, 'VM instructions (including result iteration)')
for phase, path in paths.items():
    with sqlite3.connect(path) as db:
        for case in evidence:
            for query in case['plans'][phase]:
                steps = 0
                def progress():
                    global steps
                    steps += 1
                    return 0
                db.set_progress_handler(progress, 1)
                rows = db.execute(query['sql'], query['args']).fetchall()
                db.set_progress_handler(None, 0)
                print(phase, case['name'], query['name'], steps, 'VM steps;', len(rows), 'rows returned')
`;
  process.stdout.write(execFileSync('python3',['-c',vmSource],{input:JSON.stringify([paths,evidence]),encoding:'utf8'}));
  console.log(`PASS: ${evidence.length} deep-equal schedule states; fixture ${JSON.stringify(counts)}`);
  after.close();
} finally {
  before.close();
  rmSync(temp,{recursive:true,force:true});
}
