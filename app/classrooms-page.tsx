"use client";
import {displayFormatter} from '@/lib/display-preferences';
import {usePageHistoryState} from '@/lib/page-history';
import {useWorkspaceData} from '@/lib/use-workspace-data';
import type {WorkspaceReadIdentity} from '@/lib/workspace-page-data';
import {scopedLearningState} from './scoped-learning-workspace';

import { useAdminAction } from "./admin-permission-context";

import { FilterPanel } from "@/components/filter-panel";
import { PageState } from "@/components/page-state";
import { getLanguage } from "@/lib/i18n";
import { useFilterPreference } from "@/lib/filter-preferences";
import { BulkDeleteTool } from "./bulk-delete";
import { TermManager, TermSelect, type Term } from "./term-manager";
import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { BookOpen, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, FileText, Megaphone, Plus, Settings2, Users, Film, Banknote, ClipboardCheck, Search } from "lucide-react";
import {RecordingsWorkspace} from "./recordings-workspace";
import {ClassroomSchedule} from "./classroom-schedule";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "./classrooms-compact.css";
import "./classroom-create-dialog.css";
import {classroomDraftOptions} from '@/lib/classroom-draft-options';
import { t } from "@/lib/i18n";
import { StudentLearning, TeacherLearning, type LearningMutate, type LearningState } from "./learning-portal";
import { AdminLearning } from "./admin-learning";
import { FolderWorkspace } from "./folder-workspace";
import { DeleteButton, DirectoryFilters } from "./directory-tools";
import {useAcademicCatalogue} from '@/lib/use-academic-catalogue';
import {F2} from '@/lib/finance-round2-i18n';
const ClassroomPayrollSettings=lazy(()=>import('./classroom-payroll-settings'));
const ClassroomTasks=lazy(()=>import('./classroom-tasks').then(module=>({default:module.ClassroomTasks})));

export type Classroom = {
  id: string; title: string; description: string | null; subject: string;
  syllabusId?:string|null;subjectId?:string|null;grade?:string|null;
  teacherName: string; termId?: string | null; archived: number | boolean; createdAt: string; updatedAt: string;
  members?: string[];
  announcements: Array<{ id: string; title: string; body: string; pinned: number | boolean; authorName: string; createdAt: string; updatedAt: string }>;
};
type ClassMutate = (body: Record<string, unknown>) => Promise<{ ok: boolean; id?: string }>;
type Role = "admin" | "teacher" | "student";
type ClassroomTab = "announcements" | "schedule" | "materials" | "recordings" | "homework" | "tasks" | "members" | "payroll";
type Plan = { student: string; subject: string; subjectId?:string|null;syllabusId?:string;grade?:string|null;teacherName: string; active: boolean };

