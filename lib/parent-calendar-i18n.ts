import {registerTranslations,t} from './i18n';
const entries:Record<string,[string,string]>={
 calendar:['日历','Calendar'],list:['列表','List'],courses:['课程','Courses'],attendance:['出勤记录','Attendance'],
 previousMonth:['上个月','Previous month'],nextMonth:['下个月','Next month'],today:['今天','Today'],
 monday:['一','Mon'],tuesday:['二','Tue'],wednesday:['三','Wed'],thursday:['四','Thu'],friday:['五','Fri'],saturday:['六','Sat'],sunday:['日','Sun'],
 dayLessons:['{date} · {count} 堂课','{date} · {count} lessons'],dayAria:['{date}，{count} 堂课','{date}, {count} lessons'],
 dayHint:['选择日期查看当天课程和孩子的出勤。','Select a date to view lessons and your child’s attendance.'],
 noDayLessons:['当天没有课程。','There are no lessons on this date.'],noMonthLessons:['本月暂无课程。','There are no lessons this month.'],
 dayCount:['{count} 堂','{count}'],allCancelled:['已取消','Cancelled'],hasAbsence:['有缺席记录','Absence recorded'],
 recorded:['已上课','Completed'],scheduled:['已安排','Scheduled'],lessonDate:['课程日期','Lesson date'],
 };
registerTranslations(Object.fromEntries(Object.entries(entries).map(([key,value])=>['parentCalendar.'+key,value[0]])),Object.fromEntries(Object.entries(entries).map(([key,value])=>['parentCalendar.'+key,value[1]])));
export const PC=(key:string)=>t('parentCalendar.'+key);
