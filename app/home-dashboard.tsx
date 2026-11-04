"use client";

import {displayFormatter} from '@/lib/display-preferences';
import { useEffect, useState } from "react";
import { BookOpen, CalendarDays, ChevronRight, ClipboardCheck, Clock3, LibraryBig, NotebookPen, type LucideIcon } from "lucide-react";
import { sessionLessonTitle } from "@/lib/class-session-display";
import { getLanguage, t, registerTranslations } from "@/lib/i18n";
import { canAdminAction, canAdminView } from "@/lib/admin-permission-client";
import type { HomeLesson, HomeSummary } from "@/lib/home-summary-types";
import {useHomeSummary} from '@/lib/use-home-summary';
import { Button } from "@/components/ui/button";
import { Mascot } from "@/components/page-state";
import { useAdminPermissionAccount } from "./admin-permission-context";
import { OnlineLessonLink } from "./online-lesson-link";
import {TaskInbox} from './task-inbox';
import {QuizHomeProgress} from './quiz-home-progress';
import "./home-compact.css";

registerTranslations({}, {
  "今日安排": "Today's lessons",
  "今天没有课程": "No lessons today",
  "查看全部课程": "View all lessons",
  "待办与学习": "Tasks & study",
  "待办与教学": "Tasks & teaching",
  "暂无学习计划": "No study plan scheduled",
  "已安排": "Scheduled",
  "今天也一起进步一点点。": "Let's make a little progress today.",
  "常用功能": "Quick access",
  "打开功课": "Open homework",
  "记录出勤": "Record attendance",
  "处理出席": "Review attendance",
  "查看计划": "View plan",
});

type Role = "admin" | "teacher" | "student";
type Lesson = HomeLesson;
type HomeCard = { label: string; value: string; detail?: string; Icon: LucideIcon; destination: string; isPlan?: boolean };
const malaysiaDay = (iso: string) => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(iso));
const lessonTime = (iso: string) => displayFormatter(getLanguage() === "zh" ? "zh-CN" : "en-GB",{
  timeZone: "Asia/Kuala_Lumpur", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
}).format(new Date(iso));
const clockTime = (iso: string) => displayFormatter("en-GB",{
  timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false,
}).format(new Date(iso));

function LessonPreview({ lesson, role, dated = false }: { lesson: Lesson; role: Role; dated?: boolean }) {
  const status = ({ completed: "已上课", scheduled: "已安排", student_absent: "学生缺席", teacher_absent: "老师缺席", cancelled: "已取消" } as Record<string, string>)[lesson.status];
  const people = role === "student" ? lesson.teacherName : [sessionLessonTitle(lesson), role === "admin" ? lesson.teacherName : ""].filter(Boolean).join(" · ");
  return <article className="home-compact-lesson">
    <div className="home-compact-lesson-copy">
      <p className="home-compact-time"><time dateTime={lesson.plannedStart}>{dated ? lessonTime(lesson.plannedStart) : clockTime(lesson.plannedStart)}</time>–<time dateTime={lesson.plannedEnd}>{clockTime(lesson.plannedEnd)}</time></p>
      <div className="home-compact-lesson-top"><strong>{lesson.subject}</strong>{status && <span className={"home-compact-status " + (lesson.status === "completed" ? "is-complete" : "")}>{t(status)}</span>}</div>
      {people && <p className="home-compact-people">{people}</p>}
    </div>
    {lesson.status === "scheduled" && <OnlineLessonLink href={lesson.onlineLink}/>}
  </article>;
}

function HomeToday({ role, data, loading, error, reload, onNavigate }: { role: Role; data: HomeSummary | null; loading: boolean; error: string; reload: () => void; onNavigate: (destination: string) => void }) {
  const lessons = data?.today.items || [], count = data?.today.total;
  return <section className="home-compact-agenda" aria-labelledby="home-today-heading" aria-busy={loading}>
    <div className="home-compact-heading"><h2 id="home-today-heading"><CalendarDays size={20} aria-hidden="true"/>{t("今日安排")}{count !== undefined && <span className="home-compact-count">{count}</span>}</h2><Button className="home-calendar-link" variant="ghost" onClick={() => onNavigate("calendar")}>{getLanguage()==='zh'?'日历':'Calendar'}<ChevronRight size={16} aria-hidden="true"/></Button></div>
    {error && <div className="home-compact-error" role="alert"><p>{error}</p><Button variant="outline" onClick={reload}>{t("重试")}</Button></div>}
    {!data ? !error && <p className="home-compact-empty" role="status">{t("正在加载…")}</p> : lessons.length ? <>
      <div className="home-compact-lesson-list">{lessons.map(lesson => <LessonPreview key={lesson.id} lesson={lesson} role={role}/>)}</div>
      {data.today.total > lessons.length && <Button className="home-compact-all" variant="outline" onClick={() => onNavigate("calendar")}>{t("查看全部课程")}<ChevronRight size={16} aria-hidden="true"/></Button>}
    </> : <><p className="home-compact-empty">{t("今天没有课程")}</p>{data.nextLesson && <div className="home-compact-next"><h3>{t("下一堂课")}</h3><LessonPreview lesson={data.nextLesson} role={role} dated/></div>}</>}
  </section>;
}

