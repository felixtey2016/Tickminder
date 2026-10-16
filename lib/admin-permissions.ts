// Saved configurations remain drafts. Integrated business checks are verified
// locally before the complete rollout is activated in a later round.
export const ADMIN_PERMISSIONS_ROLLOUT = "preparation" as const;

const currentModules = [
  { id: "accounts", actions: ["view", "create", "assign", "disable", "restore", "delete", "activate", "resetPassword"] },
  { id: "teachers", actions: ["view", "create", "disable", "restore", "delete"] },
  { id: "students", actions: ["view", "create", "edit", "disable", "restore", "delete", "promote"] },
  { id: "plans", actions: ["view", "create", "edit", "disable", "restore", "delete"] },
  { id: "lessons", actions: ["view", "create", "edit", "cancel", "delete"] },
  { id: "attendance", actions: ["view", "edit", "review"] },
  { id: "reschedules", actions: ["view", "create", "respond"] },
  { id: "classrooms", actions: ["view", "create", "edit", "archive", "restore", "delete"] },
  { id: "terms", actions: ["view", "create", "edit"] },
  { id: "announcements", actions: ["view", "create", "edit", "delete"] },
  { id: "folders", actions: ["view", "create", "edit", "delete", "placeContent"] },
  { id: "materials", actions: ["view"] },
  // Publishing, editing, feedback and scoring remain the owning teacher's work.
  { id: "homework", actions: ["view", "delete"] },
  // Quiz writes retain their existing creator / bank / group ceilings.
  { id: "quizzes", actions: ["view", "create", "edit", "delete", "import", "share", "duplicate"] },
  { id: "quizAssignments", actions: ["view", "assign", "grade", "withdraw", "release", "accommodate"] },
  { id: "statistics", actions: ["view"] },
  { id: "sheetSync", actions: ["view", "preview", "commit"] },
  { id: "audit", actions: ["view"] },
] as const;

const reservedModules = ["finance", "invoices", "parents", "resources", "progress", "publicModeration", "exports", "adminIdentity", "groups", "academicCatalogues", "backup"] as const;
type GrantOf<T> = T extends { id: infer I extends string; actions: readonly (infer A extends string)[] } ? `${I}.${A}` : never;
export type AdminGrantKey = GrantOf<typeof currentModules[number]>;
export type AdminPermissionModuleId = typeof currentModules[number]["id"] | typeof reservedModules[number];
export type AdminPermissionAction = { id: string; key: AdminGrantKey; labelKey: string; requires: AdminGrantKey[] };
export type AdminPermissionModule = { id: AdminPermissionModuleId; labelKey: string; descriptionKey: string; availability: "current" | "reserved"; supportedActions: string[]; actions: AdminPermissionAction[] };
export type AdminPermissionTemplate = { id: "none" | "readOnly" | "scheduling" | "academicSupport" | "legacy"; labelKey: string; descriptionKey: string; grants: AdminGrantKey[] };

const extraDependencies: Partial<Record<AdminGrantKey, AdminGrantKey[]>> = {
  "attendance.view": ["lessons.view"],
  "reschedules.view": ["lessons.view"],
  "announcements.view": ["classrooms.view"],
  "folders.view": ["classrooms.view"],
  // Target selectors and content-specific checks are integrated in round 2;
  // assigning work must not grant the complete student profile, and placing
  // one content kind must not expose the other kind's learning records.
  "quizAssignments.assign": ["quizzes.view"],
  "sheetSync.commit": ["sheetSync.preview"],
};

export const ADMIN_PERMISSION_CATALOG: AdminPermissionModule[] = [
  ...currentModules.map(module => ({
    id: module.id,
    labelKey: `permissions.module.${module.id}`,
    descriptionKey: `permissions.scope.${module.id}`,
    availability: "current" as const,
    supportedActions: [...module.actions],
    actions: module.actions.map(id => {
      const key = `${module.id}.${id}` as AdminGrantKey;
      return { id, key, labelKey: `permissions.action.${id}`, requires: [...(id === "view" ? [] : [`${module.id}.view` as AdminGrantKey]), ...(extraDependencies[key] || [])] };
    }),
  })),
  ...reservedModules.map(id => ({id, labelKey: `permissions.module.${id}`, descriptionKey: `permissions.scope.${id}`, availability: "reserved" as const, supportedActions: [], actions: []})),
];

const actions = ADMIN_PERMISSION_CATALOG.flatMap(module => module.actions);
const supported = new Map(actions.map(action => [action.key, action]));

export class AdminPermissionValidationError extends Error {
  constructor(message = "permissions.invalidGrants") { super(message); }
}

