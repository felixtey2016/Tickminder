"use client";
import "@/lib/student-offboarding-i18n";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { alertActionFailure, readApiJson, showActionToast } from "@/lib/action-feedback";
import { groupFetch } from "@/lib/group-client";
import { getLanguage, t } from "@/lib/i18n";
import { useDialogState } from "@/lib/use-dialog-state";
import { useAdminAction, useAdminPermissionAccount } from "./admin-permission-context";
import "@/lib/student-offboarding-finance-i18n";
import "./student-offboarding.css";

export type StudentOffboardingRecord = {studentName: string; status: "marked" | "cleaned" | "cancelled"; lastLessonDate: string | null; reason: string; revision: number};
type Preview = {token: string; studentName: string; effects: Array<{label: string; count: number}>; blockers: Array<{code: string; label: string; count: number}>; financialHistoryRetained: boolean};
const text = (zh: string, en: string) => getLanguage() === "en" ? en : zh;
const changedEvent = "tickminder-student-offboarding-updated";
async function api<T>(body?: Record<string, unknown>, studentName?: string, signal?: AbortSignal): Promise<T> {
  const response = await groupFetch("/api/student-offboarding" + (studentName ? "?" + new URLSearchParams({studentName}) : ""), body ? {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body), cache: "no-store", signal} : {cache: "no-store", signal});
  const result = await readApiJson<T & {error?: string}>(response);
  if (!response.ok) throw Object.assign(new Error(t(result.error || "操作失败，请重试")), {status: response.status});
  return result;
}
function announceChange(cleaned = false) {
  window.dispatchEvent(new Event(changedEvent));
  if (cleaned) window.dispatchEvent(new Event("tickminder-roster-updated"));
}

export function useStudentOffboarding(enabled = true) {
  const can = useAdminAction(), account = useAdminPermissionAccount();
  const readable = enabled && account?.role === "admin" && (can("students.view") || can("students.edit") || can("students.delete"));
  const scope = JSON.stringify(account);
  const [items, setItems] = useState<StudentOffboardingRecord[]>([]), [loading, setLoading] = useState(false), [failed, setFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    controller.current?.abort();
    if (!readable) {setItems([]); setLoading(false); setFailed(false); return;}
    const request = new AbortController(); controller.current = request;
    setLoading(true); setFailed(false);
    try {const result = await api<{items: StudentOffboardingRecord[]}>(undefined, undefined, request.signal); if (!request.signal.aborted) setItems(result.items || []);}
    catch (error) {if (!request.signal.aborted) {setItems([]); setFailed(true); alertActionFailure(error);}}
    finally {if (!request.signal.aborted) setLoading(false);}
  }, [readable, scope]);
  useEffect(() => {void reload(); const refresh = () => void reload(); window.addEventListener(changedEvent, refresh); return () => {controller.current?.abort(); window.removeEventListener(changedEvent, refresh);};}, [reload]);
  return {items, loading, failed, reload};
}

export function StudentOffboardingBadge({record}: {record?: StudentOffboardingRecord}) {
  if (!record || record.status !== "marked") return null;
  return <span className="student-offboarding-badge">{text("待退课／待清理", "Leaving / pending cleanup")}{record.lastLessonDate && <span> · {record.lastLessonDate}</span>}</span>;
}

