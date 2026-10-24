import { NextResponse } from "next/server";
import { currentIdentity } from "@/lib/auth";
import { accountSessionPredicate } from "@/lib/account-session";
import { first, learningDb } from "@/lib/learning-server";
import { GOOGLE_LINK_PROMPT_SKIPPED, googleLinkOnboardingEligible } from "@/lib/google-link-onboarding";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "没有权限执行此操作" }, { status: 403 });
  const identity = await currentIdentity();
  if (!identity) return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
  let body: { decision?: unknown } | null;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  if (!body || body.decision !== "skip") return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  const { account, local, google } = identity;
  if (!googleLinkOnboardingEligible(account, local, google)) return NextResponse.json({ error: "请先完成账号设置" }, { status: 403 });
  const session = accountSessionPredicate(account);
  // One account-scoped acknowledgement persists across browsers and devices.
  // Keep it in the existing audit trail; no profile/schema migration is needed.
  const result = await learningDb().prepare(`INSERT INTO audit (group_id,id,lesson_id,actor_id,action,at)
    SELECT a.group_id,?,?,a.id,?,? FROM accounts a
    JOIN tuition_groups g ON g.id=a.group_id AND g.active=1
    JOIN local_credentials c ON c.account_id=a.id AND c.must_change_password=0
    WHERE a.id=? AND a.group_id=? AND a.disabled_at IS NULL
      AND a.activation_reason='admin-created' AND a.name_confirmed_at IS NOT NULL
      AND a.role IN ('admin','teacher','student','parent')
      AND NOT EXISTS(SELECT 1 FROM google_identities gi WHERE gi.account_id=a.id)
      AND NOT EXISTS(SELECT 1 FROM audit previous WHERE previous.group_id=a.group_id
        AND previous.actor_id=a.id AND previous.lesson_id=? AND previous.action=?)
      AND (${session.sql})`)
    .bind(crypto.randomUUID(), `account:${account.id}`, GOOGLE_LINK_PROMPT_SKIPPED, new Date().toISOString(),
      account.id, account.groupId, `account:${account.id}`, GOOGLE_LINK_PROMPT_SKIPPED, ...session.args).run();
  if (!result.meta.changes && !await first("SELECT 1 AS found FROM audit WHERE group_id=? AND actor_id=? AND lesson_id=? AND action=?", account.groupId, account.id, `account:${account.id}`, GOOGLE_LINK_PROMPT_SKIPPED)) {
    return NextResponse.json({ error: "账号状态已改变，请刷新后重试" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
