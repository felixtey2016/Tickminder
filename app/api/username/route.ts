import {NextResponse} from 'next/server';
import {currentIdentity, type Account} from '@/lib/auth';
import {learningDb} from '@/lib/learning-server';
import {normalizeUsername, validUsername} from '@/lib/password';
import {accountSessionPredicate} from '@/lib/account-session';
import {authorityGuard} from '@/lib/admin-authority';
import {appendAudit} from '@/lib/audit-log';
import {DEFAULT_GROUP_ID} from '@/lib/group-data';

type Stored = {username: string; passwordHash: string; updatedAt: string};
class UsernameError extends Error {constructor(message: string, public status = 400) {super(message);}}
const json = (body: unknown, status = 200) => NextResponse.json(body, {status, headers: {'Cache-Control': 'private, no-store', Vary: 'Cookie'}});
function liveCredential(account: Account, before: Stored) {
  const session = accountSessionPredicate(account);
  return {
    sql: `EXISTS(SELECT 1 FROM accounts a JOIN local_credentials c ON c.account_id=a.id
      WHERE a.id=? AND a.group_id IS ? AND a.disabled_at IS NULL AND c.must_change_password=0
      AND c.username=? AND c.password_hash=? AND c.updated_at=?
      AND (a.role<>'pending' OR a.activated_at IS NOT NULL OR coalesce(a.teacher_name,'')<>''
        OR coalesce(a.student_name,'')<>'' OR a.pending_expires_at IS NULL
        OR a.pending_expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) AND (${session.sql}))`,
    args: [account.id, account.groupId, before.username, before.passwordHash, before.updatedAt, ...session.args],
  };
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({error: '请求来源无效'}, 403);
  try {
    const identity = await currentIdentity();
    if (!identity) throw new UsernameError('登录已过期，请重新登录', 401);
    if (!identity.local) throw new UsernameError('请先设置用户名与密码', 403);
    if (identity.local.mustChangePassword) throw new UsernameError('请先修改初始密码', 403);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
      || Number(request.headers.get('content-length') || 0) > 2048) throw new UsernameError('用户名资料格式无效');
    const raw = await request.text();
    if (raw.length > 2048) throw new UsernameError('用户名资料格式无效');
    let body: unknown;
    try {body = JSON.parse(raw);} catch {throw new UsernameError('用户名资料格式无效');}
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'username')) throw new UsernameError('用户名资料格式无效');
    const username = normalizeUsername((body as Record<string, unknown>).username);
    if (!validUsername(username)) throw new UsernameError('账号需为 3–40 位英文字母、数字、点、横线或底线，且以字母或数字开头');

    const account = identity.account, db = learningDb();
    const before = await db.prepare('SELECT username,password_hash AS passwordHash,updated_at AS updatedAt FROM local_credentials WHERE account_id=?')
      .bind(account.id).first<Stored>();
    if (!before) throw new UsernameError('账号资料已改变，请刷新后重试', 409);
    const guard = authorityGuard(liveCredential(account, before), 'account_username_changed');
    // A normalized unchanged username is an idempotent success, without a write or audit event.
    if (username === before.username) {await db.batch([guard]); return json({ok: true, username, changed: false});}
    const now = new Date().toISOString();
    await db.batch([
      guard,
      // New credentials are normalized; this additionally protects legacy mixed-case names.
      // The check and write share D1's transaction, and its UNIQUE index handles insert races.
      authorityGuard({sql: 'NOT EXISTS(SELECT 1 FROM local_credentials WHERE lower(trim(username))=? AND account_id<>?)', args: [username, account.id]}, 'account_username_unavailable'),
      db.prepare('UPDATE local_credentials SET username=?,updated_at=? WHERE account_id=?').bind(username, now, account.id),
      appendAudit(db, {groupId: account.groupId || DEFAULT_GROUP_ID, lessonId: 'account:' + account.id,
        actorId: account.id, actorName: account.name, action: 'accountUsername.update',
        before: {username: before.username}, after: {username}, at: now}),
    ]);
    // Account IDs, passwords, Google links and existing sessions are deliberately unchanged.
    return json({ok: true, username, changed: true});
  } catch (error) {
    if (error instanceof UsernameError) return json({error: error.message}, error.status);
    if (/account_username_unavailable|UNIQUE constraint/i.test(String(error))) return json({error: '此账号名已被使用，请选择其他用户名'}, 409);
    if (/account_username_changed/.test(String(error))) return json({error: '账号资料已改变，请刷新后重试'}, 409);
    return json({error: '用户名暂时无法保存，请稍后重试'}, 503);
  }
}
