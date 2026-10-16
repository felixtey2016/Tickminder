"use client";
import {SessionAttendanceBoard,SessionAttendanceDialog} from "./session-attendance";
import type {AttendanceSession} from "@/lib/attendance-types";
import type {SessionLesson} from "@/lib/class-session-display";
import {ClassSessionLabel} from "@/components/class-session-label";
import {GroupSessionBoard,type GroupSession,type GroupSessionRequest} from "./class-session-schedule";
import { LessonMore } from "@/components/lesson-more";
import { t } from "@/lib/i18n";
import { useDialogState } from "@/lib/use-dialog-state";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StudentLearningDashboard } from "./student-learning-dashboard";
import { StudentCalendar } from "./student-calendar";
import { StudentLessonList } from "./student-lesson-list";
import type { LearningMutate, LearningState } from "./learning-portal";
import { mayCheckIn } from "@/lib/lesson-rules";
import { OnlineLessonLink } from "./online-lesson-link";
import { LessonHistory } from "./lesson-history";
import { ReschedulePanel, RescheduleRequestDialog, type RescheduleProposal } from "./reschedule-panel";
import { ConflictPreview } from "./conflict-preview";
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
const statusText: Record<string, string> = { scheduled: "已安排", completed: "已上课", student_absent: "学生缺席", teacher_absent: "老师缺席" };
function TeacherPlanLinkEditor({ plan, mutate, busy }: { plan: { key: string; student: string; subject: string; onlineLink?: string | null }; mutate: Mutate; busy: boolean }) {
    const [link, setLink] = useState(plan.onlineLink || "");
    return <form className="teacher-plan-link" onSubmit={async event => { event.preventDefault(); await mutate({ action: "updateOnlineLink", key: plan.key, onlineLink: link }); }}><strong>{plan.student} · {plan.subject}</strong><OnlineLessonLink href={plan.onlineLink}/><label>{t("线上课堂链接（可选）")}<input type="url" inputMode="url" maxLength={2048} placeholder="https://meet.google.com/..." value={link} onChange={event => setLink(event.target.value)}/></label><Button size="sm" disabled={busy || link === (plan.onlineLink || "")}>{t("保存课堂链接")}</Button></form>;
}
export function TeacherPortal({lessons,plans,proposals,mutate,busy,view,onReschedule,classSessions=[],classSessionRequests=[],attendanceSessions}:{lessons:Lesson[];plans:Array<{key:string;student:string;subject:string;onlineLink?:string|null}>;proposals:Proposal[];mutate:Mutate;busy:boolean;view:"calendar"|"lessons"|"attendance"|"students"|"reschedule";onReschedule?:()=>void;classSessions?:GroupSession[];classSessionRequests?:GroupSessionRequest[];attendanceSessions?:AttendanceSession[]}){
 const [selected,setSelected]=useState<AttendanceSession|null>(null),[request,setRequest]=useState<Lesson|null>(null);
 return <div className="portal-layout portal-single-view">
 {view==="lessons"&&<SessionAttendanceBoard sessions={attendanceSessions} role="teacher" mutate={mutate} busy={busy}/>}
 {view==="attendance"&&<SessionAttendanceBoard sessions={attendanceSessions} role="teacher" mutate={mutate} busy={busy} mode="records"/>}
 {view==="calendar"&&<StudentCalendar role="teacher" onPending={onReschedule} lessons={lessons} proposals={proposals} busy={busy} renderActions={id=>{const l=lessons.find(l=>l.id===id),session=attendanceSessions?.find(s=>s.id===l?.sessionId);return l&&session?<div className="portal-actions"><Button disabled={busy||!mayCheckIn(l.plannedStart,new Date().toISOString())} onClick={()=>setSelected(session)}>{t("登记课次考勤")}</Button>{l.status==="scheduled"&&<Button variant="outline" disabled={busy} onClick={()=>l.sessionType==="group"?onReschedule?.():setRequest(l)}>{t("申请改期")}</Button>}</div>:null;}}/>}
 {view==="reschedule"&&<><GroupSessionBoard sessions={classSessions} requests={classSessionRequests} role="teacher" mutate={mutate} busy={busy}/><ReschedulePanel role="teacher" lessons={lessons} proposals={proposals} mutate={mutate} busy={busy}/></>}
 {view==="students"&&<section className="panel" aria-label={t("负责的学生与科目")}>{plans.map(p=><TeacherPlanLinkEditor key={p.key+":"+p.onlineLink} plan={p} mutate={mutate} busy={busy}/>)}</section>}
 {selected&&<SessionAttendanceDialog session={selected} role="teacher" mutate={mutate} busy={busy} close={()=>setSelected(null)}/>}
 <RescheduleRequestDialog key={request?.id||"closed"} lesson={request} mutate={mutate} busy={busy} close={()=>setRequest(null)}/>
 </div>;
}
export function StudentPortal({ lessons, proposals, mutate, learningMutate, learning, busy, view, onCalendar }: {
    lessons: Lesson[];
    proposals: Proposal[];
    mutate: Mutate;
    learningMutate: LearningMutate;
    learning: LearningState;
    busy: boolean;
    view: "calendar" | "list" | "homework" | "materials" | "reschedule"; onCalendar?: () => void;
}) {
    const sorted = [...lessons].sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
    const [requestId, setRequestId] = useDialogState<string | null>("student-reschedule-request", null);
    const selectedLesson = lessons.find(l => l.id === requestId) || null;
    return <div className="student-portal">{view === "list" && <StudentLessonList lessons={sorted} proposals={proposals} onRequestReschedule={setRequestId} busy={busy}/>}
      {view !== "reschedule" && view !== "list" && <StudentLearningDashboard lessons={sorted} proposals={proposals} learning={learning} mutate={learningMutate} busy={busy} view={view} onCalendar={onCalendar} onRequestReschedule={setRequestId}/>}
      {view === "reschedule" && <ReschedulePanel role="student" lessons={lessons} proposals={proposals} mutate={mutate} busy={busy}/>}
      <RescheduleRequestDialog key={requestId || "closed"} lesson={selectedLesson} close={() => setRequestId(null)} mutate={mutate} busy={busy}/>
    </div>;
}
