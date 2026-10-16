"use client";
import {attendanceLabels} from "@/lib/attendance-types";
import {groupFetch} from "@/lib/group-client";


import { useState } from "react";
import { getLanguage, t } from "@/lib/i18n";
import { readApiJson } from "@/lib/action-feedback";

type Entry = {
  id: string; type: "request" | "direct"; originalStart: string; originalEnd: string;
  proposedStart: string; proposedEnd: string; status: string;
  requestedBy: string | null; requestedAt: string; respondedBy: string | null; respondedAt: string | null; note?: string | null;
};
type AttendanceEntry={id:string;action:string;at:string;actor?:string|null;before:Record<string,unknown>;after:Record<string,unknown>};
type History = {studentView?:boolean; attendanceEntries?:AttendanceEntry[]; currentStart: string; currentEnd: string; entries: Entry[] };
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
      const response = await groupFetch(`/api/lesson-history?lessonId=${encodeURIComponent(lessonId)}`, { cache: "no-store" });
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
    <summary>{t("课程与考勤变更记录")}</summary>
    {open && <div className="lesson-history-body">
      {loading && <p>{t("正在加载…")}</p>}
      {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>{t("重试")}</button></p>}
      {history && <><p className="lesson-history-current"><strong>{t("当前确认时间")}：</strong>{span(history.currentStart, history.currentEnd)}</p>
        {history.entries.length ? <ol>{history.entries.map(entry => <li key={entry.id}>
          <strong>{t(resultLabel[entry.status] || entry.status)}</strong>
          <span>{span(entry.originalStart, entry.originalEnd)} → {span(entry.proposedStart, entry.proposedEnd)}</span>
          <small>{entry.type === "direct" ? t("管理员直接修改") : t("申请人")}{(!history.studentView||entry.type!=="direct")&&<>：{t(entry.requestedBy || (history.studentView?"管理员":"已删除账号"))}</>} · {dateTime(entry.requestedAt)}</small>
          {entry.note && <p>{entry.note}</p>}
          {entry.respondedAt && <small>{!history.studentView&&<>{t("处理人")}：{t(entry.respondedBy || "系统")} · </>}{dateTime(entry.respondedAt)}</small>}
        </li>)}</ol> : <p>{t("暂无改期记录")}</p>}
        {history.attendanceEntries?.length ? <section className="attendance-history">
          <h3>{t("考勤变更历史")}</h3><ol>{history.attendanceEntries.map(entry => <li key={entry.id}>
            <strong>{t(entry.action.includes("review") ? "复核考勤" : "登记考勤")}{!history.studentView && <> · {entry.actor || t("已删除账号")}</>}</strong>
            <small>{dateTime(entry.at)}</small>{[entry.before, entry.after].map((value, index) => <div key={index}>
              <b>{t(index ? "变更后" : "变更前")}</b><span>{t(attendanceLabels[String(value.status || "")] || String(value.status || "—"))}</span>
              {typeof value.actualStart === "string" && typeof value.actualEnd === "string" && <small>{t("老师授课时间")} · {span(value.actualStart, value.actualEnd)}</small>}
              {typeof value.arrivedAt === "string" && typeof value.leftAt === "string" && <small>{t("个人出席时间")} · {span(value.arrivedAt, value.leftAt)}</small>}
              {!history.studentView && <>
                {typeof value.note === "string" && <p>{value.note}</p>}
                {typeof value.teachingNote === "string" && <p>{t("课次授课备注")} · {value.teachingNote}</p>}
                {(typeof value.chargeable === "boolean" || typeof value.chargeable === "number") && <small>{t("标记为收费")} · {t(value.chargeable ? "是" : "否")}</small>}
              </>}
            </div>)}
          </li>)}</ol>
        </section> : null}
      </>}
    </div>}
  </details>;
}