function OffboardingEditor({studentName, disabled, onDone, onBusyChange}: {studentName: string; disabled: boolean; onDone: () => void; onBusyChange: (busy: boolean) => void}) {
  const can = useAdminAction(), canEdit = can("students.edit"), canClean = can("students.delete");
  const [record, setRecord] = useState<StudentOffboardingRecord | null>(null), [date, setDate] = useState(""), [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [busy, setBusy] = useState(false), [preview, setPreview] = useState<Preview | null>(null), [confirmed, setConfirmed] = useState(false);
  const inFlight = useRef(false), generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current; setLoading(true); setFailed(false); setPreview(null); setConfirmed(false);
    try {const result = await api<{items: StudentOffboardingRecord[]}>(undefined, studentName); if (current !== generation.current) return; const next = result.items.find(item => item.studentName === studentName) || null; setRecord(next); setDate(next?.lastLessonDate || ""); setReason(next?.reason || "");}
    catch (error) {if (current === generation.current) {setFailed(true); alertActionFailure(error);}}
    finally {if (current === generation.current) setLoading(false);}
  }, [studentName]);
  useEffect(() => {void load(); return () => {generation.current++;};}, [load]);
  async function submit(action: "mark" | "cancel" | "preview" | "cleanup") {
    if (inFlight.current || disabled || loading || failed) return;
    if (action === "preview" || action === "cleanup") {if (!canClean || record?.status !== "marked") return;}
    else if (!canEdit) return;
    if (action === "cleanup" && (!preview?.token || preview.studentName !== studentName || preview.blockers.length || !preview.financialHistoryRetained || !confirmed)) return;
    inFlight.current = true; setBusy(true); onBusyChange(true);
    try {
      const result = await api<{preview?: Preview; warning?: string}>({action, studentName, revision: record?.revision || 0, ...(action === "mark" ? {lastLessonDate: date || null, reason: reason.trim()} : {}), ...(action === "cleanup" ? {token: preview!.token, confirm: true} : {})});
      if (action === "preview") {
        if (!result.preview || result.preview.studentName !== studentName || !Array.isArray(result.preview.effects) || !Array.isArray(result.preview.blockers) || result.preview.financialHistoryRetained !== true) throw new Error(text("清理预览未能加载，请重试", "The cleanup preview could not load. Please retry."));
        setPreview(result.preview); setConfirmed(false);
      } else {
        announceChange(action === "cleanup");
        showActionToast("success", action === "mark" ? text("已标记待退课／待清理", "Student marked for leaving / cleanup") : action === "cancel" ? text("已取消待清理标记", "Cleanup mark cancelled") : text("学生与教学资料已清理，财务历史已保留", "Student and teaching data cleaned up; financial history retained")+(result.warning?' · '+t(result.warning):''));
        onDone();
      }
    } catch (error) {setPreview(null); setConfirmed(false); alertActionFailure(error); if ((error as {status?: number})?.status === 409) await load();}
    finally {inFlight.current = false; setBusy(false); onBusyChange(false);}
  }
  const unavailable = disabled || busy || loading || failed;
  if (loading) return <p role="status">{t("正在加载…")}</p>;
  if (failed) return <div className="student-offboarding-actions"><Button type="button" variant="outline" onClick={() => void load()}>{t("重试")}</Button></div>;
  if (preview) return <div className="student-offboarding-editor">
    <p className="student-offboarding-preserved">{text("财务历史保留", "Financial history is retained")}</p>
    {!!preview.effects.length && <div><h3>{text("将清理的资料", "Data to clean up")}</h3><ul className="student-offboarding-effects">{preview.effects.map((effect, index) => <li key={index}><span>{t(effect.label)}</span><strong>{effect.count}</strong></li>)}</ul></div>}
    {!!preview.blockers.length && <div className="student-offboarding-blockers"><h3>{text("请先处理以下事项", "Resolve these items first")}</h3><ul className="student-offboarding-effects">{preview.blockers.map((blocker, index) => <li key={blocker.code + index}><span>{t(blocker.label)}</span>{blocker.count > 0 && <strong>{blocker.count}</strong>}</li>)}</ul></div>}
    {!preview.blockers.length && <label className="student-offboarding-confirm"><input type="checkbox" checked={confirmed} disabled={unavailable || !canClean} onChange={event => setConfirmed(event.target.checked)}/><span>{text("我已核对范围，确认清理学生与教学资料。此操作无法恢复。", "I have reviewed the scope and confirm cleanup of student and teaching data. This cannot be undone.")}</span></label>}
    <div className="student-offboarding-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => {setPreview(null); setConfirmed(false);}}>{text("返回资料", "Back to details")}</Button><Button type="button" variant="destructive" disabled={unavailable || !canClean || !confirmed || !!preview.blockers.length || !preview.financialHistoryRetained} onClick={() => void submit("cleanup")}>{text("确认清理学生资料", "Confirm student cleanup")}</Button></div>
  </div>;
  return <form className="student-offboarding-editor" onSubmit={event => {event.preventDefault(); void submit("mark");}}>
    <p className="student-offboarding-description">{text("先标记退课时间；财务事项处理完成后，再核对并清理资料。", "Mark the leaving date first, then review cleanup after financial items are resolved.")}</p>
    <label>{text("预计最后上课日（选填）", "Planned last lesson date (optional)")}<input type="date" value={date} disabled={unavailable || !canEdit} onChange={event => setDate(event.target.value)}/></label>
    <label>{text("原因（选填）", "Reason (optional)")}<textarea maxLength={500} rows={2} value={reason} disabled={unavailable || !canEdit} onChange={event => setReason(event.target.value)}/></label>
    <div className="student-offboarding-actions">{canEdit && <Button disabled={unavailable}>{record?.status === "marked" ? text("保存标记", "Save mark") : text("标记待退课／待清理", "Mark leaving / cleanup")}</Button>}{record?.status === "marked" && canClean && <Button type="button" variant="outline" disabled={unavailable} onClick={() => void submit("preview")}>{text("核对清理范围", "Review cleanup")}</Button>}{record?.status === "marked" && canEdit && <Button type="button" variant="outline" disabled={unavailable} onClick={() => void submit("cancel")}>{text("取消标记", "Cancel mark")}</Button>}</div>
  </form>;
}

