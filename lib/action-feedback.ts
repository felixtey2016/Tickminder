"use client";

import { t } from "@/lib/i18n";

export function actionFailureMessage(error: unknown, fallback = "操作失败，请重试") {
  const message = error instanceof Error ? error.message : fallback;
  return t(message || fallback);
}

export function alertActionFailure(error: unknown, fallback?: string) {
  const message = actionFailureMessage(error, fallback);
  window.alert(message);
  return message;
}

export async function readApiJson<T>(response: Response): Promise<T> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    const reason = response.status === 413 ? t("请求内容过大") : t("服务器未返回有效响应");
    throw new Error(`${reason} (HTTP ${response.status})`);
  }
  try { return await response.json() as T; }
  catch { throw new Error(`${t("服务器未返回有效响应")} (HTTP ${response.status})`); }
}
