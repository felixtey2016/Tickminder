import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

// Invoked by HOME_SUMMARY_D1_BENCHMARK=1 node tests/home-summary.mjs. Real
// migrated SQLite fixture -> real local workerd D1. No hosted API or data.
export async function benchmarkHomeSummary(fixture) {
  const { sqlite, reads, get, auth, group, now, admin, teacher, student, originalFetch } = fixture;
  const { courseLessonScope, courseOverlap } = await import('../lib/course-query.ts');
  const { guardedCoreReader } = await import('../lib/admin-core-permissions.ts');
  const output = path.resolve(process.env.HOME_SUMMARY_BENCHMARK_OUTPUT || '../evidence/home-summary-performance.json');
  const historyRows = Number(process.env.HOME_SUMMARY_HISTORY_ROWS || 6000);
  assert(Number.isInteger(historyRows) && historyRows >= 100 && historyRows <= 30000);
  const seed = sqlite.prepare("INSERT INTO lessons(id,group_id,student,subject,teacher_name,planned_start,planned_end,status,reviewed_at,chargeable,created_by,updated_at) VALUES(?,?,?,'Mathematics','Teacher A',?,?,'completed',?,1,?,?)");
  sqlite.exec('BEGIN');
  for (let i = 0; i < historyRows; i++) {
    const start = new Date(Date.parse('2000-01-01T00:00:00Z') + i * 3600000).toISOString();
    seed.run('perf-reviewed-' + i, group, i % 2 ? 'Alpha' : 'Beta', start, new Date(Date.parse(start) + 1800000).toISOString(), now, admin.id, now);
  }
  sqlite.exec('COMMIT');
  const scenarios = [];
  for (const as of [admin, teacher, student]) {
    reads.length = 0;
    const response = await get(as, group, '?scope=navigation');
    assert.equal(response.status, 200);
    const current = reads.filter(read => read.sql.includes('AS pending') && read.sql.includes('AS review')).map(read => ({ sql: read.sql, values: read.values }));
    assert.equal(current.length, 1, 'Capture the actual navigation aggregate');
    const actor = await auth.currentBusinessAccount(), scope = courseLessonScope(actor);
    const countKey = "CASE WHEN s.session_type='group' THEN s.id ELSE l.id END";
    // Exact pre-optimization aggregate from bcd9ea4, through today's unchanged
    // tenant, operational-visibility and live permission wrapper.
    const baselineQuery = `SELECT
      count(DISTINCT CASE WHEN l.status='scheduled' AND julianday(l.planned_end)<julianday(?) THEN ${countKey} END) AS pending,
      count(DISTINCT CASE WHEN l.status IN('completed','student_absent','teacher_absent') AND l.reviewed_at IS NULL THEN ${countKey} END) AS review,
      coalesce(sum(l.status IN('student_absent','teacher_absent') AND coalesce(l.chargeable,0)=0 AND NOT EXISTS(SELECT 1 FROM lessons replacement WHERE replacement.group_id=l.group_id AND replacement.replacement_for=l.id AND replacement.status<>'cancelled')),0) AS makeup,
      count(DISTINCT CASE WHEN l.status='scheduled' AND ${courseOverlap('l')} THEN ${countKey} END) AS today,
      count(DISTINCT CASE WHEN l.status<>'cancelled' AND ${courseOverlap('l')} THEN ${countKey} END) AS todayLessons
      FROM lessons l LEFT JOIN class_sessions s ON s.group_id=l.group_id AND s.id=l.session_id WHERE ${scope.sql}`;
    reads.length = 0;
    await guardedCoreReader(actor, ['lessons.view', ...actor.role !== 'student' ? ['attendance.view'] : []]).first(baselineQuery, now, '2026-11-04T16:00:00.000Z', '2026-11-03T16:00:00.000Z', '2026-11-04T16:00:00.000Z', '2026-11-03T16:00:00.000Z', ...scope.args);
    const previous = reads.filter(read => read.sql.includes('AS pending') && read.sql.includes('AS review')).map(read => ({ sql: read.sql, values: read.values }));
    assert.equal(previous.length, 1);
    scenarios.push({ role: actor.role, baseline: previous[0], optimized: current[0] });
  }
  const require = createRequire(import.meta.url), { Miniflare } = require('miniflare');
  const mf = new Miniflare({ name: 'fictional-home-summary-cost', host: '127.0.0.1', port: 0, modules: true,
    script: 'export default { async fetch(request,env) { try { const input=await request.json(); return Response.json(await env.DB.batch(input.map(s=>env.DB.prepare(s.sql).bind(...s.values)))); } catch(error) { return Response.json({error:String(error)},{status:500}); } } }',
    compatibilityDate: '2026-05-22', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'fictional-home-summary-cost' },
    outboundService: async () => new Response('External networking forbidden', { status: 403 }) });
  try {
    const origin = (await mf.ready).origin;
    const run = async statements => { const response = await originalFetch(origin, { method: 'POST', body: JSON.stringify(statements), headers: { 'content-type': 'application/json' } }); const value = await response.json(); assert(response.ok, value.error); return value; };
    const tables = sqlite.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
    const indexes = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all();
    // A single transaction defers the real schema foreign keys. Fixtures have
    // already executed actual migrations/triggers in SQLite; copy their result.
    const statements = [{ sql: 'PRAGMA defer_foreign_keys=ON', values: [] }, ...tables.map(t => ({ sql: t.sql, values: [] })), ...indexes.map(i => ({ sql: i.sql, values: [] }))];
    for (const table of tables) {
      const columns = sqlite.prepare('PRAGMA table_info("' + table.name + '")').all().map(c => c.name);
      const rows = sqlite.prepare('SELECT * FROM "' + table.name + '"'); rows.setReturnArrays(true);
      for (const values of rows.all()) statements.push({ sql: 'INSERT INTO "' + table.name + '"(' + columns.map(c => '"' + c + '"').join(',') + ') VALUES(' + columns.map(() => '?').join(',') + ')', values });
    }
    await run(statements);
    const measurements = [];
    for (const scenario of scenarios) {
      const [before, after] = await run([scenario.baseline, scenario.optimized]);
      for (const key of ['pending', 'review', 'makeup', 'today', 'todayLessons']) assert.equal(after.results[0][key], before.results[0][key], scenario.role + ' exact ' + key + ' parity');
      assert(Number.isFinite(before.meta.rows_read) && Number.isFinite(after.meta.rows_read) && before.meta.rows_read > 0, 'Real D1 reports row-read metadata');
      assert(after.meta.rows_read < before.meta.rows_read * 0.2, scenario.role + ' avoids the large-history amplification');
      const detail = query => ({ sha256: createHash('sha256').update(query.sql).digest('hex'), plan: sqlite.prepare('EXPLAIN QUERY PLAN ' + query.sql).all(...query.values).map(row => row.detail) });
      measurements.push({ role: scenario.role, baseline: { ...detail(scenario.baseline), rowsRead: before.meta.rows_read }, optimized: { ...detail(scenario.optimized), rowsRead: after.meta.rows_read }, counts: after.results[0], reductionPercent: +(100 * (1 - after.meta.rows_read / before.meta.rows_read)).toFixed(2) });
    }
    const sourceHashes = Object.fromEntries(['lib/home-summary-server.ts', 'lib/home-summary-types.ts', 'lib/course-query.ts', 'lib/group-data.ts', 'tests/home-summary.mjs', 'tests/home-summary-performance.mjs'].map(file => [file, createHash('sha256').update(fs.readFileSync(new URL('../' + file, import.meta.url))).digest('hex')]));
    const evidence = { suite: 'home-summary-real-d1-read-cost', status: 'PASS', fictional: true, productionRequests: 0, benchmarkChecks: 21, historyRows, sqliteVersion: sqlite.prepare('SELECT sqlite_version() AS v').get().v, sourceHashes, measurements };
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ performanceEvidence: output, historyRows, measurements: measurements.map(({ role, baseline, optimized, reductionPercent }) => ({ role, before: baseline.rowsRead, after: optimized.rowsRead, reductionPercent })) }));
  } finally { await mf.dispose(); }
  // Keep existing functional assertions independent of the large-history load.
  sqlite.prepare("DELETE FROM lessons WHERE id LIKE 'perf-reviewed-%'").run();
}
