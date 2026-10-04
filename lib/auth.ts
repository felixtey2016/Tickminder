import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, googleIdentities, localCredentials, sessions } from "@/db/schema";
import { pendingExpired } from "@/lib/account-lifecycle";

export type Account = typeof accounts.$inferSelect;
const encoder = new TextEncoder();
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function fromBase64Url(value: string): Uint8Array {
  const bytes = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bytes, c => c.charCodeAt(0));
}

export function toBase64Url(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    result += alphabet[(n >>> 18) & 63] + alphabet[(n >>> 12) & 63];
    if (i + 1 < bytes.length) result += alphabet[(n >>> 6) & 63];
    if (i + 2 < bytes.length) result += alphabet[n & 63];
  }
  return result;
}

export async function hashToken(token: string) {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token))));
}

type GoogleSigningKey = JsonWebKey & { kid?: string };
let googleKeysCache: {keys: GoogleSigningKey[]; expiresAt: number} | null = null;
let googleKeysRequest: Promise<GoogleSigningKey[]> | null = null;
async function googleSigningKeys(force = false): Promise<GoogleSigningKey[]> {
  if (!force && googleKeysCache && googleKeysCache.expiresAt > Date.now()) return googleKeysCache.keys;
  if (googleKeysRequest) return googleKeysRequest;
  googleKeysRequest = (async () => {
    let response: Response;
    try { response = await fetch("https://www.googleapis.com/oauth2/v3/certs"); }
    catch { throw new Error("无法连接 Google 登录验证服务，请检查网络后重试"); }
    if (!response.ok) throw new Error("Google key lookup failed");
    const {keys} = await response.json() as {keys: GoogleSigningKey[]};
    if (!Array.isArray(keys)) throw new Error("Google key lookup failed");
    const maxAge = Number(response.headers.get("cache-control")?.match(/(?:^|[,\s])max-age=(\d+)/i)?.[1] || 0);
    // Respect Google's key lifetime and refresh on an unfamiliar key ID.
    googleKeysCache = {keys, expiresAt: Date.now() + Math.min(maxAge, 3600) * 1000};
    return keys;
  })();
  try { return await googleKeysRequest; } finally { googleKeysRequest = null; }
}

export async function verifyGoogleCredential(token: string) {
  if (!env.GOOGLE_CLIENT_ID) throw new Error("Google login is not configured");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid Google credential");
  const header = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1])));
  if (header.alg !== "RS256" || !header.kid) throw new Error("Invalid Google credential");
  if (!["https://accounts.google.com", "accounts.google.com"].includes(payload.iss) ||
      payload.aud !== env.GOOGLE_CLIENT_ID || payload.exp <= Date.now() / 1000 ||
      !payload.email_verified || !payload.sub || !payload.email) throw new Error("Invalid Google credential");
  const cached = Boolean(googleKeysCache && googleKeysCache.expiresAt > Date.now());
  let keys = await googleSigningKeys();
  let jwk = keys.find(k => k.kid === header.kid && k.kty === "RSA");
  if (!jwk && cached) { keys = await googleSigningKeys(true); jwk = keys.find(k => k.kid === header.kid && k.kty === "RSA"); }
  if (!jwk) throw new Error("Google signing key unavailable");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromBase64Url(parts[2]).buffer as ArrayBuffer, encoder.encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error("Invalid Google signature");
  return { id: String(payload.sub), email: String(payload.email).toLowerCase(), name: String(payload.name || payload.email) };
}

export async function currentIdentity() {
  const token = (await cookies()).get("tuition_session")?.value;
  if (!token) return null;
  const row = await getDb().select({
    account: accounts,
    username: localCredentials.username,
    mustChangePassword: localCredentials.mustChangePassword,
    googleSubject: googleIdentities.subject,
    googleEmail: googleIdentities.email,
  }).from(sessions).innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .leftJoin(localCredentials, eq(localCredentials.accountId, accounts.id))
    .leftJoin(googleIdentities, eq(googleIdentities.accountId, accounts.id))
    .where(and(eq(sessions.tokenHash, await hashToken(token)), gt(sessions.expiresAt, new Date().toISOString()))).get();
  if (!row || row.account.disabledAt || pendingExpired(row.account)) return null;
  return { account: row.account,
    local: row.username ? { username: row.username, mustChangePassword: Boolean(row.mustChangePassword) } : null,
    google: row.googleSubject ? { subject: row.googleSubject, email: row.googleEmail! } : null };
}

export async function currentAccount(): Promise<Account | null> {
  return (await currentIdentity())?.account || null;
}

// Business routes still enforce the initial password and Google account setup.
export async function currentBusinessAccount(): Promise<Account | null> {
  const identity = await currentIdentity();
  if (!identity || identity.local?.mustChangePassword || (!identity.local && identity.google)) return null;
  return identity.account;
}

export async function createSession(accountId: string) {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  await getDb().insert(sessions).values({ tokenHash: await hashToken(token), accountId, expiresAt });
  return { token, expiresAt };
}
