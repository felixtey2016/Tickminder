
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const accountId = '6a436390d3f306fc5c163952bba080ff';
const databaseId = '3e49d57b-7f11-4eae-84aa-69d47fef258f';
const applicationWorkers = [
  'tickminder-staging', 'ticklearn-staging', 'tickplay-staging',
  'tickgame-staging', 'tickgame-player-staging', 'tickminder-staging-alt',
];
const [option, ...extra] = process.argv.slice(2);
if (extra.length || (option && option !== '--check')) throw new Error('Use deploy-staging.mjs [--check]');
const checkOnly = option === '--check';

function config(file) {
  return JSON.parse(readFileSync(resolve(root, file), 'utf8'));
}
function assertApplicationConfig(value) {
  const expectedBuckets = {
    BUCKET: 'tickminder-qa-files',
    TICKGAME_ASSETS: 'tickminder-qa-game-assets',
    DIAGNOSTICS: 'tickminder-qa-diagnostics',
  };
  const [database] = value.d1_databases || [];
  if (value.account_id !== accountId || value.name !== 'tickminder-staging' ||
      value.route || value.routes?.length || value.triggers?.crons?.length ||
      value.d1_databases?.length !== 1 || database.binding !== 'DB' ||
      database.database_id !== databaseId || database.database_name !== 'tickminder-staging-db' ||
      value.r2_buckets?.length !== Object.keys(expectedBuckets).length ||
      value.r2_buckets.some(bucket => expectedBuckets[bucket.binding] !== bucket.bucket_name)) {
    throw new Error('The Workers configuration does not match the isolated staging account.');
  }
}
function run(file, args = []) {
  const result = spawnSync(process.execPath, [resolve(root, file), ...args], {
    cwd: root, stdio: 'inherit', env: {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
      CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Command failed: '+file+' '+args.join(' '));
}

if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_ACCOUNT_ID !== accountId) {
  throw new Error('Select the second Cloudflare account before deploying.');
}
assertApplicationConfig(config('wrangler.recovery.json'));
const marketingConfig = config('wrangler.staging-marketing.json');
if (marketingConfig.account_id !== accountId || marketingConfig.name !== 'ticklearn-marketing-staging' ||
    marketingConfig.main || marketingConfig.route || marketingConfig.routes?.length ||
    marketingConfig.triggers?.crons?.length || marketingConfig.assets?.directory !== './sites/ticklearn-marketing') {
  throw new Error('Invalid staging marketing configuration.');
}

const owner = process.env.TICKMINDER_STAGING_OWNER_EMAIL?.trim().toLowerCase();
if ((!checkOnly || owner) && (!owner || !/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]+$/.test(owner) ||
    owner === 'felixtey2016@gmail.com')) {
  throw new Error('Set TICKMINDER_STAGING_OWNER_EMAIL to the staging Google owner email.');
}
const ownerFile = resolve(root, 'lib/owner.ts');
const originalOwner = readFileSync(ownerFile, 'utf8');
const placeholder = '"staging-owner@example.invalid"';
if (!originalOwner.includes(placeholder)) throw new Error('The staging owner placeholder is missing.');
try {
  if (owner) writeFileSync(ownerFile, originalOwner.replace(placeholder, JSON.stringify(owner)));
  run('scripts/build-recovery.mjs');
} finally {
  if (owner) writeFileSync(ownerFile, originalOwner);
}
assertApplicationConfig(config('dist/server/wrangler.json'));
if (checkOnly) {
  console.log('Staging build and binding checks passed. No Workers were deployed.');
} else {
  const wrangler = 'node_modules/wrangler/bin/wrangler.js';
  for (const name of applicationWorkers) {
    run(wrangler, ['deploy', '--config', 'dist/server/wrangler.json', '--name', name, '--no-experimental-autoconfig']);
  }
  run(wrangler, ['deploy', '--config', 'wrangler.staging-marketing.json', '--no-experimental-autoconfig']);
}
