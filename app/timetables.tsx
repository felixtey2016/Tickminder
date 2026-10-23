"use client";
import {ClassSessionLabel} from "@/components/class-session-label";
import {sessionLessonTitle} from "@/lib/class-session-display";
import { useFilterPreference } from "@/lib/filter-preferences";
import { Button } from "@/components/ui/button";
import { getLanguage, t } from "@/lib/i18n";
import { formatDurationHours } from "@/lib/duration-format";
import {type TimetableLesson} from "@/lib/timetable";
import type {CoursePage,CourseTimetableSummary} from '@/lib/course-query';
import {useEffect,useState} from 'react';
import {groupFetch} from '@/lib/group-client';
import {readApiJson} from '@/lib/action-feedback';

type Props = {
  type: "student" | "teacher";
  lessons: TimetableLesson[];
  students: string[];
  teachers: string[];
  month: string;
  setMonth: (month: string) => void;
};

function date(iso: string) {
  return new Intl.DateTimeFormat(getLanguage() === "zh" ? "zh-CN" : "en-GB", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "short", day: "numeric", weekday: "short",
  }).format(new Date(iso));
}
function clock(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

type TimetablePage=CoursePage<TimetableLesson>&{summary:CourseTimetableSummary;studentOptions?:string[]};
export function Timetable({ type, students, teachers, month, setMonth }: Props) {
  const [name, setName] = useFilterPreference<string>(`timetable-${type}-name`, "");
  const [studentFilter, setStudentFilter] = useFilterPreference<string>(`timetable-${type}-student`, "");
  const names = type === "student" ? students : teachers;
  const filterKey=JSON.stringify([type,name,month,type==='teacher'?studentFilter:'']);
  const [paging,setPaging]=useState({key:'',page:1}),page=paging.key===filterKey?paging.page:1;
  const requestKey=filterKey+'|'+page;
  const [version,setVersion]=useState(0),[result,setResult]=useState<{key:string;data:TimetablePage|null;loading:boolean;error:string}>({key:'',data:null,loading:false,error:''});
  useEffect(()=>{const reload=()=>setVersion(v=>v+1);window.addEventListener('tickminder:data-changed',reload);return()=>window.removeEventListener('tickminder:data-changed',reload);},[]);
  useEffect(()=>{
    if(!name){setResult({key:requestKey,data:null,loading:false,error:''});return;}
    const controller=new AbortController(),key=requestKey;
    const params=new URLSearchParams({view:'lessons',mode:'timetable',timetableType:type,month,page:String(page),...(type==='student'?{student:name}:{teacher:name,...studentFilter?{student:studentFilter}:{}})});
    setResult({key,data:null,loading:true,error:''});
    void groupFetch('/api/courses?'+params,{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await readApiJson<TimetablePage&{error?:string}>(response);if(!response.ok)throw Error(data.error||t('资料暂时无法载入，请稍后刷新'));if(!controller.signal.aborted)setResult({key,data,loading:false,error:''});}).catch(error=>{if(!controller.signal.aborted)setResult({key,data:null,loading:false,error:error instanceof Error?error.message:t('资料暂时无法载入，请稍后刷新')});});
    return()=>controller.abort();
  },[requestKey,name,type,month,page,studentFilter,version]);
  const current=result.key===requestKey?result:{key:requestKey,data:null,loading:Boolean(name),error:''},rows=current.data?.items||[],teacherStudents=current.data?.studentOptions||[],summary=current.data?.summary;
  const setPage=(page:number)=>setPaging({key:filterKey,page});
  return <section className="panel timetable-panel">
    <div className="section-head"><div><h2>{type === "student" ? t("学生时间表") : t("老师时间表")}</h2></div></div>
    <div className="timetable-filters">
      <label>{type === "student" ? t("学生姓名") : t("老师姓名")}<select value={name} onChange={e => { setName(e.target.value); setStudentFilter(""); }}><option value="">{t("请选择")}</option>{names.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label>{t("月份")}<input type="month" value={month} onChange={e => setMonth(e.target.value)}/></label>
      {type === "teacher" && <label>{t("学生姓名（可选）")}<select value={studentFilter} disabled={!name} onChange={e => setStudentFilter(e.target.value)}><option value="">{t("所有学生")}</option>{teacherStudents.map(n => <option key={n} value={n}>{n}</option>)}</select></label>}
    </div>
    <div className="timetable-actions"><Button type="button" size="sm" variant="outline" onClick={()=>{setName("");setStudentFilter("");}}>{t("重置筛选")}</Button></div>
    {name ? current.loading?<p role="status">{t('正在加载…')}</p>:current.error?<div role="alert"><p>{t(current.error)}</p><Button variant="outline" onClick={()=>setVersion(v=>v+1)}>{t('重试')}</Button></div>:<>{summary&&<div className="timetable-summary"><strong>{summary.lessonCount} {t("堂课")}</strong><span>{t("课程总时长")} · {formatDurationHours(summary.durationMilliseconds/3600000, getLanguage())}</span><span>{summary.completedCount} {t("堂已完成")}</span></div>}
      <p className="muted">{t("已完成按实际时长，其余按安排时长计算。")}</p>
      <div className="timetable-list">{rows.length ? rows.map(l => {
        const checkedIn = l.status === "completed" && Boolean(l.actualStart && l.actualEnd);
        return <article className="timetable-row" key={l.id}>
          <div className="timetable-date"><strong>{date(l.plannedStart)}</strong><span>{clock(l.plannedStart)}–{clock(l.plannedEnd)}</span></div>
          <div className="timetable-lesson"><ClassSessionLabel lesson={l}/><strong>{type === "student" ? l.subject : `${sessionLessonTitle(l)} · ${l.subject}`}</strong><small>{type === "student" ? l.teacherName : studentFilter ? l.subject : l.student}{l.status === "student_absent" ? ` · ${t("学生缺席")}` : l.status === "teacher_absent" ? ` · ${t("老师缺席")}` : ""}</small>{checkedIn && l.actualStart && l.actualEnd && (l.actualStart !== l.plannedStart || l.actualEnd !== l.plannedEnd) && <small>{t("实际时间")} {clock(l.actualStart)}–{clock(l.actualEnd)}</small>}</div>
          {checkedIn && <span className="timetable-check" aria-label={t("已记录出席")} title={t("已记录出席")}>√</span>}
        </article>;
      }) : <div className="empty">{t("所选月份没有课程")}</div>}</div>{current.data&&current.data.pages>1&&<nav className="timetable-actions" aria-label={t('分页')}><Button variant="outline" disabled={current.data.page<=1} onClick={()=>setPage(current.data!.page-1)}>{t('上一页')}</Button><span>{current.data.page} / {current.data.pages}</span><Button variant="outline" disabled={current.data.page>=current.data.pages} onClick={()=>setPage(current.data!.page+1)}>{t('下一页')}</Button></nav>}</> : <div className="empty">{type === "student" ? t("请选择学生查看时间表") : t("请选择老师查看时间表")}</div>}
  </section>;
}
