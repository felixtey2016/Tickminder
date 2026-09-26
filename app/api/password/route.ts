import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { localCredentials, sessions } from "@/db/schema";
import { createSession, currentAccount } from "@/lib/auth";
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
  await db.update(localCredentials).set({ passwordHash, mustChangePassword: false, updatedAt: new Date().toISOString() }).where(eq(localCredentials.accountId, account.id));
  await db.delete(sessions).where(eq(sessions.accountId, account.id));
  const session = await createSession(account.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("tuition_session", session.token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: new Date(session.expiresAt) });
  return response;
}
