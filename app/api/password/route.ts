import { NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { localCredentials } from "@/db/schema";
import { StaleSessionCredentialError, createSession, currentAccount } from "@/lib/auth";
import { accountSessionPredicate } from "@/lib/account-session";
import { hashPassword, validPassword, verifyPassword } from "@/lib/password";

export async function POST(request: Request) {
  if (new URL(request.url).origin !== request.headers.get("origin")) return NextResponse.json({ error: "Origin mismatch" }, { status: 403 });
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  let body: { currentPassword?: unknown; newPassword?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  if (typeof body.currentPassword !== "string" || !validPassword(body.newPassword)) return NextResponse.json({ error: "新密码需为 8–128 个字符" }, { status: 400 });
  const db = getDb();
  const local = await db.select().from(localCredentials).where(eq(localCredentials.accountId, account.id)).get();
  if (!local || !await verifyPassword(body.currentPassword, local.passwordHash)) return NextResponse.json({ error: "当前密码错误" }, { status: 403 });
  if (await verifyPassword(body.newPassword, local.passwordHash)) return NextResponse.json({ error: "新密码不能与当前密码相同" }, { status: 400 });
  const passwordHash = await hashPassword(body.newPassword);
  const authority = accountSessionPredicate(account), database = env.DB;
  if (!database) throw new Error("Database is not configured");
  // Recheck the credential and the authenticated session at the actual write.
  // A recovery/reset/logout while hashing must invalidate this older request.
  const result = await database.batch([
    database.prepare(`UPDATE local_credentials SET password_hash=?,must_change_password=0,updated_at=?
      WHERE account_id=? AND password_hash=? AND ${authority.sql}
      AND EXISTS(SELECT 1 FROM accounts a WHERE a.id=local_credentials.account_id AND a.disabled_at IS NULL
      AND NOT(a.role='pending' AND COALESCE(a.activated_at,'')='' AND COALESCE(a.teacher_name,'')='' AND COALESCE(a.student_name,'')='' AND COALESCE(a.pending_expires_at,'')<>'' AND a.pending_expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')))`)
      .bind(passwordHash, new Date().toISOString(), account.id, local.passwordHash, ...authority.args),
    database.prepare("DELETE FROM sessions WHERE account_id=? AND EXISTS(SELECT 1 FROM local_credentials WHERE account_id=? AND password_hash=?)")
      .bind(account.id, account.id, passwordHash),
  ]);
  const stale = () => NextResponse.json({ error: "账号状态或密码已改变，请重新登录后再试。" }, { status: 409, headers: { "Cache-Control": "no-store" } });
  if (result[0].meta.changes !== 1) return stale();
  let session;
  try { session = await createSession(account.id, request, passwordHash); }
  catch (error) { if (error instanceof StaleSessionCredentialError) return stale(); throw error; }
  const response = NextResponse.json({ ok: true });
  response.cookies.set("tuition_session", session.token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: new Date(session.expiresAt) });
  return response;
}
