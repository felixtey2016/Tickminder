import type { NavigationRole } from './course-navigation';

export type ManagementArea = 'people' | 'settings';
export type ManagementView = 'studentRoster' | 'teacherRoster' | 'accounts' | 'groupInfo' | 'myAccount' | 'sheet' | 'activity';
type ManagementTab = { view: ManagementView; label: string };

const TABS: Record<ManagementArea, readonly ManagementTab[]> = {
 people: [
  { view: 'studentRoster', label: '学生名单' },
  { view: 'teacherRoster', label: '老师名单' },
  { view: 'accounts', label: '账号管理' },
 ],
 settings: [
  { view: 'groupInfo', label: '集团信息' },
  { view: 'myAccount', label: '我的账号' },
  { view: 'sheet', label: '课时写入表格' },
  { view: 'activity', label: '操作日志' },
 ],
};

export function managementTabs(area: ManagementArea): readonly ManagementTab[] { return TABS[area]; }
export function managementTitle(area: ManagementArea): string { return area === 'people' ? '人员与账号' : '设置'; }
export function defaultManagementView(area: ManagementArea): ManagementView { return TABS[area][0].view; }
export function managementArea(role: NavigationRole, view: unknown): ManagementArea | null {
 if (role !== 'admin') return null;
 return (Object.keys(TABS) as ManagementArea[]).find(area => TABS[area].some(tab => tab.view === view)) || null;
}

// Aliases keep existing leaf destinations, data scopes and role checks intact.
export function normalizeManagementView(role: NavigationRole, view: string): string {
 return role === 'admin' && (view === 'people' || view === 'settings') ? defaultManagementView(view) : view;
}
