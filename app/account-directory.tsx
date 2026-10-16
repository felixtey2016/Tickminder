"use client";
import { useAdminAction } from "./admin-permission-context";
import { useFilterPreference } from "@/lib/filter-preferences";
import { BulkDeleteTool } from "./bulk-delete";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDialogState } from "@/lib/use-dialog-state";
import { t } from "@/lib/i18n";
import { showActionToast } from "@/lib/action-feedback";
import { DeleteButton, type Mutate } from "./directory-tools";

const AdminPermissionEditor = lazy(() => import("./admin-permission-editor").then(module => ({default: module.AdminPermissionEditor})));

type User = { id: string; name: string; role: string; username?: string | null; email?: string; disabledAt?: string | null; teacherName?: string | null; studentName?: string | null; assignmentStatus?: string; pendingExpiresAt?: string | null; isOwner?: boolean; isGroupChief?: boolean };
type Actor = { id?: string; isOwner?: boolean; isGroupChief?: boolean; canManageAdministrators?: boolean };

export function AccountDirectory({ users, actor, teachers, students, mutate, busy, createForm }: { users: User[]; actor: Actor; teachers: string[]; students: string[]; mutate: Mutate; busy: boolean; createForm: React.ReactNode }) {
  const can=useAdminAction();
  const [search, setSearch] = useFilterPreference<string>("accounts-search", ""), [removed, setRemoved] = useFilterPreference<boolean>("accounts-removed", false);
  const [editing, setEditing] = useDialogState<User | null>("account-edit", null);
  const [create, setCreate] = useDialogState<boolean | null>("account-create", null);
  const [permissionTarget, setPermissionTarget] = useState<User | null>(null);
  const [permissionUnavailable, setPermissionUnavailable] = useState(false);
  const closePermissions = useCallback(() => setPermissionTarget(null), []);
  const permissionAuthorityLost = useCallback(() => { setPermissionUnavailable(true); setPermissionTarget(null); showActionToast("error", "permissions.authorityLost"); }, []);
  const [role, setRole] = useState("teacher"), [identity, setIdentity] = useState("");
  const canManageAdministrators = actor.canManageAdministrators === true;
  const permissionManager = !permissionUnavailable && canManageAdministrators && (actor.isOwner === true || actor.isGroupChief === true);
  const currentPermissionTarget = users.find(user => user.id === permissionTarget?.id);
  const permissionTargetAllowed = Boolean(permissionManager && currentPermissionTarget?.role === "admin" && currentPermissionTarget.id !== actor.id && !currentPermissionTarget.isOwner && !currentPermissionTarget.isGroupChief);
  useEffect(() => { if (permissionTarget && !permissionTargetAllowed) { closePermissions(); showActionToast("error", "permissions.authorityLost"); } }, [permissionTarget, permissionTargetAllowed, closePermissions]);
  const selectedRole = role === "admin" && !canManageAdministrators ? "teacher" : role;
  const visible = users.filter(u => Boolean(u.disabledAt) === removed && `${u.name} ${u.email || ""} ${u.username || ""} ${u.teacherName || ""} ${u.studentName || ""}`.toLowerCase().includes(search.toLowerCase()));
  function canManage(u: User) { return u.id !== actor.id && !u.isOwner && !u.isGroupChief && (u.role !== "admin" || canManageAdministrators); }
  function roleLabel(u: User) { return u.isOwner ? "admin.platformOwner" : u.isGroupChief ? "admin.groupChief" : u.role === "admin" ? "admin.regularAdministrator" : u.role === "teacher" ? "老师" : u.role === "student" ? "学生" : "待分配角色"; }
  function edit(u: User) { if (!canManage(u)) return; setRole(u.role === "pending" ? "teacher" : u.role); setIdentity(u.teacherName || u.studentName || ""); setEditing(u); }
  return <section className="panel directory-panel account-directory">
    <div className="section-head directory-section-head"><h2>{t("账号管理")}</h2>{can("accounts.resetPassword")&&!can("accounts.create")&&<Button onClick={()=>setCreate(true)}>{t("重置密码")}</Button>}<Button adminGrant="accounts.create" onClick={() => setCreate(true)}>{t("新建登录账号")}</Button></div>
    <p className="account-authority-hint muted">{t(actor.isOwner ? "admin.accountScopeOwner" : actor.isGroupChief && canManageAdministrators ? "admin.accountScopeChief" : "admin.accountScopeAdministrator")}</p>
    <div className="directory-filters"><label>{t("搜索账号")}<input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("姓名、用户名或邮箱")}/></label><label>{t("显示记录")}<select value={removed ? "removed" : "active"} onChange={e => setRemoved(e.target.value === "removed")}><option value="active">{t("启用中账号")}</option><option value="removed">{t("已停用账号")}</option></select></label></div>
    <div className="directory-toolbar"><Button variant="outline" size="sm" onClick={() => { setSearch(""); setRemoved(false); }}>{t("重置筛选")}</Button><BulkDeleteTool kind="account" records={visible.filter(canManage).map(u => ({ id: u.id, label: u.name + " · " + t(roleLabel(u)) }))} mutate={mutate} busy={busy}/></div>
    {[["pending", "待分配角色"], ["student", "学生账号"], ["teacher", "老师账号"], ["admin", "管理员账号"]].map(([r, label]) => <details className="directory-group" key={r} open={r === "pending" || Boolean(search)}>
      <summary>{t(label)} <span>{visible.filter(u => u.role === r).length}</span></summary>
      {visible.filter(u => u.role === r).map(u => <article key={u.id} className="user-row directory-person-row">
        <div className="directory-person-identity"><strong>{u.name}</strong><span className="account-authority-badge" data-authority={u.isOwner ? "owner" : u.isGroupChief ? "chief" : u.role}>{t(roleLabel(u))}</span>
          {u.teacherName && <small>{t("关联老师")} · {u.teacherName}</small>}{u.studentName && <small>{t("关联学生")} · {u.studentName}</small>}
          <small>{u.username ? `${t("用户名")} · ${u.username}` : t("未设置密码登录")}</small><small>{u.email ? `Google · ${u.email}` : t("未连接 Google")}</small>
          <small>{t(u.assignmentStatus === "PENDING_ASSIGNMENT" ? "待分配" : "已启用")}{u.pendingExpiresAt ? ` · ${Date.parse(u.pendingExpiresAt) <= Date.now() ? t("已到期") : `${t("剩余天数")} ${Math.ceil((Date.parse(u.pendingExpiresAt) - Date.now()) / 86400000)}`}` : u.role === "pending" && u.assignmentStatus !== "ACTIVE" ? ` · ${t("不纳入自动清理")}` : ""}</small>
          {actor.isOwner && u.isGroupChief && <small className="field-hint">{t("admin.chiefAccountProtected")}</small>}
        </div>
        {canManage(u) && <div className="user-actions directory-person-actions">
          {permissionManager && u.role === "admin" && <Button disabled={busy} size="sm" variant="outline" onClick={() => setPermissionTarget(u)}>{t("permissions.title")}</Button>}
          {!u.disabledAt && <>{u.assignmentStatus === "PENDING_ASSIGNMENT" && <Button adminGrant="accounts.activate" disabled={busy} size="sm" variant="outline" onClick={() => void mutate({ action: "activateAccount", userId: u.id })}>{t("保留并启用账号")}</Button>}<Button adminGrant="accounts.assign" disabled={busy} size="sm" variant="outline" onClick={() => edit(u)}>{t("分配角色与身份")}</Button></>}
          <Button adminGrant={u.disabledAt?"accounts.restore":"accounts.disable"} disabled={busy} size="sm" variant="outline" onClick={() => { if (u.disabledAt || window.confirm(t("确定停用此账号？停用后无法登录，可稍后恢复启用。"))) void mutate({ action: u.disabledAt ? "restoreAccount" : "deleteAccount", userId: u.id }); }}>{t(u.disabledAt ? "恢复启用" : "停用账号")}</Button>
          <DeleteButton kind="account" id={u.id} mutate={mutate} busy={busy} message="永久删除此账号、登录方式及个人学习计划？历史课程记录保留；名下仍有功课或教学资料时，请先处理后再删除。"/>
        </div>}
      </article>)}
    </details>)}
    {!visible.length && <p className="empty">{t("没有符合条件的记录")}</p>}
    {permissionTarget && permissionTargetAllowed && <Suspense fallback={<Dialog open onOpenChange={open => { if (!open) closePermissions(); }}><DialogContent className="admin-permission-dialog" overlayClassName="admin-permission-overlay"><DialogHeader><DialogTitle>{t("permissions.title")}</DialogTitle></DialogHeader><p role="status">{t("permissions.loading")}</p><div className="settings-actions"><Button variant="outline" onClick={closePermissions}>{t("permissions.cancel")}</Button></div></DialogContent></Dialog>}><AdminPermissionEditor accountId={permissionTarget.id} accountName={currentPermissionTarget?.name || permissionTarget.name} onClose={closePermissions} onAuthorityLost={permissionAuthorityLost}/></Suspense>}
    <Dialog open={Boolean(create)&&(can("accounts.create")||can("accounts.resetPassword"))} onOpenChange={open => setCreate(open ? true : null)}><DialogContent className="lesson-dialog directory-dialog"><DialogHeader><DialogTitle>{t(can("accounts.create")?"创建登录账号":"重置密码")}</DialogTitle></DialogHeader>{createForm}</DialogContent></Dialog>
    <Dialog open={Boolean(editing)&&can("accounts.assign")} onOpenChange={open => { if (!open) setEditing(null); }}><DialogContent className="lesson-dialog"><DialogHeader><DialogTitle>{t("分配角色与身份")}</DialogTitle></DialogHeader><div className="directory-dialog-identity"><strong>{editing?.name}</strong><span className="muted">{editing?.email || editing?.username}</span></div>
      <form onSubmit={async e => { e.preventDefault(); const current = users.find(user => user.id === editing?.id); if (!current || !canManage(current)) { setEditing(null); return; } if (await mutate({ action: "bind", userId: current.id, role: selectedRole, teacherName: selectedRole === "teacher" ? identity : "", studentName: selectedRole === "student" ? identity : "" })) setEditing(null); }}>
        <label>{t("角色")}<select value={selectedRole} onChange={e => { setRole(e.target.value); setIdentity(""); }}><option value="teacher">{t("老师")}</option><option value="student">{t("学生")}</option>{canManageAdministrators && <option value="admin">{t("admin.regularAdministrator")}</option>}</select></label>
        {selectedRole !== "admin" && <label>{t(selectedRole === "teacher" ? "关联老师" : "关联学生")}<select required value={identity} onChange={e => setIdentity(e.target.value)}><option value="">{t("请选择")}</option>{(selectedRole === "teacher" ? teachers : students).map(n => <option key={n}>{n}</option>)}</select></label>}
        <div className="directory-form-actions"><Button disabled={busy}>{t("保存身份分配")}</Button></div>
      </form>
    </DialogContent></Dialog>
  </section>;
}
