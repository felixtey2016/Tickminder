"use client";

import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export const MASCOT_ASSETS = {
  hello: "/mascots/hello.png",
  reading: "/mascots/reading.png",
  thinking: "/mascots/thinking.png",
  encourage: "/mascots/encourage.png",
  celebrate: "/mascots/celebrate.png",
  ready: "/mascots/ready.png",
  search: "/mascots/search.png",
  waiting: "/mascots/waiting.png",
  rest: "/mascots/rest.png",
  surprise: "/mascots/surprise.png",
  retry: "/mascots/retry.png",
  sleepy: "/mascots/sleepy.png",
} as const;
export type MascotPose = keyof typeof MASCOT_ASSETS;
const LEGACY_POSES = {
  empty: "search", loading: "waiting", error: "retry", success: "celebrate",
  "homework-submitted": "celebrate",
} as const;
type Pose = MascotPose | keyof typeof LEGACY_POSES;

export function Mascot({ pose, size = 136, alt = "", className = "" }: { pose: Pose; size?: number; alt?: string; className?: string }) {
  const resolved = pose in LEGACY_POSES ? LEGACY_POSES[pose as keyof typeof LEGACY_POSES] : pose as MascotPose;
  return <img className={`mascot ${className}`.trim()} data-mascot={resolved} src={MASCOT_ASSETS[resolved]} width={size} height={size} alt={alt} draggable={false} loading="lazy" decoding="async"/>;
}

export function MascotNote({ pose, title, description, size = 72, className = "" }: {
  pose: MascotPose; title: string; description?: string; size?: number; className?: string;
}) {
  return <div className={`mascot-note ${className}`.trim()}>
    <Mascot pose={pose} size={size}/>
    <div className="mascot-note-copy"><p className="mascot-note-title">{t(title)}</p>{description && <p className="mascot-note-description">{t(description)}</p>}</div>
  </div>;
}

// Page states only. Inline errors, background refreshes and toasts keep their own feedback.
export function PageState({ kind, title, description, action, onAction, pose }: {
  kind: "empty" | "loading" | "error" | "success";
  title: string; description?: string; action?: string; onAction?: () => void;
  pose?: MascotPose;
}) {
  return <div className={`page-state page-state-${kind}`} role={kind === "error" ? "alert" : "status"} aria-busy={kind === "loading" || undefined}>
    <Mascot pose={pose || kind} size={kind === "loading" ? 96 : 136}/>
    <h2>{t(title)}</h2>
    {description && <p>{t(description)}</p>}
    {action && onAction && <Button variant="outline" onClick={onAction}>{t(action)}</Button>}
    {kind === "loading" && <div className="page-skeleton" aria-hidden="true"><span/><span/><span/></div>}
  </div>;
}
