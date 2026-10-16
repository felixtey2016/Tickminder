import type { Account } from "@/lib/auth";
import { adminActorGuard, adminAuthority, authorityGuard, isAdminAuthorityFailure } from "@/lib/admin-authority";
import { learningDb } from "@/lib/learning-server";
import { requireGroup } from "@/lib/group-data";
import { isOwnerAccount, OWNER_EMAIL } from "@/lib/owner";
import { ADMIN_PERMISSION_CATALOG, ADMIN_PERMISSION_TEMPLATES, ADMIN_PERMISSIONS_ROLLOUT, LEGACY_ADMIN_GRANTS, AdminPermissionValidationError, hasAdminGrant, normalizeAdminGrants, type AdminGrantKey, type AdminPermissionProfile, type AdminPermissionsResponse } from "@/lib/admin-permissions";
import { adminPermissionContext,adminPermissionsEnforced } from "@/lib/admin-permission-access";
import {accountSessionPredicate} from '@/lib/account-session';

type Predicate = {sql: string; args: unknown[]};
type ProfileRow = {accountId: string; groupId: string; revision: number; grantsJson: string; draftGrantsJson: string | null; origin: "legacy" | "new"; updatedBy: string | null; updatedAt: string};
type ManagedTarget = {id: string; name: string; disabledAt: string | null};
export class AdminPermissionsError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const ownerSql = (alias: string) => `${alias}.role='admin' AND lower(trim(${alias}.email))=? AND substr(${alias}.id,1,6)<>'local:'`;

// Statement-local live identity predicate. Owner keeps selected-group access;
// everyone else must still belong to an active group and hold its designation.
function managementActorPredicate(actor: Account): Predicate {
  const session=accountSessionPredicate(actor);
  return {
    sql: `EXISTS(SELECT 1 FROM accounts permission_actor JOIN tuition_groups permission_group ON permission_group.id=?
      WHERE permission_actor.id=? AND permission_actor.role='admin' AND permission_actor.disabled_at IS NULL
      AND (${session.sql})
      AND NOT EXISTS(SELECT 1 FROM local_credentials c WHERE c.account_id=permission_actor.id AND c.must_change_password=1)
      AND ((${ownerSql("permission_actor")}) OR (permission_actor.group_id=permission_group.id AND permission_group.active=1 AND permission_group.chief_admin_id=permission_actor.id)))`,
    args: [requireGroup(actor.groupId), actor.id,...session.args, OWNER_EMAIL],
  };
}

function targetPredicate(actor: Account, accountId: string): Predicate {
  return {
    sql: `EXISTS(SELECT 1 FROM accounts permission_target JOIN tuition_groups permission_group ON permission_group.id=permission_target.group_id
      WHERE permission_target.id=? AND permission_target.group_id=? AND permission_target.role='admin' AND permission_target.id<>?
      AND NOT(${ownerSql("permission_target")}) AND permission_group.chief_admin_id IS NOT permission_target.id)`,
    args: [accountId, requireGroup(actor.groupId), actor.id, OWNER_EMAIL],
  };
}

