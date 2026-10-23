import {monthDays} from './student-calendar';
export type CalendarRange={from:string;to:string};
export function shiftCalendarDay(day:string,offset:number){return new Date(Date.parse(day+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);}
export function monthCalendarRange(day:string):CalendarRange{const days=monthDays(day.slice(0,7));return{from:days[0],to:shiftCalendarDay(days[days.length-1],1)};}
