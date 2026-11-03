"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Check, Mail, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PasswordInput } from "@/components/password-input";
import { useFormFocusVisibility, useFormViewport } from "@/components/form-action-bar";
import { clearDialogHistory, useDialogState } from "@/lib/use-dialog-state";
import { quizLinkIdFromPath } from "@/lib/quiz-link";
import type { Language } from "@/lib/i18n";
import "./password-recovery.css";

const copy = {
  zh: {
    trigger: "忘记密码？", title: "找回密码", intro: "使用账号已绑定的 Google 邮箱验证身份，再设置新密码。",
    identifier: "用户名或已绑定邮箱", help: "未绑定 Google 邮箱？请联系所属集团管理员重置密码。",
    send: "发送验证码", sending: "正在提交发送请求…", checking: "正在检查找回功能…", unavailable: "邮箱找回暂不可用，请联系所属集团管理员重置密码。",
    failed: "暂时无法连接，请稍后重试。", retry: "重试", close: "关闭", sent: "如果这个账号已绑定可用邮箱，我们会发送验证码。请查看收件箱和垃圾邮件。",
    code: "邮箱验证码", codeHint: "输入邮件中的 6 位数字，验证码 10 分钟内有效。", password: "新密码（至少 8 个字符）", confirm: "确认新密码",
    reset: "设置新密码", resetting: "正在更新…", resend: "重新发送", change: "修改账号", expired: "验证码已过期，请重新发送。",
    successTitle: "密码已更新", success: "请使用新密码重新登录。这个账号之前的登录会话已退出。", login: "返回登录",
    identifierError: "请输入有效的用户名或已绑定邮箱。", codeError: "请输入 6 位数字验证码。", passwordError: "新密码需为 8–128 个字符。", mismatch: "两次输入的新密码不一致。",
    invalid: "验证码无效或已过期，请检查后重试，或重新发送。", limited: "操作过于频繁，请稍后再试。", unchanged: "新密码不能与当前密码相同。",
    sendFailed: "邮件暂时无法发送，请稍后重试，或联系管理员。", invalidRequest: "请求无效，请关闭后重新尝试。",
    wait: "请求处理中，请稍候。", unknownTitle: "暂时无法确认结果", unknown: "密码可能已更新。请先用刚设置的新密码登录；若无法登录，再申请新的验证码。",
    requestUnknown: "暂时无法确认发送结果。请先检查邮箱；若没有收到验证码，稍后再试。",
    preview: "界面预览：不会发送邮件，也不会修改密码。请勿输入真实密码。", previewNext: "预览下一步", previewReset: "预览完成状态", previewTitle: "预览完成", previewSuccess: "这是找回密码完成界面的预览。没有发送邮件、修改密码或退出登录。", previewClose: "结束预览",
  },
  en: {
    trigger: "Forgot password?", title: "Reset your password", intro: "Verify using the Google email already linked to your account, then choose a new password.",
    identifier: "Username or linked email", help: "No Google email linked? Ask your centre administrator to reset your password.",
    send: "Send code", sending: "Submitting request…", checking: "Checking password recovery…", unavailable: "Email recovery is temporarily unavailable. Ask your centre administrator to reset your password.",
    failed: "Could not connect. Please try again shortly.", retry: "Try again", close: "Close", sent: "If this account has an eligible linked email, we will send a code. Check your inbox and spam folder.",
    code: "Email verification code", codeHint: "Enter the 6 digits from the email. The code is valid for 10 minutes.", password: "New password (at least 8 characters)", confirm: "Confirm new password",
    reset: "Set new password", resetting: "Updating…", resend: "Resend code", change: "Change account", expired: "This code has expired. Please request a new one.",
    successTitle: "Password updated", success: "Sign in with your new password. Previous sessions for this account have been signed out.", login: "Back to sign in",
    identifierError: "Enter a valid username or linked email.", codeError: "Enter the 6-digit verification code.", passwordError: "Your new password must contain 8–128 characters.", mismatch: "The new passwords do not match.",
    invalid: "The code is invalid or expired. Check it and try again, or request a new code.", limited: "Too many attempts. Please try again later.", unchanged: "Choose a password different from your current password.",
    sendFailed: "The email could not be sent right now. Try again later or contact your administrator.", invalidRequest: "This request is invalid. Close this window and try again.",
    wait: "Your request is in progress. Please wait.", unknownTitle: "We could not confirm the result", unknown: "Your password may have changed. Try signing in with the new password first. If it does not work, request a new code.",
    requestUnknown: "We could not confirm the email request. Check your inbox first. If no code arrives, try again shortly.",
    preview: "UI preview: no email is sent and no password is changed. Do not enter a real password.", previewNext: "Preview next step", previewReset: "Preview completion", previewTitle: "Preview complete", previewSuccess: "This previews the completed recovery screen. No email was sent, password changed, or session ended.", previewClose: "Finish preview",
  },
};

