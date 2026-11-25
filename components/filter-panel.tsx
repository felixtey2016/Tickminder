"use client";

import type { ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { t } from "@/lib/i18n";

export function FilterPanel({ children, active = false, summary }: { children: ReactNode; active?: boolean;summary?:string }) {
  return <details className="filter-panel">
    <summary><SlidersHorizontal size={18} aria-hidden="true"/><span>{t("筛选")}{active && <small>{t("已应用")}</small>}</span>{summary&&<span className="filter-panel-selection" title={summary}>{summary}</span>}<ChevronDown size={18} aria-hidden="true"/></summary>
    <div className="filter-panel-fields">{children}</div>
  </details>;
}
