"use client";
import {beginPrivateMutation} from '@/lib/private-read-lifecycle';

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Check, Mail, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PasswordInput } from "@/components/password-input";
import { clearDialogHistory, useDialogState } from "@/lib/use-dialog-state";
import { clearRecoveryState, readRecoveryState, saveRecoveryState, recoveryReturnPath, RECOVERY_LIFETIME, type RecoveryAction, type RecoverySnapshot } from "@/lib/password-recovery-ui-state";
import type { Language } from "@/lib/i18n";
import "./password-recovery.css";

const copy = {
  zh: {
    trigger: "忘记密码？", title: "找回密码", intro: "使用账号已绑定的 Google 邮箱验证身份，再设置新密码。",
    identifier: "用户名或已绑定邮箱", help: "未绑定 Google 邮箱？请联系所属集团管理员重置密码。",
    send: "发送验证码", sending: "正在提交发送请求…", checking: "正在检查找回功能…", unavailable: "邮箱找回暂不可用，请联系所属集团管理员重置密码。",
    failed: "暂时无法连接，请稍后重试。", retry: "重试", close: "关闭", sent: "如果这个账号已绑定可用邮箱，我们会发送验证码。请查看收件箱和垃圾邮件。",
    code: "邮箱验证码", codeHint: "输入邮件中的 6 位数字，验证码 10 分钟内有效。", password: "新密码（至少 8 个字符）", confirm: "确认新密码",
    verify: "验证验证码", verifying: "正在验证…", verified: "邮箱验证通过。现在设置新密码。", passwordTitle: "设置新密码", verifyUnknown: "暂时无法确认验证结果。请重新输入邮件中的验证码，再点击验证。", restored: "已恢复找回进度。为保护账号，请重新输入验证码或密码。",
    reset: "设置新密码", resetting: "正在更新…", resend: "重新发送", change: "修改账号", expired: "找回操作已过期，请重新申请验证码。",
    successTitle: "密码已更新", success: "请使用新密码重新登录。这个账号之前的登录会话已退出。", login: "返回登录",
    identifierError: "请输入有效的用户名或已绑定邮箱。", codeError: "请输入 6 位数字验证码。", passwordError: "新密码需为 8–128 个字符。", mismatch: "两次输入的新密码不一致。",
    invalid: "验证码无效或已过期，请检查后重试，或重新发送。", limited: "操作过于频繁，请稍后再试。", unchanged: "新密码不能与当前密码相同。",
    sendFailed: "邮件暂时无法发送，请稍后重试，或联系管理员。", invalidRequest: "请求无效，请关闭后重新尝试。",
    wait: "请求处理中，请稍候。", unknownTitle: "暂时无法确认结果", unknown: "密码可能已更新。请先用刚设置的新密码登录；若无法登录，再申请新的验证码。",
    requestUnknown: "暂时无法确认发送结果。当前请求没有保存可用的验证进度；请稍候重新发送，并使用新邮件中的验证码。",
    preview: "界面预览：不会发送邮件，也不会修改密码。请勿输入真实密码。", previewNext: "预览下一步", previewReset: "预览完成状态", previewTitle: "预览完成", previewSuccess: "这是找回密码完成界面的预览。没有发送邮件、修改密码或退出登录。", previewClose: "结束预览",
  },
  en: {
    trigger: "Forgot password?", title: "Reset your password", intro: "Verify using the Google email already linked to your account, then choose a new password.",
    identifier: "Username or linked email", help: "No Google email linked? Ask your centre administrator to reset your password.",
    send: "Send code", sending: "Submitting request…", checking: "Checking password recovery…", unavailable: "Email recovery is temporarily unavailable. Ask your centre administrator to reset your password.",
    failed: "Could not connect. Please try again shortly.", retry: "Try again", close: "Close", sent: "If this account has an eligible linked email, we will send a code. Check your inbox and spam folder.",
    code: "Email verification code", codeHint: "Enter the 6 digits from the email. The code is valid for 10 minutes.", password: "New password (at least 8 characters)", confirm: "Confirm new password",
    verify: "Verify code", verifying: "Verifying…", verified: "Email verified. Choose your new password.", passwordTitle: "Choose a new password", verifyUnknown: "We could not confirm verification. Enter the code from your email again, then select Verify code.", restored: "Your recovery progress was restored. For your security, enter the code or password again.",
    reset: "Set new password", resetting: "Updating…", resend: "Resend code", change: "Change account", expired: "This recovery attempt has expired. Please request a new code.",
    successTitle: "Password updated", success: "Sign in with your new password. Previous sessions for this account have been signed out.", login: "Back to sign in",
    identifierError: "Enter a valid username or linked email.", codeError: "Enter the 6-digit verification code.", passwordError: "Your new password must contain 8–128 characters.", mismatch: "The new passwords do not match.",
    invalid: "The code is invalid or expired. Check it and try again, or request a new code.", limited: "Too many attempts. Please try again later.", unchanged: "Choose a password different from your current password.",
    sendFailed: "The email could not be sent right now. Try again later or contact your administrator.", invalidRequest: "This request is invalid. Close this window and try again.",
    wait: "Your request is in progress. Please wait.", unknownTitle: "We could not confirm the result", unknown: "Your password may have changed. Try signing in with the new password first. If it does not work, request a new code.",
    requestUnknown: "We could not confirm the email request or save its verification progress. Wait briefly, then resend and use the code from the new email.",
    preview: "UI preview: no email is sent and no password is changed. Do not enter a real password.", previewNext: "Preview next step", previewReset: "Preview completion", previewTitle: "Preview complete", previewSuccess: "This previews the completed recovery screen. No email was sent, password changed, or session ended.", previewClose: "Finish preview",
  },
};

