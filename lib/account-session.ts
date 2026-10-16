import type { Account } from "@/lib/auth";

// Authentication keeps the session binding off account JSON, audit snapshots and
// client props. Trusted internal callers without a session still use the normal
// live identity and organisation guards.
const sessions = new WeakMap<object, string>();
export function bindAccountSession<T extends object>(account: T, tokenHash: string): T {
  sessions.set(account, tokenHash);
  return account;
}
export function transferAccountSession<T extends object>(source: object, target: T): T {
  const tokenHash = sessions.get(source);
  if (tokenHash) sessions.set(target, tokenHash);
  return target;
}
export function accountSessionPredicate(account: Pick<Account, "id">): {sql: string; args: unknown[]} {
  const tokenHash = sessions.get(account);
  return tokenHash ? {
    sql: "EXISTS(SELECT 1 FROM main.sessions live_session WHERE live_session.account_id=? AND live_session.token_hash=? AND live_session.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    args: [account.id, tokenHash],
  } : {sql: "1", args: []};
}
