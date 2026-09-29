"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

type Plan = { key: string; student: string; subject: string; teacherName: string; duration: number; active: boolean; onlineLink?: string | null };
type Common = { mutate: (body: Record<string, unknown>) => Promise<boolean>; busy: boolean };

export function StudentAdmin({ students, mutate, busy }: Common & { students: Array<{ name: string; active: boolean }> }) {
  const [name, setName] = useState("");
  return <section className="panel"><p className="eyebrow">{t("学生名单")}</p><h2>{t("学生名单")}</h2>
    <form onSubmit={async e => { e.preventDefault(); if (await mutate({ action: "saveStudent", name })) setName(""); }}>
      <label>{t("学生姓名")}<input required maxLength={80} value={name} onChange={e => setName(e.target.value)}/></label>
      <Button disabled={busy}>{t("新增学生")}</Button>
    </form>
    <div className="student-list">{students.map(student => <div className="user-row" key={student.name}><strong>{student.name}</strong><Button size="sm" variant="outline" disabled={busy} onClick={() => { if (!student.active || window.confirm(t("确定移除这位学生？现有课程和出席记录会保留。"))) mutate({ action: "setStudentActive", name: student.name, active: !student.active }); }}>{student.active ? t("移除") : t("恢复")}</Button></div>)}</div>
  </section>;
}

export function SubjectAdmin({ students, teachers, plans, mutate, busy }: Common & { students: string[]; teachers: string[]; plans: Plan[] }) {
  const [student, setStudent] = useState("");
  const [subject, setSubject] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [duration, setDuration] = useState("1");
  const [onlineLink, setOnlineLink] = useState("");
  const [active, setActive] = useState(true);
  function reset() { setStudent(""); setSubject(""); setTeacherName(""); setDuration("1"); setOnlineLink(""); setActive(true); }
  return <section className="panel subjects-panel"><p className="eyebrow">{t("学生科目")}</p><h2>{t("学生科目")}</h2>
    <p className="muted">{t("请先在「学生名单」添加学生，再设置科目、负责老师及网课链接。")}</p>
    <form onSubmit={async e => { e.preventDefault(); if (await mutate({ action: "savePlan", student, subject, teacherName, duration: Number(duration), onlineLink, active })) reset(); }}>
      <label>{t("学生姓名")}<select required value={student} onChange={e => setStudent(e.target.value)}><option value="">{t("请选择")}</option>{students.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label>{t("科目")}<input required maxLength={80} value={subject} onChange={e => setSubject(e.target.value)}/></label>
      <label>{t("负责老师")}<select required value={teacherName} onChange={e => setTeacherName(e.target.value)}><option value="">{t("请选择")}</option>{teachers.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label>{t("通常时长（小时）")}<input type="number" min="0.25" max="12" step="0.25" value={duration} onChange={e => setDuration(e.target.value)}/></label>
      <label>{t("网课链接（可选）")}<input type="url" inputMode="url" maxLength={2048} placeholder="https://meet.google.com/..." value={onlineLink} onChange={e => setOnlineLink(e.target.value)}/></label>
      <label className="check-row"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/>{t("启用")}</label>
      <Button disabled={busy || !students.length || !teachers.length}>{t("保存学生科目")}</Button>
    </form>
    <div className="subject-list">{plans.map(p => <div className="user-row" key={p.key}><div><strong>{p.student} · {p.subject}</strong><small>{p.teacherName} · {p.duration} h · {p.active ? t("启用") : t("停用")}</small>{p.onlineLink && <small>{t("网课链接已设置")}</small>}</div><Button size="sm" variant="outline" onClick={() => { setStudent(p.student); setSubject(p.subject); setTeacherName(p.teacherName); setDuration(String(p.duration)); setOnlineLink(p.onlineLink || ""); setActive(p.active); }}>{t("编辑")}</Button></div>)}</div>
  </section>;
}
