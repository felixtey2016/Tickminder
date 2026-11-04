"use client";
import {LessonTimeRange} from "@/components/lesson-time-range";
import {validLessonRange} from "@/lib/lesson-time-range";
import { DateInput } from '@/components/date-time-input';
import { displayFormatter } from '@/lib/display-preferences';
import { TimeInput } from '@/components/time-input';
import { ClassSessionLabel } from "@/components/class-session-label";
import { matchesCourseCompletion } from "@/lib/course-completion";
import { groupFetch } from "@/lib/group-client";
import { useFilterPreference } from "@/lib/filter-preferences";
import { getLanguage, t } from "@/lib/i18n";
import { formatDurationHours } from '@/lib/duration-format';
import { readApiJson } from "@/lib/action-feedback";
import { LessonMore } from "@/components/lesson-more";
import { lazy, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LessonHistory } from "./lesson-history";
import { ConflictPreview, conflictDescription, type ConflictDetail } from "./conflict-preview";
import { FormActionBar } from '@/components/form-action-bar';
import { type CalendarRange } from "@/lib/course-calendar-range";
import { DeleteButton, DirectoryFilters } from "./directory-tools";
import { useAdminAction } from "./admin-permission-context";
import type {ScheduleClassOption,Lesson,State,Open} from '@/lib/workspace-client-types';

const GroupSessionPlanner=lazy(()=>import("./class-session-schedule").then(m=>({default:m.GroupSessionPlanner})));

const BulkDeleteTool=lazy(()=>import("./bulk-delete").then(m=>({default:m.BulkDeleteTool})));

const LessonCalendar=lazy(()=>import("./week-calendar").then(m=>({default:m.LessonCalendar})));

const ActivityLog=lazy(()=>import("./activity-log").then(m=>({default:m.ActivityLog})));

const PagedAttendanceBoard=lazy(()=>import("./course-panels").then(m=>({default:m.PagedAttendanceBoard})));

const PagedGroupSessions=lazy(()=>import("./course-panels").then(m=>({default:m.PagedGroupSessions})));

const PagedLessonRows=lazy(()=>import("./course-panels").then(m=>({default:m.PagedLessonRows})));

const PagedReschedules=lazy(()=>import("./course-panels").then(m=>({default:m.PagedReschedules})));

const TeachingSummary=lazy(()=>import("./course-panels").then(m=>({default:m.TeachingSummary})));

const MakeupOriginalPicker=lazy(()=>import("./course-panels").then(m=>({default:m.MakeupOriginalPicker})));

const statusLabel: Record<string, string> = { scheduled: "已安排", completed: "已上课", student_absent: "学生缺席", teacher_absent: "老师缺席", cancelled: "已取消" };

const dayFormatters = {
    zh: new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Kuala_Lumpur", month: "short", day: "numeric", weekday: "short" }),
    en: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", month: "short", day: "numeric", weekday: "short" }),
};

const timeFormatter = displayFormatter("en-GB",{ timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false });

const localFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

const day = (iso: string) => dayFormatters[getLanguage()].format(new Date(iso));

const time = (iso: string) => timeFormatter.format(new Date(iso));

const local = (iso: string) => localFormatter.format(new Date(iso)).replace(" ", "T");

async function request(url: string, options?: RequestInit): Promise<any> { const r = await groupFetch(url, { ...options, cache: "no-store" }); const v = await readApiJson<{ error?: string; [key: string]: any }>(r); if (!r.ok)
    throw Object.assign(new Error(v.conflict ? conflictDescription(v.conflict as ConflictDetail) : t(r.status === 401 && url !== "/api/auth" ? "登录已过期，请重新登录" : v.error || "请求失败")), { status: r.status }); return v; }

