"use client";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {PasswordInput} from "@/components/password-input";
import {LegalLinks} from "@/components/legal-links";
import {BRAND_NAME} from "@/lib/brand";
import {t,type Language} from "@/lib/i18n";
import {PasswordRecoveryButton} from "./password-recovery";

export function AuthBrandLogo({ small = false }: { small?: boolean }) { return <span className={`brand-logo ${small ? "small" : ""}`}><img src="/tickminder-logo.svg" width={small ? 40 : 80} height={small ? 40 : 80} alt={BRAND_NAME} /></span>; }
export function AuthLanguageSwitcher({ language, change }: { language: Language; change: (next: Language) => void }) { return <div className="language-switch" role="group" aria-label={t("语言")}><button type="button" aria-pressed={language === "zh"} onClick={() => change("zh")}>中文</button><span className="language-separator" aria-hidden="true">|</span><button type="button" aria-pressed={language === "en"} onClick={() => change("en")}>EN</button></div>; }
export function LoginForm({ googleButton, clientId, login, busy, message, language, changeLanguage,invitedGroup }: {
    invitedGroup?:string;
    googleButton: React.RefObject<HTMLDivElement | null>;
    clientId: string | null;
    login: (username: string, password: string) => Promise<void>;
    busy: boolean;
    message: string;
    language: Language;
    changeLanguage: (next: Language) => void;
}) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    return <main className="auth-shell auth-login-shell"><div className="auth-layout"><section className="auth-story"><div className="auth-story-brand"><AuthBrandLogo/><strong>{BRAND_NAME}</strong></div><img className="auth-story-illustration" src="/mascots/reading.png" width={512} height={512} alt="" loading="lazy" decoding="async"/><h2>{t("学习与协作")}</h2><p>{t("集中管理课程日程、功课与教学资料。")}</p></section><div className="auth-card"><div className="auth-login-heading"><div className="auth-mobile-brand"><AuthBrandLogo small/><strong>{BRAND_NAME}</strong></div><AuthLanguageSwitcher language={language} change={changeLanguage}/></div><p className="eyebrow">{language === "zh" ? `欢迎使用 ${BRAND_NAME}` : `Welcome to ${BRAND_NAME}`}</p><h1>{t("登录")}</h1>{invitedGroup&&<p className="notice">{t("注册加入")} · {invitedGroup}</p>}<p>{t("使用密码或 Google 账号登录")}</p>
    <form onSubmit={e => { e.preventDefault(); login(username, password); }}><label>{t("邮箱或用户名")}<input name="username" required autoComplete="username" autoCapitalize="none" maxLength={254} value={username} onChange={e => setUsername(e.target.value)}/></label><label>{t("\u5BC6\u7801")}<PasswordInput name="password" required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></label><Button className="primary-full" disabled={busy}>{t("登录")}</Button></form>
    <p className="auth-divider">{t("\u6216\u4F7F\u7528 Google \u767B\u5F55")}</p>{clientId ? <div ref={googleButton} className="google-signin"/> : <div className="notice">{t("Google \u767B\u5F55\u5C1A\u672A\u914D\u7F6E\uFF1B\u53EF\u4EE5\u4F7F\u7528\u7BA1\u7406\u5458\u521B\u5EFA\u7684\u8D26\u53F7\u5BC6\u7801\u3002")}</div>}{busy && <small>{t("\u6B63\u5728\u9A8C\u8BC1\u8D26\u53F7\u2026")}</small>}{message && <div className="error" role="alert">{message}</div>}<PasswordRecoveryButton language={language} initialIdentifier={username} disabled={busy}/><p className="auth-legal-note">{t("登录前，请阅读服务条款与隐私政策。")}</p><LegalLinks language={language} className="auth-legal"/></div></div></main>;
}
