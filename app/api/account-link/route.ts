import { NextResponse } from "next/server";
import { currentAccount, verifyGoogleCredential } from "@/lib/auth";
import { first, learningDb } from "@/lib/learning-server";
import { verifyPassword } from "@/lib/password";
import { OWNER_EMAIL } from "@/lib/owner";
import { prepareAccountMerge } from "@/lib/account-merge";

class LinkError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "没有权限执行此操作" }, { status: 403 });
  const actor = await currentAccount();
  if (!actor) return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
  try {
    const data = await request.json() as Record<string, unknown>;
    const local = await first<{ password_hash: string; must_change_password: number }>("SELECT password_hash,must_change_password FROM local_credentials WHERE account_id = ?", actor.id);
    if (!local || local.must_change_password) throw new LinkError("请先使用密码账号登录并修改初始密码", 403);
    const attemptKey = `link:${actor.id}`;
    const attempt = await first<{ failures: number; window_start: string; blocked_until: string | null }>("SELECT * FROM login_attempts WHERE username = ?", attemptKey);
    if (attempt?.blocked_until && Date.parse(attempt.blocked_until) > Date.now()) throw new LinkError("尝试次数过多，请 15 分钟后再试，或联系管理员重置密码", 429);
    if (typeof data.password !== "string" || data.password.length > 128 || !await verifyPassword(data.password, local.password_hash)) {
      const now = new Date(), recent = attempt && now.getTime() - Date.parse(attempt.window_start) < 15 * 60_000;
      const failures = recent ? attempt.failures + 1 : 1;
      await learningDb().prepare("INSERT INTO login_attempts (username,failures,window_start,blocked_until) VALUES (?,?,?,?) ON CONFLICT(username) DO UPDATE SET failures=excluded.failures,window_start=excluded.window_start,blocked_until=excluded.blocked_until").bind(attemptKey, failures, recent ? attempt.window_start : now.toISOString(), failures >= 5 ? new Date(now.getTime() + 15 * 60_000).toISOString() : null).run();
      throw new LinkError("当前密码错误", 403);
    }
    if (typeof data.credential !== "string") throw new LinkError("Google 登录资料缺失");
    const profile = await verifyGoogleCredential(data.credential);
    if (profile.email === OWNER_EMAIL && actor.email !== OWNER_EMAIL) throw new LinkError("最高管理员的 Google 账号不能绑定到其他账号", 403);
    const own = await first<{ subject: string }>("SELECT subject FROM google_identities WHERE account_id = ?", actor.id);
    if (own && own.subject !== profile.id) throw new LinkError("此账号已连接另一个 Google 账号", 409);
    const used = await first<{ account_id: string }>("SELECT account_id FROM google_identities WHERE subject = ?", profile.id);
    const merge = used && used.account_id !== actor.id ? await prepareAccountMerge(actor, used.account_id, data.confirmMerge === true) : { statements: [] };
    if (merge.error) return NextResponse.json({ error: merge.error, mergeName: merge.mergeName }, { status: 409 });
    const db = learningDb(), now = new Date().toISOString();
    await db.batch([
      ...merge.statements,
      // Strict unique insert makes concurrent linking attempts fail and roll back together.
      own ? db.prepare("UPDATE google_identities SET email = ? WHERE subject = ? AND account_id = ?").bind(profile.email, profile.id, actor.id)
        : db.prepare("INSERT INTO google_identities (subject,account_id,email,linked_at) VALUES (?,?,?,?)").bind(profile.id, actor.id, profile.email, now),
      db.prepare("UPDATE accounts SET email = ? WHERE id = ?").bind(profile.email, actor.id),
      db.prepare("DELETE FROM login_attempts WHERE username = ?").bind(attemptKey),
      db.prepare("INSERT INTO audit (id,lesson_id,actor_id,action,at) VALUES (?,?,?,'linkGoogle',?)").bind(crypto.randomUUID(), `account:${actor.id}`, actor.id, now),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof LinkError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Google 连接失败，请重新验证后再试" }, { status: 400 });
  }
}
