"use client";

import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

type Pose = "hello" | "empty" | "loading" | "error" | "success" | "homework-submitted";

export function Mascot({ pose, size = 136, alt = "" }: { pose: Pose; size?: number; alt?: string }) {
  return <img className="mascot" src={`/mascots/mascot-${pose}.svg`} width={size} height={size} alt={alt} draggable={false}/>;
}

// Page states only. Inline errors, background refreshes and toasts keep their own feedback.
export function PageState({ kind, title, description, action, onAction }: {
  kind: "empty" | "loading" | "error" | "success";
  title: string; description?: string; action?: string; onAction?: () => void;
}) {
  return <div className={`page-state page-state-${kind}`} role={kind === "error" ? "alert" : "status"} aria-busy={kind === "loading" || undefined}>
    <Mascot pose={kind} size={kind === "loading" ? 96 : 136}/>
    <h2>{t(title)}</h2>
    {description && <p>{t(description)}</p>}
    {action && onAction && <Button variant="outline" onClick={onAction}>{t(action)}</Button>}
    {kind === "loading" && <div className="page-skeleton" aria-hidden="true"><span/><span/><span/></div>}
  </div>;
}