const dateLabel = (iso: string) => displayFormatter(getLanguage() === "zh" ? "zh-CN" : "en-GB",{ timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function ClassroomsPage({ role, account, classes, terms, teacherName, mutate, learningMutate, busy, onCalendar, taskTarget, onTaskTargetOpened }: {
  role: Role; account:WorkspaceReadIdentity; classes: Classroom[]; terms: Term[]; teacherName?: string | null;
  mutate: ClassMutate; learningMutate: LearningMutate; busy: boolean; onCalendar: () => void;
  taskTarget?:{classroomId:string;taskId:string}|null;onTaskTargetOpened?:()=>void;
}) {
  const can=useAdminAction();
  const [selectedId, setSelectedId] = usePageHistoryState("classroom.selected","");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const {catalogue,error:catalogueError,reload:reloadCatalogue}=useAcademicCatalogue('student');
  const [syllabusId,setSyllabusId]=useState(''),[grade,setGrade]=useState('');
  const [filterSyllabus,setFilterSyllabus]=useFilterPreference<string>('classes-syllabus',''),[filterGrade,setFilterGrade]=useFilterPreference<string>('classes-grade',''),[filterSubject,setFilterSubject]=useFilterPreference<string>('classes-subject','');
  const [creating, setCreating] = useState(false);
  const options=useWorkspaceData(creating&&role!=='student'?'classroom-options':null,account);
  const teachers=role==='teacher'&&teacherName?[teacherName]:options.data?.teachers||[];
  const plans:Plan[]=role==='teacher'?(options.data?.plans||[]).map(plan=>({...plan,teacherName:teacherName||'',active:true})):can('plans.view')?options.data?.allPlans||[]:options.data?.planOptions||[];
  const [tab, setTab] = usePageHistoryState<ClassroomTab>("classroom.tab","announcements");
  const [focusedTask,setFocusedTask]=useState<{classroomId:string;taskId:string}|null>(null);
  const tabListId = useId();
  const tabListRef = useRef<HTMLDivElement>(null);
  const [tabScroll,setTabScroll]=useState({left:false,right:false});
  const syncTabScroll=useCallback(()=>{
    const list=tabListRef.current;
    if(!list)return;
    const next={left:list.scrollLeft>2,right:list.scrollLeft+list.clientWidth<list.scrollWidth-2};
    setTabScroll(previous=>previous.left===next.left&&previous.right===next.right?previous:next);
  },[]);
  const scrollTabs=(direction:-1|1)=>{
    const list=tabListRef.current;
    if(!list)return;
    list.scrollBy({left:direction*Math.max(120,list.clientWidth*.75),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  };
  const directorySummaryRef = useRef<HTMLElement>(null);
  const focusClassroomContent = () => requestAnimationFrame(() => {
    const target = tabButtons.current.announcements || Object.values(tabButtons.current).find(Boolean) || directorySummaryRef.current;
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
  const [search,setSearch] = useFilterPreference<string>("classes-search", "");
  const searchQuery=search.trim().toLocaleLowerCase();
  const hasAdvancedFilters=Boolean(filterSyllabus||filterGrade||filterSubject||filterTeacher||filterStudent||archived);
  const resetDirectoryFilters=()=>{setSearch("");setFilterTeacher("");setFilterStudent("");setArchived(false);setFilterTerm("current");setFilterSyllabus("");setFilterGrade("");setFilterSubject("");setSelectedId("");};
  const currentTerm = terms.find(term=>term.isCurrent);
  const effectiveTerm = filterTerm==="current" ? currentTerm?.id || "all" : filterTerm;
  const [termId,setTermId] = useState("");
  const relationClasses = classes.filter(item => Boolean(item.archived) === archived && (effectiveTerm === "all" || (effectiveTerm === "unassigned" ? !item.termId : item.termId === effectiveTerm))&&(!filterSyllabus||item.syllabusId===filterSyllabus)&&(!filterGrade||item.grade===filterGrade)&&(!filterSubject||item.subjectId===filterSubject));
  const classroomPairs=relationClasses.flatMap(item=>(item.members||[]).map(student=>({teacher:item.teacherName,student})));
  const visibleClasses = relationClasses.filter(item=>(!filterTeacher||item.teacherName===filterTeacher)&&(!filterStudent||item.members?.includes(filterStudent))&&(!searchQuery||[item.title,item.subject,item.teacherName,item.grade,catalogue?.syllabuses.find(s=>s.id===item.syllabusId)?.name,...(item.members||[])].filter(Boolean).join(" ").toLocaleLowerCase().includes(searchQuery)));
  const visibleTeachers=[...new Set(visibleClasses.map(item=>item.teacherName))].sort();
  const selected = visibleClasses.find(item => item.id === selectedId) || (role === "admin" ? null : visibleClasses[0]) || null;
  useEffect(()=>{
    if(!taskTarget||!classes.some(item=>item.id===taskTarget.classroomId))return;
    const frame=requestAnimationFrame(()=>{
      setSearch('');setArchived(false);setFilterTerm('all');setFilterSyllabus('');setFilterGrade('');setFilterSubject('');setFilterTeacher('');setFilterStudent('');
      setCreating(false);setDirectoryOpen(false);setSelectedId(taskTarget.classroomId);setTab('tasks');setFocusedTask(taskTarget);onTaskTargetOpened?.();
    });
    return()=>cancelAnimationFrame(frame);
  },[taskTarget,classes,onTaskTargetOpened,setSearch,setArchived,setFilterTerm,setFilterSyllabus,setFilterGrade,setFilterSubject,setFilterTeacher,setFilterStudent,setSelectedId,setTab]);
  const learningView=!creating&&selected?.id&&(tab==='materials'||tab==='homework')&&can(tab==='materials'?'materials.view':'homework.view')?tab:null;
  const learningQuery=useWorkspaceData(learningView,account);
  const learning=scopedLearningState(learningQuery.data),learningReady=Boolean(learningQuery.data),learningError=learningQuery.error;
  const loadLearning=async(_force?:boolean)=>{learningQuery.reload();};
  useEffect(() => {
    if (managementRef.current) managementRef.current.open = false;
    const list = tabListRef.current, button = tabButtons.current[tab];
    if (!list || !button) return;
    const listBounds = list.getBoundingClientRect(), buttonBounds = button.getBoundingClientRect();
    if (buttonBounds.left < listBounds.left) list.scrollBy({ left: buttonBounds.left - listBounds.left });
    else if (buttonBounds.right > listBounds.right) list.scrollBy({ left: buttonBounds.right - listBounds.right });
    syncTabScroll();
  }, [tab, selected?.id, creating, syncTabScroll]);
  useEffect(()=>{
    const list=tabListRef.current;
    if(!list)return;
    const resize=()=>{
      const active=tabButtons.current[tab];
      if(active){
        const bounds=list.getBoundingClientRect(),button=active.getBoundingClientRect();
        if(button.left<bounds.left)list.scrollBy({left:button.left-bounds.left});
        else if(button.right>bounds.right)list.scrollBy({left:button.right-bounds.right});
      }
      syncTabScroll();
    };
    const observer=new ResizeObserver(resize);
    observer.observe(list);
    Array.from(list.children).forEach(child=>observer.observe(child));
    list.addEventListener('scroll',syncTabScroll,{passive:true});
    resize();
    return()=>{observer.disconnect();list.removeEventListener('scroll',syncTabScroll);};
  },[selected?.id,creating,tab,syncTabScroll]);
  const [editingId, setEditingId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [teacher, setTeacher] = useState(teacherName || "");
  const [subject, setSubject] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [courseKey,setCourseKey]=useState('');
  const classFormId=useId();
  const classFormTrigger=useRef<HTMLElement|null>(null);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcementId, setAnnouncementId] = useState("");
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [pinned, setPinned] = useState(false);
  useEffect(() => { setAnnouncementOpen(false); }, [selected?.id, tab]);

  const eligiblePlans = useMemo(() => plans.filter(plan => plan.active && (role !== "teacher" || plan.teacherName === teacherName)), [plans, role, teacherName]);
  const syllabus=catalogue?.syllabuses.find(item=>item.id===syllabusId);
  const eligibleStudents = [...new Set([...eligiblePlans.filter(plan => plan.teacherName === teacher && (editingId?((selected?.subjectId&&plan.subjectId===selected.subjectId)||plan.subject===subject):plan.subjectId===subject)&&(!syllabusId||plan.syllabusId===syllabusId)&&(!grade||!plan.grade||plan.grade===grade)).map(plan => plan.student), ...(editingId ? members : [])])].sort();
  const draftOptions=classroomDraftOptions((options.data?.plans||[]).map(plan=>({...plan,teacherName:plan.teacher,active:true})),teacher,members,catalogue);
  const courseChoicesKey=JSON.stringify(draftOptions.choices.map(choice=>choice.key));
  useEffect(()=>{if(!editingId)setCourseKey(current=>draftOptions.choices.some(choice=>choice.key===current)?current:draftOptions.choices.length===1?draftOptions.choices[0].key:'');},[editingId,courseChoicesKey]);
  const draftCourse=draftOptions.choices.find(choice=>choice.key===courseKey);
  const draftStudents=editingId?eligibleStudents:draftOptions.students;
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
    classFormTrigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    setTermId(currentTerm?.id || ""); setCreating(true); setEditingId(""); setTitle(""); setDescription(""); setTeacher(teacherName || ""); setSubject("");setSyllabusId('');setGrade(''); setMembers([]);setCourseKey('');
  }
  function startEdit(item: Classroom) {
    classFormTrigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    setTermId(item.termId || ""); setCreating(true); setEditingId(item.id); setTitle(item.title); setDescription(item.description || "");
    setTeacher(item.teacherName); setSubject(item.subjectId||item.subject);setSyllabusId(item.syllabusId||'');setGrade(item.grade||''); setMembers(item.members || []);
  }
  async function saveClassroom(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !can(editingId?'classrooms.edit':'classrooms.create') || !options.data || options.loading || options.error || !members.length || (!editingId&&!draftCourse)) return;
    const result = await mutate({ action: "saveClassroom", id: editingId, title, description, termId, teacherName: teacher, subject:editingId?subject:draftCourse!.subjectId,subjectId:editingId?subject:draftCourse!.subjectId,syllabusId:editingId?syllabusId:draftCourse!.syllabusId,grade:editingId?grade:draftCourse!.grade, students: members });
    if (result.ok) { setSearch(""); setFilterTerm(termId || "unassigned"); setCreating(false); setDirectoryOpen(false); if (result.id) setSelectedId(result.id); setTab("announcements"); focusClassroomContent(); }
  }
  async function saveAnnouncement(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return;
    const result = await mutate({ action: "saveAnnouncement", classroomId: selected.id, id: announcementId, title: announcementTitle, body: announcementBody, pinned });
    if (result.ok) { setAnnouncementOpen(false); setAnnouncementId(""); setAnnouncementTitle(""); setAnnouncementBody(""); setPinned(false); }
  }
  const canManage = role !== "student";
  const classTabs = ([{ id: "announcements", Icon: Megaphone, label: "公告" }, { id: "schedule", Icon: CalendarDays, label: "课程安排" }, { id: "materials", Icon: FileText, label: "教学资料" }, { id: "recordings", Icon: Film, label: "课堂录影" }, { id: "homework", Icon: BookOpen, label: "功课" }, { id: "tasks", Icon: ClipboardCheck, label: "任务" }, ...(canManage ? [{ id: "members", Icon: Users, label: "学生名单" } as const] : []), ...(role === "admin" && can("payroll.view") ? [{id:"payroll",Icon:Banknote,label:"老师报酬"} as const] : [])] as const).filter(item=>can(item.id==="announcements"?"announcements.view":item.id==="schedule"?"lessons.view":item.id==="materials"?"materials.view":item.id==="recordings"?"recordings.view":item.id==="homework"?"homework.view":item.id==="tasks"?"tasks.view":item.id==="payroll"?"payroll.view":"classrooms.view"));
  useEffect(()=>{if(!classTabs.some(item=>item.id===tab)&&classTabs[0])setTab(classTabs[0].id);},[tab,classTabs.map(item=>item.id).join(",")]);
  const pick = (item: Classroom) => { setAnnouncementOpen(false); setSelectedId(item.id); setDirectoryOpen(false); setCreating(false); setTab("announcements"); setAnnouncementId(""); setAnnouncementTitle(""); setAnnouncementBody(""); setPinned(false); focusClassroomContent(); };
  const classButtons = (items: Classroom[]) => <div className="classroom-chips">{items.map(item => {
    const title=item.title.toLocaleLowerCase();
    const context=[!title.includes(item.subject.toLocaleLowerCase())?item.subject:null,item.grade&&!title.includes(item.grade.toLocaleLowerCase())?item.grade:null,role!=="admin"?item.teacherName:null,effectiveTerm==="all"?(terms.find(term=>term.id===item.termId)?.name||t("未指定学期")):null,item.archived?t("已封存"):null].filter(Boolean).join(" · ");
    return <button type="button" key={item.id} className={selected?.id === item.id && !creating ? "selected" : ""} onClick={() => pick(item)}><span className="classroom-card-heading"><strong>{item.title}</strong><ChevronRight size={17} aria-hidden="true"/></span>{context&&<span className="classroom-card-meta">{context}</span>}</button>;
  })}</div>;
  const tabLabel = (item: typeof classTabs[number]) => item.id === "tasks" ? (getLanguage() === "zh" ? "任务" : "Tasks") : item.id === "payroll" ? F2('classroomPay') : t(item.label);
  return <div className="classrooms-page round1-classrooms classrooms-wave2">
    <details className="panel classroom-picker" open={directoryOpen || !selected || creating} onToggle={event => { if (selected && !creating) setDirectoryOpen(event.currentTarget.open); }}>
      <summary ref={directorySummaryRef} className="classroom-picker-summary" onClick={event => { if (!selected || creating) event.preventDefault(); }}><span className="classroom-picker-label"><strong><span className="classroom-label-full">{t("班级列表")}</span><span className="classroom-label-short">{getLanguage()==="zh"?"班级":"Classes"}</span></strong><span className="learning-record-count">{visibleClasses.length}</span><ChevronDown size={17}/></span>{canManage && <Button className="classroom-new-button" aria-label={t("新建班级")} adminGrant="classrooms.create" size="sm" onClick={event=>{event.preventDefault();event.stopPropagation();startCreate();}}><Plus size={16}/><span className="classroom-label-full">{t("新建班级")}</span><span className="classroom-label-short">{getLanguage()==="zh"?"新建":"Create"}</span></Button>}</summary>
      <div className="directory-filters classroom-directory-primary">
        <label className="classroom-search"><span>{getLanguage()==="zh"?"搜索班级":"Search classes"}</span><span className="classroom-search-field"><Search size={18} aria-hidden="true"/><input type="search" value={search} onChange={event=>{setSearch(event.target.value);setSelectedId("");}} placeholder={getLanguage()==="zh"?"班级名称或老师":"Class name or teacher"}/></span></label>
        <label>{t("学期")}<select value={filterTerm} onChange={e=>{setFilterTerm(e.target.value);setSelectedId("");}}><option value="current">{t("当前学期")}{currentTerm?` · ${currentTerm.name}`:""}</option><option value="all">{t("所有学期")}</option><option value="unassigned">{t("未指定学期")}</option>{terms.map(term=><option key={term.id} value={term.id}>{term.name}</option>)}</select></label>
      </div>
      <FilterPanel active={hasAdvancedFilters}>
        <div className="directory-filters classroom-directory-academic"><label>{t('课程体系')}<select value={filterSyllabus} onChange={event=>{setFilterSyllabus(event.target.value);setFilterGrade('');setFilterSubject('');setSelectedId('');}}><option value="">{t('全部课程体系')}</option>{catalogue?.syllabuses.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t('年级')}<select value={filterGrade} onChange={event=>{setFilterGrade(event.target.value);setSelectedId('');}}><option value="">{t('全部年级')}</option>{[...new Set(catalogue?.syllabuses.filter(item=>!filterSyllabus||item.id===filterSyllabus).flatMap(item=>item.grades)||[])].map(item=><option key={item}>{item}</option>)}</select></label><label>{t('科目')}<select value={filterSubject} onChange={event=>{setFilterSubject(event.target.value);setSelectedId('');}}><option value="">{t('全部科目')}</option>{[...new Map((catalogue?.syllabuses.filter(item=>!filterSyllabus||item.id===filterSyllabus).flatMap(item=>item.subjects)||[]).map(item=>[item.id,item])).values()].map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
        {role === "admin" && <DirectoryFilters teachers={[...new Set(relationClasses.map(c => c.teacherName))].sort()} students={[...new Set(relationClasses.flatMap(c => c.members || []))].sort()} pairs={classroomPairs} teacher={filterTeacher} student={filterStudent} onTeacher={value => { setFilterTeacher(value); setSelectedId(""); }} onStudent={value => { setFilterStudent(value); setSelectedId(""); }}/>}
        <label className="check-row"><input type="checkbox" checked={archived} onChange={e => { setArchived(e.target.checked); setSelectedId(""); }}/>{t("查看已封存班级")}</label>
        <div className="learning-card-actions classroom-directory-filter-actions"><Button variant="outline" size="sm" onClick={resetDirectoryFilters}>{t("重置筛选")}</Button>{role === "admin" && <TermManager terms={terms} mutate={mutate} busy={busy}/>}</div>
      </FilterPanel>
      <div className="list-tools classroom-directory-list-tools"><span>{visibleClasses.length} {t("个班级")}</span>{(searchQuery||hasAdvancedFilters||filterTerm!=="current")&&<Button type="button" variant="ghost" size="sm" onClick={resetDirectoryFilters}>{t("重置筛选")}</Button>}{canManage&&<BulkDeleteTool kind="classroom" records={visibleClasses.map(c=>({id:c.id,label:c.title+" · "+c.teacherName}))} mutate={async body=>(await mutate(body)).ok} busy={busy}/>}</div>
      {role === "admin" ? visibleTeachers.map((name,index) => <details className="directory-group classroom-teacher-group" key={[name,searchQuery,filterTeacher,filterStudent].join(":")} open={index===0||Boolean(searchQuery||filterTeacher||filterStudent)}><summary>{name} <span>{visibleClasses.filter(c => c.teacherName === name).length}</span></summary>{classButtons(visibleClasses.filter(c => c.teacherName === name))}</details>) : classButtons(visibleClasses)}
      {!visibleClasses.length && <PageState kind="empty" title={classes.length ? "没有符合筛选条件的班级" : "暂无班级"} action={canManage&&can("classrooms.create") ? "新建班级" : undefined} onAction={canManage&&can("classrooms.create") ? startCreate : undefined}/>}
    </details>

    <Dialog open={creating&&canManage&&can(editingId?'classrooms.edit':'classrooms.create')} onOpenChange={open=>{if(!open&&!busy)setCreating(false);}}>
      <DialogContent layout="framed" closeDisabled={busy} className="classroom-create-dialog" data-testid="classroom-create-dialog" onCloseAutoFocus={event=>{event.preventDefault();const target=classFormTrigger.current?.isConnected?classFormTrigger.current:directorySummaryRef.current;target?.focus({preventScroll:true});}}>
        <DialogHeader><DialogTitle>{t(editingId ? "编辑班级" : "新建班级")}</DialogTitle><DialogDescription>{getLanguage()==='zh'?'选择老师和学生后，使用他们共同适用的课程设置。':'Choose a teacher and students, then use a course they share.'}</DialogDescription></DialogHeader>
        <DialogBody>
          {(options.loading||options.error)&&<PageState kind={options.error?'error':'loading'} title={options.error?'页面加载失败':'正在加载…'} description={options.error} action={options.error?'重试':undefined} onAction={options.reload}/>}
          <form id={classFormId} className="learning-form classroom-create-form" onSubmit={saveClassroom}>
            {catalogueError&&<p role="alert">{catalogueError} <Button type="button" variant="outline" onClick={()=>void reloadCatalogue()}>{t('重试')}</Button></p>}
            <label>{t("班级名称")}<input required maxLength={100} name="classroom-title" value={title} onChange={event=>setTitle(event.target.value)} placeholder={t("例如：Form 4 Science 小班")}/></label>
            <TermSelect terms={terms} value={termId} onChange={setTermId} mutate={mutate} busy={busy}/>
            <label>{t("负责老师")}<select required name="classroom-teacher" disabled={role==='teacher'||Boolean(editingId)||!options.data} value={teacher} onChange={event=>{setTeacher(event.target.value);setSubject('');setMembers([]);setCourseKey('');}}><option value="">{t("请选择")}</option>{teachers.map(name=><option key={name}>{name}</option>)}</select></label>
            <fieldset className="learning-checks classroom-create-members"><legend>{t("班级成员")} · {members.length}</legend>{draftStudents.map(student=><label key={student}><input type="checkbox" name="classroom-students" value={student} checked={members.includes(student)} onChange={event=>setMembers(current=>event.target.checked?[...current,student]:current.filter(name=>name!==student))}/>{student}</label>)}{!draftStudents.length&&<p className="muted">{getLanguage()==='zh'?(teacher?'这位老师暂无有效课程配对的学生。':'请先选择老师。'):(teacher?'This teacher has no students with an active course pairing.':'Choose a teacher first.')}</p>}</fieldset>
            {editingId?<><label>{t('科目')}<input readOnly value={selected?.subject||subject}/></label><p className="field-hint">{[syllabus?.name||syllabusId,grade].filter(Boolean).join(' · ')}</p></>:<>
              <label>{t('科目')}<select name="classroom-course" required disabled={!members.length||!catalogue||!draftOptions.choices.length} value={courseKey} onChange={event=>setCourseKey(event.target.value)}><option value="">{t('请选择')}</option>{draftOptions.choices.map(choice=><option key={choice.key} value={choice.key}>{choice.subjectName} · {choice.syllabusName} · {choice.grade}</option>)}</select></label>
              {draftCourse?<p className="field-hint" data-testid="classroom-classification">{t('课程体系')}：{draftCourse.syllabusName} · {t(draftCourse.syllabusId==='stpm'?'学期':draftCourse.syllabusId==='a-level'?'阶段':'年级')}：{draftCourse.grade}</p>:<p className="field-hint" role={members.length&&!draftOptions.choices.length?'status':undefined}>{getLanguage()==='zh'?(!members.length?'请选择学生，科目将从他们现有课程设置中带入。':draftOptions.incompleteStudents.length?'所选学生缺少有效的课程体系、年级或科目设置，请先补齐现有资料。':draftOptions.choices.length?'请选择本班适用的科目组合。':'所选学生没有共同适用的课程组合，请调整成员或现有课程设置。'):(!members.length?'Select students to use their existing course settings.':draftOptions.incompleteStudents.length?'Some selected students need valid syllabus, grade or subject settings before this class can be created.':draftOptions.choices.length?'Choose the course combination for this class.':'These students share no applicable course combination. Adjust the members or existing course settings.')}</p>}
            </>}
            <details className="classroom-create-description"><summary>{t('班级说明（可选）')}</summary><label><span className="sr-only">{t('班级说明（可选）')}</span><textarea maxLength={1000} value={description} onChange={event=>setDescription(event.target.value)}/></label></details>
          </form>
        </DialogBody>
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={()=>setCreating(false)}>{t('取消')}</Button><Button type="submit" form={classFormId} adminGrant={editingId?'classrooms.edit':'classrooms.create'} disabled={busy||!members.length||!options.data||options.loading||Boolean(options.error)||(!editingId&&!draftCourse)}>{t('保存班级')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    {!creating && selected && <>
      <section className="panel classroom-intro"><div className="classroom-intro-copy"><p className="eyebrow">{selected.subject} · {selected.teacherName}</p><h2>{selected.title}</h2><p className="classroom-context-meta">{[catalogue?.syllabuses.find(item=>item.id===selected.syllabusId)?.name||selected.syllabusId,selected.grade,terms.find(term=>term.id===selected.termId)?.name||t("未指定学期")].filter(Boolean).join(" · ")}</p>{selected.description && <details className="round1-class-description"><summary>{getLanguage() === "zh" ? "班级说明" : "Class description"}</summary><p className="classroom-description">{selected.description}</p></details>}</div>{canManage && (can("classrooms.edit")||can("classrooms.archive")||can("classrooms.restore")||can("classrooms.delete")) && <details key={selected.id} ref={managementRef} className="classroom-management"><summary><Settings2 size={16}/><span>{t("班级管理")}</span><ChevronDown size={15}/></summary><div className="learning-card-actions classroom-management-actions" role="group" aria-label={t("班级管理")}><Button adminGrant="classrooms.edit" type="button" size="sm" variant="outline" onClick={() => startEdit(selected)} disabled={Boolean(selected.archived)}>{t("编辑班级")}</Button><Button adminGrant={selected.archived?"classrooms.restore":"classrooms.archive"} type="button" size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm(t(selected.archived ? "确定重新开放这个班级？" : "确定封存这个班级？学生仍能查看已发布内容。"))) void mutate({ action: "archiveClassroom", id: selected.id, archived: !selected.archived }); }}>{t(selected.archived ? "恢复班级" : "封存班级")}</Button><DeleteButton kind="classroom" id={selected.id} busy={busy} mutate={async body => (await mutate(body)).ok} message={getLanguage()==='zh'?'从使用名单移除此班级？账号和科目配对保留；已有课程、教学及财务记录保留，具体范围见删除预览。':'Remove this classroom from active use? Accounts and subject pairings remain. Existing lesson, learning and financial records are retained; review the exact impact below.'}/></div></details>}</section>
      <div className="classroom-section-navigation" data-scrollable={tabScroll.left||tabScroll.right}>
      <button type="button" className="classroom-tabs-scroll classroom-tabs-scroll-left" aria-label={getLanguage()==="zh"?"向左滚动班级菜单":"Scroll class menu left"} aria-controls={`${tabListId}-tabs`} disabled={!tabScroll.left} onClick={()=>scrollTabs(-1)}><ChevronLeft size={20}/></button>
      <span id={`${tabListId}-current`} className="sr-only">{classTabs.find(item => item.id === tab) ? tabLabel(classTabs.find(item => item.id === tab)!) : t("班级内容")}</span>
      <div ref={tabListRef} id={`${tabListId}-tabs`} className="classroom-tabs" role="tablist" aria-label={t("班级内容")} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const currentIndex = classTabs.findIndex(item => item.id === tab);
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? classTabs.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + classTabs.length) % classTabs.length;
        const nextTab = classTabs[nextIndex]?.id;
        if(!nextTab)return;
        setTab(nextTab); tabButtons.current[nextTab]?.focus({ preventScroll: true });
      }}>
        {classTabs.map(item => <button key={item.id} ref={node => { tabButtons.current[item.id] = node; }} id={`${tabListId}-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`${tabListId}-panel`} tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{tabLabel(item)}</button>)}
      </div>
      <button type="button" className="classroom-tabs-scroll classroom-tabs-scroll-right" aria-label={getLanguage()==="zh"?"向右滚动班级菜单":"Scroll class menu right"} aria-controls={`${tabListId}-tabs`} disabled={!tabScroll.right} onClick={()=>scrollTabs(1)}><ChevronRight size={20}/></button>
      </div>
      <div id={`${tabListId}-panel`} className="classroom-content-panel" role="tabpanel" aria-labelledby={`${tabListId}-current`} tabIndex={0}>
      {learningView&&learningReady&&learningQuery.loading&&<p role="status" className="muted">{t("正在加载…")}</p>}
      {learningView&&learningReady&&learningError&&<PageState kind="error" title="页面加载失败" description={learningError} action="重试" onAction={learningQuery.reload}/>}
      {tab === "announcements" && can("announcements.view") && <section className="panel classroom-announcements-panel">
        <div className="round1-section-head"><h2>{t("班级公告")} <span className="learning-record-count">{selected.announcements.length}</span></h2>{canManage && !selected.archived && can("announcements.create") && <Button adminGrant="announcements.create" type="button" size="sm" onClick={() => { setAnnouncementId(""); setAnnouncementTitle(""); setAnnouncementBody(""); setPinned(false); setAnnouncementOpen(true); }}><Plus size={16}/>{t("发布公告")}</Button>}</div>
        <div className="classroom-announcement-columns" aria-hidden="true"><span>{getLanguage()==="zh"?"公告":"Announcement"}</span><span>{getLanguage()==="zh"?"发布人 / 时间":"Published by / date"}</span><span>{getLanguage()==="zh"?"操作":"Action"}</span></div><div className="learning-list round1-announcement-list">{selected.announcements.map(item => <article key={item.id} className="learning-card classroom-announcement"><details className="round1-announcement-detail"><summary className="classroom-announcement-row"><span className="round1-announcement-heading"><strong>{item.title}</strong>{Boolean(item.pinned) && <span className="classroom-pinned">{t("置顶")}</span>}</span><span className="classroom-announcement-meta">{item.authorName} · {dateLabel(item.createdAt)}</span><span className="classroom-announcement-action">{getLanguage() === "zh" ? "查看公告" : "Read announcement"}<ChevronDown size={15}/></span></summary><p>{item.body}</p>{canManage && !selected.archived && <div className="learning-card-actions"><Button adminGrant="announcements.edit" size="sm" variant="outline" onClick={() => { setAnnouncementId(item.id); setAnnouncementTitle(item.title); setAnnouncementBody(item.body); setPinned(Boolean(item.pinned)); setAnnouncementOpen(true); }}>{t("编辑")}</Button><Button adminGrant="announcements.delete" size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm(t("确定删除这则公告？"))) void mutate({ action: "deleteAnnouncement", classroomId: selected.id, id: item.id }); }}>{t("删除公告")}</Button></div>}</details></article>)}{!selected.announcements.length && <p className="muted">{t("尚无公告")}</p>}</div>
        {announcementOpen && canManage && !selected.archived && can(announcementId ? "announcements.edit" : "announcements.create") && <Dialog open onOpenChange={open => { if (!busy) setAnnouncementOpen(open); }}><DialogContent className="content-edit-dialog round1-announcement-dialog" overlayClassName="content-edit-overlay" closeDisabled={busy}><DialogTitle>{announcementId ? t("编辑") + " · " + t("班级公告") : t("发布公告")}</DialogTitle><DialogDescription>{selected.title}</DialogDescription><form className="learning-form" onSubmit={saveAnnouncement}><label>{t("公告标题")}<input autoFocus required maxLength={120} disabled={busy} value={announcementTitle} onChange={event => setAnnouncementTitle(event.target.value)}/></label><label>{t("公告内容")}<textarea required rows={6} maxLength={4000} disabled={busy} value={announcementBody} onChange={event => setAnnouncementBody(event.target.value)}/></label><label className="round1-announcement-pin"><input type="checkbox" disabled={busy} checked={pinned} onChange={event => setPinned(event.target.checked)}/>{t("置顶公告")}</label><div className="learning-card-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => setAnnouncementOpen(false)}>{t("取消")}</Button><Button adminGrant={announcementId ? "announcements.edit" : "announcements.create"} disabled={busy}>{announcementId ? t("保存修改") : t("发布公告")}</Button></div></form></DialogContent></Dialog>}
      </section>}
      {tab === "schedule" && can("lessons.view") && <ClassroomSchedule key={selected.id} classroomId={selected.id} onCalendar={onCalendar} canAddRecording={canManage&&!selected.archived&&can("recordings.create")}/>}
      {tab === "recordings" && can("recordings.view") && <RecordingsWorkspace key={selected.id} classroomId={selected.id}/>}
      {tab === "tasks" && can("tasks.view") && <Suspense fallback={<PageState kind="loading" title={getLanguage()==="zh"?"正在载入任务…":"Loading tasks…"}/>}><ClassroomTasks key={selected.id+":"+role} classroom={selected} role={role} focusTaskId={focusedTask?.classroomId===selected.id?focusedTask.taskId:undefined}/></Suspense>}
      {tab === "payroll" && role === "admin" && can("payroll.view") && <Suspense fallback={<p role="status">{F2('loading')}</p>}><ClassroomPayrollSettings key={selected.id} classroomId={selected.id} canEdit={can("payroll.rates")}/></Suspense>}
      {tab === "members" && canManage && <section className="panel"><h2>{t("班级成员")} · {selected.members?.length || 0}</h2><ul className="round1-classroom-members">{selected.members?.map((name, index) => <li key={name}><span className="round1-member-number" aria-hidden="true">{index + 1}</span><span>{name}</span></li>)}</ul><p className="muted">{t("移出班级后，该学生不能再查看班级内容；已有提交记录会保留。")}</p></section>}
      {(tab === "materials"&&can("materials.view")) || (tab === "homework"&&can("homework.view")) ? !learningReady ? <PageState kind={learningError ? "error" : "loading"} title={learningError ? "页面加载失败" : "正在加载…"} description={learningError} action={learningError ? "重试" : undefined} onAction={() => { void loadLearning?.(true); }}/> : <FolderWorkspace key={selected.id} classroom={selected} role={role} learning={classLearning} view={tab} onChanged={()=>loadLearning?.(true)}>{(filtered,folderId,materials)=>role === "teacher" ? <TeacherLearning key={selected.id+":"+folderId+":"+tab} learning={filtered} mutate={learningMutate} busy={busy} view={tab} classroom={{id:selected.id,subject:selected.subject,members:selected.members||[]}} folderId={folderId} readOnly={Boolean(selected.archived)} availableMaterials={materials} onChanged={()=>loadLearning?.(true)}/> : role === "student" ? <StudentLearning inClassroom key={folderId+":"+tab} historyScope={`${selected.id}:${folderId}`} learning={filtered} mutate={learningMutate} busy={busy} onPlan={onCalendar} onCalendar={onCalendar} view={tab}/> : <AdminLearning key={folderId+":"+tab} historyScope={`${selected.id}:${folderId}`} learning={filtered} view={tab} inClassroom classroom={{id:selected.id,subject:selected.subject,members:selected.members||[]}} folderId={folderId} readOnly={Boolean(selected.archived)} onChanged={()=>loadLearning?.(true)}/>}</FolderWorkspace> : null}
      </div>
    </>}
  </div>;
}
