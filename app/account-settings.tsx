"use client";
import {WhatsAppBinding} from "./whatsapp-binding";
import {groupFetch} from "@/lib/group-client";

import { useEffect, useRef, useState } from "react";
import { alertActionFailure, readApiJson, showActionToast } from "@/lib/action-feedback";
import { getLanguage, t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ChevronDown, KeyRound, Link2, MessageCircle, Phone, ShieldCheck, UserRound } from "lucide-react";
import "./settings-compact.css";
import { GoogleAccountLink } from "./google-account-link";
import { StudentContactForm } from "./student-contact-onboarding";

type Auth = { account: { name: string; role?: string; groupId?: string; email?: string; username?: string; googleLinked?: boolean; emailLoginAvailable?: boolean; studentName?: string | null; contactPhone?: string | null; contactPhoneKind?: "student" | "parent" | null; contactPhoneUpdatedAt?: string | null }; clientId: string | null };
export function AccountSettings() {
  const [current,setCurrent]=useState(""),[next,setNext]=useState(""),[confirm,setConfirm]=useState("");
  const passwordInFlight=useRef(false);
  async function changePassword(event:React.FormEvent) {
    event.preventDefault();if(passwordInFlight.current)return;
    if(next!==confirm){alertActionFailure(new Error(t("两次输入的新密码不一致")));return;}
    passwordInFlight.current=true;setBusy(true);
    try{
      const response=await groupFetch("/api/password",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({currentPassword:current,newPassword:next})});
      const result=await readApiJson<{error?:string}>(response);
      if(!response.ok)throw new Error(t(result.error||"保存失败，请重试"));
      setCurrent("");setNext("");setConfirm("");showActionToast("success","密码已更新");window.dispatchEvent(new Event("timelyo:auth-refresh"));
    }catch(error){alertActionFailure(error);}finally{passwordInFlight.current=false;setBusy(false);}
  }
  const [auth, setAuth] = useState<Auth | null>(null), [busy, setBusy] = useState(false), [googleOpen, setGoogleOpen] = useState(false);
  async function refresh() { const response = await groupFetch("/api/auth", { cache: "no-store" }); const data = await readApiJson<Auth>(response); if (!response.ok || !data.account) throw new Error("登录已过期，请重新登录"); setAuth(data); }
  useEffect(() => { void refresh().catch(alertActionFailure); }, []);
  const language = getLanguage();
  const signInMethods = [auth?.account.username ? t("用户名与密码") : "", auth?.account.emailLoginAvailable ? t("邮箱与密码") : "", auth?.account.googleLinked ? "Google" : ""].filter(Boolean);
  return <div className="account-settings-compact"><section className="panel account-settings"><h2><ShieldCheck size={20} aria-hidden="true"/>{t("登录与安全")}</h2>{auth?.account ? <>
    <div className="account-summary"><div className="account-profile-heading"><span className="account-profile-icon" aria-hidden="true"><UserRound size={22}/></span><div><strong className="account-summary-name">{auth.account.name}</strong><div className="account-login-methods"><span>{t("可用登录方式")}</span><div className="account-method-list">{signInMethods.length ? signInMethods.map(method=><span key={method}>{method}</span>) : <span>—</span>}</div></div></div></div><details className="settings-disclosure account-details"><summary><UserRound size={18} aria-hidden="true"/><span>{language === "zh" ? "账号资料" : "Account details"}</span><ChevronDown size={18} aria-hidden="true"/></summary><dl className="account-summary-fields">
      <div><dt>{t("用户名")}</dt><dd>{auth.account.username || "—"}</dd></div>
      <div><dt>Google</dt><dd>{auth.account.email || t("未连接 Google")}</dd></div>
    </dl></details></div>
    {auth.account.username && !auth.account.googleLinked && <details className="settings-disclosure account-security-section" onToggle={event => setGoogleOpen(event.currentTarget.open)}><summary><Link2 size={18} aria-hidden="true"/><span>{t("连接 Google 账号")}</span><ChevronDown size={18} aria-hidden="true"/></summary><p className="muted">{t("连接后可用密码或 Google 登录同一个账号。")}</p>{googleOpen && <GoogleAccountLink clientId={auth.clientId} language={language} onLinked={refresh} onBusyChange={setBusy}/>}</details>}
    {auth.account.username && <details className="settings-disclosure account-security-section"><summary><KeyRound size={18} aria-hidden="true"/><span>{t("修改密码")}</span><ChevronDown size={18} aria-hidden="true"/></summary><form className="account-password-form" onSubmit={changePassword}><label>{t("当前密码")}<input required type="password" autoComplete="current-password" maxLength={128} value={current} onChange={e=>setCurrent(e.target.value)}/></label><label>{t("新密码（至少 8 个字符）")}<input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={next} onChange={e=>setNext(e.target.value)}/></label><label>{t("确认新密码")}<input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><div className="settings-actions"><Button disabled={busy}>{t("更新密码")}</Button></div></form></details>}
  </> : <p role="status">{t("正在加载…")}</p>}</section>{auth?.account.role === "student" && <section className="panel account-contact-panel"><h2><Phone size={20} aria-hidden="true"/>{language === "zh" ? "联系号码" : "Contact number"}</h2><StudentContactForm key={auth.account.contactPhoneUpdatedAt || auth.account.contactPhone || "new"} name={auth.account.studentName || auth.account.name} initialPhone={auth.account.contactPhone} initialKind={auth.account.contactPhoneKind} language={language} onSaved={async()=>{await refresh();window.dispatchEvent(new Event("timelyo:auth-refresh"));}}/></section>}{auth && auth.account.groupId === "next-genn-edu" && ["admin","teacher","student","pending"].includes(auth.account.role || "") && <details className="panel settings-disclosure account-whatsapp"><summary><MessageCircle size={20} aria-hidden="true"/><span>{language === "zh" ? "连接 WhatsApp" : "Connect WhatsApp"}</span><ChevronDown size={18} aria-hidden="true"/></summary><WhatsAppBinding/></details>}</div>;
}