type RecoveryResponse = { ok?: boolean; available?: boolean; challenge?: string; retryAfter?: number; expiresIn?: number; error?: string; code?: string };
type Props = { language: Language; initialIdentifier?: string; context?: "login" | "settings"; disabled?: boolean; previewOnly?: boolean };

// Preserve only a recognised same-origin Quiz route. Keep assignment presence,
// including invalid/duplicate values, so a bad assigned link cannot become self-practice.
export function recoveryReturnPath(pathname: string, search: string, language: Language) {
  const quizId = quizLinkIdFromPath(pathname), params = new URLSearchParams();
  if (quizId) {
    const assignments = new URLSearchParams(search).getAll("assignment");
    if (assignments.length > 8 || assignments.some(value => value.length > 254)) params.append("assignment", "invalid");
    else for (const value of assignments) params.append("assignment", value);
  }
  params.set("lang", language);
  return `${quizId ? `/quiz/${quizId}` : "/"}?${params}`;
}

function returnToLogin(target: string) {
  clearDialogHistory();
  // Reload the entire shell so an authenticated settings view cannot keep a stale identity.
  window.location.replace(target);
}

export function PasswordRecoveryButton({ language, initialIdentifier = "", context = "login", disabled, previewOnly = false }: Props) {
  const [open, setOpen] = useDialogState<true | null>(`password-recovery-${context}`, null);
  const [completed, setCompleted] = useState(false), [locked, setLocked] = useState(false);
  const lock = useRef(false), target = useRef("/");
  const changeBusy = useCallback((busy: boolean) => { lock.current = busy; setLocked(busy); }, []);
  const finish = () => previewOnly ? setOpen(null) : returnToLogin(target.current);
  // A mobile Back event changes history directly. Keep the same form mounted and
  // restore its overlay entry while a request is pending; abort is not cancellation.
  useEffect(() => { if (locked && !open) setOpen(true); }, [locked, open, setOpen]);
  useEffect(() => { if (!open && completed && !locked && !previewOnly) returnToLogin(target.current); }, [open, completed, locked, previewOnly]);
  return <Dialog open={Boolean(open) || locked} onOpenChange={next => { if (lock.current) return; if (next) { target.current = recoveryReturnPath(window.location.pathname, window.location.search, language); setCompleted(false); setOpen(true); } else if (completed) finish(); else setOpen(null); }}>
    <DialogTrigger asChild><Button type="button" variant="link" className={`password-recovery-trigger password-recovery-trigger-${context}`} disabled={disabled} data-testid={`forgot-password-${context}`}>{copy[language].trigger}</Button></DialogTrigger>
    {(open || locked) && <RecoveryForm language={language} initialIdentifier={initialIdentifier} previewOnly={previewOnly} onBusyChange={changeBusy} onComplete={() => setCompleted(true)} onFinish={finish} onClose={() => { if (!lock.current) completed ? finish() : setOpen(null); }}/>}
  </Dialog>;
}

