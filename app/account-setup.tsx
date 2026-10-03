"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LegalLinks } from "@/components/legal-links";
import { BRAND_NAME } from "@/lib/brand";
import { t, type Language } from "@/lib/i18n";
import { alertActionFailure, readApiJson, showActionToast } from "@/lib/action-feedback";

export function AccountSetup({email,onSaved,logout,language,changeLanguage}:{email?:string;onSaved:()=>Promise<void>;logout:()=>Promise<void>;language:Language;changeLanguage:(next:Language)=>void}) {
  const [username,setUsername]=useState(""),[password,setPassword]=useState(""),[confirm,setConfirm]=useState(""),[busy,setBusy]=useState(false);
  const inFlight=useRef(false);
  async function submit(event:React.FormEvent) {
    event.preventDefault(); if(inFlight.current)return;
    if(password!==confirm){alertActionFailure(new Error(t("两次输入的新密码不一致")));return;}
    inFlight.current=true;setBusy(true);
    try{
      const response=await fetch("/api/account-setup",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username,password})});
      const result=await readApiJson<{error?:string}>(response);
      if(!response.ok)throw new Error(t(result.error||"账号设置未完成，请重新登录后重试"));
      setPassword("");setConfirm("");showActionToast("success","账号设置已完成");await onSaved();
    }catch(error){alertActionFailure(error);}finally{inFlight.current=false;setBusy(false);}
  }
  return <main className="auth-shell"><div className="auth-card account-setup"><div className="language-switch" role="group" aria-label="Language / 语言"><button type="button" aria-pressed={language==="zh"} onClick={()=>changeLanguage("zh")}>中文</button><button type="button" aria-pressed={language==="en"} onClick={()=>changeLanguage("en")}>EN</button></div><span className="brand-logo"><img src="/timelyo-logo.png" alt={BRAND_NAME}/></span><h1>{t("设置登录账号")}</h1><p>{t("为当前账号设置用户名和密码。原有课程、功课与权限会保留。")}</p><p className="muted">Google · {email}</p><form onSubmit={submit}><label>{t("用户名")}<input required autoComplete="username" minLength={3} maxLength={40} pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,39}" value={username} onChange={e=>setUsername(e.target.value)}/><small>{t("3–40 个字符，可使用英文字母、数字、点、横线或底线。")}</small></label><label>{t("新密码（至少 8 个字符）")}<input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label><label>{t("确认新密码")}<input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><Button disabled={busy} className="primary-full">{t(busy?"正在保存…":"保存并继续")}</Button></form><p className="muted">{t("已有密码账号？请先退出，用原账号登录，再在「我的账号」连接 Google。")}</p><Button type="button" variant="outline" disabled={busy} onClick={logout}>{t("退出登录")}</Button><LegalLinks language={language} className="auth-legal"/></div></main>;
}
