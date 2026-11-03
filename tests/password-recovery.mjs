import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { drizzle } from 'drizzle-orm/d1';
import ts from 'typescript';

// Exercise the real route, cryptography and SQL. The database is in memory and
// every fetch is intercepted: this test cannot email users or touch production.
const sqlite = new DatabaseSync(':memory:');
for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) {
  sqlite.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
}
sqlite.exec('PRAGMA foreign_keys = ON');
function statement(sql, values = []) {
  const execute = () => {
    const prepared = sqlite.prepare(sql);
    if (prepared.columns().length) {
      const results = prepared.all(...values);
      return { success: true, results, meta: { changes: sqlite.prepare('SELECT changes() AS n').get().n } };
    }
    return { success: true, results: [], meta: prepared.run(...values) };
  };
  return {
    sql,
    bind(...args) { return statement(sql, args); },
    async first(column) { const row = sqlite.prepare(sql).get(...values); return column ? row?.[column] ?? null : row ?? null; },
    async all() { return execute(); },
    async raw() { const prepared = sqlite.prepare(sql); prepared.setReturnArrays(true); return prepared.all(...values); },
    async run() { return execute(); },
    execute,
  };
}
let beforeBatch = null;
const d1 = {
  prepare: statement,
  async batch(items) {
    if (beforeBatch) { const callback = beforeBatch; beforeBatch = null; callback(items); }
    sqlite.exec('BEGIN');
    try { const results = items.map(item => item.execute()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
const env = {
  DB: d1,
  BREVO_API_KEY: 'isolated-mail-key-never-sent',
  BREVO_SENDER_EMAIL: 'noreply@example.test',
  BREVO_SENDER_NAME: 'Tickminder',
  PASSWORD_RECOVERY_SECRET: 'isolated-only-' + 'a67d2e91c5'.repeat(5),
};
const pendingDelivery = [];
const waitUntil = promise => { pendingDelivery.push(promise); };
async function flushDelivery() { while (pendingDelivery.length) await Promise.all(pendingDelivery.splice(0)); }
const next = {
  json(data, options) {
    const response = Response.json(data, options);
    response.cookies = {
      set(name, value, config = {}) {
        response.headers.append('set-cookie', `${name}=${value}; Path=/; HttpOnly; Secure${config.maxAge === 0 ? '; Max-Age=0' : ''}`);
      },
      delete(name) { response.headers.append('set-cookie', `${name}=; Path=/; Max-Age=0`); },
    };
    return response;
  },
};
globalThis.__recoveryTest = { env, waitUntil, NextResponse: next, cookies: async () => ({ get: () => undefined }), headers: async () => new Headers(), getDb: () => drizzle(d1) };
const stub = 'data:text/javascript;base64,' + Buffer.from('export const {env,waitUntil,NextResponse,cookies,headers,getDb}=globalThis.__recoveryTest;').toString('base64');
const applicationRoot = new URL('../', import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (['cloudflare:workers', 'next/server', 'next/headers', '@/db'].includes(specifier)) return { url: stub, shortCircuit: true };
    if (specifier.startsWith('@/')) return { url: new URL(specifier.slice(2) + '.ts', applicationRoot).href, shortCircuit: true };
    if (specifier.startsWith('.') && context.parentURL?.startsWith(applicationRoot) && context.parentURL.endsWith('.ts')) return { url: new URL(/\.[cm]?[jt]sx?$/.test(specifier) ? specifier : specifier + '.ts', context.parentURL).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(applicationRoot) && url.endsWith('.ts')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true };
    return nextLoad(url, context);
  },
});
const OriginalDate = Date;
let clock = OriginalDate.parse('2026-11-03T16:00:00.000Z');
globalThis.Date = class extends OriginalDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
};
sqlite.function('julianday', value => (value === 'now' ? clock : OriginalDate.parse(value)) / 86400000 + 2440587.5);
sqlite.function('strftime', (format, value) => {
  assert.equal(format, '%Y-%m-%dT%H:%M:%fZ');
  assert.equal(value, 'now');
  return new Date(clock).toISOString();
});
const originalFetch = globalThis.fetch;
const mails = [];
let providerStatus = 201;
let deliveryGate = null;
globalThis.fetch = async (input, options) => {
  assert.equal(String(input), 'https://api.brevo.com/v3/smtp/email', 'Only the intercepted Brevo endpoint is permitted');
  assert.equal(options.method, 'POST');
  const headers = new Headers(options.headers);
  assert.equal(headers.get('api-key'), env.BREVO_API_KEY);
  const body = JSON.parse(options.body);
  assert.equal(body.sender.email, env.BREVO_SENDER_EMAIL);
  mails.push(body);
  if (deliveryGate) await deliveryGate;
  return Response.json(providerStatus === 201 ? { messageId: 'isolated-message' } : { code: 'unauthorized', message: 'test failure' }, { status: providerStatus });
};
const route = await import(new URL('../app/api/password-recovery/route.ts', import.meta.url));
const authRoute = await import(new URL('../app/api/auth/route.ts', import.meta.url));
const { hashPassword, verifyPassword } = await import(new URL('../lib/password.ts', import.meta.url));
const initialPassword = 'OriginalPassword26!';
const initialHash = await hashPassword(initialPassword);
let sequence = 0;
let checks = 0;
function freshLimits() { sqlite.exec('DELETE FROM login_attempts'); mails.length = 0; providerStatus = 201; beforeBatch = null; clock += 3600_000; }
function seed(options = {}) {
  const n = ++sequence;
  const account = { id: `recovery-account-${n}`, username: `recovery.user.${n}`, email: `verified-${n}@gmail.com`, subject: `verified-google-${n}`, ...options };
  sqlite.prepare('INSERT INTO accounts(id,email,name,role,created_at,disabled_at,pending_expires_at,activated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(account.id, account.legacyEmail ?? `untrusted-${n}@example.test`, 'Recovery test', account.role || (account.expired ? 'pending' : 'student'), new Date().toISOString(), account.disabled ? new Date().toISOString() : null, account.pendingExpiresAt || (account.expired ? new Date(clock - 1000).toISOString() : null), null);
  if (!account.googleOnly) sqlite.prepare('INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES(?,?,?,1,?)').run(account.id, account.username, initialHash, new Date().toISOString());
  if (!account.unverified) sqlite.prepare('INSERT INTO google_identities(subject,account_id,email,linked_at) VALUES(?,?,?,?)').run(account.subject, account.id, account.email, new Date().toISOString());
  return account;
}
function request(body, extraHeaders = {}) {
  return new Request('https://test.invalid/api/password-recovery', { method: 'POST', headers: { origin: 'https://test.invalid', 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1', ...extraHeaders }, body: JSON.stringify(body) });
}
async function call(body, headers, flush = true) {
  const response = await route.POST(request(body, headers));
  const data = await response.json();
  if (flush) await flushDelivery();
  assert.match(response.headers.get('cache-control') || '', /no-store/i);
  assert.ok(!JSON.stringify(data).includes(env.BREVO_API_KEY));
  assert.ok(!JSON.stringify(data).includes(env.PASSWORD_RECOVERY_SECRET));
  return { status: response.status, data, headers: response.headers };
}
async function issue(identifier, headers, flush = true) { return call({ action: 'request', identifier, language: 'en' }, headers, flush); }
function lastCode() {
  const mail = mails.at(-1);
  const content = mail.textContent || mail.htmlContent;
  const match = content.match(/\b\d{6}\b/);
  assert.ok(match, 'The mail contains a six-digit verification code');
  return match[0];
}
async function issued(account) {
  const result = await issue(account.username);
  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.expiresIn, 600);
  assert.equal(result.data.retryAfter, 60);
  assert.equal(typeof result.data.challenge, 'string');
  return { challenge: result.data.challenge, code: lastCode() };
}
function resetBody(challenge, code, newPassword = 'NewRecoveryPassword26!') { return { action: 'reset', challenge, code, newPassword }; }
function sessions(account) {
  for (const suffix of ['browser', 'phone']) {
    const token = `${account.id}-${suffix}`;
    sqlite.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token, account.id, '2099-01-01T00:00:00.000Z');
    sqlite.prepare('INSERT INTO session_devices(id,token_hash,created_at,browser,os) VALUES(?,?,?,?,?)').run(token, token, new Date().toISOString(), suffix, 'test');
  }
}
function credential(account) { return sqlite.prepare('SELECT * FROM local_credentials WHERE account_id=?').get(account.id); }

try {
  const available = await route.GET();
  assert.equal((await available.json()).available, true);
  assert.match(available.headers.get('cache-control'), /no-store/i);
  const secret = env.BREVO_API_KEY;
  delete env.BREVO_API_KEY;
  assert.equal((await (await route.GET()).json()).available, false);
  assert.equal((await issue('anyone')).status, 503);
  assert.equal(mails.length, 0);
  env.BREVO_API_KEY = secret;
  checks += 4;

  freshLimits();
  const delayedAccount = seed();
  let releaseDelivery;
  deliveryGate = new Promise(resolve => { releaseDelivery = resolve; });
  const delayed = await issue(delayedAccount.username, undefined, false);
  assert.equal(delayed.status, 200, 'Request returns independently of provider latency');
  assert.ok(pendingDelivery.length > 0, 'Background delivery is retained by the Worker lifetime');
  releaseDelivery();
  await flushDelivery();
  deliveryGate = null;
  assert.equal(mails.length, 1);
  checks += 3;

  freshLimits();
  const account = seed();
  const valid = await issued(account);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to[0].email, account.email, 'Only verified Google email is used, never accounts.email');
  assert.ok(!valid.challenge.includes(account.id));
  assert.ok(!valid.challenge.includes(account.email));
  assert.ok(!valid.challenge.includes(initialHash));
  assert.ok(!valid.challenge.includes(valid.code));
  const other = seed();
  sessions(account); sessions(other);
  sqlite.prepare('INSERT INTO login_attempts VALUES(?,5,?,?)').run(account.username, new Date().toISOString(), new Date(clock + 900_000).toISOString());
  const success = await call(resetBody(valid.challenge, valid.code));
  assert.equal(success.status, 200);
  assert.equal(success.data.ok, true);
  assert.match(success.headers.get('set-cookie'), /tuition_session=;/);
  assert.equal(await verifyPassword('NewRecoveryPassword26!', credential(account).password_hash), true);
  assert.equal(await verifyPassword(initialPassword, credential(account).password_hash), false);
  assert.equal(credential(account).must_change_password, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE account_id=?').get(account.id).n, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM session_devices WHERE id LIKE ?').get(account.id + '-%').n, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE account_id=?').get(other.id).n, 2, 'Other accounts remain signed in');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE username=?').get(account.username).n, 0);
  assert.notEqual((await call(resetBody(valid.challenge, valid.code, 'ReplayPassword26!'))).status, 200);
  checks += 16;

  // Eligibility failures must look like a request for an eligible account, and
  // cannot be turned into recovery by typing an unverified/ambiguous email.
  for (const options of [{ unverified: true }, { disabled: true }, { expired: true }, { googleOnly: true }]) {
    freshLimits();
    const ineligible = seed(options);
    const result = await issue(ineligible.username);
    assert.equal(result.status, 200);
    assert.deepEqual(Object.keys(result.data).sort(), ['challenge', 'expiresIn', 'ok', 'retryAfter']);
    assert.equal(mails.length, 0);
    assert.notEqual((await call(resetBody(result.data.challenge, '000000'))).status, 200);
    checks += 4;
  }
  freshLimits();
  const unknown = await issue('no.such.account');
  assert.equal(unknown.status, 200);
  assert.equal(mails.length, 0);
  assert.equal(unknown.data.challenge.length, valid.challenge.length, 'Ciphertext length must not disclose whether a target exists');
  const shared = 'shared-parent@gmail.com';
  seed({ email: shared }); seed({ email: shared });
  const ambiguous = await issue(shared);
  assert.equal(ambiguous.status, 200);
  assert.equal(mails.length, 0, 'Duplicate verified email never guesses an account');
  checks += 5;

  freshLimits();
  const byEmail = seed();
  const emailResult = await issue('  ' + byEmail.email.toUpperCase() + '  ');
  assert.equal(emailResult.status, 200);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to[0].email, byEmail.email);
  checks += 3;

  freshLimits();
  const wrongAccount = seed(), wrongChallenge = await issued(wrongAccount);
  const incorrect = wrongChallenge.code === '000000' ? '000001' : '000000';
  for (let i = 0; i < 5; i++) assert.notEqual((await call(resetBody(wrongChallenge.challenge, incorrect))).status, 200);
  assert.notEqual((await call(resetBody(wrongChallenge.challenge, wrongChallenge.code))).status, 200, 'The sixth attempt cannot use even the correct code');
  assert.equal(credential(wrongAccount).password_hash, initialHash);
  checks += 7;

  freshLimits();
  const expiryAccount = seed(), expiryChallenge = await issued(expiryAccount);
  clock += 600_001;
  assert.notEqual((await call(resetBody(expiryChallenge.challenge, expiryChallenge.code))).status, 200);
  assert.equal(credential(expiryAccount).password_hash, initialHash);
  checks += 2;

  freshLimits();
  const tamperAccount = seed(), tamperChallenge = await issued(tamperAccount);
  const at = Math.floor(tamperChallenge.challenge.length / 2);
  const altered = tamperChallenge.challenge.slice(0, at) + (tamperChallenge.challenge[at] === 'A' ? 'B' : 'A') + tamperChallenge.challenge.slice(at + 1);
  assert.notEqual((await call(resetBody(altered, tamperChallenge.code))).status, 200);
  assert.equal(credential(tamperAccount).password_hash, initialHash);
  checks += 2;

  for (const change of ['password', 'unlink', 'email', 'disabled']) {
    freshLimits();
    const changed = seed(), challenge = await issued(changed);
    if (change === 'password') sqlite.prepare('UPDATE local_credentials SET password_hash=? WHERE account_id=?').run(await hashPassword('AdminResetPassword26!'), changed.id);
    if (change === 'unlink') sqlite.prepare('DELETE FROM google_identities WHERE account_id=?').run(changed.id);
    if (change === 'email') sqlite.prepare('UPDATE google_identities SET email=? WHERE account_id=?').run('new-address@gmail.com', changed.id);
    if (change === 'disabled') sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(new Date().toISOString(), changed.id);
    const before = credential(changed).password_hash;
    assert.notEqual((await call(resetBody(challenge.challenge, challenge.code))).status, 200, `${change} invalidates an outstanding challenge`);
    assert.equal(credential(changed).password_hash, before);
    checks += 2;
  }

  freshLimits();
  const concurrent = seed(), challenge = await issued(concurrent);
  sessions(concurrent);
  const results = await Promise.all([
    call(resetBody(challenge.challenge, challenge.code, 'ParallelPasswordOne26!')),
    call(resetBody(challenge.challenge, challenge.code, 'ParallelPasswordTwo26!')),
  ]);
  assert.equal(results.filter(result => result.status === 200).length, 1, 'An OTP can commit exactly one password reset under concurrency');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE account_id=?').get(concurrent.id).n, 0);
  checks += 2;

  freshLimits();
  const loginRace = seed();
  const updatedHash = await hashPassword('PasswordChangedDuringLogin26!');
  let loginRaced = false;
  const raceLogin = items => {
    if (!items.some(item => /INSERT\s+INTO\s+sessions/i.test(item.sql))) { beforeBatch = raceLogin; return; }
    loginRaced = true;
    sqlite.prepare('UPDATE local_credentials SET password_hash=? WHERE account_id=?').run(updatedHash, loginRace.id);
  };
  beforeBatch = raceLogin;
  const loginResponse = await authRoute.POST(new Request('https://test.invalid/api/auth', {
    method: 'POST', headers: { origin: 'https://test.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ username: loginRace.username, password: initialPassword }),
  }));
  assert.equal(loginRaced, true);
  assert.equal(loginResponse.status, 401, 'An old-password login in flight cannot mint a session after a reset');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE account_id=?').get(loginRace.id).n, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM session_devices d JOIN sessions s ON s.token_hash=d.token_hash WHERE s.account_id=?').get(loginRace.id).n, 0);
  checks += 4;

  // Mutating authority immediately before the transactional write tests the
  // final SQL guard, not merely the initial read before password hashing.
  for (const change of ['password', 'email', 'disabled']) {
    freshLimits();
    const raced = seed(), issuedChallenge = await issued(raced);
    sessions(raced);
    const adminHash = await hashPassword('ConcurrentAdminPassword26!');
    let mutated = false;
    const race = items => {
      if (!items.some(item => /UPDATE\s+local_credentials/i.test(item.sql))) { beforeBatch = race; return; }
      mutated = true;
      if (change === 'password') sqlite.prepare('UPDATE local_credentials SET password_hash=? WHERE account_id=?').run(adminHash, raced.id);
      if (change === 'email') sqlite.prepare('UPDATE google_identities SET email=? WHERE account_id=?').run('replacement@gmail.com', raced.id);
      if (change === 'disabled') sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(new Date().toISOString(), raced.id);
    };
    beforeBatch = race;
    const result = await call(resetBody(issuedChallenge.challenge, issuedChallenge.code));
    assert.equal(mutated, true, 'Final transactional credential update was exercised');
    assert.notEqual(result.status, 200, `${change} between read and write prevents the reset`);
    assert.equal(credential(raced).password_hash, change === 'password' ? adminHash : initialHash);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE account_id=?').get(raced.id).n, 2, 'A failed reset does not revoke unrelated current sessions');
    checks += 4;
  }

  for (const kind of ['challenge', 'pending-account']) {
    freshLimits();
    const options = kind === 'pending-account' ? { role: 'pending', pendingExpiresAt: new Date(clock + 10_000).toISOString() } : {};
    const expiresDuringWrite = seed(options), expiringChallenge = await issued(expiresDuringWrite);
    let advanced = false;
    const advanceClock = items => {
      if (!items.some(item => /UPDATE\s+local_credentials/i.test(item.sql))) { beforeBatch = advanceClock; return; }
      advanced = true;
      clock += kind === 'challenge' ? 600_001 : 10_001;
    };
    beforeBatch = advanceClock;
    assert.notEqual((await call(resetBody(expiringChallenge.challenge, expiringChallenge.code))).status, 200, `${kind} expiry is checked at the final database write`);
    assert.equal(advanced, true);
    assert.equal(credential(expiresDuringWrite).password_hash, initialHash);
    checks += 3;
  }

  freshLimits();
  const rollbackAccount = seed(), rollbackChallenge = await issued(rollbackAccount);
  sessions(rollbackAccount);
  sqlite.exec("CREATE TEMP TRIGGER fail_recovery_session_delete BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT,'isolated transaction failure'); END");
  try {
    assert.notEqual((await call(resetBody(rollbackChallenge.challenge, rollbackChallenge.code))).status, 200);
    assert.equal(credential(rollbackAccount).password_hash, initialHash, 'Session revocation failure rolls the password change back');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE account_id=?').get(rollbackAccount.id).n, 2);
  } finally { sqlite.exec('DROP TRIGGER fail_recovery_session_delete'); }
  checks += 3;

  freshLimits();
  const invalidPasswordAccount = seed(), invalidPasswordChallenge = await issued(invalidPasswordAccount);
  for (const password of ['short', 'x'.repeat(129), null]) {
    assert.equal((await call(resetBody(invalidPasswordChallenge.challenge, invalidPasswordChallenge.code, password))).status, 400);
  }
  assert.equal(credential(invalidPasswordAccount).password_hash, initialHash);
  checks += 4;

  freshLimits();
  const failedDelivery = seed();
  providerStatus = 401;
  const failedResponse = await issue(failedDelivery.username);
  assert.equal(failedResponse.status, 200, 'Provider errors never reveal whether the account exists');
  assert.notEqual((await call(resetBody(failedResponse.data.challenge, lastCode()))).status, 200, 'Failed delivery invalidates its challenge');
  assert.equal(credential(failedDelivery).password_hash, initialHash);
  checks += 3;

  // IP and identifier budgets count attempted sends, including unknown users,
  // and account budgets bind all aliases to the same real recipient.
  freshLimits();
  const aliasAccount = seed();
  await issued(aliasAccount);
  const alias = await issue(aliasAccount.email, { 'cf-connecting-ip': '192.0.2.2' });
  assert.equal(alias.status, 200);
  assert.equal(mails.length, 1, 'Email and username cannot bypass the recipient cooldown');
  checks += 2;

  freshLimits();
  for (let i = 0; i < 3; i++) {
    assert.equal((await issue('budget.unknown', { 'cf-connecting-ip': `192.0.2.${i + 1}` })).status, 200);
    clock += 61_000;
  }
  assert.equal((await issue('BUDGET.UNKNOWN', { 'cf-connecting-ip': '192.0.2.40' })).status, 429);
  assert.equal(mails.length, 0);
  checks += 5;

  freshLimits();
  const burst = seed();
  const burstResults = await Promise.all(Array.from({ length: 12 }, (_, i) => issue(burst.username, { 'cf-connecting-ip': `203.0.113.${i + 1}` })));
  assert.equal(burstResults.filter(result => result.status === 200).length, 1, 'Atomic cooldown permits exactly one simultaneous send for an identifier');
  assert.equal(mails.length, 1);
  checks += 2;

  freshLimits();
  for (let i = 0; i < 10; i++) assert.equal((await issue(`ip.target.${i}`)).status, 200);
  assert.equal((await issue('ip.target.eleventh')).status, 429);
  checks += 11;

  freshLimits();
  for (let i = 0; i < 250; i++) assert.equal((await issue(`daily.target.${i}`, { 'cf-connecting-ip': `198.18.0.${i + 1}` })).status, 200);
  assert.equal((await issue('daily.target.limit', { 'cf-connecting-ip': '198.18.1.1' })).status, 429);
  assert.equal(mails.length, 0);
  checks += 252;

  freshLimits();
  assert.equal((await call({ action: 'request', identifier: 'normal.user' }, { origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await call({ action: 'request', identifier: 'normal.user' }, { origin: '' })).status, 403);
  assert.ok((await call({ action: 'request', identifier: 'x'.repeat(20_000) })).status >= 400);
  assert.ok((await call({ action: 'unexpected' })).status >= 400);
  assert.equal(mails.length, 0);
  checks += 5;

  console.log(`PASS password recovery: ${checks} security assertions, real SQL/Web Crypto, isolated database and intercepted mail only.`);
} finally {
  globalThis.fetch = originalFetch;
  globalThis.Date = OriginalDate;
  hooks.deregister();
  sqlite.close();
  delete globalThis.__recoveryTest;
}
