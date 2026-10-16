"use client";
import { useAdminAction } from "./admin-permission-context";

import { useState } from "react";
import { LegacyOrganizer,useTeachingClasses } from "./folder-workspace";
import { FilterPanel } from "@/components/filter-panel";
import { PageState } from "@/components/page-state";
import { Button } from "@/components/ui/button";
import { getLanguage, t } from "@/lib/i18n";
import { FileLinks, type Homework, type LearningState, type Material } from "./learning-portal";

import {HomeworkReview} from "./homework-review";
import { ContentActions, SubmissionVersion } from "./learning-content-actions";

const dateFormatters = {
  zh: new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
  en: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
};
const readable = (iso: string) => dateFormatters[getLanguage()].format(new Date(iso));
const subjectOf = (item: Material | Homework) => "subject" in item && item.subject || (item as Material).recipients?.[0]?.subject || "";

export function AdminLearning({ learning, view, inClassroom = false,onChanged }: {
  learning: LearningState; view: "materials" | "homework"; inClassroom?: boolean;onChanged?:()=>Promise<unknown>|void;
}) {
  const can=useAdminAction();
  const {classes,error:classError,load:loadClasses}=useTeachingClasses(!inClassroom&&can("folders.placeContent"));
  const [teacher, setTeacher] = useState("");
  const [subject, setSubject] = useState("");
  const records = view === "materials" ? learning.materials : learning.homework;
  const teachers = [...new Map(records.filter(item => item.ownerId).map(item => [item.ownerId!, item.teacherName || t("老师")])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const subjects = [...new Set(records.map(subjectOf).filter(Boolean))].sort();
  const matches = (item: Material | Homework) => (!teacher || item.ownerId === teacher) && (!subject || subjectOf(item) === subject);
  const materials = learning.materials.filter(matches);
  const homework = learning.homework.filter(matches);
  const visibleCount = view === "materials" ? materials.length : homework.length;
  const filtered = Boolean(teacher || subject);

  return <section className={`panel learning-admin${inClassroom ? " learning-content-surface" : ""}`}>
    {!inClassroom && classError && records.some(item=>!item.classroomId) && <div className="notice teaching-notice-actions" role="alert"><span>{classError}</span><Button variant="outline" onClick={()=>void loadClasses()}>{t("重试")}</Button></div>}
    {!inClassroom && records.length > 0 && <FilterPanel active={filtered}>
      <label>{t("老师")}<select value={teacher} onChange={event => setTeacher(event.target.value)}><option value="">{t("所有老师")}</option>{teachers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>{t("科目")}<select value={subject} onChange={event => setSubject(event.target.value)}><option value="">{t("全部科目")}</option>{subjects.map(name => <option key={name}>{name}</option>)}</select></label>
      <Button variant="outline" type="button" onClick={() => { setTeacher(""); setSubject(""); }}>{t("重置筛选")}</Button>
    </FilterPanel>}
    <div className="learning-list">
      {view === "materials" && materials.map(item => <article className="learning-card" key={item.id}>
        <div className="learning-record-content">{!inClassroom && !item.classroomId && <div className="legacy-label"><span>{t("待整理")}</span><LegacyOrganizer item={item} kind="material" classes={classes} onChanged={()=>onChanged?.()}/></div>}<header className="learning-record-head"><strong>{item.title}</strong><small>{item.teacherName} · {subjectOf(item)}{item.classroomTitle ? ` · ${item.classroomTitle}` : ""}</small></header>
          {item.description && <p>{item.description}</p>}
          <p><span className="muted">{t("分配给学生")} · </span>{item.recipients?.map(recipient => recipient.studentName).join("、")}</p>
        </div>
        <div className="learning-action-row"><FileLinks fileId={item.fileId}/><ContentActions kind="material" id={item.id}/></div>
      </article>)}
      {view === "homework" && homework.map(item => <article className="learning-card" key={item.id}>
        <div className="learning-record-content">{!inClassroom && !item.classroomId && <div className="legacy-label"><span>{t("待整理")}</span><LegacyOrganizer item={item} kind="homework" classes={classes} onChanged={()=>onChanged?.()}/></div>}<header className="learning-record-head"><strong>{item.title}</strong><small>{item.teacherName} · {item.subject}{item.classroomTitle ? ` · ${item.classroomTitle}` : ""}</small></header>
          <div className="learning-record-meta"><small>{t("开始")} · {readable(item.startsAt)}</small><small>{t("截止")} · {readable(item.dueAt)}</small></div>
          {item.description && <p>{item.description}</p>}
          {item.maxScore != null && <span>{t("满分")} · {item.maxScore}</span>}
        </div>
        <div className="learning-action-row">{item.attachmentFileId && <FileLinks fileId={item.attachmentFileId}/>}<ContentActions kind="homework" id={item.id}/></div>
        <div className="learning-recipient-status">{item.recipients?.map(student => {
          const history = learning.submissions.filter(submission => submission.homeworkId === item.id && submission.studentName === student).sort((a, b) => (b.attempt||0)-(a.attempt||0)||b.submittedAt.localeCompare(a.submittedAt)||b.id.localeCompare(a.id));
          const latest = history[0];
          const score = item.scores?.find(row => row.studentName === student)?.score;
          return <div className="learning-recipient-row" key={student}><header className="learning-recipient-head"><strong>{student}</strong><span>{latest ? `${t("已提交")} · ${readable(latest.submittedAt)}${latest.late ? ` · ${t("迟交")}` : ""}` : t("未提交")}</span></header>
            {latest && <><FileLinks fileId={latest.fileId}/><SubmissionVersion revision={latest.homeworkRevision} dueAt={latest.dueAtSubmission}/></>}
            {score != null && <span>{t("得分")} · {score} / {item.maxScore}</span>}
            {latest&&<HomeworkReview homeworkId={item.id} studentName={student}/ >}{history.length > 1 && <details><summary>{t("查看提交记录")} ({history.length})</summary>{history.map(submission => <div className="learning-admin-submission" key={submission.id}><small>{readable(submission.submittedAt)}{submission.late ? ` · ${t("迟交")}` : ""}</small><FileLinks fileId={submission.fileId}/><SubmissionVersion revision={submission.homeworkRevision} dueAt={submission.dueAtSubmission}/></div>)}</details>}
          </div>;
        })}</div>
      </article>)}
      {!visibleCount && <PageState kind="empty" title={filtered ? "没有符合筛选条件的记录" : view === "materials" ? "暂无已发布的教学资料" : "暂无已发布的功课"} action={filtered ? "重置筛选" : undefined} onAction={() => { setTeacher(""); setSubject(""); }}/ >}
    </div>
  </section>;
}
