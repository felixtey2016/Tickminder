"use client";
import {useEffect,useRef,useState} from "react";
import {CalendarDays,RefreshCw} from "lucide-react";
import {Button} from "@/components/ui/button";
import {groupFetch} from "@/lib/group-client";
import {readApiJson} from "@/lib/action-feedback";
import {getLanguage,t} from "@/lib/i18n";
import {RecordingCreateButton} from "./recordings-workspace";
import {OnlineLessonLink} from "./online-lesson-link";
import {CourseCompletionFilter} from "@/components/course-completion-filter";
import {courseIsCompleted,matchesCourseCompletion} from "@/lib/course-completion";
import {useFilterPreference} from "@/lib/filter-preferences";

type ClassroomSession={id:string;sessionType:string;classroomId:string|null;classroomTitle:string|null;subject:string;teacherName:string;plannedStart:string;plannedEnd:string;status:string;teachingStatus?:string;onlineLink:string|null;participantCount:number;participants:Array<{lessonId:string;studentName:string}>};
const labels:Record<string,string>={scheduled:"已安排",completed:"已上课",student_absent:"学生缺席",teacher_absent:"老师缺席",cancelled:"已取消",not_taught:"未授课"};
function displayedStatus(session:ClassroomSession){if(session.status==='cancelled')return 'cancelled';if(courseIsCompleted(session))return 'completed';return session.sessionType==='group'&&['teacher_absent','not_taught'].includes(session.teachingStatus||'')?session.teachingStatus!:session.status;}
function when(value:string){return new Intl.DateTimeFormat(getLanguage()==="zh"?"zh-CN":"en-GB",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(value));}

export function ClassroomSchedule({classroomId,onCalendar,canAddRecording=false}:{classroomId:string;onCalendar:()=>void;canAddRecording?:boolean}){
 const [completion,setCompletion]=useFilterPreference<string>('classroom-schedule-completion','all');
 const [sessions,setSessions]=useState<ClassroomSession[]|null>(null),[error,setError]=useState(""),[limit,setLimit]=useState(30),[cancelled,setCancelled]=useState(false),generation=useRef(0);
 async function load(){const gen=++generation.current;setSessions(null);setError("");try{const response=await groupFetch("/api/class-sessions?classroomId="+encodeURIComponent(classroomId)+"&lang="+getLanguage(),{cache:"no-store"}),data=await readApiJson<{sessions:ClassroomSession[];error?:string}>(response);if(!response.ok)throw Error(data.error||t("班级课程加载失败，请重试"));if(gen===generation.current)setSessions(data.sessions);}catch(error){if(gen===generation.current)setError(error instanceof Error?error.message:t("班级课程加载失败，请重试"));}}
 useEffect(()=>{setLimit(30);setCancelled(false);void load();return()=>{generation.current++;};},[classroomId]);
 const rows=(sessions||[]).filter(session=>(cancelled||session.status!=="cancelled")&&matchesCourseCompletion(session,completion)).sort((a,b)=>a.plannedStart.localeCompare(b.plannedStart));
 return <section className="panel classroom-schedule" data-testid="classroom-schedule"><div className="learning-section-head"><h2>{t("班级课程安排")}</h2><div className="learning-card-actions"><Button type="button" variant="outline" disabled={sessions===null&&!error} onClick={()=>void load()}><RefreshCw size={16}/>{t("刷新")}</Button><Button type="button" variant="outline" onClick={onCalendar}><CalendarDays size={16}/>{t("查看课程日历")}</Button></div></div>
  <CourseCompletionFilter value={completion} onChange={value=>{setCompletion(value);setLimit(30);}} testId="classroom-completion-filter"/><label className="check-row"><input type="checkbox" checked={cancelled} onChange={event=>{setCancelled(event.target.checked);setLimit(30);}}/>{t("查看已取消课程")}</label>
  {error?<p role="alert" className="notice">{error} <Button type="button" variant="outline" onClick={()=>void load()}>{t("重试")}</Button></p>:sessions===null?<p role="status">{t("正在加载…")}</p>:!rows.length?<p className="muted">{t("此班级暂无课程安排")}</p>:<><p className="muted">{rows.length} {t("堂课")} · GMT+8</p><div className="classroom-session-list">{rows.slice(0,limit).map(session=><article className="classroom-session-item" key={session.id} data-testid="classroom-session-item"><div><span className="classroom-session-type">{t(session.sessionType==="group"?"整班课程":"一对一课程")}</span><span className={"status status-"+displayedStatus(session)}>{t(labels[displayedStatus(session)]||displayedStatus(session))}</span></div><strong>{when(session.plannedStart)} – {when(session.plannedEnd)}</strong><p>{session.subject} · {session.teacherName}</p><p>{session.participants.map(participant=>participant.studentName).join("、")}</p><OnlineLessonLink href={session.onlineLink}/>{canAddRecording&&session.status!=="cancelled"&&<div className="learning-card-actions"><RecordingCreateButton classroomId={classroomId} sessionId={session.id} lessonDate={new Date(Date.parse(session.plannedStart)+8*3600_000).toISOString().slice(0,10)} title={session.subject}/></div>}</article>)}</div>{rows.length>limit&&<Button type="button" variant="outline" onClick={()=>setLimit(value=>value+30)}>{t("显示更多课程")}</Button>}</>}
 </section>;
}
