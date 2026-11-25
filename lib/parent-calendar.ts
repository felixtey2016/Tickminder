import {ParentsError,parentMonth,parentText} from './parents';

const DAY_MS=24*60*60*1000,GMT8_MS=8*60*60*1000;
export type ParentLessonRange={month:string;date?:string;start:string;end:string;firstDate:string;lastDate:string};

/** A lesson occupies [start,end), so one ending at midnight is not on the next day. */
export function parentLessonRange(params:URLSearchParams):ParentLessonRange {
 const month=parentMonth(params.get('month')),[year,monthNumber]=month.split('-').map(Number);
 const first=Date.UTC(year,monthNumber-1,1),next=Date.UTC(year,monthNumber,1);
 let start=first,end=next,date:string|undefined;
 if(params.has('date')){
  date=parentText(params.get('date'));
  const parsed=Date.parse(date+'T00:00:00.000Z');
  if(!/^20\d\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(date)||!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==date||!date.startsWith(month+'-'))throw new ParentsError('请选择当前月份内的有效日期');
  start=parsed;end=parsed+DAY_MS;
 }
 return{month,...date?{date}:{},start:new Date(start-GMT8_MS).toISOString(),end:new Date(end-GMT8_MS).toISOString(),firstDate:month+'-01',lastDate:new Date(next-DAY_MS).toISOString().slice(0,10)};
}

/** Both the summary and detail use real instants, including legacy ISO offsets. */
export function parentLessonOverlap(start:string,end:string){
 return`julianday(l.planned_start)<julianday(${end}) AND julianday(l.planned_end)>julianday(${start})`;
}
