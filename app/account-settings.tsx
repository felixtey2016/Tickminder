"use client";
import {NotificationPreferences,AccountDevices,DisplayPreferences} from './account-preferences';
import {PasswordInput} from '@/components/password-input';
import {PasswordRecoveryButton} from './password-recovery';
import {WhatsAppBinding} from "./whatsapp-binding";
import {groupFetch} from "@/lib/group-client";

import { useEffect, useId, useRef, useState } from "react";
import {normalizeUsername, validUsername} from "@/lib/password";
import "@/lib/account-username-i18n";
import { actionFailureMessage, alertActionFailure, readApiJson, showActionToast } from "@/lib/action-feedback";
import { PageState } from "@/components/page-state";
import { getLanguage, t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ChevronDown, KeyRound, Link2, MessageCircle, Phone, ShieldCheck, UserRound } from "lucide-react";
import "./settings-compact.css";
import { GoogleAccountLink } from "./google-account-link";
import { StudentContactForm } from "./student-contact-onboarding";

type Auth = { account: { name: string; role?: string; groupId?: string; email?: string; username?: string; googleLinked?: boolean; emailLoginAvailable?: boolean; studentName?: string | null; contactPhone?: string | null; contactPhoneKind?: "student" | "parent" | null; contactPhoneUpdatedAt?: string | null }; clientId: string | null };
export function AccountSettings() {
  const [current,setCurrent]=useState(""),[next,setNext]=useState(""),[confirm,setConfirm]=useState("");
  const passwordInFlight=useRef(false), usernameInFlight=useRef(false);
  async function changePassword(event:React.FormEvent) {
    event.preventDefault();if(passwordInFlight.current||usernameInFlight.current)return;
    if(next!==confirm){alertActionFailure(new Error(t("两次输入的新密码不一致")));return;}
    passwordInFlight.current=true;setBusy(true);
    try{
      const response=await groupFetch("/api/password",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({currentPassword:current,newPassword:next})});
      const result=await readApiJson<{error?:string}>(response);
      if(!response.ok)throw new Error(t(result.error||"保存失败，请重试"));
      setCurrent("");setNext("");setConfirm("");showActionToast("success","密码已更新");window.dispatchEvent(new Event("timelyo:auth-refresh"));
    }catch(error){alertActionFailure(error);}finally{passwordInFlight.current=false;setBusy(false);}
  }
  const [auth, setAuth] = useState<Auth | null>(null), [busy, setBusy] = useState(false), [googleOpen, setGoogleOpen] = useState(false), [loadError,setLoadError]=useState("");
  async function refresh() {
    setLoadError("");
    try { const response = await groupFetch("/api/auth", { cache: "no-store" }); const data = await readApiJson<Auth>(response); if (!response.ok || !data.account) throw new Error(t(response.ok||response.status===401?"登录已过期，请重新登录":"页面加载失败")); setAuth(data); }
    catch(error){setLoadError(actionFailureMessage(error));throw error;}
  }
  useEffect(() => { void refresh().catch(alertActionFailure); }, []);
  const [usernameEditing,setUsernameEditing]=useState(false),[usernameDraft,setUsernameDraft]=useState("");
  const [usernameSaving,setUsernameSaving]=useState(false),[usernameError,setUsernameError]=useState("");
  const [usernameStatus,setUsernameStatus]=useState<""|"saved"|"refreshFailed">("");
  const usernameInput=useRef<HTMLInputElement>(null),usernameEditButton=useRef<HTMLButtonElement>(null),usernameId=useId();
  const usernameUnchanged=normalizeUsername(usernameDraft)===normalizeUsername(auth?.account.username);
  function editUsername(){
    if(busy||usernameInFlight.current||!auth?.account.username)return;
    setUsernameDraft(auth.account.username);setUsernameError("");setUsernameStatus("");setUsernameEditing(true);
  }
  function closeUsernameEditor(){
    if(usernameInFlight.current)return;
    setUsernameEditing(false);setUsernameDraft("");setUsernameError("");
    requestAnimationFrame(()=>usernameEditButton.current?.focus());
  }
  async function changeUsername(event:React.FormEvent){
    event.preventDefault();
    if(usernameInFlight.current||passwordInFlight.current||busy||!auth?.account.username)return;
    const username=normalizeUsername(usernameDraft);
    if(!validUsername(username)){
      setUsernameError(t("账号需为 3–40 位英文字母、数字、点、横线或底线，且以字母或数字开头"));usernameInput.current?.focus();return;
    }
    if(username===normalizeUsername(auth.account.username))return;
    usernameInFlight.current=true;setUsernameSaving(true);setBusy(true);setUsernameError("");setUsernameStatus("");
    try{
      const response=await groupFetch("/api/username",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username})});
      const result=await readApiJson<{ok?:boolean;username?:string;changed?:boolean;error?:string}>(response);
      if(!response.ok)throw new Error(t(result.error||"保存失败，请重试"));
      if(result.ok!==true||typeof result.username!=="string"||!validUsername(result.username)||normalizeUsername(result.username)!==result.username)throw new Error(t("服务器未返回有效响应，请稍后重试"));
      const savedUsername=result.username;
      setAuth(previous=>previous?{...previous,account:{...previous.account,username:savedUsername}}:previous);
      setUsernameDraft("");setUsernameEditing(false);setUsernameStatus("saved");
      showActionToast("success","accountUsername.saved");
      try{await refresh();}catch{setUsernameStatus("refreshFailed");}
      window.dispatchEvent(new Event("timelyo:auth-refresh"));
      requestAnimationFrame(()=>usernameEditButton.current?.focus());
    }catch(error){setUsernameError(actionFailureMessage(error));}
    finally{usernameInFlight.current=false;setUsernameSaving(false);setBusy(false);}
  }
  const language = getLanguage();
  const signInMethods = [auth?.account.username ? t("用户名与密码") : "", auth?.account.emailLoginAvailable ? t("邮箱与密码") : "", auth?.account.googleLinked ? "Google" : ""].filter(Boolean);
  return <div className="account-settings-compact"><section className="panel account-settings"><h2><ShieldCheck size={20} aria-hidden="true"/>{t("登录与安全")}</h2>{auth?.account ? <>
    <div className="account-summary"><div className="account-profile-heading"><span className="account-profile-icon" aria-hidden="true"><UserRound size={22}/></span><div><strong className="account-summary-name">{auth.account.name}</strong><div className="account-login-methods"><span>{t("可用登录方式")}</span><div className="account-method-list">{signInMethods.length ? signInMethods.map(method=><span key={method}>{method}</span>) : <span>—</span>}</div></div></div></div><details className="settings-disclosure account-details"><summary><UserRound size={18} aria-hidden="true"/><span>{language === "zh" ? "账号资料" : "Account details"}</span><ChevronDown size={18} aria-hidden="true"/></summary><dl className="account-summary-fields">
      <div><dt>{t("用户名")}</dt><dd className="account-username-value"><span className="account-username-current" data-testid="account-current-username">{auth.account.username || "—"}</span>{auth.account.username&&!usernameEditing&&<Button ref={usernameEditButton} type="button" variant="outline" data-testid="edit-username" disabled={busy} onClick={editUsername}>{t("accountUsername.edit")}</Button>}</dd></div>
      <div><dt>Google</dt><dd>{auth.account.email || t("未连接 Google")}</dd></div>
    </dl>
    {auth.account.username&&usernameEditing&&<form className="account-username-form" data-testid="username-form" data-mobile-nav-hide noValidate onSubmit={changeUsername} aria-busy={usernameSaving}>
      <p className="account-username-note" id={usernameId+"-note"}>{t("accountUsername.note")}</p>
      <label htmlFor={usernameId}>{t("accountUsername.new")}<input ref={usernameInput} id={usernameId} name="username" data-testid="username-input" required autoFocus autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={3} maxLength={40} disabled={busy} value={usernameDraft} aria-invalid={Boolean(usernameError)} aria-describedby={usernameId+"-note "+usernameId+"-rules"+(usernameError?" "+usernameId+"-error":"")} onChange={event=>{setUsernameDraft(event.target.value);setUsernameError("");}}/></label>
      <small id={usernameId+"-rules"}>{t("accountUsername.rules")}</small>
      {usernameError&&<p id={usernameId+"-error"} className="account-username-error" data-testid="username-error" role="alert" data-error-popup-ignore>{usernameError}</p>}
      <div className="settings-actions account-username-actions"><Button type="submit" data-testid="save-username" disabled={busy||usernameUnchanged}>{t(usernameSaving?"正在保存…":"accountUsername.save")}</Button><Button type="button" variant="outline" data-testid="cancel-username" disabled={busy} onClick={closeUsernameEditor}>{t("取消")}</Button></div>
    </form>}
    {usernameStatus&&<p className="account-username-status" data-testid="username-success" role="status">{t(usernameStatus==="saved"?"accountUsername.saved":"accountUsername.refreshFailed")}</p>}
    </details></div>
    {auth.account.username && !auth.account.googleLinked && <details className="settings-disclosure account-security-section" onToggle={event => setGoogleOpen(event.currentTarget.open)}><summary><Link2 size={18} aria-hidden="true"/><span>{t("连接 Google 账号")}</span><ChevronDown size={18} aria-hidden="true"/></summary><p className="muted">{t("连接后可用密码或 Google 登录同一个账号。")}</p>{googleOpen && <GoogleAccountLink clientId={auth.clientId} language={language} onLinked={refresh} onBusyChange={setBusy}/>}</details>}
    {auth.account.username && <details className="settings-disclosure account-security-section"><summary><KeyRound size={18} aria-hidden="true"/><span>{t("修改密码")}</span><ChevronDown size={18} aria-hidden="true"/></summary><form className="account-password-form" onSubmit={changePassword}><label>{t("当前密码")}<PasswordInput required type="password" autoComplete="current-password" maxLength={128} value={current} onChange={e=>setCurrent(e.target.value)}/></label><PasswordRecoveryButton language={language} initialIdentifier={auth.account.username} context="settings" disabled={busy}/><label>{t("新密码（至少 8 个字符）")}<PasswordInput required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={next} onChange={e=>setNext(e.target.value)}/></label><label>{t("确认新密码")}<PasswordInput required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><div className="settings-actions"><Button disabled={busy}>{t("更新密码")}</Button></div></form></details>}
  </> : loadError ? <PageState kind="error" title="页面加载失败" description={loadError} action="重试" onAction={()=>void refresh().catch(alertActionFailure)}/> : <p role="status">{t("正在加载…")}</p>}</section>{auth?.account.role === "student" && <section className="panel account-contact-panel"><h2><Phone size={20} aria-hidden="true"/>{language === "zh" ? "联系号码" : "Contact number"}</h2><StudentContactForm key={auth.account.contactPhoneUpdatedAt || auth.account.contactPhone || "new"} name={auth.account.studentName || auth.account.name} initialPhone={auth.account.contactPhone} initialKind={auth.account.contactPhoneKind} language={language} onSaved={async()=>{await refresh();window.dispatchEvent(new Event("timelyo:auth-refresh"));}}/></section>}{auth && auth.account.groupId === "next-genn-edu" && ["admin","teacher","student","pending"].includes(auth.account.role || "") && <details className="panel settings-disclosure account-whatsapp"><summary><MessageCircle size={20} aria-hidden="true"/><span>{language === "zh" ? "连接 WhatsApp" : "Connect WhatsApp"}</span><ChevronDown size={18} aria-hidden="true"/></summary><WhatsAppBinding/></details>}{auth&&<><NotificationPreferences/><AccountDevices/><DisplayPreferences/></>}</div>;
}
