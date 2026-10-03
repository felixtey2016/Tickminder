import { NextResponse } from "next/server";
import { currentAccount, createSession } from "@/lib/auth";
import { first, learningDb } from "@/lib/learning-server";
import { hashPassword, normalizeUsername, validPassword, validUsername } from "@/lib/password";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({error:"没有权限执行此操作"},{status:403});
  const account = await currentAccount();
  if (!account) return NextResponse.json({error:"登录已过期，请重新登录"},{status:401});
  try {
    const body = await request.json() as Record<string,unknown>;
    const username = normalizeUsername(body.username);
    if (!validUsername(username)) return NextResponse.json({error:"账号需为 3–40 位英文字母、数字、点、横线或底线，且以字母或数字开头"},{status:400});
    if (!validPassword(body.password)) return NextResponse.json({error:"新密码需为 8–128 个字符"},{status:400});
    if (!await first("SELECT 1 AS found FROM google_identities WHERE account_id = ?", account.id)) return NextResponse.json({error:"请先使用已验证的 Google 账号登录"},{status:403});
    if (await first("SELECT 1 AS found FROM local_credentials WHERE account_id = ?", account.id)) return NextResponse.json({error:"此账号已设置密码，请使用修改密码功能"},{status:409});
    const db = learningDb();
    const passwordHash = await hashPassword(body.password);
    const now = new Date().toISOString();
    // Both account and username uniqueness are enforced by SQLite, including races.
    await db.batch([
      db.prepare("INSERT INTO local_credentials (account_id,username,password_hash,must_change_password,updated_at) SELECT id,?,?,0,? FROM accounts WHERE id = ? AND disabled_at IS NULL AND (activated_at IS NOT NULL OR role <> 'pending' OR pending_expires_at IS NULL OR pending_expires_at > ?)").bind(username,passwordHash,now,account.id,now),
      db.prepare("DELETE FROM sessions WHERE account_id = ?").bind(account.id),
      db.prepare("INSERT INTO audit (id,lesson_id,actor_id,action,at) VALUES (?,?,?,'setupCredentials',?)").bind(crypto.randomUUID(),`account:${account.id}`,account.id,now),
    ]);
    const saved = await first("SELECT 1 AS found FROM local_credentials WHERE account_id = ? AND username = ?",account.id,username);
    if (!saved) return NextResponse.json({error:"账号暂时不可用，请重新登录"},{status:409});
    const session = await createSession(account.id);
    const response = NextResponse.json({ok:true});
    response.cookies.set("tuition_session",session.token,{httpOnly:true,secure:true,sameSite:"lax",path:"/",expires:new Date(session.expiresAt)});
    return response;
  } catch(error) {
    const duplicate = /UNIQUE constraint|unique constraint/i.test(error instanceof Error ? error.message : "");
    return NextResponse.json({error:duplicate ? "此账号名已被使用，请选择其他用户名" : "账号设置未完成，请重新登录后重试"},{status:duplicate ? 409 : 400});
  }
}
