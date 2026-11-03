"use client";
import { useAdminAction } from "./admin-permission-context";
import { useFilterPreference } from "@/lib/filter-preferences";
import { BulkDeleteTool } from "./bulk-delete";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDialogState } from "@/lib/use-dialog-state";
import { getLanguage, t } from "@/lib/i18n";
import { showActionToast } from "@/lib/action-feedback";
import { DeleteButton, type Mutate } from "./directory-tools";
import { PR } from "@/lib/parents-i18n";
import { PersonIdentityFields, createPersonIdentityDraft, personIdentityPayload, personIdentityReady } from "./person-identity-fields";
import { ChevronDown, GraduationCap, ShieldCheck, UserRound, UsersRound, UserRoundPlus } from "lucide-react";
import "./people-compact.css";

const ParentChildrenManager = lazy(() => import("./parent-children-manager").then(module => ({default: module.ParentChildrenManager})));

const AdminPermissionEditor = lazy(() => import("./admin-permission-editor").then(module => ({default: module.AdminPermissionEditor})));

type User = { id: string; name: string; role: string; username?: string | null; email?: string; disabledAt?: string | null; teacherName?: string | null; studentName?: string | null; assignmentStatus?: string; pendingExpiresAt?: string | null; isOwner?: boolean; isGroupChief?: boolean; parentChildren?: string[]; contactPhone?: string | null; contactPhoneKind?: "student" | "parent" | null };
type Actor = { id?: string; groupId?: string | null; isOwner?: boolean; isGroupChief?: boolean; canManageAdministrators?: boolean };
const accountRoleGroups = [
  { role: "pending", label: "待分配角色", Icon: UserRoundPlus },
  { role: "student", label: "学生账号", Icon: GraduationCap },
  { role: "teacher", label: "老师账号", Icon: UserRound },
  { role: "parent", label: "parents.parentAccounts", Icon: UsersRound },
  { role: "admin", label: "管理员账号", Icon: ShieldCheck },
];

