"use client";
import {groupFetch} from "@/lib/group-client";

import { useRef, useState } from "react";
import { getLanguage, t } from "@/lib/i18n";
import { formatDurationHours } from "@/lib/duration-format";
import { alertActionFailure, readApiJson, showActionToast } from "@/lib/action-feedback";
import { Button } from "@/components/ui/button";
import type { SyncMode } from "@/lib/sheet-sync";

type Preview = {
  month: string;
  displayMonth: string;
  previewToken: string;
  changes: Array<{ row: number; student: string; subject: string; before: number | string; after: number }>;
  skipped: Array<{ student: string; subject: string; reason: string }>;
};

const reason: Record<string, string> = {
  not_found: "表格中没有完全一致的学生和科目",
  duplicate_sheet: "表格中有重复的学生和科目",
  duplicate_website: "网站中有重复的学生和科目",
  not_in_website: "网站中没有此学生科目",
};

function displaySheetHours(value: number | string) {
  if (value === "") return "—";
  const numeric = typeof value === "number" ? value : value.trim() ? Number(value) : NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? formatDurationHours(numeric, getLanguage()) : String(value);
}

export function SheetSyncPanel() {
  const [mode, setMode] = useState<SyncMode>("billable");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  async function run(action: "preview" | "commit") {
    if ((action === "commit" && !preview) || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    setDone(false);
    try {
      const response = await groupFetch("/api/sheet-sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, mode, month: preview?.month, previewToken: preview?.previewToken }),
      });
      const result = await readApiJson<Preview & { error?: string; written?: number }>(response);
      if (!response.ok) throw new Error(result.error || "导入失败，请重试。");
      if (action === "preview") setPreview(result);
      else { setDone(true); setPreview(null); const summary = `${t("已写入")} ${result.written || 0} ${t("个学生科目的课时。")} ${t("再次写入会覆盖相同单元格，不会累加。")}`; setMessage(summary); showActionToast("success", summary); }
    } catch (error) {
      if (action === "commit") setPreview(null);
      setMessage(alertActionFailure(error, "导入失败，请重试。"));
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <section className="panel sheet-sync-panel">

    <h2>{t("课时写入 Google Sheet")}</h2>
    <p className="muted">{t("先在 Google Sheet 的 Lesson Records!B2 选择目标月份。系统将该月课时覆盖写入学生与科目完全匹配的 Total Hours，其余行保持不变。")}</p>
    <label className="sheet-sync-mode">{t("计入范围")}
      <select value={mode} disabled={busy} onChange={event => { setMode(event.target.value as SyncMode); setPreview(null); setDone(false); }}>
        <option value="billable">{t("已完成且标记收费的课时")}</option>
        <option value="all_completed">{t("全部已完成课时（含不收费）")}</option>
      </select>
    </label>
    <Button disabled={busy} onClick={() => void run("preview")}>{busy ? t("正在读取并比对表格…") : t("预览写入内容")}</Button>
    {message && <div className={done ? "notice" : "error"} role="status">{message}</div>}
    {preview && <div className="sheet-sync-preview">
      <h3>{t("目标月份")}：{preview.displayMonth} <small>({preview.month})</small></h3>
      <p className="muted">{t("将更新")} {preview.changes.length} {t("行，跳过")} {preview.skipped.length} {t("行。请核对后确认。")}</p>
      {preview.changes.length > 0 && <div className="sheet-sync-table-wrap"><table className="sheet-sync-table"><thead><tr><th>{t("表格行")}</th><th>{t("学生")}</th><th>{t("科目")}</th><th>{t("Total Hours 原值 → 新值")}</th></tr></thead><tbody>{preview.changes.map(item => <tr key={item.row}><td>{item.row}</td><td>{item.student}</td><td>{item.subject}</td><td>{displaySheetHours(item.before)} → <strong>{formatDurationHours(item.after, getLanguage())}</strong></td></tr>)}</tbody></table></div>}
      {preview.skipped.length > 0 && <details className="sheet-sync-skipped"><summary>{t("未匹配或已跳过的记录")} ({preview.skipped.length})</summary><ul>{preview.skipped.map((item, index) => <li key={`${item.student}|${item.subject}|${index}`}><strong>{item.student} · {item.subject}</strong> — {t(reason[item.reason] || item.reason)}</li>)}</ul></details>}
      <Button disabled={busy || !preview.changes.length} onClick={() => void run("commit")}>{t("确认写入表格")}</Button>
    </div>}
  </section>;
}
