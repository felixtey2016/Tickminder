const personalStatuses=new Set(['pending','present','absent','late','early_leave','late_early']);
const teachingStatuses=new Set(['pending','taught','not_taught','teacher_absent']);
const own=(value:Record<string,unknown>,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
function instant(value:unknown){return value===null?null:typeof value==='string'&&value.length<=40&&/^\d{4}-\d\d-\d\dT/.test(value)&&Number.isFinite(Date.parse(value))?value:undefined;}

/** Attendance history may reveal corrected facts, never an invoice or payment payload. */
export function invoiceAttendanceHistorySnapshot(source:Record<string,unknown>,previous?:Record<string,unknown>){
 const result:Record<string,unknown>={},raw=source.attendanceKind??source.participantStatus??source.status;
 const status=raw==='scheduled'?'pending':raw==='completed'?'present':raw==='student_absent'||raw==='teacher_absent'?'absent':raw;
 if(typeof status==='string'&&personalStatuses.has(status))result.status=status;
 const teaching=own(source,'teachingStatus')?source.teachingStatus:previous?.teachingStatus;
 if(typeof teaching==='string'&&teachingStatuses.has(teaching))result.teachingStatus=teaching;
 for(const [target,shared,personal]of [['actualStart','teachingStart','actualStart'],['actualEnd','teachingEnd','actualEnd']] as const){
  const value=own(source,shared)?source[shared]:previous&&own(previous,shared)?previous[shared]:source[personal],time=instant(value);
  if(time!==undefined)result[target]=time;
 }
 for(const [target,key]of [['arrivedAt','actualStart'],['leftAt','actualEnd']] as const){const time=instant(source[key]);if(time!==undefined)result[target]=time;}
 if(source.chargeable===null||typeof source.chargeable==='boolean'||source.chargeable===0||source.chargeable===1)result.chargeable=source.chargeable;
 return result;
}
