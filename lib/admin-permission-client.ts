import { hasAdminGrant, type AdminGrantKey } from "./admin-permissions";

export type AdminPermissionAccount = {
  role?: string;
  isOwner?: boolean;
  isGroupChief?: boolean;
  canManageAdministrators?: boolean;
  adminPermissions?: { enforced: boolean; grants: AdminGrantKey[]; privileged: boolean };
};

/** Client presentation follows the server snapshot; APIs remain authoritative. */
export function canAdminAction(account: AdminPermissionAccount | null | undefined, key: AdminGrantKey): boolean {
  if (account?.role !== "admin") return true;
  const permissions = account.adminPermissions;
  if (!permissions?.enforced && (key.startsWith("prepayments.")||key.startsWith("parents."))) return hasAdminGrant([key],key) && (account.isOwner === true || account.isGroupChief === true || permissions?.privileged === true || hasAdminGrant(permissions?.grants || [],key));
  if (!permissions?.enforced) return true;
  return hasAdminGrant(permissions.grants || [], key) || (permissions.privileged === true && hasAdminGrant([key], key));
}

const viewGrants: Record<string, AdminGrantKey[]> = {
  classrooms: ["classrooms.view"], homework: ["homework.view"], materials: ["materials.view", "recordings.view"],
  quizzes: ["quizzes.view", "quizAssignments.view"], quizBank: ["quizzes.view"],
  overview: ["statistics.view"], attention: ["attendance.view"], schedule: ["lessons.create"],
  calendar: ["lessons.view"], list: ["lessons.view"], students: ["lessons.view"], teachers: ["lessons.view"],
  subjects: ["plans.view"], teacherRoster: ["teachers.view"], studentRoster: ["students.view"],
  accounts: ["accounts.view"], sheet: ["sheetSync.view"], activity: ["audit.view"],
  courses: ["lessons.view", "lessons.create", "attendance.view", "statistics.view"],
  people: ["students.view", "teachers.view", "accounts.view"],
};

export function canAdminView(account: AdminPermissionAccount | null | undefined, view: string): boolean {
  if (account?.role !== "admin") return true;
  if (view === "groups") return account.isOwner === true;
  if (view === "billing") return account.isOwner === true || ["fees.view","invoices.view","finance.view","payroll.view","expenses.view","prepayments.view"].some(key=>canAdminAction(account,key as AdminGrantKey));
  if (view === "accounts" || view === "people") {
    if (account.canManageAdministrators === true) return true;
  }
  const required = viewGrants[view];
  return required ? required.some(key => canAdminAction(account, key)) : ["home", "myAccount", "notifications", "groupInfo", "settings"].includes(view);
}

export function adminMutationGrant(body: Record<string, unknown>): AdminGrantKey | null {
  const action = String(body.action || "");
  if (action === "permanentDelete") {
    return ({account:"accounts.delete",teacher:"teachers.delete",student:"students.delete",plan:"plans.delete",lesson:"lessons.delete",classroom:"classrooms.delete",homework:"homework.delete"} as Record<string, AdminGrantKey>)[String(body.kind)] || null;
  }
  if (action === "savePlan") return body.editingKey ? null : "plans.create";
  if (action === "saveTeacher") return body.active === false ? "teachers.disable" : null;
  if (action === "setStudentActive") return body.active === false ? "students.disable" : "students.restore";
  if (action === "saveClassroom") return body.id ? "classrooms.edit" : "classrooms.create";
  if (action === "archiveClassroom") return body.archived ? "classrooms.archive" : "classrooms.restore";
  if (action === "saveAnnouncement") return body.id ? "announcements.edit" : "announcements.create";
  if (action === "saveTerm") return body.id ? "terms.edit" : "terms.create";
  return ({createLocalAccount:"accounts.create",bind:"accounts.assign",activateAccount:"accounts.activate",deleteAccount:"accounts.disable",restoreAccount:"accounts.restore",resetLocalPassword:"accounts.resetPassword",saveStudent:"students.create",updateStudentProfile:"students.edit",create:"lessons.create",edit:"lessons.edit",cancel:"lessons.cancel",attendance:"attendance.edit",review:"attendance.review",updateOnlineLink:"lessons.edit",createClassSession:"lessons.create",editClassSession:"lessons.edit",cancelClassSession:"lessons.cancel",updateClassSessionLink:"lessons.edit",saveSessionAttendance:"attendance.edit",reviewSessionAttendance:"attendance.review",lockSessionAttendance:"attendance.review",unlockSessionAttendance:"attendance.review",proposeClassReschedule:"reschedules.create",respondClassReschedule:"reschedules.respond",proposeReschedule:"reschedules.create",respondReschedule:"reschedules.respond",deleteAnnouncement:"announcements.delete",createTerm:"terms.create"} as Record<string, AdminGrantKey>)[action] || null;
}
