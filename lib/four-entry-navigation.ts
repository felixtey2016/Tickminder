import type { NavigationRole } from './course-navigation';

type Label = {zh:string;en:string};
export type PrimaryArea = 'home'|'courses'|'teachingHub'|'learningHub'|'financeHub'|'manageHub'|'myHub';
export type PrimaryEntry = {id:PrimaryArea;label:Label;icon:'home'|'courses'|'teaching'|'finance'|'manage'|'mine'};
export type HubGroup = {id:string;title:Label;ids:string[];layout:'grid'|'list'};
const entry=(id:PrimaryArea,zh:string,en:string,icon:PrimaryEntry['icon']):PrimaryEntry=>({id,label:{zh,en},icon});
const home=entry('home','首页','Home','home');
const courses=entry('courses','课程','Courses','courses');
const teaching=entry('teachingHub','教学','Teaching','teaching');
const learning=entry('learningHub','学习','Learning','teaching');
const mine=entry('myHub','账号','Account','mine');
const primary:Record<NavigationRole,PrimaryEntry[]>={
 admin:[home,teaching,entry('financeHub','财务','Finance','finance'),entry('manageHub','管理','Manage','manage')],
 teacher:[home,courses,teaching,mine],
 student:[home,courses,learning,mine],
 pending:[home,mine],
};
export function primaryEntries(role:NavigationRole):readonly PrimaryEntry[]{return primary[role];}
export function isPrimaryHub(role:NavigationRole,view:unknown):boolean{return typeof view==='string'&&view.endsWith('Hub')&&primary[role].some(item=>item.id===view);}

// Existing leaf names are unchanged: deep links, histories and server scopes still use them.
export function primaryArea(role:NavigationRole,view:string):PrimaryArea{
 if(view==='home')return 'home';
 if(isPrimaryHub(role,view))return view as PrimaryArea;
 if(role==='admin'){
  if(view==='billing')return 'financeHub';
  if(['groups','people','settings','studentRoster','teacherRoster','parentRoster','accounts','groupInfo','myAccount','activity','notifications'].includes(view))return 'manageHub';
  return 'teachingHub';
 }
 if(['myAccount','notifications'].includes(view)||role==='pending')return 'myHub';
 if(['courses','calendar','list','lessons','attendance','reschedule','hours','schedule'].includes(view))return 'courses';
 return role==='teacher'?'teachingHub':'learningHub';
}
const group=(id:string,zh:string,en:string,ids:string[],layout:'grid'|'list'='grid'):HubGroup=>({id,title:{zh,en},ids,layout});
export function hubGroups(role:NavigationRole,hub:string):HubGroup[]{
 if(hub==='teachingHub'||hub==='learningHub')return [
  ...(role==='admin'?[group('courses','课程管理','Courses',['courses'],'list')]:[]),
  group('learning',role==='student'?'学习内容':'教学内容',role==='student'?'Learning':'Teaching',['classrooms','homework','quizzes','materials']),
  ...(role==='admin'?[group('students','学生','Students',['subjects'],'list')]:role==='teacher'?[group('students','学生','Students',['students'],'list')]:[]),
 ];
 if(hub==='manageHub')return [
  group('people','人员与账号','People & accounts',['studentRoster','teacherRoster','parentRoster','accounts']),
  group('settings','集团与设置','Group & settings',['groupInfo','activity'],'list'),
  group('account','我的账号','My account',['myAccount','notifications'],'list'),
  ...(role==='admin'?[group('platform','平台管理','Platform',['groups'],'list')]:[]),
 ];
 if(hub==='myHub')return [group('account','账号与消息','Account & messages',['myAccount','notifications'],'list')];
 return [];
}
