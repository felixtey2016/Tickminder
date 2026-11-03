"use client";
import { DateTimeInput } from '@/components/date-time-input';
import { displayFormatter } from '@/lib/display-preferences';
import { ClassSessionLabel } from "@/components/class-session-label";
import { getLanguage, t } from "@/lib/i18n";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LessonHistory } from "./lesson-history";
import { ConflictPreview } from "./conflict-preview";
import { useAdminAction } from "./admin-permission-context";
import type {Lesson} from '@/lib/workspace-client-types';

const statusLabel: Record<string, string> = { scheduled: "已安排", completed: "已上课", student_absent: "学生缺席", teacher_absent: "老师缺席", cancelled: "已取消" };

const dayFormatters = {
    zh: new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Kuala_Lumpur", month: "short", day: "numeric", weekday: "short" }),
    en: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", month: "short", day: "numeric", weekday: "short" }),
};

const timeFormatter = displayFormatter("en-GB",{ timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false });

const localFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

const day = (iso: string) => dayFormatters[getLanguage()].format(new Date(iso));

const time = (iso: string) => timeFormatter.format(new Date(iso));

const local = (iso: string) => localFormatter.format(new Date(iso)).replace(" ", "T");

export function LessonDialog({ modal, close, mutate, busy }: {
    modal: {
        type: "attendance" | "review" | "edit" | "cancel";
        lesson: Lesson;
    };
    close: () => void;
    mutate: (x: Record<string, unknown>) => Promise<boolean>;
    busy: boolean;
}) { const can=useAdminAction();const grant=modal.type==='attendance'?'attendance.edit':modal.type==='review'?'attendance.review':modal.type==='edit'?'lessons.edit':'lessons.cancel'; const l = modal.lesson; const [operationId]=useState(()=>crypto.randomUUID()); const [status, setStatus] = useState(l.attendanceKind === "early_dismissal" ? "early_dismissal" : l.status === "scheduled" ? "completed" : l.status); const [actualStart, setActualStart] = useState(local(l.actualStart || l.plannedStart)); const [actualEnd, setActualEnd] = useState(local(l.actualEnd || l.plannedEnd)); const [note, setNote] = useState(l.note || ""); const [chargeable, setChargeable] = useState(l.chargeable ?? (l.status === "completed")); const [start, setStart] = useState(local(l.plannedStart)); const [end, setEnd] = useState(local(l.plannedEnd)); const [scope, setScope] = useState("single"); if(!can(grant))return <Dialog open={can("lessons.view")} onOpenChange={close}><DialogContent className="lesson-dialog"><DialogHeader><DialogTitle>{t("课程安排")}</DialogTitle></DialogHeader><ClassSessionLabel lesson={l}/><p className="dialog-sub">{l.student} · {l.subject}<br/>{day(l.plannedStart)} {time(l.plannedStart)}–{time(l.plannedEnd)}<br/>{l.teacherName}</p><p>{t(statusLabel[l.status]||l.status)}</p><LessonHistory lessonId={l.id}/><div className="learning-card-actions"><Button type="button" variant="outline" onClick={close}>{t("关闭")}</Button></div></DialogContent></Dialog>; return <Dialog open={can(grant)} onOpenChange={close}><DialogContent className="lesson-dialog"><DialogHeader><DialogTitle>{{ attendance: t("记录出席"), review: t("复核课程记录"), edit: t("\u8BFE\u7A0B\u6539\u671F"), cancel: t("\u53D6\u6D88\u8BFE\u7A0B") }[modal.type]}</DialogTitle></DialogHeader><ClassSessionLabel lesson={l}/>{l.sessionType==="group"&&["edit","cancel"].includes(modal.type)&&<p className="notice">{t("此操作会同时更新该课次所有学生的安排。")}</p>}<p className="dialog-sub">{l.student} · {l.subject}<br />{day(l.plannedStart)} {time(l.plannedStart)}–{time(l.plannedEnd)}</p><LessonHistory lessonId={l.id}/><form onSubmit={e => { e.preventDefault(); if (modal.type === "attendance")
    mutate({ action: "attendance", id: l.id, status, actualStart, actualEnd, note,sessionRevision:l.sessionRevision,operationId }); if (modal.type === "review")
    mutate({ action: "review", id: l.id, chargeable,sessionRevision:l.sessionRevision,operationId }); if (modal.type === "edit")
    mutate({ action: "edit", id: l.id, start, end, scope,sessionRevision:l.sessionRevision,operationId }); if (modal.type === "cancel")
    mutate({ action: "cancel", id: l.id, scope,sessionRevision:l.sessionRevision,operationId }); }}>{modal.type === "attendance" && <><label>{t("\u4E0A\u8BFE\u60C5\u51B5")}<select value={status} onChange={e => setStatus(e.target.value)}><option value="completed">{t("\u5DF2\u4E0A\u8BFE")}</option><option value="early_dismissal">{t("提前结束课程")}</option><option value="student_absent">{t("\u5B66\u751F\u7F3A\u5E2D")}</option><option value="teacher_absent">{t("\u8001\u5E08\u7F3A\u5E2D")}</option></select></label>{(status === "completed" || status === "early_dismissal") && <div className="form-pair"><label>{t("\u5B9E\u9645\u5F00\u59CB")}<DateTimeInput type="datetime-local" required value={actualStart} onChange={e => setActualStart(e.target.value)}/></label><label>{t("\u5B9E\u9645\u7ED3\u675F")}<DateTimeInput type="datetime-local" required value={actualEnd} onChange={e => setActualEnd(e.target.value)}/></label></div>}<label>{t("\u5907\u6CE8\uFF08\u53EF\u9009\uFF09")}<textarea maxLength={500} value={note} onChange={e => setNote(e.target.value)}/></label></>}{modal.type === "review" && <><p>{t("出席状态：")}{t(l.attendanceKind === "early_dismissal" ? "提前结束课程" : statusLabel[l.status] || l.status)}{t("\u3002\u5DF2\u5B8C\u6210\u8BFE\u7A0B\u6309\u5B9E\u9645\u65F6\u95F4\u8BA1\u5165\u7EDF\u8BA1\uFF1B\u7F3A\u5E2D\u4E0D\u8BA1\u5165\u5DF2\u5B8C\u6210\u8BFE\u65F6\u3002\u6536\u8D39\u6807\u8BB0\u4EC5\u4F9B\u8BB0\u5F55\u3002")}</p><label className="check-row"><input type="checkbox" checked={chargeable} disabled={l.status === "teacher_absent"} onChange={e => setChargeable(e.target.checked)}/>{t("\u6807\u8BB0\u4E3A\u6536\u8D39")}</label></>}{modal.type === "edit" && <div className="form-pair"><label>{t("\u65B0\u7684\u5F00\u59CB\u65F6\u95F4")}<DateTimeInput type="datetime-local" required value={start} onChange={e => setStart(e.target.value)}/></label><label>{t("\u65B0\u7684\u7ED3\u675F\u65F6\u95F4")}<DateTimeInput type="datetime-local" required value={end} onChange={e => setEnd(e.target.value)}/></label><ConflictPreview enabled={Boolean(start && end && start < end)} value={{ action: "edit", id: l.id, start, end, scope }}/></div>}{["edit", "cancel"].includes(modal.type) && l.seriesId && <label>{t("\u5F71\u54CD\u8303\u56F4")}<select value={scope} onChange={e => setScope(e.target.value)}><option value="single">{t("\u4EC5\u8FD9\u4E00\u5802")}</option><option value="future">{t("\u672C\u5802\u53CA\u4E4B\u540E\u5C1A\u672A\u786E\u8BA4\u7684\u8BFE\u7A0B")}</option></select></label>}{modal.type === "cancel" && <p>{t("\u53D6\u6D88\u540E\u4E0D\u4F1A\u8BA1\u5165\u672A\u6765\u5B89\u6392\u6216\u5DF2\u5B8C\u6210\u8BFE\u65F6\u3002")}</p>}<Button className="primary-full" disabled={busy}>{modal.type === "cancel" ? t("确认取消课程") : modal.type === "edit" ? t("保存时间变更") : modal.type === "review" ? t("保存复核结果") : t("保存出席记录")}</Button></form></DialogContent></Dialog>; }
