"use client";
import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {getLanguage} from '@/lib/i18n';
import {usePageHistoryState} from '@/lib/page-history';
import {PR} from '@/lib/parents-i18n';
import {PX} from '@/lib/parent30-i18n';
import {PN} from '@/lib/parent31-i18n';
import {PC} from '@/lib/parent-calendar-i18n';
import type {ParentWorkspaceView} from '@/lib/parent-navigation';
import type {ParentNoticeNavigation} from './parent-notifications-pane';
import {formatDurationBetween} from '@/lib/duration-format';
import {alertActionFailure} from '@/lib/action-feedback';
import type {ParentChild,ParentPage,ParentLesson,ParentHomework,ParentMaterial,ParentRecording} from '@/lib/parents';
import {useParentResource,ParentLoadState,ParentPagination,parentDate,parentTime,parentSafeUrl,parentMonth,useParentFocusReload} from './parents-ui-shared';
import './parents.css';
import './parent31.css';
const ParentLearningPane=lazy(()=>import('./parent-learning-pane'));
const ParentFinancePane=lazy(()=>import('./parent-finance-pane'));
const ParentCalendar=lazy(()=>import('./parent-calendar'));
type ChildrenResponse={children:ParentChild[];page:number;pages:number;total:number;permissions:{readOnly:true;finance:'per_child';grades:true}};
type ChildPage=ParentPage<ParentLesson|ParentHomework|ParentMaterial|ParentRecording>&{child:ParentChild;month?:string};
function attendanceKey(value:string){const keys:Record<string,string>={present:'present',attended:'present',late:'late',early_leave:'early_leave',left_early:'early_leave',early:'early_leave',late_early_leave:'late_early_leave',late_and_early:'late_early_leave',late_early:'late_early_leave',absent:'absent',excused:'excused'};return keys[value]||'pending';}
function lessonKey(value:string){return ['completed','cancelled'].includes(value)?value:['student_absent','teacher_absent'].includes(value)?value:['absent','not_taught'].includes(value)?'absent':['scheduled','planned'].includes(value)?'scheduled':'pending';}
function parentDay(value:string){const time=Date.parse(value);return Number.isFinite(time)?new Date(time+8*3600000).toISOString().slice(0,10):'';}
function parentCardTime(value:string,day:string){return parentDay(value)===parentDay(day)?parentTime(value):parentDate(value,true);}
function parentTimeDiffers(value:string|null,scheduled:string){if(!value)return false;const actual=Date.parse(value),planned=Date.parse(scheduled);return Number.isFinite(actual)&&(!Number.isFinite(planned)||Math.floor(actual/60000)!==Math.floor(planned/60000));}
function LessonCard({lesson,highlight=false,showDate=true}:{lesson:ParentLesson;highlight?:boolean;showDate?:boolean}){
 const status=lessonKey(lesson.status),attendance=attendanceKey(lesson.attendanceStatus),showAttendance=attendance!=='pending'||status==='completed';
 const duration=formatDurationBetween(lesson.plannedStart,lesson.plannedEnd,getLanguage()),arrivalDifferent=parentTimeDiffers(lesson.arrivedAt,lesson.plannedStart),departureDifferent=parentTimeDiffers(lesson.leftAt,lesson.plannedEnd);
 return <article className="parents-record parents-lesson-card" data-lesson-id={lesson.id} data-notification-target={highlight} tabIndex={highlight?-1:undefined}>
  {highlight&&<p className="parent-notification-target-hint">{PN('selectedLesson')}</p>}
  <div className="parents-lesson-heading"><h3>{lesson.subject}</h3><div className="parents-lesson-status"><span className="parents-badge" data-status={status}>{PR('status_'+status)}</span>{showAttendance&&<span className="parents-badge" data-status={attendance}>{PR('attendance_'+attendance)}</span>}</div></div>
  <div className="parents-lesson-schedule">{showDate&&<span className="parents-lesson-date">{parentDate(lesson.plannedStart)}</span>}<div className="parents-lesson-time"><span>{parentTime(lesson.plannedStart)}–{parentCardTime(lesson.plannedEnd,lesson.plannedStart)}</span><span className="parents-lesson-duration">{duration}</span></div></div>
  <p className="parents-lesson-people"><span aria-label={PR('teacher')+'：'+(lesson.teacherName||'—')}>{lesson.teacherName||'—'}</span>{lesson.classroomTitle&&<span className="parents-lesson-classroom" aria-label={PR('classroom')+'：'+lesson.classroomTitle}>{lesson.classroomTitle}</span>}</p>
  {(arrivalDifferent||departureDifferent)&&<p className="parents-lesson-exceptions">{arrivalDifferent&&lesson.arrivedAt&&<span>{PR('arrival')} {parentCardTime(lesson.arrivedAt,lesson.plannedStart)}</span>}{departureDifferent&&lesson.leftAt&&<span>{PR('left')} {parentCardTime(lesson.leftAt,lesson.plannedStart)}</span>}</p>}
  <details className="parents-lesson-details"><summary>{PR('lessonDetails')}</summary><dl className="parents-details"><div><dt>{PR('schedule')}</dt><dd>{parentDate(lesson.plannedStart,true)}–{parentCardTime(lesson.plannedEnd,lesson.plannedStart)}</dd></div><div><dt>{PR('duration')}</dt><dd>{duration}</dd></div><div><dt>{PR('teacher')}</dt><dd>{lesson.teacherName||'—'}</dd></div>{lesson.classroomTitle&&<div><dt>{PR('classroom')}</dt><dd>{lesson.classroomTitle}</dd></div>}<div><dt>{PR('attendance')}</dt><dd>{PR('attendance_'+attendance)}</dd></div><div><dt>{PR('arrival')}</dt><dd>{parentDate(lesson.arrivedAt,true)}</dd></div><div><dt>{PR('left')}</dt><dd>{parentDate(lesson.leftAt,true)}</dd></div></dl></details>
 </article>;
}
function HomeworkCard({homework}:{homework:ParentHomework}){const href=parentSafeUrl(homework.attachmentUrl);return <article className="parents-record"><div className="parents-record-head"><h3>{homework.title}</h3><span className="parents-badge" data-status={homework.completed?'completed':'pending'}>{PR(homework.completed?'complete':'incomplete')}</span></div>{homework.description&&<p style={{whiteSpace:'pre-wrap'}}>{homework.description}</p>}<dl className="parents-details"><div><dt>{PR('subject')}</dt><dd>{homework.subject}</dd></div><div><dt>{PR('due')}</dt><dd>{parentDate(homework.dueAt,true)}</dd></div>{homework.submittedAt&&<div><dt>{PR('submitted')}</dt><dd>{parentDate(homework.submittedAt,true)}</dd></div>}</dl>{href&&<div className="parents-actions"><a className="parents-link-button" href={href} target="_blank" rel="noopener noreferrer">{PR('attachment')}</a></div>}</article>;}
function MaterialCard({material}:{material:ParentMaterial}){const href=parentSafeUrl(material.fileUrl);return <article className="parents-record"><h3>{material.title}</h3>{material.description&&<p style={{whiteSpace:'pre-wrap'}}>{material.description}</p>}<dl className="parents-details"><div><dt>{PR('subject')}</dt><dd>{material.subject}</dd></div><div><dt>{PR('publishedAt')}</dt><dd>{parentDate(material.createdAt)}</dd></div></dl>{href&&<div className="parents-actions"><a className="parents-link-button" href={href} target="_blank" rel="noopener noreferrer">{PR('openMaterial')}</a></div>}</article>;}
function RecordingCard({recording}:{recording:ParentRecording}){const href=parentSafeUrl(recording.openUrl);return <article className="parents-record"><h3>{recording.title}</h3>{recording.description&&<p style={{whiteSpace:'pre-wrap'}}>{recording.description}</p>}<dl className="parents-details"><div><dt>{PR('subject')}</dt><dd>{recording.subject}</dd></div><div><dt>{PR('recordedAt')}</dt><dd>{parentDate(recording.lessonDate)}</dd></div>{recording.classroomTitle&&<div><dt>{PR('classroom')}</dt><dd>{recording.classroomTitle}</dd></div>}</dl>{href&&<div className="parents-actions"><a className="parents-link-button" href={href} target="_blank" rel="noopener noreferrer">{PR('watch')}</a></div>}</article>;}
export default function ParentsWorkspace({onAuthorityLost,navigation,view:controlledView,onViewChange}:{onAuthorityLost?:()=>void;navigation?:ParentNoticeNavigation|null;view?:ParentWorkspaceView;onViewChange?:(view:ParentWorkspaceView)=>void}){
 const [version,setVersion]=useState(0),[selected,setSelected]=usePageHistoryState('parents.child',''),[childPage,setChildPage]=usePageHistoryState('parents.childrenPage',1),[month,setMonth]=usePageHistoryState('parents.month',parentMonth()),[localView,setLocalView]=usePageHistoryState<ParentWorkspaceView>('parents.view','calendar'),[page,setPage]=useState(1);
 const view=controlledView||localView,setView=onViewChange||setLocalView;
 const workspaceRef=useRef<HTMLDivElement>(null),navigated=useRef(''),scrolled=useRef(''),[appliedNavigation,setAppliedNavigation]=useState(''),[expiredNavigation,setExpiredNavigation]=useState('');
 useEffect(()=>{if(!navigation||navigated.current===navigation.navigationId)return;navigated.current=navigation.navigationId;setChildPage(navigation.childPage);setSelected(navigation.studentId);setMonth(navigation.month);setView(navigation.kind==='invoice'?'finance':'lessons');setPage(navigation.kind==='lesson'?(navigation.lessonPage||1):1);setAppliedNavigation(navigation.navigationId);},[navigation,setChildPage,setSelected,setMonth,setView]);
 const children=useParentResource<ChildrenResponse>({view:'children',page:String(childPage)},version,onAuthorityLost),targetPending=!!navigation&&appliedNavigation!==navigation.navigationId,expectTarget=!!navigation&&expiredNavigation!==navigation.navigationId&&selected===navigation.studentId,child=targetPending?null:children.data?.children.find(value=>value.studentId===selected)||(!expectTarget?children.data?.children[0]:null)||null;
 useEffect(()=>{if(!navigation||!expectTarget||targetPending||children.loading||!children.data||children.data.children.some(value=>value.studentId===navigation.studentId))return;setExpiredNavigation(navigation.navigationId);setSelected('');setChildPage(1);setPage(1);alertActionFailure(new Error(PN('invalid')));},[navigation,expectTarget,targetPending,children.loading,children.data,setSelected,setChildPage]);
 const refresh=useCallback(()=>setVersion(value=>value+1),[]);useParentFocusReload(refresh,30000);
 const lostChild=useCallback(()=>{setSelected('');setPage(1);refresh();},[refresh]);
 const contentView=view==='attendance'?'lessons':view;
 const content=useParentResource<ChildPage>(child&&view!=='learning'&&view!=='finance'&&view!=='calendar'?{view:contentView,studentId:child.studentId,month,page:String(page)}:null,version,lostChild);
 useEffect(()=>{if(!navigation||navigation.kind!=='lesson'||scrolled.current===navigation.navigationId||child?.studentId!==navigation.studentId||view!=='lessons'||!content.data?.items.some(item=>item.id===navigation.recordId))return;const frame=requestAnimationFrame(()=>{const card=Array.from(workspaceRef.current?.querySelectorAll<HTMLElement>('[data-lesson-id]')||[]).find(element=>element.dataset.lessonId===navigation.recordId);if(card){scrolled.current=navigation.navigationId;card.scrollIntoView({block:'start'});card.focus({preventScroll:true});}});return()=>cancelAnimationFrame(frame);},[navigation,child?.studentId,view,content.data]);
 function changeView(value:ParentWorkspaceView){setView(value);setPage(1);}
 function changeMonth(value:string){if(/^20\d\d-(0[1-9]|1[0-2])$/.test(value)){setMonth(value);setPage(1);}}
 const title=view==='calendar'||view==='lessons'?PC('courses'):view==='attendance'?PC('attendance'):view==='materials'||view==='recordings'?PR('teaching'):view==='learning'||view==='finance'?PX(view):PR(view);
 return <div ref={workspaceRef} className="parents-workspace" data-testid="parents-workspace">
  <section className="panel">
   <div className="parents-main-heading"><div><h1>{title}</h1></div><Button type="button" variant="outline" disabled={children.loading||content.loading} onClick={refresh}>{PR('refresh')}</Button></div>
   <ParentLoadState loading={children.loading} failed={children.failed} onRetry={refresh}>{children.data&&!children.data.children.length?<div className="parents-section"><h3>{PR('noChildren')}</h3><p className="parents-muted">{PR('noChildrenHint')}</p></div>:child&&<>
    <div className="parents-filters parents-main-filters" style={view==='finance'?{gridTemplateColumns:'minmax(0,1fr)'}:undefined}>
     <label>{PR('selectChild')}<select aria-label={PR('selectChild')} value={child.studentId} onChange={event=>{setSelected(event.target.value);setPage(1);}}>{children.data?.children.map(value=><option value={value.studentId} key={value.studentId}>{value.student}</option>)}</select><small className="parents-muted">{[child.syllabusName,child.grade].filter(Boolean).join(' · ')}</small></label>
     {view!=='finance'&&<label>{PR('month')}<input type="month" aria-label={PR('month')} value={month} onChange={event=>changeMonth(event.target.value)}/><small className="parents-muted">{PR('timezone')}</small></label>}
    </div>
    {children.data&&<ParentPagination page={children.data.page} pages={children.data.pages} disabled={children.loading} onChange={value=>{setChildPage(value);setSelected('');setPage(1);}}/>}
    {(view==='calendar'||view==='lessons')&&<nav className="parents-course-tabs" aria-label={PC('courses')}>{(['calendar','lessons'] as const).map(tab=><Button type="button" key={tab} variant={view===tab?'default':'outline'} aria-current={view===tab?'page':undefined} onClick={()=>changeView(tab)}>{PC(tab==='lessons'?'list':'calendar')}</Button>)}</nav>}
    {(view==='materials'||view==='recordings')&&<nav className="parents-course-tabs" aria-label={PR('teaching')}>{(['materials','recordings'] as const).map(tab=><Button type="button" key={tab} variant={view===tab?'default':'outline'} aria-current={view===tab?'page':undefined} onClick={()=>changeView(tab)}>{PR(tab)}</Button>)}</nav>}
   </>}</ParentLoadState>
  </section>
  {child&&<section className="panel" aria-busy={content.loading}>
   {view==='calendar'?<Suspense fallback={<p role="status">{PR('loading')}</p>}><ParentCalendar key={child.studentId} studentId={child.studentId} month={month} version={version} onMonthChange={changeMonth} onAuthorityLost={lostChild} renderLesson={lesson=><LessonCard lesson={lesson} showDate={false}/>}/></Suspense>:view==='learning'?<Suspense fallback={<p role="status">{PR('loading')}</p>}><ParentLearningPane key={child.studentId+':'+month} studentId={child.studentId} month={month} version={version} onAuthorityLost={refresh}/></Suspense>:view==='finance'?<Suspense fallback={<p role="status">{PR('loading')}</p>}><ParentFinancePane key={child.studentId} studentId={child.studentId} version={version} navigation={navigation?.studentId===child.studentId&&navigation.kind==='invoice'?navigation:undefined} onAuthorityLost={refresh}/></Suspense>:<ParentLoadState loading={content.loading} failed={content.failed} onRetry={refresh}>{content.data&&<>
    <div className="parents-head"><h2>{title}</h2><span className="parents-badge">{PR('count').replace('{count}',String(content.data.total))}</span></div>
    <div className="parents-records" style={{marginTop:20}}>{content.data.items.map(item=>view==='lessons'||view==='attendance'?<LessonCard key={item.id} lesson={item as ParentLesson} highlight={navigation?.kind==='lesson'&&navigation.studentId===child.studentId&&navigation.recordId===item.id}/>:view==='homework'?<HomeworkCard key={item.id} homework={item as ParentHomework}/>:view==='materials'?<MaterialCard key={item.id} material={item as ParentMaterial}/>:<RecordingCard key={item.id} recording={item as ParentRecording}/>)}{!content.data.items.length&&<p className="parents-empty">{PR(view==='lessons'||view==='attendance'?'noLessons':view==='homework'?'noHomework':view==='materials'?'noMaterials':'noRecordings')}</p>}</div>
    {view==='recordings'&&content.data.items.length>0&&<p className="parents-notice">{PR('externalHint')}</p>}
    <ParentPagination page={content.data.page} pages={content.data.pages} disabled={content.loading} onChange={setPage}/>
   </>}</ParentLoadState>}
  </section>}
 </div>;
}