// Unknown modules, wildcards and unsupported actions are rejected, including
// reserved modules. Dependency closure is deterministic and never invents a key.
export function normalizeAdminGrants(input: unknown): AdminGrantKey[] {
  if (!Array.isArray(input) || input.length > actions.length || input.some(key => typeof key !== "string" || !supported.has(key as AdminGrantKey))) throw new AdminPermissionValidationError();
  const selected = new Set<AdminGrantKey>(input as AdminGrantKey[]);
  const add = (key: AdminGrantKey) => {
    const action = supported.get(key);
    if (!action) throw new AdminPermissionValidationError();
    for (const dependency of action.requires) if (!selected.has(dependency)) { selected.add(dependency); add(dependency); }
  };
  for (const key of [...selected]) add(key);
  return actions.filter(action => selected.has(action.key)).map(action => action.key);
}

export function hasAdminGrant(grants: readonly AdminGrantKey[], key: string): key is AdminGrantKey {
  return supported.has(key as AdminGrantKey) && grants.includes(key as AdminGrantKey);
}

// This is an explicit frozen scope snapshot, with all existing ownership,
// teacher-only, Owner-only and Part 02 identity restrictions still in force.
// New catalogue entries must never automatically widen this legacy snapshot.
export const LEGACY_ADMIN_GRANTS: AdminGrantKey[] = [
  "accounts.view", "accounts.create", "accounts.assign", "accounts.disable", "accounts.restore", "accounts.delete", "accounts.activate", "accounts.resetPassword",
  "teachers.view", "teachers.create", "teachers.disable", "teachers.restore", "teachers.delete",
  "students.view", "students.create", "students.edit", "students.disable", "students.restore", "students.delete", "students.promote",
  "plans.view", "plans.create", "plans.edit", "plans.disable", "plans.restore", "plans.delete",
  "lessons.view", "lessons.create", "lessons.edit", "lessons.cancel", "lessons.delete",
  "attendance.view", "attendance.edit", "attendance.review", "reschedules.view", "reschedules.create", "reschedules.respond",
  "classrooms.view", "classrooms.create", "classrooms.edit", "classrooms.archive", "classrooms.restore", "classrooms.delete",
  "terms.view", "terms.create", "terms.edit", "announcements.view", "announcements.create", "announcements.edit", "announcements.delete",
  "folders.view", "folders.create", "folders.edit", "folders.delete", "folders.placeContent", "materials.view", "homework.view", "homework.delete",
  "quizzes.view", "quizzes.create", "quizzes.edit", "quizzes.delete", "quizzes.import", "quizzes.share", "quizzes.duplicate",
  "quizAssignments.view", "quizAssignments.assign", "quizAssignments.grade", "quizAssignments.withdraw", "quizAssignments.release", "quizAssignments.accommodate",
  "statistics.view", "sheetSync.view", "sheetSync.preview", "sheetSync.commit", "audit.view",
];

const template = (id: AdminPermissionTemplate["id"], grants: AdminGrantKey[]): AdminPermissionTemplate => ({id, labelKey: `permissions.template.${id}`, descriptionKey: `permissions.templateDescription.${id}`, grants: normalizeAdminGrants(grants)});
export const ADMIN_PERMISSION_TEMPLATES: AdminPermissionTemplate[] = [
  template("none", []),
  template("readOnly", ["accounts.view", "teachers.view", "students.view", "plans.view", "lessons.view", "attendance.view", "reschedules.view", "classrooms.view", "terms.view", "announcements.view", "folders.view", "materials.view", "homework.view", "quizzes.view", "quizAssignments.view", "statistics.view", "audit.view"]),
  template("scheduling", ["teachers.view", "students.view", "plans.view", "lessons.view", "lessons.create", "lessons.edit", "lessons.cancel", "attendance.view", "attendance.edit", "attendance.review", "reschedules.view", "reschedules.create", "reschedules.respond", "classrooms.view", "terms.view"]),
  template("academicSupport", ["students.view", "classrooms.view", "announcements.view", "folders.view", "materials.view", "homework.view", "quizzes.view", "quizAssignments.view", "quizAssignments.assign", "quizAssignments.grade", "quizAssignments.release", "quizAssignments.accommodate"]),
  template("legacy", [...LEGACY_ADMIN_GRANTS]),
];

export type AdminPermissionProfile = {
  accountId: string; groupId: string; revision: number; origin: "legacy" | "new";
  grants: AdminGrantKey[]; draftGrants: AdminGrantKey[] | null; updatedBy: string | null; updatedAt: string | null;
};
export type AdminPermissionsResponse = {
  rollout: typeof ADMIN_PERMISSIONS_ROLLOUT; status: "pending"; runtimeEnforcement: boolean; currentAccess: "legacy" | "configured";
  target: {id: string; name: string; disabledAt: string | null}; profile: AdminPermissionProfile;
  catalog: AdminPermissionModule[]; templates: AdminPermissionTemplate[];
  effectiveGrants: AdminGrantKey[]; configuredGrants: AdminGrantKey[];
};
