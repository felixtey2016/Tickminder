import type {Account} from './auth';
import {env} from 'cloudflare:workers';
import {learningDb} from './learning-server';
import {learningRecipientSql} from './learning-notices';
import {pdfReaderIdentity} from './pdf-read-access';
import {configuredBytes,DEFAULT_PDF_MAX_BYTES,displayPdfName} from './learning';
import {operationalRowVisible,operationalStudentVisible} from './group-data';

export class NotificationTargetError extends Error{constructor(message:string,readonly status=404){super(message);}}

// Learning notices are addressed only to students. Fetch the one recipient
// record and its own submissions, never an entire class/month learning state.
export async function notificationLearningTarget(actor:Account,kind:'homework'|'material',id:string){
 if(actor.role!=='student'||!actor.studentName)throw new NotificationTargetError('内容不存在或没有查看权限');
 const db=learningDb(),identity=pdfReaderIdentity(actor),table=kind==='homework'?'homework':'teaching_materials';
 const access=`h.id=? AND h.group_id=? AND ${learningRecipientSql(kind,'h','a')} AND (${identity.sql}) AND ${operationalRowVisible(table,'h')} AND ${operationalStudentVisible('h.group_id','a.student_name')}`;
 const from=`FROM ${table} h JOIN accounts a ON a.id=? AND a.group_id=h.group_id`;
 const args=[actor.id,id,actor.groupId,...identity.args];
 const limits={pdfMaxBytes:configuredBytes(env.PDF_MAX_BYTES,DEFAULT_PDF_MAX_BYTES)};
 if(kind==='material'){
  const item=await db.prepare(`SELECT h.id,h.revision,h.title,h.description,h.file_id AS fileId,h.classroom_id AS classroomId,r.subject,f.filename ${from} JOIN material_recipients r ON r.material_id=h.id AND r.group_id=h.group_id AND r.student_name=a.student_name JOIN pdf_files f ON f.id=h.file_id AND f.group_id=h.group_id WHERE ${access}`).bind(...args).first<Record<string,unknown>>();
  if(!item)throw new NotificationTargetError('内容不存在或没有查看权限');
  return{kind,item:{...item,filename:displayPdfName(String(item.filename),'教学资料')},submissions:[],limits};
 }
 const item=await db.prepare(`SELECT h.id,h.revision,h.updated_at AS updatedAt,h.title,h.subject,h.description,h.starts_at AS startsAt,h.due_at AS dueAt,h.max_score AS maxScore,h.attachment_file_id AS attachmentFileId,h.folder_id AS folderId,h.classroom_id AS classroomId,h.created_at AS createdAt,r.score,r.scored_at AS scoredAt,r.resubmit_revision AS resubmitRevision,CASE WHEN EXISTS(SELECT 1 FROM homework_resubmission_grants g WHERE g.id=r.active_grant_id AND g.used_at IS NULL AND g.revoked_at IS NULL AND g.base_submission_id=(SELECT id FROM homework_submissions s WHERE s.homework_id=h.id AND s.group_id=h.group_id AND s.student_name=r.student_name ORDER BY attempt DESC,submitted_at DESC,id DESC LIMIT 1)) THEN r.active_grant_id ELSE NULL END AS resubmitGrantId ${from} JOIN homework_recipients r ON r.homework_id=h.id AND r.group_id=h.group_id AND r.student_name=a.student_name WHERE ${access}`).bind(...args).first<Record<string,unknown>>();
 if(!item)throw new NotificationTargetError('内容不存在或没有查看权限');
 const submissions=(await db.prepare(`SELECT s.id,s.homework_id AS homeworkId,s.file_id AS fileId,s.submitted_at AS submittedAt,s.attempt,s.homework_revision AS homeworkRevision,s.due_at_submission AS dueAtSubmission,s.max_score_submission AS maxScoreSubmission,s.late,f.filename ${from} JOIN homework_submissions s ON s.homework_id=h.id AND s.group_id=h.group_id AND s.student_name=a.student_name JOIN pdf_files f ON f.id=s.file_id AND f.group_id=s.group_id WHERE ${access} ORDER BY s.attempt DESC,s.submitted_at DESC,s.id DESC`).bind(...args).all<Record<string,unknown>>()).results;
 if(!await db.prepare(`SELECT 1 ${from} WHERE ${access}`).bind(...args).first())throw new NotificationTargetError('内容权限已改变，请刷新后重试',403);
 return{kind,item,submissions:submissions.map(s=>({...s,filename:displayPdfName(String(s.filename),'功课提交')})),limits};
}