// Runtime enforcement uses explicit stored grants. Missing profiles and
// unknown/future grants deny by default;
// configuring an ordinary admin can never elevate it above existing ceilings.
export function configuredAdminGrantPredicate(actor: Account, key: string): Predicate {
  if (!hasAdminGrant(LEGACY_ADMIN_GRANTS, key)) return {sql: "0", args: []};
  const actions = ADMIN_PERMISSION_CATALOG.flatMap(module => module.actions);
  const known = actions.map(action => action.key);
  const dependencies = actions.flatMap(action=>action.requires.map(dependency=>({key:action.key,dependency})));
  const required = normalizeAdminGrants([key]);
  const session=accountSessionPredicate(actor);
  const profileArray = "CASE WHEN json_valid(p.grants_json) AND json_type(p.grants_json)='array' THEN p.grants_json ELSE '[]' END";
  return {
    sql: `EXISTS(SELECT 1 FROM main.accounts permission_actor JOIN main.tuition_groups permission_group ON permission_group.id=?
      WHERE permission_actor.id=? AND permission_actor.role='admin' AND permission_actor.disabled_at IS NULL
      AND (${session.sql})
      AND NOT EXISTS(SELECT 1 FROM main.local_credentials c WHERE c.account_id=permission_actor.id AND c.must_change_password=1)
      AND ((${ownerSql("permission_actor")}) OR (permission_actor.group_id=permission_group.id AND permission_group.active=1 AND
        (permission_group.chief_admin_id=permission_actor.id OR EXISTS(SELECT 1 FROM main.admin_permission_profiles p
          WHERE p.group_id=permission_group.id AND p.account_id=permission_actor.id
          AND NOT EXISTS(SELECT 1 FROM json_each(${profileArray}) invalid_key WHERE invalid_key.type<>'text' OR NOT EXISTS(SELECT 1 FROM json_each(?) supported_key WHERE supported_key.value=invalid_key.value))
          AND json_array_length(${profileArray})=(SELECT count(DISTINCT unique_key.value) FROM json_each(${profileArray}) unique_key)
          AND NOT EXISTS(SELECT 1 FROM json_each(?) required_dependency WHERE EXISTS(SELECT 1 FROM json_each(${profileArray}) selected_key WHERE selected_key.value=json_extract(required_dependency.value,'$.key')) AND NOT EXISTS(SELECT 1 FROM json_each(${profileArray}) dependency_key WHERE dependency_key.value=json_extract(required_dependency.value,'$.dependency')))
          AND NOT EXISTS(SELECT 1 FROM json_each(?) required_key WHERE NOT EXISTS(SELECT 1 FROM json_each(${profileArray}) grant_key WHERE grant_key.type='text' AND grant_key.value=required_key.value)))))))`,
    args: [requireGroup(actor.groupId), actor.id,...session.args, OWNER_EMAIL, JSON.stringify(known), JSON.stringify(dependencies), JSON.stringify(required)],
  };
}
export function configuredAdminGrantGuard(actor: Account, key: string) {
  return authorityGuard(configuredAdminGrantPredicate(actor, key), "admin_permissions_authority_changed");
}

async function managedTarget(actor: Account, accountId: string): Promise<ManagedTarget> {
  if (actor.role !== "admin" || !(await adminAuthority(actor)).canManageAdministrators) throw new AdminPermissionsError("permissions.forbidden", 403);
  const row = await learningDb().prepare("SELECT a.id,a.email,a.role,a.name,a.disabled_at AS disabledAt,g.chief_admin_id AS chiefAdminId FROM accounts a JOIN tuition_groups g ON g.id=a.group_id WHERE a.id=? AND a.group_id=?")
    .bind(accountId, requireGroup(actor.groupId)).first<{id: string; email: string; role: string; name: string; disabledAt: string | null; chiefAdminId: string | null}>();
  if (!row) throw new AdminPermissionsError("permissions.targetNotFound", 404);
  if (row.id === actor.id || isOwnerAccount(row) || row.id === row.chiefAdminId) throw new AdminPermissionsError("permissions.targetProtected", 403);
  if (row.role !== "admin") throw new AdminPermissionsError("permissions.targetNotFound", 404);
  // Recheck actor and target in the statement that projects its permitted name.
  const manager = managementActorPredicate(actor), target = targetPredicate(actor, accountId);
  const allowed = await learningDb().prepare(`SELECT id,name,disabled_at AS disabledAt FROM accounts WHERE id=? AND ${manager.sql} AND ${target.sql}`)
    .bind(accountId, ...manager.args, ...target.args).first<ManagedTarget>();
  if (!allowed) throw new AdminPermissionsError("permissions.authorityChanged", 409);
  return allowed;
}

