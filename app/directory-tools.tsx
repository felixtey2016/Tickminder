"use client";
import { useAdminAction } from "./admin-permission-context";
import { useFilterPreference } from "@/lib/filter-preferences";
import {lazy,Suspense,useEffect,useRef,useState } from "react";
import { Button } from "@/components/ui/button";
import {StudentPromotions} from "./student-promotions";
import { BulkDeleteTool } from "./bulk-delete";
import { getLanguage, t } from "@/lib/i18n";
import "./people-compact.css";
import {PR} from "@/lib/parents-i18n";
import {useAcademicCatalogue} from '@/lib/use-academic-catalogue';
import {StudentProfileFields,type StudentProfile} from '@/components/student-profile-fields';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {teacherStudentOptions,isTeacherStudentPair,type TeacherStudentPair} from '@/lib/teacher-student-options';
import './teacher-student-filters.css';
import '@/lib/teacher-student-ui-i18n';

const StudentParentConnections=lazy(()=>import('./parent-children-manager').then(m=>({default:m.StudentParentConnections})));
const ParentChildrenManager=lazy(()=>import('./parent-children-manager').then(m=>({default:m.ParentChildrenManager})));
export type Mutate = (body: Record<string, unknown>) => Promise<boolean>;
export function DeleteButton({ kind, id, mutate, busy, message }: { kind: string; id: string; mutate: Mutate; busy: boolean; message?: string }) {
  return <BulkDeleteTool kind={kind} records={[{id,label:""}]} mutate={mutate} busy={busy} single message={message}/>;
}

export function DirectoryFilters({ teachers, students, pairs, teacher, student, onTeacher, onStudent, hideTeacher=false }: { hideTeacher?:boolean;teachers: string[]; students: string[]; pairs?:readonly TeacherStudentPair[]; teacher: string; student: string; onTeacher: (value: string) => void; onStudent: (value: string) => void }) {
  const primary=useRef<'teacher'|'student'>('teacher'),ready=pairs!==undefined;
  const options=teacherStudentOptions(teachers,students,pairs||[],teacher,student);
  const available=teacherStudentOptions(teachers,students,pairs||[],'','');
  useEffect(()=>{
    if(!pairs)return;
    if(teacher&&!available.teachers.includes(teacher)){onTeacher('');return;}
    if(student&&!available.students.includes(student)){onStudent('');return;}
    if(!isTeacherStudentPair(pairs,teacher,student)){if(primary.current==='student')onTeacher('');else onStudent('');}
  },[teacher,student,teachers,students,pairs,onTeacher,onStudent]);
  return <div className="directory-filters teacher-student-filters" aria-busy={!ready} data-hide-teacher={hideTeacher||undefined}>{!hideTeacher&&<label>{t("老师姓名")}<select aria-label={t('老师姓名')} disabled={!ready} value={ready&&options.teachers.includes(teacher)?teacher:''} onChange={e=>{const value=e.target.value;primary.current='teacher';onTeacher(value);if(!isTeacherStudentPair(pairs||[],value,student))onStudent('');}}><option value="">{t(ready?"所有老师":'正在加载…')}</option>{options.teachers.map(n=><option key={n} value={n}>{n}</option>)}</select>{ready&&student&&!options.teachers.length&&<small className="teacher-student-filter-hint">{t('此学生暂无关联老师')}</small>}</label>}<label>{t("学生姓名")}<select aria-label={t('学生姓名')} disabled={!ready} value={ready&&options.students.includes(student)?student:''} onChange={e=>{const value=e.target.value;primary.current='student';onStudent(value);if(!isTeacherStudentPair(pairs||[],teacher,value))onTeacher('');}}><option value="">{t(ready?"所有学生":'正在加载…')}</option>{options.students.map(n=><option key={n} value={n}>{n}</option>)}</select>{ready&&teacher&&!options.students.length&&<small className="teacher-student-filter-hint">{t('此老师暂无关联学生')}</small>}</label></div>;
}

