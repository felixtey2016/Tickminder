"use client";

import { Ellipsis } from "lucide-react";
import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t } from "@/lib/i18n";

export function LessonMore({ children }: { children: ReactNode }) {
  return <Popover><PopoverTrigger asChild><Button type="button" variant="outline" size="sm"><Ellipsis size={18} aria-hidden="true"/>{t("更多")}</Button></PopoverTrigger><PopoverContent align="end" className="lesson-more">{children}</PopoverContent></Popover>;
}
