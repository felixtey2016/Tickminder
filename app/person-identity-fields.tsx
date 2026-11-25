"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { StudentProfileFields } from "@/components/student-profile-fields";
import { getLanguage, t } from "@/lib/i18n";
import { useAcademicCatalogue } from "@/lib/use-academic-catalogue";
import { studentNameKey } from "@/lib/student-names";
import "@/lib/account-provisioning-i18n";
import "./account-provisioning-ui.css";

export type PersonIdentityDraft = {
  mode: "new" | "existing";
  name: string;
  identity: string;
  syllabusId: string;
  grade: string;
  age: string;
};

export function createPersonIdentityDraft(name = "", mode: PersonIdentityDraft["mode"] = "new", identity = ""): PersonIdentityDraft {
  return {mode, name, identity, syllabusId: "", grade: "", age: ""};
}

export function personIdentityReady(role: string, value: PersonIdentityDraft): boolean {
  if (role !== "student" && role !== "teacher") return Boolean(value.name.trim());
  if (value.mode === "existing") return Boolean(value.identity);
  return Boolean(value.name.trim()) && (role !== "student" || Boolean(value.syllabusId)) &&
    (value.age === "" || Number.isInteger(Number(value.age)) && Number(value.age) >= 0 && Number(value.age) <= 100);
}

export function personIdentityPayload(role: string, value: PersonIdentityDraft) {
  const personRole = role === "student" || role === "teacher";
  const existing = personRole && value.mode === "existing";
  return {
    name: (existing ? value.identity : value.name).trim(),
    ...(personRole ? {identityMode: value.mode} : {}),
    teacherName: role === "teacher" && existing ? value.identity : "",
    studentName: role === "student" && existing ? value.identity : "",
    ...(role === "student" && !existing ? {syllabusId: value.syllabusId, grade: value.grade, age: value.age === "" ? null : Number(value.age)} : {}),
  };
}

const text = (zh: string, en: string) => getLanguage() === "en" ? en : zh;

function NewStudentProfile({value, onChange, disabled}: {value: PersonIdentityDraft; onChange: (value: PersonIdentityDraft) => void; disabled: boolean}) {
  const {catalogue, loading, error, reload} = useAcademicCatalogue("student");
  return <>
    <StudentProfileFields catalogue={catalogue} value={value} onChange={profile => onChange({...value, ...profile})} disabled={disabled}/>
    {loading && !catalogue && <p className="account-person-notice" role="status">{text("正在加载课程体系…", "Loading syllabuses…")}</p>}
    {error && <div className="account-person-notice account-person-error" role="alert"><span>{t(error)}</span><Button type="button" size="sm" variant="outline" disabled={disabled || loading} onClick={() => void reload()}>{t("重试")}</Button></div>}
  </>;
}

export function PersonIdentityFields({role, value, onChange, teachers, students, canCreatePerson = true, disabled = false}: {
  role: string;
  value: PersonIdentityDraft;
  onChange: (value: PersonIdentityDraft) => void;
  teachers: string[];
  students: string[];
  canCreatePerson?: boolean;
  disabled?: boolean;
}) {
  const personRole = role === "student" || role === "teacher";
  const options = role === "teacher" ? teachers : students;
  const mode = canCreatePerson ? value.mode : "existing";
  const duplicate = personRole && mode === "new" && value.name.trim() ? options.find(name => studentNameKey(name) === studentNameKey(value.name)) : undefined;
  useEffect(() => {
    if (personRole && !canCreatePerson && value.mode !== "existing") onChange({...value, mode: "existing"});
  }, [personRole, canCreatePerson, value, onChange]);
  return <div className="account-person-fields">
    {personRole && <fieldset className="account-identity-mode" disabled={disabled}>
      <legend>{text(role === "student" ? "学生资料" : "老师资料", role === "student" ? "Student profile" : "Teacher profile")}</legend>
      <div className="account-identity-options">
        {canCreatePerson && <label><input type="radio" name={`person-identity-${role}`} checked={mode === "new"} onChange={() => onChange({...value, mode: "new", identity: ""})}/><span>{text(role === "student" ? "新增学生" : "新增老师", role === "student" ? "New student" : "New teacher")}</span></label>}
        <label><input type="radio" name={`person-identity-${role}`} checked={mode === "existing"} onChange={() => onChange({...value, mode: "existing"})}/><span>{text("关联已有资料", "Link existing profile")}</span></label>
      </div>
    </fieldset>}
    {personRole && mode === "existing" ? <label>{text(role === "student" ? "选择学生" : "选择老师", role === "student" ? "Student" : "Teacher")}<select required disabled={disabled || !options.length} value={value.identity} onChange={event => onChange({...value, identity: event.target.value})}><option value="">{t("请选择")}</option>{options.map(name => <option key={name} value={name}>{name}</option>)}</select>{!options.length && <small className="field-hint">{text("暂无可关联的资料", "No profiles available to link")}</small>}</label> : <div className="account-person-grid">
      <label className="account-person-name">{t("姓名")}<input required maxLength={80} autoComplete="off" disabled={disabled} value={value.name} onChange={event => onChange({...value, name: event.target.value})}/></label>
      {duplicate && <div className="account-person-notice" role="status"><span>{text("已有同名资料，请确认是否为同一人。", "A profile with this name already exists.")}</span><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange({...value, mode: "existing", identity: duplicate})}>{text("关联此资料", "Link this profile")}</Button></div>}
      {role === "student" && <NewStudentProfile value={value} onChange={onChange} disabled={disabled}/>}
    </div>}
  </div>;
}