function parsedGrants(value: string): AdminGrantKey[] {
  try {
    const stored:unknown=JSON.parse(value),normalized=normalizeAdminGrants(stored);
    if(!Array.isArray(stored)||new Set(stored).size!==stored.length||stored.length!==normalized.length||stored.some(key=>!normalized.includes(key)))throw new Error('Invalid stored grants');
    return normalized;
  }
  catch { throw new AdminPermissionsError("permissions.profileInvalid", 503); }
}
function profileResponse(groupId: string, accountId: string, row: ProfileRow | null): AdminPermissionProfile {
  if (!row) return {groupId, accountId, revision: 0, origin: "new", grants: [], draftGrants: null, updatedBy: null, updatedAt: null};
  if (!Number.isSafeInteger(row.revision) || row.revision < 1 || !["legacy", "new"].includes(row.origin)) throw new AdminPermissionsError("permissions.profileInvalid", 503);
  return {groupId, accountId, revision: row.revision, origin: row.origin, grants: parsedGrants(row.grantsJson), draftGrants: row.draftGrantsJson === null ? null : parsedGrants(row.draftGrantsJson), updatedBy: row.updatedBy, updatedAt: row.updatedAt};
}
async function profileRow(actor: Account, accountId: string): Promise<ProfileRow | null> {
  // Profile reads use the same live guard as target reads; a late handover must
  // not return a permission configuration to a former chief administrator.
  const manager = managementActorPredicate(actor), target = targetPredicate(actor, accountId);
  const db = learningDb();
  const result = await db.batch([
    authorityGuard(manager), authorityGuard(target, "admin_permissions_target_changed"),
    db.prepare(`SELECT group_id AS groupId,account_id AS accountId,revision,grants_json AS grantsJson,draft_grants_json AS draftGrantsJson,origin,updated_by AS updatedBy,updated_at AS updatedAt FROM admin_permission_profiles WHERE group_id=? AND account_id=?`).bind(requireGroup(actor.groupId), accountId),
  ]);
  return (result[2].results[0] as unknown as ProfileRow | undefined) || null;
}
async function response(target: ManagedTarget, profile: AdminPermissionProfile): Promise<AdminPermissionsResponse> {
  const access=await adminPermissionContext({id:target.id,groupId:profile.groupId,role:"admin"});
  const hasDraft=profile.draftGrants!==null;
  return {rollout:access.enforced?'active':ADMIN_PERMISSIONS_ROLLOUT,status:access.enforced&&!hasDraft?'active':'pending',runtimeEnforcement:access.enforced,currentAccess:access.enforced?'configured':'legacy',draftStatus:hasDraft?'saved':'none',canApplyDraft:access.enforced&&hasDraft,canDiscardDraft:hasDraft,target,profile,catalog:ADMIN_PERMISSION_CATALOG,templates:ADMIN_PERMISSION_TEMPLATES,effectiveGrants:access.grants,configuredGrants:[...profile.grants]};
}
function profileRevisionPredicate(groupId:string,accountId:string,expectedRevision:number,previous:ProfileRow|null):Predicate {
  return previous?{
    sql:'EXISTS(SELECT 1 FROM admin_permission_profiles WHERE group_id=? AND account_id=? AND revision=? AND grants_json=? AND draft_grants_json IS ? AND origin=?)',
    args:[groupId,accountId,expectedRevision,previous.grantsJson,previous.draftGrantsJson,previous.origin],
  }:{sql:'NOT EXISTS(SELECT 1 FROM admin_permission_profiles WHERE group_id=? AND account_id=?)',args:[groupId,accountId]};
}
export async function readAdminPermissions(actor: Account, accountId: string): Promise<AdminPermissionsResponse> {
  const target = await managedTarget(actor, accountId);
  return response(target, profileResponse(requireGroup(actor.groupId), accountId, await profileRow(actor, accountId)));
}

export async function saveAdminPermissionDraft(actor: Account, accountId: string, expectedRevision: number, input: unknown): Promise<AdminPermissionsResponse> {
  const grants = normalizeAdminGrants(input), target = await managedTarget(actor, accountId), groupId = requireGroup(actor.groupId);
  const previous = await profileRow(actor, accountId), before = profileResponse(groupId, accountId, previous);
  if (before.revision !== expectedRevision) throw new AdminPermissionsError("permissions.revisionChanged", 409);
  const db = learningDb(), now = new Date().toISOString(), next: AdminPermissionProfile = {...before, revision: before.revision + 1, draftGrants: grants, updatedBy: actor.id, updatedAt: now};
  const currentTarget = targetPredicate(actor, accountId);
  const revision=profileRevisionPredicate(groupId,accountId,expectedRevision,previous);
  if (before.draftGrants !== null && JSON.stringify(before.draftGrants) === JSON.stringify(grants)) {
    await db.batch([
      adminActorGuard(actor, true),
      authorityGuard(currentTarget, "admin_permissions_target_changed"),
      authorityGuard(revision, "admin_permissions_revision_changed"),
    ]);
    return response(target, before);
  }
  await db.batch([
    // The existing Part 02 guard is the authority source for management writes.
    adminActorGuard(actor, true),
    authorityGuard(currentTarget, "admin_permissions_target_changed"),
    authorityGuard(revision, "admin_permissions_revision_changed"),
    previous
      ? db.prepare("UPDATE admin_permission_profiles SET draft_grants_json=?,revision=revision+1,updated_by=?,updated_at=? WHERE group_id=? AND account_id=? AND revision=?").bind(JSON.stringify(grants), actor.id, now, groupId, accountId, expectedRevision)
      : db.prepare("INSERT INTO admin_permission_profiles(group_id,account_id,revision,grants_json,draft_grants_json,origin,updated_by,updated_at) VALUES(?,?,1,'[]',?,'new',?,?)").bind(groupId, accountId, JSON.stringify(grants), actor.id, now),
    authorityGuard({sql: "changes()=1", args: []}, "admin_permissions_revision_changed"),
    db.prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) VALUES(?,?,?,?,'adminPermissions.saveDraft',?,?,?)")
      .bind(groupId, crypto.randomUUID(), `admin-permissions:${accountId}`, actor.id, JSON.stringify({rollout:adminPermissionsEnforced()?'active':ADMIN_PERMISSIONS_ROLLOUT,profile:before}), JSON.stringify({rollout:adminPermissionsEnforced()?'active':ADMIN_PERMISSIONS_ROLLOUT,profile:next}), now),
  ]);
  return response(target, next);
}

