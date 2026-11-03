"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Check, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PasswordInput } from "@/components/password-input";
import { clearDialogHistory, useDialogState } from "@/lib/use-dialog-state";
import type { Language } from "@/lib/i18n";
import "./password-recovery.css";

const copy = {
  zh: {
    trigger: "忘记密码？", title: "找回密码", intro: "使用账号已绑定的 Google 邮箱验证身份，再设置新密码。",
    identifier: "用户名或已绑定邮箱", help: "未绑定 Google 邮箱？请联系所属集团管理员重置密码。",
    send: "发送验证码", sending: "正在发送…", checking: "正在连接邮件服务…", unavailable: "邮箱找回暂不可用，请联系所属集团管理员重置密码。",
    failed: "暂时无法连接，请稍后重试。", retry: "重试", close: "关闭", sent: "如果这个账号已绑定可用邮箱，我们会发送验证码。请查看收件箱和垃圾邮件。",
    code: "邮箱验证码", codeHint: "输入邮件中的 6 位数字，验证码 10 分钟内有效。", password: "新密码（至少 8 个字符）", confirm: "确认新密码",
    reset: "设置新密码", resetting: "正在更新…", resend: "重新发送", change: "修改账号", expired: "验证码已过期，请重新发送。",
    successTitle: "密码已更新", success: "请使用新密码重新登录。这个账号之前的登录会话已退出。", login: "返回登录",
    identifierError: "请输入有效的用户名或已绑定邮箱。", codeError: "请输入 6 位数字验证码。", passwordError: "新密码需为 8–128 个字符。", mismatch: "两次输入的新密码不一致。",
    invalid: "验证码无效或已过期，请检查后重试，或重新发送。", limited: "操作过于频繁，请稍后再试。", unchanged: "新密码不能与当前密码相同。",
    sendFailed: "邮件暂时无法发送，请稍后重试，或联系管理员。", invalidRequest: "请求无效，请关闭后重新尝试。",
  },
  en: {
    trigger: "Forgot password?", title: "Reset your password", intro: "Verify using the Google email already linked to your account, then choose a new password.",
    identifier: "Username or linked email", help: "No Google email linked? Ask your centre administrator to reset your password.",
    send: "Send code", sending: "Sending…", checking: "Connecting to the email service…", unavailable: "Email recovery is temporarily unavailable. Ask your centre administrator to reset your password.",
    failed: "Could not connect. Please try again shortly.", retry: "Try again", close: "Close", sent: "If this account has an eligible linked email, we will send a code. Check your inbox and spam folder.",
    code: "Email verification code", codeHint: "Enter the 6 digits from the email. The code is valid for 10 minutes.", password: "New password (at least 8 characters)", confirm: "Confirm new password",
    reset: "Set new password", resetting: "Updating…", resend: "Resend code", change: "Change account", expired: "This code has expired. Please request a new one.",
    successTitle: "Password updated", success: "Sign in with your new password. Previous sessions for this account have been signed out.", login: "Back to sign in",
    identifierError: "Enter a valid username or linked email.", codeError: "Enter the 6-digit verification code.", passwordError: "Your new password must contain 8–128 characters.", mismatch: "The new passwords do not match.",
    invalid: "The code is invalid or expired. Check it and try again, or request a new code.", limited: "Too many attempts. Please try again later.", unchanged: "Choose a password different from your current password.",
    sendFailed: "The email could not be sent right now. Try again later or contact your administrator.", invalidRequest: "This request is invalid. Close this window and try again.",
  },
};

type RecoveryResponse = { ok?: boolean; available?: boolean; challenge?: string; retryAfter?: number; expiresIn?: number; error?: string; code?: string };
type Props = { language: Language; initialIdentifier?: string; context?: "login" | "settings"; disabled?: boolean };

function returnToLogin(language: Language) {
  clearDialogHistory();
  // Reload the entire shell so an authenticated settings view cannot keep a stale identity.
  window.location.replace(`/?lang=${language}`);
}

export function PasswordRecoveryButton({ language, initialIdentifier = "", context = "login", disabled }: Props) {
  const [open, setOpen] = useDialogState<true | null>(`password-recovery-${context}`, null);
  const [completed, setCompleted] = useState(false);
  useEffect(() => { if (!open && completed) returnToLogin(language); }, [open, completed, language]);
  return <Dialog open={Boolean(open)} onOpenChange={next => { if (next) { setCompleted(false); setOpen(true); } else if (completed) returnToLogin(language); else setOpen(null); }}>
    <DialogTrigger asChild><Button type="button" variant="link" className={`password-recovery-trigger password-recovery-trigger-${context}`} disabled={disabled} data-testid={`forgot-password-${context}`}>{copy[language].trigger}</Button></DialogTrigger>
    {open && <RecoveryForm language={language} initialIdentifier={initialIdentifier} onComplete={() => setCompleted(true)} onClose={() => setOpen(null)}/>}
  </Dialog>;
}

