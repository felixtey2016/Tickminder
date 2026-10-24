import {registerTranslations,t} from './i18n';

const labels:Record<string,[string,string]>={
  title:['主页','Home'],
  greeting:['你好，{name}','Hello, {name}'],
  today:['今天的课程','Today’s lessons'],
  todayCount:['共 {count} 堂课','{count} lessons'],
  todayHint:['按时间排列，涵盖所有已关联孩子。','In time order, across all your linked children.'],
  noToday:['今天没有课程','No lessons today'],
  next:['下一堂课','Next lesson'],
  noNext:['未来 90 天内暂无已安排课程。','No scheduled lessons in the next 90 days.'],
  viewCourses:['查看课程','View lessons'],
  allCourses:['全部课程与出勤','All lessons & attendance'],
  openCalendar:['打开日历','Open calendar'],
  reminders:['简短提醒','At a glance'],
  homework:['未完成功课','Incomplete homework'],
  homeworkHint:['查看各孩子功课','View homework by child'],
  unpaid:['待付款','Outstanding balance'],
  invoiceCount:['{count} 张正式账单未付清','{count} unpaid invoices'],
  financeScope:['仅含已授权的 {count}/{total} 位孩子','Covers {count} of {total} children with finance access'],
  financeClosed:['财务查看尚未授权','Finance access has not been granted'],
  financeClosedHint:['可联系管理员为孩子开通。','Contact your administrator to request access for a child.'],
  notifications:['未读通知','Unread notifications'],
  notificationHint:['打开通知中心','Open notifications'],
  children:['我的孩子','My children'],
  childrenCount:['共 {count} 位','{count} children'],
  basicUnknown:['课程资料待补充','Course information pending'],
  timezone:['所有时间采用 GMT+8','All times are GMT+8'],
};

registerTranslations(
  Object.fromEntries(Object.entries(labels).map(([key,value])=>['parentHome.'+key,value[0]])),
  Object.fromEntries(Object.entries(labels).map(([key,value])=>['parentHome.'+key,value[1]])),
);
export const PH=(key:string)=>t('parentHome.'+key);
