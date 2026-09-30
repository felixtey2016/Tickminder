"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDialogState } from "@/lib/use-dialog-state";
import { t } from "@/lib/i18n";
import { DeleteButton, DirectoryFilters, type Mutate } from "./directory-tools";

type Plan = { key: string; student: string; subject: string; teacherName: string; duration: number; active: boolean; onlineLink?: string | null };
type Props = { students: string[]; teachers: string[]; mutate: Mutate; busy: boolean };
function PlanForm({ students, teachers, mutate, busy, plan, saved }: Props & { plan?: Plan; saved?: () => void }) {
  const [student, setStudent] = useState(plan?.student || ""), [subject, setSubject] = useState(plan?.subject || ""), [teacherName, setTeacherName] = useState(plan?.teacherName || "");
  const [duration, setDuration] = useState(String(plan?.duration || 1)), [onlineLink, setOnlineLink] = useState(plan?.onlineLink || ""), [active, setActive] = useState(plan?.active ?? true);
  function reset() { setStudent(""); setSubject(""); setTeacherName(""); setDuration("1"); setOnlineLink(""); setActive(true); }
  return <form onSubmit={async e => { e.preventDefault(); if (await mutate({ action: "savePlan", student, subject, teacherName, duration: Number(duration), onlineLink, active, editingKey: plan?.key })) { reset(); saved?.(); } }}>
    <label>{t("学生姓名")}<select required disabled={Boolean(plan)} value={student} onChange={e => setStudent(e.target.value)}><option value="">{t("请选择")}</option>{[...new Set([...students, ...(plan ? [plan.student] : [])])].map(n => <option key={n}>{n}</option>)}</select></label>
    <label>{t("科目")}<input required disabled={Boolean(plan)} maxLength={80} value={subject} onChange={e => setSubject(e.target.value)}/></label>
    <label>{t("负责老师")}<select required value={teacherName} onChange={e => setTeacherName(e.target.value)}><option value="">{t("请选择")}</option>{[...new Set([...teachers, ...(plan ? [plan.teacherName] : [])])].map(n => <option key={n}>{n}</option>)}</select></label>
    <label>{t("通常时长（小时）")}<input required type="number" min="0.25" max="12" step="0.25" value={duration} onChange={e => setDuration(e.target.value)}/></label>
    <label>{t("网课链接（可选）")}<input type="url" inputMode="url" maxLength={2048} placeholder="https://meet.google.com/..." value={onlineLink} onChange={e => setOnlineLink(e.target.value)}/></label>
    <label className="check-row"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/>{t("启用")}</label><Button disabled={busy}>{t("保存学生科目")}</Button>
  </form>;
}
export function SubjectAdmin({ students, teachers, plans, mutate, busy }: Props & { plans: Plan[] }) {
  const [teacher, setTeacher] = useState(""), [student, setStudent] = useState(""), [removed, setRemoved] = useState(false);
  const [editing, setEditing] = useDialogState<Plan | null>("plan-edit", null), [creating, setCreating] = useDialogState<boolean | null>("plan-create", null);
  const visible = plans.filter(p => p.active !== removed && (!teacher || p.teacherName === teacher) && (!student || p.student === student));
  const groups = [...new Set(visible.map(p => p.teacherName))].sort();
  return <section className="panel subjects-panel"><div className="section-head"><h2>{t("学生科目")}</h2><Button onClick={() => setCreating(true)}>{t("新增学生科目")}</Button></div>
    <DirectoryFilters teachers={[...new Set([...teachers, ...plans.map(p => p.teacherName)])].sort()} students={[...new Set([...students, ...plans.map(p => p.student)])].sort()} teacher={teacher} student={student} onTeacher={setTeacher} onStudent={setStudent}/>
    <label className="check-row"><input type="checkbox" checked={removed} onChange={e => setRemoved(e.target.checked)}/>{t("查看停用科目")}</label>
    {groups.map(name => <details className="directory-group" key={name} open={Boolean(teacher || student)}><summary>{name} <span>{visible.filter(p => p.teacherName === name).length}</span></summary>{visible.filter(p => p.teacherName === name).map(p => <div className="user-row" key={p.key}><div><strong>{p.student} · {p.subject}</strong><small>{p.duration} h · {t(p.active ? "启用" : "停用")}</small><small>{t(p.onlineLink ? "网课链接已设置" : "尚未设置网课链接")}</small></div><div className="user-actions"><Button size="sm" variant="outline" onClick={() => setEditing(p)}>{t("编辑")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void mutate({ action: "savePlan", ...p, active: !p.active })}>{t(p.active ? "停用" : "恢复")}</Button><DeleteButton kind="plan" id={p.key} mutate={mutate} busy={busy} message="永久删除此学生科目绑定？历史课程会保留，仍有课程或班级使用时需要先处理。"/></div></div>)}</details>)}
    {!visible.length && <p className="empty">{t("没有符合条件的记录")}</p>}
    <Dialog open={Boolean(creating)} onOpenChange={open => setCreating(open ? true : null)}><DialogContent className="lesson-dialog directory-dialog"><DialogHeader><DialogTitle>{t("新增学生科目")}</DialogTitle></DialogHeader><p className="muted">{t("请先在「学生名单」添加学生，再设置科目、负责老师及网课链接。")}</p><PlanForm students={students} teachers={teachers} mutate={mutate} busy={busy} saved={() => setCreating(null)}/></DialogContent></Dialog>
    <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open) setEditing(null); }}><DialogContent className="lesson-dialog directory-dialog"><DialogHeader><DialogTitle>{t("编辑学生科目")}</DialogTitle></DialogHeader>{editing && <PlanForm key={editing.key} plan={editing} students={students} teachers={teachers} mutate={mutate} busy={busy} saved={() => setEditing(null)}/>}</DialogContent></Dialog>
  </section>;
}
