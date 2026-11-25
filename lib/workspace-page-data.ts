import type {WorkspaceDataView} from './workspace-data-types';

/** Data owned by the shell. Self-fetching leaf pages intentionally return null. */
export function workspacePageData(role: string, view: string, canReadTerms = false): WorkspaceDataView | null {
  if (!['admin', 'teacher', 'student'].includes(role)) return null;
  if (view === 'calendar') return 'calendar';
  if (view === 'schedule' && role !== 'student') return 'schedule';
  if (view === 'students' && role === 'teacher') return 'teacher-plans';
  if (role !== 'admin') return null;
  if (['list', 'attention', 'students', 'teachers'].includes(view)) return 'course-options';
  if (view === 'studentRoster') return 'students';
  if (view === 'teacherRoster') return 'teachers';
  if (view === 'subjects') return 'subjects';
  if (view === 'accounts' || view === 'parentRoster') return 'account-options';
  if (view === 'groupInfo' && canReadTerms) return 'terms';
  return null;
}
export function workspaceDataBlocksPage(view: WorkspaceDataView | null) {
  return view !== null && !['calendar', 'course-options', 'terms'].includes(view);
}

export type WorkspaceReadIdentity = {id?: string; groupId?: string | null; role: string; adminPermissions?: unknown; teacherName?: string | null; studentName?: string | null; isOwner?: boolean; isGroupChief?: boolean; canManageAdministrators?: boolean};
export function workspaceIdentityKey(account: WorkspaceReadIdentity) {
  return JSON.stringify([account.id, account.groupId ?? null, account.role, account.adminPermissions, account.teacherName ?? null, account.studentName ?? null, Boolean(account.isOwner), Boolean(account.isGroupChief), Boolean(account.canManageAdministrators)]);
}
