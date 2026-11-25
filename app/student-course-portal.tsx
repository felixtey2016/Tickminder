"use client";
import type { SessionLesson } from "@/lib/class-session-display";
import { useDialogState } from "@/lib/use-dialog-state";
import { useState } from "react";
import {lazy} from 'react';
import type {WorkspaceReadIdentity} from '@/lib/workspace-page-data';
const StudentLearningDashboard=lazy(()=>import('./student-learning-dashboard').then(m=>({default:m.StudentLearningDashboard})));
import type { CalendarRange } from "@/lib/course-calendar-range";
import { PagedStudentLessons, PagedReschedules, type CourseLesson } from "./course-panels";
import type { LearningMutate } from "./learning-portal";
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

export function StudentPortal({ account,identityKey,calendarRange,lessons, proposals, mutate, learningMutate, busy, view, onCalendar,month,calendarDate,onCalendarDateChange,onCalendarRangeChange,calendarLoading }: {
    calendarLoading?:boolean;month:string;calendarDate?:string;onCalendarDateChange?:(date:string)=>void;onCalendarRangeChange?:(range:CalendarRange)=>void;
    lessons: Lesson[];
    proposals: Proposal[];
    mutate: Mutate;
    learningMutate: LearningMutate;
    account:WorkspaceReadIdentity;identityKey:string;calendarRange:CalendarRange;
    busy: boolean;
    view: "calendar" | "list" | "reschedule"; onCalendar?: () => void;
}) {
    const sorted = [...lessons].sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
    const [requestId, setRequestId] = useDialogState<string | null>("student-reschedule-request", null);
    const [requestLesson,setRequestLesson]=useState<CourseLesson|null>(null);
    const selectedLesson = requestLesson?.id===requestId?requestLesson:lessons.find(l => l.id === requestId) || null;
    return <div className="student-portal">{view === "list" && <PagedStudentLessons month={month} onRequest={l=>{setRequestLesson(l);setRequestId(l.id);}} busy={busy}/>}
      {view !== "reschedule" && view !== "list" && <StudentLearningDashboard account={account} identityKey={identityKey} calendarRange={calendarRange} calendarLoading={calendarLoading} calendarDate={calendarDate} onCalendarDateChange={onCalendarDateChange} onCalendarRangeChange={onCalendarRangeChange} lessons={sorted} proposals={proposals} mutate={learningMutate} busy={busy} view={view} onCalendar={onCalendar} onRequestReschedule={setRequestId}/>}
      {view === "reschedule" && <PagedReschedules role="student" month={month} mutate={mutate} busy={busy}/>}
      <RescheduleRequestDialog key={requestId || "closed"} lesson={selectedLesson} close={() => setRequestId(null)} mutate={mutate} busy={busy}/>
    </div>;
}
