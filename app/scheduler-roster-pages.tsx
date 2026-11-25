"use client";
import { PasswordInput } from '@/components/password-input';
import { getLanguage, t } from "@/lib/i18n";
import { lazy, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonIdentityFields, createPersonIdentityDraft, personIdentityPayload, personIdentityReady } from "./person-identity-fields";
import { PeopleDirectory } from "./directory-tools";
import { useAdminAction } from "./admin-permission-context";
import type {Account,State} from '@/lib/workspace-client-types';
import '@/lib/parents-i18n';
const AccountDirectory = lazy(() => import("./account-directory").then(module => ({default: module.AccountDirectory})));

export function RosterAdmin({ account, state, mutate, busy, view,onAccountsChanged,onOpenAccounts }: {onOpenAccounts?:()=>void; onAccountsChanged?:()=>void; account: Account; state: State | null; mutate: (x: Record<string, unknown>) => Promise<boolean>; busy: boolean; view: "teachers" | "students" | "parents" | "binding" | "accounts" }) {
    if (view === "teachers" || view === "students") return <PeopleDirectory kind={view === "teachers" ? "teacher" : "student"} people={view === "teachers" ? state?.allTeachers || [] : state?.allStudents || []} mutate={mutate} busy={busy} onCreateAccount={onOpenAccounts}/>;
    return <AccountDirectory key={view} roleFilter={view==='parents'?'parent':undefined} onAccountsChanged={onAccountsChanged} actor={account} users={state?.users || []} teachers={state?.teachers || []} students={state?.students || []} mutate={mutate} busy={busy} createForm={onCreated=><LocalAccountAdmin initialRole={view==='parents'?'parent':undefined} account={account} state={state} mutate={mutate} busy={busy} onCreated={onCreated}/>}/>;
}

function LocalAccountAdmin({ account, state, mutate, busy,onCreated,initialRole='student' }: {
    initialRole?:'teacher'|'student'|'parent'|'admin';
    onCreated?:(role:string)=>void;
    account: Account;
    state: State | null;
    mutate: (x: Record<string, unknown>) => Promise<boolean>;
    busy: boolean;
}) {
    const [username,setUsername]=useState(''),[password,setPassword]=useState('');
    const [role,setRole]=useState<'teacher'|'student'|'parent'|'admin'>(initialRole);
    const [person,setPerson]=useState(()=>createPersonIdentityDraft());
    const [resetUserId,setResetUserId]=useState(''),[resetPassword,setResetPassword]=useState('');
    const can=useAdminAction(),canManageAdministrators=account.canManageAdministrators===true;
    const selectedRole=role==='admin'&&!canManageAdministrators||role==='parent'&&!can('parents.manage')?'student':role;
    const localUsers=(state?.users||[]).filter(u=>(u.role!=='parent'||can('parents.manage'))&&u.username&&!u.disabledAt&&u.id!==account.id&&!u.isOwner&&(!u.isGroupChief||account.isOwner)&&(u.role!=='admin'||canManageAdministrators));
    return <section className="local-account-admin"><p className="muted">{getLanguage()==='zh'?'创建后会自动加入对应名单。请把临时密码交给本人。':'The person is added to the matching directory. Give them their temporary password.'}</p>
    {can('accounts.create')&&<form className="account-provisioning-form" onSubmit={async e=>{e.preventDefault();if(!personIdentityReady(selectedRole,person))return;if(await mutate({action:'createLocalAccount',username,password,role:selectedRole,...personIdentityPayload(selectedRole,person)})){setUsername('');setPassword('');setPerson(createPersonIdentityDraft('',can(selectedRole==='teacher'?'teachers.create':'students.create')?'new':'existing'));onCreated?.(selectedRole);}}}>
      <label>{t('角色')}<select value={selectedRole} disabled={busy} onChange={e=>{const next=e.target.value as typeof role;setRole(next);setPerson(createPersonIdentityDraft('',can(next==='teacher'?'teachers.create':'students.create')?'new':'existing'));}}><option value="student">{t('学生')}</option><option value="teacher">{t('老师')}</option>{can('parents.manage')&&<option value="parent">{t('家长')}</option>}{canManageAdministrators&&<option value="admin">{t('admin.regularAdministrator')}</option>}</select></label>
      <PersonIdentityFields role={selectedRole} value={person} onChange={setPerson} teachers={state?.teachers||[]} students={state?.students||[]} canCreatePerson={can(selectedRole==='teacher'?'teachers.create':'students.create')} disabled={busy}/>
      <div className="account-login-grid"><label>{t('用户名')}<input required minLength={3} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,39}" autoComplete="off" value={username} disabled={busy} onChange={e=>setUsername(e.target.value)}/></label><label>{t('临时密码（至少 8 个字符）')}<PasswordInput required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label></div>
      <div className="directory-form-actions"><Button disabled={busy||!personIdentityReady(selectedRole,person)}>{t('创建账号')}</Button></div>
    </form>}
    {can("accounts.resetPassword")&&<details className="local-password-reset settings-disclosure"><summary><span>{t("\u91CD\u7F6E\u5FD8\u8BB0\u7684\u5BC6\u7801")}</span><ChevronDown size={18} aria-hidden="true"/></summary><p className="muted">{t("\u91CD\u7F6E\u540E\uFF0C\u8BE5\u8D26\u53F7\u73B0\u6709\u767B\u5F55\u4F1A\u9000\u51FA\uFF0C\u4E0B\u6B21\u767B\u5F55\u5FC5\u987B\u518D\u6B21\u4FEE\u6539\u5BC6\u7801\u3002")}</p>
    <form onSubmit={async (e) => { e.preventDefault(); if (!localUsers.some(user => user.id === resetUserId)) return; if (await mutate({ action: "resetLocalPassword", userId: resetUserId, password: resetPassword })) {
        setResetUserId("");
        setResetPassword("");
    } }}><label>{t("\u9009\u62E9\u8D26\u53F7")}<select required value={resetUserId} onChange={e => setResetUserId(e.target.value)}><option value="">{t("\u8BF7\u9009\u62E9")}</option>{localUsers.map(u => <option value={u.id} key={u.id}>{u.username} · {u.name}{u.role === "admin" ? ` · ${t(u.isGroupChief ? "admin.groupChief" : "admin.regularAdministrator")}` : ""}</option>)}</select></label><label>{t("新的临时密码")}<PasswordInput required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={resetPassword} onChange={e => setResetPassword(e.target.value)}/></label><div className="directory-form-actions"><Button variant="outline" disabled={busy || !localUsers.some(user => user.id === resetUserId)}>{t("\u91CD\u7F6E\u5BC6\u7801")}</Button></div></form></details>}
  </section>;
}