type Person={name:string;active:boolean;syllabusId?:string;grade?:string|null;age?:number|null};
export function PeopleDirectory({ kind, people, mutate, busy }: { kind: "teacher" | "student"; people: Person[]; mutate: Mutate; busy: boolean }) {
  const can=useAdminAction();
  const [parentStudent,setParentStudent]=useState<string|null>(null),[parentTarget,setParentTarget]=useState<{id:string;name:string}|null>(null);
  const [name, setName] = useState(""), [search, setSearch] = useFilterPreference<string>(`${kind}-search`, ""), [removed, setRemoved] = useFilterPreference<boolean>(`${kind}-removed`, false);
  const {catalogue,error,reload}=useAcademicCatalogue('student');
  const emptyProfile:StudentProfile={syllabusId:'',grade:'',age:''};
  const [profile,setProfile]=useState<StudentProfile>(emptyProfile),[editing,setEditing]=useState<Person|null>(null),[editProfile,setEditProfile]=useState<StudentProfile>(emptyProfile);
  const visible = people.filter(p => p.active !== removed && p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <section className="panel directory-panel people-directory people-compact"><h2>{t(kind === "teacher" ? "老师名单" : "学生名单")}</h2>{kind==='student'&&error&&<p role="alert" className="directory-notice-actions"><span>{error}</span><Button size="sm" variant="outline" onClick={()=>void reload()}>{t('重试')}</Button></p>}{can(kind==="student"?"students.create":"teachers.create")&&<details className="directory-create"><summary>{t("新增")} {t(kind === "teacher" ? "老师" : "学生")}</summary><form onSubmit={async e => { e.preventDefault(); if (await mutate({ action: kind === "teacher" ? "saveTeacher" : "saveStudent", name, active: true,...(kind==='student'?{...profile,age:profile.age===''?null:Number(profile.age)}:{}) })) {setName("");setProfile(emptyProfile);} }}><label>{t("姓名")}<input required maxLength={80} value={name} onChange={e => setName(e.target.value)}/></label>{kind==='student'&&<StudentProfileFields catalogue={catalogue} value={profile} onChange={setProfile}/>}<div className="directory-form-actions"><Button disabled={busy||(kind==='student'&&!catalogue)}>{t(kind === "teacher" ? "添加老师姓名" : "添加学生姓名")}</Button></div></form></details>}

    <div className="directory-filters"><label>{t("搜索姓名")}<input value={search} onChange={e => setSearch(e.target.value)}/></label><label>{t("显示记录")}<select value={removed ? "removed" : "active"} onChange={e => setRemoved(e.target.value === "removed")}><option value="active">{t("启用名单")}</option><option value="removed">{t("已移除")}</option></select></label></div>
    <div className="directory-toolbar people-list-toolbar"><span className="muted">{getLanguage()==='en'?visible.length+' people':visible.length+' 人'}</span>{(search||removed)&&<Button variant="outline" size="sm" onClick={() => { setSearch(""); setRemoved(false); }}>{t("重置筛选")}</Button>}{can(kind==="student"?"students.delete":"teachers.delete")&&<details className="people-batch"><summary>{getLanguage()==='en'?'Bulk actions':'批量操作'}</summary><BulkDeleteTool kind={kind} records={visible.map(p=>({id:p.name,label:p.name}))} mutate={mutate} busy={busy}/></details>}</div>
    {visible.map(p => <div className="user-row directory-person-row" key={p.name}><div className="directory-person-identity"><strong>{p.name}</strong>{kind==='student'&&<small>{catalogue?.syllabuses.find(item=>item.id===p.syllabusId)?.name||p.syllabusId||t('尚未填写')}{p.grade?` · ${p.grade}`:''}{p.age!=null?` · ${p.age} ${t('岁')}`:''}</small>}</div>{(kind==="student"?(can("students.edit")||can("parents.view")||can(p.active?"students.disable":"students.restore")||can("students.delete")):(can(p.active?"teachers.disable":"teachers.restore")||can("teachers.delete")))&&<details className="people-row-details"><summary>{getLanguage()==='en'?'Details & actions':'资料与操作'}</summary><div className="people-row-content"><div className="user-actions directory-person-actions">{kind==='student'&&can("parents.view")&&<Button type="button" variant="outline" onClick={()=>setParentStudent(p.name)}>{PR('studentParents')}</Button>}{kind==='student'&&<Button adminGrant="students.edit" size="sm" variant="outline" onClick={()=>{setEditing(p);setEditProfile({syllabusId:p.syllabusId||'',grade:p.grade||'',age:p.age==null?'':String(p.age)});}}>{t('编辑资料')}</Button>}<Button adminGrant={kind==="student"?(p.active?"students.disable":"students.restore"):(p.active?"teachers.disable":"teachers.restore")} size="sm" variant="outline" disabled={busy} onClick={() => { if (!p.active || window.confirm(t("确定移出名单？此姓名将从启用名单中隐藏，历史课程保留。"))) void mutate({ action: kind === "teacher" ? "saveTeacher" : "setStudentActive", name: p.name, active: !p.active }); }}>{t(p.active ? "移出名单" : "恢复至名单")}</Button><DeleteButton kind={kind} id={p.name} mutate={mutate} busy={busy} message={kind==="student"?(getLanguage()==="zh"?"永久删除此学生及科目绑定？取消课程和空班级的清理范围见下方预览。":"Permanently delete this student and subject pairings? Review the cancelled lessons and empty classrooms listed below."):"永久删除此姓名及科目绑定？历史课程会保留，仍有关联账号或已安排课程时需要先处理。"}/></div></div></details>}</div>)}{!visible.length && <p className="empty">{t("没有符合条件的记录")}</p>}
    {kind==="student"&&<div className="directory-toolbar directory-maintenance"><StudentPromotions/></div>}
    {parentStudent&&can('parents.view')&&<Dialog open onOpenChange={open=>{if(!open)setParentStudent(null);}}><DialogContent className="lesson-dialog directory-dialog"><DialogHeader><DialogTitle>{parentStudent} · {PR('studentParents')}</DialogTitle></DialogHeader><Suspense fallback={<p role="status">{t('正在加载…')}</p>}><StudentParentConnections studentName={parentStudent} canManage={can('parents.manage')} onManage={parent=>{setParentStudent(null);setParentTarget(parent);}}/></Suspense></DialogContent></Dialog>}
    {parentTarget&&can('parents.view')&&<Suspense fallback={<p role="status">{t('正在加载…')}</p>}><ParentChildrenManager accountId={parentTarget.id} accountName={parentTarget.name} canManage={can('parents.manage')} onClose={()=>setParentTarget(null)}/></Suspense>}
    <Dialog open={Boolean(editing)&&can("students.edit")} onOpenChange={open=>{if(!open)setEditing(null);}}><DialogContent className="lesson-dialog directory-dialog"><DialogHeader><DialogTitle>{t('编辑学生资料')}</DialogTitle></DialogHeader><div className="directory-dialog-identity"><strong>{editing?.name}</strong></div><form onSubmit={async event=>{event.preventDefault();if(editing&&await mutate({action:'updateStudentProfile',name:editing.name,...editProfile,age:editProfile.age===''?null:Number(editProfile.age)}))setEditing(null);}}><StudentProfileFields catalogue={catalogue} value={editProfile} onChange={setEditProfile}/><div className="directory-form-actions"><Button disabled={busy||!catalogue}>{t('保存修改')}</Button></div></form></DialogContent></Dialog>
  </section>;
}