export function AccountDirectory({ users, actor, teachers, students, mutate, busy, createForm, onAccountsChanged, roleFilter }: { roleFilter?: "parent"; users: User[]; actor: Actor; teachers: string[]; students: string[]; mutate: Mutate; busy: boolean; createForm: React.ReactNode | ((onCreated:(role:string)=>void)=>React.ReactNode); onAccountsChanged?: () => void }) {
  const can=useAdminAction();
  const canViewParents = can("parents.view");
  const filterKey = roleFilter ? "parent-accounts" : "accounts";
  const canCreateAccount = can("accounts.create") && (!roleFilter || can("parents.manage"));
  const canResetPassword = can("accounts.resetPassword") && (!roleFilter || can("parents.manage"));
  const [search, setSearch] = useFilterPreference<string>(`${filterKey}-search`, ""), [removed, setRemoved] = useFilterPreference<boolean>(`${filterKey}-removed`, false);
  const [editing, setEditing] = useDialogState<User | null>("account-edit", null);
  const [create, setCreate] = useDialogState<boolean | null>("account-create", null);
  const [createdRole,setCreatedRole]=useState('');
  const [permissionTarget, setPermissionTarget] = useState<User | null>(null);
  const [parentTarget, setParentTarget] = useDialogState<User | null>("parent-children", null);
  const closeParents = useCallback(() => setParentTarget(null), [setParentTarget]);
  const currentParentTarget = users.find(user => user.id === parentTarget?.id);
  const parentTargetAllowed = Boolean(currentParentTarget?.role === "parent" && canViewParents && (!roleFilter || can("accounts.view")));
  useEffect(() => { if (parentTarget && !parentTargetAllowed) closeParents(); }, [parentTarget, parentTargetAllowed, closeParents]);
  const [permissionUnavailable, setPermissionUnavailable] = useState(false);
  const closePermissions = useCallback(() => setPermissionTarget(null), []);
  const permissionAuthorityLost = useCallback(() => { setPermissionUnavailable(true); setPermissionTarget(null); showActionToast("error", "permissions.authorityLost"); }, []);
  const [role, setRole] = useState("teacher"), [person, setPerson] = useState(() => createPersonIdentityDraft());
  const canManageAdministrators = actor.canManageAdministrators === true;
  const permissionManager = !permissionUnavailable && canManageAdministrators && (actor.isOwner === true || actor.isGroupChief === true);
  const currentPermissionTarget = users.find(user => user.id === permissionTarget?.id);
  const permissionTargetAllowed = Boolean(permissionManager && currentPermissionTarget?.role === "admin" && currentPermissionTarget.id !== actor.id && !currentPermissionTarget.isOwner && !currentPermissionTarget.isGroupChief);
  useEffect(() => { if (permissionTarget && !permissionTargetAllowed) { closePermissions(); showActionToast("error", "permissions.authorityLost"); } }, [permissionTarget, permissionTargetAllowed, closePermissions]);
  const selectedRole = role === "admin" && !canManageAdministrators || role === "parent" && !can("parents.manage") ? "teacher" : role;
  const visible = users.filter(u => (!roleFilter || u.role === roleFilter) && Boolean(u.disabledAt) === removed && `${u.name} ${u.email || ""} ${u.username || ""} ${u.teacherName || ""} ${u.studentName || ""} ${u.contactPhone || ""} ${canViewParents ? (u.parentChildren || []).join(" ") : ""}`.toLowerCase().includes(search.toLowerCase()));
  function canManage(u: User) { return u.id !== actor.id && !u.isOwner && !u.isGroupChief && (u.role !== "admin" || canManageAdministrators) && (u.role !== "parent" || can("parents.manage")); }
  function canEdit(u: User) { return !u.disabledAt && can("accounts.assign") && canManage(u); }
  function showsChildrenAction(u: User) { return u.role === "parent" && canViewParents; }
  function roleLabel(u: User) { return u.isOwner ? "admin.platformOwner" : u.isGroupChief ? "admin.groupChief" : u.role === "admin" ? "admin.regularAdministrator" : u.role === "teacher" ? "老师" : u.role === "student" ? "学生" : u.role === "parent" ? "parents.parentRole" : "待分配角色"; }
  function edit(u: User) {
    if (!canEdit(u)) return;
    const nextRole = u.role === "pending" ? "teacher" : u.role;
    const identity = u.teacherName || u.studentName || "";
    const canCreate = can(nextRole === "student" ? "students.create" : "teachers.create");
    setRole(nextRole);
    setPerson(createPersonIdentityDraft(u.name, identity || !canCreate ? "existing" : "new", identity));
    setEditing(u);
  }
  if (roleFilter && !can("accounts.view")) return null;
  return <section className="panel directory-panel account-directory people-compact">
    <div className="section-head directory-section-head"><h2>{roleFilter ? PR("parentRoster") : t("账号管理")}</h2>{canResetPassword&&!canCreateAccount&&<Button onClick={()=>setCreate(true)}>{t("重置密码")}</Button>}{canCreateAccount&&<Button adminGrant="accounts.create" onClick={() => setCreate(true)}>{roleFilter ? PR("createParentAccount") : t("新建登录账号")}</Button>}</div>
    <details className="people-help"><summary>{getLanguage()==='en'?'Account permissions':'账号权限说明'}</summary><p className="muted">{t(actor.isOwner ? "admin.accountScopeOwner" : actor.isGroupChief && canManageAdministrators ? "admin.accountScopeChief" : "admin.accountScopeAdministrator")}</p></details>
    <div className="directory-filters"><label>{roleFilter ? PR("searchParents") : t("搜索账号")}<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={PR(canViewParents ? "searchAccounts" : roleFilter ? "searchParentsBasic" : "searchAccountsBasic")}/></label><label>{t("显示记录")}<select value={removed ? "removed" : "active"} onChange={e => setRemoved(e.target.value === "removed")}><option value="active">{t("启用中账号")}</option><option value="removed">{t("已停用账号")}</option></select></label></div>
    <div className="directory-toolbar people-list-toolbar"><span className="muted">{roleFilter ? PR("parentCount").replace("{count}", String(visible.length)) : getLanguage()==='en'?`${visible.length} accounts`:`${visible.length} 个账号`}</span>{(search||removed)&&<Button variant="outline" size="sm" onClick={() => { setSearch(""); setRemoved(false); }}>{t("重置筛选")}</Button>}{can("accounts.delete")&&<details className="people-batch"><summary>{getLanguage()==='en'?'Bulk actions':'批量操作'}</summary><BulkDeleteTool kind="account" records={visible.filter(canManage).map(u => ({ id: u.id, label: u.name + " · " + t(roleLabel(u)) }))} mutate={mutate} busy={busy}/></details>}</div>
    {accountRoleGroups.filter(group => !roleFilter || group.role === roleFilter).map(({role:r,label,Icon}) => <details className="directory-group account-role-group" key={r} open={r === roleFilter || r === "pending" || r===createdRole || Boolean(search)}>
      <summary><Icon size={18} aria-hidden="true"/><span className="account-role-label">{t(label)}</span><span className="account-role-count">{visible.filter(u => u.role === r).length}</span><ChevronDown className="account-role-chevron" size={18} aria-hidden="true"/></summary>
      {visible.filter(u => u.role === r).map(u => <article key={u.id} className="user-row directory-person-row" data-account-id={u.id}>
        <div className="account-row-heading"><div className="directory-person-identity"><div className="people-name-line"><strong>{u.name}</strong>{(u.isOwner || u.isGroupChief) && <span className="account-authority-badge" data-authority={u.isOwner ? "owner" : "chief"}>{t(roleLabel(u))}</span>}</div>
          {u.teacherName && u.teacherName !== u.name && <small>{t("关联老师")} · {u.teacherName}</small>}{u.studentName && u.studentName !== u.name && <small>{t("关联学生")} · {u.studentName}</small>}
          {u.role === "parent" && canViewParents && !!u.parentChildren?.length && <small>{PR("linkedChildren")} · {u.parentChildren.join("、")}</small>}
          {(u.disabledAt||(u.role==='pending'&&u.pendingExpiresAt))&&<small className="people-attention">{u.disabledAt?t("已停用账号"):t("待分配角色")}{u.pendingExpiresAt&&<> · {Date.parse(u.pendingExpiresAt)<=Date.now()?t("已到期"):`${t("剩余天数")} ${Math.ceil((Date.parse(u.pendingExpiresAt)-Date.now())/86400000)}`}</>}</small>}
        </div>{showsChildrenAction(u)?<Button type="button" disabled={busy} size="sm" variant="outline" className="account-quick-action" aria-label={PR("manageChildren")+' · '+u.name} onClick={() => setParentTarget(u)}>{PR("manageChildren")}</Button>:canEdit(u)?<Button type="button" disabled={busy} size="sm" variant="outline" className="account-quick-action" aria-label={(u.role==='pending'?(getLanguage()==='en'?'Complete account profile':'完善账号资料'):t("编辑"))+' · '+u.name} onClick={() => edit(u)}>{u.role==='pending'?(getLanguage()==='en'?'Complete profile':'完善资料'):t("编辑")}</Button>:null}</div>
        <details className="people-row-details"><summary aria-label={(getLanguage()==='en'?'Details & actions':'资料与操作')+' · '+u.name}>{getLanguage()==='en'?'Details & actions':'资料与操作'}</summary><div className="people-row-content"><div className="people-account-fields">
          <small>{u.username ? `${t("用户名")} · ${u.username}` : t("未设置密码登录")}</small><small>{u.email ? `Google · ${u.email}` : t("未连接 Google")}</small>
          {u.role === "student" && u.contactPhone && <small>{getLanguage() === "en" ? (u.contactPhoneKind === "parent" ? "Parent contact" : "Student contact") : (u.contactPhoneKind === "parent" ? "家长联系号码" : "学生联系号码")} · <a href={"tel:" + u.contactPhone}>{u.contactPhone}</a></small>}
          <small>{t(u.disabledAt ? "已停用账号" : u.assignmentStatus === "PENDING_ASSIGNMENT" ? "待分配" : "已启用")}{u.pendingExpiresAt ? ` · ${Date.parse(u.pendingExpiresAt) <= Date.now() ? t("已到期") : `${t("剩余天数")} ${Math.ceil((Date.parse(u.pendingExpiresAt) - Date.now()) / 86400000)}`}` : u.role === "pending" && u.assignmentStatus !== "ACTIVE" ? ` · ${t("不纳入自动清理")}` : ""}</small>
          {actor.isOwner && u.isGroupChief && <small className="field-hint">{t("admin.chiefAccountProtected")}</small>}
        </div>
        {canManage(u) && <div className="user-actions directory-person-actions">
          {canManage(u) && <>
          {permissionManager && u.role === "admin" && <Button disabled={busy} size="sm" variant="outline" onClick={() => setPermissionTarget(u)}>{t("permissions.title")}</Button>}
          {!u.disabledAt && <>{u.assignmentStatus === "PENDING_ASSIGNMENT" && <Button adminGrant="accounts.activate" disabled={busy} size="sm" variant="outline" onClick={() => void mutate({ action: "activateAccount", userId: u.id })}>{t("保留并启用账号")}</Button>}{showsChildrenAction(u)&&canEdit(u)&&<Button adminGrant="accounts.assign" disabled={busy} size="sm" variant="outline" onClick={() => edit(u)}>{t("分配角色与身份")}</Button>}</>}
          <Button adminGrant={u.disabledAt?"accounts.restore":"accounts.disable"} disabled={busy} size="sm" variant="outline" onClick={() => { if (u.disabledAt || window.confirm(t("确定停用此账号？停用后无法登录，可稍后恢复启用。"))) void mutate({ action: u.disabledAt ? "restoreAccount" : "deleteAccount", userId: u.id }); }}>{t(u.disabledAt ? "恢复启用" : "停用账号")}</Button>
          <DeleteButton kind="account" id={u.id} mutate={mutate} busy={busy} message="永久删除此账号、登录方式及个人学习计划？历史课程记录保留；名下仍有功课或教学资料时，请先处理后再删除。"/>
          </>}
        </div>}</div></details>
      </article>)}
    </details>)}
    {!visible.length && <p className="empty">{t("没有符合条件的记录")}</p>}
    {parentTarget && parentTargetAllowed && <Suspense fallback={<Dialog open onOpenChange={open => { if (!open) closeParents(); }}><DialogContent className="lesson-dialog directory-dialog"><DialogHeader><DialogTitle>{PR("manageChildren")}</DialogTitle></DialogHeader><p role="status">{PR("loading")}</p></DialogContent></Dialog>}><ParentChildrenManager key={`${actor.groupId}:${parentTarget.id}`} accountId={parentTarget.id} accountName={currentParentTarget?.name || parentTarget.name} canManage={can("parents.manage")} onClose={closeParents} onChanged={onAccountsChanged}/></Suspense>}
    {permissionTarget && permissionTargetAllowed && <Suspense fallback={<Dialog open onOpenChange={open => { if (!open) closePermissions(); }}><DialogContent className="admin-permission-dialog" overlayClassName="admin-permission-overlay"><DialogHeader><DialogTitle>{t("permissions.title")}</DialogTitle></DialogHeader><p role="status">{t("permissions.loading")}</p><div className="settings-actions"><Button variant="outline" onClick={closePermissions}>{t("permissions.cancel")}</Button></div></DialogContent></Dialog>}><AdminPermissionEditor key={`${actor.groupId}:${permissionTarget.id}`} groupId={actor.groupId} accountId={permissionTarget.id} accountName={currentPermissionTarget?.name || permissionTarget.name} onClose={closePermissions} onAuthorityLost={permissionAuthorityLost}/></Suspense>}
    <Dialog open={Boolean(create)&&(canCreateAccount||canResetPassword)} onOpenChange={open => setCreate(open ? true : null)}><DialogContent className="lesson-dialog directory-dialog"><DialogHeader><DialogTitle>{canCreateAccount ? roleFilter ? PR("createParentAccount") : t("创建登录账号") : t("重置密码")}</DialogTitle></DialogHeader>{typeof createForm==='function'?createForm(role=>{setCreate(null);setCreatedRole(role);setSearch('');setRemoved(false);onAccountsChanged?.();}):createForm}</DialogContent></Dialog>
    <Dialog open={Boolean(editing)&&can("accounts.assign")} onOpenChange={open => { if (!open) setEditing(null); }}><DialogContent className="lesson-dialog directory-dialog"><DialogHeader><DialogTitle>{editing?.role === "pending" ? getLanguage() === "en" ? "Complete account profile" : "完善账号资料" : t("分配角色与身份")}</DialogTitle></DialogHeader><div className="directory-dialog-identity"><span className="muted">{editing?.email || editing?.username || editing?.name}</span></div>
      <form className="account-provisioning-form" onSubmit={async e => { e.preventDefault(); const current = users.find(user => user.id === editing?.id); if (!current || !canManage(current)) { setEditing(null); return; } if (!personIdentityReady(selectedRole, person)) return; if (await mutate({ action: "bind", userId: current.id, role: selectedRole, ...personIdentityPayload(selectedRole, person) })) {setEditing(null); onAccountsChanged?.();} }}>
        <label>{t("角色")}<select disabled={busy} value={selectedRole} onChange={e => { const nextRole=e.target.value; setRole(nextRole); setPerson(createPersonIdentityDraft(person.name || editing?.name || "", can(nextRole === "student" ? "students.create" : "teachers.create") ? "new" : "existing")); }}><option value="teacher">{t("老师")}</option><option value="student">{t("学生")}</option>{can("parents.manage") && <option value="parent">{PR("parentRole")}</option>}{canManageAdministrators && <option value="admin">{t("admin.regularAdministrator")}</option>}</select></label>
        <PersonIdentityFields role={selectedRole} value={person} onChange={setPerson} teachers={teachers} students={students} canCreatePerson={can(selectedRole === "student" ? "students.create" : "teachers.create")} disabled={busy}/>
        {selectedRole === "parent" && <p className="field-hint">{PR("newRoleHint")}</p>}
        <div className="directory-form-actions"><Button disabled={busy || !personIdentityReady(selectedRole, person)}>{editing?.role === "pending" ? getLanguage() === "en" ? "Save & enable account" : "保存并启用账号" : t("保存身份分配")}</Button></div>
      </form>
    </DialogContent></Dialog>
  </section>;
}