type RecoveryResponse = { ok?: boolean; available?: boolean; challenge?: string; resetToken?: string; retryAfter?: number; expiresIn?: number; error?: string; code?: string };
type Props = { language: Language; initialIdentifier?: string; context?: "login" | "settings"; disabled?: boolean; previewOnly?: boolean };

export { recoveryReturnPath } from "@/lib/password-recovery-ui-state";

function returnToLogin(target: string) {
  clearRecoveryState();
  clearDialogHistory();
  // Reload the entire shell so an authenticated settings view cannot keep a stale identity.
  window.location.replace(target);
}

export function PasswordRecoveryButton({ language, initialIdentifier = "", context = "login", disabled, previewOnly = false }: Props) {
  const [open, setOpen] = useDialogState<true | null>("password-recovery-" + context, null);
  const [completed, setCompleted] = useState(false), [locked, setLocked] = useState(false);
  const [restored, setRestored] = useState<RecoverySnapshot | null>(null);
  const lock = useRef(false), target = useRef("/"), wasOpen = useRef(false);
  const owner = context === "settings" ? initialIdentifier.trim().toLowerCase() : "";
  const ownerKey = context + ":" + owner, previousOwner = useRef(ownerKey);
  const changeBusy = useCallback((busy: boolean) => { lock.current = busy; setLocked(busy); }, []);
  const finish = () => { clearRecoveryState(); if (previewOnly) setOpen(null); else returnToLogin(target.current); };
  useEffect(() => {
    if (previousOwner.current !== ownerKey) {
      previousOwner.current = ownerKey; clearRecoveryState(); setRestored(null); setCompleted(false); lock.current = false; setLocked(false); setOpen(null); return;
    }
    const returnTo = recoveryReturnPath(window.location.pathname, window.location.search, language);
    const saved = previewOnly ? null : readRecoveryState(context, owner, returnTo);
    setRestored(saved); setCompleted(false);
    if (saved) { target.current = saved.returnTo; setOpen(true); }
    else if (wasOpen.current) { lock.current = false; setLocked(false); setOpen(null); }
    // Changing the settings account invalidates this account's recovery state.
    // Language changes alone must not discard a form in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, owner, previewOnly, setOpen]);
  useEffect(() => {
    if (locked && !open) setOpen(true);
    if (wasOpen.current && !open && !locked) { clearRecoveryState(); setRestored(null); }
    wasOpen.current = Boolean(open) || locked;
  }, [locked, open, setOpen]);
  useEffect(() => { if (!open && completed && !locked && !previewOnly) returnToLogin(target.current); }, [open, completed, locked, previewOnly]);
  const close = () => { if (!lock.current) { clearRecoveryState(); completed ? finish() : setOpen(null); } };
  return <Dialog open={Boolean(open) || locked} onOpenChange={next => {
    if (lock.current) return;
    if (next) { target.current = recoveryReturnPath(window.location.pathname, window.location.search, language); setRestored(null); setCompleted(false); setOpen(true); }
    else close();
  }}>
    <DialogTrigger asChild><Button type="button" variant="link" className={"password-recovery-trigger password-recovery-trigger-" + context} disabled={disabled} data-testid={"forgot-password-" + context}>{copy[language].trigger}</Button></DialogTrigger>
    {(open || locked) && <RecoveryForm key={ownerKey} language={language} initialIdentifier={context === "settings" ? initialIdentifier : ""} restored={restored?.owner === owner && restored.context === context ? restored : null} context={context} owner={owner} returnTo={target.current} previewOnly={previewOnly} onBusyChange={changeBusy} onComplete={() => setCompleted(true)} onFinish={finish} onClose={close}/>}
  </Dialog>;
}

// This dialog must follow the visual viewport even in a phone's desktop-site mode.
// Its inline insets avoid build-time translate/transform merging and Tailwind's
// default -50% translate, which previously placed half the sheet below the screen.
function useRecoveryViewport() {
  const [viewport, setViewport] = useState({ width: 0, height: 0, top: 0, left: 0, layoutHeight: 0, sheet: false, compact: false, focusVersion: 0 });
  useEffect(() => {
    let frame = 0;
    const measure = (event?: Event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const visual = window.visualViewport, width = visual?.width || window.innerWidth, height = visual?.height || window.innerHeight;
        const scale = visual?.scale || 1, top = Math.max(0, visual?.offsetTop || 0), left = Math.max(0, visual?.offsetLeft || 0);
        const sheet = Math.min(width, width * scale) <= 760;
        const compact = height < 600 || Boolean(document.activeElement?.matches("input") && window.innerHeight - height - top > 80);
        setViewport(previous => ({ width, height, top, left, layoutHeight: window.innerHeight, sheet, compact, focusVersion: previous.focusVersion + (event?.type === "focusin" ? 1 : 0) }));
      });
    };
    measure(); window.addEventListener("resize", measure); document.addEventListener("focusin", measure); document.addEventListener("visibilitychange", measure);
    const visual = window.visualViewport; visual?.addEventListener("resize", measure); visual?.addEventListener("scroll", measure);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", measure); document.removeEventListener("focusin", measure); document.removeEventListener("visibilitychange", measure); visual?.removeEventListener("resize", measure); visual?.removeEventListener("scroll", measure); };
  }, []);
  return viewport;
}