export function HomeDashboard({ role, name, accountId, groupId, identityKey, onNavigate, onOpenTask, onSummary }: {
  role: Role; name: string; accountId: string; groupId: string | null; identityKey:string;
  onNavigate: (destination: string) => void;
  onOpenTask?: (classroomId:string,taskId:string)=>void;
  onSummary?: (summary:HomeSummary|null,failed?:boolean)=>void;
}) {
  const permissionAccount = useAdminPermissionAccount();
  const [now, setNow] = useState(() => Date.now());
  const {data:summary,error,loading,reload,updatedAt}=useHomeSummary<HomeSummary>({identity:identityKey,accountId,groupId,home:true});
  useEffect(()=>{if(updatedAt!==null)setNow(updatedAt);},[updatedAt]);
  // The greeting/date clock is local; it does not initiate a database query.
  useEffect(()=>{const update=()=>setNow(Date.now()),timer=window.setInterval(update,30_000);window.addEventListener('focus',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);};},[]);
  useEffect(()=>{onSummary?.(error?null:summary,Boolean(error));},[summary,error,onSummary]);
  const taskCounts=summary?.taskCounts;
  const today = malaysiaDay(new Date(now).toISOString());
  let cards: HomeCard[];
  if (role === "student") {
    const nextStudy = summary?.learning.nextStudy;
    cards = [
      { label: "未提交功课", value: summary ? String(summary.learning.pendingHomeworkCount) : '—', Icon: BookOpen, destination: "homework" },
      { label: "个人学习计划", value: nextStudy?.title || t("暂无学习计划"), detail: nextStudy ? lessonTime(nextStudy.startsAt) : undefined, Icon: Clock3, destination: "calendar", isPlan: true },
    ];
  } else if (role === "teacher") {
    cards = [
      { label: "今日待记录出席", value: taskCounts ? String(taskCounts.todayPendingAttendance) : "—", Icon: ClipboardCheck, destination: "lessons" },
      { label: "已布置功课", value: summary ? String(summary.learning.homeworkCount) : '—', Icon: BookOpen, destination: "homework" },
    ];
  } else {
    cards = [{ label: "出席待处理", value: taskCounts ? String(taskCounts.attention) : "—", Icon: ClipboardCheck, destination: "attention" }];
  }
  const overview = cards.filter(card => canAdminView(permissionAccount, card.destination)).map(card => {
    return !summary ? { ...card, value: "—", detail: t(error ? "资料暂时无法载入，请稍后刷新" : "正在加载…") } : card;
  });
  return <section className={"home-compact home-compact-"+role} aria-label={t("主页")} data-summary-checked-at={updatedAt?new Date(updatedAt).toISOString():undefined} data-summary-stale={error?'true':undefined}>
    <header className={`home-compact-intro${role === "student" ? " home-compact-intro-student" : ""}`}>
      {role === "student" ? <div className="home-compact-welcome"><Mascot pose="hello" size={56}/><div><h1>{t("你好")}{name ? (getLanguage() === "zh" ? "，" : ", ") + name : ""}</h1><p>{t("今天也一起进步一点点。")}</p></div></div> : <h1>{t("你好")}{name ? (getLanguage() === "zh" ? "，" : ", ") + name : ""}</h1>}
      <time dateTime={today}>{new Intl.DateTimeFormat(getLanguage() === "zh" ? "zh-CN" : "en-GB", { timeZone: "Asia/Kuala_Lumpur", month: "long", day: "numeric", weekday: "short" }).format(new Date(now))}</time>
    </header>
    {role==='student'&&<QuizHomeProgress onViewAll={()=>onNavigate('quizHistory')}/>}
    {onOpenTask&&canAdminView(permissionAccount,'classrooms')&&canAdminAction(permissionAccount,'tasks.view')&&<TaskInbox role={role} onOpen={onOpenTask}/>}
    {canAdminView(permissionAccount, "calendar") ? <HomeToday role={role} data={summary} loading={loading} error={error} reload={reload} onNavigate={onNavigate}/> : error && <div className="home-compact-error" role="alert"><p>{error}</p><Button variant="outline" onClick={reload}>{t('重试')}</Button></div>}
    {overview.length > 0 && <section className="home-compact-tasks" aria-labelledby="home-tasks-heading"><h2 id="home-tasks-heading" className="home-compact-section-label">{t(role === "student" ? "待办与学习" : "待办与教学")}</h2><div className="home-compact-task-list">{overview.map(card => <button type="button" className={"home-compact-task " + (card.isPlan ? "is-plan" : "")} key={card.label} onClick={() => onNavigate(card.destination)}><card.Icon size={20} aria-hidden="true"/><span className="home-compact-task-copy"><strong>{t(card.label)}</strong>{card.isPlan && <span className="home-compact-plan-name">{card.value}</span>}{card.detail && <small>{card.detail}</small>}</span>{!card.isPlan && <b>{card.value}</b>}<span className="home-compact-task-action">{t(card.destination === "homework" ? "打开功课" : card.destination === "lessons" ? "记录出勤" : card.destination === "attention" ? "处理出席" : "查看计划")}<ChevronRight size={16} aria-hidden="true"/></span></button>)}</div></section>}
    {role === "student" && <nav className="home-compact-shortcuts" aria-label={t("常用功能")}><Button variant="outline" onClick={()=>onNavigate("quizzes")}><NotebookPen size={19} aria-hidden="true"/>Quiz<ChevronRight size={16} aria-hidden="true"/></Button><Button variant="outline" onClick={()=>onNavigate("materials")}><LibraryBig size={19} aria-hidden="true"/>{t("教学资料")}<ChevronRight size={16} aria-hidden="true"/></Button></nav>}
  </section>;
}
