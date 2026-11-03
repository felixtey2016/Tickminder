import { hashPassword, normalizeUsername, validPassword, validUsername, verifyPassword } from "./password";

/** Password recovery reuses only the authentication attempt table. No business
 * data, plaintext codes, password hashes, or delivery addresses are persisted in
 * recovery counters. Encrypted challenges are kept by the requesting browser. */
export const RECOVERY_TTL_SECONDS = 600;
export const RECOVERY_RETRY_SECONDS = 60;
export const RECOVERY_MAX_ATTEMPTS = 5;
const PREFIX = "~password-recovery:v1:"; // Cannot be a valid login username/email.
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const payloadBytes = 1024;
const associatedData = encoder.encode("tickminder:password-recovery:v1");

export type RecoveryEnvironment = {
  DB?: D1Database;
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
  PASSWORD_RECOVERY_SECRET?: string;
};
type Config = { db: D1Database; apiKey: string; senderEmail: string; senderName: string; secret: string };
type Identity = {
  accountId: string; username: string; passwordHash: string;
  subject: string; email: string; linkedAt: string;
};
type Challenge = { v: 1; nonce: string; accountId: string; credentialStamp: string; identityStamp: string; codeStamp: string; issued: number; expires: number };
export class RecoveryError extends Error {
  constructor(public code: string, public status = 400, public retryAfter?: number) { super(code); }
}

export function recoveryConfig(env: RecoveryEnvironment): Config | null {
  const apiKey = env.BREVO_API_KEY?.trim(), senderEmail = env.BREVO_SENDER_EMAIL?.trim();
  const secret = env.PASSWORD_RECOVERY_SECRET;
  const senderName = env.BREVO_SENDER_NAME?.trim() || "Tickminder";
  if (!env.DB || !apiKey || !senderEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail) || senderEmail.length > 254 || !secret || secret.length < 32 || secret.length > 1024 || senderName.length > 100 || /[\r\n]/.test(senderName)) return null;
  return { db: env.DB, apiKey, senderEmail, senderName, secret };
}
function base64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unbase64(value: string) { return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), character => character.charCodeAt(0)); }
function equal(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
async function stamp(secret: string, purpose: string, ...values: string[]) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(JSON.stringify(["tickminder-recovery-v1", purpose, ...values])))));
}
async function encryptionKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode("tickminder-recovery-encryption-v1:" + secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(secret: string, challenge: Challenge) {
  const serialized = encoder.encode(JSON.stringify(challenge));
  if (serialized.length > payloadBytes) throw new RecoveryError("SERVER_ERROR", 503);
  // All real and decoy tokens have exactly the same byte length.
  const padded = new Uint8Array(payloadBytes).fill(32); padded.set(serialized);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: associatedData }, await encryptionKey(secret), padded));
  const token = new Uint8Array(iv.length + encrypted.length); token.set(iv); token.set(encrypted, iv.length);
  return base64(token);
}
async function open(secret: string, token: string): Promise<Challenge> {
  try {
    if (!/^[A-Za-z0-9_-]{1403}$/.test(token)) throw new Error("token");
    const bytes = unbase64(token);
    const decoded = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: associatedData }, await encryptionKey(secret), bytes.slice(12));
    const value = JSON.parse(decoder.decode(decoded)) as Challenge;
    const now = Date.now();
    if (value.v !== 1 || !/^[a-f0-9]{32}$/.test(value.nonce) || typeof value.accountId !== "string" || value.accountId.length > 200 || ![value.codeStamp, value.credentialStamp, value.identityStamp].every(item => typeof item === "string" && /^[A-Za-z0-9_-]{43}$/.test(item)) || !Number.isSafeInteger(value.issued) || !Number.isSafeInteger(value.expires) || value.issued > now + 1000 || value.expires <= now || value.expires - value.issued !== RECOVERY_TTL_SECONDS * 1000) throw new Error("token");
    return value;
  } catch { throw new RecoveryError("INVALID_CODE"); }
}
function randomHex() { return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join(""); }
function randomCode() {
  // Rejection sampling avoids modulo bias in the six-digit code.
  const ceiling = Math.floor(0x100000000 / 1000000) * 1000000;
  let number: number;
  do { number = crypto.getRandomValues(new Uint32Array(1))[0]; } while (number >= ceiling);
  return String(number % 1000000).padStart(6, "0");
}
const eligible = `a.disabled_at IS NULL AND NOT (a.role='pending' AND COALESCE(a.activated_at,'')='' AND COALESCE(a.teacher_name,'')='' AND COALESCE(a.student_name,'')='' AND COALESCE(a.pending_expires_at,'')<>'' AND a.pending_expires_at <= ?)`;
const identitySelect = `SELECT c.account_id AS accountId,c.username,c.password_hash AS passwordHash,g.subject,g.email,g.linked_at AS linkedAt FROM local_credentials c JOIN accounts a ON a.id=c.account_id JOIN google_identities g ON g.account_id=c.account_id`;
async function findIdentity(db: D1Database, identifier: string, now: string): Promise<Identity | null> {
  const condition = identifier.includes("@") ? "lower(g.email)=?" : "c.username=?";
  // Ambiguity is checked before eligibility: never silently select one of two accounts.
  const result = await db.prepare(`${identitySelect} WHERE ${condition} LIMIT 2`).bind(identifier).all<Identity>();
  if (result.results?.length !== 1) return null;
  return identityByAccount(db, result.results[0].accountId, now);
}
async function identityByAccount(db: D1Database, accountId: string, now: string) {
  return db.prepare(`${identitySelect} WHERE c.account_id=? AND ${eligible}`).bind(accountId, now).first<Identity>();
}
async function identityStamp(secret: string, identity: Identity) {
  return stamp(secret, "identity", identity.accountId, identity.subject, identity.email, identity.linkedAt);
}

