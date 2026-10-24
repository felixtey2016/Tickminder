import {registerTranslations,t} from './i18n';

const labels:Record<string,[string,string]>={
  portal:['家长工作台','Parent portal'],
  parent:['家长','Parent'],
  navigation:['功能菜单','Navigation'],
  openMenu:['打开功能菜单','Open navigation'],
  closeMenu:['关闭功能菜单','Close navigation'],
  home:['主页','Home'],
  calendar:['课程与出勤','Lessons & attendance'],
  lessons:['课程记录','Lesson records'],
  attendance:['出勤','Attendance'],
  homework:['功课','Homework'],
  materials:['教学资料','Learning materials'],
  recordings:['课程录影','Lesson recordings'],
  learning:['学习表现','Learning performance'],
  finance:['财务','Finance'],
  notifications:['通知中心','Notifications'],
  account:['我的账号','My account'],
  logout:['退出登录','Sign out'],
};

registerTranslations(
  Object.fromEntries(Object.entries(labels).map(([key,value])=>['parentNav.'+key,value[0]])),
  Object.fromEntries(Object.entries(labels).map(([key,value])=>['parentNav.'+key,value[1]])),
);

export const PNav=(key:string)=>t('parentNav.'+key);