export function StudentOffboardingAction({studentName, record, busy = false}: {studentName: string; record?: StudentOffboardingRecord; busy?: boolean}) {
  const can = useAdminAction(), [open, setOpen] = useDialogState<boolean | null>("student-offboarding-" + studentName, null);
  const [editorBusy, setEditorBusy] = useState(false);
  if (!can("students.edit") && (!can("students.delete") || record?.status !== "marked")) return null;
  return <><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setOpen(true)}>{record?.status === "marked" ? text("管理退课与清理", "Manage leaving / cleanup") : text("退课与清理", "Leaving & cleanup")}</Button><Dialog open={Boolean(open)} onOpenChange={value => {if (!editorBusy) setOpen(value ? true : null);}}><DialogContent className="lesson-dialog directory-dialog student-offboarding-dialog" showCloseButton={!editorBusy}><DialogHeader><DialogTitle>{text("退课与资料清理", "Leaving & data cleanup")}</DialogTitle></DialogHeader><strong className="student-offboarding-name">{studentName}</strong>{open && <OffboardingEditor studentName={studentName} disabled={busy} onDone={() => setOpen(null)} onBusyChange={setEditorBusy}/>}</DialogContent></Dialog></>;
}

export function StudentOffboardingQueue({items, loading, failed, reload, busy = false}: {items: StudentOffboardingRecord[]; loading: boolean; failed: boolean; reload: () => Promise<void>; busy?: boolean}) {
  const can = useAdminAction(), [open, setOpen] = useDialogState<boolean | null>("student-offboarding-queue", null), [selected, setSelected] = useState<string | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const marked = items.filter(item => item.status === "marked");
  if (!can("students.edit") && !can("students.delete")) return null;
  return <><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => {setSelected(null); setOpen(true);}}>{text("待清理名单", "Cleanup queue")}{!loading && !failed ? ` · ${marked.length}` : ""}</Button><Dialog open={Boolean(open)} onOpenChange={value => {if (editorBusy) return; setOpen(value ? true : null); if (!value) setSelected(null);}}><DialogContent className="lesson-dialog directory-dialog student-offboarding-dialog" showCloseButton={!editorBusy}><DialogHeader><DialogTitle>{selected ? text("退课与资料清理", "Leaving & data cleanup") : text("待退课／待清理名单", "Leaving / cleanup queue")}</DialogTitle></DialogHeader>{selected ? <><strong className="student-offboarding-name">{selected}</strong><OffboardingEditor key={selected} studentName={selected} disabled={busy} onDone={() => setSelected(null)} onBusyChange={setEditorBusy}/><Button type="button" variant="outline" disabled={editorBusy} onClick={() => setSelected(null)}>{text("返回待清理名单", "Back to queue")}</Button></> : <div className="student-offboarding-list">{loading && <p role="status">{t("正在加载…")}</p>}{!loading && failed && <Button type="button" variant="outline" onClick={() => void reload()}>{t("重试")}</Button>}{!loading && !failed && !marked.length && <p className="muted">{text("暂无待清理学生", "No students awaiting cleanup")}</p>}{!loading && marked.map(item => <article key={item.studentName}><div><strong>{item.studentName}</strong><StudentOffboardingBadge record={item}/>{item.reason && <details><summary>{text("查看原因", "View reason")}</summary><p>{item.reason}</p></details>}</div><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setSelected(item.studentName)}>{text("查看与处理", "Review")}</Button></article>)}</div>}</DialogContent></Dialog></>;
}
