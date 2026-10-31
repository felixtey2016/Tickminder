"use client";

import { useEffect, useState } from "react";
import { BookOpen, CalendarDays, ChevronRight, ClipboardCheck, Clock3, type LucideIcon } from "lucide-react";
import { uniqueSessionLessons, sessionLessonTitle, type SessionLesson } from "@/lib/class-session-display";
import { getLanguage, t, registerTranslations } from "@/lib/i18n";
import { canAdminView } from "@/lib/admin-permission-client";
import type { CourseTaskCounts } from "@/lib/course-query";
import { Button } from "@/components/ui/button";
import { Mascot } from "@/components/page-state";
import { useAdminPermissionAccount } from "./admin-permission-context";
import type { LearningState } from "./learning-portal";
import { OnlineLessonLink } from "./online-lesson-link";
import { useCoursePage } from "./course-query-ui";
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
});

type Role = "admin" | "teacher" | "student";
type Lesson = SessionLesson & {
  id: string; student: string; subject: string; teacherName: string;
  plannedStart: string; plannedEnd: string; status: string;
  chargeable?: boolean | null; reviewedAt?: string | null;
  replacementFor?: string | null; onlineLink?: string | null;
};
type HomeCard = { label: string; value: string; detail?: string; Icon: LucideIcon; destination: string; isPlan?: boolean };
const malaysiaDay = (iso: string) => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(iso));
const lessonTime = (iso: string) => new Intl.DateTimeFormat(getLanguage() === "zh" ? "zh-CN" : "en-GB", {
  timeZone: "Asia/Kuala_Lumpur", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
}).format(new Date(iso));
const clockTime = (iso: string) => new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false,
}).format(new Date(iso));

function LessonPreview({ lesson, role, dated = false }: { lesson: Lesson; role: Role; dated?: boolean }) {
  const status = ({ completed: "已上课", scheduled: "已安排", student_absent: "学生缺席", teacher_absent: "老师缺席", cancelled: "已取消" } as Record<string, string>)[lesson.status];
  const people = role === "student" ? lesson.teacherName : [sessionLessonTitle(lesson), role === "admin" ? lesson.teacherName : ""].filter(Boolean).join(" · ");
  return <article className="home-compact-lesson">
    <div className="home-compact-lesson-copy">
      <div className="home-compact-lesson-top"><strong>{lesson.subject}</strong>{status && <span className={"home-compact-status " + (lesson.status === "completed" ? "is-complete" : "")}>{t(status)}</span>}</div>
      <p className="home-compact-time"><time dateTime={lesson.plannedStart}>{dated ? lessonTime(lesson.plannedStart) : clockTime(lesson.plannedStart)}</time>–<time dateTime={lesson.plannedEnd}>{clockTime(lesson.plannedEnd)}</time></p>
      {people && <p className="home-compact-people">{people}</p>}
    </div>
    {lesson.status === "scheduled" && <OnlineLessonLink href={lesson.onlineLink}/>}
  </article>;
}

function HomeNextLesson({ role, now }: { role: Role; now: number }) {
  const query = useCoursePage<Lesson>({ view: "lessons", mode: "upcoming", page: "1" }, Math.floor(now / 60_000));
  const future = query.data?.items || [];
  const next = (role === "student" ? future : uniqueSessionLessons(future))[0];
  return <div className="home-compact-next" aria-busy={query.loading}>
    {query.loading ? <p role="status">{t("正在加载…")}</p> : query.error ? <div className="home-compact-error" role="alert"><p>{query.error}</p><Button variant="outline" onClick={query.reload}>{t("重试")}</Button></div> : next ? <><h3>{t("下一堂课")}</h3><LessonPreview lesson={next} role={role} dated/></> : null}
  </div>;
}

