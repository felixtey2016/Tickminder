// Back up a bounded Sites D1 export without writing plaintext to disk.
// Windows DPAPI protects a random AES-256-GCM key for the current Windows user.
// Usage: stream a trusted in-memory export to `backup --out PATH` on stdin.
//        node scripts/secure-d1-backup.mjs verify --in C:\\...\\snapshot.json.dpapi
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {orderedSnapshotTables,historicalInsertTriggers,checkRestoredFolderStructure,snapshotVersion,expectedSnapshotTables,snapshotObjects,externalSnapshotSchema} from './backup-order.mjs';

const command = process.argv[2];
const option = process.argv[3];
const target = process.argv[4];
const baseTables = [
  'accounts', 'assignments', 'audit', 'lessons', 'local_credentials',
  'login_attempts', 'plans', 'reschedule_requests', 'sessions', 'students', 'teachers',
  'pdf_files', 'storage_quota', 'teaching_materials', 'material_recipients',
  'homework', 'homework_recipients', 'homework_submissions', 'study_blocks',
];
const classroomTables = ['classrooms', 'classroom_members', 'classroom_announcements'];
const baseMigrations = ['0000', '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009'];
const projectRoot = resolve(import.meta.dirname, '..').toLowerCase();

function targetPath(flag) {
  if (option !== flag || !target) throw new Error(`Expected ${flag} PATH`);
  const resolved = resolve(target);
  if (resolved.toLowerCase().startsWith(projectRoot + '\\')) {
    throw new Error('Database backups must remain outside the source repository');
  }
  return resolved;
}

function dpapi(mode, value) {
  const method = mode === 'protect' ? 'Protect' : 'Unprotect';
  const script = [
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.Security',
    '$inputText = [Console]::In.ReadToEnd().Trim()',
    '$bytes = [Convert]::FromBase64String($inputText)',
    `$result = [System.Security.Cryptography.ProtectedData]::${method}($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)`,
    '[Console]::Out.Write([Convert]::ToBase64String($result))',
  ].join('; ');
  return Buffer.from(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: value.toString('base64'), encoding: 'utf8', windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024,
  }).trim(), 'base64');
}