function RecoveryForm({ language, initialIdentifier, onComplete, onClose }: { language: Language; initialIdentifier: string; onComplete: () => void; onClose: () => void }) {
  const text = copy[language], id = useId();
  const [availability, setAvailability] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [step, setStep] = useState<"identifier" | "code" | "success">("identifier");
  const [identifier, setIdentifier] = useState(initialIdentifier), [challenge, setChallenge] = useState("");
  const [code, setCode] = useState(""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false), [pendingAction, setPendingAction] = useState<"request" | "reset" | null>(null), [error, setError] = useState("");
  const [retryAt, setRetryAt] = useState(0), [expiresAt, setExpiresAt] = useState(0), [now, setNow] = useState(() => Date.now());
  const activeRequest = useRef<AbortController | null>(null), generation = useRef(0), inFlight = useRef(false);
  const identifierInput = useRef<HTMLInputElement>(null), codeInput = useRef<HTMLInputElement>(null), errorMessage = useRef<HTMLParagraphElement>(null);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const expired = step === "code" && expiresAt <= now;

  const checkAvailability = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController(), current = ++generation.current;
    activeRequest.current = controller;
    try {
      const response = await fetch("/api/password-recovery", { cache: "no-store", signal: controller.signal });
      const data = await response.json() as RecoveryResponse;
      if (current !== generation.current) return;
      if (!response.ok || typeof data.available !== "boolean") throw new Error("Invalid status response");
      setAvailability(data.available ? "ready" : "unavailable");
    } catch { if (current === generation.current && !controller.signal.aborted) setAvailability("error"); }
  }, []);

  const cancelRequests = useCallback(() => {
    generation.current++; activeRequest.current?.abort(); inFlight.current = false;
  }, []);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => { if (mounted) void checkAvailability(); });
    return () => { mounted = false; cancelRequests(); };
  }, [checkAvailability, cancelRequests]);
  useEffect(() => {
    if (step !== "code" && !retryAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [step, retryAt]);
  useEffect(() => {
    if (availability !== "ready") return;
    if (step === "identifier") identifierInput.current?.focus();
    else if (step === "code") codeInput.current?.focus();
  }, [availability, step]);
  useEffect(() => { if (error) errorMessage.current?.focus(); }, [error]);

  function errorText(data: RecoveryResponse, status: number) {
    if (status === 429 || data.code === "RATE_LIMITED") return text.limited;
    if (data.code === "NOT_CONFIGURED") return text.unavailable;
    if (data.code === "SEND_FAILED") return text.sendFailed;
    if (data.code === "INVALID_PASSWORD") return text.passwordError;
    if (data.code === "PASSWORD_UNCHANGED") return text.unchanged;
    if (["INVALID_CODE", "EXPIRED_CHALLENGE", "INVALID_CHALLENGE"].includes(data.code || "")) return text.invalid;
    if (data.code === "INVALID_REQUEST") return text.invalidRequest;
    return language === "zh" && data.error ? data.error : status >= 500 ? text.sendFailed : text.invalid;
  }

  async function submit(action: "request" | "reset", event?: FormEvent) {
    event?.preventDefault();
    // The settings entry lives in the ordinary change-password form. React
    // portal events still bubble through that tree even though the DOM does not.
    event?.stopPropagation();
    if (inFlight.current || availability !== "ready") return;
    setError("");
    const normalized = identifier.trim().toLowerCase();
    if (action === "request") {
      if (Date.now() < retryAt) return;
      if (normalized.length > 254 || !(/^[a-z0-9][a-z0-9._-]{2,39}$/.test(normalized) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))) { setError(text.identifierError); return; }
    } else {
      if (Date.now() >= expiresAt) { setNow(Date.now()); setError(text.expired); return; }
      if (!/^\d{6}$/.test(code)) { setError(text.codeError); return; }
      if (password.length < 8 || password.length > 128) { setError(text.passwordError); return; }
      if (password !== confirm) { setError(text.mismatch); return; }
    }
    inFlight.current = true; setBusy(true); setPendingAction(action);
    const controller = new AbortController(), current = ++generation.current;
    activeRequest.current?.abort(); activeRequest.current = controller;
    try {
      const body = action === "request" ? { action, identifier: normalized, language } : { action, challenge, code, newPassword: password, language };
      const response = await fetch("/api/password-recovery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: controller.signal });
      const data = await response.json() as RecoveryResponse;
      if (current !== generation.current) return;
      if (!response.ok) {
        if (response.status === 429 && typeof data.retryAfter === "number") setRetryAt(Date.now() + Math.max(1, data.retryAfter) * 1000);
        if (data.code === "NOT_CONFIGURED") setAvailability("unavailable");
        setError(errorText(data, response.status)); return;
      }
      if (data.ok !== true) throw new Error("Invalid response");
      if (action === "request") {
        if (typeof data.challenge !== "string" || !data.challenge || typeof data.expiresIn !== "number" || data.expiresIn <= 0) throw new Error("Invalid recovery challenge");
        setIdentifier(normalized); setChallenge(data.challenge); setCode(""); setPassword(""); setConfirm("");
        const sentAt = Date.now(); setNow(sentAt); setRetryAt(sentAt + Math.max(60, data.retryAfter || 60) * 1000); setExpiresAt(sentAt + data.expiresIn * 1000); setStep("code");
        codeInput.current?.focus();
      } else {
        setChallenge(""); setCode(""); setPassword(""); setConfirm(""); setStep("success"); onComplete();
      }
    } catch { if (current === generation.current && !controller.signal.aborted) setError(text.failed); }
    finally { if (current === generation.current) { inFlight.current = false; setBusy(false); setPendingAction(null); } }
  }

  function changeIdentifier() {
    if (inFlight.current) return;
    setChallenge(""); setCode(""); setPassword(""); setConfirm(""); setError(""); setStep("identifier");
  }

  return <DialogContent className="password-recovery-dialog" data-testid="password-recovery-dialog" data-mobile-nav-hide onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
    <DialogHeader>
      <div className="password-recovery-symbol" aria-hidden="true">{step === "success" ? <Check size={24}/> : step === "code" ? <Mail size={24}/> : <ShieldCheck size={24}/>}</div>
      <DialogTitle>{step === "success" ? text.successTitle : text.title}</DialogTitle>
      <DialogDescription>{step === "success" ? text.success : text.intro}</DialogDescription>
    </DialogHeader>
    {step === "success" ? <Button type="button" className="password-recovery-primary" onClick={() => returnToLogin(language)}>{text.login}</Button> : <>
      {availability === "loading" && <p className="password-recovery-note" role="status">{text.checking}</p>}
      {availability === "error" && <div className="password-recovery-availability"><p role="alert" data-error-popup-ignore>{text.failed}</p><Button type="button" variant="outline" onClick={() => { setAvailability("loading"); void checkAvailability(); }}>{text.retry}</Button></div>}
      {availability === "unavailable" && <div className="password-recovery-availability"><p role="status">{text.unavailable}</p><Button type="button" variant="outline" onClick={onClose}>{text.close}</Button></div>}
      {availability === "ready" && (step === "identifier" ? <form className="password-recovery-form" noValidate aria-busy={busy} onSubmit={event => void submit("request", event)}>
        <label htmlFor={id + "-identifier"}>{text.identifier}<input ref={identifierInput} id={id + "-identifier"} name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} required disabled={busy} value={identifier} onChange={event => { setIdentifier(event.target.value); setError(""); }} aria-describedby={id + "-help"}/></label>
        <p className="password-recovery-note" id={id + "-help"}>{text.help}</p>
        <Button className="password-recovery-primary" type="submit" disabled={busy || remaining > 0}>{busy ? text.sending : remaining > 0 ? `${text.send} (${remaining}s)` : text.send}</Button>
      </form> : <form className="password-recovery-form" noValidate aria-busy={busy} onSubmit={event => void submit("reset", event)}>
        <p className="password-recovery-sent" role="status">{text.sent}</p>
        <div className="password-recovery-identity"><span>{identifier}</span><Button type="button" variant="link" disabled={busy} onClick={changeIdentifier}>{text.change}</Button></div>
        <label htmlFor={id + "-code"}>{text.code}<input ref={codeInput} className="password-recovery-code" id={id + "-code"} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy} value={code} onChange={event => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} aria-describedby={id + "-code-hint"}/></label>
        <p className="password-recovery-note" id={id + "-code-hint"}>{text.codeHint}</p>
        {expired && <p className="password-recovery-expired" role="status">{text.expired}</p>}
        <label htmlFor={id + "-password"}>{text.password}<PasswordInput id={id + "-password"} name="new-password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} value={password} onChange={event => { setPassword(event.target.value); setError(""); }}/></label>
        <label htmlFor={id + "-confirm"}>{text.confirm}<PasswordInput id={id + "-confirm"} name="confirm-password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} value={confirm} onChange={event => { setConfirm(event.target.value); setError(""); }}/></label>
        <Button className="password-recovery-primary" type="submit" disabled={busy || expired}>{pendingAction === "reset" ? text.resetting : text.reset}</Button>
        <Button type="button" variant="outline" disabled={busy || remaining > 0} onClick={() => void submit("request")}>{pendingAction === "request" ? text.sending : remaining > 0 ? `${text.resend} (${remaining}s)` : text.resend}</Button>
        <p className="password-recovery-note">{text.help}</p>
      </form>)}
      {error && availability === "ready" && <p ref={errorMessage} className="password-recovery-error" role="alert" tabIndex={-1} data-error-popup-ignore>{error}</p>}
    </>}
  </DialogContent>;
}
