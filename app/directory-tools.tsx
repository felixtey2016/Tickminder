"use client";
import { useFilterPreference } from "@/lib/filter-preferences";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BulkDeleteTool } from "./bulk-delete";
import { t } from "@/lib/i18n";
import {useAcademicCatalogue} from '@/lib/use-academic-catalogue';
import {StudentProfileFields,type StudentProfile} from '@/components/student-profile-fields';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';

export type Mutate = (body: Record<string, unknown>) => Promise<boolean>;
export function DeleteButton({ kind, id, mutate, busy, message }: { kind: string; id: string; mutate: Mutate; busy: boolean; message?: string }) {
  return <BulkDeleteTool kind={kind} records={[{id,label:""}]} mutate={mutate} busy={busy} single message={message}/>;
}

export function DirectoryFilters({ teachers, students, teacher, student, onTeacher, onStudent }: { teachers: string[]; students: string[]; teacher: string; student: string; onTeacher: (value: string) => void; onStudent: (value: string) => void }) {
  return <div className="directory-filters"><label>{t("老师姓名")}<select value={teacher} onChange={e => onTeacher(e.target.value)}><option value="">{t("所有老师")}</option>{teachers.map(n => <option key={n}>{n}</option>)}</select></label><label>{t("学生姓名")}<select value={student} onChange={e => onStudent(e.target.value)}><option value="">{t("所有学生")}</option>{students.map(n => <option key={n}>{n}</option>)}</select></label></div>;
}

type Person={name:string;active:boolean;syllabusId?:string;grade?:string|null;age?:number|null};
export function PeopleDirectory({ kind, people, mutate, busy }: { kind: "teacher" | "student"; people: Person[]; mutate: Mutate; busy: boolean }) {
  const [name, setName] = useState(""), [search, setSearch] = useFilterPreference<string>(`${kind}-search`, ""), [removed, setRemoved] = useFilterPreference<boolean>(`${kind}-removed`, false);
  const {catalogue,error,reload}=useAcademicCatalogue('student');
  const emptyProfile:StudentProfile={syllabusId:'',grade:'',age:''};
  const [profile,setProfile]=useState<StudentProfile>(emptyProfile),[editing,setEditing]=useState<Person|null>(null),[editProfile,setEditProfile]=useState<StudentProfile>(emptyProfile);
  const visible = people.filter(p => p.active !== removed && p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <section className="panel"><h2>{t(kind === "teacher" ? "老师名单" : "学生名单")}</h2>{kind==='student'&&error&&<p role="alert">{error} <Button size="sm" variant="outline" onClick={()=>void reload()}>{t('重试')}</Button></p>}<form onSubmit={async e => { e.preventDefault(); if (await mutate({ action: kind === "teacher" ? "saveTeacher" : "saveStudent", name, active: true,...(kind==='student'?{...profile,age:profile.age===''?null:Number(profile.age)}:{}) })) {setName("");setProfile(emptyProfile);} }}><label>{t("姓名")}<input required maxLength={80} value={name} onChange={e => setName(e.target.value)}/></label>{kind==='student'&&<StudentProfileFields catalogue={catalogue} value={profile} onChange={setProfile}/>}<Button disabled={busy||(kind==='student'&&!catalogue)}>{t(kind === "teacher" ? "添加老师姓名" : "添加学生姓名")}</Button></form>
    <div className="directory-filters"><label>{t("搜索姓名")}<input value={search} onChange={e => setSearch(e.target.value)}/></label><label>{t("显示记录")}<select value={removed ? "removed" : "active"} onChange={e => setRemoved(e.target.value === "removed")}><option value="active">{t("启用名单")}</option><option value="removed">{t("已移除")}</option></select></label></div>
    <Button variant="outline" size="sm" onClick={() => { setSearch(""); setRemoved(false); }}>{t("重置筛选")}</Button>
    <BulkDeleteTool kind={kind} records={visible.map(p=>({id:p.name,label:p.name}))} mutate={mutate} busy={busy}/>
    {visible.map(p => <div className="user-row" key={p.name}><div><strong>{p.name}</strong>{kind==='student'&&<small>{catalogue?.syllabuses.find(item=>item.id===p.syllabusId)?.name||p.syllabusId||t('尚未填写')}{p.grade?` · ${p.grade}`:''}{p.age!=null?` · ${p.age} ${t('岁')}`:''}</small>}</div><div className="user-actions">{kind==='student'&&<Button size="sm" variant="outline" onClick={()=>{setEditing(p);setEditProfile({syllabusId:p.syllabusId||'',grade:p.grade||'',age:p.age==null?'':String(p.age)});}}>{t('编辑资料')}</Button>}<Button size="sm" variant="outline" disabled={busy} onClick={() => { if (!p.active || window.confirm(t("确定移出名单？此姓名将从启用名单中隐藏，历史课程保留。"))) void mutate({ action: kind === "teacher" ? "saveTeacher" : "setStudentActive", name: p.name, active: !p.active }); }}>{t(p.active ? "移出名单" : "恢复至名单")}</Button><DeleteButton kind={kind} id={p.name} mutate={mutate} busy={busy} message="永久删除此姓名及科目绑定？历史课程会保留，仍有关联账号或已安排课程时需要先处理。"/></div></div>)}{!visible.length && <p className="empty">{t("没有符合条件的记录")}</p>}
    <Dialog open={Boolean(editing)} onOpenChange={open=>{if(!open)setEditing(null);}}><DialogContent className="lesson-dialog directory-dialog"><DialogHeader><DialogTitle>{t('编辑学生资料')} · {editing?.name}</DialogTitle></DialogHeader><form onSubmit={async event=>{event.preventDefault();if(editing&&await mutate({action:'updateStudentProfile',name:editing.name,...editProfile,age:editProfile.age===''?null:Number(editProfile.age)}))setEditing(null);}}><StudentProfileFields catalogue={catalogue} value={editProfile} onChange={setEditProfile}/><Button disabled={busy||!catalogue}>{t('保存修改')}</Button></form></DialogContent></Dialog>
  </section>;
}
