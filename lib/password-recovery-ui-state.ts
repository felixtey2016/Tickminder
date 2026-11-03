import { quizLinkIdFromPath } from "./quiz-link";
import type { Language } from "./i18n";

export const RECOVERY_STORAGE_KEY = "tickminder:password-recovery:v1";
export const RECOVERY_LIFETIME = 600_000;
export type RecoveryAction = "request" | "verify" | "reset";
export type RecoverySnapshot = {
  version: 1; context: "login" | "settings"; owner: string; returnTo: string;
  step: "identifier" | "code" | "password" | "unknown";
  identifier: string; challenge: string; resetToken: string;
  expiresAt: number; retryAt: number; pending: RecoveryAction | null;
};

// Preserve assignment presence (even malformed/duplicate), never an external URL.
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

export function clearRecoveryState() {
  try { window.sessionStorage.removeItem(RECOVERY_STORAGE_KEY); } catch { /* Private mode can deny storage. */ }
}

export function saveRecoveryState(snapshot: RecoverySnapshot) {
  try { window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* Recovery still works without reload persistence. */ }
}

export function readRecoveryState(context: RecoverySnapshot["context"], owner: string, returnTo: string, now = Date.now()): RecoverySnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(RECOVERY_STORAGE_KEY);
    if (!raw) return null;
    if (raw.length > 24_000) throw new Error("Oversized recovery state");
    const value = JSON.parse(raw) as RecoverySnapshot;
    const boundedString = (entry: unknown, max: number): entry is string => typeof entry === "string" && entry.length <= max;
    if (value.version !== 1 || value.context !== context || value.owner !== owner || !boundedString(value.owner, 254) || !boundedString(value.returnTo, 2400)) throw new Error("Recovery context changed");
    const target = new URL(value.returnTo, window.location.origin), current = new URL(returnTo, window.location.origin);
    if (target.origin !== window.location.origin || !value.returnTo.startsWith("/") || value.returnTo.startsWith("//")) throw new Error("Invalid return path");
    const language = target.searchParams.get("lang") === "en" ? "en" : "zh";
    if (recoveryReturnPath(target.pathname, target.search, language) !== value.returnTo) throw new Error("Invalid Quiz context");
    target.searchParams.delete("lang"); current.searchParams.delete("lang");
    if (target.pathname + target.search !== current.pathname + current.search) throw new Error("Different page context");
    if (!["identifier", "code", "password", "unknown"].includes(value.step) || ![null, "request", "verify", "reset"].includes(value.pending)) throw new Error("Invalid step");
    if (!boundedString(value.identifier, 254) || !boundedString(value.challenge, 8192) || !boundedString(value.resetToken, 8192)) throw new Error("Invalid credential shape");
    if (!Number.isFinite(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + RECOVERY_LIFETIME || !Number.isFinite(value.retryAt) || value.retryAt < 0 || value.retryAt > now + RECOVERY_LIFETIME) throw new Error("Expired recovery state");
    if (value.step === "code" && (!value.challenge || value.resetToken) || value.step === "password" && !value.resetToken) throw new Error("Missing recovery credential");
    if (value.pending === "verify" && value.step !== "code" || value.pending === "reset" && value.step !== "password") throw new Error("Invalid pending step");
    // Explicit allow-list: no extra fields, especially no OTP or password, survive.
    return { version: 1, context, owner, returnTo: value.returnTo, step: value.step, identifier: value.identifier, challenge: value.step === "code" ? value.challenge : "", resetToken: value.step === "password" ? value.resetToken : "", expiresAt: value.expiresAt, retryAt: value.retryAt, pending: value.pending };
  } catch { clearRecoveryState(); return null; }
}
