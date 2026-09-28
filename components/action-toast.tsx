"use client";

import { useEffect, useState } from "react";
import { ACTION_TOAST_EVENT, type ActionToast } from "@/lib/action-feedback";
import { t } from "@/lib/i18n";

export function ActionToastHost() {
  const [toast, setToast] = useState<ActionToast | null>(null);
  useEffect(() => {
    const receive = (event: Event) => setToast((event as CustomEvent<ActionToast>).detail);
    window.addEventListener(ACTION_TOAST_EVENT, receive);
    return () => window.removeEventListener(ACTION_TOAST_EVENT, receive);
  }, []);
  useEffect(() => {
    if (!toast || toast.kind !== "success") return;
    const timer = window.setTimeout(() => setToast(current => current?.id === toast.id ? null : current), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  if (!toast) return null;
  return <div className={`action-toast ${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"} aria-live={toast.kind === "error" ? "assertive" : "polite"}>
    <span className="action-toast-icon" aria-hidden="true">{toast.kind === "success" ? "✓" : "!"}</span>
    <span>{toast.message}</span>
    <button type="button" onClick={() => setToast(null)} aria-label={t("关闭")}>×</button>
  </div>;
}
