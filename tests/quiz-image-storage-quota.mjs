import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Miniflare } from 'miniflare';
import { quizImageStorageBytesSql } from '../lib/storage-quota.ts';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const migration = read('drizzle/0075_quiz_image_storage_usage.sql');
const imageSchema = read('drizzle/0024_quiz_drafts.sql')
  .match(/CREATE TABLE quiz_images \([\s\S]+?CREATE INDEX quiz_image_owner_idx[^;]+;/)[0];
const fixtureSchema = new DatabaseSync(':memory:');
fixtureSchema.exec(`
  CREATE TABLE tuition_groups (id TEXT PRIMARY KEY);
  CREATE TABLE accounts (id TEXT PRIMARY KEY);
  CREATE TABLE storage_quota (group_id TEXT NOT NULL, id INTEGER NOT NULL, used_bytes INTEGER NOT NULL,
    PRIMARY KEY (group_id, id));
  ${imageSchema}
`);
const schema = () => fixtureSchema.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid")
  .all().map(entry => entry.sql);
const baseSchema = schema();
fixtureSchema.exec(migration);
const addedSchema = schema().slice(baseSchema.length);
const backfill = migration.match(/INSERT INTO quiz_image_storage_usage \(group_id, used_bytes\)\s+SELECT[^;]+/)[0];
fixtureSchema.close();

const newQuizSql = read('app/api/quiz-images/route.ts').match(/db\.prepare\(`(INSERT INTO quiz_images[\s\S]+?)`\)/)[1]
  .replace('${quizImageStorageBytesSql}', quizImageStorageBytesSql).replace('${authority}', '?');
const oldQuizSql = newQuizSql.replace(quizImageStorageBytesSql,'(SELECT coalesce(sum(bytes),0) FROM quiz_images WHERE group_id=?)');
const pdfSql = read('app/api/files/route.ts').match(/db\.prepare\(`(UPDATE storage_quota[\s\S]+?)`\)/)[1]
  .replace('${quizImageStorageBytesSql}', quizImageStorageBytesSql).replace('${guard.sql}', '?');
const invoiceGuard = read('lib/invoice-settings.ts').match(/authorityGuard\(\{sql:`(EXISTS\([\s\S]+?)`,args:\[groupId,groupId,bytes\.length/)[1]
  .replace('${quizImageStorageBytesSql}', quizImageStorageBytesSql);
const seedRows = 1200;
const limit = 30000;
const createdAt = '2026-11-01T00:00:00Z';

const mf = new Miniflare({
  modules:true, script:'export default {fetch(){return new Response("Local fixture only")}}',
  compatibilityDate:'2026-05-22', d1Databases:{DB:'fictional-quiz-storage-quota'},
  outboundService:async()=>new Response('External networking disabled',{status:403}),
});
try {
  const db = await mf.getD1Database('DB');
  const statement = (sql, ...values) => db.prepare(sql).bind(...values);
  const execute = (sql, ...values) => statement(sql,...values).run();
  await db.batch(baseSchema.map(sql => statement(sql)));
  await execute("INSERT INTO tuition_groups VALUES ('a'),('b'),('restore')");
  await execute("INSERT INTO accounts VALUES ('owner')");
  await execute("INSERT INTO storage_quota VALUES ('a',1,100),('b',1,139),('restore',1,0)");
  await execute(`WITH RECURSIVE sequence(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM sequence WHERE n<?)
    INSERT INTO quiz_images
    SELECT 'legacy-'||n,'a','owner','legacy/'||n,'image.png','image/png',20,'legacy-'||n,
      CASE WHEN n%2=0 THEN 'ready' ELSE 'uploading' END,? FROM sequence`,seedRows,createdAt);
  const imageValues = (id, group, bytes, hash = id) => [
    id,group,'owner','quiz/'+id,'image.png','image/png',bytes,hash,createdAt,
  ];
  const reserve = (sql,id,group,bytes,cap=limit,allowed=1,hash=id) =>
    execute(sql,...imageValues(id,group,bytes,hash),group,group,bytes,cap,allowed);
  const baseline = await reserve(oldQuizSql,'same-request','a',10);
  assert.equal(baseline.meta.changes,1);
  await execute("DELETE FROM quiz_images WHERE id='same-request'");

  const [table,...triggers] = addedSchema;
  await db.batch([statement(table),statement(backfill),...triggers.map(sql=>statement(sql))]);
  const usage = group => statement('SELECT '+quizImageStorageBytesSql+' AS total',group).first('total');
  assert.equal(await usage('a'),seedRows*20,'migration includes ready and uploading images');
  assert.equal(await usage('b'),0,'a group with no images starts at zero');

  const improved = await reserve(newQuizSql,'same-request','a',10);
  assert(improved.meta.changes>0);
  assert(improved.meta.rows_read < baseline.meta.rows_read / 10,'reservation reads no longer scale with image history');
  await assert.rejects(reserve(newQuizSql,'duplicate','a',10,limit,1,'same-request'),/UNIQUE constraint/);
  await execute("UPDATE quiz_images SET status='ready' WHERE id='same-request'");
  assert.equal(await usage('a'),seedRows*20+10,'duplicates and completion do not charge again');
  assert.equal((await reserve(newQuizSql,'denied','a',10,limit,0)).meta.changes,0,'live authority still controls reservations');

  const [first,second,pdf] = await Promise.all([
    reserve(newQuizSql,'race-1','b',60,200),
    reserve(newQuizSql,'race-2','b',60,200),
    execute(pdfSql,60,'b',60,'b',200,1),
  ]);
  assert.equal([first,second,pdf].filter(result=>result.meta.changes>0).length,1,'only one concurrent image/PDF reservation fits');
  assert.equal(await statement('SELECT '+invoiceGuard+' AS allowed','b','b',2,200).first('allowed'),0,'Logo uses the shared allowance');
  await execute("DELETE FROM quiz_images WHERE id='same-request'");
  assert.equal(await usage('a'),seedRows*20,'deleting a reservation releases its charge');
  await execute("DELETE FROM quiz_images WHERE id='same-request'");
  assert.equal(await usage('a'),seedRows*20,'repeating deletion releases nothing');

  await execute('INSERT INTO quiz_images VALUES (?,?,?,?,?,?,?,?,\'ready\',?)',...imageValues('restored','restore',90));
  assert.equal(await usage('restore'),90,'restoring source image rows rebuilds the counter');
  await execute("UPDATE quiz_images SET bytes=100 WHERE id='restored'");
  assert.equal(await usage('restore'),100,'updating bytes reconciles the counter');
  assert.equal((await statement('PRAGMA foreign_key_check').all()).results.length,0);
  console.log(JSON.stringify({seedRows,oldRowsRead:baseline.meta.rows_read,newRowsRead:improved.meta.rows_read,
    oldRowsWritten:baseline.meta.rows_written,newRowsWritten:improved.meta.rows_written,
    checks:'backfill, group isolation, replay, release, authorization, concurrency, Logo, restore'}));
} finally {
  await mf.dispose();
}
