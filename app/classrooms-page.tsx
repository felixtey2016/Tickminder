"use client";

import { FilterPanel } from "@/components/filter-panel";
import { PageState } from "@/components/page-state";
import { getLanguage } from "@/lib/i18n";
import { useFilterPreference } from "@/lib/filter-preferences";
import { BulkDeleteTool } from "./bulk-delete";
import { TermManager, TermSelect, type Term } from "./term-manager";
import { useMemo, useState } from "react";
import { BookOpen, FileText, Megaphone, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { StudentLearning, TeacherLearning, type LearningMutate, type LearningState } from "./learning-portal";
import { DeleteButton, DirectoryFilters } from "./directory-tools";

export type Classroom = {
  id: string; title: string; description: string | null; subject: string;
  teacherName: string; termId?: string | null; archived: number | boolean; createdAt: string; updatedAt: string;
  members?: string[];
  announcements: Array<{ id: string; title: string; body: string; pinned: number | boolean; authorName: string; createdAt: string; updatedAt: string }>;
};
type ClassMutate = (body: Record<string, unknown>) => Promise<{ ok: boolean; id?: string }>;
type Role = "admin" | "teacher" | "student";
type Plan = { student: string; subject: string; teacherName: string; active: boolean };

const dateLabel = (iso: string) => new Intl.DateTimeFormat(getLanguage() === "zh" ? "zh-CN" : "en-GB", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function ClassroomsPage({ role, classes, terms, learning, teacherName, teachers, plans, mutate, learningMutate, busy, onCalendar }: {
  role: Role; classes: Classroom[]; terms: Term[]; learning: LearningState; teacherName?: string | null;
  teachers: string[]; plans: Plan[]; mutate: ClassMutate; learningMutate: LearningMutate; busy: boolean; onCalendar: () => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"announcements" | "materials" | "homework" | "members">("announcements");
  const [filterTeacher, setFilterTeacher] = useFilterPreference<string>("classes-teacher", ""), [filterStudent, setFilterStudent] = useFilterPreference<string>("classes-student", ""), [archived, setArchived] = useFilterPreference<boolean>("classes-archived", false);
  const [filterTerm,setFilterTerm] = useFilterPreference<string>("classes-term", "current");
  const currentTerm = terms.find(term=>term.isCurrent);
  const effectiveTerm = filterTerm==="current" ? currentTerm?.id || "all" : filterTerm;
  const [termId,setTermId] = useState("");
  const visibleClasses = classes.filter(item => Boolean(item.archived) === archived && (effectiveTerm === "all" || (effectiveTerm === "unassigned" ? !item.termId : item.termId === effectiveTerm)) && (!filterTeacher || item.teacherName === filterTeacher) && (!filterStudent || item.members?.includes(filterStudent)));
  const selected = visibleClasses.find(item => item.id === selectedId) || (role === "admin" ? null : visibleClasses[0]) || null;
  const [editingId, setEditingId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [teacher, setTeacher] = useState(teacherName || "");
  const [subject, setSubject] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [announcementId, setAnnouncementId] = useState("");
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [pinned, setPinned] = useState(false);

  const eligiblePlans = useMemo(() => plans.filter(plan => plan.active && (role !== "teacher" || plan.teacherName === teacherName)), [plans, role, teacherName]);
  const subjects = [...new Set(eligiblePlans.filter(plan => plan.teacherName === teacher).map(plan => plan.subject))].sort();
  const eligibleStudents = [...new Set([...eligiblePlans.filter(plan => plan.teacherName === teacher && plan.subject === subject).map(plan => plan.student), ...(editingId ? members : [])])].sort();
  const shownClassId = selected?.id || "";
  const classLearning: LearningState = selected ? {
    ...learning,
    materials: learning.materials.filter(item => item.classroomId === shownClassId),
    homework: learning.homework.filter(item => item.classroomId === shownClassId),
    eligible: (selected.members || []).map(student => ({ student, subject: selected.subject })),
  } : learning;
  const classHomeworkIds = new Set(classLearning.homework.map(item => item.id));
  classLearning.submissions = learning.submissions.filter(item => classHomeworkIds.has(item.homeworkId));

  function startCreate() {
    setTermId(currentTerm?.id || ""); setCreating(true); setEditingId(""); setTitle(""); setDescription(""); setTeacher(teacherName || ""); setSubject(""); setMembers([]);
  }
  function startEdit(item: Classroom) {
    setTermId(item.termId || ""); setCreating(true); setEditingId(item.id); setTitle(item.title); setDescription(item.description || "");
    setTeacher(item.teacherName); setSubject(item.subject); setMembers(item.members || []);
  }
  async function saveClassroom(event: React.FormEvent) {
    event.preventDefault();
    const result = await mutate({ action: "saveClassroom", id: editingId, title, description, termId, teacherName: teacher, subject, students: members });
    if (result.ok) { setFilterTerm(termId || "unassigned"); setCreating(false); if (result.id) setSelectedId(result.id); setTab("announcements"); }
  }
  async function saveAnnouncement(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return;
    const result = await mutate({ action: "saveAnnouncement", classroomId: selected.id, id: announcementId, title: announcementTitle, body: announcementBody, pinned });
    if (result.ok) { setAnnouncementId(""); setAnnouncementTitle(""); setAnnouncementBody(""); setPinned(false); }
  }
  const canManage = role !== "student";
  const pick = (item: Classroom) => { setSelectedId(item.id); setCreating(false); setTab("announcements"); setAnnouncementId(""); setAnnouncementTitle(""); setAnnouncementBody(""); setPinned(false); };
  const classButtons = (items: Classroom[]) => <div className="classroom-chips">{items.map(item => <button type="button" key={item.id} className={selected?.id === item.id && !creating ? "selected" : ""} onClick={() => pick(item)}><strong>{item.title}</strong><span>{item.subject} · {item.teacherName} · {terms.find(term=>term.id===item.termId)?.name || t("未分类")}{item.archived ? ` · ${t("已封存")}` : ""}</span></button>)}</div>;
  return <div className="classrooms-page">
    <section className="panel classroom-picker">
      <div className="learning-section-head"><div><p className="eyebrow">{t("班级")}</p><h2>{t("我的班级")}</h2></div>{canManage && <Button size="sm" onClick={startCreate}><Plus size={16}/>{t("新建班级")}</Button>}</div>
      <div className="classroom-term-tools"><div className="directory-filters"><label>{t("学期")}<select value={filterTerm} onChange={e=>{setFilterTerm(e.target.value);setSelectedId("");}}><option value="current">{t("当前学期")}{currentTerm?` · ${currentTerm.name}`:""}</option><option value="all">{t("所有学期")}</option><option value="unassigned">{t("未分类")}</option>{terms.map(term=><option key={term.id} value={term.id}>{term.name}</option>)}</select></label></div>
      {role === "admin" && <TermManager terms={terms} mutate={mutate} busy={busy}/>}</div>
      <FilterPanel active={Boolean(filterTeacher || filterStudent || archived)}>{role === "admin" && <DirectoryFilters teachers={[...new Set(classes.map(c => c.teacherName))].sort()} students={[...new Set(classes.flatMap(c => c.members || []))].sort()} teacher={filterTeacher} student={filterStudent} onTeacher={value => { setFilterTeacher(value); setSelectedId(""); }} onStudent={value => { setFilterStudent(value); setSelectedId(""); }}/>}<label className="check-row"><input type="checkbox" checked={archived} onChange={e => { setArchived(e.target.checked); setSelectedId(""); }}/>{t("查看已封存班级")}</label>
      <div className="learning-card-actions"><Button variant="outline" size="sm" onClick={()=>{setFilterTeacher("");setFilterStudent("");setArchived(false);setFilterTerm("current");setSelectedId("");}}>{t("重置筛选")}</Button></div></FilterPanel><div className="list-tools"><span>{visibleClasses.length} {t("个班级")}</span>{canManage&&<BulkDeleteTool kind="classroom" records={visibleClasses.map(c=>({id:c.id,label:c.title+" · "+c.teacherName}))} mutate={async body=>(await mutate(body)).ok} busy={busy}/>}</div>
      {role === "admin" ? [...new Set(visibleClasses.map(c => c.teacherName))].sort().map(name => <details className="directory-group" key={name} open={Boolean(filterTeacher || filterStudent)}><summary>{name} <span>{visibleClasses.filter(c => c.teacherName === name).length}</span></summary>{classButtons(visibleClasses.filter(c => c.teacherName === name))}</details>) : classButtons(visibleClasses)}
      {!visibleClasses.length && <PageState kind="empty" title="没有符合条件的记录" action={canManage ? "新建班级" : undefined} onAction={canManage ? startCreate : undefined}/>}
    </section>

    {creating && canManage && <section className="panel classroom-form-panel"><p className="eyebrow">{t("班级设置")}</p><h2>{editingId ? t("编辑班级") : t("新建班级")}</h2>
      <form className="learning-form" onSubmit={saveClassroom}>
        <label>{t("班级名称")}<input required maxLength={100} value={title} onChange={event => setTitle(event.target.value)} placeholder={t("例如：Form 4 Science 小班")}/></label>
        <TermSelect terms={terms} value={termId} onChange={setTermId} mutate={mutate} busy={busy}/>
        <label>{t("班级说明（可选）")}<textarea maxLength={1000} value={description} onChange={event => setDescription(event.target.value)}/></label>
        <label>{t("负责老师")}<select required disabled={role === "teacher" || Boolean(editingId)} value={teacher} onChange={event => { setTeacher(event.target.value); setSubject(""); setMembers([]); }}><option value="">{t("请选择")}</option>{teachers.map(name => <option key={name}>{name}</option>)}</select></label>
        <label>{t("科目")}<select required disabled={Boolean(editingId)} value={subject} onChange={event => { setSubject(event.target.value); setMembers([]); }}><option value="">{t("请选择")}</option>{subjects.map(name => <option key={name}>{name}</option>)}</select></label>
        <fieldset className="learning-checks"><legend>{t("班级学生")} · {members.length}</legend>{eligibleStudents.map(student => <label key={student}><input type="checkbox" checked={members.includes(student)} onChange={event => setMembers(current => event.target.checked ? [...current, student] : current.filter(name => name !== student))}/>{student}</label>)}{!eligibleStudents.length && <p className="muted">{t("请先选择已绑定学生的老师和科目")}</p>}</fieldset>
        <div className="learning-card-actions"><Button disabled={busy || !members.length}>{t("保存班级")}</Button><Button type="button" variant="outline" onClick={() => setCreating(false)}>{t("取消")}</Button></div>
      </form>
    </section>}

    {!creating && selected && <>
      <section className="panel classroom-intro"><div><p className="eyebrow">{selected.subject} · {selected.teacherName}</p><h2>{selected.title}</h2>{selected.description && <p>{selected.description}</p>}</div>{canManage && <div className="learning-card-actions"><Button size="sm" variant="outline" onClick={() => startEdit(selected)} disabled={Boolean(selected.archived)}>{t("管理名单")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm(t(selected.archived ? "确定重新开放这个班级？" : "确定封存这个班级？学生仍能查看已发布内容。"))) void mutate({ action: "archiveClassroom", id: selected.id, archived: !selected.archived }); }}>{t(selected.archived ? "重新开放" : "封存班级")}</Button><DeleteButton kind="classroom" id={selected.id} busy={busy} mutate={async body => (await mutate(body)).ok} message="永久删除这个班级及其公告、资料、功课和提交记录？共用 PDF 会保留，此操作无法恢复。"/></div>}</section>
      <div className="classroom-tabs" role="tablist" aria-label={t("班级内容")}>
        {([{ id: "announcements", Icon: Megaphone, label: "公告" }, { id: "materials", Icon: FileText, label: "教学资料" }, { id: "homework", Icon: BookOpen, label: "功课" }, ...(canManage ? [{ id: "members", Icon: Users, label: "学生名单" }] : [])] as const).map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id as typeof tab)}><item.Icon size={17}/>{t(item.label)}</button>)}
      </div>
      {tab === "announcements" && <section className="panel"><p className="eyebrow">{t("班级公告")}</p><h2>{t("最新消息")}</h2>
        {canManage && !selected.archived && <form className="learning-form classroom-announcement-form" onSubmit={saveAnnouncement}><label>{t("公告标题")}<input required maxLength={120} value={announcementTitle} onChange={event => setAnnouncementTitle(event.target.value)}/></label><label>{t("公告内容")}<textarea required maxLength={4000} value={announcementBody} onChange={event => setAnnouncementBody(event.target.value)}/></label><label className="classroom-pin"><input type="checkbox" checked={pinned} onChange={event => setPinned(event.target.checked)}/>{t("置顶公告")}</label><div className="learning-card-actions"><Button disabled={busy}>{announcementId ? t("保存公告") : t("发布公告")}</Button>{announcementId && <Button type="button" variant="outline" onClick={() => { setAnnouncementId(""); setAnnouncementTitle(""); setAnnouncementBody(""); setPinned(false); }}>{t("取消编辑")}</Button>}</div></form>}
        <div className="learning-list">{selected.announcements.map(item => <article key={item.id} className="learning-card classroom-announcement">{item.pinned && <span className="classroom-pinned">{t("置顶")}</span>}<strong>{item.title}</strong><small>{item.authorName} · {dateLabel(item.createdAt)}</small><p>{item.body}</p>{canManage && !selected.archived && <div className="learning-card-actions"><Button size="sm" variant="outline" onClick={() => { setAnnouncementId(item.id); setAnnouncementTitle(item.title); setAnnouncementBody(item.body); setPinned(Boolean(item.pinned)); }}>{t("编辑")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm(t("确定删除这则公告？"))) void mutate({ action: "deleteAnnouncement", classroomId: selected.id, id: item.id }); }}>{t("删除")}</Button></div>}</article>)}{!selected.announcements.length && <p className="muted">{t("尚无公告")}</p>}</div>
      </section>}
      {tab === "members" && canManage && <section className="panel"><p className="eyebrow">{t("学生名单")}</p><h2>{t("班级学生")} · {selected.members?.length || 0}</h2><div className="classroom-member-list">{selected.members?.map(name => <span key={name}>{name}</span>)}</div><p className="muted">{t("移出班级后，该学生不能再查看班级内容；已有提交记录会保留。")}</p></section>}
      {tab === "materials" || tab === "homework" ? role === "teacher" ? selected.archived ? <section className="panel"><p>{t("班级已封存。已发布资料和功课仍可在原菜单查看。")}</p></section> : <TeacherLearning key={selected.id} learning={classLearning} mutate={learningMutate} busy={busy} view={tab} classroom={{ id: selected.id, subject: selected.subject, members: selected.members || [] }}/> : role === "student" ? <StudentLearning learning={classLearning} mutate={learningMutate} busy={busy} onPlan={onCalendar} onCalendar={onCalendar} view={tab}/> : <section className="panel"><p className="muted">{t("请由负责老师在班级中发布资料和功课。")}</p></section> : null}
    </>}
  </div>;
}