function RecoveryForm({ language, initialIdentifier, previewOnly, onBusyChange, onComplete, onFinish, onClose }: { language: Language; initialIdentifier: string; previewOnly: boolean; onBusyChange: (busy: boolean) => void; onComplete: () => void; onFinish: () => void; onClose: () => void }) {
  const text = copy[language], id = useId();
  const [availability, setAvailability] = useState<"loading" | "ready" | "unavailable" | "error">(previewOnly ? "ready" : "loading");
  const [step, setStep] = useState<"identifier" | "code" | "success" | "unknown">("identifier");
  const [identifier, setIdentifier] = useState(initialIdentifier), [challenge, setChallenge] = useState("");
  const [code, setCode] = useState(""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false), [pendingAction, setPendingAction] = useState<"request" | "reset" | null>(null), [error, setError] = useState("");
  const [retryAt, setRetryAt] = useState(0), [expiresAt, setExpiresAt] = useState(0), [now, setNow] = useState(() => Date.now());
  const activeRequest = useRef<AbortController | null>(null), generation = useRef(0), inFlight = useRef(false);
  const identifierInput = useRef<HTMLInputElement>(null), codeInput = useRef<HTMLInputElement>(null), errorMessage = useRef<HTMLParagraphElement>(null);
  const dialog = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null), viewport = useFormViewport();
  useFormFocusVisibility(dialog, viewport, ".password-recovery-actions");
  const settled = step === "success" || step === "unknown";
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const expired = step === "code" && expiresAt <= now;

  const checkAvailability = useCallback(async () => {
    if (previewOnly) { setAvailability("ready"); return; }
    activeRequest.current?.abort();
    const controller = new AbortController(), current = ++generation.current;
    activeRequest.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
    try {
      const response = await fetch("/api/password-recovery", { cache: "no-store", signal: controller.signal });
      const data = await response.json() as RecoveryResponse;
      if (current !== generation.current) return;
      if (!response.ok || typeof data.available !== "boolean") throw new Error("Invalid status response");
      setAvailability(data.available ? "ready" : "unavailable");
    } catch { if (current === generation.current && (!controller.signal.aborted || timedOut)) setAvailability("error"); }
    finally { window.clearTimeout(timeout); }
  }, [previewOnly]);

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
    else if (step === "success" || step === "unknown") heading.current?.focus();
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
    if (previewOnly) {
      if (action === "request") {
        setIdentifier(identifier.trim() || "demo.student"); setChallenge(""); setCode("123456"); setPassword(""); setConfirm("");
        setNow(Date.now()); setRetryAt(0); setExpiresAt(Date.now() + 600_000); setStep("code");
      } else { setCode(""); setPassword(""); setConfirm(""); setStep("success"); onComplete(); }
      return;
    }
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
    inFlight.current = true; setBusy(true); onBusyChange(true); setPendingAction(action);
    const controller = new AbortController(), current = ++generation.current;
    activeRequest.current?.abort(); activeRequest.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
    try {
      const body = action === "request" ? { action, identifier: normalized, language } : { action, challenge, code, newPassword: password, language };
      const response = await fetch("/api/password-recovery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: controller.signal });
      const data = await response.json() as RecoveryResponse;
      if (current !== generation.current) return;
      if (!response.ok) {
        if (action === "reset" && response.status >= 500) { setChallenge(""); setCode(""); setPassword(""); setConfirm(""); setStep("unknown"); onComplete(); return; }
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
    } catch { if (current === generation.current && (!controller.signal.aborted || timedOut)) {
      if (action === "reset") { setChallenge(""); setCode(""); setPassword(""); setConfirm(""); setStep("unknown"); onComplete(); }
      else setError(timedOut ? text.requestUnknown : text.failed);
    } }
    finally { window.clearTimeout(timeout); if (current === generation.current) { inFlight.current = false; setBusy(false); onBusyChange(false); setPendingAction(null); } }
  }

  function changeIdentifier() {
    if (inFlight.current) return;
    setChallenge(""); setCode(""); setPassword(""); setConfirm(""); setError(""); setStep("identifier");
  }

  return <DialogContent ref={dialog} className="password-recovery-dialog" overlayClassName="password-recovery-overlay" data-testid="password-recovery-dialog" data-mobile-nav-hide data-preview-only={previewOnly || undefined} data-keyboard-open={viewport.keyboardInset > 0 || undefined} showCloseButton={false}
    style={viewport.height ? { "--recovery-viewport-height": `${viewport.height}px`, "--recovery-viewport-top": `${viewport.top}px` } as CSSProperties : undefined}
    onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
    <button type="button" data-slot="dialog-close" className="password-recovery-close" aria-label={text.close} disabled={busy} onClick={onClose}><X size={20} aria-hidden="true"/></button>
    <DialogHeader>
      <div className="password-recovery-symbol" aria-hidden="true">{step === "success" ? <Check size={24}/> : step === "code" ? <Mail size={24}/> : <ShieldCheck size={24}/>}</div>
      <DialogTitle ref={heading} tabIndex={-1}>{step === "unknown" ? text.unknownTitle : step === "success" ? previewOnly ? text.previewTitle : text.successTitle : text.title}</DialogTitle>
      <DialogDescription>{step === "unknown" ? text.unknown : step === "success" ? previewOnly ? text.previewSuccess : text.success : text.intro}</DialogDescription>
    </DialogHeader>
    <div className="password-recovery-body">
      {previewOnly && !settled && <p className="password-recovery-preview" role="note">{text.preview}</p>}
      {!settled && <>
      {availability === "loading" && <p className="password-recovery-note" role="status">{text.checking}</p>}
      {availability === "error" && <div className="password-recovery-availability"><p role="alert" data-error-popup-ignore>{text.failed}</p><Button type="button" variant="outline" onClick={() => { setAvailability("loading"); void checkAvailability(); }}>{text.retry}</Button></div>}
      {availability === "unavailable" && <div className="password-recovery-availability"><p role="status">{text.unavailable}</p><Button type="button" variant="outline" onClick={onClose}>{text.close}</Button></div>}
      {availability === "ready" && (step === "identifier" ? <form id={id + "-request"} className="password-recovery-form" noValidate aria-busy={busy} onSubmit={event => void submit("request", event)}>
        <label htmlFor={id + "-identifier"}>{text.identifier}<input ref={identifierInput} id={id + "-identifier"} name="username" placeholder="student01 / name@example.com" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} required disabled={busy} value={identifier} onChange={event => { setIdentifier(event.target.value); setError(""); }} aria-describedby={id + "-help"}/></label>
        <p className="password-recovery-note" id={id + "-help"}>{text.help}</p>
      </form> : <form id={id + "-reset"} className="password-recovery-form" noValidate aria-busy={busy} onSubmit={event => void submit("reset", event)}>
        {!previewOnly && <p className="password-recovery-sent" role="status">{text.sent}</p>}
        <div className="password-recovery-identity"><span>{identifier}</span><Button type="button" variant="link" disabled={busy} onClick={changeIdentifier}>{text.change}</Button></div>
        <label htmlFor={id + "-code"}>{text.code}<input ref={codeInput} className="password-recovery-code" id={id + "-code"} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy} value={code} onChange={event => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} aria-describedby={id + "-code-hint"}/></label>
        <p className="password-recovery-note" id={id + "-code-hint"}>{text.codeHint}</p>
        {expired && <p className="password-recovery-expired" role="status">{text.expired}</p>}
        <label htmlFor={id + "-password"}>{text.password}<PasswordInput id={id + "-password"} name="new-password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} value={password} onChange={event => { setPassword(event.target.value); setError(""); }}/></label>
        <label htmlFor={id + "-confirm"}>{text.confirm}<PasswordInput id={id + "-confirm"} name="confirm-password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} value={confirm} onChange={event => { setConfirm(event.target.value); setError(""); }}/></label>
        <p className="password-recovery-note">{text.help}</p>
      </form>)}
      {error && availability === "ready" && <p ref={errorMessage} className="password-recovery-error" role="alert" tabIndex={-1} data-error-popup-ignore>{error}</p>}
      </>}
    </div>
    <div className="password-recovery-actions">
      {busy && <p className="password-recovery-note" role="status">{text.wait}</p>}
      {settled ? <Button type="button" className="password-recovery-primary" onClick={onFinish}>{previewOnly ? text.previewClose : text.login}</Button> : availability === "ready" && (step === "identifier" ?
        <Button className="password-recovery-primary" type="submit" form={id + "-request"} disabled={busy || remaining > 0}>{previewOnly ? text.previewNext : busy ? text.sending : remaining > 0 ? `${text.send} (${remaining}s)` : text.send}</Button> : <>
          <Button className="password-recovery-primary" type="submit" form={id + "-reset"} disabled={busy || expired}>{previewOnly ? text.previewReset : pendingAction === "reset" ? text.resetting : text.reset}</Button>
          <Button type="button" variant="outline" disabled={busy || remaining > 0} onClick={() => void submit("request")}>{pendingAction === "request" ? text.sending : remaining > 0 ? `${text.resend} (${remaining}s)` : text.resend}</Button>
        </>)}
    </div>
  </DialogContent>;
}
