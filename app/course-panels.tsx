"use client";
import {useState,type ReactNode} from 'react';
import {Button} from '@/components/ui/button';
import {CourseCompletionFilter} from '@/components/course-completion-filter';
import {DirectoryFilters} from './directory-tools';
import {SessionAttendanceBoard} from './session-attendance';
import type {AttendanceSession} from '@/lib/attendance-types';
import {GroupSessionBoard,type GroupSession,type GroupSessionRequest} from './class-session-schedule';
import {ReschedulePanel,RescheduleRequestDialog,type RescheduleProposal} from './reschedule-panel';
import {StudentLessonList} from './student-lesson-list';
import {useFilterPreference} from '@/lib/filter-preferences';
import type {SessionLesson} from '@/lib/class-session-display';
import type {CourseTeachingSummary} from '@/lib/course-query';
import {formatDurationMilliseconds} from '@/lib/duration-format';
import {getLanguage,t} from '@/lib/i18n';
import {CoursePageState,CoursePagination,useCoursePage,useCoursePageNumber,type CoursePageResponse} from './course-query-ui';
import './course-query.css';

export type CourseLesson=SessionLesson&{id:string;student:string;subject:string;teacherName:string;plannedStart:string;plannedEnd:string;actualStart:string|null;actualEnd:string|null;status:string;attendanceKind?:string|null;note?:string|null;chargeable?:boolean|null;reviewedAt?:string|null;kind:string;seriesId:string|null;replacementFor:string|null;onlineLink?:string|null};
type Mutate=(body:Record<string,unknown>)=>Promise<boolean>;
type Options={teachers?:string[];students?:string[];classrooms?:Array<{id:string;title:string}>};
const stamp=(value:string)=>new Date(value).toLocaleString(getLanguage()==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'short'});
function FilterFields({teachers=[],students=[],teacher,student,setTeacher,setStudent}:{teachers?:string[];students?:string[];teacher:string;student:string;setTeacher:(s:string)=>void;setStudent:(s:string)=>void}){
 return teachers.length||students.length?<DirectoryFilters teachers={teachers} students={students} teacher={teacher} student={student} onTeacher={setTeacher} onStudent={setStudent}/>:null;
}
export function PagedAttendanceBoard({role,mode='month',month,mutate,busy,teachers=[],students=[],classrooms=[]}:Options&{role:'admin'|'teacher';mode?:'month'|'records'|'pending'|'review';month:string;mutate:Mutate;busy:boolean}){
 const [teacher,setTeacher]=useState(''),[student,setStudent]=useState(''),[classroomId,setClassroom]=useState(''),[completion,setCompletion]=useFilterPreference<string>('paged-attendance-completion','all');
 const base={view:'sessions',mode,month,teacher,student,classroomId,completion:mode==='month'?completion:'all'},[page,setPage]=useCoursePageNumber(base),query=useCoursePage<AttendanceSession>({...base,page:String(page)}),classOptions=query.data?.classroomOptions||classrooms;
 return <div className="course-query-stack">{(role==='admin'||mode==='month')&&<section className="panel course-query-filters"><FilterFields teachers={teachers} students={students} teacher={teacher} student={student} setTeacher={setTeacher} setStudent={setStudent}/>{(classOptions.length>0||classroomId)&&<label>{t('筛选班级')}<select value={classroomId} onChange={e=>setClassroom(e.target.value)}><option value="">{t('全部班级')}</option>{classOptions.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>}{mode==='month'&&<CourseCompletionFilter value={completion} onChange={setCompletion} testId="paged-attendance-completion"/>}</section>}<CoursePageState {...query} retry={query.reload}>{query.data&&<><SessionAttendanceBoard serverMode total={query.data.total} sessions={query.data.items} role={role} mode={mode==='records'?'records':mode==='review'?'review':mode==='pending'?'attention':'lessons'} mutate={mutate} busy={busy}/><CoursePagination data={query.data} onChange={setPage}/></>}</CoursePageState></div>;
}
export function PagedLessonRows({mode='month',month,teachers=[],students=[],renderLesson,sessionType='one_to_one',title,renderTools}:{mode?:'month'|'makeup'|'upcoming';month:string;teachers?:string[];students?:string[];renderLesson:(lesson:CourseLesson)=>ReactNode;sessionType?:string;title?:string;renderTools?:(lessons:CourseLesson[])=>ReactNode}){
 const [teacher,setTeacher]=useState(''),[student,setStudent]=useState(''),[cancelled,setCancelled]=useState(false),[completion,setCompletion]=useFilterPreference<string>('paged-individual-completion','all');
 const base={view:'lessons',mode,month,teacher,student,sessionType,cancelled:cancelled?'1':'0',completion:mode==='month'?completion:'all'},[page,setPage]=useCoursePageNumber(base),query=useCoursePage<CourseLesson>({...base,page:String(page)});
 return <section className="panel course-query-stack"><h2>{t(title||'一对一课程')}</h2>{mode==='month'&&<div className="course-query-filters"><FilterFields teachers={teachers} students={students} teacher={teacher} student={student} setTeacher={setTeacher} setStudent={setStudent}/><CourseCompletionFilter value={completion} onChange={setCompletion} testId="paged-individual-completion"/><label className="check-row"><input type="checkbox" checked={cancelled} onChange={e=>setCancelled(e.target.checked)}/>{t('查看已取消课程')}</label></div>}<CoursePageState {...query} retry={query.reload}>{query.data&&<><span>{query.data.total} {t('堂课')}</span>{renderTools?.(query.data.items)}<div className="lesson-stack">{query.data.items.map(renderLesson)}</div>{!query.data.total&&<p className="muted">{t('没有符合条件的记录')}</p>}<CoursePagination data={query.data} onChange={setPage}/></>}</CoursePageState></section>;
}
export function PagedGroupSessions({role,month,mode='month',mutate,busy,classrooms=[]}:Options&{role:'admin'|'teacher';month:string;mode?:'month'|'upcoming';mutate:Mutate;busy:boolean}){
 const [classroomId,setClassroom]=useState(''),[cancelled,setCancelled]=useState(false),[completion,setCompletion]=useFilterPreference<string>('paged-group-completion','all');
 const base={view:'sessions',mode,month,sessionType:'group',classroomId,cancelled:cancelled?'1':'0',completion},[page,setPage]=useCoursePageNumber(base),query=useCoursePage<GroupSession>({...base,page:String(page)}),classOptions=query.data?.classroomOptions||classrooms;
 return <div className="course-query-stack"><section className="panel course-query-filters">{(classOptions.length>0||classroomId)&&<label>{t('筛选班级')}<select value={classroomId} onChange={e=>setClassroom(e.target.value)}><option value="">{t('全部班级')}</option>{classOptions.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>}<CourseCompletionFilter value={completion} onChange={setCompletion} testId="paged-group-completion"/>{mode==='month'&&<label className="check-row"><input type="checkbox" checked={cancelled} onChange={e=>setCancelled(e.target.checked)}/>{t('查看已取消课程')}</label>}</section><CoursePageState {...query} retry={query.reload}>{query.data&&<><GroupSessionBoard serverMode total={query.data.total} sessions={query.data.items} requests={[]} role={role} mutate={mutate} busy={busy}/><CoursePagination data={query.data} onChange={setPage}/></>}</CoursePageState></div>;
}
type RequestsPage=CoursePageResponse<RescheduleProposal>&{lessons:CourseLesson[];classSessions:GroupSession[];proposals:RescheduleProposal[];classSessionRequests:GroupSessionRequest[]};
export function PagedReschedules({role,month,mutate,busy,requestsOnly=false}: {role:'admin'|'teacher'|'student';month:string;mutate:Mutate;busy:boolean;requestsOnly?:boolean}){
 const base={view:'reschedules',mode:'pending',month,sessionType:role==='admin'?'group':role==='student'?'one_to_one':''},[page,setPage]=useCoursePageNumber(base),query=useCoursePage<RescheduleProposal>({...base,page:String(page)}),data=query.data as RequestsPage|null;
 const [request,setRequest]=useState<CourseLesson|null>(null);
 return <div className="course-query-stack"><CoursePageState {...query} retry={query.reload}>{data&&<>{role!=='student'&&data.classSessionRequests.length>0&&<GroupSessionBoard serverMode sessions={data.classSessions} requests={data.classSessionRequests} role={role} mutate={mutate} busy={busy}/ >}{role!=='admin'&&<ReschedulePanel role={role} lessons={data.lessons} proposals={data.proposals} mutate={mutate} busy={busy}/>}<CoursePagination data={data} onChange={setPage}/></>}</CoursePageState>{!requestsOnly&&role!=='admin'&&<>{role==='teacher'&&<PagedGroupSessions role={role} month={month} mode="upcoming" mutate={mutate} busy={busy}/>}<PagedLessonRows mode="upcoming" month={month} title="接下来的课" renderLesson={l=><article className="portal-card" key={l.id}><div><strong>{l.student} · {l.subject}</strong><span>{stamp(l.plannedStart)} · {l.teacherName}</span></div><Button variant="outline" disabled={busy} onClick={()=>setRequest(l)}>{t('申请改期')}</Button></article>}/></>}<RescheduleRequestDialog key={request?.id||'closed'} lesson={request} close={()=>setRequest(null)} mutate={mutate} busy={busy}/></div>;
}
export function PagedStudentLessons({month,proposals,onRequest,busy}:{month:string;proposals:RescheduleProposal[];onRequest:(lesson:CourseLesson)=>void;busy:boolean}){
 const [completion,setCompletion]=useFilterPreference<string>('student-courses-completion','all'),base={view:'lessons',mode:'month',month,completion},[page,setPage]=useCoursePageNumber(base),query=useCoursePage<CourseLesson>({...base,page:String(page)});
 return <div className="course-query-stack"><section className="panel"><CourseCompletionFilter value={completion} onChange={setCompletion} testId="student-course-completion-filter"/></section><CoursePageState {...query} retry={query.reload}>{query.data&&<>{!query.data.total&&<p className="muted">{t("没有符合条件的记录")}</p>}<StudentLessonList serverMode lessons={query.data.items} proposals={proposals} busy={busy} onRequestReschedule={id=>{const l=query.data?.items.find(l=>l.id===id);if(l)onRequest(l);}}/><CoursePagination data={query.data} onChange={setPage}/></>}</CoursePageState></div>;
}
export function TeachingSummary({summary}:{summary?:CourseTeachingSummary}){
 return <section className="panel teaching-hours"><h2>{summary?.month} · {t('老师授课时长')}</h2>{summary?<><div className="timetable-summary"><strong>{formatDurationMilliseconds(summary.recordedMilliseconds,getLanguage())} · {t('已登记')}</strong><span>{formatDurationMilliseconds(summary.approvedMilliseconds,getLanguage())} · {t('已确认考勤')}</span><span>{summary.count} {t('堂课')}</span></div><p className="muted">{t('按课次实际授课起止时间计算，整班只计一次；按实际开始日期归属月份。')}</p></>:<p role="status">{t('正在加载…')}</p>}</section>;
}
export function MakeupOriginalPicker({student,subject,value,onChange}:{student:string;subject:string;value:string;onChange:(id:string)=>void}){
 const base={view:'lessons',mode:'originals',student,subject},[page,setPage]=useCoursePageNumber(base),query=useCoursePage<CourseLesson>({...base,page:String(page)});
 return <CoursePageState {...query} retry={query.reload}>{query.data&&<div className="course-query-stack"><label>{t('关联原课程')}<select required value={value} onChange={e=>onChange(e.target.value)}><option value="">{t('请选择')}</option>{query.data.items.map(l=><option key={l.id} value={l.id}>{stamp(l.plannedStart)} · {l.student} · {l.subject}</option>)}</select></label><CoursePagination data={query.data} onChange={page=>{onChange('');setPage(page);}}/></div>}</CoursePageState>;
}
