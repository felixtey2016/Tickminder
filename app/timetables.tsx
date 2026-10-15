"use client";
import {ClassSessionLabel} from "@/components/class-session-label";
import {sessionLessonTitle} from "@/lib/class-session-display";
import { useFilterPreference } from "@/lib/filter-preferences";
import { Button } from "@/components/ui/button";
import { getLanguage, t } from "@/lib/i18n";
import { timetableHours, timetableLessons, type TimetableLesson } from "@/lib/timetable";

type Props = {
  type: "student" | "teacher";
  lessons: TimetableLesson[];
  students: string[];
  teachers: string[];
  month: string;
  setMonth: (month: string) => void;
};

function date(iso: string) {
  return new Intl.DateTimeFormat(getLanguage() === "zh" ? "zh-CN" : "en-GB", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "short", day: "numeric", weekday: "short",
  }).format(new Date(iso));
}
function clock(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function Timetable({ type, lessons, students, teachers, month, setMonth }: Props) {
  const [name, setName] = useFilterPreference<string>(`timetable-${type}-name`, "");
  const [studentFilter, setStudentFilter] = useFilterPreference<string>(`timetable-${type}-student`, "");
  const names = type === "student" ? students : teachers;
  const teacherStudents = [...new Set(lessons.filter(l => l.teacherName === name).map(l => l.student))].sort();
  const rows = timetableLessons(lessons, month, type, name, type === "teacher" ? studentFilter : "");
  const completed = rows.filter(l => l.status === "completed" && l.actualStart && l.actualEnd);
  const hours = timetableHours(rows);
  return <section className="panel timetable-panel">
    <div className="section-head"><div><h2>{type === "student" ? t("学生时间表") : t("老师时间表")}</h2></div></div>
    <div className="timetable-filters">
      <label>{type === "student" ? t("学生姓名") : t("老师姓名")}<select value={name} onChange={e => { setName(e.target.value); setStudentFilter(""); }}><option value="">{t("请选择")}</option>{names.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label>{t("月份")}<input type="month" value={month} onChange={e => setMonth(e.target.value)}/></label>
      {type === "teacher" && <label>{t("学生姓名（可选）")}<select value={studentFilter} disabled={!name} onChange={e => setStudentFilter(e.target.value)}><option value="">{t("所有学生")}</option>{teacherStudents.map(n => <option key={n} value={n}>{n}</option>)}</select></label>}
    </div>
    <div className="timetable-actions"><Button type="button" size="sm" variant="outline" onClick={()=>{setName("");setStudentFilter("");}}>{t("重置筛选")}</Button></div>
    {name ? <><div className="timetable-summary"><strong>{rows.length} {t("堂课")}</strong><span>{t("课程总时长")} · {hours.toFixed(2)} h</span><span>{completed.length} {t("堂已完成")}</span></div>
      <p className="muted">{t("已完成按实际时长，其余按安排时长计算。")}</p>
      <div className="timetable-list">{rows.length ? rows.map(l => {
        const checkedIn = l.status === "completed" && Boolean(l.actualStart && l.actualEnd);
        return <article className="timetable-row" key={l.id}>
          <div className="timetable-date"><strong>{date(l.plannedStart)}</strong><span>{clock(l.plannedStart)}–{clock(l.plannedEnd)}</span></div>
          <div className="timetable-lesson"><ClassSessionLabel lesson={l}/><strong>{type === "student" ? l.subject : `${sessionLessonTitle(l)} · ${l.subject}`}</strong><small>{type === "student" ? l.teacherName : studentFilter ? l.subject : l.student}{l.status === "student_absent" ? ` · ${t("学生缺席")}` : l.status === "teacher_absent" ? ` · ${t("老师缺席")}` : ""}</small>{checkedIn && l.actualStart && l.actualEnd && (l.actualStart !== l.plannedStart || l.actualEnd !== l.plannedEnd) && <small>{t("实际时间")} {clock(l.actualStart)}–{clock(l.actualEnd)}</small>}</div>
          {checkedIn && <span className="timetable-check" aria-label={t("已记录出席")} title={t("已记录出席")}>√</span>}
        </article>;
      }) : <div className="empty">{t("所选月份没有课程")}</div>}</div></> : <div className="empty">{type === "student" ? t("请选择学生查看时间表") : t("请选择老师查看时间表")}</div>}
  </section>;
}
