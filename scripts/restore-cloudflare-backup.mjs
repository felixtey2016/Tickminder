// Restore a verified encrypted snapshot only into the empty recovery resources.
// Cloudflare credentials stay in Wrangler; PDF bodies use stdin/stdout in memory.
import { createDecipheriv, createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import {orderedSnapshotTables,historicalInsertTriggers,checkRestoredFolderStructure,matchManifestObjects,backupObjectName,validObjectSignature} from './backup-order.mjs';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const input = args.indexOf('--in');
if (input < 0 || !args[input + 1]) throw new Error('Expected --in encrypted-snapshot-directory --expected-target private-target.json [--apply]');
const snapshot = resolve(args[input + 1]);
const withinSource = relative(root, snapshot);
if (!withinSource || (!isAbsolute(withinSource) && withinSource !== '..' && !withinSource.startsWith('..'+sep))) throw new Error('Snapshot must be outside source');
const target = JSON.parse(readFileSync(join(root, 'wrangler.recovery.json'), 'utf8'));
// Keep the independently approved target outside public source. A mismatch
// still stops before any cloud command; no target is inferred or accepted by default.
const expectedOption=args.indexOf('--expected-target');
if(expectedOption<0||!args[expectedOption+1])throw new Error('A private --expected-target file is required');
const expectedPath=resolve(args[expectedOption+1]),expectedWithinSource=relative(root,expectedPath);
if(!expectedWithinSource||(!isAbsolute(expectedWithinSource)&&expectedWithinSource!=='..'&&!expectedWithinSource.startsWith('..'+sep)))throw new Error('Expected target must be outside source');
const expected=JSON.parse(readFileSync(expectedPath,'utf8'));
if(!/^[a-f0-9]{32}$/i.test(expected.accountId||'')||!/^[a-f0-9-]{36}$/i.test(expected.databaseId||'')||!expected.bucketName||
 target.account_id!==expected.accountId||target.d1_databases?.[0]?.database_id!==expected.databaseId||target.r2_buckets?.[0]?.bucket_name!==expected.bucketName)throw new Error('Unexpected recovery target');
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false',
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' };
function command(script, params, inputBytes) {
  const result = spawnSync(process.execPath, [script, ...params], {
    cwd: root, env, input: inputBytes, windowsHide: true, maxBuffer: 40 * 1024 * 1024,
  });
  // CLI errors may include SQL or object IDs. Do not print captured data.
  if (result.status !== 0) throw new Error(`Recovery command failed (${params[0]}, exit ${result.status}); private output withheld`);
  return result.stdout;
}
function wrangler(params, inputBytes) {
  return command(join(root, 'node_modules/wrangler/bin/wrangler.js'), [...params, '--config', 'wrangler.recovery.json'], inputBytes);
}
function query(sql) {
  const result = JSON.parse(wrangler(['d1', 'execute', 'DB', '--remote', '--command', sql, '--json']).toString('utf8'));
  if (!Array.isArray(result) || result.some(part => !part.success)) throw new Error('Recovery database query failed');
  return result.flatMap(part => part.results);
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const identifier = value => {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error('Invalid snapshot identifier');
  return `"${value}"`;
};
const value = item => {
  if (item === null) return 'NULL';
  if (typeof item === 'number' && Number.isFinite(item)) return String(item);
  if (typeof item === 'string') return `CAST(X'${Buffer.from(item, 'utf8').toString('hex')}' AS TEXT)`;
  throw new Error('Invalid snapshot value');
};
const rowHash = (table, rows) => hash(Buffer.from(JSON.stringify(rows.map(row =>
  JSON.stringify(table.columns.map(column => row[column]))).sort())));
let key, plain, temp;
try {
  command(join(root, 'scripts/secure-full-backup.mjs'), ['verify', '--in', snapshot]);
  const manifest = JSON.parse(readFileSync(join(snapshot, 'manifest.json'), 'utf8'));
  if (manifest.format !== 'timelyo-full-backup-v2') throw new Error('Portable encrypted snapshot required');
  const decryptKey = [
    'Add-Type -AssemblyName System.Security',
    '$bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())',
    '$out = [Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)',
    '[Console]::Out.Write([Convert]::ToBase64String($out))',
  ].join('; ');
  key = Buffer.from(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', decryptKey], {
    input: manifest.wrappedKey, encoding: 'utf8', windowsHide: true,
  }).trim(), 'base64');
  function decrypt(bytes, metadata) {
    const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(metadata.iv, 'base64'));
    cipher.setAuthTag(Buffer.from(metadata.tag, 'base64'));
    return Buffer.concat([cipher.update(bytes), cipher.final()]);
  }
  plain = decrypt(readFileSync(join(snapshot, 'database.json.aes')), manifest.database);
  if (hash(plain) !== manifest.database.sha256) throw new Error('Database checksum mismatch');
  const database = JSON.parse(plain.toString('utf8'));
  const legacyOwnerEmail=String(expected.legacyOwnerEmail||'').trim().toLowerCase();
  if(database.tables?.accounts&&!database.tables.accounts.columns.includes('group_id')&&!legacyOwnerEmail)throw new Error('Legacy restore requires legacyOwnerEmail in the private expected-target file');
  if (!['timelyo-d1-v7','timelyo-d1-v8','timelyo-d1-v9','timelyo-d1-v10','timelyo-d1-v11','timelyo-d1-v12','timelyo-d1-v13','timelyo-d1-v14','timelyo-d1-v15','timelyo-d1-v16','timelyo-d1-v17','timelyo-d1-v18','timelyo-d1-v19','timelyo-d1-v20','timelyo-d1-v21'].includes(database.format)) throw new Error('Recovery branch requires a v7–v21 database snapshot');
  const tables = orderedSnapshotTables(database.tables);
  const schema = readdirSync(join(root, 'drizzle')).filter(name => /^\d{4}_.*\.sql$/.test(name)).sort()
    .map(name => readFileSync(join(root, 'drizzle', name), 'utf8')).join('\n');
  const schemaCheck=new DatabaseSync(':memory:');let triggers;
  try {schemaCheck.exec(schema);triggers=historicalInsertTriggers.filter(name=>database.tables.billing_students||!name.startsWith('billing_')).map(name=>schemaCheck.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name=?").get(name)).filter(Boolean);}finally{schemaCheck.close();}
  // Large bilingual quiz JSON can exceed D1's per-statement SQL limit after
  // UTF-8 hex encoding. Assemble bounded chunks before inserting the final row.
  const chunkTable='_tickminder_restore_large_text';let textSequence=0;
  const sqlParts = [schema,'PRAGMA defer_foreign_keys=ON;',...triggers.map(t=>`DROP TRIGGER "${t.name}";`),`CREATE TABLE "${chunkTable}" (entry TEXT NOT NULL,part INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(entry,part));`];
  for (const [name, table] of tables) {
    sqlParts.push(`DELETE FROM ${identifier(name)};`);
    const columns = table.columns.map(identifier).join(',');
    for (const row of table.rows) {
      const legacyOwner=name==='accounts'&&!table.columns.includes('group_id')&&row.role==='admin'&&!row.id.startsWith('local:')&&row.email.trim().toLowerCase()===legacyOwnerEmail;
      let encoded=table.columns.map(c=>value(row[c]));
      const render=()=>`INSERT INTO ${identifier(name)}(${columns}${legacyOwner?',group_id':''}) VALUES(${encoded.join(',')}${legacyOwner?',NULL':''});`;
      if(Buffer.byteLength(render())>90_000)encoded=table.columns.map((c,index)=>{
        if(typeof row[c]!=='string'||Buffer.byteLength(row[c])<2048)return encoded[index];
        const entry=String(textSequence++),characters=Array.from(row[c]);
        for(let offset=0,part=0;offset<characters.length;offset+=6000,part++)sqlParts.push(`INSERT INTO "${chunkTable}"(entry,part,body) VALUES('${entry}',${part},${value(characters.slice(offset,offset+6000).join(''))});`);
        return `(SELECT group_concat(body,'') FROM (SELECT body FROM "${chunkTable}" WHERE entry='${entry}' ORDER BY part))`;
      });
      const statement=render();
      if (Buffer.byteLength(statement) > 90_000) throw new Error('Snapshot row exceeds safe D1 statement size after chunking');
      sqlParts.push(statement);
    }
  }
  if(Number(database.format.slice("timelyo-d1-v".length))<11) {
    const baseline=readFileSync(join(root,"drizzle/0020_learning_versions.sql"),"utf8");
    sqlParts.push(baseline.slice(baseline.indexOf("-- The baseline"),baseline.indexOf("CREATE TRIGGER material_initial_version")));
  }
  if(Number(database.format.slice('timelyo-d1-v'.length))<13){const migration=readFileSync(join(root,'drizzle/0022_class_sessions.sql'),'utf8');sqlParts.push(migration.slice(migration.indexOf('-- No legacy'),migration.indexOf('CREATE TRIGGER class_session_link_insert')));}
  if(Number(database.format.slice('timelyo-d1-v'.length))<14){const migration=readFileSync(join(root,'drizzle/0023_session_attendance.sql'),'utf8');sqlParts.push(migration.slice(migration.indexOf('-- Preserve legacy'),migration.indexOf('CREATE INDEX teaching_month')));}
  if(Number(database.format.slice('timelyo-d1-v'.length))<21){
    // Older snapshots predate permission profiles. Materialise the frozen
    // legacy baseline only after their administrator identities are replayed.
    const migration=readFileSync(join(root,'drizzle/0032_admin_permissions.sql'),'utf8');
    const seed=migration.match(/INSERT INTO admin_permission_profiles\b[\s\S]*?;/)?.[0];
    if(!seed)throw new Error('Permission migration lacks its legacy baseline');
    sqlParts.push(seed);
  }
  sqlParts.push(`DROP TABLE "${chunkTable}";`,...triggers.map(t=>t.sql+';'));
  const sql = sqlParts.join('\n');
  const local = new DatabaseSync(':memory:');
  try {
    local.exec(sql);
    checkRestoredFolderStructure(local);
    if (local.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Restored SQLite integrity failure');
    for (const [name, table] of tables) if (rowHash(table, local.prepare(`SELECT * FROM ${identifier(name)}`).all()) !== rowHash(table, table.rows)) throw new Error('Local row checksum mismatch');
  } finally { local.close(); }
  const files = matchManifestObjects(database,manifest.files);
  const pdfCount=files.filter(f=>f.row.kind==='pdf').length,imageCount=files.length-pdfCount;
  for (const {row:file} of files) {
    if (!/^[a-zA-Z0-9_-]+$/.test(file.id) || !(file.kind==='quiz-image'?/^quiz\/[a-zA-Z0-9_-]{1,128}$/:/^pdf\/[a-zA-Z0-9_-]{1,128}$/).test(file.object_key)) throw new Error('Unexpected backup object key');
  }
  if (!args.includes('--apply')) {
    console.log(JSON.stringify({verified: true, tables: tables.length, pdfs: pdfCount,quizImages:imageCount, mode: 'local-dry-run', createdAt: manifest.createdAt}));
  } else {
    const existing = query("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name NOT GLOB 'd1_*'")[0];
    if (Number(existing?.count) !== 0) throw new Error('Recovery database must be empty; refusing overwrite');
    const info = wrangler(['r2', 'bucket', 'info', expected.bucketName]).toString('utf8');
    if (!/object_count:\s+0\b/.test(info)) throw new Error('Recovery bucket must be empty; refusing overwrite');
    // D1's CLI imports SQL from a file. Restrict the temporary directory BEFORE
    // writing private SQL, capture CLI output, and always remove the directory.
    temp = mkdtempSync(join(tmpdir(), 'tickminder-cloudflare-restore-'));
    if (process.platform === 'win32') {
      const sid = execFileSync('powershell.exe', ['-NoProfile', '-Command', '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], {encoding: 'utf8', windowsHide: true}).trim();
      execFileSync('icacls.exe', [temp, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], {stdio: 'pipe', windowsHide: true});
    } else {
      const { chmodSync } = await import('node:fs'); chmodSync(temp, 0o700);
    }
    const sqlFile = join(temp, 'restore.sql');
    writeFileSync(sqlFile, sql, {mode: 0o600, flag: 'wx'});
    wrangler(['d1', 'execute', 'DB', '--remote', '--file', sqlFile, '--yes', '--json']);
    for (const [name, table] of tables) {
      const actual = query(`SELECT * FROM ${identifier(name)}`);
      if (rowHash(table, actual) !== rowHash(table, table.rows)) throw new Error('Remote database row checksum mismatch');
    }
    for (const {row:file,metadata} of files) {
      const bytes = decrypt(readFileSync(join(snapshot, backupObjectName(file))), metadata);
      try {
        if (bytes.length !== file.bytes || hash(bytes) !== metadata.sha256 || !validObjectSignature(bytes,file.mime)) throw new Error('Backup object checksum or signature mismatch');
        const path = `${expected.bucketName}/${file.object_key}`;
        wrangler(['r2', 'object', 'put', path, '--remote', '--pipe', '--content-type', file.mime], bytes);
        const downloaded = wrangler(['r2', 'object', 'get', path, '--remote', '--pipe']);
        try { if (hash(downloaded) !== metadata.sha256) throw new Error('Restored object checksum mismatch'); }
        finally { downloaded.fill(0); }
      } finally { bytes.fill(0); }
    }
    console.log(JSON.stringify({restored: true, database: target.d1_databases[0].database_name,
      tables: tables.length, pdfs: pdfCount,quizImages:imageCount, verification: 'all-table-row-hashes-and-object-SHA256', createdAt: manifest.createdAt}));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  key?.fill(0); plain?.fill(0);
  if (temp) {
    const rel = relative(resolve(tmpdir()), resolve(temp));
    if (!rel.startsWith('..') && !rel.includes('/') && !rel.includes('\\') && rel.startsWith('tickminder-cloudflare-restore-')) rmSync(temp, {recursive: true, force: true});
  }
}
