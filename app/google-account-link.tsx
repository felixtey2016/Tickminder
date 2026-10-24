"use client";

import { useEffect, useRef, useState } from "react";
import { groupFetch } from "@/lib/group-client";
import { alertActionFailure, readApiJson, showActionToast } from "@/lib/action-feedback";
import { type Language, t } from "@/lib/i18n";

type Google = { accounts: { id: { initialize: (args: object) => void; renderButton: (element: HTMLElement, args: object) => void } } };

/** Both settings and first-login guidance use the existing verified linking API. */
export function GoogleAccountLink({ clientId, language, onLinked, onBusyChange }: {
  clientId: string | null;
  language: Language;
  onLinked: () => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [loadFailed, setLoadFailed] = useState(false);
  const button = useRef<HTMLDivElement>(null), passwordRef = useRef(""), inFlight = useRef(false);
  const callbacks = useRef({ onLinked, onBusyChange });
  passwordRef.current = password;
  callbacks.current = { onLinked, onBusyChange };
  useEffect(() => {
    if (!clientId || !button.current) return;
    let active = true;
    const setup = () => {
      const google = (window as Window & { google?: Google }).google;
      if (!active || !google || !button.current) return;
      setLoadFailed(false);
      google.accounts.id.initialize({ client_id: clientId, callback: async ({ credential }: { credential: string }) => {
        if (!active || inFlight.current) return;
        if (!passwordRef.current) { alertActionFailure(new Error(t("请输入当前密码后连接 Google"))); return; }
        inFlight.current = true; setBusy(true); callbacks.current.onBusyChange?.(true);
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
          if (!result.response.ok) throw new Error(t(result.data.error || "Google 连接失败，请重新验证后再试"));
          setPassword("");
          await callbacks.current.onLinked();
          window.dispatchEvent(new Event("timelyo:auth-refresh"));
          showActionToast("success", "Google 账号已连接");
        } catch (error) { alertActionFailure(error); }
        finally { inFlight.current = false; if (active) setBusy(false); callbacks.current.onBusyChange?.(false); }
      } });
      button.current.innerHTML = "";
      google.accounts.id.renderButton(button.current, { theme: "outline", size: "large", width: Math.min(320, button.current.clientWidth || 240), locale: language === "zh" ? "zh_CN" : "en" });
    };
    const failed = () => { if (active) setLoadFailed(true); };
    let script = document.querySelector<HTMLScriptElement>("#timelyo-google-script");
    if (!script) { script = document.createElement("script"); script.id = "timelyo-google-script"; script.src = "https://accounts.google.com/gsi/client"; script.async = true; document.head.appendChild(script); }
    script.addEventListener("load", setup); script.addEventListener("error", failed); setup();
    return () => { active = false; script?.removeEventListener("load", setup); script?.removeEventListener("error", failed); };
  }, [clientId, language]);
  return <div className="account-connect">
    <label>{t("当前密码")}<input type="password" autoComplete="current-password" maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={busy}/></label>
    {clientId ? <div ref={button} className={busy ? "google-link-busy settings-actions" : "settings-actions"} aria-busy={busy}/> : <p>{t("Google 登录尚未配置")}</p>}
    {loadFailed && <p role="status">{language === "zh" ? "Google 暂时无法载入，可稍后在「我的账号」连接。" : "Google could not load. You can link it later in My account."}</p>}
    {busy && <p role="status">{t("正在连接…")}</p>}
  </div>;
}
