"use client";
import { useEffect, useRef, useState } from "react";
import { alertActionFailure, readApiJson, showActionToast } from "@/lib/action-feedback";
import { getLanguage, t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

type Auth = { account: { name: string; email?: string; username?: string; googleLinked?: boolean; emailLoginAvailable?: boolean }; clientId: string | null };
type Google = { accounts: { id: { initialize: (args: object) => void; renderButton: (element: HTMLElement, args: object) => void } } };
export function AccountSettings() {
  const [current,setCurrent]=useState(""),[next,setNext]=useState(""),[confirm,setConfirm]=useState("");
  const passwordInFlight=useRef(false);
  async function changePassword(event:React.FormEvent) {
    event.preventDefault();if(passwordInFlight.current)return;
    if(next!==confirm){alertActionFailure(new Error(t("两次输入的新密码不一致")));return;}
    passwordInFlight.current=true;setBusy(true);
    try{
      const response=await fetch("/api/password",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({currentPassword:current,newPassword:next})});
      const result=await readApiJson<{error?:string}>(response);
      if(!response.ok)throw new Error(t(result.error||"保存失败，请重试"));
      setCurrent("");setNext("");setConfirm("");showActionToast("success","密码已更新");window.dispatchEvent(new Event("timelyo:auth-refresh"));
    }catch(error){alertActionFailure(error);}finally{passwordInFlight.current=false;setBusy(false);}
  }
  const [auth, setAuth] = useState<Auth | null>(null), [password, setPassword] = useState(""), [busy, setBusy] = useState(false);
  const button = useRef<HTMLDivElement>(null), passwordRef = useRef(""), inFlight = useRef(false);
  passwordRef.current = password;
  async function refresh() { const response = await fetch("/api/auth", { cache: "no-store" }); const data = await readApiJson<Auth>(response); if (!response.ok || !data.account) throw new Error("登录已过期，请重新登录"); setAuth(data); }
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
            const response = await fetch("/api/account-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential, password: passwordRef.current, confirmMerge }) });
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
  return <section className="panel"><h2>{t("我的账号")}</h2>{auth?.account ? <><p><strong>{auth.account.name}</strong></p><p>{t("用户名")} · {auth.account.username || "—"}</p><p>Google · {auth.account.email || t("未连接 Google")}</p><p className="muted">{t("可用登录方式")} · {t("用户名与密码")}{auth.account.emailLoginAvailable ? ` / ${t("邮箱与密码")}` : ""}{auth.account.googleLinked ? " / Google" : ""}</p>{auth.account.username && !auth.account.email && <div className="account-connect"><h3>{t("连接 Google 账号")}</h3><p className="muted">{t("连接后可用密码或 Google 登录同一个账号。")}</p><label>{t("当前密码")}<input type="password" autoComplete="current-password" maxLength={128} value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/></label>{auth.clientId ? <div ref={button} className={busy ? "google-link-busy" : ""}/> : <p>{t("Google 登录尚未配置")}</p>}{busy && <p role="status">{t("正在连接…")}</p>}</div>}{auth.account.username && <form className="account-password-form" onSubmit={changePassword}><h3>{t("修改密码")}</h3><label>{t("当前密码")}<input required type="password" autoComplete="current-password" maxLength={128} value={current} onChange={e=>setCurrent(e.target.value)}/></label><label>{t("新密码（至少 8 个字符）")}<input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={next} onChange={e=>setNext(e.target.value)}/></label><label>{t("确认新密码")}<input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><Button disabled={busy}>{t("保存新密码")}</Button></form>}</> : <p>{t("正在载入…")}</p>}</section>;
}