export function AdminDashboard({ state, lessons, open, view,mutate,busy,onOpenFinance }: {
    onOpenFinance?:()=>void;mutate:(data:Record<string,unknown>)=>Promise<boolean>;busy:boolean;
    state: State | null;
    lessons: Lesson[];
    open: Open;
    view: "overview" | "attention" | "activity";
}) {
    const can=useAdminAction(),summary=state?.summary||[],month=state?.month||'',teachers=state?.teachers||[],students=state?.students||[];
    if(view==='activity')return <ActivityLog accountKey={state?.account.id+':'+state?.account.groupId}/>;
    if(view==='attention')return <div className="course-query-stack">{can('attendance.view')&&<><PagedAttendanceBoard onOpenFinance={onOpenFinance} mode="review" role="admin" month={month} mutate={mutate} busy={busy} teachers={teachers}/><PagedAttendanceBoard onOpenFinance={onOpenFinance} mode="pending" role="admin" month={month} mutate={mutate} busy={busy} teachers={teachers}/>{can('lessons.view')&&<PagedLessonRows mode="makeup" month={month} sessionType="" title="缺席待处理" renderLesson={l=><LessonCard key={l.id} lesson={l} admin open={open}/>}/>}</>}</div>;
    return <div className="dashboard">{can('attendance.view')&&<TeachingSummary summary={state?.teachingSummary}/>}<div className="metric-grid">{can('statistics.view')&&<><div className="metric"><span>{t('学生累计出席课时')}</span><strong>{formatDurationHours(summary.reduce((n,x)=>n+x.completed,0),getLanguage())}</strong><p>{month} · {t('已记录出席')}</p></div><div className="metric"><span>{t('未来已安排课时')}</span><strong>{formatDurationHours(summary.reduce((n,x)=>n+x.upcoming,0),getLanguage())}</strong><p>{t('所选月份')}</p></div></>}<div className="metric attention"><span>{t('待复核记录')}</span><strong>{state?.taskCounts?.pendingReview??'—'}</strong></div></div>{can('attendance.view')&&<PagedAttendanceBoard onOpenFinance={onOpenFinance} mode="review" role="admin" month={month} mutate={mutate} busy={busy} teachers={teachers}/ >}{can('lessons.view')&&<PagedLessonRows mode="upcoming" month={month} sessionType="" title="即将上课" renderLesson={l=><LessonCard key={l.id} lesson={l} admin open={open}/>}/ >}{can('statistics.view')&&<section className="panel"><h2>{t('学生科目统计')}</h2><p className="muted">{t('按实际开始日期归属月份')}</p><div className="summary-grid">{summary.map(row=><div className="summary-row" key={row.key}><strong>{row.key.replace('|',' · ')}</strong><span>{formatDurationHours(row.completed,getLanguage())} · {row.lessons} {t('堂已上课')}</span><span>{formatDurationHours(row.upcoming,getLanguage())} · {t('未来已安排')}</span><span>{row.pending} {t('待记录出席')} · {row.makeupNeeded} {t('待补')}</span></div>)}</div></section>}</div>;
}

function LessonCard({ lesson: l, admin, open, mutate, busy = false }: {
    lesson: Lesson;
    admin: boolean;
    open: Open;
    mutate?: (x: Record<string, unknown>) => Promise<boolean>;
    busy?: boolean;
}) { return <article className="lesson-card course-lesson-row"><div className="date-tile"><strong>{day(l.plannedStart)}</strong><span>{time(l.plannedStart)}–{time(l.plannedEnd)}</span></div><div className="lesson-body"><div className="lesson-title"><strong>{l.student} · {l.subject}</strong><span className={`status status-${l.status}`}>{t(l.attendanceKind === "early_dismissal" ? "提前结束课程" : statusLabel[l.status] || l.status)}</span></div><p>{l.teacherName}{l.kind === "makeup" ? t(" \u00B7 \u8865\u8BFE") : l.kind === "extra" ? t(" \u00B7 \u52A0\u8BFE") : ""}</p><div className="lesson-actions">{l.status !== "cancelled" && (admin || !l.reviewedAt) && <Button adminGrant="attendance.edit" size="sm" onClick={() => open({ type: "attendance", lesson: l })}>{admin && l.status !== "scheduled" ? t("更正出席记录") : t("记录出席…")}</Button>}<LessonMore>{admin && l.status !== "cancelled" && <><Button adminGrant="lessons.edit" size="sm" variant="outline" onClick={() => open({ type: "edit", lesson: l })}>{t("调整时间")}</Button><Button adminGrant="lessons.cancel" size="sm" variant="outline" onClick={() => open({ type: "cancel", lesson: l })}>{t("取消课程")}</Button>{["completed", "student_absent", "teacher_absent"].includes(l.status) && <Button adminGrant="attendance.review" size="sm" variant="secondary" onClick={() => open({ type: "review", lesson: l })}>{l.reviewedAt ? t("再次复核") : t("复核记录")}</Button>}</>}{admin && mutate && l.sessionType!=="group" && <DeleteButton kind="lesson" id={l.id} mutate={mutate} busy={busy} message="永久删除这堂课程及改期申请？已记录课时也会移除，无法恢复。"/>}</LessonMore></div><details className="course-row-details"><summary>{t("详情与记录")}</summary><ClassSessionLabel lesson={l}/>{l.note&&<p className="lesson-note">{l.note}</p>}<LessonHistory lessonId={l.id}/></details></div></article>; }

