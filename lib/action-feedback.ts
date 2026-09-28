"use client";

import { t } from "@/lib/i18n";

export type ActionToast = { kind: "success" | "error"; message: string; id: number };
export const ACTION_TOAST_EVENT = "timelyo:action-toast";
let lastToast: { kind: string; message: string; at: number } | null = null;

export function showActionToast(kind: ActionToast["kind"], value: string) {
  if (typeof window === "undefined") return;
  const message = t(value);
  const at = Date.now();
  if (lastToast?.kind === kind && lastToast.message === message && at - lastToast.at < 1500) return;
  lastToast = { kind, message, at };
  window.dispatchEvent(new CustomEvent<ActionToast>(ACTION_TOAST_EVENT, { detail: { kind, message, id: at } }));
}

export function actionFailureMessage(error: unknown, fallback = "操作失败，请重试") {
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) return t("网络连接中断，请检查网络后重试");
  const message = error instanceof Error ? error.message : fallback;
  if (/stack trace|internal server error|SQLITE_|D1_ERROR|wrangler|cloudflare:workers|token=|secret=/i.test(message)) return t("操作失败，请稍后重试；如仍失败请联系管理员");
  return t(message || fallback);
}

// Kept for existing callers: failures now use the shared non-blocking, persistent toast.
export function alertActionFailure(error: unknown, fallback?: string) {
  const message = actionFailureMessage(error, fallback);
  showActionToast("error", message);
  return message;
}

export async function readApiJson<T>(response: Response): Promise<T> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    const reason = response.status === 413 ? t("请求内容过大") : response.status === 401 ? t("登录已过期，请重新登录") : t("服务器未返回有效响应，请稍后重试");
    throw new Error(reason);
  }
  try { return await response.json() as T; }
  catch { throw new Error(t("服务器未返回有效响应，请稍后重试")); }
}
