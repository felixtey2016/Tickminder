import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, googleIdentities, localCredentials, loginAttempts, sessions } from "@/db/schema";
import { createSession, currentAccount, hashToken, verifyGoogleCredential } from "@/lib/auth";
import { normalizeUsername, validUsername, verifyPassword } from "@/lib/password";
import { isOwnerAccount, OWNER_EMAIL } from "@/lib/owner";
import { lifecycleView, pendingDeadline, pendingExpired } from "@/lib/account-lifecycle";
import { first, rows } from "@/lib/learning-server";

export async function GET() {
  const account = await currentAccount();
  const local = account ? await getDb().select({ username: localCredentials.username, mustChangePassword: localCredentials.mustChangePassword }).from(localCredentials).where(eq(localCredentials.accountId, account.id)).get() : null;
  const google = account ? await first<{email:string}>("SELECT email FROM google_identities WHERE account_id = ?", account.id) : null;
  return NextResponse.json({ account: account ? { id: account.id, email: google?.email || account.email, name: account.name, nameConfirmedAt: account.nameConfirmedAt, role: account.role, isOwner: isOwnerAccount(account), teacherName: account.teacherName, studentName: account.studentName, googleLinked: Boolean(google), emailLoginAvailable: Boolean(google && local), requiresAccountSetup: Boolean(google && !local), username: local?.username || null, mustChangePassword: local?.mustChangePassword || false, ...lifecycleView(account) } : null, clientId: env.GOOGLE_CLIENT_ID || null });
}

export async function POST(request: Request) {
  if (new URL(request.url).origin !== request.headers.get("origin")) return NextResponse.json({ error: "Origin mismatch" }, { status: 403 });
  try {
    const body = await request.json() as { credential?: string; username?: string; password?: string };
    if (body.username !== undefined) {
      const identifier = normalizeUsername(body.username);
      const emailLogin = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier) && identifier.length <= 254;
      if ((!emailLogin && !validUsername(identifier)) || typeof body.password !== "string" || body.password.length > 128) return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
      const db = getDb();
      const now = new Date();
      // Only verified Google identities can be used for email login. Ambiguous
      // legacy emails are refused; names/emails never silently merge accounts.
      const matches = emailLogin ? await rows<{accountId:string; username:string; passwordHash:string}>("SELECT c.account_id AS accountId,c.username,c.password_hash AS passwordHash FROM local_credentials c JOIN google_identities g ON g.account_id = c.account_id WHERE lower(g.email) = ? LIMIT 2", identifier) : [];
      const credential = emailLogin ? (matches.length === 1 ? matches[0] : null) : await db.select().from(localCredentials).where(eq(localCredentials.username, identifier)).get();
      const username = credential?.username || identifier;
      const attempt = await db.select().from(loginAttempts).where(eq(loginAttempts.username, username)).get();
      if (attempt?.blockedUntil && Date.parse(attempt.blockedUntil) > now.getTime()) return NextResponse.json({ error: "尝试次数过多，请 15 分钟后再试，或联系管理员重置密码" }, { status: 429 });
      const valid = credential && await verifyPassword(body.password, credential.passwordHash);
      if (!valid) {
        const failures = attempt && now.getTime() - Date.parse(attempt.windowStart) < 15 * 60_000 ? attempt.failures + 1 : 1;
        const next = { failures, windowStart: failures === 1 ? now.toISOString() : attempt!.windowStart, blockedUntil: failures >= 5 ? new Date(now.getTime() + 15 * 60_000).toISOString() : null };
        await db.insert(loginAttempts).values({ username, ...next }).onConflictDoUpdate({ target: loginAttempts.username, set: next });
        return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
      }
      const loginAccount = await db.select().from(accounts).where(eq(accounts.id, credential.accountId)).get();
      if (!loginAccount || loginAccount.disabledAt) return NextResponse.json({ error: "账号已停用，请联系管理员" }, { status: 403 });
      if (pendingExpired(loginAccount)) return NextResponse.json({ error: "待分配账号已到期，请联系管理员" }, { status: 403 });
      await db.delete(loginAttempts).where(eq(loginAttempts.username, username));
      const session = await createSession(credential.accountId);
      const response = NextResponse.json({ ok: true });
      response.cookies.set("tuition_session", session.token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: new Date(session.expiresAt) });
      return response;
    }
    const { credential } = body;
    if (!credential) return NextResponse.json({ error: "Google 登录资料缺失" }, { status: 400 });
    const profile = await verifyGoogleCredential(credential);
    const db = getDb();
    const identity = await db.select().from(googleIdentities).where(eq(googleIdentities.subject, profile.id)).get();
    const accountId = identity?.accountId || profile.id;
    const existing = await db.select().from(accounts).where(eq(accounts.id, accountId)).get();
    if (existing?.disabledAt) return NextResponse.json({ error: "账号已停用，请联系管理员" }, { status: 403 });
    if (existing && pendingExpired(existing)) return NextResponse.json({ error: "待分配账号已到期，请联系管理员" }, { status: 403 });
    const bootstrapAdmin = profile.email === OWNER_EMAIL;
    const now = new Date().toISOString();
    if (!existing) await db.batch([
      db.insert(accounts).values({ id: profile.id, email: profile.email, name: profile.name, role: bootstrapAdmin ? "admin" : "pending", createdAt: now, pendingExpiresAt: bootstrapAdmin ? null : pendingDeadline(new Date(now)), activatedAt: bootstrapAdmin ? now : null, activationReason: bootstrapAdmin ? "owner" : null }).onConflictDoNothing(),
      db.insert(googleIdentities).values({ subject: profile.id, accountId, email: profile.email, linkedAt: now }).onConflictDoNothing(),
    ]);
    else await db.batch([
      db.update(accounts).set({ email: profile.email, ...(bootstrapAdmin ? {role:"admin", activatedAt: existing.activatedAt || now, activationReason: existing.activationReason || "owner", pendingExpiresAt:null} : {}) }).where(eq(accounts.id, accountId)),
      db.insert(googleIdentities).values({ subject: profile.id, accountId, email: profile.email, linkedAt: now }).onConflictDoUpdate({target:googleIdentities.subject,set:{email:profile.email}}),
    ]);
    // Resolve identity again after a concurrent link or first registration.
    const canonical = await first<{id:string;disabledAt:string|null;role:string;pendingExpiresAt:string|null;activatedAt:string|null;teacherName:string|null;studentName:string|null}>("SELECT a.id,a.disabled_at AS disabledAt,a.role,a.pending_expires_at AS pendingExpiresAt,a.activated_at AS activatedAt,a.teacher_name AS teacherName,a.student_name AS studentName FROM accounts a JOIN google_identities g ON g.account_id = a.id WHERE g.subject = ?", profile.id);
    if (!canonical || canonical.disabledAt || pendingExpired(canonical)) return NextResponse.json({error:"账号暂时不可用，请联系管理员"},{status:403});
    const session = await createSession(canonical.id);
    const response = NextResponse.json({ ok: true });
    response.cookies.set("tuition_session", session.token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: new Date(session.expiresAt) });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: /无法连接 Google 登录验证服务/.test(message) ? message : /Google login is not configured/.test(message) ? "Google 登录尚未配置" : /Invalid Google|Google signing key unavailable|Google key lookup failed/.test(message) ? "Google 登录验证失败，请重试" : "登录失败，请稍后重试" }, { status: 400 });
  }
}

export async function DELETE() {
  const token = (await cookies()).get("tuition_session")?.value;
  if (token) await getDb().delete(sessions).where(eq(sessions.tokenHash, await hashToken(token)));
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("tuition_session");
  return response;
}
