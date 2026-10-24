import {registerTranslations} from './i18n';

const errors:Record<string,string>={
  '请选择新增人员或关联现有人员':'Choose whether to add a new person or link an existing person.',
  '请输入不超过 80 个字符且不含 | 的姓名':'Enter a name of up to 80 characters without |.',
  '请选择启用的现有人员':'Choose an existing active person.',
  '此身份已有停用账号，请恢复原账号后使用':'This person already has a disabled account. Restore that account to continue.',
  '此身份已有账号，请使用现有账号连接 Google，避免重复创建':'This person already has an account. Link Google to the existing account.',
  '请选择启用的老师':'Choose an active teacher.',
  '请选择启用的现有学生':'Choose an existing active student.',
  '学生姓名已存在，请选择「关联现有学生」':'This student name already exists. Choose “Link an existing student”.',
  '此学生已停用，请先恢复原学生资料':'This student is inactive. Restore the existing student profile first.',
  '老师姓名已存在，请选择「关联现有老师」':'This teacher name already exists. Choose “Link an existing teacher”.',
  '此老师已停用，请先恢复原老师资料':'This teacher is inactive. Restore the existing teacher profile first.',
  '请输入不超过 80 个字符的姓名':'Enter a name of up to 80 characters.',
  '人员或账号资料已改变，请刷新后重试':'The person or account details changed. Refresh and try again.',
  '姓名或账号已存在，请刷新后选择现有人员或账号':'This name or account already exists. Refresh and choose the existing person or account.',
};
registerTranslations(Object.fromEntries(Object.keys(errors).map(key=>[key,key])),errors);
