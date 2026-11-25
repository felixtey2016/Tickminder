"use client";
import {lazy} from 'react';
const SessionAttendanceDialog=lazy(()=>import('./session-attendance').then(m=>({default:m.SessionAttendanceDialog})));
import type { AttendanceSession } from "@/lib/attendance-types";
import type { SessionLesson } from "@/lib/class-session-display";
import { type GroupSession, type GroupSessionRequest } from "./class-session-schedule";
import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
const StudentCalendar=lazy(()=>import('./student-calendar').then(m=>({default:m.StudentCalendar})));
import type { CalendarRange } from "@/lib/course-calendar-range";
import { PagedAttendanceBoard, PagedReschedules } from "./course-panels";
import { mayCheckIn } from "@/lib/lesson-rules";
import { OnlineLessonLink } from "./online-lesson-link";
import { RescheduleRequestDialog, type RescheduleProposal } from "./reschedule-panel";
import "./academic-roster-layout.css";
type Lesson = SessionLesson & {
    id: string;
    student: string;
    subject: string;
    teacherName: string;
    plannedStart: string;
    plannedEnd: string;
    actualStart: string | null;
    actualEnd: string | null;
    status: string;
    attendanceKind?: string | null;
    note?: string | null;
    onlineLink?: string | null;
};

type Proposal = RescheduleProposal;

type Mutate = (body: Record<string, unknown>) => Promise<boolean>;

const localFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

const local = (iso: string) => localFormatter.format(new Date(iso)).replace(" ", "T");

const label = (iso: string) => local(iso).replace("T", " ");

function TeacherPlanLinkEditor({ plan, mutate, busy }: { plan: { key: string; student: string; subject: string; onlineLink?: string | null }; mutate: Mutate; busy: boolean }) {
    const [link, setLink] = useState(plan.onlineLink || "");
    return <form className="teacher-plan-link" aria-label={plan.student + " · " + plan.subject} onSubmit={async event => { event.preventDefault(); await mutate({ action: "updateOnlineLink", key: plan.key, onlineLink: link }); }}><div className="teacher-plan-link-heading"><strong>{plan.student} · {plan.subject}</strong><OnlineLessonLink href={plan.onlineLink}/></div><div className="teacher-plan-link-fields"><label>{t("线上课堂链接（可选）")}<input type="url" inputMode="url" maxLength={2048} placeholder="https://meet.google.com/..." value={link} onChange={event => setLink(event.target.value)}/></label><Button size="sm" disabled={busy || link === (plan.onlineLink || "")}>{t("保存课堂链接")}</Button></div></form>;
}

export function TeacherPortal({lessons,plans,proposals,mutate,busy,view,onReschedule,classSessions=[],classSessionRequests=[],attendanceSessions,month,calendarDate,onCalendarDateChange,onCalendarRangeChange,calendarLoading,pendingAttendance}:{pendingAttendance?:number;calendarLoading?:boolean;month:string;calendarDate?:string;onCalendarDateChange?:(date:string)=>void;onCalendarRangeChange?:(range:CalendarRange)=>void;lessons:Lesson[];plans:Array<{key:string;student:string;subject:string;onlineLink?:string|null}>;proposals:Proposal[];mutate:Mutate;busy:boolean;view:"calendar"|"lessons"|"attendance"|"students"|"reschedule";onReschedule?:()=>void;classSessions?:GroupSession[];classSessionRequests?:GroupSessionRequest[];attendanceSessions?:AttendanceSession[]}){
 const [selected,setSelected]=useState<AttendanceSession|null>(null),[request,setRequest]=useState<Lesson|null>(null);
 const [selectedMode,setLessonMode]=useState<"month"|"pending"|null>(null);
 const lessonMode=selectedMode||(pendingAttendance?"pending":"month");
 useEffect(()=>{if(pendingAttendance!==undefined)setLessonMode(previous=>previous||(pendingAttendance?'pending':'month'));},[pendingAttendance]);
 return <div className="portal-layout portal-single-view">
 {view==="lessons"&&<div className="course-query-stack"><div className="portal-actions" role="group" aria-label={t("课程范围")}><Button variant={lessonMode==="month"?"default":"outline"} onClick={()=>setLessonMode("month")}>{t("所选月份")}</Button><Button variant={lessonMode==="pending"?"default":"outline"} onClick={()=>setLessonMode("pending")}>{t("待记录出席")} · {pendingAttendance??'—'}</Button></div><PagedAttendanceBoard key={lessonMode} mode={lessonMode} month={month} role="teacher" mutate={mutate} busy={busy}/></div>}
 {view==="attendance"&&<PagedAttendanceBoard month={month} role="teacher" mutate={mutate} busy={busy} mode="records"/>}
 {view==="calendar"&&<StudentCalendar loading={calendarLoading} selectedDate={calendarDate} onDateChange={onCalendarDateChange} onRangeChange={onCalendarRangeChange} role="teacher" onPending={onReschedule} lessons={lessons} proposals={proposals} busy={busy} renderActions={id=>{const l=lessons.find(l=>l.id===id),session=attendanceSessions?.find(s=>s.id===l?.sessionId);return l&&session?<div className="portal-actions"><Button disabled={busy||!mayCheckIn(l.plannedStart,new Date().toISOString())} onClick={()=>setSelected(session)}>{t("登记课次考勤")}</Button>{l.status==="scheduled"&&<Button variant="outline" disabled={busy} onClick={()=>l.sessionType==="group"?onReschedule?.():setRequest(l)}>{t("申请改期")}</Button>}</div>:null;}}/>}
 {view==="reschedule"&&<PagedReschedules role="teacher" month={month} mutate={mutate} busy={busy}/>}
 {view==="students"&&<section className="panel teacher-plan-list" aria-label={t("负责的学生与科目")}>{plans.map(p=><TeacherPlanLinkEditor key={p.key+":"+p.onlineLink} plan={p} mutate={mutate} busy={busy}/>)}</section>}
 {selected&&<SessionAttendanceDialog session={selected} role="teacher" mutate={mutate} busy={busy} close={()=>setSelected(null)}/>}
 <RescheduleRequestDialog key={request?.id||"closed"} lesson={request} mutate={mutate} busy={busy} close={()=>setRequest(null)}/>
 </div>;
}
