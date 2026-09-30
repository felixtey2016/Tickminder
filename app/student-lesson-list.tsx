"use client";
import { getLanguage, t } from "@/lib/i18n";
import { malaysiaDay } from "@/lib/student-calendar";
import { OnlineLessonLink } from "./online-lesson-link";
import { Button } from "@/components/ui/button";
import type { RescheduleProposal } from "./reschedule-panel";
import { LessonHistory } from "./lesson-history";

type Lesson = {
  id: string; subject: string; teacherName: string; plannedStart: string; plannedEnd: string;
  status: string; actualStart: string | null; actualEnd: string | null;
  attendanceKind?: string | null; onlineLink?: string | null;
};
const statusText: Record<string, string> = { scheduled: "已安排", completed: "已上课", student_absent: "学生缺席", teacher_absent: "老师缺席" };
const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

export function StudentLessonList({ lessons, proposals = [], onRequestReschedule, busy }: { lessons: Lesson[]; proposals?: RescheduleProposal[]; onRequestReschedule?: (id: string) => void; busy?: boolean }) {
  const today = malaysiaDay(new Date().toISOString());
  const sorted = lessons.filter(lesson => lesson.status !== "cancelled").slice().sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
  const sections = [
    { title: "今天的课", rows: sorted.filter(lesson => malaysiaDay(lesson.plannedStart) === today) },
    { title: "接下来的课", rows: sorted.filter(lesson => malaysiaDay(lesson.plannedStart) > today) },
    { title: "过往课程", rows: sorted.filter(lesson => malaysiaDay(lesson.plannedStart) < today).reverse() },
  ];
  const date = (iso: string) => new Intl.DateTimeFormat(getLanguage() === "zh" ? "zh-CN" : "en-GB", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(iso));
  return <div className="student-lesson-list student-portal">{sections.map(section => <section className="panel" key={section.title}>
    <div className="section-head"><h2>{t(section.title)}</h2><span>{section.rows.length} {t("堂课")}</span></div>
    {section.rows.length ? section.rows.map(lesson => <article className="portal-card" key={lesson.id}>
      <div><strong>{lesson.subject}</strong><span>{date(lesson.plannedStart)} · {time(lesson.plannedStart)}–{time(lesson.plannedEnd)}</span><span>{t("负责老师")}：{lesson.teacherName}</span>
        <span>{t(lesson.attendanceKind === "early_dismissal" ? "提前结束课程" : statusText[lesson.status] || lesson.status)}</span>
        {lesson.actualStart && lesson.actualEnd && <small>{t("实际时间")}：{time(lesson.actualStart)}–{time(lesson.actualEnd)}</small>}
        <OnlineLessonLink href={lesson.onlineLink}/>
      </div>
      {lesson.status === "scheduled" && (proposals.some(p => p.lessonId === lesson.id && p.status === "pending") ? <small>{t(proposals.find(p => p.lessonId === lesson.id && p.status === "pending")?.requestedRole === "student" ? "等待老师确认" : "待你确认改期")}</small> : <Button size="sm" variant="outline" disabled={busy} onClick={() => onRequestReschedule?.(lesson.id)}>{t("申请改期")}</Button>)}
      <LessonHistory lessonId={lesson.id}/>
    </article>) : <p className="muted">{t("没有课程。")}</p>}
  </section>)}</div>;
}