/** The UPSERT reserves quota atomically; rejected attempts cannot overwrite a
 * fresh window. Prefixes isolate recovery from ordinary password-login locks. */
async function reserve(db: D1Database, key: string, now: number, period: number, limit: number, cooldown = 0) {
  const iso = new Date(now).toISOString(), threshold = new Date(now - period).toISOString();
  const blocked = cooldown ? new Date(now + cooldown).toISOString() : null;
  const result = await db.prepare(`INSERT INTO login_attempts(username,failures,window_start,blocked_until) VALUES(?,1,?,?)
    ON CONFLICT(username) DO UPDATE SET failures=CASE WHEN login_attempts.window_start<=? THEN 1 ELSE login_attempts.failures+1 END,
    window_start=CASE WHEN login_attempts.window_start<=? THEN excluded.window_start ELSE login_attempts.window_start END,
    blocked_until=excluded.blocked_until
    WHERE login_attempts.window_start<=? OR (login_attempts.failures<? AND (login_attempts.blocked_until IS NULL OR login_attempts.blocked_until<=?))
    RETURNING failures`).bind(key, iso, blocked, threshold, threshold, threshold, limit, iso).first<{ failures: number }>();
  return Boolean(result);
}
async function rateRetry(db: D1Database, key: string, now: number, period: number, limit: number) {
  const row = await db.prepare("SELECT failures,window_start AS windowStart,blocked_until AS blockedUntil FROM login_attempts WHERE username=?").bind(key).first<{ failures: number; windowStart: string; blockedUntil: string | null }>();
  if (!row) return RECOVERY_RETRY_SECONDS;
  const until = Math.max(now + 1000, row.failures >= limit ? Date.parse(row.windowStart) + period : now, row.blockedUntil ? Date.parse(row.blockedUntil) : now);
  return Math.ceil((until - now) / 1000);
}
async function safeSend(config: Config, identity: Identity, code: string, language: "zh" | "en") {
  const zh = language === "zh";
  const textContent = zh
    ? `你的 Tickminder 密码重置验证码：${code}\n\n验证码 10 分钟内有效，只能用于本次密码重置。请勿将验证码告诉他人。\n如果你没有请求重置密码，请忽略这封邮件。你的密码不会因此改变。`
    : `Your Tickminder password reset code: ${code}\n\nThis code expires in 10 minutes and can only be used to reset your password. Do not share it with anyone.\nIf you did not request a password reset, ignore this email. Your password will stay unchanged.`;
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: { "api-key": config.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ sender: { email: config.senderEmail, name: config.senderName }, to: [{ email: identity.email }], subject: zh ? "Tickminder 密码重置验证码" : "Your Tickminder password reset code", textContent, tags: ["password-recovery"] }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) { console.warn("Password recovery email delivery failed", { status: response.status }); return false; }
    return true;
  } catch { console.warn("Password recovery email delivery unavailable"); return false; }
}

