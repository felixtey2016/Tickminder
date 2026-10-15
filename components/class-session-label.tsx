"use client";
import type {SessionLesson} from "@/lib/class-session-display";
import {t} from "@/lib/i18n";
export function ClassSessionLabel({lesson}:{lesson:SessionLesson}){return lesson.sessionType==="group"?<small className="class-session-label" data-session-id={lesson.sessionId}>{t("整班课程")} · {lesson.classroomTitle} · {lesson.participantCount} {t("位学生")}</small>:lesson.classroomTitle?<small className="class-session-label" data-session-id={lesson.sessionId}>{t("一对一课程")} · {lesson.classroomTitle}</small>:null;}
