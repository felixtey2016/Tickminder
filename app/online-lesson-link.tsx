"use client";

import { ExternalLink } from "lucide-react";
import { t } from "@/lib/i18n";

export function OnlineLessonLink({ href }: { href?: string | null }) {
  if (!href) return null;
  let url: URL;
  try { url = new URL(href); }
  catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  return <a className="online-lesson-link" href={url.toString()} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true"/>{t("进入网课")}</a>;
}