export async function requestPasswordRecovery(config: Config, rawIdentifier: unknown, ip: string, language: "zh" | "en", defer: (work: Promise<unknown>) => void) {
  const identifier = normalizeUsername(rawIdentifier);
  if (identifier.length > 254 || (!validUsername(identifier) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier))) throw new RecoveryError("INVALID_REQUEST");
  const now = Date.now(), iso = new Date(now).toISOString();
  const ipKey = PREFIX + "ip:" + await stamp(config.secret, "ip", ip);
  const identifierKey = PREFIX + "identifier:" + await stamp(config.secret, "identifier", identifier);
  if (!await reserve(config.db, ipKey, now, 3600000, 10)) throw new RecoveryError("RATE_LIMITED", 429, await rateRetry(config.db, ipKey, now, 3600000, 10));
  if (!await reserve(config.db, identifierKey, now, 3600000, 3, RECOVERY_RETRY_SECONDS * 1000)) throw new RecoveryError("RATE_LIMITED", 429, await rateRetry(config.db, identifierKey, now, 3600000, 3));
  // The global ceiling is intentionally below Brevo's free daily email allowance;
  // it protects this endpoint, not unrelated mail sent from the Brevo account.
  const day = new Date(now).toISOString().slice(0, 10);
  if (!await reserve(config.db, PREFIX + "daily:" + day, now, 86400000, 250)) throw new RecoveryError("RATE_LIMITED", 429, Math.ceil((Date.parse(day + "T00:00:00Z") + 86400000 - now) / 1000));
  const identity = await findIdentity(config.db, identifier, iso);
  const nonce = randomHex(), code = randomCode();
  const challenge: Challenge = {
    v: 1, nonce, accountId: identity?.accountId || randomHex(), issued: now, expires: now + RECOVERY_TTL_SECONDS * 1000,
    credentialStamp: await stamp(config.secret, "credential", identity?.passwordHash || randomHex()),
    identityStamp: identity ? await identityStamp(config.secret, identity) : await stamp(config.secret, "decoy", randomHex()),
    codeStamp: await stamp(config.secret, "code", nonce, code),
  };
  const token = await seal(config.secret, challenge);
  const attemptKey = PREFIX + "challenge:" + nonce;
  await config.db.prepare("INSERT INTO login_attempts(username,failures,window_start,blocked_until) VALUES(?,0,?,NULL)").bind(attemptKey, iso).run();
  // Delivery runs in Workers' request lifetime extension. Awaiting Brevo only
  // for real accounts would expose account existence through response latency.
  defer((async () => {
    try {
      if (identity) {
        const accountKey = PREFIX + "account:" + await stamp(config.secret, "account", identity.accountId);
        const allowed = await reserve(config.db, accountKey, now, 3600000, 3, RECOVERY_RETRY_SECONDS * 1000);
        if (!allowed || !await safeSend(config, identity, code, language)) {
          await config.db.prepare("UPDATE login_attempts SET blocked_until=? WHERE username=?").bind("used", attemptKey).run();
        }
      }
      // Bound counter storage without touching ordinary login attempts.
      await config.db.prepare("DELETE FROM login_attempts WHERE username LIKE ? AND window_start<?").bind(PREFIX + "%", new Date(now - 2 * 86400000).toISOString()).run();
    } catch { console.error("Password recovery background delivery failed"); }
  })());
  return { ok: true, challenge: token, retryAfter: RECOVERY_RETRY_SECONDS, expiresIn: RECOVERY_TTL_SECONDS };
}

