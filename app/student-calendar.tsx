"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { getLanguage, t } from "@/lib/i18n";
import { activeLessonsOnDay, malaysiaDay, monthDays, nextScheduledLesson, shiftMonth } from "@/lib/student-calendar";
import { Button } from "@/components/ui/button";
import type { StudyBlock } from "./learning-portal";
import { OnlineLessonLink } from "./online-lesson-link";
import { LessonHistory } from "./lesson-history";

type Lesson = {
  id: string;
  subject: string;
  teacherName: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  status: string;
  attendanceKind?: string | null;
  onlineLink?: string | null;
};
type Proposal = { lessonId: string; status: string; proposedStart: string; proposedEnd: string };

const statusText: Record<string, string> = {
  scheduled: "已安排", completed: "已上课", student_absent: "学生缺席", teacher_absent: "老师缺席",
};
const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const dateLabel = (day: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(getLanguage() === "zh" ? "zh-CN" : "en-GB", { ...options, timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

export function StudentCalendar({ lessons, proposals, studyBlocks = [], onAddStudy, onEditStudy }: { lessons: Lesson[]; proposals: Proposal[]; studyBlocks?: StudyBlock[]; onAddStudy?: (day: string) => void; onEditStudy?: (block: StudyBlock) => void }) {
  const today = malaysiaDay(new Date().toISOString());
  const [selectedDay, setSelectedDay] = useState(today);
  const [visibleMonth, setVisibleMonth] = useState(today.slice(0, 7));
  const days = useMemo(() => monthDays(visibleMonth), [visibleMonth]);
  const byDay = useMemo(() => new Map(days.map(day => [day, activeLessonsOnDay(lessons, day)])), [days, lessons]);
  const selectedLessons = byDay.get(selectedDay) || activeLessonsOnDay(lessons, selectedDay);
  const pending = new Map(proposals.filter(proposal => proposal.status === "pending").map(proposal => [proposal.lessonId, proposal]));
  const nextLesson = nextScheduledLesson(lessons, new Date().toISOString());
  const monthLessonCount = lessons.filter(lesson => lesson.status !== "cancelled" && malaysiaDay(lesson.plannedStart).slice(0, 7) === visibleMonth).length;
  const studyOnDay = (day: string) => studyBlocks.filter(block => malaysiaDay(block.startsAt) === day);
  const selectedStudy = studyOnDay(selectedDay);

  function chooseDay(day: string) {
    setSelectedDay(day);
    setVisibleMonth(day.slice(0, 7));
  }
  function changeMonth(by: number) {
    const month = shiftMonth(visibleMonth, by);
    setVisibleMonth(month);
    setSelectedDay(`${month}-01`);
  }

  return <section className="student-calendar" aria-label={t("课程日历")}>
    <div className="student-calendar-intro">
      <div><p className="eyebrow">{t("我的日历")}</p><h2>{t("学习日历")}</h2><p>{t("点击日期查看补习课和个人学习安排。时间按马来西亚时间显示。")}</p><Button size="sm" variant="outline" onClick={() => onAddStudy?.(selectedDay)}>{t("新增学习安排")}</Button></div>
      {nextLesson && <button type="button" className="student-next-lesson" onClick={() => chooseDay(malaysiaDay(nextLesson.plannedStart))}>
        <CalendarDays size={20} aria-hidden="true"/><span><small>{t("下一堂课")}</small><strong>{nextLesson.subject} · {dateLabel(malaysiaDay(nextLesson.plannedStart), { month: "short", day: "numeric" })} {time(nextLesson.plannedStart)}</strong></span><ChevronRight size={18} aria-hidden="true"/>
      </button>}
    </div>
    <div className="student-calendar-layout">
      <div className="student-calendar-month">
        <div className="student-calendar-toolbar">
          <div><h3>{dateLabel(`${visibleMonth}-01`, { year: "numeric", month: "long" })}</h3><span>{monthLessonCount} {t("堂课")}</span></div>
          <div className="student-calendar-controls">
            <Button size="sm" variant="outline" onClick={() => chooseDay(today)}>{t("今天")}</Button>
            <Button size="icon" variant="outline" aria-label={t("上一月")} onClick={() => changeMonth(-1)}><ChevronLeft size={18}/></Button>
            <Button size="icon" variant="outline" aria-label={t("下一月")} onClick={() => changeMonth(1)}><ChevronRight size={18}/></Button>
          </div>
        </div>
        <div className="student-calendar-weekdays">{weekdays.map(day => <span key={day}>{t(day)}</span>)}</div>
        <div className="student-calendar-days">{days.map(day => {
          const dayLessons = byDay.get(day) || [];
          const dayStudy = studyOnDay(day);
          const isToday = day === today;
          const isSelected = day === selectedDay;
          return <button type="button" key={day} className={`student-calendar-day${day.slice(0, 7) !== visibleMonth ? " is-outside" : ""}${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}`} aria-label={`${day} · ${dayLessons.length} ${t("堂课")} · ${dayStudy.length} ${t("项学习安排")}`} aria-pressed={isSelected} onClick={() => chooseDay(day)}>
            <span className="student-calendar-day-number">{Number(day.slice(8))}</span>
            <span className="student-calendar-day-events">{dayLessons.slice(0, 1).map(lesson => <span className={`student-calendar-event event-${lesson.status}`} key={lesson.id}><i aria-hidden="true"/>{time(lesson.plannedStart)} {lesson.subject}</span>)}{dayStudy.slice(0, 1).map(block => <span className="student-calendar-event event-study" key={block.id}><i aria-hidden="true"/>{time(block.startsAt)} {block.title}</span>)}{dayLessons.length + dayStudy.length > 2 && <small>+{dayLessons.length + dayStudy.length - 2}</small>}</span>
            {(dayLessons.length > 0 || dayStudy.length > 0) && <span className="student-calendar-dots" aria-hidden="true">{dayLessons.slice(0, 2).map(lesson => <i key={lesson.id} className={`event-${lesson.status}`}/>)}{dayStudy.slice(0, 1).map(block => <i key={block.id} className="event-study"/>)}</span>}
          </button>;
        })}</div>
        <div className="student-calendar-legend"><span><i className="legend-scheduled"/>{t("补习课")}</span><span><i className="legend-completed"/>{t("已上课")}</span><span><i className="legend-study"/>{t("个人学习")}</span><span><i className="legend-absent"/>{t("缺席")}</span></div>
      </div>
      <aside className="student-day-panel" aria-live="polite">
        <div className="student-day-heading"><span>{dateLabel(selectedDay, { weekday: "long" })}</span><h3>{dateLabel(selectedDay, { month: "long", day: "numeric" })}</h3><p>{selectedLessons.length} {t("堂课")} · {selectedStudy.length} {t("项学习安排")}</p><Button size="sm" variant="outline" onClick={() => onAddStudy?.(selectedDay)}>{t("为这一天新增学习安排")}</Button></div>
        {selectedLessons.map(lesson => <article className={`student-day-lesson lesson-${lesson.status}`} key={lesson.id}>
          <div className="student-day-lesson-top"><strong>{lesson.subject}</strong><span>{t(lesson.attendanceKind === "early_dismissal" ? "提前结束课程" : statusText[lesson.status] || lesson.status)}</span></div>
          <p><Clock3 size={16} aria-hidden="true"/>{time(lesson.plannedStart)}–{time(lesson.plannedEnd)}</p>
          <p><span className="student-teacher-avatar" aria-hidden="true">{lesson.teacherName.charAt(0).toUpperCase()}</span>{lesson.teacherName}</p>
          <OnlineLessonLink href={lesson.onlineLink}/>
          {lesson.actualStart && lesson.actualEnd && <small>{t("实际时间")}：{time(lesson.actualStart)}–{time(lesson.actualEnd)}</small>}
          <LessonHistory lessonId={lesson.id}/>
          {pending.has(lesson.id) && <a className="student-lesson-pending" href="#student-reschedule">{t("待你确认改期")} · {dateLabel(malaysiaDay(pending.get(lesson.id)!.proposedStart), { month: "short", day: "numeric" })} {time(pending.get(lesson.id)!.proposedStart)} →</a>}
        </article>)}
        {selectedStudy.map(block => <article className="student-day-lesson lesson-study" key={block.id}><div className="student-day-lesson-top"><strong>{block.title}</strong><span>{t("个人学习")}</span></div><p><Clock3 size={16} aria-hidden="true"/>{time(block.startsAt)}–{time(block.endsAt)}</p>{block.subject && <p>{block.subject}</p>}{block.note && <small>{block.note}</small>}<Button size="sm" variant="outline" onClick={() => onEditStudy?.(block)}>{t("编辑学习安排")}</Button></article>)}
        {!selectedLessons.length && !selectedStudy.length && <div className="student-day-empty"><CalendarDays size={26} aria-hidden="true"/><p>{t("当日暂无课程或学习安排。")}</p></div>}
      </aside>
    </div>
  </section>;
}
