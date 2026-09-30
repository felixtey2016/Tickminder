"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, UploadCloud } from "lucide-react";
import { t } from "@/lib/i18n";
import { alertActionFailure, readApiJson, showActionToast } from "@/lib/action-feedback";
import { Button } from "@/components/ui/button";

export type Material = { id: string; title: string; description: string | null; fileId: string; filename: string; subject?: string; classroomId?: string | null; recipients?: Array<{ studentName: string; subject: string }> };
export type Homework = { id: string; title: string; subject: string; description: string; startsAt: string; dueAt: string; maxScore?: number | null; score?: number | null; scoredAt?: string | null; attachmentFileId: string | null; classroomId?: string | null; recipients?: string[]; scores?: Array<{ studentName: string; score: number | null; scoredAt: string | null }> };
export type Submission = { id: string; homeworkId: string; studentName?: string; fileId: string; filename: string; submittedAt: string; late: number | boolean };
export type StudyBlock = { id: string; title: string; subject: string | null; note: string | null; startsAt: string; endsAt: string; homeworkId: string | null };
export type LearningState = { materials: Material[]; homework: Homework[]; submissions: Submission[]; studyBlocks: StudyBlock[]; eligible: Array<{ student: string; subject: string }>; limits?: { pdfMaxBytes: number } };
export type LearningMutate = (body: Record<string, unknown>) => Promise<boolean>;

const malaysiaLocal = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(" ", "T");
const readable = (iso: string) => malaysiaLocal(iso).replace("T", " ");
const maxPdfLabel = (learning: LearningState) => `${Math.round((learning.limits?.pdfMaxBytes || 10 * 1024 * 1024) / 1048576)} MB`;
const pdfLimit = (learning: LearningState) => learning.limits?.pdfMaxBytes || 10 * 1024 * 1024;

export async function uploadPdf(file: File, kind: "material" | "homework" | "submission", homeworkId?: string, maxBytes = 10 * 1024 * 1024) {
  if (file.size > maxBytes) throw new Error(`${t("PDF 超过单份大小限制")} (${(file.size / 1048576).toFixed(1)} MB > ${(maxBytes / 1048576).toFixed(0)} MB)`);
  const form = new FormData();
  form.set("file", file);
  form.set("kind", kind);
  if (homeworkId) form.set("homeworkId", homeworkId);
  const response = await fetch("/api/files", { method: "POST", body: form, cache: "no-store" });
  if (response.status === 413) throw new Error(t("PDF 超过单份大小限制"));
  const result = await readApiJson<{ id?: string; error?: string }>(response);
  if (!response.ok || !result.id) throw new Error(result.error || (response.status === 413 ? t("PDF 超过单份大小限制") : t("PDF 上传失败，请重试")));
  showActionToast("success", kind === "submission" ? "PDF 已上传，尚未提交功课" : "PDF 已上传，尚未发布给学生");
  return result.id;
}

function FileLinks({ fileId }: { fileId: string }) {
  return <span className="learning-file-actions"><a href={`/api/files/${encodeURIComponent(fileId)}`} target="_blank" rel="noopener noreferrer"><FileText size={16}/>{t("打开 PDF")}</a><a href={`/api/files/${encodeURIComponent(fileId)}?download=1`}><Download size={16}/>{t("下载")}</a></span>;
}

function StudentChecks({ eligible, subject, selected, onChange }: { eligible: LearningState["eligible"]; subject: string; selected: string[]; onChange: (next: string[]) => void }) {
  const students = eligible.filter(p => p.subject === subject).map(p => p.student);
  return <fieldset className="learning-checks"><legend>{t("分配给学生")}</legend>{students.length ? students.map(student => <label key={student}><input type="checkbox" checked={selected.includes(student)} onChange={e => onChange(e.target.checked ? [...selected, student] : selected.filter(x => x !== student))}/>{student}</label>) : <p className="muted">{t("请选择你负责的科目")}</p>}</fieldset>;
}