type FormProps = { language: Language; initialIdentifier: string; restored: RecoverySnapshot | null; context: Props["context"]; owner: string; returnTo: string; previewOnly: boolean; onBusyChange: (busy: boolean) => void; onComplete: () => void; onFinish: () => void; onClose: () => void };
function RecoveryForm({ language, initialIdentifier, restored, context = "login", owner, returnTo, previewOnly, onBusyChange, onComplete, onFinish, onClose }: FormProps) {
  const text = copy[language], id = useId();
  const [availability, setAvailability] = useState<"loading" | "ready" | "unavailable" | "error">(previewOnly ? "ready" : "loading");
  const [step, setStep] = useState<RecoverySnapshot["step"] | "success">(restored?.pending === "reset" ? "unknown" : restored?.step || "identifier");
  const [identifier, setIdentifier] = useState(restored?.identifier || initialIdentifier), [challenge, setChallenge] = useState(restored?.pending === "reset" ? "" : restored?.challenge || ""), [resetToken, setResetToken] = useState(restored?.pending === "reset" ? "" : restored?.resetToken || "");
  const [code, setCode] = useState(""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false), [pendingAction, setPendingAction] = useState<RecoveryAction | null>(null), [error, setError] = useState(restored?.pending === "verify" ? text.verifyUnknown : restored?.pending === "request" ? text.requestUnknown : "");
  const [retryAt, setRetryAt] = useState(restored?.retryAt || 0), [expiresAt, setExpiresAt] = useState(restored?.expiresAt || Date.now() + RECOVERY_LIFETIME), [now, setNow] = useState(() => Date.now());
  const [restoredNotice, setRestoredNotice] = useState(Boolean(restored));
  const persist = useRef(!previewOnly), activeRequest = useRef<AbortController | null>(null), generation = useRef(0), inFlight = useRef(false);
  const identifierInput = useRef<HTMLInputElement>(null), codeInput = useRef<HTMLInputElement>(null), passwordInput = useRef<HTMLInputElement>(null), errorMessage = useRef<HTMLParagraphElement>(null);
  const dialog = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null), viewport = useRecoveryViewport();
  const settled = step === "success" || step === "unknown", remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const snapshot = (pending = pendingAction): RecoverySnapshot => ({ version: 1, context, owner, returnTo, step: step === "success" ? "unknown" : step, identifier, challenge: step === "code" ? challenge : "", resetToken: step === "password" ? resetToken : "", expiresAt, retryAt, pending });
  useEffect(() => {
    if (!previewOnly && persist.current && step !== "success") saveRecoveryState(snapshot());
    // Secrets are intentionally excluded. No code/password belongs in a snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, owner, returnTo, step, identifier, challenge, resetToken, expiresAt, retryAt, pendingAction, previewOnly]);
  useEffect(() => {
    if (step === "unknown") onComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

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
  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => { if (mounted) void checkAvailability(); });
    return () => { mounted = false; generation.current++; activeRequest.current?.abort(); inFlight.current = false; };
  }, [checkAvailability]);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 1000); document.addEventListener("visibilitychange", refresh); window.addEventListener("pageshow", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("pageshow", refresh); };
  }, []);
  useEffect(() => {
    if (now < expiresAt || busy) return;
    if (settled) { persist.current = false; clearRecoveryState(); return; }
    persist.current = false; clearRecoveryState(); setChallenge(""); setResetToken(""); setCode(""); setPassword(""); setConfirm(""); setRestoredNotice(false); setStep("identifier"); setError(text.expired);
  }, [now, expiresAt, busy, settled, text.expired]);
  useEffect(() => {
    if (availability !== "ready") return;
    if (step === "identifier") identifierInput.current?.focus();
    else if (step === "code") codeInput.current?.focus();
    else if (step === "password") passwordInput.current?.focus();
    else heading.current?.focus();
  }, [availability, step]);
  useEffect(() => { if (error) errorMessage.current?.focus(); }, [error]);
  useEffect(() => {
    // Only the body scrolls; header and actions remain reachable above the keyboard.
    let frame = 0;
    const reveal = (again: boolean) => {
      const body = dialog.current?.querySelector<HTMLElement>(".password-recovery-body"), focused = document.activeElement;
      if (body && focused instanceof HTMLElement && body.contains(focused)) {
        const area = body.getBoundingClientRect(), input = focused.getBoundingClientRect(), label = focused.closest("label")?.getBoundingClientRect();
        const bounds = label && label.height < area.height - 8 ? label : input;
        const delta = bounds.bottom > area.bottom - 4 ? bounds.bottom - area.bottom + 4 : bounds.top < area.top + 4 ? bounds.top - area.top - 4 : 0;
        if (delta) body.scrollBy({ top: delta, behavior: "instant" });
      }
      if (again) frame = requestAnimationFrame(() => reveal(false));
    };
    frame = requestAnimationFrame(() => reveal(true));
    return () => cancelAnimationFrame(frame);
  }, [viewport, step, error, availability]);

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
  function clearSecrets() { setChallenge(""); setResetToken(""); setCode(""); setPassword(""); setConfirm(""); }
  function unknownReset() { clearSecrets(); setStep("unknown"); onComplete(); }
  async function submit(action: RecoveryAction, event?: FormEvent) {
    event?.preventDefault(); event?.stopPropagation();
    if (inFlight.current || availability !== "ready") return;
    setError(""); setRestoredNotice(false);
    if (previewOnly) {
      if (action === "request") { setIdentifier(identifier.trim() || (language === "zh" ? "预览账号" : "Preview account")); setCode(""); setStep("code"); setExpiresAt(Date.now() + RECOVERY_LIFETIME); }
      else if (action === "verify") { setCode(""); setPassword(""); setConfirm(""); setStep("password"); }
      else { clearSecrets(); setStep("success"); onComplete(); }
      return;
    }
    const normalized = identifier.trim().toLowerCase();
    if (action === "request") {
      if (Date.now() < retryAt) return;
      if (normalized.length > 254 || !(/^[a-z0-9][a-z0-9._-]{2,39}$/.test(normalized) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))) { setError(text.identifierError); return; }
    } else {
      if (Date.now() >= expiresAt) { setNow(Date.now()); setError(text.expired); return; }
      if (action === "verify" && !/^\d{6}$/.test(code)) { setError(text.codeError); return; }
      if (action === "reset") {
        if (!resetToken) { setError(text.invalid); return; }
        if (password.length < 8 || password.length > 128) { setError(text.passwordError); return; }
        if (password !== confirm) { setError(text.mismatch); return; }
      }
    }
    persist.current = true;
    inFlight.current = true; setBusy(true); onBusyChange(true); setPendingAction(action);
    const pendingSnapshot = snapshot(action);
    if (action === "request") {
      pendingSnapshot.step = "identifier"; pendingSnapshot.challenge = ""; pendingSnapshot.resetToken = "";
      pendingSnapshot.expiresAt = Date.now() + RECOVERY_LIFETIME;
      pendingSnapshot.retryAt = Date.now() + 60_000;
      clearSecrets(); setStep("identifier"); setExpiresAt(pendingSnapshot.expiresAt); setRetryAt(pendingSnapshot.retryAt);
    }
    saveRecoveryState(pendingSnapshot); // Before fetch: tab discard must not lose an uncertain operation.
    const controller = new AbortController(), current = ++generation.current;
    activeRequest.current?.abort(); activeRequest.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
    const finishPrivateMutation=action==='reset'?beginPrivateMutation({auth:true,deferAuth:true}):undefined;
    let resetRejected=false;
    try {
      const body = action === "request" ? { action, identifier: normalized, language } : action === "verify" ? { action, challenge, code } : { action, resetToken, newPassword: password };
      const response = await fetch("/api/password-recovery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: controller.signal });
      const data = await response.json() as RecoveryResponse;
      if (current !== generation.current) return;
      if (!response.ok) {
        if (action === "reset" && response.status >= 500) { unknownReset(); return; }
        if(action==='reset')resetRejected=true;
        if (response.status === 429 && typeof data.retryAfter === "number") setRetryAt(Date.now() + Math.min(600, Math.max(1, data.retryAfter)) * 1000);
        if (data.code === "NOT_CONFIGURED") setAvailability("unavailable");
        setError(errorText(data, response.status)); return;
      }
      if (data.ok !== true) throw new Error("Invalid response");
      if (action === "request") {
        if (typeof data.challenge !== "string" || !data.challenge || data.challenge.length > 8192 || !Number.isFinite(data.expiresIn) || data.expiresIn! <= 0 || data.expiresIn! > 600) throw new Error("Invalid recovery challenge");
        setIdentifier(normalized); setChallenge(data.challenge); setResetToken(""); setCode(""); setPassword(""); setConfirm("");
        const sentAt = Date.now(); setNow(sentAt); setRetryAt(sentAt + Math.min(600, Math.max(60, data.retryAfter || 60)) * 1000); setExpiresAt(sentAt + data.expiresIn! * 1000); setStep("code");
      } else if (action === "verify") {
        if (typeof data.resetToken !== "string" || !data.resetToken || data.resetToken.length > 8192 || !Number.isFinite(data.expiresIn) || data.expiresIn! <= 0 || data.expiresIn! > 600) throw new Error("Invalid reset grant");
        setResetToken(data.resetToken); setChallenge(""); setCode(""); setPassword(""); setConfirm(""); setExpiresAt(Math.min(expiresAt, Date.now() + data.expiresIn! * 1000)); setStep("password");
      } else { persist.current = false; clearRecoveryState(); clearSecrets(); setStep("success"); onComplete(); }
    } catch {
      if (current === generation.current && (!controller.signal.aborted || timedOut)) {
        if (action === "reset") unknownReset();
        else setError(action === "verify" ? text.verifyUnknown : text.requestUnknown);
      }
    } finally { finishPrivateMutation?.({resumeAuth:resetRejected});window.clearTimeout(timeout); if (current === generation.current) { inFlight.current = false; setBusy(false); onBusyChange(false); setPendingAction(null); } }
  }
  function changeIdentifier() {
    if (inFlight.current) return;
    persist.current = false; clearRecoveryState(); clearSecrets(); setError(""); setRestoredNotice(false); setStep("identifier");
  }
  const width = viewport.sheet ? viewport.width : Math.min(460, viewport.width - 32);
  const position: CSSProperties = {
    translate: "none", transform: "none", animation: "none",
    ...(viewport.height ? { top: viewport.sheet ? "auto" : viewport.top + 16, bottom: viewport.layoutHeight - viewport.top - viewport.height + (viewport.sheet ? 0 : 16), left: viewport.left + (viewport.width - width) / 2, width, maxWidth: "none", maxHeight: viewport.height - (viewport.sheet ? 12 : 32), height: "fit-content", margin: viewport.sheet ? "0" : "auto 0" } : {}),
  };
  return <DialogContent ref={dialog} className="password-recovery-dialog" overlayClassName="password-recovery-overlay" data-testid="password-recovery-dialog" data-mobile-nav-hide data-preview-only={previewOnly || undefined} data-recovery-sheet={viewport.sheet || undefined} data-keyboard-open={viewport.compact || undefined} data-recovery-step={step} showCloseButton={false}
    style={position} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
    <button type="button" data-slot="dialog-close" className="password-recovery-close" aria-label={text.close} disabled={busy} onClick={onClose}><X size={20} aria-hidden="true"/></button>
    <DialogHeader>
      <div className="password-recovery-symbol" aria-hidden="true">{step === "success" ? <Check size={24}/> : step === "code" ? <Mail size={24}/> : <ShieldCheck size={24}/>}</div>
      <DialogTitle ref={heading} tabIndex={-1}>{step === "unknown" ? text.unknownTitle : step === "success" ? previewOnly ? text.previewTitle : text.successTitle : step === "password" ? text.passwordTitle : text.title}</DialogTitle>
      <DialogDescription>{step === "unknown" ? text.unknown : step === "success" ? previewOnly ? text.previewSuccess : text.success : step === "password" ? text.verified : text.intro}</DialogDescription>
    </DialogHeader>
    <div className="password-recovery-body">
      {previewOnly && !settled && <p className="password-recovery-preview" role="note">{text.preview}</p>}
      {!settled && <>
        {restoredNotice && <p className="password-recovery-note" role="status">{text.restored}</p>}
        {availability === "loading" && <p className="password-recovery-note" role="status">{text.checking}</p>}
        {availability === "error" && <div className="password-recovery-availability"><p role="alert" data-error-popup-ignore>{text.failed}</p><Button type="button" variant="outline" onClick={() => { setAvailability("loading"); void checkAvailability(); }}>{text.retry}</Button></div>}
        {availability === "unavailable" && <div className="password-recovery-availability"><p role="status">{text.unavailable}</p><Button type="button" variant="outline" onClick={onClose}>{text.close}</Button></div>}
        {availability === "ready" && (step === "identifier" ? <form id={id + "-request"} className="password-recovery-form" noValidate aria-busy={busy} onSubmit={event => void submit("request", event)}>
          <label htmlFor={id + "-identifier"}>{text.identifier}<input ref={identifierInput} id={id + "-identifier"} name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} required disabled={busy} value={identifier} onChange={event => { setIdentifier(event.target.value); setError(""); }} aria-describedby={id + "-help"}/></label>
          <p className="password-recovery-note" id={id + "-help"}>{text.help}</p>
        </form> : <form id={id + "-action"} className="password-recovery-form" noValidate aria-busy={busy} onSubmit={event => void submit(step === "code" ? "verify" : "reset", event)}>
          {step === "code" && !previewOnly && <p className="password-recovery-sent" role="status">{text.sent}</p>}
          <div className="password-recovery-identity"><span>{identifier}</span><Button type="button" variant="link" disabled={busy} onClick={changeIdentifier}>{text.change}</Button></div>
          {step === "code" ? <>
            <label htmlFor={id + "-code"}>{text.code}<input ref={codeInput} className="password-recovery-code" id={id + "-code"} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy} value={code} onChange={event => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} aria-describedby={id + "-code-hint"}/></label>
            <p className="password-recovery-note" id={id + "-code-hint"}>{text.codeHint}</p>
          </> : <>
            <label htmlFor={id + "-password"}>{text.password}<PasswordInput ref={passwordInput} id={id + "-password"} name="new-password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} value={password} onChange={event => { setPassword(event.target.value); setError(""); }}/></label>
            <label htmlFor={id + "-confirm"}>{text.confirm}<PasswordInput id={id + "-confirm"} name="confirm-password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} value={confirm} onChange={event => { setConfirm(event.target.value); setError(""); }}/></label>
          </>}
        </form>)}
        {error && availability === "ready" && <p ref={errorMessage} className="password-recovery-error" role="alert" tabIndex={-1} data-error-popup-ignore>{error}</p>}
      </>}
    </div>
    <div className="password-recovery-actions">
      {busy && <p className="password-recovery-note" role="status">{text.wait}</p>}
      {settled ? <Button type="button" className="password-recovery-primary" onClick={onFinish}>{previewOnly ? text.previewClose : text.login}</Button> : availability === "ready" && (step === "identifier" ?
        <Button className="password-recovery-primary" type="submit" form={id + "-request"} disabled={busy || remaining > 0}>{previewOnly ? text.previewNext : busy ? text.sending : remaining > 0 ? text.send + " (" + remaining + "s)" : text.send}</Button> : <>
          <Button className="password-recovery-primary" type="submit" form={id + "-action"} disabled={busy || expiresAt <= now}>{previewOnly ? step === "code" ? text.previewNext : text.previewReset : pendingAction === "verify" ? text.verifying : pendingAction === "reset" ? text.resetting : step === "code" ? text.verify : text.reset}</Button>
          {step === "code" && <Button type="button" variant="outline" disabled={busy || remaining > 0} onClick={() => void submit("request")}>{pendingAction === "request" ? text.sending : remaining > 0 ? text.resend + " (" + remaining + "s)" : text.resend}</Button>}
        </>)}
    </div>
  </DialogContent>;
}