export async function resetRecoveredPassword(config: Config, token: unknown, rawCode: unknown, newPassword: unknown) {
  if (typeof token !== "string" || typeof rawCode !== "string" || !/^\d{6}$/.test(rawCode)) throw new RecoveryError("INVALID_CODE");
  if (!validPassword(newPassword)) throw new RecoveryError("INVALID_PASSWORD");
  const challenge = await open(config.secret, token);
  const attemptKey = PREFIX + "challenge:" + challenge.nonce;
  const issued = new Date(challenge.issued).toISOString();
  const attempt = await config.db.prepare(`UPDATE login_attempts SET failures=failures+1 WHERE username=? AND window_start=? AND blocked_until IS NULL AND failures<? RETURNING failures`)
    .bind(attemptKey, issued, RECOVERY_MAX_ATTEMPTS).first<{ failures: number }>();
  if (!attempt || !equal(challenge.codeStamp, await stamp(config.secret, "code", challenge.nonce, rawCode))) throw new RecoveryError("INVALID_CODE");
  const now = new Date(Date.now()).toISOString();
  const identity = await identityByAccount(config.db, challenge.accountId, now);
  if (!identity || !equal(challenge.credentialStamp, await stamp(config.secret, "credential", identity.passwordHash)) || !equal(challenge.identityStamp, await identityStamp(config.secret, identity))) throw new RecoveryError("INVALID_CODE");
  if (await verifyPassword(newPassword, identity.passwordHash)) throw new RecoveryError("PASSWORD_UNCHANGED");
  const passwordHash = await hashPassword(newPassword);
  const committedAt = new Date(Date.now()).toISOString();
  // D1 batches are transactional. The credential CAS also checks live identity,
  // lifecycle, challenge expiry and attempts inside the transaction. All later
  // mutations are gated by this invocation's newly salted password hash, so a
  // losing parallel invocation cannot revoke a newer session or consume state.
  const result = await config.db.batch([
    config.db.prepare(`UPDATE local_credentials SET password_hash=?,must_change_password=0,updated_at=?
      WHERE account_id=? AND password_hash=? AND EXISTS(SELECT 1 FROM accounts a JOIN google_identities g ON g.account_id=a.id
      WHERE a.id=local_credentials.account_id AND ${eligible.replace('<= ?', "<= strftime('%Y-%m-%dT%H:%M:%fZ','now')")} AND g.subject=? AND g.email=? AND g.linked_at=?)
      AND EXISTS(SELECT 1 FROM login_attempts WHERE username=? AND window_start=? AND blocked_until IS NULL AND failures<=?) AND (julianday('now')-2440587.5)*86400000<?`)
      .bind(passwordHash, committedAt, identity.accountId, identity.passwordHash, identity.subject, identity.email, identity.linkedAt, attemptKey, issued, RECOVERY_MAX_ATTEMPTS, challenge.expires),
    config.db.prepare("DELETE FROM sessions WHERE account_id=? AND EXISTS(SELECT 1 FROM local_credentials WHERE account_id=? AND password_hash=?)").bind(identity.accountId, identity.accountId, passwordHash),
    config.db.prepare("DELETE FROM login_attempts WHERE username=? AND EXISTS(SELECT 1 FROM local_credentials WHERE account_id=? AND password_hash=?)").bind(identity.username, identity.accountId, passwordHash),
    config.db.prepare("UPDATE login_attempts SET blocked_until='used' WHERE username=? AND EXISTS(SELECT 1 FROM local_credentials WHERE account_id=? AND password_hash=?)").bind(attemptKey, identity.accountId, passwordHash),
  ]);
  if (result[0].meta.changes !== 1) throw new RecoveryError("INVALID_CODE");
  return { ok: true };
}
