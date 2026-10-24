"use client";
import {useCallback,useState} from 'react';
import {ArrowRight,Bell,BookOpen,CalendarDays,LockKeyhole,WalletCards} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {getLanguage} from '@/lib/i18n';
import {PR} from '@/lib/parents-i18n';
import {PH} from '@/lib/parent-home-i18n';
import type {ParentHomeResponse} from '@/lib/parent-home-types';
import type {ParentWorkspaceTarget} from '@/lib/parent-workspace-ui';
import type {ParentCourseLesson} from '@/lib/parents';
import ParentLessonCard from './parent-lesson-card';
import {useNotificationControls} from './notifications';
import {ParentLoadState,ParentPagination,parentDate,useParentFocusReload,useParentResource} from './parents-ui-shared';
import './parents.css';
import './parent-home.css';

type OpenTarget=Omit<ParentWorkspaceTarget,'targetId'>;
type ParentHomeProps={name:string;onOpen:(target:OpenTarget)=>void;onNotifications:()=>void;onAuthorityLost?:()=>void};
const currentDay=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const lessonDay=(value:string)=>new Date(Date.parse(value)+8*3600000).toISOString().slice(0,10);
const money=(cents:number)=>new Intl.NumberFormat(getLanguage()==='zh'?'zh-CN':'en-MY',{style:'currency',currency:'MYR',minimumFractionDigits:2}).format(cents/100);

export default function ParentHome({name,onOpen,onNotifications,onAuthorityLost}:ParentHomeProps){
 const [date,setDate]=useState(currentDay),[version,setVersion]=useState(0),[childrenPage,setChildrenPage]=useState(1),[lessonsPage,setLessonsPage]=useState(1);
 const refresh=useCallback(()=>{const today=currentDay();if(today!==date){setDate(today);setLessonsPage(1);}setVersion(value=>value+1);},[date]);
 useParentFocusReload(refresh,60000);
 const {data,loading,failed}=useParentResource<ParentHomeResponse>({view:'home',date,childrenPage:String(childrenPage),lessonsPage:String(lessonsPage)},version,onAuthorityLost);
 const notifications=useNotificationControls(),unread=notifications?.state?.unreadCount;
 const openCalendar=()=>onOpen({view:'calendar',studentId:'',month:date.slice(0,7),date});
 const openLesson=(lesson:ParentCourseLesson)=>{const day=lessonDay(lesson.plannedStart);onOpen({view:'calendar',studentId:lesson.studentId,month:day.slice(0,7),date:day,childPage:lesson.childPage});};
 return <div className="parent-home parents-workspace" data-testid="parent-home">
  <section className="parent-home-heading">
   <div><h2>{PH('greeting').replace('{name}',name)}</h2><p className="parents-muted">{parentDate(date+'T00:00:00+08:00')} · GMT+8</p></div>
   <Button type="button" variant="outline" disabled={loading} onClick={refresh}>{PR('refresh')}</Button>
  </section>
  <ParentLoadState loading={loading} failed={failed} onRetry={refresh}>{data&&<>
   {!data.summary.totalChildren?<section className="panel parent-home-empty"><h2>{PR('noChildren')}</h2><p className="parents-muted">{PR('noChildrenHint')}</p></section>:<>
    <section className="panel parent-home-today" aria-labelledby="parent-home-today-title">
     <div className="parents-head"><div><h2 id="parent-home-today-title">{PH('today')}</h2><p className="parents-muted">{data.today.total?PH('todayCount').replace('{count}',String(data.today.total)):PH('noToday')}</p></div><Button type="button" variant="outline" onClick={openCalendar}><CalendarDays size={17} aria-hidden="true"/>{PH('openCalendar')}</Button></div>
     {data.today.total>0?<><div className="parents-records parent-home-lessons">{data.today.items.map(lesson=><div className="parent-home-lesson" key={lesson.studentId+':'+lesson.id}><ParentLessonCard lesson={lesson} showDate={false} showStudent summaryOnly action={<Button type="button" variant="outline" onClick={()=>openLesson(lesson)} aria-label={PH('viewCourses')+' · '+lesson.student+' · '+lesson.subject}>{PH('viewCourses')}<ArrowRight size={16} aria-hidden="true"/></Button>}/></div>)}</div><ParentPagination page={data.today.page} pages={data.today.pages} disabled={loading} onChange={setLessonsPage}/></>:data.nextLesson?<div className="parent-home-next"><h3>{PH('next')}</h3><ParentLessonCard lesson={data.nextLesson} showStudent summaryOnly action={<Button type="button" variant="outline" onClick={()=>openLesson(data.nextLesson!)}>{PH('viewCourses')}<ArrowRight size={16} aria-hidden="true"/></Button>}/></div>:<p className="parents-muted parent-home-context">{PH('noNext')}</p>}
    </section>
    <section className="parent-home-overview" aria-label={PH('reminders')}><div className="parent-home-summary">
     <button type="button" className="parent-home-summary-card" onClick={()=>onOpen({view:'homework',studentId:data.homeworkTarget?.studentId,childPage:data.homeworkTarget?.childPage,month:data.homeworkTarget?.month||date.slice(0,7)})}><span className="parent-home-summary-label"><BookOpen size={19} aria-hidden="true"/>{PH('homework')}</span><strong>{data.summary.pendingHomework}</strong></button>
     {data.summary.financialChildren>0&&data.financeTarget?<button type="button" className="parent-home-summary-card" onClick={()=>onOpen({view:'finance',studentId:data.financeTarget!.studentId,childPage:data.financeTarget!.childPage})}><span className="parent-home-summary-label"><WalletCards size={19} aria-hidden="true"/>{PH('unpaid')}</span><strong className="parent-home-money">{money(data.summary.remainingCents)}</strong><span className="parents-muted">{PH('invoiceCount').replace('{count}',String(data.summary.unpaidInvoices))}</span><span className="parent-home-summary-caption">{PH('financeScope').replace('{count}',String(data.summary.financialChildren)).replace('{total}',String(data.summary.totalChildren))}<ArrowRight size={16} aria-hidden="true"/></span></button>:<div className="parent-home-summary-card parent-home-finance-closed"><span className="parent-home-summary-label"><LockKeyhole size={19} aria-hidden="true"/>{PH('unpaid')}</span><strong>{PH('financeClosed')}</strong><span className="parents-muted">{PH('financeClosedHint')}</span></div>}
     <button type="button" className="parent-home-summary-card" onClick={onNotifications}><span className="parent-home-summary-label"><Bell size={19} aria-hidden="true"/>{PH('notifications')}</span><strong>{unread===undefined?'—':unread}</strong></button>
    </div></section>
    <details className="parent-compact-disclosure parent-home-children"><summary><strong>{PH('children')} · {data.children.total}</strong></summary><div className="parent-compact-disclosure-body"><div className="parent-home-child-grid">{data.children.items.map(child=><article className="parent-home-child" key={child.studentId}><div><h3>{child.student}</h3><p className="parents-muted">{[child.syllabusName,child.grade].filter(Boolean).join(' · ')||PH('basicUnknown')}</p></div><Button type="button" variant="outline" onClick={()=>onOpen({view:'calendar',studentId:child.studentId,month:date.slice(0,7),date,childPage:data.children.page})} aria-label={PH('viewCourses')+' · '+child.student}>{PH('viewCourses')}<ArrowRight size={16} aria-hidden="true"/></Button></article>)}</div><ParentPagination page={data.children.page} pages={data.children.pages} disabled={loading} onChange={setChildrenPage}/></div></details>
   </>}
  </>}</ParentLoadState>
 </div>;
}
