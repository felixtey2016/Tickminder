"use client";

import { useState } from "react";
import { getLanguage, t } from "@/lib/i18n";
import { readApiJson } from "@/lib/action-feedback";

type Entry = {
  id: string; type: "request" | "direct"; originalStart: string; originalEnd: string;
  proposedStart: string; proposedEnd: string; status: string;
  requestedBy: string | null; requestedAt: string; respondedBy: string | null; respondedAt: string | null;
};
type History = { currentStart: string; currentEnd: string; entries: Entry[] };
const dateTime = (iso: string) => new Intl.DateTimeFormat(getLanguage() === "zh" ? "zh-CN" : "en-GB", {
  timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "short", day: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: false,
}).format(new Date(iso));
const span = (start: string, end: string) => `${dateTime(start)} – ${dateTime(end)}`;
const resultLabel: Record<string, string> = {
  pending: "待处理", accepted: "已接受", rejected: "已拒绝", stale: "已失效", applied: "已直接修改",
};

export function LessonHistory({ lessonId }: { lessonId: string }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function load() {
    if (loading) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/lesson-history?lessonId=${encodeURIComponent(lessonId)}`, { cache: "no-store" });
      const result = await readApiJson<History & { error?: string }>(response);
      if (!response.ok) throw new Error(t(result.error || "改期记录暂时无法载入"));
      setHistory(result);
    } catch (caught) {
      setError(caught instanceof Error ? t(caught.message) : t("改期记录暂时无法载入"));
    } finally { setLoading(false); }
  }
  return <details className="lesson-history" open={open} onToggle={event => {
    const next = event.currentTarget.open;
    setOpen(next);
    if (next) void load();
  }}>
    <summary>{t("改期记录")}</summary>
    {open && <div className="lesson-history-body">
      {loading && <p>{t("正在载入…")}</p>}
      {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>{t("重试")}</button></p>}
      {history && <><p className="lesson-history-current"><strong>{t("当前确认时间")}：</strong>{span(history.currentStart, history.currentEnd)}</p>
        {history.entries.length ? <ol>{history.entries.map(entry => <li key={entry.id}>
          <strong>{t(resultLabel[entry.status] || entry.status)}</strong>
          <span>{span(entry.originalStart, entry.originalEnd)} → {span(entry.proposedStart, entry.proposedEnd)}</span>
          <small>{entry.type === "direct" ? t("管理员直接修改") : t("申请人")}：{t(entry.requestedBy || "已删除账号")} · {dateTime(entry.requestedAt)}</small>
          {entry.respondedAt && <small>{t("处理人")}：{t(entry.respondedBy || "系统")} · {dateTime(entry.respondedAt)}</small>}
        </li>)}</ol> : <p>{t("暂无改期记录")}</p>}
      </>}
    </div>}
  </details>;
}
