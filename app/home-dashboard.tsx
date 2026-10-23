"use client";
import { useAdminPermissionAccount } from "./admin-permission-context";
import {uniqueSessionLessons,sessionLessonTitle,type SessionLesson} from "@/lib/class-session-display";

import { useEffect, useState } from "react";
import { BookOpen, CalendarDays, ChevronRight, ClipboardCheck, Clock3, type LucideIcon } from "lucide-react";
import { getLanguage, t } from "@/lib/i18n";
import type { LearningState } from "./learning-portal";
import { Mascot } from "@/components/page-state";
import { Button } from "@/components/ui/button";
import {canAdminView} from "@/lib/admin-permission-client";
import { OnlineLessonLink } from "./online-lesson-link";
import {useCoursePage} from './course-query-ui';
import type {CourseTaskCounts} from '@/lib/course-query';

type Role = "admin" | "teacher" | "student";
type Lesson = SessionLesson & {
  id: string;
  student: string;
  subject: string;
  teacherName: string;
  plannedStart: string;
  plannedEnd: string;
  status: string;
  chargeable?: boolean | null;
  reviewedAt?:string|null;
  replacementFor?: string | null;
  onlineLink?: string | null;
};
type HomeCard = { label: string; value: string; detail: string; action: string; Icon: LucideIcon; destination: string };

const malaysiaDay = (iso: string) => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(iso));
const lessonTime = (iso: string) => new Intl.DateTimeFormat(getLanguage() === "zh" ? "zh-CN" : "en-GB", {
  timeZone: "Asia/Kuala_Lumpur", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
}).format(new Date(iso));

function HomeNextLesson({role,now,onNavigate}:{role:Role;now:number;onNavigate:(destination:string)=>void}){
  const query=useCoursePage<Lesson>({view:'lessons',mode:'upcoming',page:'1'},Math.floor(now/60_000));
  const future=query.data?.items||[],next=(role==='student'?future:uniqueSessionLessons(future))[0];
  const action=role==='student'?'查看学习日历':'查看课程日历';
  return <article className="home-next" aria-busy={query.loading}><div className="home-next-heading"><span>{t('下一堂课')}</span><CalendarDays size={20} aria-hidden="true"/></div>{query.loading?<p role="status">{t('正在加载…')}</p>:query.error?<div role="alert"><p>{query.error}</p><Button variant="outline" onClick={query.reload}>{t('重试')}</Button></div>:<><h2>{next?next.subject:t('暂无课程')}</h2><p className="home-next-time">{next?lessonTime(next.plannedStart)+'–'+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuala_Lumpur',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(next.plannedEnd)):t('目前没有已安排的后续课程')}</p>{next&&<p>{role==='student'?next.teacherName:sessionLessonTitle(next)+' · '+next.teacherName}</p>}</>}<div className="home-next-actions"><OnlineLessonLink href={next?.onlineLink}/><Button variant="outline" onClick={()=>onNavigate('calendar')}>{t(action)}<ChevronRight size={17} aria-hidden="true"/></Button></div></article>;
}

export function HomeDashboard({ role, name, taskCounts, learning, learningReady = true, learningError, onNavigate }: {
  role: Role;
  name: string;
  lessons?: Lesson[];
  taskCounts?:CourseTaskCounts;
  learning: LearningState;
  learningReady?: boolean;
  learningError?: string;
  onNavigate: (destination: string) => void;
}) {
  const permissionAccount=useAdminPermissionAccount();
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
    const nextStudy = learning.studyBlocks.filter(block => Date.parse(block.endsAt) > now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    cards = [
      { label: "未提交功课", value: String(incomplete.length), detail: incomplete.length ? t("查看功课要求与截止时间") : t("目前没有未提交功课"), action: "查看我的功课", Icon: BookOpen, destination: "homework" },
      { label: "个人学习计划", value: nextStudy ? nextStudy.title : "—", detail: nextStudy ? lessonTime(nextStudy.startsAt) : t("在日历中安排学习时间"), action: "打开学习日历", Icon: Clock3, destination: "calendar" },
    ];
  } else if (role === "teacher") {
    cards = [
      { label: "今日待记录出席", value: taskCounts?String(taskCounts.todayPendingAttendance):'—', detail: t("查看今天的课程"), action: "记录出席", Icon: ClipboardCheck, destination: "lessons" },
      { label: "已布置功课", value: String(learning.homework.length), detail: t("查看学生提交情况"), action: "管理功课", Icon: BookOpen, destination: "homework" },
    ];
  } else {
    cards = [
      { label: "今日课程", value: taskCounts?String(taskCounts.todayLessons):'—', detail: "", action: "查看课程日历", Icon: Clock3, destination: "calendar" },
      { label: "出席待处理", value: taskCounts?String(taskCounts.attention):'—', detail: t("未登记、待复核及待处理缺席"), action: "查看出席待处理", Icon: ClipboardCheck, destination: "attention" },
    ];
  }

  const overview = cards.filter(card=>canAdminView(permissionAccount,card.destination)).map(card => {
    const needsLearning = role === "student" || (role === "teacher" && card.destination === "homework");
    return needsLearning && !learningReady ? {...card, value:"—", detail: t(learningError ? "资料暂时无法载入，请稍后刷新" : "正在加载…")} : card;
  });
  return <section className="home-dashboard" aria-label={t("主页")}>
    <div className="home-intro"><div className="home-greeting"><Mascot pose="hello" size={60}/><h2>{t("你好")}{name ? (getLanguage() === "zh" ? "，" : ", ") + name : ""}</h2></div><time className="home-date" dateTime={today}>{new Intl.DateTimeFormat(getLanguage() === "zh" ? "zh-CN" : "en-GB", { timeZone:"Asia/Kuala_Lumpur", year:"numeric",month:"long",day:"numeric",weekday:"long" }).format(new Date(now))}</time></div>
    {canAdminView(permissionAccount,'calendar')&&<HomeNextLesson key={role} role={role} now={now} onNavigate={onNavigate}/>}
    <h2 className="home-overview-title">{t(role === "admin" ? "今日概览" : "学习安排")}</h2><div className="home-summary-list">{overview.map(card => <button type="button" className="home-summary-row" key={card.label} onClick={() => onNavigate(card.destination)}><card.Icon size={22} aria-hidden="true"/><span><strong>{t(card.label)}</strong>{card.detail && <small>{card.detail}</small>}</span><b>{card.value}</b><ChevronRight size={18} aria-hidden="true"/></button>)}</div>
  </section>;
}
