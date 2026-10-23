import type {AttendanceSession} from './attendance-types';

export const ATTENDANCE_EDIT_WINDOW_MS=24*60*60*1000;
export type AttendanceWindowSource=Pick<AttendanceSession,'teachingStatus'|'attendanceRecordedAt'|'firstSubmissionAt'|'explicitLockedAt'|'explicitLockReason'>&{participants?:Array<{attendanceStatus:string}>};
export type AttendanceLockCode='explicit'|'unknown_history'|'expired'|'invalid_first_submission'|'invoice'|null;
export function attendanceEditWindow(session:AttendanceWindowSource&{invoiceLocked?:boolean},now=Date.now()){
  const first=session.firstSubmissionAt?Date.parse(session.firstSubmissionAt):NaN;
  const deadline=Number.isFinite(first)?new Date(first+ATTENDANCE_EDIT_WINDOW_MS).toISOString():null;
  const recorded=session.teachingStatus!=='pending'||Boolean(session.attendanceRecordedAt)||Boolean(session.participants?.some(participant=>participant.attendanceStatus!=='pending'));
  const lockCode:AttendanceLockCode=session.invoiceLocked?'invoice':session.explicitLockedAt?'explicit':
    session.firstSubmissionAt&&(!Number.isFinite(first)||first>now)?'invalid_first_submission':
    !session.firstSubmissionAt&&recorded?'unknown_history':deadline&&now>=first+ATTENDANCE_EDIT_WINDOW_MS?'expired':null;
  return {deadline,recorded,lockCode,teacherCanEdit:lockCode===null};
}

export const attendanceLockMessages:Record<Exclude<AttendanceLockCode,null>,string>={
  explicit:'考勤已由管理员锁定，请联系管理员解锁后更正',
  unknown_history:'旧考勤无法确认首次提交时间，请联系管理员更正',
  expired:'首次提交已超过24小时，请联系管理员更正',
  invalid_first_submission:'首次提交时间需要核对，请联系管理员更正',
  invoice:'课程已正式开单，请由管理员通过已开单考勤更正流程处理',
};
