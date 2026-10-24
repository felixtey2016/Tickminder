"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { groupFetch } from "@/lib/group-client";
import { alertActionFailure, readApiJson } from "@/lib/action-feedback";
import { BRAND_NAME } from "@/lib/brand";
import { type Language, t } from "@/lib/i18n";
import { GoogleAccountLink } from "./google-account-link";
import "./google-link-onboarding.css";

export function GoogleLinkOnboarding({ name, clientId, language, changeLanguage, onCompleted, logout }: {
  name: string;
  clientId: string | null;
  language: Language;
  changeLanguage: (next: Language) => void;
  onCompleted: () => Promise<void>;
  logout: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false), [linking, setLinking] = useState(false);
  const inFlight = useRef(false);
  async function skip() {
    if (inFlight.current || linking) return;
    inFlight.current = true; setBusy(true);
    try {
      const response = await groupFetch("/api/google-link-onboarding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "skip" }) });
      const data = await readApiJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(t(data.error || "保存失败，请重试"));
      await onCompleted();
    } catch (error) { alertActionFailure(error); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <main className="auth-shell"><div className="auth-card google-link-onboarding">
    <div className="language-switch" role="group" aria-label={t("语言")}><button type="button" aria-pressed={language === "zh"} onClick={() => changeLanguage("zh")}>中文</button><span className="language-divider" aria-hidden="true">|</span><button type="button" aria-pressed={language === "en"} onClick={() => changeLanguage("en")}>EN</button></div>
    <span className="brand-logo"><img src="/tickminder-logo.svg" width="48" height="48" alt={BRAND_NAME}/></span>
    <p className="eyebrow">{name}</p><h1>{t("连接 Google 账号")}</h1>
    <p>{language === "zh" ? "下次可直接用 Google 登录同一个账号。也可以跳过，继续使用用户名与密码。" : "Use Google to sign in to this same account next time, or skip and continue using your username and password."}</p>
    <GoogleAccountLink clientId={clientId} language={language} onLinked={onCompleted} onBusyChange={setLinking}/>
    <div className="google-link-onboarding-actions"><Button type="button" variant="outline" disabled={busy || linking} onClick={skip}>{language === "zh" ? (busy ? "正在保存…" : "跳过，进入网站") : (busy ? "Saving…" : "Skip and continue")}</Button><Button type="button" variant="outline" disabled={busy || linking} onClick={logout}>{t("退出登录")}</Button></div>
    <p className="google-link-onboarding-foot">{language === "zh" ? "以后可在「我的账号」随时连接。" : "You can link Google later in My account."}</p>
  </div></main>;
}
