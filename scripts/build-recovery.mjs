import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const result = spawnSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.recovery.config.ts'], {
  cwd: root, stdio: 'inherit', env: { ...process.env,
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
    WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false' },
});
if (result.status !== 0) process.exit(result.status || 1);
// Vinext emits dist/server. Remove only known, generated development metadata.
for (const name of ['server/.dev.vars', '.openai']) {
  const target = resolve(dist, name);
  if (relative(dist, target).startsWith('..')) throw new Error('Invalid cleanup path');
  if (existsSync(target)) rmSync(target, { recursive: name === '.openai', force: true });
}
const source = JSON.parse(readFileSync(resolve(root, 'wrangler.recovery.json'), 'utf8'));
const built = JSON.parse(readFileSync(resolve(dist, 'server/wrangler.json'), 'utf8'));
for (const field of ['name', 'account_id']) if (built[field] !== source[field]) throw new Error('Recovery build target mismatch');
if (JSON.stringify(built.d1_databases) !== JSON.stringify(source.d1_databases) ||
    JSON.stringify(built.r2_buckets) !== JSON.stringify(source.r2_buckets)) throw new Error('Recovery storage mismatch');
if (JSON.stringify(Object.keys(built.vars).sort()) !== JSON.stringify(Object.keys(source.vars).sort())) throw new Error('Unexpected build variables');
function checkAssets(folder) {
  for (const item of readdirSync(folder, { withFileTypes: true })) {
    if (/^(?:\.env|\.dev\.vars|\.openai|\.git)|\.(?:dpapi|aes|sqlite|db|pdf)$/i.test(item.name)) throw new Error('Private file in deployment assets');
    if (item.isDirectory()) checkAssets(resolve(folder, item.name));
  }
}
checkAssets(resolve(dist, 'client'));
console.log('PASS recovery build: expected account, D1/R2 bindings, no local credentials or backup files in assets.');
