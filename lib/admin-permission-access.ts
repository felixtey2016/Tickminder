import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import type { Account } from "@/lib/auth";
import { learningDb } from "@/lib/learning-server";
import { requireGroup } from "@/lib/group-data";
import { OWNER_EMAIL } from "@/lib/owner";
import { configuredAdminGrantGuard, configuredAdminGrantPredicate } from "@/lib/admin-permissions-server";
import { LEGACY_ADMIN_GRANTS, hasAdminGrant, normalizeAdminGrants, type AdminGrantKey } from "@/lib/admin-permissions";
import { accountSessionPredicate } from "@/lib/account-session";

export type AdminPermissionContext = { enforced: boolean; grants: AdminGrantKey[]; privileged: boolean };
// A deployment can retain preparation mode during staged rollout or recovery.
export function adminPermissionsEnforced() { return env.ADMIN_PERMISSIONS_MODE === "enforced"; }
export class AdminPermissionDenied extends Error {
  readonly status = 403;
  constructor() { super("没有权限执行此操作"); }
}
export function adminPermissionFailure(error: unknown): {error: string; status: number} | null {
  if (error instanceof AdminPermissionDenied || /admin_permissions_(authority|revision|target)_changed/.test(String(error))) return {error: "没有权限执行此操作", status: 403};
  return null;
}
export async function adminPermissionContext(account: Pick<Account,"id"|"role"|"groupId">): Promise<AdminPermissionContext> {
  const enforced = adminPermissionsEnforced();
  if (account.role !== "admin") return {enforced: false, grants: [], privileged: false};
  if (!enforced) return {enforced, grants: [...LEGACY_ADMIN_GRANTS], privileged: false};
  const groupId = requireGroup(account.groupId);
  const session = accountSessionPredicate(account);
  const row = await learningDb().prepare(`SELECT
    CASE WHEN lower(trim(a.email))=? AND substr(a.id,1,6)<>'local:' OR a.group_id=g.id AND g.active=1 AND g.chief_admin_id=a.id THEN 1 ELSE 0 END AS privileged,
    p.grants_json AS grantsJson
    FROM accounts a JOIN tuition_groups g ON g.id=?
    LEFT JOIN admin_permission_profiles p ON p.group_id=g.id AND p.account_id=a.id
    WHERE a.id=? AND a.role='admin' AND a.disabled_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM local_credentials c WHERE c.account_id=a.id AND c.must_change_password=1)
    AND (lower(trim(a.email))=? AND substr(a.id,1,6)<>'local:' OR a.group_id=g.id AND g.active=1) AND ${session.sql}`)
    .bind(OWNER_EMAIL,groupId,account.id,OWNER_EMAIL,...session.args).first<{privileged:number;grantsJson:string|null}>();
  if (!row) return {enforced,grants:[],privileged:false};
  if (row.privileged) return {enforced,grants:[...LEGACY_ADMIN_GRANTS],privileged:true};
  let grants: AdminGrantKey[] = [];
  try {
    const stored: unknown = JSON.parse(row.grantsJson || "[]"), normalized = normalizeAdminGrants(stored);
    if (Array.isArray(stored) && new Set(stored).size === stored.length && stored.length === normalized.length && stored.every(key=>normalized.includes(key))) grants = normalized;
  } catch { /* Invalid, missing or incomplete stored profiles deny access. */ }
  return {enforced,grants,privileged:false};
}
// These checks are an additional restriction on administrators. Every caller
// retains its existing role, tenant, identity and content ownership conditions.
export async function hasAdminPermission(account: Account, key: string) {
  if (!hasAdminGrant(LEGACY_ADMIN_GRANTS,key)) return false;
  if (account.role !== "admin" || !adminPermissionsEnforced()) return true;
  const predicate = configuredAdminGrantPredicate(account,key);
  return Boolean(await learningDb().prepare(`SELECT 1 AS allowed WHERE ${predicate.sql}`).bind(...predicate.args).first());
}
export async function requireAdminPermission(account: Account, key: string) {
  if (!await hasAdminPermission(account,key)) throw new AdminPermissionDenied();
}
export function adminPermissionStatements(account: Account, key: string): D1PreparedStatement[] {
  return account.role === "admin" && adminPermissionsEnforced() ? [configuredAdminGrantGuard(account,key)] : [];
}
export function adminPermissionPredicate(account: Account, key: string): {sql: string; args: unknown[]} {
  if (!hasAdminGrant(LEGACY_ADMIN_GRANTS,key)) return {sql:"0",args:[]};
  return account.role === "admin" && adminPermissionsEnforced() ? configuredAdminGrantPredicate(account,key) : {sql:"1",args:[]};
}
export function adminPermissionReadCondition(account: Account, key: string) {
  const predicate=adminPermissionPredicate(account,key),parts=predicate.sql.split("?");
  if(parts.length!==predicate.args.length+1)throw new Error("Invalid permission predicate");
  return sql.join(parts.flatMap((part,index)=>index<predicate.args.length?[sql.raw(part),sql`${predicate.args[index]}`]:[sql.raw(part)]),sql.raw(""));
}
