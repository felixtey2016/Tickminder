"use client";

import { useDialogState } from "@/lib/use-dialog-state";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StudentCalendar } from "./student-calendar";
import { StudentLearning, type Homework, type LearningMutate, type LearningState, type StudyBlock } from "./learning-portal";

type Lesson = { id: string; subject: string; teacherName: string; plannedStart: string; plannedEnd: string; actualStart: string | null; actualEnd: string | null; status: string; attendanceKind?: string | null; onlineLink?: string | null };
type Proposal = { lessonId: string; status: string; proposedStart: string; proposedEnd: string; requestedRole?: string };
const local = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(" ", "T");
type Form = { id: string; title: string; date: string; start: string; end: string; subject: string; note: string; homeworkId: string };

export function StudentLearningDashboard({ lessons, proposals, learning, mutate, busy, view, onRequestReschedule, onCalendar }: { lessons: Lesson[]; proposals: Proposal[]; learning: LearningState; mutate: LearningMutate; busy: boolean; view: "calendar" | "homework" | "materials"; onRequestReschedule?: (id: string) => void; onCalendar?: () => void }) {
  const [form, setForm] = useDialogState<Form | null>("student-study", null);
  const [saving, setSaving] = useState(false);
  function add(day: string) { setForm({ id: "", title: "", date: day, start: "18:00", end: "19:00", subject: "", note: "", homeworkId: "" }); }
  function edit(block: StudyBlock) {
    const start = local(block.startsAt), end = local(block.endsAt);
    setForm({ id: block.id, title: block.title, date: start.slice(0, 10), start: start.slice(11), end: end.slice(11), subject: block.subject || "", note: block.note || "", homeworkId: block.homeworkId || "" });
  }
  function plan(item: Homework) {
    const starting = item.startsAt > new Date().toISOString() ? item.startsAt : new Date().toISOString();
    setForm({ id: "", title: `${t("完成")} ${item.subject} ${t("功课")}`, date: local(starting).slice(0, 10), start: "18:00", end: "19:00", subject: item.subject, note: "", homeworkId: item.id });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!form) return;
    setSaving(true);
    const ok = await mutate({ action: "saveStudyBlock", id: form.id, title: form.title, startsAt: `${form.date}T${form.start}`, endsAt: `${form.date}T${form.end}`, subject: form.subject, note: form.note, homeworkId: form.homeworkId });
    setSaving(false); if (ok) setForm(null);
  }
  return <div className="student-learning-dashboard">
    {view === "calendar" && <StudentCalendar busy={busy} onRequestReschedule={onRequestReschedule} lessons={lessons} proposals={proposals} studyBlocks={learning.studyBlocks} onAddStudy={add} onEditStudy={edit}/>}
    {(view === "homework" || view === "materials") && <StudentLearning learning={learning} mutate={mutate} busy={busy} onPlan={plan} view={view} onCalendar={onCalendar}/>}
    <Dialog open={Boolean(form)} onOpenChange={open => { if (!open) setForm(null); }}><DialogContent className="lesson-dialog"><DialogHeader><DialogTitle>{form?.id ? t("编辑学习安排") : t("新增学习安排")}</DialogTitle></DialogHeader>{form && <form className="learning-form" onSubmit={save}>
      {form.homeworkId && <p className="muted">{t("已关联功课。安排学习时间不会自动提交功课。")}</p>}
      <label>{t("标题")}<input required maxLength={120} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}/></label>
      <label>{t("日期")}<input required type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}/></label>
      <div className="form-pair"><label>{t("开始时间")}<input required type="time" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })}/></label><label>{t("结束时间")}<input required type="time" min={form.start} value={form.end} onChange={e => setForm({ ...form, end: e.target.value })}/></label></div>
      <label>{t("科目（可选）")}<input maxLength={100} list="study-subjects" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}/><datalist id="study-subjects">{[...new Set([...lessons.map(l => l.subject), ...learning.homework.map(h => h.subject)])].map(subject => <option key={subject} value={subject}/>)}</datalist></label>
      <label>{t("备注（可选）")}<textarea maxLength={1000} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}/></label>
      <div className="learning-file-actions"><Button disabled={busy || saving}>{t("保存学习安排")}</Button>{form.id && <Button type="button" variant="outline" disabled={busy || saving} onClick={async () => { if (window.confirm(t("确定删除这项个人学习安排？")) && await mutate({ action: "deleteStudyBlock", id: form.id })) setForm(null); }}>{t("删除")}</Button>}</div>
    </form>}</DialogContent></Dialog>
  </div>;
}
