import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
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
  let response: Response;
  try { response = await fetch("https://www.googleapis.com/oauth2/v3/certs"); }
  catch { throw new Error("无法连接 Google 登录验证服务，请检查网络后重试"); }
  if (!response.ok) throw new Error("Google key lookup failed");
  const { keys } = await response.json() as { keys: Array<JsonWebKey & { kid?: string }> };
  const jwk = keys.find(k => k.kid === header.kid && k.kty === "RSA");
  if (!jwk) throw new Error("Google signing key unavailable");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromBase64Url(parts[2]).buffer as ArrayBuffer, encoder.encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error("Invalid Google signature");
  return { id: String(payload.sub), email: String(payload.email).toLowerCase(), name: String(payload.name || payload.email) };
}

export async function currentAccount(): Promise<Account | null> {
  const token = (await cookies()).get("tuition_session")?.value;
  if (!token) return null;
  const hash = await hashToken(token);
  const db = getDb();
  const session = await db.select().from(sessions).where(eq(sessions.tokenHash, hash)).get();
  if (!session || session.expiresAt <= new Date().toISOString()) return null;
  const account = await db.select().from(accounts).where(eq(accounts.id, session.accountId)).get() ?? null;
  return account && (account.disabledAt || pendingExpired(account)) ? null : account;
}

// Business routes cannot bypass the initial Google username/password setup.
// Profile, credential setup and account linking deliberately use currentAccount.
export async function currentBusinessAccount(): Promise<Account | null> {
  const account = await currentAccount();
  if (!account) return null;
  const db = getDb();
  const local = await db.select().from(localCredentials).where(eq(localCredentials.accountId, account.id)).get();
  if (local?.mustChangePassword) return null;
  if (!local && await db.select({ subject: googleIdentities.subject }).from(googleIdentities).where(eq(googleIdentities.accountId, account.id)).get()) return null;
  return account;
}

export async function createSession(accountId: string) {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  await getDb().insert(sessions).values({ tokenHash: await hashToken(token), accountId, expiresAt });
  return { token, expiresAt };
}
