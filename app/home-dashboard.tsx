"use client";

import { useEffect, useState } from "react";
import { BookOpen, CalendarDays, ChevronRight, ClipboardCheck, Clock3, type LucideIcon } from "lucide-react";
import { getLanguage, t } from "@/lib/i18n";
import type { LearningState } from "./learning-portal";
import { OnlineLessonLink } from "./online-lesson-link";

type Role = "admin" | "teacher" | "student";
type Lesson = {
  id: string;
  student: string;
  subject: string;
  teacherName: string;
  plannedStart: string;
  plannedEnd: string;
  status: string;
  chargeable?: boolean | null;
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

export function HomeDashboard({ role, name, lessons, learning, onNavigate }: {
  role: Role;
  name: string;
  lessons: Lesson[];
  learning: LearningState;
  onNavigate: (destination: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const today = malaysiaDay(new Date(now).toISOString());
  const upcoming = lessons.filter(lesson => lesson.status === "scheduled" && Date.parse(lesson.plannedEnd) > now)
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
  const next = upcoming[0];
  const todayCount = lessons.filter(lesson => lesson.status !== "cancelled" && malaysiaDay(lesson.plannedStart) === today).length;
  const nextDetail = next
    ? `${lessonTime(next.plannedStart)} · ${role === "student" ? next.teacherName : next.student} · ${next.subject}`
    : t("目前没有已安排的后续课程");

  let cards: HomeCard[];
  if (role === "student") {
    const submitted = new Set(learning.submissions.map(item => item.homeworkId));
    const incomplete = learning.homework.filter(item => !submitted.has(item.id));
    const nextStudy = learning.studyBlocks.filter(block => Date.parse(block.endsAt) > now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    cards = [
      { label: "下一堂课", value: next ? next.subject : "—", detail: nextDetail, action: "查看学习日历", Icon: CalendarDays, destination: "calendar" },
      { label: "未提交功课", value: String(incomplete.length), detail: incomplete.length ? t("查看功课要求与截止时间") : t("目前没有未提交功课"), action: "查看我的功课", Icon: BookOpen, destination: "homework" },
      { label: "个人学习安排", value: nextStudy ? nextStudy.title : "—", detail: nextStudy ? lessonTime(nextStudy.startsAt) : t("在日历中安排学习时间"), action: "打开学习日历", Icon: Clock3, destination: "calendar" },
    ];
  } else if (role === "teacher") {
    const todayToCheckIn = lessons.filter(lesson => lesson.status === "scheduled" && malaysiaDay(lesson.plannedStart) === today).length;
    cards = [
      { label: "下一堂课", value: next ? next.subject : "—", detail: nextDetail, action: "查看课程与打卡", Icon: CalendarDays, destination: "lessons" },
      { label: "今日待打卡", value: String(todayToCheckIn), detail: t("查看今天的课程"), action: "前往打卡", Icon: ClipboardCheck, destination: "lessons" },
      { label: "已布置功课", value: String(learning.homework.length), detail: t("查看学生提交情况"), action: "查看布置功课", Icon: BookOpen, destination: "homework" },
    ];
  } else {
    const missed = lessons.filter(lesson => lesson.status === "scheduled" && Date.parse(lesson.plannedEnd) < now).length;
    const absence = lessons.filter(lesson => ["student_absent", "teacher_absent"].includes(lesson.status) && !lesson.chargeable &&
      !lessons.some(makeup => makeup.replacementFor === lesson.id && makeup.status !== "cancelled")).length;
    cards = [
      { label: "下一堂课", value: next ? next.subject : "—", detail: nextDetail, action: "查看课程日历", Icon: CalendarDays, destination: "calendar" },
      { label: "今日课程", value: String(todayCount), detail: t("查看今天的排课"), action: "查看课程日历", Icon: Clock3, destination: "calendar" },
      { label: "异常待办", value: String(missed + absence), detail: t("漏打卡及待处理缺席"), action: "查看异常待办", Icon: ClipboardCheck, destination: "attention" },
    ];
  }

  return <section className="home-dashboard" aria-label={t("主页")}>
    <div className="home-intro"><p className="eyebrow">{t("今天一览")}</p><h2>{t("你好")}{name ? `，${name}` : ""}</h2><p>{t("常用信息和入口都在这里。")}</p></div>
    <div className="home-cards">{cards.map(card => <article key={card.label} className="home-card"><button type="button" className="home-card-main" onClick={() => onNavigate(card.destination)} aria-label={`${t(card.label)}：${card.value}。${t(card.action)}`}>
      <span className="home-card-icon"><card.Icon size={21} aria-hidden="true"/></span>
      <span className="home-card-label">{t(card.label)}</span>
      <strong>{card.value}</strong>
      <span className="home-card-detail">{card.detail}</span>
      <span className="home-card-action">{t(card.action)} <ChevronRight size={17} aria-hidden="true"/></span>
    </button>{card.label === "下一堂课" && <OnlineLessonLink href={next?.onlineLink}/>}</article>)}</div>
  </section>;
}
