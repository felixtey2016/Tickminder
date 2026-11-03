import type {Account} from './auth';
import {accountSessionPredicate} from './account-session';
import {authorityGuard} from './admin-authority';
import {adminPermissionPredicate, AdminPermissionDenied} from './admin-permission-access';
import {groupStatement, requireGroup} from './group-data';
import {learningDb} from './learning-server';
import {isOwnerAccount} from './owner';

export function workspaceActorPredicate(actor: Account) {
  const session = accountSessionPredicate(actor), owner = isOwnerAccount(actor) ? 1 : 0;
  return {sql: `EXISTS(SELECT 1 FROM accounts a JOIN tuition_groups g ON g.id=? AND (g.active=1 OR ?=1)
    WHERE a.id=? AND a.role=? AND a.email IS ? AND a.teacher_name IS ? AND a.student_name IS ?
    AND (a.group_id=? OR ?=1) AND a.disabled_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM local_credentials c WHERE c.account_id=a.id AND c.must_change_password=1)
    AND NOT(EXISTS(SELECT 1 FROM google_identities gi WHERE gi.account_id=a.id) AND NOT EXISTS(SELECT 1 FROM local_credentials c WHERE c.account_id=a.id))
    AND ${session.sql})`, args: [requireGroup(actor.groupId), owner, actor.id, actor.role, actor.email, actor.teacherName, actor.studentName, actor.groupId, owner, ...session.args]};
}
export async function assertWorkspaceActor(actor: Account) {
  if (!['admin', 'teacher', 'student'].includes(actor.role)) throw new AdminPermissionDenied();
  const predicate = workspaceActorPredicate(actor);
  if (!await learningDb().prepare(`SELECT 1 WHERE ${predicate.sql}`).bind(...predicate.args).first()) throw new AdminPermissionDenied();
}
/** The identity and optional any-of grant guard share the data statement's D1 snapshot. */
export function workspaceReader(actor: Account, anyGrants: readonly string[] = []) {
  const rows = async <T extends Record<string, unknown> = Record<string, unknown>>(query: string, ...args: unknown[]): Promise<T[]> => {
    const id = workspaceActorPredicate(actor), grants = actor.role === 'admin' ? anyGrants.map(key => adminPermissionPredicate(actor, key)) : [];
    const predicate = {sql: `(${id.sql})${grants.length ? ' AND (' + grants.map(grant => '(' + grant.sql + ')').join(' OR ') + ')' : ''}`, args: [...id.args, ...grants.flatMap(grant => grant.args)]};
    const result = await learningDb().batch<T>([authorityGuard(predicate, 'workspace_actor_changed'), groupStatement(actor.groupId, query).bind(...args)]);
    return result[1].results || [];
  };
  return {rows, first: async <T extends Record<string, unknown> = Record<string, unknown>>(query: string, ...args: unknown[]) => (await rows<T>(query, ...args))[0] || null};
}
