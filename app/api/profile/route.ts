import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, audit, localCredentials } from "@/db/schema";
import { currentAccount } from "@/lib/auth";

export async function POST(request: Request) {
  if (new URL(request.url).origin !== request.headers.get("origin"))
    return NextResponse.json({ error: "Origin mismatch" }, { status: 403 });
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const credential = await getDb().select({ mustChangePassword: localCredentials.mustChangePassword })
    .from(localCredentials).where(eq(localCredentials.accountId, account.id)).get();
  if (credential?.mustChangePassword) return NextResponse.json({ error: "请先修改初始密码" }, { status: 403 });
  let body: { name?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "请输入姓名" }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 80 || /[\p{Cc}\p{Cf}]/u.test(name))
    return NextResponse.json({ error: "请输入不超过 80 个字符的姓名" }, { status: 400 });
  const now = new Date().toISOString();
  await getDb().update(accounts).set({ name, nameConfirmedAt: now }).where(eq(accounts.id, account.id));
  await getDb().insert(audit).values({ id: crypto.randomUUID(), lessonId: `account:${account.id}`, actorId: account.id, action: "confirmName", before: JSON.stringify({ name: account.name }), after: JSON.stringify({ name }), at: now });
  return NextResponse.json({ ok: true, name });
}