function HomeToday({ role, now, today, taskCounts, onNavigate }: { role: Role; now: number; today: string; taskCounts?: CourseTaskCounts; onNavigate: (destination: string) => void }) {
  const tomorrow = new Date(Date.parse(today + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
  const query = useCoursePage<Lesson>({ view: "lessons", mode: "month", from: today, to: tomorrow, page: "1" }, Math.floor(now / 60_000));
  const items = query.data?.items || [];
  const lessons = role === "student" ? items : uniqueSessionLessons(items);
  const count = role === "student" ? query.data?.total : taskCounts?.todayLessons;
  return <section className="home-compact-agenda" aria-labelledby="home-today-heading" aria-busy={query.loading}>
    <div className="home-compact-heading"><h2 id="home-today-heading"><CalendarDays size={20} aria-hidden="true"/>{t("今日安排")}{!query.loading && !query.error && count !== undefined && <span className="home-compact-count">{count}</span>}</h2><Button variant="outline" onClick={() => onNavigate("calendar")}>{getLanguage()==='zh'?'日历':'Calendar'}<ChevronRight size={16} aria-hidden="true"/></Button></div>
    {query.loading ? <p className="home-compact-empty" role="status">{t("正在加载…")}</p> : query.error ? <div className="home-compact-error" role="alert"><p>{query.error}</p><Button variant="outline" onClick={query.reload}>{t("重试")}</Button></div> : lessons.length ? <>
      <div className="home-compact-lesson-list">{lessons.slice(0, 3).map(lesson => <LessonPreview key={lesson.id} lesson={lesson} role={role}/>)}</div>
      {(lessons.length > 3 || (query.data?.pages || 0) > 1) && <Button className="home-compact-all" variant="outline" onClick={() => onNavigate("calendar")}>{t("查看全部课程")}<ChevronRight size={16} aria-hidden="true"/></Button>}
    </> : <><p className="home-compact-empty">{t("今天没有课程")}</p><HomeNextLesson role={role} now={now}/></>}
  </section>;
}

export function HomeDashboard({ role, name, taskCounts, learning, learningReady = true, learningError, onNavigate }: {
  role: Role; name: string; lessons?: Lesson[]; taskCounts?: CourseTaskCounts;
  learning: LearningState; learningReady?: boolean; learningError?: string;
  onNavigate: (destination: string) => void;
}) {
  const permissionAccount = useAdminPermissionAccount();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const today = malaysiaDay(new Date(now).toISOString());
  let cards: HomeCard[];
  if (role === "student") {
    const submitted = new Set(learning.submissions.map(item => item.homeworkId));
    const incomplete = learning.homework.filter(item => !submitted.has(item.id));
    const nextStudy = learning.studyBlocks.filter(block => Date.parse(block.endsAt) > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    cards = [
      { label: "未提交功课", value: String(incomplete.length), Icon: BookOpen, destination: "homework" },
      { label: "个人学习计划", value: nextStudy?.title || t("暂无学习计划"), detail: nextStudy ? lessonTime(nextStudy.startsAt) : undefined, Icon: Clock3, destination: "calendar", isPlan: true },
    ];
  } else if (role === "teacher") {
    cards = [
      { label: "今日待记录出席", value: taskCounts ? String(taskCounts.todayPendingAttendance) : "—", Icon: ClipboardCheck, destination: "lessons" },
      { label: "已布置功课", value: String(learning.homework.length), Icon: BookOpen, destination: "homework" },
    ];
  } else {
    cards = [{ label: "出席待处理", value: taskCounts ? String(taskCounts.attention) : "—", Icon: ClipboardCheck, destination: "attention" }];
  }
  const overview = cards.filter(card => canAdminView(permissionAccount, card.destination)).map(card => {
    const needsLearning = role === "student" || (role === "teacher" && card.destination === "homework");
    return needsLearning && !learningReady ? { ...card, value: "—", detail: t(learningError ? "资料暂时无法载入，请稍后刷新" : "正在加载…") } : card;
  });
  return <section className="home-compact" aria-label={t("主页")}>
    <header className={`home-compact-intro${role === "student" ? " home-compact-intro-student" : ""}`}>
      {role === "student" ? <div className="home-compact-welcome"><Mascot pose="hello" size={72}/><div><h2>{t("你好")}{name ? (getLanguage() === "zh" ? "，" : ", ") + name : ""}</h2><p>{t("今天也一起进步一点点。")}</p></div></div> : <h2>{t("你好")}{name ? (getLanguage() === "zh" ? "，" : ", ") + name : ""}</h2>}
      <time dateTime={today}>{new Intl.DateTimeFormat(getLanguage() === "zh" ? "zh-CN" : "en-GB", { timeZone: "Asia/Kuala_Lumpur", month: "long", day: "numeric", weekday: "short" }).format(new Date(now))}</time>
    </header>
    {canAdminView(permissionAccount, "calendar") && <HomeToday role={role} now={now} today={today} taskCounts={taskCounts} onNavigate={onNavigate}/>}
    {overview.length > 0 && <section className="home-compact-tasks" aria-labelledby="home-tasks-heading"><h2 id="home-tasks-heading">{t(role === "student" ? "待办与学习" : "待办与教学")}</h2><div className="home-compact-task-list">{overview.map(card => <button type="button" className={"home-compact-task " + (card.isPlan ? "is-plan" : "")} key={card.label} onClick={() => onNavigate(card.destination)}><card.Icon size={20} aria-hidden="true"/><span className="home-compact-task-copy"><strong>{t(card.label)}</strong>{card.isPlan && <span className="home-compact-plan-name">{card.value}</span>}{card.detail && <small>{card.detail}</small>}</span>{!card.isPlan && <b>{card.value}</b>}<ChevronRight size={18} aria-hidden="true"/></button>)}</div></section>}
  </section>;
}
