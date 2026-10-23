"use client";
import {usePageHistoryState} from '@/lib/page-history';

import { useAdminAction } from "./admin-permission-context";

import { FilterPanel } from "@/components/filter-panel";
import { PageState } from "@/components/page-state";
import { getLanguage } from "@/lib/i18n";
import { useFilterPreference } from "@/lib/filter-preferences";
import { BulkDeleteTool } from "./bulk-delete";
import { TermManager, TermSelect, type Term } from "./term-manager";
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { BookOpen, CalendarDays, ChevronDown, FileText, Megaphone, Plus, Settings2, Users, Film, Banknote } from "lucide-react";
import {RecordingsWorkspace} from "./recordings-workspace";
import {ClassroomSchedule} from "./classroom-schedule";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { StudentLearning, TeacherLearning, type LearningMutate, type LearningState } from "./learning-portal";
import { AdminLearning } from "./admin-learning";
import { FolderWorkspace } from "./folder-workspace";
import { DeleteButton, DirectoryFilters } from "./directory-tools";
import {useAcademicCatalogue} from '@/lib/use-academic-catalogue';
import {F2} from '@/lib/finance-round2-i18n';
const ClassroomPayrollSettings=lazy(()=>import('./classroom-payroll-settings'));

export type Classroom = {
  id: string; title: string; description: string | null; subject: string;
  syllabusId?:string|null;subjectId?:string|null;grade?:string|null;
  teacherName: string; termId?: string | null; archived: number | boolean; createdAt: string; updatedAt: string;
  members?: string[];
  announcements: Array<{ id: string; title: string; body: string; pinned: number | boolean; authorName: string; createdAt: string; updatedAt: string }>;
};
type ClassMutate = (body: Record<string, unknown>) => Promise<{ ok: boolean; id?: string }>;
type Role = "admin" | "teacher" | "student";
type ClassroomTab = "announcements" | "schedule" | "materials" | "recordings" | "homework" | "members" | "payroll";
type Plan = { student: string; subject: string; subjectId?:string|null;syllabusId?:string;grade?:string|null;teacherName: string; active: boolean };

