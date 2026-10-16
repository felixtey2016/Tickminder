import type { Account } from "@/lib/auth";
import { learningDb } from "@/lib/learning-server";
import { OWNER_EMAIL } from "@/lib/owner";
import { requireGroup } from "@/lib/group-data";

type Predicate = { sql: string; args: unknown[] };
export type AccountManagementAction = "resetLocalPassword" | "activateAccount" | "bind" | "deleteAccount" | "restoreAccount" | "permanentDelete";
export type AccountAuthorityOptions = { action: AccountManagementAction; nextRole?: string; expected?: Pick<Account, "role" | "disabledAt" | "teacherName" | "studentName"> };
export class AdminAuthorityError extends Error {
  constructor(message = "admin.authorityChanged", public status = 409) { super(message); }
}

// Always inspect the current database identity. A request may have authenticated
// just before a handover, account disable, role change, or initial-password reset.
const ownerSql = (alias: string) => `${alias}.role='admin' AND lower(trim(${alias}.email))=? AND substr(${alias}.id,1,6)<>'local:'`;
function actorPredicate(actor: Account, groupId: string, administrators = false, ownerOnly = false): Predicate {
  const owner = ownerSql("a");
  return {
    sql: `EXISTS(SELECT 1 FROM accounts a JOIN tuition_groups g ON g.id=? WHERE a.id=? AND a.disabled_at IS NULL AND a.role='admin'
      AND NOT EXISTS(SELECT 1 FROM local_credentials c WHERE c.account_id=a.id AND c.must_change_password=1)
      AND ((${owner})${ownerOnly ? "" : ` OR (a.group_id=g.id AND g.active=1${administrators ? " AND g.chief_admin_id=a.id" : ""})`}))`,
    args: [groupId, actor.id, OWNER_EMAIL],
  };
}

// A bad JSON path gives this guard its own recognizable SQLite error. D1 batch
// rolls every mutation and audit back if any guard fails; no schema sentinels or
// success audit rows are committed for a denied/stale request.
export function authorityGuard(predicate: Predicate, reason = "admin_authority_changed") {
  return learningDb().prepare(`SELECT CASE WHEN ${predicate.sql} THEN 1 ELSE json_extract('[]', '$[${reason}') END AS admin_authority_guard`).bind(...predicate.args);
}
export function isAdminAuthorityFailure(error: unknown) { return /admin_authority_changed|admin_chief_changed/.test(String(error)); }
export function adminActorGuard(actor: Account, administrators = false, ownerOnly = false) {
  return authorityGuard(actorPredicate(actor, requireGroup(actor.groupId), administrators, ownerOnly));
}
export function ownerAuthorityGuard(actor: Account, groupId: string) {
  return authorityGuard(actorPredicate(actor, requireGroup(groupId), false, true));
}

export async function adminAuthority(actor: Account, groupId = actor.groupId) {
  if (!groupId) return { chiefAdminId: null, isGroupChief: false, canManageAdministrators: false };
  const managers = actorPredicate(actor, groupId, true);
  const row = await learningDb().prepare(`SELECT g.chief_admin_id AS chiefAdminId,
    CASE WHEN g.chief_admin_id=? AND EXISTS(SELECT 1 FROM accounts a WHERE a.id=? AND a.group_id=g.id AND a.role='admin' AND a.disabled_at IS NULL) THEN 1 ELSE 0 END AS isGroupChief,
    CASE WHEN ${managers.sql} THEN 1 ELSE 0 END AS canManageAdministrators FROM tuition_groups g WHERE g.id=?`)
    .bind(actor.id, actor.id, ...managers.args, groupId).first<{chiefAdminId: string | null; isGroupChief: number; canManageAdministrators: number}>();
  return { chiefAdminId: row?.chiefAdminId || null, isGroupChief: Boolean(row?.isGroupChief), canManageAdministrators: Boolean(row?.canManageAdministrators) };
}

function accountPredicate(actor: Account, targetId: string, options: AccountAuthorityOptions): Predicate {
  const groupId = requireGroup(actor.groupId), normal = actorPredicate(actor, groupId), managers = actorPredicate(actor, groupId, true);
  const owner = actorPredicate(actor, groupId, false, true);
  const removesChief = options.action === "deleteAccount" || options.action === "permanentDelete" || options.action === "bind" && options.nextRole !== "admin";
  const needsManager = options.action === "bind" && options.nextRole === "admin" ? "1" : "t.role='admin'";
  const activeTarget = ["bind", "resetLocalPassword", "activateAccount"].includes(options.action) ? " AND t.disabled_at IS NULL" : "";
  return {
    sql: `${normal.sql} AND EXISTS(SELECT 1 FROM accounts t JOIN tuition_groups g ON g.id=t.group_id WHERE t.id=? AND t.group_id=?
      AND NOT(lower(trim(t.email))=? AND substr(t.id,1,6)<>'local:')
      ${options.action === "activateAccount" ? "" : "AND t.id<>?"}${activeTarget}
      ${options.expected ? "AND t.role=? AND t.disabled_at IS ? AND t.teacher_name IS ? AND t.student_name IS ?" : ""}
      AND (NOT(${needsManager}) OR ${managers.sql})
      ${removesChief ? "AND g.chief_admin_id IS NOT t.id" : ""}
      ${options.action === "resetLocalPassword" ? `AND (g.chief_admin_id IS NOT t.id OR ${owner.sql}) AND EXISTS(SELECT 1 FROM local_credentials c WHERE c.account_id=t.id)` : ""})`,
    args: [...normal.args, targetId, groupId, OWNER_EMAIL, ...(options.action === "activateAccount" ? [] : [actor.id]), ...(options.expected ? [options.expected.role, options.expected.disabledAt, options.expected.teacherName, options.expected.studentName] : []), ...managers.args, ...(options.action === "resetLocalPassword" ? owner.args : [])],
  };
}
export function accountAuthorityGuard(actor: Account, targetId: string, options: AccountAuthorityOptions) {
  return authorityGuard(accountPredicate(actor, targetId, options));
}
export async function assertAccountAuthority(actor: Account, targetId: string, options: AccountAuthorityOptions) {
  const predicate = accountPredicate(actor, targetId, options);
  if (await learningDb().prepare(`SELECT 1 AS allowed WHERE ${predicate.sql}`).bind(...predicate.args).first()) return;
  const target = await learningDb().prepare("SELECT t.id,t.email,t.role,g.chief_admin_id AS chiefAdminId FROM accounts t JOIN tuition_groups g ON g.id=t.group_id WHERE t.id=? AND t.group_id=?").bind(targetId, actor.groupId).first<{id: string; email: string; role: string; chiefAdminId: string | null}>();
  if (target && target.email.trim().toLowerCase() === OWNER_EMAIL && !target.id.startsWith("local:")) throw new AdminAuthorityError("admin.ownerProtected", 403);
  if (target?.id === actor.id && options.action !== "activateAccount") throw new AdminAuthorityError("admin.selfProtected", 403);
  if (target?.chiefAdminId === targetId && (options.action === "deleteAccount" || options.action === "permanentDelete" || options.action === "bind" && options.nextRole !== "admin")) throw new AdminAuthorityError("admin.chiefProtected", 403);
  if (target?.role === "admin" || options.nextRole === "admin") throw new AdminAuthorityError("admin.administratorAccessRequired", 403);
  throw new AdminAuthorityError();
}
