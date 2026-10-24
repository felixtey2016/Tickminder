"use client";
import {WhatsAppBinding} from "./whatsapp-binding";
import {groupFetch} from "@/lib/group-client";

import { useEffect, useRef, useState } from "react";
import { alertActionFailure, readApiJson, showActionToast } from "@/lib/action-feedback";
import { getLanguage, t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import "./settings-compact.css";

type Auth = { account: { name: string; role?: string; groupId?: string; email?: string; username?: string; googleLinked?: boolean; emailLoginAvailable?: boolean }; clientId: string | null };
type Google = { accounts: { id: { initialize: (args: object) => void; renderButton: (element: HTMLElement, args: object) => void } } };
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
  const [auth, setAuth] = useState<Auth | null>(null), [password, setPassword] = useState(""), [busy, setBusy] = useState(false);
  const button = useRef<HTMLDivElement>(null), passwordRef = useRef(""), inFlight = useRef(false);
  passwordRef.current = password;
  async function refresh() { const response = await groupFetch("/api/auth", { cache: "no-store" }); const data = await readApiJson<Auth>(response); if (!response.ok || !data.account) throw new Error("登录已过期，请重新登录"); setAuth(data); }
  useEffect(() => { void refresh().catch(alertActionFailure); }, []);
  const language = getLanguage();
  useEffect(() => {
    if (!auth?.clientId || !auth.account?.username || auth.account.email || !button.current) return;
    let active = true;
    const setup = () => {
      const google = (window as Window & { google?: Google }).google;
      if (!active || !google || !button.current) return;
      google.accounts.id.initialize({ client_id: auth.clientId, callback: async ({ credential }: { credential: string }) => {
        if (inFlight.current) return;
        if (!passwordRef.current) { alertActionFailure(new Error("请输入当前密码后连接 Google")); return; }
        inFlight.current = true; setBusy(true);
        try {
          const send = async (confirmMerge = false) => {
            const response = await groupFetch("/api/account-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential, password: passwordRef.current, confirmMerge }) });
            return { response, data: await readApiJson<{ error?: string; mergeName?: string }>(response) };
          };
          let result = await send();
          if (result.data.mergeName) {
            if (!window.confirm(`${t("确认合并已有 Google 账号？其资料会保留，旧账号将并入当前账号。")}\n${result.data.mergeName}`)) return;
            result = await send(true);
          }
          if (!result.response.ok) throw new Error(result.data.error || "Google 连接失败，请重新验证后再试");
          setPassword(""); await refresh(); window.dispatchEvent(new Event("timelyo:auth-refresh")); showActionToast("success", "Google 账号已连接");
        } catch (error) { alertActionFailure(error); }
        finally { inFlight.current = false; setBusy(false); }
      } });
      button.current.innerHTML = "";
      google.accounts.id.renderButton(button.current, { theme: "outline", size: "large", width: 280, locale: language === "zh" ? "zh_CN" : "en" });
    };
    let script = document.querySelector<HTMLScriptElement>("#timelyo-google-script");
    if (!script) { script = document.createElement("script"); script.id = "timelyo-google-script"; script.src = "https://accounts.google.com/gsi/client"; script.async = true; document.head.appendChild(script); }
    script.addEventListener("load", setup); setup();
    return () => { active = false; script?.removeEventListener("load", setup); };
  }, [auth, language]);
  const signInMethods = [auth?.account.username ? t("用户名与密码") : "", auth?.account.emailLoginAvailable ? t("邮箱与密码") : "", auth?.account.googleLinked ? "Google" : ""].filter(Boolean);
  return <div className="account-settings-compact"><section className="panel account-settings"><h2>{t("登录与安全")}</h2>{auth?.account ? <>
    <div className="account-summary"><strong className="account-summary-name">{auth.account.name}</strong><p className="account-login-methods">{t("可用登录方式")} · {signInMethods.join(" / ") || "—"}</p><details className="settings-disclosure account-details"><summary><span>{language === "zh" ? "账号资料" : "Account details"}</span><ChevronDown size={18} aria-hidden="true"/></summary><dl className="account-summary-fields">
      <div><dt>{t("用户名")}</dt><dd>{auth.account.username || "—"}</dd></div>
      <div><dt>Google</dt><dd>{auth.account.email || t("未连接 Google")}</dd></div>
    </dl></details></div>
    {auth.account.username && !auth.account.email && <details className="settings-disclosure account-security-section"><summary><span>{t("连接 Google 账号")}</span><ChevronDown size={18} aria-hidden="true"/></summary><div className="account-connect"><p className="muted">{t("连接后可用密码或 Google 登录同一个账号。")}</p><label>{t("当前密码")}<input type="password" autoComplete="current-password" maxLength={128} value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/></label>{auth.clientId ? <div ref={button} className={busy ? "google-link-busy settings-actions" : "settings-actions"}/> : <p>{t("Google 登录尚未配置")}</p>}{busy && <p role="status">{t("正在连接…")}</p>}</div></details>}
    {auth.account.username && <details className="settings-disclosure account-security-section"><summary><span>{t("修改密码")}</span><ChevronDown size={18} aria-hidden="true"/></summary><form className="account-password-form" onSubmit={changePassword}><label>{t("当前密码")}<input required type="password" autoComplete="current-password" maxLength={128} value={current} onChange={e=>setCurrent(e.target.value)}/></label><label>{t("新密码（至少 8 个字符）")}<input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={next} onChange={e=>setNext(e.target.value)}/></label><label>{t("确认新密码")}<input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><div className="settings-actions"><Button disabled={busy}>{t("更新密码")}</Button></div></form></details>}
  </> : <p>{t("正在加载…")}</p>}</section>{auth && auth.account.groupId === "next-genn-edu" && ["admin","teacher","student","pending"].includes(auth.account.role || "") && <details className="panel settings-disclosure account-whatsapp"><summary><span>{language === "zh" ? "连接 WhatsApp" : "Connect WhatsApp"}</span><ChevronDown size={18} aria-hidden="true"/></summary><WhatsAppBinding/></details>}</div>;
}