function ScoreEntry({ item, student, mutate, busy }: { item: Homework; student: string; mutate: LearningMutate; busy: boolean }) {
  const saved = item.scores?.find(row => row.studentName === student)?.score;
  const [score, setScore] = useState<string>(saved == null ? "" : String(saved));
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  useEffect(() => {
    if (!savedMessage) return;
    const timer = window.setTimeout(() => setSavedMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [savedMessage]);
  return <form className="learning-score-entry" onSubmit={async event => {
    event.preventDefault(); setSaving(true); setSavedMessage("");
    try { if (await mutate({ action: "setHomeworkScore", homeworkId: item.id, studentName: student, score })) setSavedMessage(t("分数已保存")); }
    finally { setSaving(false); }
  }}>
    <label>{t("得分")}<input type="number" min="0" max={item.maxScore ?? undefined} step="0.01" required value={score} onChange={event => { setScore(event.target.value); setSavedMessage(""); }}/></label>
    <span>/ {item.maxScore}</span><Button size="sm" variant="outline" disabled={busy || saving || score === ""}>{t("保存分数")}</Button>
    {savedMessage && <span className="learning-success-toast" role="status">{savedMessage}</span>}
  </form>;
}

import { DeleteButton } from "./directory-tools";
import { BulkDeleteTool } from "./bulk-delete";
export function TeacherLearning({ learning, mutate, busy, view, classroom }: { learning: LearningState; mutate: LearningMutate; busy: boolean; view: "materials" | "homework"; classroom?: { id: string; subject: string; members: string[] } }) {
  const subjects = classroom ? [classroom.subject] : [...new Set(learning.eligible.map(p => p.subject))].sort();
  const [materialId, setMaterialId] = useState("");
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialDescription, setMaterialDescription] = useState("");
  const [materialSubject, setMaterialSubject] = useState(classroom?.subject || "");
  const [materialStudents, setMaterialStudents] = useState<string[]>(classroom?.members || []);
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [materialUploaded, setMaterialUploaded] = useState("");
  const [homeworkTitle, setHomeworkTitle] = useState("");
  const [homeworkSubject, setHomeworkSubject] = useState(classroom?.subject || "");
  const [homeworkDescription, setHomeworkDescription] = useState("");
  const [homeworkStudents, setHomeworkStudents] = useState<string[]>(classroom?.members || []);
  const [homeworkStart, setHomeworkStart] = useState("");
  const [homeworkDue, setHomeworkDue] = useState("");
  const [homeworkMaterial, setHomeworkMaterial] = useState("");
  const [homeworkFile, setHomeworkFile] = useState<File | null>(null);
  const [homeworkUploaded, setHomeworkUploaded] = useState("");
  const [scoreEnabled, setScoreEnabled] = useState(false);
  const [maxScore, setMaxScore] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const materialInputKey = useState(0);
  const homeworkInputKey = useState(0);

  async function saveMaterial(event: React.FormEvent) {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; setWorking(true); setError("");
    try {
      const fileId = materialId ? learning.materials.find(m => m.id === materialId)?.fileId || "" : materialUploaded || (materialFile ? await uploadPdf(materialFile, "material", undefined, pdfLimit(learning)) : "");
      if (!fileId) throw new Error(t("请选择 PDF 文件"));
      if (!materialId) setMaterialUploaded(fileId);
      const ok = await mutate({ action: "saveMaterial", id: materialId, title: materialTitle, description: materialDescription, subject: materialSubject, students: materialStudents, fileId, classroomId: classroom?.id });
      if (ok) { form.reset(); setMaterialId(""); setMaterialTitle(""); setMaterialDescription(""); setMaterialSubject(classroom?.subject || ""); setMaterialStudents(classroom?.members || []); setMaterialFile(null); setMaterialUploaded(""); materialInputKey[1](x => x + 1); }
    } catch (caught) { setError(alertActionFailure(caught)); }
    finally { setWorking(false); }
  }
  async function publishHomework(event: React.FormEvent) {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; setWorking(true); setError("");
    try {
      const fileId = homeworkMaterial ? "" : homeworkUploaded || (homeworkFile ? await uploadPdf(homeworkFile, "homework", undefined, pdfLimit(learning)) : "");
      if (fileId) setHomeworkUploaded(fileId);
      const ok = await mutate({ action: "publishHomework", title: homeworkTitle, subject: homeworkSubject, description: homeworkDescription, students: homeworkStudents, startsAt: homeworkStart, dueAt: homeworkDue, materialId: homeworkMaterial, fileId, scoreEnabled, maxScore, classroomId: classroom?.id });
      if (ok) { form.reset(); setHomeworkTitle(""); setHomeworkSubject(classroom?.subject || ""); setHomeworkDescription(""); setHomeworkStudents(classroom?.members || []); setHomeworkStart(""); setHomeworkDue(""); setHomeworkMaterial(""); setHomeworkFile(null); setHomeworkUploaded(""); setScoreEnabled(false); setMaxScore(""); homeworkInputKey[1](x => x + 1); }
    } catch (caught) { setError(alertActionFailure(caught)); }
    finally { setWorking(false); }
  }
  function editMaterial(material: Material) {
    setMaterialId(material.id); setMaterialTitle(material.title); setMaterialDescription(material.description || "");
    setMaterialSubject(material.recipients?.[0]?.subject || ""); setMaterialStudents(material.recipients?.map(r => r.studentName) || []);
    document.getElementById("teacher-material-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const disabled = busy || working;
  return <div className="learning-teacher learning-single-view">
    {error && <p className="notice" role="alert">{error}</p>}
    <section className="panel" id="teacher-material-form" hidden={view !== "materials"}><p className="eyebrow">{t("PDF 教学资料")}</p><h2>{materialId ? t("编辑教学资料") : t("上传教学资料")}</h2>
      <form className="learning-form" onSubmit={saveMaterial}>
        <label>{t("资料标题")}<input required maxLength={120} value={materialTitle} onChange={e => setMaterialTitle(e.target.value)}/></label>
        <label>{t("说明（可选）")}<textarea maxLength={2000} value={materialDescription} onChange={e => setMaterialDescription(e.target.value)}/></label>
        <label>{t("科目")}<select required disabled={Boolean(classroom)} value={materialSubject} onChange={e => { setMaterialSubject(e.target.value); setMaterialStudents([]); }}><option value="">{t("请选择")}</option>{subjects.map(subject => <option key={subject}>{subject}</option>)}</select></label>
        {classroom ? <p className="muted">{t("发布给班级所有学生")} · {classroom.members.length}</p> : <StudentChecks eligible={learning.eligible} subject={materialSubject} selected={materialStudents} onChange={setMaterialStudents}/>}
        {!materialId && <label>{t("PDF 文件")} · {t("最多")} {maxPdfLabel(learning)}<input key={materialInputKey[0]} type="file" accept="application/pdf,.pdf" required={!materialUploaded} onChange={e => { setMaterialFile(e.target.files?.[0] || null); setMaterialUploaded(""); }}/></label>}
        {materialUploaded && <p className="muted">{t("PDF 已上传，保存资料后才会分配给学生")}</p>}
        <Button disabled={disabled || !materialStudents.length || (!materialId && !materialFile && !materialUploaded)}><UploadCloud size={17}/>{materialId ? t("保存资料") : t("上传并分配")}</Button>
        {materialId && <Button type="button" variant="outline" onClick={() => { setMaterialId(""); setMaterialTitle(""); setMaterialDescription(""); setMaterialStudents(classroom?.members || []); setMaterialSubject(classroom?.subject || ""); }}>{t("取消编辑")}</Button>}
      </form>
      <div className="learning-list">{learning.materials.map(material => <article className="learning-card" key={material.id}><div><strong>{material.title}</strong><small>{material.recipients?.map(r => r.studentName).join("、")} · {material.recipients?.[0]?.subject}</small>{material.description && <p>{material.description}</p>}<FileLinks fileId={material.fileId}/></div><div className="learning-card-actions"><Button size="sm" variant="outline" onClick={() => editMaterial(material)}>{t("编辑")}</Button><Button size="sm" variant="outline" disabled={disabled} onClick={() => { if (window.confirm(t("确定删除这份教学资料？"))) void mutate({ action: "deleteMaterial", id: material.id }); }}>{t("删除")}</Button></div></article>)}{!learning.materials.length && <p className="muted">{t("尚未上传教学资料")}</p>}</div>
    </section>
    <section className="panel" hidden={view !== "homework"}><p className="eyebrow">{t("功课")}</p><h2>{t("布置功课")}</h2>
      <form className="learning-form" onSubmit={publishHomework}>
        <label>{t("功课标题")}<input required maxLength={120} value={homeworkTitle} onChange={e => setHomeworkTitle(e.target.value)}/></label>
        <label>{t("科目")}<select required disabled={Boolean(classroom)} value={homeworkSubject} onChange={e => { setHomeworkSubject(e.target.value); setHomeworkStudents([]); setHomeworkMaterial(""); }}><option value="">{t("请选择")}</option>{subjects.map(subject => <option key={subject}>{subject}</option>)}</select></label>
        {classroom ? <p className="muted">{t("发布给班级所有学生")} · {classroom.members.length}</p> : <StudentChecks eligible={learning.eligible} subject={homeworkSubject} selected={homeworkStudents} onChange={setHomeworkStudents}/>}
        <label>{t("完成要求")}<textarea maxLength={4000} value={homeworkDescription} onChange={e => setHomeworkDescription(e.target.value)} placeholder={t("例如：教材页码、题号或完成要求")}/></label>
        <label className="learning-score-toggle"><input type="checkbox" checked={scoreEnabled} onChange={event => { setScoreEnabled(event.target.checked); if (!event.target.checked) setMaxScore(""); }}/>{t("记录分数（适用于历年试题等）")}</label>
        {scoreEnabled && <label>{t("满分")}<input required type="number" min="0.01" max="10000" step="0.01" value={maxScore} onChange={event => setMaxScore(event.target.value)}/></label>}
        <div className="form-pair"><label>{t("开始日期与时间")}<input type="datetime-local" required value={homeworkStart} onChange={e => { setHomeworkStart(e.target.value); if (!homeworkDue || homeworkDue < e.target.value) setHomeworkDue(e.target.value); }}/></label><label>{t("截止日期与时间")}<input type="datetime-local" required min={homeworkStart} value={homeworkDue} onChange={e => setHomeworkDue(e.target.value)}/></label></div>
        <label>{t("已有教学资料（可选）")}<select value={homeworkMaterial} onChange={e => { setHomeworkMaterial(e.target.value); if (e.target.value) { setHomeworkFile(null); setHomeworkUploaded(""); homeworkInputKey[1](x => x + 1); } }}><option value="">{t("不附加已有资料")}</option>{learning.materials.filter(m => m.recipients?.some(r => r.subject === homeworkSubject) && (m.classroomId || null) === (classroom?.id || null)).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
        {!homeworkMaterial && <label>{t("或上传新 PDF（可选）")} · {t("最多")} {maxPdfLabel(learning)}<input key={homeworkInputKey[0]} type="file" accept="application/pdf,.pdf" onChange={e => { setHomeworkFile(e.target.files?.[0] || null); setHomeworkUploaded(""); }}/></label>}
        {homeworkUploaded && <p className="muted">{t("PDF 已上传，发布功课后学生才会看到")}</p>}
        <Button disabled={disabled || !homeworkStudents.length}>{t("发布功课")}</Button>
      </form>
      <BulkDeleteTool kind="homework" records={learning.homework.map(item=>({id:item.id,label:item.title}))} mutate={mutate} busy={disabled}/><div className="learning-list">{learning.homework.map(item => <article className="learning-card" key={item.id}><DeleteButton kind="homework" id={item.id} mutate={mutate} busy={disabled} message="永久删除这项功课及所有提交和分数？共用 PDF 会保留，操作无法恢复。"/><div><strong>{item.title}</strong><small>{item.subject} · {readable(item.startsAt)} → {readable(item.dueAt)}{item.maxScore != null ? ` · ${t("满分")} ${item.maxScore}` : ""}</small><p>{item.description}</p>{item.attachmentFileId && <FileLinks fileId={item.attachmentFileId}/>}</div><div className="learning-recipient-status">{item.recipients?.map(student => { const history = learning.submissions.filter(s => s.homeworkId === item.id && s.studentName === student); const latest = history[0]; const savedScore = item.scores?.find(row => row.studentName === student)?.score; return <div key={student}><strong>{student}</strong><span>{latest ? `${t("已提交")} · ${readable(latest.submittedAt)}${latest.late ? ` · ${t("迟交")}` : ""}` : t("未提交")}</span>{latest && <FileLinks fileId={latest.fileId}/ >}{savedScore != null && <span>{t("得分")}: {savedScore} / {item.maxScore}</span>}{item.maxScore != null && latest && <ScoreEntry key={student} item={item} student={student} mutate={mutate} busy={disabled}/ >}{item.maxScore != null && !latest && <small>{t("学生提交后才可以填写分数")}</small>}{history.length > 1 && <details><summary>{t("查看提交记录")}</summary>{history.map(s => <p key={s.id}>{readable(s.submittedAt)}{s.late ? ` · ${t("迟交")}` : ""} <FileLinks fileId={s.fileId}/></p>)}</details>}</div>; })}</div></article>)}{!learning.homework.length && <p className="muted">{t("尚未布置功课")}</p>}</div>
    </section>
  </div>;
}

function StudentHomeworkCard({ item, submissions, mutate, busy, onPlan, maxLabel, maxBytes }: { item: Homework; submissions: Submission[]; mutate: LearningMutate; busy: boolean; onPlan: (item: Homework) => void; maxLabel: string; maxBytes: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadedId, setUploadedId] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const [dragging, setDragging] = useState(false);
  const submissionInFlight = useRef(false);
  const [clock, setClock] = useState(() => new Date().toISOString());
  useEffect(() => { const timer = window.setInterval(() => setClock(new Date().toISOString()), 30_000); return () => window.clearInterval(timer); }, []);
  const latest = submissions[0];
  const now = clock;
  const notStarted = now < item.startsAt;
  const closed = now > item.dueAt && Boolean(latest);
  function selectFile(next: File | null) {
    if (next && next.type !== "application/pdf") { setFile(null); setUploadedId(""); setError(alertActionFailure(new Error("请选择 PDF 文件"))); setInputKey(x => x + 1); return; }
    if (next && next.size > maxBytes) { setFile(null); setUploadedId(""); setError(alertActionFailure(new Error(`${t("PDF 超过单份大小限制")} (${(next.size / 1048576).toFixed(1)} MB > ${(maxBytes / 1048576).toFixed(0)} MB)`))); setInputKey(x => x + 1); return; }
    setFile(next); setUploadedId(""); setSuccess(""); setError("");
  }
  async function submit() {
    if (submissionInFlight.current) return;
    if (!file) { setError(alertActionFailure(new Error("请先选择 PDF 文件"))); return; }
    submissionInFlight.current = true;
    setWorking(true); setError("");
    try {
      const fileId = uploadedId || await uploadPdf(file, "submission", item.id, maxBytes);
      setUploadedId(fileId);
      const ok = await mutate({ action: "submitHomework", homeworkId: item.id, fileId });
      if (ok) { setSuccess(`${file.name} · ${readable(new Date().toISOString())}`); setUploadedId(""); setFile(null); setInputKey(x => x + 1); }
    } catch (caught) { setError(alertActionFailure(caught)); }
    finally { submissionInFlight.current = false; setWorking(false); }
  }
  return <details className="learning-card student-homework-card"><summary><strong>{item.title}</strong><small>{item.subject} · {t("截止")}: {readable(item.dueAt)}</small><span>{latest ? `${t("已提交")}${latest.late ? ` · ${t("迟交")}` : ""}` : notStarted ? t("尚未开始") : now > item.dueAt ? t("可迟交") : t("待提交")}</span></summary>
    <div className="learning-card-detail"><p>{item.description || t("暂无补充说明")}</p><p>{t("开始")}: {readable(item.startsAt)}<br/>{t("截止")}: {readable(item.dueAt)}{item.maxScore != null && <><br/>{t("满分")}: {item.maxScore}{item.score != null && <> · {t("得分")}: {item.score}</>}</>}</p>{item.attachmentFileId && <div><strong>{t("老师提供的 PDF")}</strong><FileLinks fileId={item.attachmentFileId}/></div>}
      <Button size="sm" variant="outline" onClick={() => onPlan(item)}>{t("安排学习时间")}</Button>
      {latest && <div className="learning-submission-success"><strong>{t("提交成功")}</strong><span>{latest.filename} · {readable(latest.submittedAt)}{latest.late ? ` · ${t("迟交")}` : ""}</span><FileLinks fileId={latest.fileId}/></div>}
      {success && <p role="status" className="learning-submission-success">{t("提交成功")} · {success}</p>}
      {error && <p role="alert" className="notice">{error}</p>}
      {!closed && <div className="learning-submit"><p className="muted">{t("选择 PDF 后点击提交功课；选择文件本身不会提交。")}</p><div className={`learning-dropzone${dragging ? " dragging" : ""}`} onDragOver={event => { event.preventDefault(); if (!notStarted && !working && !busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!notStarted && !working && !busy) selectFile(event.dataTransfer.files?.[0] || null); }}><label>{t("选择一份 PDF")} · {t("最多")} {maxLabel}<input key={inputKey} type="file" accept="application/pdf,.pdf" disabled={notStarted || working || busy} onChange={e => selectFile(e.target.files?.[0] || null)}/></label><p className="muted">{file ? `${t("已选择")}: ${file.name}` : t("支持拖放 PDF 文件")}</p></div><div className="learning-file-actions"><Button size="sm" disabled={notStarted || working || busy} onClick={submit}>{working ? t("正在提交…") : t("提交功课")}</Button></div>{notStarted && <p className="muted">{t("开始时间到达后开放提交")}</p>}</div>}
      {closed && <p className="muted">{t("截止后不能替换已提交的功课")}</p>}
      {submissions.length > 1 && <details><summary>{t("查看提交记录")}</summary>{submissions.map(s => <p key={s.id}>{readable(s.submittedAt)}{s.late ? ` · ${t("迟交")}` : ""} <FileLinks fileId={s.fileId}/></p>)}</details>}
    </div>
  </details>;
}

export function StudentLearning({ learning, mutate, busy, onPlan, view }: { learning: LearningState; mutate: LearningMutate; busy: boolean; onPlan: (item: Homework) => void; view: "homework" | "materials" }) {
  const subjects = useMemo(() => [...new Set(learning.materials.map(m => m.subject).filter(Boolean))], [learning.materials]);
  const [filter, setFilter] = useState("");
  return <div className="student-learning">
    <section className="panel" hidden={view !== "homework"}><p className="eyebrow">{t("功课")}</p><h2>{t("我的功课")}</h2><div className="learning-list">{learning.homework.map(item => <StudentHomeworkCard key={item.id} item={item} submissions={learning.submissions.filter(s => s.homeworkId === item.id)} mutate={mutate} busy={busy} onPlan={onPlan} maxLabel={maxPdfLabel(learning)} maxBytes={pdfLimit(learning)}/>)}{!learning.homework.length && <p className="muted">{t("目前没有功课")}</p>}</div></section>
    <section className="panel" hidden={view !== "materials"}><p className="eyebrow">{t("PDF 教学资料")}</p><h2>{t("我的教学资料")}</h2><label className="learning-filter">{t("按科目查找")}<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">{t("全部科目")}</option>{subjects.map(subject => <option key={subject}>{subject}</option>)}</select></label><div className="learning-list">{learning.materials.filter(item => !filter || item.subject === filter).map(item => <article className="learning-card" key={item.id}><strong>{item.title}</strong><small>{item.subject}</small>{item.description && <p>{item.description}</p>}<FileLinks fileId={item.fileId}/></article>)}{!learning.materials.length && <p className="muted">{t("目前没有教学资料")}</p>}</div></section>
  </div>;
}
