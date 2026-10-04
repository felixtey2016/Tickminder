"use client";

import type { ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { t } from "@/lib/i18n";

export function FilterPanel({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return <details className="filter-panel">
    <summary><SlidersHorizontal size={18} aria-hidden="true"/><span>{t("筛选")}{active && <small>{t("已应用")}</small>}</span><ChevronDown size={18} aria-hidden="true"/></summary>
    <div className="filter-panel-fields">{children}</div>
  </details>;
}