function validateExport(data) {
  const version=snapshotVersion(data);
  const expectedTables=expectedSnapshotTables(version,data?.tables);
  if (!data || !version || !data.tables ||
      Object.keys(data.tables).sort().join('|') !== expectedTables.slice().sort().join('|')) {
    throw new Error('Incomplete database export');
  }
  for (const name of expectedTables) {
    const table = data.tables[name];
    if (!Array.isArray(table.columns) || !Array.isArray(table.rows) || new Set(table.columns).size!==table.columns.length || table.columns.some(c=>typeof c!=='string'||!/^[a-z][a-z0-9_]*$/.test(c))) throw new Error(`Invalid ${name} table`);
    for (const row of table.rows) {
      if (!row || Object.keys(row).sort().join('|')!==table.columns.slice().sort().join('|')) throw new Error(`Incomplete ${name} row`);
    }
  }
  snapshotObjects(data);
  externalSnapshotSchema(data);
  return expectedTables;
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function restoreInMemory(data) {
  const expectedTables = validateExport(data);
  const version=Number(data.format.slice('timelyo-d1-v'.length));
  const external=externalSnapshotSchema(data);
  const db = new DatabaseSync(':memory:');
  try {
    for (const prefix of [...baseMigrations,...Array.from({length:Math.min(8,Math.max(0,version-1))},(_,index)=>String(10+index).padStart(4,'0')),...(version>=10?['0019']:[]),...(version>=11?['0020']:[]),...(version>=12?['0021']:[]),...(version>=13?['0022']:[]),...(version>=14?['0023']:[]),...(version>=15?['0024']:[]),...(version>=16?['0025','0026']:[]),...(version>=17?['0027','0028']:[]),...(version>=18?['0029']:[]),...(version>=19?['0030']:[]),...(version>=20?['0031']:[]),...(version>=21?['0032']:[]),...(version>=22?['0033','0034','0035']:[]),...(version>=23?['0036','0037']:[]),...(version>=24?['0039','0040','0041']:[]),...(version>=25?['0042','0043']:[]),...(version>=26?['0044','0045']:[]),...(version>=27?['0046']:[]),...(version>=28?['0047']:[]),...(version>=29?['0048']:[]),...(version>=30?['0049']:[]),...(version>=31?['0050']:[]),...(version>=32?['0051','0052','0053','0054']:[]),...(version>=33?['0055','0056','0057']:[]),...(version>=34?['0058']:[]),...(version>=35?['0059']:[]),...(version>=36?['0060']:[])]) {
      // Independent releases can share a numeric prefix (both 0036 migrations
      // are deployed). Replay every matching migration in filename order.
      const files = readdirSync(resolve(projectRoot, 'drizzle')).filter((name) => name.startsWith(prefix + '_') && name.endsWith('.sql')).sort();
      if (!files.length) throw new Error(`Missing migration ${prefix}`);
      for(const file of files)db.exec(readFileSync(resolve(projectRoot, 'drizzle', file), 'utf8'));
    }
    if(version>=9)db.exec('DELETE FROM tuition_groups');
    if(version>=18)db.exec('DELETE FROM academic_catalogues');
    for(const sql of external.tables)db.exec(sql);
    const triggers=historicalInsertTriggers.map(name=>db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name=?").get(name)).filter(Boolean);
    db.exec('BEGIN');
    try {
      for(const trigger of triggers)db.exec(`DROP TRIGGER "${trigger.name}"`);
      for (const [name,table] of orderedSnapshotTables(data.tables)) {
        const { columns, rows } = table;
        if(name==='classroom_content_state')db.exec('DELETE FROM classroom_content_state');
        if(name==='parent_notification_runtime')db.exec('DELETE FROM parent_notification_runtime');
        const dbColumns = db.prepare(`PRAGMA table_info("${name}")`).all().map((column) => column.name);
        if (columns.slice().sort().join('|') !== dbColumns.slice().sort().join('|')) {
          throw new Error(`Schema mismatch for ${name}`);
        }
        const names = columns.map((column) => `"${column}"`).join(', ');
        const placeholders = columns.map(() => '?').join(', ');
        const insert = db.prepare(`INSERT INTO "${name}" (${names}) VALUES (${placeholders})`);
        for (const row of rows) insert.run(...columns.map((column) => row[column]));
      }
      for(const trigger of triggers)db.exec(trigger.sql);
      // Replay external history without firing registration/revocation effects.
      for(const sql of external.triggers)db.exec(sql);
      checkRestoredFolderStructure(db);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    for (const name of expectedTables) {
      const count = db.prepare(`SELECT count(*) AS count FROM "${name}"`).get().count;
      if (count !== data.tables[name].rows.length) throw new Error(`Restore count mismatch for ${name}`);
      const { columns, rows } = data.tables[name];
      const encode = (row) => JSON.stringify(columns.map((column) => row[column]));
      const original = rows.map(encode).sort();
      const restored = db.prepare(`SELECT * FROM "${name}"`).all().map(encode).sort();
      if (JSON.stringify(original) !== JSON.stringify(restored)) throw new Error(`Restore content mismatch for ${name}`);
    }
    if (data.format === 'timelyo-d1-v1') {
      const releaseMigration = readdirSync(resolve(projectRoot, 'drizzle')).find((name) => name.startsWith('0010_') && name.endsWith('.sql'));
      if (releaseMigration) db.exec(readFileSync(resolve(projectRoot, 'drizzle', releaseMigration), 'utf8'));
    }
    for (const name of expectedTables) {
      const count = db.prepare(`SELECT count(*) AS count FROM "${name}"`).get().count;
      if (count !== data.tables[name].rows.length) throw new Error(`Migration changed ${name} rows`);
    }
    const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
    if (integrity !== 'ok') throw new Error('SQLite integrity check failed');
    const counts = Object.fromEntries(expectedTables.map((name) => [name, data.tables[name].rows.length]));
    return counts;
  } finally { db.close(); }
}

async function readPayloadLine() {
  // Unified terminal sessions keep stdin open. Raw mode prevents the terminal
  // from echoing the private database export into command output.
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const newline = bytes.indexOf(10);
    const carriageReturn = bytes.indexOf(13);
    const end = newline < 0 ? carriageReturn : carriageReturn < 0 ? newline : Math.min(newline, carriageReturn);
    chunks.push(end >= 0 ? bytes.subarray(0, end) : bytes);
    size += chunks.at(-1).length;
    if (size > 20 * 1024 * 1024) throw new Error('Export exceeds expected size');
    if (end >= 0) break;
  }
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  return Buffer.concat(chunks);
}

try {
  if (command === 'backup') {
    const output = targetPath('--out');
    const plain = await readPayloadLine();
    const parsed = JSON.parse(plain.toString('utf8'));
    validateExport(parsed);
    const key = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const document = {
      format: 'timelyo-d1-dpapi-v1',
      createdAt: new Date().toISOString(),
      algorithm: 'AES-256-GCM',
      keyScope: 'Windows CurrentUser DPAPI',
      wrappedKey: dpapi('protect', key).toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: encrypted.toString('base64'),
    };
    key.fill(0);
    writeFileSync(output, JSON.stringify(document), { flag: 'wx', mode: 0o600 });
    const counts = restoreInMemory(parsed);
    console.log(JSON.stringify({ output, encryptedSha256: sha256(readFileSync(output)), counts, restore: 'memory-ok' }));
    plain.fill(0);
  } else if (command === 'verify') {
    const input = targetPath('--in');
    const document = JSON.parse(readFileSync(input, 'utf8'));
    if (document.format !== 'timelyo-d1-dpapi-v1') throw new Error('Unrecognized backup format');
    const key = dpapi('unprotect', Buffer.from(document.wrappedKey, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(document.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(document.tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(document.ciphertext, 'base64')), decipher.final()]);
    key.fill(0);
    const counts = restoreInMemory(JSON.parse(plain.toString('utf8')));
    plain.fill(0);
    console.log(JSON.stringify({ input, encryptedSha256: sha256(readFileSync(input)), counts, restore: 'memory-ok' }));
  } else { throw new Error('Expected backup or verify command'); }
} catch (error) {
  console.error(`Backup operation failed: ${error.message}`);
  process.exitCode = 1;
}
