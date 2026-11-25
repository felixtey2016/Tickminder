import {getLanguage,registerTranslations} from './i18n';
import type {ClassroomTaskStatus,ClassroomTaskHistory} from './classroom-tasks';
export const taskLabel=(zh:string,en:string)=>getLanguage()==='zh'?zh:en;
export function taskStatusLabel(status:ClassroomTaskStatus){return ({pending:taskLabel('待完成','To do'),awaiting_review:taskLabel('待老师确认','Awaiting teacher'),needs_redo:taskLabel('需重做','Needs another attempt'),completed:taskLabel('老师已确认','Confirmed by teacher'),self_completed:taskLabel('已自行完成','Self-completed'),legacy_completed:taskLabel('此前自行完成','Previously self-completed')})[status];}
export function taskHistoryLabel(action:ClassroomTaskHistory['action']){return ({submit:taskLabel('申请确认','Requested confirmation'),approve:taskLabel('确认完成','Confirmed completion'),return:taskLabel('要求重做','Requested another attempt'),selfComplete:taskLabel('自行确认完成','Self-reported completion'),complete:taskLabel('此前自行完成','Previously self-completed')})[action];}
const errors:Record<string,string>={
 '任务完成方式已更新，请刷新后申请老师确认':'Task completion has changed. Refresh and request teacher confirmation.',
 '只能操作当前班级的任务':'You can only act on tasks in the current class.',
 '学生资料无效':'The student details are invalid.',
 '请刷新任务状态后重试':'Refresh the task state and try again.',
 '请填写 1 至 1000 字的重做原因':'Enter a reason for another attempt (1–1000 characters).',
 '学生与班级的关联已变更，请刷新后重试':'The student’s class membership changed. Refresh and try again.',
 '请选择有效的任务完成方式':'Choose a valid task completion method.',
 '此任务由学生自行确认完成，无需老师审核':'Students complete this task themselves; teacher review is not required.',
 '请先预览并确认删除任务':'Preview and confirm task deletion first.',
 '删除预览已过期或记录已改变，请重新预览':'The deletion preview expired or the history changed. Preview again.',
};
registerTranslations(Object.fromEntries(Object.keys(errors).map(key=>[key,key])),errors);
