import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, localCredentials, loginAttempts, sessions } from "@/db/schema";
import { createSession, currentAccount, hashToken, verifyGoogleCredential } from "@/lib/auth";
import { normalizeUsername, validUsername, verifyPassword } from "@/lib/password";
import { isOwnerAccount, OWNER_EMAIL } from "@/lib/owner";

export async function GET() {
  const account = await currentAccount();
  const local = account ? await getDb().select({ username: localCredentials.username, mustChangePassword: localCredentials.mustChangePassword }).from(localCredentials).where(eq(localCredentials.accountId, account.id)).get() : null;
  return NextResponse.json({ account: account ? { id: account.id, email: account.email, name: account.name, nameConfirmedAt: account.nameConfirmedAt, role: account.role, isOwner: isOwnerAccount(account), teacherName: account.teacherName, studentName: account.studentName, username: local?.username || null, mustChangePassword: local?.mustChangePassword || false } : null, clientId: env.GOOGLE_CLIENT_ID || null });
}

export async function POST(request: Request) {
  if (new URL(request.url).origin !== request.headers.get("origin")) return NextResponse.json({ error: "Origin mismatch" }, { status: 403 });
  try {
    const body = await request.json() as { credential?: string; username?: string; password?: string };
    if (body.username !== undefined) {
      const username = normalizeUsername(body.username);
      if (!validUsername(username) || typeof body.password !== "string" || body.password.length > 128) return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
      const db = getDb();
      const now = new Date();
      const attempt = await db.select().from(loginAttempts).where(eq(loginAttempts.username, username)).get();
      if (attempt?.blockedUntil && Date.parse(attempt.blockedUntil) > now.getTime()) return NextResponse.json({ error: "尝试次数过多，请 15 分钟后再试，或联系管理员重置密码" }, { status: 429 });
      const credential = await db.select().from(localCredentials).where(eq(localCredentials.username, username)).get();
      const valid = credential && await verifyPassword(body.password, credential.passwordHash);
      if (!valid) {
        const failures = attempt && now.getTime() - Date.parse(attempt.windowStart) < 15 * 60_000 ? attempt.failures + 1 : 1;
        const next = { failures, windowStart: failures === 1 ? now.toISOString() : attempt!.windowStart, blockedUntil: failures >= 5 ? new Date(now.getTime() + 15 * 60_000).toISOString() : null };
        await db.insert(loginAttempts).values({ username, ...next }).onConflictDoUpdate({ target: loginAttempts.username, set: next });
        return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
      }
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
    const existing = await db.select().from(accounts).where(eq(accounts.id, profile.id)).get();
    const bootstrapAdmin = profile.email === OWNER_EMAIL;
    if (!existing) await db.insert(accounts).values({ id: profile.id, email: profile.email, name: profile.name, role: bootstrapAdmin ? "admin" : "pending", createdAt: new Date().toISOString() });
    else await db.update(accounts).set({ email: profile.email, role: bootstrapAdmin ? "admin" : existing.role }).where(eq(accounts.id, profile.id));
    const session = await createSession(profile.id);
    const response = NextResponse.json({ ok: true });
    response.cookies.set("tuition_session", session.token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: new Date(session.expiresAt) });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Login failed" }, { status: 400 });
  }
}

export async function DELETE() {
  const token = (await cookies()).get("tuition_session")?.value;
  if (token) await getDb().delete(sessions).where(eq(sessions.tokenHash, await hashToken(token)));
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("tuition_session");
  return response;
}
