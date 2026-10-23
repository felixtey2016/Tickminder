import type {AttendanceSession} from './attendance-types';

export type AttendanceWindowSource=Pick<AttendanceSession,'teachingStatus'|'attendanceRecordedAt'|'firstSubmissionAt'|'explicitLockedAt'|'explicitLockReason'>&{participants?:Array<{attendanceStatus:string}>};
export type AttendanceLockCode='explicit'|'submitted'|'invoice'|null;
export function attendanceEditWindow(session:AttendanceWindowSource&{invoiceLocked?:boolean},_now=Date.now()){
  const recorded=session.teachingStatus!=='pending'||Boolean(session.attendanceRecordedAt)||Boolean(session.participants?.some(participant=>participant.attendanceStatus!=='pending'));
  const lockCode:AttendanceLockCode=session.invoiceLocked?'invoice':session.explicitLockedAt?'explicit':
    session.firstSubmissionAt||recorded?'submitted':null;
  return {deadline:null,recorded,lockCode,teacherCanEdit:lockCode===null};
}

export const attendanceLockMessages:Record<Exclude<AttendanceLockCode,null>,string>={
  explicit:'考勤已由管理员锁定，请联系管理员更正',
  submitted:'考勤已提交，老师不能再次修改，请联系管理员更正',
  invoice:'课程已正式开单，请由管理员通过已开单考勤更正流程处理',
};
