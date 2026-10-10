// Restore a verified encrypted snapshot only into the empty recovery resources.
// Cloudflare credentials stay in Wrangler; PDF bodies use stdin/stdout in memory.
import { createDecipheriv, createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const input = args.indexOf('--in');
if (input < 0 || !args[input + 1]) throw new Error('Expected --in encrypted-snapshot-directory [--apply]');
const snapshot = resolve(args[input + 1]);
const withinSource = relative(root, snapshot);
if (!withinSource || (!withinSource.startsWith('..') && !/^[A-Za-z]:/.test(withinSource))) throw new Error('Snapshot must be outside source');
const target = JSON.parse(readFileSync(join(root, 'wrangler.recovery.json'), 'utf8'));
if (target.account_id !== '2199d150c756b2abfd96507da5ff1d8e' ||
    target.d1_databases[0].database_id !== '10893827-25a7-4a36-a823-ecb561b711b4' ||
    target.r2_buckets[0].bucket_name !== 'tickminder-recovery-files') throw new Error('Unexpected recovery target');
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
  if (database.format !== 'timelyo-d1-v7') throw new Error('Recovery branch supports stable v45/v7 data only');
  const tables = Object.entries(database.tables);
  const schema = readdirSync(join(root, 'drizzle')).filter(name => /^\d{4}_.*\.sql$/.test(name)).sort()
    .map(name => readFileSync(join(root, 'drizzle', name), 'utf8')).join('\n');
  const sqlParts = [schema];
  for (const [name, table] of tables) {
    sqlParts.push(`DELETE FROM ${identifier(name)};`);
    const columns = table.columns.map(identifier).join(',');
    for (const row of table.rows) {
      const statement = `INSERT INTO ${identifier(name)}(${columns}) VALUES(${table.columns.map(c => value(row[c])).join(',')});`;
      if (Buffer.byteLength(statement) > 90_000) throw new Error('Snapshot row exceeds safe D1 statement size');
      sqlParts.push(statement);
    }
  }
  const sql = sqlParts.join('\n');
  const local = new DatabaseSync(':memory:');
  try {
    local.exec(sql);
    if (local.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Restored SQLite integrity failure');
    for (const [name, table] of tables) if (rowHash(table, local.prepare(`SELECT * FROM ${identifier(name)}`).all()) !== rowHash(table, table.rows)) throw new Error('Local row checksum mismatch');
  } finally { local.close(); }
  const files = database.tables.pdf_files.rows;
  if (files.length !== manifest.files.length) throw new Error('PDF metadata mismatch');
  for (const file of files) {
    if (!/^[a-zA-Z0-9_-]+$/.test(file.id) || !/^pdf\/[a-zA-Z0-9_-]{1,128}$/.test(file.object_key)) throw new Error('Unexpected PDF key');
    const metadata = manifest.files.find(item => item.id === file.id);
    if (!metadata || metadata.bytes !== file.bytes) throw new Error('Missing PDF backup');
  }
  if (!args.includes('--apply')) {
    console.log(JSON.stringify({verified: true, tables: tables.length, pdfs: files.length, mode: 'local-dry-run', createdAt: manifest.createdAt}));
  } else {
    const existing = query("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name NOT GLOB 'd1_*'")[0];
    if (Number(existing?.count) !== 0) throw new Error('Recovery database must be empty; refusing overwrite');
    const info = wrangler(['r2', 'bucket', 'info', 'tickminder-recovery-files']).toString('utf8');
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
    for (const file of files) {
      const metadata = manifest.files.find(item => item.id === file.id);
      const bytes = decrypt(readFileSync(join(snapshot, `${file.id}.pdf.dpapi`)), metadata);
      try {
        if (bytes.length !== file.bytes || hash(bytes) !== metadata.sha256) throw new Error('PDF checksum mismatch');
        const path = `tickminder-recovery-files/${file.object_key}`;
        wrangler(['r2', 'object', 'put', path, '--remote', '--pipe', '--content-type', 'application/pdf'], bytes);
        const downloaded = wrangler(['r2', 'object', 'get', path, '--remote', '--pipe']);
        try { if (hash(downloaded) !== metadata.sha256) throw new Error('Restored PDF checksum mismatch'); }
        finally { downloaded.fill(0); }
      } finally { bytes.fill(0); }
    }
    console.log(JSON.stringify({restored: true, database: target.d1_databases[0].database_name,
      tables: tables.length, pdfs: files.length, verification: 'all-table-row-hashes-and-PDF-SHA256', createdAt: manifest.createdAt}));
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
