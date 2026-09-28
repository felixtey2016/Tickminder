"use client";

import { useEffect, useState } from "react";
import { getLanguage, t } from "@/lib/i18n";
import { readApiJson } from "@/lib/action-feedback";

export type ConflictDetail = {
  start: string; end: string; reason: "student" | "teacher" | "both";
  student?: string; teacherName?: string;
};
const stamp = (iso: string) => new Intl.DateTimeFormat(getLanguage() === "zh" ? "zh-CN" : "en-GB", {
  timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "short", day: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: false,
}).format(new Date(iso));

export function conflictDescription(conflict: ConflictDetail) {
  const why = conflict.reason === "both" ? t("学生和老师的时间都有冲突") :
    conflict.reason === "student" ? t("该学生已有课程") : t("老师已有课程");
  const names = conflict.student && conflict.teacherName ? ` · ${conflict.student} / ${conflict.teacherName}` : "";
  return `${t("课程时间冲突")}：${why} · ${stamp(conflict.start)} – ${stamp(conflict.end)}${names}`;
}

export function ConflictPreview({ value, enabled }: { value: Record<string, unknown>; enabled: boolean }) {
  const [result, setResult] = useState<{ conflict?: ConflictDetail; error?: string; available?: boolean; checking?: boolean }>({});
  const key = JSON.stringify(value);
  useEffect(() => {
    if (!enabled) { setResult({}); return; }
    const controller = new AbortController();
    setResult({ checking: true });
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/conflicts", {
          method: "POST", headers: { "content-type": "application/json" }, body: key,
          signal: controller.signal, cache: "no-store",
        });
        const data = await readApiJson<{ available?: boolean; conflict?: ConflictDetail; error?: string }>(response);
        if (!response.ok) throw new Error(data.error || t("暂时无法检查时间"));
        setResult({ available: data.available, conflict: data.conflict });
      } catch (error) {
        if (controller.signal.aborted) return;
        setResult({ error: error instanceof Error ? t(error.message) : t("暂时无法检查时间") });
      }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [key, enabled]);
  if (!enabled) return null;
  return <p className={`conflict-preview${result.conflict ? " conflict" : ""}`} role={result.conflict ? "alert" : "status"}>
    {result.checking ? t("正在核对课程时间…") : result.conflict ? conflictDescription(result.conflict) :
      result.error ? `${result.error} · ${t("保存时系统会再检查")}` :
      result.available ? t("目前没有课程冲突的时段；请另外确认老师是否有空") : null}
    <br/><small>{t("已取消课程不占时段；待确认改期仍按当前已排时间计算。")}</small>
  </p>;
}
