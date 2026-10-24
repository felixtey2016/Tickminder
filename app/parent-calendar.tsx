"use client";
import {useEffect,useState,type ReactNode} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {getLanguage} from '@/lib/i18n';
import {PC} from '@/lib/parent-calendar-i18n';
import type {ParentChild,ParentCourseLesson,ParentPage} from '@/lib/parents';
import type {ParentCourseStatus} from '@/lib/parent-workspace-ui';
import {PW} from '@/lib/parent-workspace-i18n';
import {useParentResource,ParentLoadState,ParentPagination,parentDate} from './parents-ui-shared';
import './parent-calendar.css';

type CalendarDay={date:string;total:number;scheduled:number;completed:number;absent:number;cancelled:number};
type CalendarResponse={child:ParentChild|null;month:string;days:CalendarDay[]};
type DayResponse=ParentPage<ParentCourseLesson>&{child:ParentChild|null;month:string;date:string};
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const firstDay=(month:string)=>today().startsWith(month+'-')?today():month+'-01';
function shiftMonth(month:string,offset:number){const date=new Date(month+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+offset);return date.toISOString().slice(0,7);}
export default function ParentCalendar({studentId,month,status='all',version,selectedDate='',onDateChange,onMonthChange,onAuthorityLost,renderLesson}:{studentId:string;month:string;status?:ParentCourseStatus;version:number;selectedDate?:string;onDateChange?:(date:string)=>void;onMonthChange:(month:string)=>void;onAuthorityLost:()=>void;renderLesson:(lesson:ParentCourseLesson)=>ReactNode}){
 const [chosen,setChosen]=useState(()=>firstDay(month)),[page,setPage]=useState(1),[reload,setReload]=useState(0);
 const selection=onDateChange?selectedDate:chosen,day=selection.startsWith(month+'-')?selection:firstDay(month),chooseDay=(date:string)=>{setChosen(date);onDateChange?.(date);setPage(1);};
 useEffect(()=>{setPage(1);},[studentId,month,status,day]);
 const calendar=useParentResource<CalendarResponse>({view:'calendar',studentId,month,status},version+reload,onAuthorityLost);
 const lessons=useParentResource<DayResponse>({view:'lessons',studentId,month,status,date:day,page:String(page)},version+reload,onAuthorityLost);
 const retry=()=>setReload(value=>value+1),dayRows=calendar.data?.days||[],weekday=(new Date(month+'-01T00:00:00Z').getUTCDay()+6)%7;
 const monthLabel=new Intl.DateTimeFormat(getLanguage()==='zh'?'zh-CN':'en-GB',{timeZone:'UTC',year:'numeric',month:'long'}).format(new Date(month+'-01T00:00:00Z'));
 const selectedLabel=parentDate(day+'T00:00:00Z');
 return <div className="parent-calendar" data-testid="parent-calendar">
  <div className="parent-calendar-toolbar"><div className="parent-calendar-month-controls">
   <Button type="button" variant="outline" aria-label={PC('previousMonth')} disabled={month<='2000-01'} onClick={()=>onMonthChange(shiftMonth(month,-1))}><ChevronLeft size={20} aria-hidden="true"/></Button>
   <label className="parent-calendar-month-picker"><span className="parent-calendar-month-label" aria-hidden="true">{monthLabel}</span><input type="month" min="2000-01" max="2099-12" aria-label={PW('chooseMonth')} value={month} onChange={event=>{if(/^20\d\d-(0[1-9]|1[0-2])$/.test(event.target.value))onMonthChange(event.target.value);}}/></label>
   <Button type="button" variant="outline" aria-label={PC('nextMonth')} disabled={month>='2099-12'} onClick={()=>onMonthChange(shiftMonth(month,1))}><ChevronRight size={20} aria-hidden="true"/></Button>
  </div><Button type="button" variant="outline" onClick={()=>{const current=today();onMonthChange(current.slice(0,7));chooseDay(current);}}>{PC('today')}</Button></div>
  <ParentLoadState loading={calendar.loading} failed={calendar.failed} onRetry={retry}>{calendar.data&&<>
   <div className="parent-calendar-grid" role="group" aria-label={monthLabel}>
    {['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(key=><span className="parent-calendar-weekday" key={key}>{PC(key)}</span>)}
    {Array.from({length:weekday},(_,index)=><span aria-hidden="true" key={'empty-'+index}/>)}
    {dayRows.map(item=>{const allCancelled=item.total>0&&item.cancelled===item.total,status=allCancelled?'cancelled':item.absent>0?'absent':item.scheduled>0?'scheduled':item.completed>0?'completed':'empty';return <button type="button" key={item.date} className="parent-calendar-day" data-date={item.date} data-status={status} data-today={item.date===today()} aria-pressed={item.date===day} aria-label={PC('dayAria').replace('{date}',parentDate(item.date+'T00:00:00Z')).replace('{count}',String(item.total))} onClick={()=>chooseDay(item.date)}><span className="parent-calendar-number">{Number(item.date.slice(-2))}</span>{item.total>0&&<span className="parent-calendar-count">{PC('dayCount').replace('{count}',String(item.total))}</span>}</button>;})}
   </div>
   <div className="parent-calendar-legend">{['scheduled','recorded','hasAbsence','allCancelled'].map((key,index)=><span key={key}><i aria-hidden="true" data-status={['scheduled','completed','absent','cancelled'][index]}/>{PC(key)}</span>)}</div>
   {!dayRows.some(item=>item.total>0)&&<p className="parents-muted">{PC('noMonthLessons')}</p>}
  </>}</ParentLoadState>
  <section className="parent-calendar-day-details" aria-busy={lessons.loading} aria-label={PC('lessonDate')}><h3 aria-live="polite">{PC('dayLessons').replace('{date}',selectedLabel).replace('{count}',lessons.loading?'…':String(lessons.data?.total??'—'))}</h3>
   <ParentLoadState loading={lessons.loading} failed={lessons.failed} onRetry={retry}>{lessons.data&&<><div className="parents-records">{lessons.data.items.map(lesson=><div key={lesson.studentId+':'+lesson.id}>{renderLesson(lesson)}</div>)}{!lessons.data.items.length&&<p className="parents-empty">{PC('noDayLessons')}</p>}</div><ParentPagination page={lessons.data.page} pages={lessons.data.pages} disabled={lessons.loading} onChange={setPage}/></>}</ParentLoadState>
  </section>
 </div>;
}
