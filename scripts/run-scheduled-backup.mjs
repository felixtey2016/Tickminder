// Run after enabling the backup export secret. Never commit token or recovery files.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Expected ${name} VALUE`);
  return args[index + 1];
}
function outsideSource(path) {
  const absolute = resolve(path);
  if (absolute.toLowerCase().startsWith(root.toLowerCase() + '\\')) throw new Error('Backup destination must be outside source repository');
  return absolute;
}
function hash(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function run(...params) {
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'secure-full-backup.mjs'), ...params], {
    cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `Backup command failed with ${result.status}`);
  return JSON.parse(result.stdout.trim());
}
function main() {
  const local = outsideSource(option('--local-dir'));
  const offsite = outsideSource(option('--offsite-dir'));
  mkdirSync(local, { recursive: true });
  mkdirSync(offsite, { recursive: true });
  const name = `timelyo-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const localCopy = join(local, name);
  const remoteCopy = join(offsite, name);
  if (existsSync(localCopy) || existsSync(remoteCopy)) throw new Error('Backup name collision');
  try {
    const result = run('backup', '--url', option('--url'), '--token-file', outsideSource(option('--token-file')),
      '--recovery-file', outsideSource(option('--recovery-file')), '--out', localCopy);
    cpSync(localCopy, remoteCopy, { recursive: true, errorOnExist: true, force: false });
    const sourceFiles = readdirSync(localCopy).sort();
    const copiedFiles = readdirSync(remoteCopy).sort();
    if (JSON.stringify(sourceFiles) !== JSON.stringify(copiedFiles)) throw new Error('Offsite copy file list differs');
    for (const file of sourceFiles) {
      if (hash(join(localCopy, file)) !== hash(join(remoteCopy, file))) throw new Error(`Offsite copy hash differs: ${file}`);
    }
    const verified = run('verify', '--in', remoteCopy);
    if (verified.pdfCount !== result.pdfCount || verified.databaseTables !== result.databaseTables) throw new Error('Offsite restore differs from source');
    const status = { at: new Date().toISOString(), success: true, localCopy, offsiteCopy: remoteCopy,
      databaseTables: verified.databaseTables, pdfCount: verified.pdfCount, pdfBytes: verified.pdfBytes,
      cloudSync: 'not-verified' };
    writeFileSync(join(local, 'backup-status.json'), JSON.stringify(status, null, 2));
    console.log(JSON.stringify(status));
  } catch (error) {
    writeFileSync(join(local, 'backup-status.json'), JSON.stringify({ at: new Date().toISOString(), success: false, error: error.message }, null, 2));
    throw error;
  }
}
try { main(); } catch (error) { console.error(`Scheduled backup failed: ${error.message}`); process.exitCode = 1; }
