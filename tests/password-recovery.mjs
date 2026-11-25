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
    if (beforeBatch) { const callback = beforeBatch; beforeBatch = null; await callback(items); }
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
let currentCookie;
globalThis.__recoveryTest = { env, waitUntil, NextResponse: next, cookies: async () => ({ get: name => name === 'tuition_session' && currentCookie ? { value: currentCookie } : undefined }), headers: async () => new Headers(), getDb: () => drizzle(d1) };
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
const passwordRoute = await import(new URL('../app/api/password/route.ts', import.meta.url));
const setupRoute = await import(new URL('../app/api/account-setup/route.ts', import.meta.url));
const { hashToken } = await import(new URL('../lib/auth.ts', import.meta.url));
const { hashPassword, verifyPassword } = await import(new URL('../lib/password.ts', import.meta.url));
const initialPassword = 'OriginalPassword26!';
const initialHash = await hashPassword(initialPassword);
let sequence = 0;
let checks = 0;
function freshLimits() { sqlite.exec('DELETE FROM login_attempts'); mails.length = 0; providerStatus = 201; beforeBatch = null; currentCookie = undefined; clock += 3600_000; }
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
function verifyCode(challenge, code) { return call({ action: 'verify', challenge, code }); }
function grantReset(resetToken, newPassword = 'NewRecoveryPassword26!') { return call({ action: 'reset', resetToken, newPassword }); }
function sessions(account) {
  for (const suffix of ['browser', 'phone']) {
    const token = `${account.id}-${suffix}`;
    sqlite.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token, account.id, '2099-01-01T00:00:00.000Z');
    sqlite.prepare('INSERT INTO session_devices(id,token_hash,created_at,browser,os) VALUES(?,?,?,?,?)').run(token, token, new Date().toISOString(), suffix, 'test');
  }
}
function credential(account) { return sqlite.prepare('SELECT * FROM local_credentials WHERE account_id=?').get(account.id); }
async function signedIn(account) {
  currentCookie = 'fictional-password-change-' + account.id;
  const tokenHash = await hashToken(currentCookie);
  sqlite.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash, account.id, '2099-01-01T00:00:00.000Z');
  return tokenHash;
}
function changePassword(newPassword = 'ChangedInSettings26!') {
  return passwordRoute.POST(new Request('https://test.invalid/api/password', { method: 'POST', headers: { origin: 'https://test.invalid', 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: initialPassword, newPassword }) }));
}
function setupPassword(account) {
  return setupRoute.POST(new Request('https://test.invalid/api/account-setup', { method: 'POST', headers: { origin: 'https://test.invalid', 'content-type': 'application/json' }, body: JSON.stringify({ username: account.username, password: initialPassword }) }));
}

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

  // Initial credential setup also issues a session only while its newly saved
  // password remains current. A recovery in that gap must not reauthenticate it.
  freshLimits();
  const setupAccount = seed({ googleOnly: true });
  await signedIn(setupAccount);
  const setupSuccess = await setupPassword(setupAccount);
  assert.equal(setupSuccess.status, 200);
  assert.match(setupSuccess.headers.get('set-cookie'), /tuition_session=.+;/);
  assert.equal(await verifyPassword(initialPassword, credential(setupAccount).password_hash), true);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE account_id=?').get(setupAccount.id).n, 1);
  checks += 4;

  freshLimits();
  const setupRaceAccount = seed({ googleOnly: true });
  await signedIn(setupRaceAccount);
  const setupAccountBefore = sqlite.prepare('SELECT * FROM accounts WHERE id=?').get(setupRaceAccount.id);
  const setupGoogleBefore = sqlite.prepare('SELECT * FROM google_identities WHERE account_id=?').get(setupRaceAccount.id);
  const setupSessionRace = async items => {
    if (!items.some(item => /INSERT\s+INTO\s+sessions/i.test(item.sql))) { beforeBatch = setupSessionRace; return; }
    const challenge = await issued(setupRaceAccount);
    assert.equal((await call(resetBody(challenge.challenge, challenge.code, 'RecoveredDuringSetup26!'))).status, 200);
  };
  beforeBatch = setupSessionRace;
  const setupRaceResponse = await setupPassword(setupRaceAccount);
  assert.equal(setupRaceResponse.status, 409);
  assert.equal(setupRaceResponse.headers.get('set-cookie'), null, 'Stale setup cannot restore a session after recovery');
  assert.match((await setupRaceResponse.json()).error, /已改变.*重新登录/, 'Conflict explains the new account state, not a failed setup');
  assert.equal(await verifyPassword('RecoveredDuringSetup26!', credential(setupRaceAccount).password_hash), true);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE account_id=?').get(setupRaceAccount.id).n, 0);
  assert.deepEqual(sqlite.prepare('SELECT * FROM accounts WHERE id=?').get(setupRaceAccount.id), setupAccountBefore);
  assert.deepEqual(sqlite.prepare('SELECT * FROM google_identities WHERE account_id=?').get(setupRaceAccount.id), setupGoogleBefore);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM audit WHERE actor_id=? AND action='setupCredentials'").get(setupRaceAccount.id).n, 1, 'The already committed setup remains recorded');
  checks += 9;

  // Exercise the ordinary password endpoint too: it must not overwrite a
  // recovery that commits after the old password/session were read.
  freshLimits();
  const changeRace = seed(), changeRecovery = await issued(changeRace);
  await signedIn(changeRace);
  const changeBusinessBefore = JSON.stringify(sqlite.prepare('SELECT * FROM accounts WHERE id=?').get(changeRace.id));
  beforeBatch = async items => {
    assert(items.some(item => /UPDATE\s+local_credentials/i.test(item.sql)));
    assert.equal((await call(resetBody(changeRecovery.challenge, changeRecovery.code))).status, 200);
  };
  assert.equal((await changePassword()).status, 409, 'Old ordinary password request loses to recovery CAS');
  assert.equal(await verifyPassword('NewRecoveryPassword26!', credential(changeRace).password_hash), true);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE account_id=?').get(changeRace.id).n, 0);
  assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM accounts WHERE id=?').get(changeRace.id)), changeBusinessBefore, 'Recovery and losing password change preserve business identity');
  checks += 5;

  freshLimits();
  const issueRace = seed();
  await signedIn(issueRace);
  let resetBetweenChangeAndSession = false;
  const sessionRace = async items => {
    if (!items.some(item => /INSERT\s+INTO\s+sessions/i.test(item.sql))) { beforeBatch = sessionRace; return; }
    const replacement = await issued(issueRace);
    assert.equal((await call(resetBody(replacement.challenge, replacement.code))).status, 200);
    resetBetweenChangeAndSession = true;
  };
  beforeBatch = sessionRace;
  assert.equal((await changePassword()).status, 409, 'Recovery between change commit and session issuance cannot mint an old session');
  assert.equal(resetBetweenChangeAndSession, true);
  assert.equal(await verifyPassword('NewRecoveryPassword26!', credential(issueRace).password_hash), true);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE account_id=?').get(issueRace.id).n, 0);
  checks += 5;

  for (const change of ['logout', 'disabled', 'pending-expiry']) {
    freshLimits();
    const ordinary = seed(change === 'pending-expiry' ? { role: 'pending', pendingExpiresAt: new Date(clock + 10000).toISOString() } : {});
    sessions(ordinary); const tokenHash = await signedIn(ordinary);
    beforeBatch = () => {
      if (change === 'logout') sqlite.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);
      if (change === 'disabled') sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(new Date().toISOString(), ordinary.id);
      if (change === 'pending-expiry') clock += 10001;
    };
    assert.equal((await changePassword()).status, 409, change + ' at ordinary change commit blocks write');
    assert.equal(credential(ordinary).password_hash, initialHash);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE account_id=?').get(ordinary.id).n, change === 'logout' ? 2 : 3, 'Failed ordinary change does not revoke other sessions');
    checks += 3;
  }
  freshLimits();
  const ordinary = seed(); sessions(ordinary); await signedIn(ordinary);
  const parallelChanges = await Promise.all([changePassword('ConcurrentSettingsOne26!'), changePassword('ConcurrentSettingsTwo26!')]);
  assert.deepEqual(parallelChanges.map(r => r.status).sort(), [200, 409]);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE account_id=?').get(ordinary.id).n, 1);
  assert.equal(credential(ordinary).must_change_password, 0, 'Initial password change remains supported');
  checks += 3;
  freshLimits();
  const ordinaryRollback = seed(); await signedIn(ordinaryRollback);
  sqlite.exec("CREATE TEMP TRIGGER fail_ordinary_session_delete BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT,'isolated transaction failure'); END");
  try {
    await assert.rejects(changePassword());
    assert.equal(credential(ordinaryRollback).password_hash, initialHash);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE account_id=?').get(ordinaryRollback.id).n, 1);
  } finally { sqlite.exec('DROP TRIGGER fail_ordinary_session_delete'); }
  checks += 3;

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
  assert.equal(mails.length, 0);
  const afterUnknownFlood = seed();
  assert.equal((await issue(afterUnknownFlood.username, { 'cf-connecting-ip': '198.18.1.1' })).status, 200);
  assert.equal(mails.length, 1, '250 nonexistent usernames cannot exhaust the real mail budget');
  checks += 252;

  const prefix = '~password-recovery:v1:';
  freshLimits();
  const mailDay = new Date().toISOString().slice(0, 10);
  sqlite.prepare('INSERT INTO login_attempts VALUES(?,249,?,NULL)').run(prefix + 'daily:' + mailDay, new Date().toISOString());
  const lastMailAccounts = [seed(), seed()];
  const lastMailResults = await Promise.all(lastMailAccounts.map((a, i) => issue(a.username, { 'cf-connecting-ip': '203.0.113.' + (i + 1) })));
  assert(lastMailResults.every(r => r.status === 200));
  assert.equal(mails.length, 1, 'Concurrent sends preserve legacy daily usage and reserve only its last remaining slot');
  const noMailAccount = seed();
  const fullMail = await issue(noMailAccount.username, { 'cf-connecting-ip': '203.0.113.3' });
  const fullMailDecoy = await issue('no.mail.unknown', { 'cf-connecting-ip': '203.0.113.4' });
  assert.equal(fullMail.status, 200);
  assert.equal(fullMailDecoy.status, 200);
  assert.deepEqual(Object.keys(fullMail.data), Object.keys(fullMailDecoy.data));
  assert.equal(fullMail.data.challenge.length, fullMailDecoy.data.challenge.length);
  assert.equal(mails.length, 1);
  checks += 7;

  freshLimits();
  const requestDay = new Date().toISOString().slice(0, 10);
  const dayKey = prefix + 'requests:' + requestDay;
  sqlite.prepare('INSERT INTO login_attempts VALUES(?,2499,?,NULL)').run(dayKey, new Date().toISOString());
  const lastRequests = await Promise.all([issue('last.slot.a', { 'cf-connecting-ip': '203.0.113.11' }), issue('last.slot.b', { 'cf-connecting-ip': '203.0.113.12' })]);
  assert.deepEqual(lastRequests.map(r => r.status).sort(), [200, 429]);
  const rowCount = sqlite.prepare('SELECT count(*) n FROM login_attempts').get().n;
  for (let i = 0; i < 10; i++) assert.equal((await issue('rejected.key.' + i, { 'cf-connecting-ip': '203.0.113.' + (30 + i) })).status, 429);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM login_attempts').get().n, rowCount, 'Exhausted admission budget creates no IP, identifier or challenge rows');
  checks += 12;

  // Cleanup also runs on rejected requests, removes at most 100 old recovery
  // rows and preserves normal login/link locks and live challenges.
  const staleTime = new Date(clock - 3 * 86400000).toISOString();
  for (let i = 0; i < 150; i++) sqlite.prepare('INSERT INTO login_attempts VALUES(?,5,?,NULL)').run(prefix + 'old:' + i, staleTime);
  for (const key of ['ordinary.user', 'link:ordinary-account']) sqlite.prepare('INSERT INTO login_attempts VALUES(?,5,?,?)').run(key, staleTime, '2099-01-01T00:00:00.000Z');
  assert.equal((await issue('cleanup.rejected', { 'cf-connecting-ip': '203.0.113.99' })).status, 429);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM login_attempts WHERE username LIKE ?').get(prefix + 'old:%').n, 50);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM login_attempts WHERE username IN ('ordinary.user','link:ordinary-account')").get().n, 2);
  checks += 3;

  freshLimits();
  for (let i = 0; i < 10; i++) await issue('blocked.ip.' + i);
  const publicBefore = sqlite.prepare('SELECT failures FROM login_attempts WHERE username=?').get(prefix + 'requests:' + new Date().toISOString().slice(0, 10)).failures;
  const keysBefore = sqlite.prepare('SELECT count(*) n FROM login_attempts').get().n;
  const rejectedBurst = await Promise.all(Array.from({ length: 20 }, (_, i) => issue('blocked.ip.extra.' + i)));
  assert(rejectedBurst.every(r => r.status === 429));
  assert.equal(sqlite.prepare('SELECT failures FROM login_attempts WHERE username=?').get(prefix + 'requests:' + new Date().toISOString().slice(0, 10)).failures, publicBefore, 'IP-rejected attempts do not consume global slots');
  assert.equal(sqlite.prepare('SELECT count(*) n FROM login_attempts').get().n, keysBefore);
  checks += 3;

  freshLimits();
  assert.equal((await call({ action: 'request', identifier: 'normal.user' }, { origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await call({ action: 'request', identifier: 'normal.user' }, { origin: '' })).status, 403);
  assert.ok((await call({ action: 'request', identifier: 'x'.repeat(20_000) })).status >= 400);
  assert.ok((await call({ action: 'unexpected' })).status >= 400);
  assert.equal(mails.length, 0);
  checks += 5;

  // The new UI verifies email possession before displaying a password form.
  // Original challenges and verified grants have distinct authenticated uses.
  freshLimits();
  const staged = seed(), stagedChallenge = await issued(staged);
  sessions(staged);
  assert.equal((await grantReset(stagedChallenge.challenge)).status, 400, 'An unverified challenge is never a reset grant');
  const stagedWrong = stagedChallenge.code === '000000' ? '000001' : '000000';
  const wrongVerify = await verifyCode(stagedChallenge.challenge, stagedWrong);
  assert.equal(wrongVerify.status, 400);
  assert.equal(wrongVerify.data.resetToken, undefined);
  const stagedVerify = await call({ action: 'verify', ...stagedChallenge, newPassword: 'NeverSavedByVerification26!' });
  assert.equal(stagedVerify.status, 200);
  assert.deepEqual(Object.keys(stagedVerify.data).sort(), ['expiresIn', 'ok', 'resetToken']);
  assert.equal(stagedVerify.data.expiresIn, 600);
  assert.equal(credential(staged).password_hash, initialHash, 'Verification cannot save a supplied new password');
  assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE account_id=?').get(staged.id).n, 2, 'Verification does not revoke sessions');
  assert.equal((await grantReset(stagedChallenge.challenge)).status, 400, 'Even a verified original challenge cannot replace the grant');
  assert.equal((await verifyCode(stagedVerify.data.resetToken, stagedChallenge.code)).status, 400, 'A reset grant cannot be used as a code challenge');
  assert.equal((await call({ ...resetBody(stagedChallenge.challenge, stagedChallenge.code), resetToken: null })).status, 400, 'Malformed explicit resetToken never falls back to legacy credentials');
  assert.equal((await grantReset(stagedVerify.data.resetToken, 'short')).data.code, 'INVALID_PASSWORD');
  assert.equal((await grantReset(stagedVerify.data.resetToken, initialPassword)).data.code, 'PASSWORD_UNCHANGED');
  assert.equal(sqlite.prepare("SELECT failures FROM login_attempts WHERE username LIKE '~password-recovery:v1:challenge:%'").get().failures, 2, 'Password corrections do not consume more OTP attempts');
  assert.equal((await grantReset(stagedVerify.data.resetToken)).status, 200);
  assert.equal(await verifyPassword('NewRecoveryPassword26!', credential(staged).password_hash), true);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE account_id=?').get(staged.id).n, 0);
  assert.equal((await grantReset(stagedVerify.data.resetToken, 'ReplayGrantPassword26!')).status, 400);
  assert.equal((await verifyCode(stagedChallenge.challenge, stagedChallenge.code)).status, 400, 'Consumed recovery cannot be verified again');
  checks += 19;

  // A caller who lost a successful verify response may retry within the same
  // budget. Equivalent grants share expiry and one atomic consumption point.
  freshLimits();
  const retryAccount = seed(), retryChallenge = await issued(retryAccount);
  clock += 120_000;
  const retryFirst = await verifyCode(retryChallenge.challenge, retryChallenge.code);
  clock += 10_000;
  const retrySecond = await verifyCode(retryChallenge.challenge, retryChallenge.code);
  assert.equal(retryFirst.status, 200);
  assert.equal(retrySecond.status, 200);
  assert.equal(retryFirst.data.expiresIn, 480);
  assert.equal(retrySecond.data.expiresIn, 470, 'Retry never extends the original ten-minute deadline');
  const grantRace = await Promise.all([grantReset(retryFirst.data.resetToken, 'FirstEquivalentGrant26!'), grantReset(retrySecond.data.resetToken, 'SecondEquivalentGrant26!')]);
  assert.deepEqual(grantRace.map(result => result.status).sort(), [200, 400], 'Equivalent grants permit exactly one commit');
  checks += 5;

  freshLimits();
  const bounded = seed(), boundedChallenge = await issued(bounded);
  const boundedGrant = await verifyCode(boundedChallenge.challenge, boundedChallenge.code);
  assert.equal(boundedGrant.status, 200);
  const boundedWrong = boundedChallenge.code === '000000' ? '000001' : '000000';
  for (let i = 0; i < 4; i++) {
    const result = i === 0 ? await call(resetBody(boundedChallenge.challenge, boundedWrong)) : await verifyCode(boundedChallenge.challenge, boundedWrong);
    assert.equal(result.status, 400);
  }
  assert.equal((await verifyCode(boundedChallenge.challenge, boundedChallenge.code)).status, 400, 'Correct retries cannot bypass the shared five-attempt limit');
  assert.equal((await grantReset(boundedGrant.data.resetToken)).status, 200, 'Exhausted guessing cannot revoke an already verified grant');
  checks += 7;

  freshLimits();
  const expiredGrantAccount = seed(), expiredGrantChallenge = await issued(expiredGrantAccount);
  clock += 599_000;
  const expiringGrant = await verifyCode(expiredGrantChallenge.challenge, expiredGrantChallenge.code);
  assert.equal(expiringGrant.status, 200);
  assert.equal(expiringGrant.data.expiresIn, 1);
  clock += 1001;
  assert.equal((await grantReset(expiringGrant.data.resetToken)).status, 400);
  assert.equal(credential(expiredGrantAccount).password_hash, initialHash);
  checks += 4;

  freshLimits();
  const grantStateAccount = seed(), grantStateChallenge = await issued(grantStateAccount);
  const stateGrant = await verifyCode(grantStateChallenge.challenge, grantStateChallenge.code);
  const grantText = stateGrant.data.resetToken, grantAt = Math.floor(grantText.length / 2);
  const tamperedGrant = grantText.slice(0, grantAt) + (grantText[grantAt] === 'A' ? 'B' : 'A') + grantText.slice(grantAt + 1);
  assert.equal((await grantReset(tamperedGrant)).status, 400);
  sqlite.prepare("UPDATE login_attempts SET blocked_until=NULL WHERE username LIKE '~password-recovery:v1:challenge:%'").run();
  assert.equal((await grantReset(grantText)).status, 400, 'A valid encrypted grant also requires server-side verified state');
  assert.equal(credential(grantStateAccount).password_hash, initialHash);
  checks += 3;

  for (const change of ['password', 'unlink', 'email', 'disabled', 'pending-expiry']) {
    freshLimits();
    const changedGrantAccount = seed(change === 'pending-expiry' ? { role: 'pending', pendingExpiresAt: new Date(clock + 10000).toISOString() } : {});
    const changedGrantChallenge = await issued(changedGrantAccount);
    const changedGrant = await verifyCode(changedGrantChallenge.challenge, changedGrantChallenge.code);
    assert.equal(changedGrant.status, 200);
    sessions(changedGrantAccount);
    if (change === 'password') sqlite.prepare('UPDATE local_credentials SET password_hash=? WHERE account_id=?').run(await hashPassword('NewAdministratorPassword26!'), changedGrantAccount.id);
    if (change === 'unlink') sqlite.prepare('DELETE FROM google_identities WHERE account_id=?').run(changedGrantAccount.id);
    if (change === 'email') sqlite.prepare('UPDATE google_identities SET email=? WHERE account_id=?').run('changed-verified@example.test', changedGrantAccount.id);
    if (change === 'disabled') sqlite.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').run(new Date().toISOString(), changedGrantAccount.id);
    if (change === 'pending-expiry') clock += 10001;
    const hashBefore = credential(changedGrantAccount).password_hash;
    assert.equal((await grantReset(changedGrant.data.resetToken)).status, 400, change + ' invalidates an already verified grant');
    assert.equal(credential(changedGrantAccount).password_hash, hashBefore);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE account_id=?').get(changedGrantAccount.id).n, 2);
    checks += 4;
  }

  freshLimits();
  const verifyResetAccount = seed(), verifyResetChallenge = await issued(verifyResetAccount);
  const concurrentVerifications = await Promise.all([verifyCode(verifyResetChallenge.challenge, verifyResetChallenge.code), verifyCode(verifyResetChallenge.challenge, verifyResetChallenge.code)]);
  assert.ok(concurrentVerifications.every(result => result.status === 200), 'Parallel correct verification returns equivalent bounded grants');
  const verifyResetRace = await Promise.all([verifyCode(verifyResetChallenge.challenge, verifyResetChallenge.code), grantReset(concurrentVerifications[0].data.resetToken)]);
  assert.equal(verifyResetRace[1].status, 200);
  assert.ok([200, 400].includes(verifyResetRace[0].status));
  assert.equal((await grantReset(concurrentVerifications[1].data.resetToken)).status, 400);
  if (verifyResetRace[0].status === 200) assert.equal((await grantReset(verifyResetRace[0].data.resetToken)).status, 400, 'Verification racing a reset cannot resurrect the consumed grant');
  assert.equal((await verifyCode(verifyResetChallenge.challenge, verifyResetChallenge.code)).status, 400);
  checks += 5 + Number(verifyResetRace[0].status === 200);

  freshLimits();
  const ordinaryGrantAccount = seed(), ordinaryGrantChallenge = await issued(ordinaryGrantAccount);
  const ordinaryGrant = await verifyCode(ordinaryGrantChallenge.challenge, ordinaryGrantChallenge.code);
  await signedIn(ordinaryGrantAccount);
  let ordinaryWon = false;
  beforeBatch = async items => {
    assert.ok(items.some(item => /UPDATE\s+local_credentials/i.test(item.sql)));
    const changed = await changePassword('OrdinaryWinsAfterVerification26!');
    assert.equal(changed.status, 200);
    ordinaryWon = true;
  };
  assert.equal((await grantReset(ordinaryGrant.data.resetToken)).status, 400, 'Final grant CAS loses to an ordinary password change');
  assert.equal(ordinaryWon, true);
  assert.equal(await verifyPassword('OrdinaryWinsAfterVerification26!', credential(ordinaryGrantAccount).password_hash), true);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE account_id=?').get(ordinaryGrantAccount.id).n, 1, 'A losing grant cannot revoke the new ordinary-change session');
  checks += 6;

  freshLimits();
  const grantRollbackAccount = seed(), grantRollbackChallenge = await issued(grantRollbackAccount);
  const rollbackGrant = await verifyCode(grantRollbackChallenge.challenge, grantRollbackChallenge.code);
  sessions(grantRollbackAccount);
  sqlite.exec("CREATE TEMP TRIGGER fail_grant_session_delete BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT,'isolated grant transaction failure'); END");
  try {
    assert.equal((await grantReset(rollbackGrant.data.resetToken)).status, 503);
    assert.equal(credential(grantRollbackAccount).password_hash, initialHash);
    assert.equal(sqlite.prepare("SELECT blocked_until FROM login_attempts WHERE username LIKE '~password-recovery:v1:challenge:%'").get().blocked_until, 'verified', 'Failed transaction does not consume the verified grant');
    assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE account_id=?').get(grantRollbackAccount.id).n, 2);
  } finally { sqlite.exec('DROP TRIGGER fail_grant_session_delete'); }
  assert.equal((await grantReset(rollbackGrant.data.resetToken)).status, 200, 'Grant remains usable after a fully rolled-back transaction');
  checks += 5;

  console.log(`PASS password recovery: ${checks} security assertions, real SQL/Web Crypto, isolated database and intercepted mail only.`);
} finally {
  globalThis.fetch = originalFetch;
  globalThis.Date = OriginalDate;
  hooks.deregister();
  sqlite.close();
  delete globalThis.__recoveryTest;
}
