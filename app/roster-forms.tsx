"use client";
import { FilterPanel } from "@/components/filter-panel";
import { useFilterPreference } from "@/lib/filter-preferences";
import { BulkDeleteTool } from "./bulk-delete";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDialogState } from "@/lib/use-dialog-state";
import { t } from "@/lib/i18n";
import { DeleteButton, DirectoryFilters, type Mutate } from "./directory-tools";
import {useAcademicCatalogue} from '@/lib/use-academic-catalogue';
import {StudentProfileFields,type StudentProfile} from '@/components/student-profile-fields';
import {findCatalogueSubject,type AcademicCatalogue} from '@/lib/academic-catalogue';
import {StudentPromotions} from './student-promotions';

type Profile={name:string;syllabusId?:string;grade?:string|null;age?:number|null};
type Plan = { key: string; student: string; subject: string; subjectId?:string|null;syllabusId?:string;grade?:string|null;age?:number|null;teacherName: string; duration: number; active: boolean; onlineLink?: string | null };
type Props = { students: string[]; studentProfiles?:Profile[];teachers: string[]; mutate: Mutate; busy: boolean };
function PlanForm({ students,studentProfiles=[], teachers, mutate, busy, plan, saved,catalogue }: Props & { plan?: Plan; saved?: () => void;catalogue:AcademicCatalogue|null }) {
  const [student, setStudent] = useState(plan?.student || ""), [subject, setSubject] = useState(plan?.subjectId || plan?.subject || ""), [teacherName, setTeacherName] = useState(plan?.teacherName || "");
  const initial=studentProfiles.find(item=>item.name===plan?.student)||plan;
  const [profile,setProfile]=useState<StudentProfile>({syllabusId:initial?.syllabusId||'',grade:initial?.grade||'',age:initial?.age==null?'':String(initial.age)});
  const syllabus=catalogue?.syllabuses.find(item=>item.id===profile.syllabusId),selectedSubject=syllabus?findCatalogueSubject(syllabus,subject):undefined;
  const [duration, setDuration] = useState(String(plan?.duration || 1)), [onlineLink, setOnlineLink] = useState(plan?.onlineLink || ""), [active, setActive] = useState(plan?.active ?? true);
  function reset() { setStudent(""); setSubject(""); setTeacherName(""); setDuration("1"); setOnlineLink(""); setActive(true); }
  return <form onSubmit={async e => { e.preventDefault(); if (await mutate({ action: "savePlan", student, subject:plan?.subject||selectedSubject?.name,subjectId:selectedSubject?.id, teacherName, duration: Number(duration), onlineLink, active, editingKey: plan?.key,...profile,age:profile.age===''?null:Number(profile.age) })) { reset(); saved?.(); } }}>
    <label>{t("学生姓名")}<select aria-label={t("学生姓名")} required disabled={Boolean(plan)} value={student} onChange={e => {setStudent(e.target.value);setSubject('');const chosen=studentProfiles.find(item=>item.name===e.target.value);setProfile({syllabusId:chosen?.syllabusId||'',grade:chosen?.grade||'',age:chosen?.age==null?'':String(chosen.age)});}}><option value="">{t("请选择")}</option>{[...new Set([...students, ...(plan ? [plan.student] : [])])].map(n => <option key={n}>{n}</option>)}</select></label>
    <StudentProfileFields catalogue={catalogue} value={profile} onChange={next=>{if(next.syllabusId!==profile.syllabusId&&!plan)setSubject('');setProfile(next);}}/>
    <label>{t("科目")}<select aria-label={t("科目")} required disabled={Boolean(plan)||!syllabus} value={selectedSubject?.id||''} onChange={event=>setSubject(event.target.value)}><option value="">{t('请选择')}</option>{syllabus?.subjects.filter(item=>item.active||item.id===plan?.subjectId).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>{t("负责老师")}<select required value={teacherName} onChange={e => setTeacherName(e.target.value)}><option value="">{t("请选择")}</option>{[...new Set([...teachers, ...(plan ? [plan.teacherName] : [])])].map(n => <option key={n}>{n}</option>)}</select></label>
    <label>{t("通常时长（小时）")}<input required type="number" min="0.25" max="12" step="0.25" value={duration} onChange={e => setDuration(e.target.value)}/></label>
    <label>{t("线上课堂链接（可选）")}<input type="url" inputMode="url" maxLength={2048} placeholder="https://meet.google.com/..." value={onlineLink} onChange={e => setOnlineLink(e.target.value)}/></label>
    <label className="check-row"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/>{t("启用此科目配对")}</label><p className="muted">{t("启用的科目配对会沿用匹配班级；没有匹配班级时，系统会自动建立班级。")}</p><Button disabled={busy||!catalogue||!selectedSubject}>{t("保存科目配对")}</Button>
  </form>;
}
export function SubjectAdmin({ students,studentProfiles=[], teachers, plans, mutate, busy }: Props & { plans: Plan[] }) {
  const {catalogue,error,reload}=useAcademicCatalogue('student');
  const [syllabus,setSyllabus]=useFilterPreference<string>('subjects-syllabus',''),[subjectId,setSubjectId]=useFilterPreference<string>('subjects-catalogue-subject',''),[grade,setGrade]=useFilterPreference<string>('subjects-grade','');
  const [teacher, setTeacher] = useFilterPreference<string>("subjects-teacher", ""), [student, setStudent] = useFilterPreference<string>("subjects-student", ""), [removed, setRemoved] = useFilterPreference<boolean>("subjects-removed", false);
  const [editing, setEditing] = useDialogState<Plan | null>("plan-edit", null), [creating, setCreating] = useDialogState<boolean | null>("plan-create", null);
  const visible = plans.filter(p => p.active !== removed && (!teacher || p.teacherName === teacher) && (!student || p.student === student)&&(!syllabus||p.syllabusId===syllabus)&&(!subjectId||p.subjectId===subjectId)&&(!grade||p.grade===grade));
  const groups = [...new Set(visible.map(p => p.teacherName))].sort();
  return <section className="panel subjects-panel"><div className="section-head"><h2>{t("学生科目配对")}</h2><Button onClick={() => setCreating(true)}>{t("新增科目配对")}</Button></div>
    <StudentPromotions/>
    {error&&<p role="alert">{error} <Button variant="outline" onClick={()=>void reload()}>{t('重试')}</Button></p>}
    <FilterPanel active={Boolean(teacher || student || removed||syllabus||subjectId||grade)}><DirectoryFilters teachers={[...new Set([...teachers, ...plans.map(p => p.teacherName)])].sort()} students={[...new Set([...students, ...plans.map(p => p.student)])].sort()} teacher={teacher} student={student} onTeacher={setTeacher} onStudent={setStudent}/><div className="directory-filters"><label>{t('课程体系')}<select value={syllabus} onChange={event=>{setSyllabus(event.target.value);setSubjectId('');setGrade('');}}><option value="">{t('全部课程体系')}</option>{catalogue?.syllabuses.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t('科目')}<select value={subjectId} onChange={event=>setSubjectId(event.target.value)}><option value="">{t('全部科目')}</option>{[...new Map((catalogue?.syllabuses.filter(item=>!syllabus||item.id===syllabus).flatMap(item=>item.subjects)||[]).map(item=>[item.id,item])).values()].map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t('年级')}<select value={grade} onChange={event=>setGrade(event.target.value)}><option value="">{t('全部年级')}</option>{[...new Set(catalogue?.syllabuses.filter(item=>!syllabus||item.id===syllabus).flatMap(item=>item.grades)||[])].map(item=><option key={item}>{item}</option>)}</select></label></div><Button size="sm" variant="outline" onClick={() => { setTeacher(""); setStudent(""); setRemoved(false);setSyllabus('');setSubjectId('');setGrade(''); }}>{t("重置筛选")}</Button>
    <label className="check-row"><input type="checkbox" checked={removed} onChange={e => setRemoved(e.target.checked)}/>{t("查看停用科目")}</label></FilterPanel>
    <BulkDeleteTool kind="plan" records={visible.map(p=>({id:p.key,label:p.student+" · "+p.subject}))} mutate={mutate} busy={busy}/>
    {groups.map(name => <details className="directory-group" key={name} open={Boolean(teacher || student)}><summary>{name} <span>{visible.filter(p => p.teacherName === name).length}</span></summary>{visible.filter(p => p.teacherName === name).map(p => <div className="user-row" key={p.key}><div><strong>{p.student} · {catalogue?.syllabuses.find(item=>item.id===p.syllabusId)?.subjects.find(item=>item.id===p.subjectId)?.name||p.subject}</strong><small>{catalogue?.syllabuses.find(item=>item.id===p.syllabusId)?.name||p.syllabusId} {p.grade?` · ${p.grade}`:""}{p.age!=null?` · ${p.age} ${t("岁")}`:""}</small><small>{p.duration} h · {t(p.active ? "已启用" : "已停用")}</small><small>{t(p.onlineLink ? "网课链接已设置" : "尚未设置网课链接")}</small></div><div className="user-actions"><Button size="sm" variant="outline" onClick={() => setEditing(p)}>{t("编辑")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void mutate({ action: "savePlan", ...p,editingKey:p.key, active: !p.active })}>{t(p.active ? "停用" : "恢复启用")}</Button><DeleteButton kind="plan" id={p.key} mutate={mutate} busy={busy} message="永久删除此学生科目绑定？历史课程会保留，仍有课程或班级使用时需要先处理。"/></div></div>)}</details>)}
    {!visible.length && <p className="empty">{t("没有符合条件的记录")}</p>}
    <Dialog open={Boolean(creating)} onOpenChange={open => setCreating(open ? true : null)}><DialogContent className="lesson-dialog directory-dialog"><DialogHeader><DialogTitle>{t("新增科目配对")}</DialogTitle></DialogHeader><p className="muted">{t("请先在「学生名单」添加学生，再设置科目、负责老师及网课链接。")}</p><PlanForm students={students} studentProfiles={studentProfiles} catalogue={catalogue} teachers={teachers} mutate={mutate} busy={busy} saved={() => setCreating(null)}/></DialogContent></Dialog>
    <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open) setEditing(null); }}><DialogContent className="lesson-dialog directory-dialog"><DialogHeader><DialogTitle>{t("编辑学生科目")}</DialogTitle></DialogHeader>{editing && <PlanForm key={editing.key} plan={editing} students={students} studentProfiles={studentProfiles} catalogue={catalogue} teachers={teachers} mutate={mutate} busy={busy} saved={() => setEditing(null)}/>}</DialogContent></Dialog>
  </section>;
}
