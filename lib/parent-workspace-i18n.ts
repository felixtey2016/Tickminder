import {registerTranslations,t} from './i18n';
const entries:Record<string,[string,string]>={
 courses:['课程与出勤','Courses & attendance'],allChildren:['全部孩子','All children'],
 allChildrenHint:['显示所有已关联孩子的课程与各自出勤。','Lessons and individual attendance for all linked children.'],
 status:['课程状态','Lesson status'],all:['全部状态','All statuses'],upcoming:['未上课','Not yet taught'],
 completed:['已上课','Completed'],absent:['缺席／未授课','Absent / not taught'],cancelled:['已取消','Cancelled'],
 child:['孩子','Child'],month:['月份','Month'],chooseMonth:['选择月份','Choose month'],
 childrenPage:['孩子名单分页','Child selector pages'],
};
registerTranslations(Object.fromEntries(Object.entries(entries).map(([key,value])=>['parentWorkspace.'+key,value[0]])),Object.fromEntries(Object.entries(entries).map(([key,value])=>['parentWorkspace.'+key,value[1]])));
export const PW=(key:string)=>t('parentWorkspace.'+key);
