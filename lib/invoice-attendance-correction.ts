import type {Account} from './auth';
import {learningDb} from './learning-server';
import {invoiceAuthority,requireInvoicePermission} from './invoice-server';
import {adminPermissionPredicate} from './admin-permission-access';
import {InvoiceFinanceError} from './invoice-finance';
import {malaysiaDate} from './lesson-rules';
import {appendAudit} from './audit-log';

type Source={id:string;sessionId:string;updatedAt:string;sessionRevision:number;status:string;attendanceKind:string|null;actualStart:string|null;actualEnd:string|null;chargeable:number|null;reviewedAt:string|null;reviewedBy:string|null;note:string|null;teachingStatus:string;teachingStart:string|null;teachingEnd:string|null;participantStatus:string;arrivedAt:string|null;leftAt:string|null;student:string;subject:string;plannedStart:string;plannedEnd:string};
export const correctionSourceSql=`SELECT l.id,l.session_id AS sessionId,l.updated_at AS updatedAt,s.revision AS sessionRevision,l.status,l.attendance_kind AS attendanceKind,l.actual_start AS actualStart,l.actual_end AS actualEnd,l.chargeable,l.reviewed_at AS reviewedAt,l.reviewed_by AS reviewedBy,l.note,s.teaching_status AS teachingStatus,s.actual_start AS teachingStart,s.actual_end AS teachingEnd,p.attendance_status AS participantStatus,p.arrived_at AS arrivedAt,p.left_at AS leftAt,l.student,l.subject,l.planned_start AS plannedStart,l.planned_end AS plannedEnd FROM lessons l JOIN class_sessions s ON s.group_id=l.group_id AND s.id=l.session_id JOIN class_session_participants p ON p.group_id=l.group_id AND p.session_id=s.id AND p.lesson_id=l.id JOIN invoices i ON i.group_id=l.group_id AND i.id=? AND i.status='issued' JOIN billing_students b ON b.group_id=i.group_id AND b.id=i.student_id AND b.student_name=l.student WHERE l.group_id=? AND EXISTS(SELECT 1 FROM json_each(i.document_json,'$.sourceLines') j WHERE json_extract(j.value,'$.lessonId')=l.id) AND l.status<>'cancelled' AND s.status<>'cancelled'`;
export function correctionAuthority(actor:Account){const finance=invoiceAuthority(actor),adjust=adminPermissionPredicate(actor,'invoices.adjust'),attendance=adminPermissionPredicate(actor,'attendance.edit');return{sql:`(${finance.sql}) AND (${adjust.sql}) AND (${attendance.sql})`,args:[...finance.args,...adjust.args,...attendance.args]};}
export async function invoiceAttendanceSources(actor:Account,invoiceId:string,pageValue=1){
 await requireInvoicePermission(actor);const authority=correctionAuthority(actor),gid=actor.groupId!,db=learningDb();
 if(!await db.prepare(`SELECT 1 WHERE ${authority.sql}`).bind(...authority.args).first())throw new InvoiceFinanceError('没有更正已开单考勤的权限',403);
 const condition=`AND NOT EXISTS(SELECT 1 FROM invoice_finance_accounts f WHERE f.group_id=i.group_id AND f.invoice_id=i.id AND f.voided_at IS NOT NULL)`,query=correctionSourceSql+' '+condition;
 const total=(await db.prepare(`SELECT count(*) AS n FROM (${query}) WHERE ${authority.sql}`).bind(invoiceId,gid,...authority.args).first<{n:number}>())?.n||0,pages=Math.max(1,Math.ceil(total/20)),page=Math.min(pages,Math.max(1,Math.trunc(pageValue)||1));
 const result=await db.prepare(`SELECT * FROM (${query}) WHERE ${authority.sql} ORDER BY plannedStart,id LIMIT 20 OFFSET ?`).bind(invoiceId,gid,...authority.args,(page-1)*20).all<Source>();
 return{items:result.results||[],total,pages,page};
}
const clean=(v:unknown)=>typeof v==='string'?v.trim():'';
function instant(v:unknown){const value=clean(v),ms=Date.parse(value),match=value.match(/^(20\d\d-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?(Z|[+-]\d\d:\d\d)$/);if(!match||!Number.isFinite(ms)||new Date(match[1]+'T00:00:00Z').toISOString().slice(0,10)!==match[1]||Number(match[2])>23||Number(match[3])>59||Number(match[4])>59)throw new InvoiceFinanceError('请填写有效到课和离课时间');return new Date(ms).toISOString();}
export async function prepareInvoiceAttendanceCorrection(actor:Account,data:Record<string,unknown>){
 const gid=actor.groupId!,invoiceId=clean(data.invoiceId),lessonId=clean(data.lessonId),authority=correctionAuthority(actor),db=learningDb();
 if(!await db.prepare(`SELECT 1 WHERE ${authority.sql}`).bind(...authority.args).first())throw new InvoiceFinanceError('没有更正已开单考勤的权限',403);
 const before=await db.prepare(correctionSourceSql+' AND l.id=?').bind(invoiceId,gid,lessonId).first<Source>();
 if(!before)throw new InvoiceFinanceError('账单关联课次不存在或无权更正',404);
 if(before.updatedAt!==data.expectedUpdatedAt||before.sessionRevision!==data.sessionRevision)throw new InvoiceFinanceError('考勤刚有更改，请重新载入',409);
 const status=clean(data.status),resetting=status==='pending',reason=clean(data.reason);if(!['pending','present','absent','late','early_leave','late_early'].includes(status)||!reason||reason.length>1000||typeof data.chargeable!=='boolean')throw new InvoiceFinanceError('请选择出席状态、收费决定并填写更正原因');
 if(resetting&&(data.chargeable!==false||data.kind!=='credit'&&data.kind!=='unchanged'))throw new InvoiceFinanceError('还原未登记须选择减免费用或明确保持金额不变，不能继续标记本课收费');
 if(resetting&&(data.kind==='unchanged'&&data.amountCents!==0||data.kind==='credit'&&(!Number.isSafeInteger(data.amountCents)||Number(data.amountCents)<=0)))throw new InvoiceFinanceError('请选择保持金额不变，或填写大于零的减免金额');
 const others=await db.prepare("SELECT count(*) AS n,sum(CASE WHEN attendance_status='pending' THEN 1 ELSE 0 END) AS pending FROM class_session_participants WHERE group_id=? AND session_id=? AND lesson_id<>?").bind(gid,before.sessionId,lessonId).first<{n:number;pending:number|null}>(),otherRecorded=(others?.n||0)-(others?.pending||0);
 if(resetting&&before.participantStatus==='pending'){
  if(otherRecorded||before.teachingStatus==='pending')throw new InvoiceFinanceError('考勤已经是未登记状态，请重新载入',409);
  if(data.kind!=='unchanged'||data.amountCents!==0)throw new InvoiceFinanceError('个人考勤已还原，请选择保持金额不变来结束共同授课');
 }
 const teaching=resetting?(otherRecorded?before.teachingStatus:'pending'):clean(data.teachingStatus)||before.teachingStatus;
 if(!['pending','taught','not_taught','teacher_absent'].includes(teaching)||!resetting&&teaching==='pending')throw new InvoiceFinanceError('请选择实际授课情况');
 const proposedStart=data.actualStart!==undefined?instant(data.actualStart):before.teachingStart,proposedEnd=data.actualEnd!==undefined?instant(data.actualEnd):before.teachingEnd;
 const start=teaching==='taught'?(proposedStart&&before.teachingStart&&Date.parse(proposedStart)===Date.parse(before.teachingStart)?before.teachingStart:proposedStart):null,end=teaching==='taught'?(proposedEnd&&before.teachingEnd&&Date.parse(proposedEnd)===Date.parse(before.teachingEnd)?before.teachingEnd:proposedEnd):null;
 if(teaching==='taught'){if(!start||!end)throw new InvoiceFinanceError('请填写实际授课起止时间');const duration=Date.parse(end)-Date.parse(start);if(!Number.isFinite(duration)||duration<=0||duration>12*3600000||malaysiaDate(start)>malaysiaDate(new Date().toISOString())||malaysiaDate(end)>malaysiaDate(new Date().toISOString()))throw new InvoiceFinanceError('实际授课时间须有效、不超过12小时且不能在未来');}
 if(otherRecorded&&(teaching!==before.teachingStatus||start!==before.teachingStart||end!==before.teachingEnd))throw new InvoiceFinanceError('整班其他学生仍有已登记考勤，请先逐位更正账单考勤，再修改共同授课时间',409);
 if(!resetting&&teaching!=='taught'&&status!=='absent')throw new InvoiceFinanceError('未授课时不能记录学生已出席');
 if(teaching==='teacher_absent'&&data.chargeable)throw new InvoiceFinanceError('老师缺席不能标记本课收费');
 const arrived=resetting||status==='absent'?null:['present','early_leave'].includes(status)?start:instant(data.arrivedAt),left=resetting||status==='absent'?null:['present','late'].includes(status)?end:instant(data.leftAt);
 if(arrived&&left){if(!start||!end)throw new InvoiceFinanceError('请填写实际授课起止时间');const a=Date.parse(arrived),l=Date.parse(left),s=Date.parse(start),e=Date.parse(end);if(![a,l,s,e].every(Number.isFinite)||a<s||l>e||a>=l||(['late','late_early'].includes(status)&&a<=s)||(['early_leave','late_early'].includes(status)&&l>=e))throw new InvoiceFinanceError('学生到离时间必须符合授课范围及出席状态');}
 const replacement=await db.prepare("SELECT 1 FROM lessons WHERE group_id=? AND replacement_for=? AND status<>'cancelled'").bind(gid,lessonId).first();
 if(data.chargeable&&replacement)throw new InvoiceFinanceError('该课已有补课安排，不能同时把原课改为收费',409);
 const next={status:resetting?'scheduled':teaching==='teacher_absent'?'teacher_absent':status==='absent'?'student_absent':'completed',attendanceKind:status,actualStart:arrived,actualEnd:left,chargeable:resetting?null:data.chargeable?1:0,note:before.note};
 return{authority,details:{lessonId,sessionId:before.sessionId,before,after:next,reason},statements(guard:{sql:string;args:unknown[]},now:string,eventId:string){
  const id=crypto.randomUUID(),claim="EXISTS(SELECT 1 FROM invoice_attendance_corrections WHERE group_id=? AND id=? AND active=1)",args=[gid,id],reviewedAt=resetting?null:now,reviewedBy=resetting?null:actor.id;
  const after={...next,reviewedAt,reviewedBy,teachingStatus:teaching,teachingStart:start,teachingEnd:end,sessionStatus:resetting||Boolean(others?.pending)?'scheduled':'completed',sessionReviewedAt:teaching==='pending'?null:now,sessionReviewedBy:teaching==='pending'?null:actor.id};
  return[
   db.prepare(`INSERT INTO invoice_attendance_corrections(id,group_id,invoice_id,lesson_id,session_id,event_id,operation_id,actor_id,reason,before_json,after_json,active,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,1,? WHERE ${guard.sql}`).bind(id,gid,invoiceId,lessonId,before.sessionId,eventId,clean(data.operationId),actor.id,reason,JSON.stringify(before),JSON.stringify(after),now,...guard.args),
   db.prepare(`UPDATE class_sessions SET teaching_status=?,actual_start=?,actual_end=?,status=?,attendance_reviewed_at=?,attendance_reviewed_by=?,attendance_recorded_at=coalesce(attendance_recorded_at,?),attendance_recorded_by=coalesce(attendance_recorded_by,?),attendance_written_at=?,revision=revision+1,updated_at=? WHERE group_id=? AND id=? AND revision=? AND ${claim}`).bind(teaching,start,end,after.sessionStatus,after.sessionReviewedAt,after.sessionReviewedBy,now,actor.id,now,now,gid,before.sessionId,before.sessionRevision,...args),
   db.prepare(`UPDATE class_session_participants SET attendance_status=?,arrived_at=?,left_at=?,attendance_updated_at=? WHERE group_id=? AND session_id=? AND lesson_id=? AND ${claim}`).bind(status,arrived,left,now,gid,before.sessionId,lessonId,...args),
   db.prepare(`UPDATE lessons SET status=?,attendance_kind=?,actual_start=?,actual_end=?,chargeable=?,reviewed_at=?,reviewed_by=?,updated_at=? WHERE group_id=? AND id=? AND ${claim}`).bind(next.status,status,arrived,left,next.chargeable,reviewedAt,reviewedBy,now,gid,lessonId,...args),
   appendAudit(db,{id:'invoice-attendance:'+id,groupId:gid,lessonId,actorId:actor.id,actorName:actor.name,objectName:before.student+' · '+before.subject,action:'invoice.correctAttendance',before,after:{...after,invoiceId,eventId,reason,financialAmountCents:data.amountCents,financialKind:data.kind||null},at:now,guard:{sql:claim,args}}),
   db.prepare(`UPDATE invoice_attendance_corrections SET active=0,closed_at=? WHERE group_id=? AND id=? AND ${guard.sql}`).bind(now,gid,id,...guard.args),
  ];
 }};
}
