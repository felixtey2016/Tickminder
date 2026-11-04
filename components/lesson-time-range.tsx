"use client";
import {DateInput} from "./date-time-input";
import {TimeInput} from "./time-input";
import {getLanguage} from "@/lib/i18n";
import {lessonDateAfter,lessonRangeMinutes,lessonRangeParts,validLessonRange} from "@/lib/lesson-time-range";
import "./lesson-time-range.css";
export function LessonTimeRange({start,end,onChange,disabled=false}:{start:string;end:string;onChange:(start:string,end:string)=>void;disabled?:boolean}){
 const zh=getLanguage()==="zh",parts=lessonRangeParts(start,end);
 const complete=Boolean(parts.date&&parts.startTime&&parts.endTime),minutes=lessonRangeMinutes(start,end);
 const error=complete&&!validLessonRange(start,end)?(zh?"结束时间必须晚于开始时间，且每堂课不超过12小时。跨午夜请选择「次日结束」。":"End must follow start, within 12 hours. Select Next-day end when crossing midnight."):"";
 const update=(date:string,a:string,b:string,next:boolean)=>onChange(date||a?date+"T"+a:"",date||b?(next?lessonDateAfter(date,1):date)+"T"+b:"");
 return <div className="lesson-time-range" data-testid="lesson-time-range">
 <label>{zh?"上课日期":"Lesson date"}<DateInput required aria-label={zh?"上课日期":"Lesson date"} disabled={disabled} value={parts.date} onChange={e=>update(e.target.value,parts.startTime,parts.endTime,parts.nextDay)}/></label>
 <div className="lesson-time-range-clock"><label>{zh?"开始时间":"Start time"}<TimeInput required aria-label={zh?"开始时间":"Start time"} disabled={disabled} value={parts.startTime} onChange={e=>update(parts.date,e.target.value,parts.endTime,parts.nextDay)}/></label>
 <label>{zh?"结束时间":"End time"}<TimeInput validationError={error} required aria-label={zh?"结束时间":"End time"} disabled={disabled} value={parts.endTime} onChange={e=>update(parts.date,parts.startTime,e.target.value,parts.nextDay)}/></label></div>
 <label className="check-row"><input type="checkbox" checked={parts.nextDay} disabled={disabled||!parts.date} onChange={e=>update(parts.date,parts.startTime,parts.endTime,e.target.checked)}/>{zh?"次日结束":"Next-day end"}</label>
 {error?<p className="error" role="alert">{error}</p>:complete&&<p className="lesson-time-range-summary" role="status">{parts.date} {parts.startTime} → {parts.nextDay?(zh?"次日 ":"Next day ")+lessonDateAfter(parts.date,1)+" ":""}{parts.endTime} · {Math.floor(minutes/60)>0?(Math.floor(minutes/60)+(zh?"小时":"h")):""}{minutes%60?(" "+minutes%60+(zh?"分钟":"m")):""} · GMT+8</p>}
 </div>;
}