// Application is unavailable when a deployment explicitly retains preparation
// mode during rollout or recovery. The release configuration controls this gate.
export async function changeSavedAdminPermissionDraft(actor:Account,accountId:string,expectedRevision:number,action:'applyDraft'|'discardDraft'):Promise<AdminPermissionsResponse> {
  const target=await managedTarget(actor,accountId),groupId=requireGroup(actor.groupId),previous=await profileRow(actor,accountId),before=profileResponse(groupId,accountId,previous);
  if(before.revision!==expectedRevision)throw new AdminPermissionsError('permissions.revisionChanged',409);
  if(action==='applyDraft'&&!adminPermissionsEnforced())throw new AdminPermissionsError('permissions.applyUnavailable',409);
  if(action==='applyDraft'&&before.draftGrants===null)throw new AdminPermissionsError('permissions.noDraftToApply',409);
  const db=learningDb(),revision=profileRevisionPredicate(groupId,accountId,expectedRevision,previous),guards=[adminActorGuard(actor,true),authorityGuard(targetPredicate(actor,accountId),'admin_permissions_target_changed'),authorityGuard(revision,'admin_permissions_revision_changed')];
  if(before.draftGrants===null){await db.batch(guards);return response(target,before);}
  const now=new Date().toISOString(),next:AdminPermissionProfile={...before,grants:action==='applyDraft'?[...before.draftGrants]:before.grants,draftGrants:null,revision:before.revision+1,updatedBy:actor.id,updatedAt:now};
  const effectiveChanged=action==='applyDraft'&&JSON.stringify(before.grants)!==JSON.stringify(next.grants),rollout=adminPermissionsEnforced()?'active':ADMIN_PERMISSIONS_ROLLOUT;
  await db.batch([
    ...guards,
    db.prepare('UPDATE admin_permission_profiles SET grants_json=?,draft_grants_json=NULL,revision=revision+1,updated_by=?,updated_at=? WHERE group_id=? AND account_id=? AND revision=?').bind(JSON.stringify(next.grants),actor.id,now,groupId,accountId,expectedRevision),
    authorityGuard({sql:'changes()=1',args:[]},'admin_permissions_revision_changed'),
    db.prepare('INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) VALUES(?,?,?,?,?,?,?,?)').bind(groupId,crypto.randomUUID(),`admin-permissions:${accountId}`,actor.id,`adminPermissions.${action}`,JSON.stringify({rollout,profile:before}),JSON.stringify({rollout,effectiveChanged,profile:next}),now),
  ]);
  return response(target,next);
}

export function adminPermissionsFailure(error: unknown): {error: string; status: number} {
  if (error instanceof AdminPermissionsError) return {error: error.message, status: error.status};
  if (error instanceof AdminPermissionValidationError) return {error: error.message, status: 400};
  if (/admin_permissions_revision_changed/.test(String(error))) return {error: "permissions.revisionChanged", status: 409};
  if (isAdminAuthorityFailure(error) || /admin_permissions_(authority|target)_changed/.test(String(error))) return {error: "permissions.authorityChanged", status: 409};
  return {error: "permissions.unavailable", status: 503};
}
