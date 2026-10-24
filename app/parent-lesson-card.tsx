"use client";
import {getLanguage} from '@/lib/i18n';
import {formatDurationBetween} from '@/lib/duration-format';
import {PR} from '@/lib/parents-i18n';
import {PN} from '@/lib/parent31-i18n';
import type {ParentLesson} from '@/lib/parents';
import {parentDate,parentTime} from './parents-ui-shared';
import './parents.css';
function attendanceKey(value:string){const keys:Record<string,string>={present:'present',attended:'present',late:'late',early_leave:'early_leave',left_early:'early_leave',early:'early_leave',late_early_leave:'late_early_leave',late_and_early:'late_early_leave',late_early:'late_early_leave',absent:'absent',excused:'excused'};return keys[value]||'pending';}
function lessonKey(value:string){return ['completed','cancelled'].includes(value)?value:['student_absent','teacher_absent'].includes(value)?value:['absent','not_taught'].includes(value)?'absent':['scheduled','planned'].includes(value)?'scheduled':'pending';}
function parentDay(value:string){const time=Date.parse(value);return Number.isFinite(time)?new Date(time+8*3600000).toISOString().slice(0,10):'';}
function parentCardTime(value:string,day:string){return parentDay(value)===parentDay(day)?parentTime(value):parentDate(value,true);}
function parentTimeDiffers(value:string|null,scheduled:string){if(!value)return false;const actual=Date.parse(value),planned=Date.parse(scheduled);return Number.isFinite(actual)&&(!Number.isFinite(planned)||Math.floor(actual/60000)!==Math.floor(planned/60000));}
export default function ParentLessonCard({lesson,highlight=false,showDate=true,showStudent=false}:{lesson:ParentLesson & {studentId?:string;student?:string};highlight?:boolean;showDate?:boolean;showStudent?:boolean}){
 const status=lessonKey(lesson.status),attendance=attendanceKey(lesson.attendanceStatus),showAttendance=attendance!=='pending'||status==='completed';
 const duration=formatDurationBetween(lesson.plannedStart,lesson.plannedEnd,getLanguage()),arrivalDifferent=parentTimeDiffers(lesson.arrivedAt,lesson.plannedStart),departureDifferent=parentTimeDiffers(lesson.leftAt,lesson.plannedEnd);
 return <article className="parents-record parents-lesson-card" data-lesson-id={lesson.id} data-student-id={lesson.studentId} data-notification-target={highlight} tabIndex={highlight?-1:undefined}>
  {highlight&&<p className="parent-notification-target-hint">{PN('selectedLesson')}</p>}
  {showStudent&&lesson.student&&<p className="parents-lesson-child">{lesson.student}</p>}
  <div className="parents-lesson-heading"><h3>{lesson.subject}</h3><div className="parents-lesson-status"><span className="parents-badge" data-status={status}>{PR('status_'+status)}</span>{showAttendance&&<span className="parents-badge" data-status={attendance}>{PR('attendance_'+attendance)}</span>}</div></div>
  <div className="parents-lesson-schedule">{showDate&&<span className="parents-lesson-date">{parentDate(lesson.plannedStart)}</span>}<div className="parents-lesson-time"><span>{parentTime(lesson.plannedStart)}–{parentCardTime(lesson.plannedEnd,lesson.plannedStart)}</span><span className="parents-lesson-duration">{duration}</span></div></div>
  <p className="parents-lesson-people"><span aria-label={PR('teacher')+'：'+(lesson.teacherName||'—')}>{lesson.teacherName||'—'}</span>{lesson.classroomTitle&&<span className="parents-lesson-classroom" aria-label={PR('classroom')+'：'+lesson.classroomTitle}>{lesson.classroomTitle}</span>}</p>
  {(arrivalDifferent||departureDifferent)&&<p className="parents-lesson-exceptions">{arrivalDifferent&&lesson.arrivedAt&&<span>{PR('arrival')} {parentCardTime(lesson.arrivedAt,lesson.plannedStart)}</span>}{departureDifferent&&lesson.leftAt&&<span>{PR('left')} {parentCardTime(lesson.leftAt,lesson.plannedStart)}</span>}</p>}
  <details className="parents-lesson-details"><summary>{PR('lessonDetails')}</summary><dl className="parents-details"><div><dt>{PR('schedule')}</dt><dd>{parentDate(lesson.plannedStart,true)}–{parentCardTime(lesson.plannedEnd,lesson.plannedStart)}</dd></div><div><dt>{PR('duration')}</dt><dd>{duration}</dd></div><div><dt>{PR('teacher')}</dt><dd>{lesson.teacherName||'—'}</dd></div>{lesson.classroomTitle&&<div><dt>{PR('classroom')}</dt><dd>{lesson.classroomTitle}</dd></div>}<div><dt>{PR('attendance')}</dt><dd>{PR('attendance_'+attendance)}</dd></div><div><dt>{PR('arrival')}</dt><dd>{parentDate(lesson.arrivedAt,true)}</dd></div><div><dt>{PR('left')}</dt><dd>{parentDate(lesson.leftAt,true)}</dd></div></dl></details>
 </article>;
}