export function Schedule({ state, lessons, mutate, open, busy, view,calendarDate,onCalendarDateChange,onCalendarRangeChange,calendarLoading,onOpenFinance }: {
    onOpenFinance?:()=>void;
    calendarDate?:string;onCalendarDateChange?:(date:string)=>void;onCalendarRangeChange?:(range:CalendarRange)=>void;calendarLoading?:boolean;
    state: State | null;
    lessons: Lesson[];
    mutate: (x: Record<string, unknown>) => Promise<boolean>;
    open: Open;
    busy: boolean;
    view: "create" | "calendar" | "list";
}) {
    const can=useAdminAction();
    const plans = can("plans.view")?(state?.plans || []):(state?.planOptions || []).filter(plan=>plan.active).map(plan=>({...plan,teacher:plan.teacher||plan.teacherName}));
    const [filterTeacher, setFilterTeacher] = useFilterPreference<string>("courses-teacher", ""), [filterStudent, setFilterStudent] = useFilterPreference<string>("courses-student", ""), [cancelled, setCancelled] = useFilterPreference<boolean>("courses-cancelled", false);
    const [completion,setCompletion]=useFilterPreference<string>("courses-completion","all");
    const visible = lessons.filter(l => l.sessionType!=="group" && (l.status === "cancelled") === cancelled && (!state?.month || local(l.plannedStart).slice(0,7) === state.month) && (!filterTeacher || l.teacherName === filterTeacher) && (!filterStudent || l.student === filterStudent)&&(view!=="list"||matchesCourseCompletion(l,completion)));
    const groups = [...new Set(visible.map(l => l.teacherName))].sort();
    const [scheduleMode,setScheduleMode]=useState("one_to_one");
    const [listType,setListType]=useFilterPreference<string>("admin-course-list-type","one_to_one");
    const [student, setStudent] = useState("");
    const [scheduleTeacher,setScheduleTeacher]=useState("");
    const schedulePairs=plans.map(plan=>({teacher:plan.teacher,student:plan.student}));
    const [key, setKey] = useState("");
    const [kind, setKind] = useState("regular");
    const [start,setStart]=useState(""),[end,setEnd]=useState("");
    const [startDate="",startTime=""]=start.split("T"),endTime=end.split("T")[1]||"";
    const [until, setUntil] = useState("");
    const scheduleOptionsRef=useRef<HTMLDetailsElement>(null);
    const [replacementFor, setReplacementFor] = useState("");
    const [classroomId,setClassroomId]=useState(""),[classOptions,setClassOptions]=useState<ScheduleClassOption[]|null>(null),[classError,setClassError]=useState("");
    const classRequest=useRef(0);
    async function loadClasses(){const request=++classRequest.current;setClassOptions(null);setClassError("");try{const response=await groupFetch("/api/class-sessions?lang="+getLanguage(),{cache:"no-store"}),data=await readApiJson<{classes:ScheduleClassOption[];error?:string}>(response);if(!response.ok)throw Error(data.error||t("班级名单加载失败，请重试"));if(request===classRequest.current)setClassOptions(data.classes);}catch(error){if(request===classRequest.current)setClassError(error instanceof Error?error.message:t("班级名单加载失败，请重试"));}}
    useEffect(()=>{if(view==="create")void loadClasses();return()=>{classRequest.current++;};},[view,state?.revision]);
    const subjects = plans.filter(p => p.student === student&&(!scheduleTeacher||p.teacher===scheduleTeacher));
    const chosen = subjects.find(p => p.key === key);
    const eligibleClasses=chosen?(classOptions||[]).filter(item=>item.teacherName===chosen.teacher&&item.members.includes(student)&&item.planKeys.includes(chosen.key)):[];
    const selectedClassId=eligibleClasses.length===1?eligibleClasses[0].id:eligibleClasses.some(item=>item.id===classroomId)?classroomId:"";
    const classSelectionReady=classOptions!==null&&!classError&&(eligibleClasses.length===0||Boolean(selectedClassId));
    const independentLesson=classOptions!==null&&!classError&&eligibleClasses.length===0;
    const originals = lessons.filter(l => l.student === student && l.subject === chosen?.subject && ["student_absent", "teacher_absent", "cancelled"].includes(l.status));
    const scheduleSummary=chosen&&student&&startDate&&startTime&&endTime?[student,chosen.subject,`${start.replace("T"," ")}–${end.replace("T"," ")}`,kind==='regular'?'':t(kind==='makeup'?'补课':'临时加课'),until?`${getLanguage()==='zh'?'重复至':'Repeat until'} ${until}`:''].filter(Boolean).join(' · '):getLanguage()==='zh'?'填写课程和时间后，在这里核对排课。':'Choose a lesson and time to review the schedule here.';
    async function submit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!chosen||!classSelectionReady||!validLessonRange(start,end)) return;
        if (await mutate({ action: "create", student, subject: chosen.subject, teacherName: chosen.teacher, classroomId:selectedClassId, kind,
            start, end, until, replacementFor })) {
            setStudent("");setScheduleTeacher(""); setKey(""); setKind("regular"); setStart("");
            setEnd(""); setUntil(""); setReplacementFor("");setClassroomId("");
            if(scheduleOptionsRef.current)scheduleOptionsRef.current.open=false;
        }else if(scheduleOptionsRef.current&&(until||kind!=='regular'))scheduleOptionsRef.current.open=true;
    }
    if(view==="list")return <div className="course-query-stack">{can("reschedules.view")&&<PagedReschedules requestsOnly role="admin" month={state?.month||""} mutate={mutate} busy={busy}/>}<div className="course-type-switch" role="group" aria-label={t("课程类型")}><Button variant={listType!=="group"?"default":"outline"} aria-pressed={listType!=="group"} onClick={()=>setListType("one_to_one")}>{t("一对一课程")}</Button><Button variant={listType==="group"?"default":"outline"} aria-pressed={listType==="group"} onClick={()=>setListType("group")}>{t("整班课次")}</Button></div>{listType==="group"?<PagedGroupSessions onOpenFinance={onOpenFinance} role="admin" month={state?.month||""} classrooms={state?.classroomOptions||state?.classrooms} mutate={mutate} busy={busy}/>:<PagedLessonRows title="课程列表" month={state?.month||""} teachers={state?.teachers} students={state?.students} renderTools={rows=><BulkDeleteTool kind="lesson" records={rows.map(l=>({id:l.id,label:l.student+" · "+l.subject+" · "+day(l.plannedStart)+" "+time(l.plannedStart)}))} mutate={mutate} busy={busy}/>} renderLesson={l=><LessonCard key={l.id} lesson={l} admin open={open} mutate={mutate} busy={busy}/>}/>}</div>;
    return <div className="schedule-layout schedule-single-view course-wave2">{view==="create"&&<div className="class-session-mode" role="group" aria-label={t("排课方式")}><Button variant={scheduleMode==="one_to_one"?"default":"outline"} onClick={()=>setScheduleMode("one_to_one")}>{t("一对一课程")}</Button><Button variant={scheduleMode==="group"?"default":"outline"} onClick={()=>setScheduleMode("group")}>{t("整班课程")}</Button></div>}{view==="create"&&scheduleMode==="group"&&<GroupSessionPlanner mutate={mutate} busy={busy}/>}<section className="panel create-panel" hidden={view !== "create"||scheduleMode!=="one_to_one"}><h2>{t("一对一课程")}</h2>
        <form className="schedule-edit-form form-action-surface" onSubmit={submit} onInvalidCapture={event=>{if(scheduleOptionsRef.current?.contains(event.target as Node))scheduleOptionsRef.current.open=true;}}>
            <div className="schedule-person-filters"><DirectoryFilters selectionMode="choose" teachers={[...new Set([...(state?.teachers||[]),...plans.map(plan=>plan.teacher)])].sort()} students={[...new Set([...(state?.students||[]),...plans.map(plan=>plan.student)])].sort()} pairs={schedulePairs} teacher={scheduleTeacher} student={student} onTeacher={value=>{setScheduleTeacher(value);setKey('');setReplacementFor('');setClassroomId('');}} onStudent={value=>{setStudent(value);setKey('');setReplacementFor('');setClassroomId('');}}/></div>
            {student && <label>{t("学生科目配对")}<select required value={key} onChange={e => { const plan=subjects.find(item=>item.key===e.target.value);setKey(e.target.value);if(plan)setScheduleTeacher(plan.teacher); setReplacementFor("");setClassroomId(""); }}><option value="">{t("请选择")}</option>{subjects.map(p => <option value={p.key} key={p.key}>{p.subject} · {p.teacher}</option>)}</select></label>}
            {(student&&!subjects.length||!plans.length)&&<p className="muted">{t('请先设置学生课程，再安排老师与学生的课程。')}</p>}
            {chosen && <p className="assigned-teacher">{t("负责老师")}：<strong>{chosen.teacher}</strong></p>}
            {chosen&&<div className="schedule-classroom-field"><div className="field-heading"><label htmlFor="lesson-classroom">{t("所属班级")}</label><Button type="button" variant="ghost" size="sm" aria-label={t("刷新班级名单")} disabled={classOptions===null&&!classError} onClick={()=>void loadClasses()}><RefreshCw size={16} aria-hidden="true"/>{t("刷新")}</Button></div><select id="lesson-classroom" required={!independentLesson} data-testid="lesson-classroom-select" value={selectedClassId} disabled={classOptions===null||busy||independentLesson} onChange={event=>setClassroomId(event.target.value)}>{eligibleClasses.length!==1&&<option value="">{independentLesson?(getLanguage()==="zh"?"独立课程（不关联班级）":"Independent lesson (no class)"):t("请选择有效班级")}</option>}{eligibleClasses.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select>{classOptions===null&&!classError?<p role="status" className="muted">{t("正在加载班级…")}</p>:classError?<p role="alert" className="notice">{classError} <Button type="button" variant="outline" onClick={()=>void loadClasses()}>{t("重试")}</Button></p>:<p className="muted">{independentLesson?(getLanguage()==="zh"?"使用现有科目配对安排一对一课程。":"Schedule an individual lesson using the existing subject pairing."):t(eligibleClasses.length===1?"已自动选择对应班级。":"请选择本次课程的班级。")}</p>}</div>}
            <LessonTimeRange start={start} end={end} disabled={busy} onChange={(a,b)=>{setStart(a);setEnd(b);}}/>
            <ConflictPreview enabled={Boolean(chosen && classSelectionReady && validLessonRange(start,end))} value={{ action: "create", student, subject: chosen?.subject, teacherName: chosen?.teacher,classroomId:selectedClassId, start, end, until }}/>
            <details ref={scheduleOptionsRef} className="schedule-extra-options" data-testid="schedule-extra-options"><summary>{getLanguage()==='zh'?'重复与其他设置':'Repeat and other options'}{(until||kind!=='regular')&&<span>{getLanguage()==='zh'?'已设置':'Set'}</span>}</summary><div>
              <label>{t("课程类型")}<select value={kind} onChange={e => setKind(e.target.value)}><option value="regular">{t("常规课程")}</option><option value="extra">{t("临时加课")}</option><option value="makeup">{t("补课")}</option></select></label>
              {kind === "makeup" && student&&chosen&&classSelectionReady&&<MakeupOriginalPicker key={student+chosen.key+selectedClassId} student={student} subject={chosen.subject} value={replacementFor} onChange={setReplacementFor}/>}
              <label>{t("每周重复至（可留空）")}<DateInput type="date" value={until} onChange={e => setUntil(e.target.value)}/></label>
            </div></details>
            <FormActionBar summary={scheduleSummary}><Button adminGrant="lessons.create" disabled={busy || !chosen || !classSelectionReady} className="primary-full">{t("保存排课")}</Button></FormActionBar>
        </form></section>
        {view==="create"&&<details className="course-existing-sessions"><summary>{t("已安排的整班课次")}</summary><PagedGroupSessions role={state?.account.role==="teacher"?"teacher":"admin"} month={state?.month||""} mutate={mutate} busy={busy}/></details>}
        <section className="panel" hidden={view === "create"}>
            {view === "calendar" && <LessonCalendar loading={calendarLoading} date={calendarDate} onDateChange={onCalendarDateChange} onRangeChange={onCalendarRangeChange} lessons={lessons.filter(l => l.status !== "cancelled")} teachers={state?.teachers || []} proposals={state?.proposals || []} onSelect={id => { const lesson = lessons.find(l => l.id === id); if (lesson) open({ type: "edit", lesson }); }}/>}

        </section>
    </div>;
}