const dateLabel = (iso: string) => new Intl.DateTimeFormat(getLanguage() === "zh" ? "zh-CN" : "en-GB", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function ClassroomsPage({ role, classes, terms, learning, learningReady = true, learningError, loadLearning, teacherName, teachers, plans, mutate, learningMutate, busy, onCalendar }: {
  role: Role; classes: Classroom[]; terms: Term[]; learning: LearningState; teacherName?: string | null;
  learningReady?: boolean; learningError?: string; loadLearning?: (force?: boolean) => Promise<void>;
  teachers: string[]; plans: Plan[]; mutate: ClassMutate; learningMutate: LearningMutate; busy: boolean; onCalendar: () => void;
}) {
  const can=useAdminAction();
  const [selectedId, setSelectedId] = usePageHistoryState("classroom.selected","");
  const [directoryOpen, setDirectoryOpen] = useState(role === "admin");
  const {catalogue,error:catalogueError,reload:reloadCatalogue}=useAcademicCatalogue('student');
  const [syllabusId,setSyllabusId]=useState(''),[grade,setGrade]=useState('');
  const [filterSyllabus,setFilterSyllabus]=useFilterPreference<string>('classes-syllabus',''),[filterGrade,setFilterGrade]=useFilterPreference<string>('classes-grade',''),[filterSubject,setFilterSubject]=useFilterPreference<string>('classes-subject','');
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = usePageHistoryState<ClassroomTab>("classroom.tab","announcements");
  const tabListId = useId();
  const tabListRef = useRef<HTMLDivElement>(null);
  const directorySummaryRef = useRef<HTMLElement>(null);
  const focusClassroomContent = () => requestAnimationFrame(() => {
    const target = tabButtons.current.announcements || directorySummaryRef.current;
    if (!target) return;
    target.focus({ preventScroll: true });
    const bounds = target.getBoundingClientRect();
    const headerBottom = document.querySelector(".topbar")?.getBoundingClientRect().bottom || 0;
    if (bounds.top < headerBottom + 12 || bounds.bottom > window.innerHeight - 12) target.scrollIntoView({ block: "center" });
  });
  const managementRef = useRef<HTMLDetailsElement>(null);
  const tabButtons = useRef<Partial<Record<ClassroomTab, HTMLButtonElement | null>>>({});
  const [filterTeacher, setFilterTeacher] = useFilterPreference<string>("classes-teacher", ""), [filterStudent, setFilterStudent] = useFilterPreference<string>("classes-student", ""), [archived, setArchived] = useFilterPreference<boolean>("classes-archived", false);
  const [filterTerm,setFilterTerm] = useFilterPreference<string>("classes-term", "current");
  const currentTerm = terms.find(term=>term.isCurrent);
  const effectiveTerm = filterTerm==="current" ? currentTerm?.id || "all" : filterTerm;
  const [termId,setTermId] = useState("");
  const visibleClasses = classes.filter(item => Boolean(item.archived) === archived && (effectiveTerm === "all" || (effectiveTerm === "unassigned" ? !item.termId : item.termId === effectiveTerm)) && (!filterTeacher || item.teacherName === filterTeacher) && (!filterStudent || item.members?.includes(filterStudent))&&(!filterSyllabus||item.syllabusId===filterSyllabus)&&(!filterGrade||item.grade===filterGrade)&&(!filterSubject||item.subjectId===filterSubject));
  const selected = visibleClasses.find(item => item.id === selectedId) || (role === "admin" ? null : visibleClasses[0]) || null;
  useEffect(() => {
    if (!creating && selected?.id && (tab === "materials" || tab === "homework") && !learningReady && !learningError) void loadLearning?.();
  }, [creating, selected?.id, tab, learningReady, learningError, loadLearning]);
  useEffect(() => {
    if (managementRef.current) managementRef.current.open = false;
    const list = tabListRef.current, button = tabButtons.current[tab];
    if (!list || !button) return;
    const listBounds = list.getBoundingClientRect(), buttonBounds = button.getBoundingClientRect();
    if (buttonBounds.left < listBounds.left) list.scrollBy({ left: buttonBounds.left - listBounds.left });
    else if (buttonBounds.right > listBounds.right) list.scrollBy({ left: buttonBounds.right - listBounds.right });
  }, [tab, selected?.id, creating]);
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
  const syllabus=catalogue?.syllabuses.find(item=>item.id===syllabusId);
  const subjects=(syllabus?.subjects||[]).filter(item=>item.active&&eligiblePlans.some(plan=>plan.teacherName===teacher&&plan.syllabusId===syllabusId&&plan.subjectId===item.id));
  const eligibleStudents = [...new Set([...eligiblePlans.filter(plan => plan.teacherName === teacher && (editingId?((selected?.subjectId&&plan.subjectId===selected.subjectId)||plan.subject===subject):plan.subjectId===subject)&&(!syllabusId||plan.syllabusId===syllabusId)&&(!grade||!plan.grade||plan.grade===grade)).map(plan => plan.student), ...(editingId ? members : [])])].sort();
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
    setTermId(currentTerm?.id || ""); setCreating(true); setEditingId(""); setTitle(""); setDescription(""); setTeacher(teacherName || ""); setSubject("");setSyllabusId('');setGrade(''); setMembers([]);
  }
  function startEdit(item: Classroom) {
    setTermId(item.termId || ""); setCreating(true); setEditingId(item.id); setTitle(item.title); setDescription(item.description || "");
    setTeacher(item.teacherName); setSubject(item.subjectId||item.subject);setSyllabusId(item.syllabusId||'');setGrade(item.grade||''); setMembers(item.members || []);
  }
  async function saveClassroom(event: React.FormEvent) {
    event.preventDefault();
    const result = await mutate({ action: "saveClassroom", id: editingId, title, description, termId, teacherName: teacher, subject,subjectId:subject,syllabusId,grade, students: members });
    if (result.ok) { setFilterTerm(termId || "unassigned"); setCreating(false); setDirectoryOpen(false); if (result.id) setSelectedId(result.id); setTab("announcements"); focusClassroomContent(); }
  }
  async function saveAnnouncement(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return;
    const result = await mutate({ action: "saveAnnouncement", classroomId: selected.id, id: announcementId, title: announcementTitle, body: announcementBody, pinned });
    if (result.ok) { setAnnouncementId(""); setAnnouncementTitle(""); setAnnouncementBody(""); setPinned(false); }
  }
  const canManage = role !== "student";
  const classTabs = ([{ id: "announcements", Icon: Megaphone, label: "公告" }, { id: "schedule", Icon: CalendarDays, label: "课程安排" }, { id: "materials", Icon: FileText, label: "教学资料" }, { id: "recordings", Icon: Film, label: "课堂录影" }, { id: "homework", Icon: BookOpen, label: "功课" }, ...(canManage ? [{ id: "members", Icon: Users, label: "学生名单" } as const] : []), ...(role === "admin" && can("payroll.view") ? [{id:"payroll",Icon:Banknote,label:"老师报酬"} as const] : [])] as const).filter(item=>can(item.id==="announcements"?"announcements.view":item.id==="schedule"?"lessons.view":item.id==="materials"?"materials.view":item.id==="recordings"?"recordings.view":item.id==="homework"?"homework.view":item.id==="payroll"?"payroll.view":"classrooms.view"));
  useEffect(()=>{if(!classTabs.some(item=>item.id===tab)&&classTabs[0])setTab(classTabs[0].id);},[tab,classTabs.map(item=>item.id).join(",")]);
  const pick = (item: Classroom) => { setSelectedId(item.id); setDirectoryOpen(false); setCreating(false); setTab("announcements"); setAnnouncementId(""); setAnnouncementTitle(""); setAnnouncementBody(""); setPinned(false); focusClassroomContent(); };
  const classButtons = (items: Classroom[]) => <div className="classroom-chips">{items.map(item => <button type="button" key={item.id} className={selected?.id === item.id && !creating ? "selected" : ""} onClick={() => pick(item)}><strong>{item.title}</strong><span>{catalogue?.syllabuses.find(s=>s.id===item.syllabusId)?.name||item.syllabusId||t('课程体系待补充')} · {item.grade||t('年级待补充')} · {item.subject} · {item.teacherName} · {terms.find(term=>term.id===item.termId)?.name || t("未指定学期")}{item.archived ? ` · ${t("已封存")}` : ""}</span></button>)}</div>;
  return <div className="classrooms-page">
    <details className="panel classroom-picker" open={directoryOpen || !selected || creating} onToggle={event => { if (selected && !creating) setDirectoryOpen(event.currentTarget.open); }}>
      <summary ref={directorySummaryRef} className="classroom-picker-summary" onClick={event => { if (!selected || creating) event.preventDefault(); }}><strong>{t("班级列表")}</strong><span className="learning-record-count">{visibleClasses.length}</span><ChevronDown size={17}/></summary>
      {canManage && <div className="learning-section-head classroom-picker-tools"><Button adminGrant="classrooms.create" size="sm" onClick={startCreate}><Plus size={16}/>{t("新建班级")}</Button></div>}
      <div className="classroom-term-tools"><div className="directory-filters"><label>{t("学期")}<select value={filterTerm} onChange={e=>{setFilterTerm(e.target.value);setSelectedId("");}}><option value="current">{t("当前学期")}{currentTerm?` · ${currentTerm.name}`:""}</option><option value="all">{t("所有学期")}</option><option value="unassigned">{t("未指定学期")}</option>{terms.map(term=><option key={term.id} value={term.id}>{term.name}</option>)}</select></label></div>
      {role === "admin" && <TermManager terms={terms} mutate={mutate} busy={busy}/>}</div>
      <div className="directory-filters"><label>{t('课程体系')}<select value={filterSyllabus} onChange={event=>{setFilterSyllabus(event.target.value);setFilterGrade('');setFilterSubject('');setSelectedId('');}}><option value="">{t('全部课程体系')}</option>{catalogue?.syllabuses.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t('年级')}<select value={filterGrade} onChange={event=>{setFilterGrade(event.target.value);setSelectedId('');}}><option value="">{t('全部年级')}</option>{[...new Set(catalogue?.syllabuses.filter(item=>!filterSyllabus||item.id===filterSyllabus).flatMap(item=>item.grades)||[])].map(item=><option key={item}>{item}</option>)}</select></label><label>{t('科目')}<select value={filterSubject} onChange={event=>{setFilterSubject(event.target.value);setSelectedId('');}}><option value="">{t('全部科目')}</option>{[...new Map((catalogue?.syllabuses.filter(item=>!filterSyllabus||item.id===filterSyllabus).flatMap(item=>item.subjects)||[]).map(item=>[item.id,item])).values()].map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <FilterPanel active={Boolean(filterTeacher || filterStudent || archived)}>{role === "admin" && <DirectoryFilters teachers={[...new Set(classes.map(c => c.teacherName))].sort()} students={[...new Set(classes.flatMap(c => c.members || []))].sort()} teacher={filterTeacher} student={filterStudent} onTeacher={value => { setFilterTeacher(value); setSelectedId(""); }} onStudent={value => { setFilterStudent(value); setSelectedId(""); }}/>}<label className="check-row"><input type="checkbox" checked={archived} onChange={e => { setArchived(e.target.checked); setSelectedId(""); }}/>{t("查看已封存班级")}</label>
      <div className="learning-card-actions"><Button variant="outline" size="sm" onClick={()=>{setFilterTeacher("");setFilterStudent("");setArchived(false);setFilterTerm("current");setFilterSyllabus("");setFilterGrade("");setFilterSubject("");setSelectedId("");}}>{t("重置筛选")}</Button></div></FilterPanel><div className="list-tools"><span>{visibleClasses.length} {t("个班级")}</span>{canManage&&<BulkDeleteTool kind="classroom" records={visibleClasses.map(c=>({id:c.id,label:c.title+" · "+c.teacherName}))} mutate={async body=>(await mutate(body)).ok} busy={busy}/>}</div>
      {role === "admin" ? [...new Set(visibleClasses.map(c => c.teacherName))].sort().map(name => <details className="directory-group" key={name} open={Boolean(filterTeacher || filterStudent)}><summary>{name} <span>{visibleClasses.filter(c => c.teacherName === name).length}</span></summary>{classButtons(visibleClasses.filter(c => c.teacherName === name))}</details>) : classButtons(visibleClasses)}
      {!visibleClasses.length && <PageState kind="empty" title={classes.length ? "没有符合筛选条件的班级" : "暂无班级"} action={canManage&&can("classrooms.create") ? "新建班级" : undefined} onAction={canManage&&can("classrooms.create") ? startCreate : undefined}/>}
    </details>

    {creating && canManage && can(editingId?"classrooms.edit":"classrooms.create") && <section className="panel classroom-form-panel"><h2>{editingId ? t("编辑班级") : t("新建班级")}</h2>
      <form className="learning-form" onSubmit={saveClassroom}>
        {catalogueError&&<p role="alert">{catalogueError} <Button type="button" variant="outline" onClick={()=>void reloadCatalogue()}>{t('重试')}</Button></p>}
        <label>{t("班级名称")}<input required maxLength={100} value={title} onChange={event => setTitle(event.target.value)} placeholder={t("例如：Form 4 Science 小班")}/></label>
        <TermSelect terms={terms} value={termId} onChange={setTermId} mutate={mutate} busy={busy}/>
        <label>{t("班级说明（可选）")}<textarea maxLength={1000} value={description} onChange={event => setDescription(event.target.value)}/></label>
        <label>{t("负责老师")}<select required disabled={role === "teacher" || Boolean(editingId)} value={teacher} onChange={event => { setTeacher(event.target.value); setSubject(""); setMembers([]); }}><option value="">{t("请选择")}</option>{teachers.map(name => <option key={name}>{name}</option>)}</select></label>
        <label>{t('课程体系')}<select required={!editingId} disabled={Boolean(editingId)||!catalogue} value={syllabusId} onChange={event=>{setSyllabusId(event.target.value);setGrade('');setSubject('');setMembers([]);}}><option value="">{t('请选择')}</option>{catalogue?.syllabuses.filter(item=>item.active||item.id===syllabusId).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>{t(syllabusId==='stpm'?'学期':syllabusId==='a-level'?'阶段':'年级')}<select required={!editingId} disabled={Boolean(editingId)||!syllabus} value={grade} onChange={event=>{setGrade(event.target.value);setMembers([]);}}><option value="">{t('请选择')}</option>{syllabus?.grades.map(item=><option key={item}>{item}</option>)}</select></label>
        <label>{t("科目")}<select required disabled={Boolean(editingId)||!syllabus} value={subject} onChange={event => { setSubject(event.target.value); setMembers([]); }}><option value="">{t("请选择")}</option>{subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}{editingId&&!subjects.some(item=>item.id===subject)&&<option value={subject}>{selected?.subject||subject}</option>}</select></label>
        <fieldset className="learning-checks"><legend>{t("班级成员")} · {members.length}</legend>{eligibleStudents.map(student => <label key={student}><input type="checkbox" checked={members.includes(student)} onChange={event => setMembers(current => event.target.checked ? [...current, student] : current.filter(name => name !== student))}/>{student}</label>)}{!eligibleStudents.length && <p className="muted">{t("请选择已分配学生的老师与科目")}</p>}</fieldset>
        <div className="learning-card-actions"><Button adminGrant={editingId?"classrooms.edit":"classrooms.create"} disabled={busy || !members.length}>{t("保存班级")}</Button><Button type="button" variant="outline" onClick={() => setCreating(false)}>{t("取消")}</Button></div>
      </form>
    </section>}

    {!creating && selected && <>
      <section className="panel classroom-intro"><div className="classroom-intro-copy"><p className="eyebrow">{selected.subject} · {selected.teacherName}</p><h2>{selected.title}</h2>{selected.description && <p className="classroom-description">{selected.description}</p>}</div>{canManage && (can("classrooms.edit")||can("classrooms.archive")||can("classrooms.restore")||can("classrooms.delete")) && <details key={selected.id} ref={managementRef} className="classroom-management"><summary><Settings2 size={16}/><span>{t("班级管理")}</span><ChevronDown size={15}/></summary><div className="learning-card-actions classroom-management-actions" role="group" aria-label={t("班级管理")}><Button adminGrant="classrooms.edit" type="button" size="sm" variant="outline" onClick={() => startEdit(selected)} disabled={Boolean(selected.archived)}>{t("编辑班级")}</Button><Button adminGrant={selected.archived?"classrooms.restore":"classrooms.archive"} type="button" size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm(t(selected.archived ? "确定重新开放这个班级？" : "确定封存这个班级？学生仍能查看已发布内容。"))) void mutate({ action: "archiveClassroom", id: selected.id, archived: !selected.archived }); }}>{t(selected.archived ? "恢复班级" : "封存班级")}</Button><DeleteButton kind="classroom" id={selected.id} busy={busy} mutate={async body => (await mutate(body)).ok} message="永久删除这个班级及其公告、资料、功课、提交记录和课堂录影链接？共用 PDF 与 Google Drive 影片会保留，此操作无法恢复。"/></div></details>}</section>
      <div ref={tabListRef} className="classroom-tabs" role="tablist" aria-label={t("班级内容")} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const currentIndex = classTabs.findIndex(item => item.id === tab);
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? classTabs.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + classTabs.length) % classTabs.length;
        const nextTab = classTabs[nextIndex].id;
        setTab(nextTab); tabButtons.current[nextTab]?.focus({ preventScroll: true });
      }}>
        {classTabs.map(item => <button key={item.id} ref={node => { tabButtons.current[item.id] = node; }} id={`${tabListId}-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`${tabListId}-panel`} tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><item.Icon size={17}/>{item.id==="payroll"?F2('classroomPay'):t(item.label)}</button>)}
      </div>
      <div id={`${tabListId}-panel`} className="classroom-content-panel" role="tabpanel" aria-labelledby={`${tabListId}-${tab}`} tabIndex={0}>
      {tab === "announcements" && can("announcements.view") && <section className="panel classroom-announcements-panel"><h2>{t("班级公告")}</h2>
        {canManage && !selected.archived && can(announcementId?"announcements.edit":"announcements.create") && <form className="learning-form classroom-announcement-form" onSubmit={saveAnnouncement}><label>{t("公告标题")}<input required maxLength={120} value={announcementTitle} onChange={event => setAnnouncementTitle(event.target.value)}/></label><label>{t("公告内容")}<textarea required maxLength={4000} value={announcementBody} onChange={event => setAnnouncementBody(event.target.value)}/></label><label className="classroom-pin"><input type="checkbox" checked={pinned} onChange={event => setPinned(event.target.checked)}/>{t("置顶公告")}</label><div className="learning-card-actions"><Button adminGrant={announcementId?"announcements.edit":"announcements.create"} disabled={busy}>{announcementId ? t("保存修改") : t("发布公告")}</Button>{announcementId && <Button type="button" variant="outline" onClick={() => { setAnnouncementId(""); setAnnouncementTitle(""); setAnnouncementBody(""); setPinned(false); }}>{t("取消编辑")}</Button>}</div></form>}
        <div className="learning-list">{selected.announcements.map(item => <article key={item.id} className="learning-card classroom-announcement">{item.pinned && <span className="classroom-pinned">{t("置顶")}</span>}<strong>{item.title}</strong><small>{item.authorName} · {dateLabel(item.createdAt)}</small><p>{item.body}</p>{canManage && !selected.archived && <div className="learning-card-actions"><Button adminGrant="announcements.edit" size="sm" variant="outline" onClick={() => { setAnnouncementId(item.id); setAnnouncementTitle(item.title); setAnnouncementBody(item.body); setPinned(Boolean(item.pinned)); }}>{t("编辑")}</Button><Button adminGrant="announcements.delete" size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm(t("确定删除这则公告？"))) void mutate({ action: "deleteAnnouncement", classroomId: selected.id, id: item.id }); }}>{t("删除公告")}</Button></div>}</article>)}{!selected.announcements.length && <p className="muted">{t("尚无公告")}</p>}</div>
      </section>}
      {tab === "schedule" && can("lessons.view") && <ClassroomSchedule key={selected.id} classroomId={selected.id} onCalendar={onCalendar} canAddRecording={canManage&&!selected.archived&&can("recordings.create")}/>}
      {tab === "recordings" && can("recordings.view") && <RecordingsWorkspace key={selected.id} classroomId={selected.id}/>}
      {tab === "payroll" && role === "admin" && can("payroll.view") && <Suspense fallback={<p role="status">{F2('loading')}</p>}><ClassroomPayrollSettings key={selected.id} classroomId={selected.id} canEdit={can("payroll.rates")}/></Suspense>}
      {tab === "members" && canManage && <section className="panel"><h2>{t("班级成员")} · {selected.members?.length || 0}</h2><div className="classroom-member-list">{selected.members?.map(name => <span key={name}>{name}</span>)}</div><p className="muted">{t("移出班级后，该学生不能再查看班级内容；已有提交记录会保留。")}</p></section>}
      {(tab === "materials"&&can("materials.view")) || (tab === "homework"&&can("homework.view")) ? !learningReady ? <PageState kind={learningError ? "error" : "loading"} title={learningError ? "页面加载失败" : "正在加载…"} description={learningError} action={learningError ? "重试" : undefined} onAction={() => { void loadLearning?.(true); }}/> : <FolderWorkspace key={selected.id} classroom={selected} role={role} learning={classLearning} view={tab} onChanged={()=>loadLearning?.(true)}>{(filtered,folderId,materials)=>role === "teacher" ? <TeacherLearning key={selected.id+":"+folderId+":"+tab} learning={filtered} mutate={learningMutate} busy={busy} view={tab} classroom={{id:selected.id,subject:selected.subject,members:selected.members||[]}} folderId={folderId} readOnly={Boolean(selected.archived)} availableMaterials={materials} onChanged={()=>loadLearning?.(true)}/> : role === "student" ? <StudentLearning key={folderId+":"+tab} learning={filtered} mutate={learningMutate} busy={busy} onPlan={onCalendar} onCalendar={onCalendar} view={tab}/> : <AdminLearning key={folderId+":"+tab} learning={filtered} view={tab} inClassroom/>}</FolderWorkspace> : null}
      </div>
    </>}
  </div>;
}
