import {env} from 'cloudflare:workers';
import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {createSession, hashToken, StaleSessionCredentialError, toBase64Url, verifyGoogleCredential} from '@/lib/auth';
import {hashPassword, normalizeUsername, validPassword, validUsername} from '@/lib/password';
import {quizRequestBytes} from '@/lib/quiz-server';
import {tickLearnAccountOrigin,tickLearnGoogleCookie,tickLearnSignupReason} from '@/lib/ticklearn-routes';
import {StudentContactError} from '@/lib/student-contact';
import {normalizeTickLearnPhone} from '@/lib/ticklearn-phone';
import {reportUnexpectedError} from '@/lib/diagnostics-server';

const headers = {'Cache-Control': 'private, no-store'};
const nonceCookie = '__Host-ticklearn-nonce';
const nonceOptions = {httpOnly: true, secure: true, sameSite: 'lax', path: '/'} as const;
const reply = (data: Record<string, unknown>, status = 200) => NextResponse.json(data, {status, headers});

export async function GET() {
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const response = reply({clientId: env.GOOGLE_CLIENT_ID || null, nonce});
  response.cookies.set(nonceCookie, nonce, {...nonceOptions, maxAge: 600});
  return response;
}

async function registrationAllowed(database: D1Database, request: Request) {
  const address = request.headers.get('cf-connecting-ip') || 'local';
  const key = 'ticklearn-signup:' + await hashToken(address);
  const now = new Date(), before = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const record = await database.prepare(`INSERT INTO login_attempts(username, failures, window_start)
    VALUES (?, 1, ?) ON CONFLICT(username) DO UPDATE SET
    failures=CASE WHEN window_start<=? THEN 1 ELSE failures+1 END,
    window_start=CASE WHEN window_start<=? THEN excluded.window_start ELSE window_start END
    WHERE window_start<=? OR failures<20 RETURNING failures`)
    .bind(key, now.toISOString(), before, before, before).first();
  if (record && record.failures === 1) {
    await database.prepare(`DELETE FROM login_attempts WHERE username IN
      (SELECT username FROM login_attempts WHERE username LIKE 'ticklearn-signup:%' AND window_start<? LIMIT 30)`).bind(before).run();
  }
  return Boolean(record);
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({error: 'request'}, 403);
  const database = env.DB;
  if (!database) return reply({error: 'server'}, 503);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(await quizRequestBytes(request, 8192)));
    if (!data || Array.isArray(data) || typeof data !== 'object') return reply({error: 'request'}, 400);
  } catch { return reply({error: 'request'}, 400); }

  const googleBridge = data.action === 'google' && data.googleBridge === true;
  if (googleBridge && new URL(request.url).origin !== tickLearnAccountOrigin) return reply({error: 'request'}, 403);

  try {
    const now = new Date().toISOString();
    let accountId: string;
    if (data.action === 'signup') {
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      const username = normalizeUsername(data.username), password = data.password;
      if (!validUsername(username) || !validPassword(password) || !name || name.length > 80 ||
          /[|\u0000-\u001f]/.test(name)) return reply({error: 'fields'}, 400);
      const phone = normalizeTickLearnPhone(data.phone);
      if (!await registrationAllowed(database, request)) return reply({error: 'throttled'}, 429);
      accountId = 'local:' + crypto.randomUUID();
      const passwordHash = await hashPassword(password);
      try {
        await database.batch([
          database.prepare(`INSERT INTO accounts(id,group_id,email,name,name_confirmed_at,role,created_at,activated_at,activation_reason,
            contact_phone,contact_phone_kind,contact_phone_updated_at)
            VALUES (?, NULL, '', ?, ?, 'learner', ?, ?, ?, ?, 'student', ?)`).bind(accountId, name, now, now, now, tickLearnSignupReason,phone,now),
          database.prepare(`INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at)
            VALUES (?,?,?,0,?)`).bind(accountId, username, passwordHash, now),
        ]);
      } catch (error) {
        if (/UNIQUE constraint failed: local_credentials.username/.test(String(error))) return reply({error: 'username'}, 409);
        throw error;
      }
    } else if (data.action === 'google' && typeof data.credential === 'string') {
      const nonce = (await cookies()).get(nonceCookie)?.value;
      if (!nonce) return reply({error: 'google'}, 400);
      let profile: Awaited<ReturnType<typeof verifyGoogleCredential>>;
      try { profile = await verifyGoogleCredential(data.credential, nonce); }
      catch { return reply({error: 'google'}, 401); }
      async function googleAccount() {
        return database!.prepare('SELECT account_id AS id FROM google_identities WHERE subject=?').bind(profile.id).first<{id: string}>();
      }
      const known = await googleAccount();
      if (!known) {
        if (data.phone === undefined) return reply({needsPhone: true}, 422);
        const phone = normalizeTickLearnPhone(data.phone);
        if (!await registrationAllowed(database, request)) return reply({error: 'throttled'}, 429);
        await database.batch([
          database.prepare(`INSERT INTO accounts(id,group_id,email,name,name_confirmed_at,role,created_at,activated_at,activation_reason,
            contact_phone,contact_phone_kind,contact_phone_updated_at)
            SELECT ?, NULL, ?, ?, ?, 'learner', ?, ?, ?, ?, 'student', ? WHERE NOT EXISTS(SELECT 1 FROM google_identities WHERE subject=?)
            ON CONFLICT(id) DO NOTHING`).bind(profile.id, profile.email, profile.name.trim().slice(0, 80) || 'TickLearn', now, now, now,
            tickLearnSignupReason,phone,now,profile.id),
          database.prepare(`INSERT INTO google_identities(subject,account_id,email,linked_at)
            SELECT ?, id, ?, ? FROM accounts WHERE id=? AND role='learner' AND activation_reason=?
            ON CONFLICT DO NOTHING`).bind(profile.id, profile.email, now, profile.id, tickLearnSignupReason),
        ]);
      }
      const canonical = known || await googleAccount();
      if (!canonical) return reply({error: 'existing'}, 409);
      accountId = canonical.id;
    } else return reply({error: 'request'}, 400);

    let session: Awaited<ReturnType<typeof createSession>>;
    try { session = await createSession(accountId, request, undefined, !googleBridge); }
    catch (error) {
      if (error instanceof StaleSessionCredentialError) {
        return reply({error: 'unavailable'}, 403);
      }
      throw error;
    }
    const response = reply({ok: true});
    if (googleBridge) response.cookies.set(tickLearnGoogleCookie, session.token, {...nonceOptions, maxAge: 90});
    else response.cookies.set('tuition_session', session.token, {...nonceOptions, expires: new Date(session.expiresAt)});
    response.cookies.set(nonceCookie, '', {...nonceOptions, maxAge: 0});
    return response;
  } catch(error) {
    if(error instanceof StudentContactError)return reply({error:'phone'},400);
    reportUnexpectedError(error,{operation:'ticklearn-auth'});
    return reply({error: 'server'}, 503);
  }
}
