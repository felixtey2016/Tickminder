"use client";
import { useFilterPreference } from "@/lib/filter-preferences";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BulkDeleteTool } from "./bulk-delete";
import { t } from "@/lib/i18n";

export type Mutate = (body: Record<string, unknown>) => Promise<boolean>;
export function DeleteButton({ kind, id, mutate, busy, message }: { kind: string; id: string; mutate: Mutate; busy: boolean; message?: string }) {
  return <BulkDeleteTool kind={kind} records={[{id,label:""}]} mutate={mutate} busy={busy} single message={message}/>;
}

export function DirectoryFilters({ teachers, students, teacher, student, onTeacher, onStudent }: { teachers: string[]; students: string[]; teacher: string; student: string; onTeacher: (value: string) => void; onStudent: (value: string) => void }) {
  return <div className="directory-filters"><label>{t("老师姓名")}<select value={teacher} onChange={e => onTeacher(e.target.value)}><option value="">{t("所有老师")}</option>{teachers.map(n => <option key={n}>{n}</option>)}</select></label><label>{t("学生姓名")}<select value={student} onChange={e => onStudent(e.target.value)}><option value="">{t("所有学生")}</option>{students.map(n => <option key={n}>{n}</option>)}</select></label></div>;
}

export function PeopleDirectory({ kind, people, mutate, busy }: { kind: "teacher" | "student"; people: Array<{ name: string; active: boolean }>; mutate: Mutate; busy: boolean }) {
  const [name, setName] = useState(""), [search, setSearch] = useFilterPreference<string>(`${kind}-search`, ""), [removed, setRemoved] = useFilterPreference<boolean>(`${kind}-removed`, false);
  const visible = people.filter(p => p.active !== removed && p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <section className="panel"><h2>{t(kind === "teacher" ? "老师名单" : "学生名单")}</h2><form onSubmit={async e => { e.preventDefault(); if (await mutate({ action: kind === "teacher" ? "saveTeacher" : "saveStudent", name, active: true })) setName(""); }}><label>{t("姓名")}<input required maxLength={80} value={name} onChange={e => setName(e.target.value)}/></label><Button disabled={busy}>{t(kind === "teacher" ? "新增老师" : "新增学生")}</Button></form>
    <div className="directory-filters"><label>{t("搜索姓名")}<input value={search} onChange={e => setSearch(e.target.value)}/></label><label>{t("显示记录")}<select value={removed ? "removed" : "active"} onChange={e => setRemoved(e.target.value === "removed")}><option value="active">{t("启用")}</option><option value="removed">{t("已移除")}</option></select></label></div>
    <Button variant="outline" size="sm" onClick={() => { setSearch(""); setRemoved(false); }}>{t("重置筛选")}</Button>
    <BulkDeleteTool kind={kind} records={visible.map(p=>({id:p.name,label:p.name}))} mutate={mutate} busy={busy}/>
    {visible.map(p => <div className="user-row" key={p.name}><strong>{p.name}</strong><div className="user-actions"><Button size="sm" variant="outline" disabled={busy} onClick={() => { if (!p.active || window.confirm(t("移除后会隐藏此姓名，历史课程仍保留。"))) void mutate({ action: kind === "teacher" ? "saveTeacher" : "setStudentActive", name: p.name, active: !p.active }); }}>{t(p.active ? "移除" : "恢复")}</Button><DeleteButton kind={kind} id={p.name} mutate={mutate} busy={busy} message="永久删除此姓名及科目绑定？历史课程会保留，仍有关联账号或已安排课程时需要先处理。"/></div></div>)}{!visible.length && <p className="empty">{t("没有符合条件的记录")}</p>}
  </section>;
}
