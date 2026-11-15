import {registerTranslations} from './i18n';
export function registerAttendanceActionTranslations(){
 registerTranslations({}, {
  '原课程不存在或无权访问':'Original lesson not found or access denied',
  '请选择需要补课的学生':'Select students needing makeup',
  '原课程或补课安排已改变，请重新载入':'The original lesson or makeup has changed. Reload and try again.',
  '补课已安排':'Makeup scheduled',
 });
}
