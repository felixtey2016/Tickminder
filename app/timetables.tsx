"use client";
import {displayFormatter} from '@/lib/display-preferences';
import {MonthInput} from '@/components/month-input';
import {ClassSessionLabel} from "@/components/class-session-label";
import {sessionLessonTitle} from "@/lib/class-session-display";
import {FilterScope,useFilterPreference} from "@/lib/filter-preferences";
import {Button} from "@/components/ui/button";
import {getLanguage,t} from "@/lib/i18n";
import {formatDurationHours} from "@/lib/duration-format";
import {type TimetableLesson} from "@/lib/timetable";
import {useContext,useEffect,useState} from 'react';
import {isTeacherStudentPair,teacherStudentOptions} from '@/lib/teacher-student-options';
import {useCoursePage} from './course-query-ui';

type Props={type:'student'|'teacher';lessons:TimetableLesson[];students:string[];teachers:string[];month:string;setMonth:(month:string)=>void};
function date(iso:string){return new Intl.DateTimeFormat(getLanguage()==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'short',day:'numeric',weekday:'short'}).format(new Date(iso));}
function clock(iso:string){return displayFormatter('en-GB',{timeZone:'Asia/Kuala_Lumpur',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));}
export function Timetable({type,students,teachers,month,setMonth}:Props){
 const scope=useContext(FilterScope),[name,setName]=useFilterPreference<string>(`timetable-${type}-name`,''),[studentFilter,setStudentFilter]=useFilterPreference<string>(`timetable-${type}-student`,''),[teacherFilter,setTeacherFilter]=useFilterPreference<string>(`timetable-${type}-teacher`,'');
 const base={view:'lessons',mode:'timetable',timetableType:type,month},options=useCoursePage<TimetableLesson>({...base,optionsOnly:'1'}),optionsKey=JSON.stringify([scope,type,month,options.key]);
 const pairs=options.data?.teacherStudentPairs||[],ready=Boolean(options.data)&&!options.loading&&!options.error;
 const allTeachers=[...new Set([...teachers,...pairs.map(pair=>pair.teacher)])],allStudents=[...new Set([...students,...pairs.map(pair=>pair.student)])];
 const available=teacherStudentOptions(allTeachers,allStudents,pairs,'',''),rawSecondary=type==='teacher'?studentFilter:teacherFilter,availableSecondary=type==='teacher'?available.students:available.teachers,knownSecondary=availableSecondary.includes(rawSecondary)?rawSecondary:'';
 const validPair=isTeacherStudentPair(pairs,type==='teacher'?name:knownSecondary,type==='student'?name:knownSecondary),secondary=validPair?knownSecondary:'';
 const linked=teacherStudentOptions(allTeachers,allStudents,pairs,type==='teacher'?name:secondary,type==='student'?name:secondary),names=type==='student'?linked.students:linked.teachers,secondaryNames=type==='teacher'?linked.students:linked.teachers;
 const selectedName=ready&&names.includes(name)?name:'',selectedSecondary=ready&&secondaryNames.includes(secondary)?secondary:'';
 useEffect(()=>{if(!ready)return;if(name&&!names.includes(name))setName('');if(rawSecondary&&!availableSecondary.includes(rawSecondary)||!validPair){if(type==='teacher')setStudentFilter('');else setTeacherFilter('');}},[ready,optionsKey,name,validPair,rawSecondary,type,JSON.stringify(names),JSON.stringify(availableSecondary),setName,setStudentFilter,setTeacherFilter]);
 function changeName(value:string){setName(value);if(!isTeacherStudentPair(pairs,type==='teacher'?value:teacherFilter,type==='student'?value:studentFilter)){if(type==='teacher')setStudentFilter('');else setTeacherFilter('');}}
 function changeSecondary(value:string){if(type==='teacher')setStudentFilter(value);else setTeacherFilter(value);if(!isTeacherStudentPair(pairs,type==='teacher'?name:value,type==='student'?name:value))setName('');}
 const filterKey=JSON.stringify([scope,type,selectedName,month,selectedSecondary]),[paging,setPaging]=useState({key:'',page:1}),page=paging.key===filterKey?paging.page:1;
 const current=useCoursePage<TimetableLesson>(ready&&selectedName?{...base,page:String(page),...(type==='student'?{student:selectedName,...selectedSecondary?{teacher:selectedSecondary}:{}}:{teacher:selectedName,...selectedSecondary?{student:selectedSecondary}:{}})}:null,undefined,options.optionsSnapshot);
 // A changed revision discovered by details must also refresh the visible
 // selectors; the full fallback response must not leave the old menu in place.
 useEffect(()=>{if(current.data&&options.data&&!current.loading&&!options.loading&&current.data.revision!==options.data.revision)options.reload();},[current.data?.revision,options.data?.revision,current.loading,options.loading,options.reload]);
 const rows=current.data?.items||[],summary=current.data?.summary,setPage=(page:number)=>setPaging({key:filterKey,page});
 return <section className="panel timetable-panel">
  <div className="section-head"><div><h2>{t(type==='student'?'学生时间表':'老师时间表')}</h2></div></div>
  <div className="timetable-filters">
   <label>{t(type==='student'?'学生姓名':'老师姓名')}<select aria-label={t(type==='student'?'学生姓名':'老师姓名')} disabled={!ready} value={selectedName} onChange={e=>changeName(e.target.value)}><option value="">{t('请选择')}</option>{names.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
   <label>{t(type==='teacher'?'学生姓名':'老师姓名')}<select aria-label={t(type==='teacher'?'学生姓名':'老师姓名')} disabled={!ready} value={selectedSecondary} onChange={e=>changeSecondary(e.target.value)}><option value="">{t(type==='teacher'?'所有学生':'所有老师')}</option>{secondaryNames.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
   <label>{t('月份')}<MonthInput type="month" aria-label={t('月份')} value={month} onChange={e=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))setMonth(e.target.value);}}/></label>
  </div>
  <div className="timetable-actions"><Button type="button" size="sm" variant="outline" onClick={()=>{setName('');setStudentFilter('');setTeacherFilter('');}}>{t('重置筛选')}</Button></div>
  {options.loading?<p role="status">{t('正在加载…')}</p>:options.error?<div role="alert"><p>{options.error}</p><Button type="button" variant="outline" onClick={options.reload}>{t('重试')}</Button></div>:selectedName?current.loading?<p role="status">{t('正在加载…')}</p>:current.error?<div role="alert"><p>{t(current.error)}</p><Button type="button" variant="outline" onClick={current.reload}>{t('重试')}</Button></div>:<>
   {summary&&<div className="timetable-summary"><strong>{summary.lessonCount} {t('堂课')}</strong><span>{t('课程总时长')} · {formatDurationHours(summary.durationMilliseconds/3600000,getLanguage())}</span><span>{summary.completedCount} {t('堂已完成')}</span></div>}
   <p className="muted">{t('已完成按实际时长，其余按安排时长计算。')}</p>
   <div className="timetable-list">{rows.length?rows.map(lesson=>{const checked=lesson.status==='completed'&&Boolean(lesson.actualStart&&lesson.actualEnd);return <article className="timetable-row" key={lesson.id}><div className="timetable-date"><strong>{date(lesson.plannedStart)}</strong><span>{clock(lesson.plannedStart)}–{clock(lesson.plannedEnd)}</span></div><div className="timetable-lesson"><ClassSessionLabel lesson={lesson}/><strong>{type==='student'?lesson.subject:`${sessionLessonTitle(lesson)} · ${lesson.subject}`}</strong><small>{type==='student'?lesson.teacherName:selectedSecondary?lesson.subject:lesson.student}{lesson.status==='student_absent'?` · ${t('学生缺席')}`:lesson.status==='teacher_absent'?` · ${t('老师缺席')}`:''}</small>{checked&&lesson.actualStart&&lesson.actualEnd&&(lesson.actualStart!==lesson.plannedStart||lesson.actualEnd!==lesson.plannedEnd)&&<small>{t('实际时间')} {clock(lesson.actualStart)}–{clock(lesson.actualEnd)}</small>}</div>{checked&&<span className="timetable-check" aria-label={t('已记录出席')} title={t('已记录出席')}>√</span>}</article>;}):<div className="empty">{t('所选月份没有课程')}</div>}</div>
   {current.data&&current.data.pages>1&&<nav className="timetable-actions" aria-label={t('分页')}><Button variant="outline" disabled={current.data.page<=1} onClick={()=>setPage(current.data!.page-1)}>{t('上一页')}</Button><span>{current.data.page} / {current.data.pages}</span><Button variant="outline" disabled={current.data.page>=current.data.pages} onClick={()=>setPage(current.data!.page+1)}>{t('下一页')}</Button></nav>}
  </>:<div className="empty">{t(type==='student'?'请选择学生查看时间表':'请选择老师查看时间表')}</div>}
 </section>;
}
