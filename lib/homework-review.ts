import type {Account} from "./auth";
import {groupReader,requireGroup} from "./group-data";
import {learningDb,studentHasHomework} from "./learning-server";
import {contentRecord,LearningEditError,requireRevision} from "./learning-versions";
import {STAGED_FILE_TTL_MS} from "./learning";
import {learningNoticeStatement} from "./learning-notices";

const str=(value:unknown)=>typeof value==="string"?value.trim():"";
export function operationId(value:unknown) {const id=str(value);if(!/^[a-zA-Z0-9_-]{16,80}$/.test(id))throw new LearningEditError("操作标识已失效，请重新打开窗口",409);return id;}
export async function operationHash(value:unknown){const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");}
type Recipient=Record<string,unknown>&{id:string;studentName:string;resubmitRevision:number;activeGrantId:string|null;score:number|null;scoreRevision:number};
export async function reviewRecipient(actor:Account,homeworkId:string,studentName:string,write=false) {
  const record=await contentRecord(actor,"homework",homeworkId,write),{first}=groupReader(actor.groupId);
  if(actor.role==="student" && (studentName!==actor.studentName || !await studentHasHomework(actor,homeworkId)))throw new LearningEditError("没有权限查看这位学生的提交",403);
  const recipient=await first<Recipient>("SELECT id,student_name AS studentName,resubmit_revision AS resubmitRevision,active_grant_id AS activeGrantId,score,score_revision AS scoreRevision FROM homework_recipients WHERE homework_id=? AND student_name=?",homeworkId,studentName);
  if(!recipient)throw new LearningEditError("学生未收到这份功课",404);
  return {record,recipient};
}
export async function homeworkReview(actor:Account,homeworkId:string,studentName:string) {
  const {record,recipient}=await reviewRecipient(actor,homeworkId,studentName),{rows}=groupReader(actor.groupId);
  const [submissions,feedback,grades,grants]=await Promise.all([
    rows("SELECT s.id,s.file_id AS fileId,f.filename,s.submitted_at AS submittedAt,s.late,s.homework_revision AS homeworkRevision,s.due_at_submission AS dueAtSubmission,s.max_score_submission AS maxScoreSubmission,s.authorized_grant_id AS authorizedGrantId FROM homework_submissions s JOIN pdf_files f ON f.id=s.file_id WHERE s.homework_id=? AND s.student_name=? ORDER BY s.attempt DESC,s.submitted_at DESC,s.id DESC",homeworkId,studentName),
    rows("SELECT f.id,f.submission_id AS submissionId,f.comment,f.file_id AS fileId,f.created_at AS createdAt,coalesce(a.teacher_name,a.name,'老师') AS teacherName FROM homework_feedback f JOIN homework_submissions s ON s.id=f.submission_id LEFT JOIN accounts a ON a.id=f.teacher_id WHERE f.homework_id=? AND s.student_name=? ORDER BY f.created_at DESC,f.id DESC",homeworkId,studentName),
    rows("SELECT id,submission_id AS submissionId,score,previous_score AS previousScore,max_score AS maxScore,changed_at AS changedAt,reason FROM homework_score_history WHERE homework_id=? AND student_name=? ORDER BY changed_at DESC,id DESC",homeworkId,studentName),
    rows("SELECT id,base_submission_id AS baseSubmissionId,granted_at AS grantedAt,used_at AS usedAt,revoked_at AS revokedAt,used_submission_id AS usedSubmissionId FROM homework_resubmission_grants WHERE homework_id=? AND student_name=? ORDER BY granted_at DESC,id DESC",homeworkId,studentName),
  ]);
  const active=grants.find(g=>g.id===recipient.activeGrantId && !g.usedAt && !g.revokedAt && g.baseSubmissionId===submissions[0]?.id);
  const visibleGrades=actor.role==="student"?grades.map(grade=>({id:grade.id,submissionId:grade.submissionId,score:grade.score,previousScore:grade.previousScore,maxScore:grade.maxScore,changedAt:grade.changedAt})):grades;
  return {homework:{id:record.id,title:record.title,revision:record.revision,classroomId:record.classroomId,dueAt:record.dueAt,maxScore:record.maxScore},studentName,currentScore:recipient.score,grantRevision:recipient.resubmitRevision,activeGrantId:active?.id || null,submissions,feedback,grades:visibleGrades,grants};
}
export async function activeResubmissionGrant(actor:Account,homeworkId:string) {
  if(actor.role!=="student" || !actor.studentName)return null;
  const {first}=groupReader(actor.groupId);
  return first<{id:string;baseSubmissionId:string}>(`SELECT g.id,g.base_submission_id AS baseSubmissionId FROM homework_recipients r JOIN homework_resubmission_grants g ON g.id=r.active_grant_id
    WHERE r.homework_id=? AND r.student_name=? AND g.used_at IS NULL AND g.revoked_at IS NULL AND g.base_submission_id=(SELECT id FROM homework_submissions s WHERE s.homework_id=r.homework_id AND s.student_name=r.student_name ORDER BY attempt DESC,submitted_at DESC,id DESC LIMIT 1)`,homeworkId,actor.studentName);
}
export async function reviewAction(actor:Account,data:Record<string,unknown>) {
  const action=str(data.action),homeworkId=str(data.homeworkId),studentName=str(data.studentName),id=operationId(data.requestId),groupId=requireGroup(actor.groupId),{first}=groupReader(groupId),db=learningDb(),now=new Date().toISOString();
  const {record,recipient}=await reviewRecipient(actor,homeworkId,studentName,true);
  const submissionId=str(data.submissionId);
  const submission=await first<{id:string}>("SELECT id FROM homework_submissions WHERE id=? AND homework_id=? AND student_name=?",submissionId,homeworkId,studentName);
  if(!submission)throw new LearningEditError("提交记录不存在或无权访问",404);
  const writable=`EXISTS(SELECT 1 FROM homework h JOIN accounts a ON a.id=h.owner_id AND a.group_id=h.group_id AND a.disabled_at IS NULL AND a.role='teacher' WHERE h.id=? AND h.group_id=? AND h.owner_id=? AND (h.classroom_id IS NULL OR EXISTS(SELECT 1 FROM classrooms c JOIN teachers t ON t.name=c.teacher_name AND t.group_id=c.group_id AND t.active=1 WHERE c.id=h.classroom_id AND c.group_id=h.group_id AND c.archived=0 AND c.teacher_name=a.teacher_name)))`;
  const writeArgs=[homeworkId,groupId,actor.id];
  if(action==="grantResubmission") {
    const requestHash=await operationHash([action,homeworkId,studentName,submissionId,data.revision,data.grantRevision]);
    const previous=await first<{requestHash:string}>("SELECT request_hash AS requestHash FROM homework_resubmission_grants WHERE id=? AND granted_by=? AND homework_id=? AND student_name=?",id,actor.id,homeworkId,studentName);
    if(previous){if(previous.requestHash!==requestHash)throw new LearningEditError("重复操作的内容不一致，请重新打开窗口",409);return {ok:true,id,replayed:true};}
    const revision=requireRevision(data.revision);
    if(!Number.isSafeInteger(data.grantRevision)||Number(data.grantRevision)<0)throw new LearningEditError("重交权限已改变，请重新载入",409);
    if(recipient.activeGrantId){const grant=await first("SELECT id FROM homework_resubmission_grants WHERE id=? AND used_at IS NULL AND revoked_at IS NULL",recipient.activeGrantId);if(grant)throw new LearningEditError("这位学生已有一次重交权限",409);}
    const claim=`EXISTS(SELECT 1 FROM homework_resubmission_grants WHERE id=? AND group_id=? AND granted_by=?)`,claimArgs=[id,groupId,actor.id];
    const result=await db.batch([
      db.prepare(`INSERT INTO homework_resubmission_grants(id,group_id,homework_id,recipient_id,student_name,base_submission_id,granted_by,granted_at,request_hash)
        SELECT ?,?,?,?,?,?,?,?,? WHERE ${writable} AND EXISTS(SELECT 1 FROM homework h WHERE h.id=? AND h.revision=?)
        AND EXISTS(SELECT 1 FROM homework_recipients r WHERE r.id=? AND r.group_id=? AND r.resubmit_revision=? AND r.active_grant_id IS NULL)
        AND ?=(SELECT id FROM homework_submissions WHERE homework_id=? AND student_name=? AND group_id=? ORDER BY attempt DESC,submitted_at DESC,id DESC LIMIT 1)`)
        .bind(id,groupId,homeworkId,recipient.id,studentName,submissionId,actor.id,now,requestHash,...writeArgs,homeworkId,revision,recipient.id,groupId,data.grantRevision,submissionId,homeworkId,studentName,groupId),
      db.prepare(`UPDATE homework_recipients SET active_grant_id=?,resubmit_revision=resubmit_revision+1 WHERE id=? AND group_id=? AND ${claim}`).bind(id,recipient.id,groupId,...claimArgs),
      db.prepare(`INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) SELECT ?,?,?,?,'grantResubmission',?,? WHERE ${claim}`).bind(groupId,"grant:"+id,"learning:"+homeworkId,actor.id,JSON.stringify({studentName,submissionId,grantId:id}),now,...claimArgs),
      learningNoticeStatement({groupId,kind:"homework",recordId:homeworkId,eventId:"grant:"+id,type:"resubmission_granted",at:now,student:studentName,guard:claim,guardArgs:claimArgs}),
    ]);
    if(!result[0].meta.changes)throw new LearningEditError("功课、提交或重交权限已改变，请重新载入",409);
    return {ok:true,id};
  }
  if(action==="revokeResubmission") {
    if(!Number.isSafeInteger(data.grantRevision)||Number(data.grantRevision)<0)throw new LearningEditError("重交权限已改变，请重新载入",409);
    const grantId=str(data.grantId),requestHash=await operationHash([action,homeworkId,studentName,grantId,data.grantRevision]);
    const prior=await first<{afterJson:string}>("SELECT after_json AS afterJson FROM audit WHERE id=? AND actor_id=? AND lesson_id=?","revoke:"+id,actor.id,"learning:"+homeworkId);
    if(prior){if(JSON.parse(prior.afterJson).requestHash!==requestHash)throw new LearningEditError("重复操作的内容不一致，请重新打开窗口",409);return {ok:true,replayed:true};}
    const result=await db.batch([
      db.prepare(`UPDATE homework_recipients SET active_grant_id=NULL,resubmit_revision=resubmit_revision+1 WHERE id=? AND group_id=? AND active_grant_id=? AND resubmit_revision=? AND ${writable}`).bind(recipient.id,groupId,grantId,data.grantRevision,...writeArgs),
      db.prepare(`UPDATE homework_resubmission_grants SET revoked_at=?,revoked_by=? WHERE id=? AND group_id=? AND used_at IS NULL AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM homework_recipients WHERE id=? AND resubmit_revision=? AND active_grant_id IS NULL)`).bind(now,actor.id,grantId,groupId,recipient.id,Number(data.grantRevision)+1),
      db.prepare(`INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) SELECT ?,?,?,?,'revokeResubmission',?,? WHERE EXISTS(SELECT 1 FROM homework_resubmission_grants WHERE id=? AND group_id=? AND revoked_at=? AND revoked_by=?)`).bind(groupId,"revoke:"+id,"learning:"+homeworkId,actor.id,JSON.stringify({studentName,grantId,requestHash}),now,grantId,groupId,now,actor.id),
    ]);
    if(!result[0].meta.changes)throw new LearningEditError("重交权限已改变或已使用，请重新载入",409);
    return {ok:true};
  }
  if(action==="publishFeedback") {
    const comment=str(data.comment),fileId=str(data.fileId)||null;
    if(comment.length>4000 || (!comment&&!fileId))throw new LearningEditError("请填写评语或选择批改 PDF");
    const requestHash=await operationHash([action,homeworkId,studentName,submissionId,comment,fileId]);
    const previous=await first<{requestHash:string}>("SELECT request_hash AS requestHash FROM homework_feedback WHERE id=? AND teacher_id=? AND homework_id=? AND submission_id=?",id,actor.id,homeworkId,submissionId);
    if(previous){if(previous.requestHash!==requestHash)throw new LearningEditError("重复操作的内容不一致，请重新打开窗口",409);return {ok:true,id,replayed:true};}
    if(fileId){const file=await first<{createdAt:string}>("SELECT created_at AS createdAt FROM pdf_files WHERE id=? AND owner_id=? AND kind='feedback' AND context_id=? AND status='staged'",fileId,actor.id,submissionId);if(!file || Date.parse(file.createdAt)<Date.now()-STAGED_FILE_TTL_MS)throw new LearningEditError("上传的 PDF 已失效，请重新上传",409);}
    const claim=`EXISTS(SELECT 1 FROM homework_feedback WHERE id=? AND group_id=? AND teacher_id=?)`,claimArgs=[id,groupId,actor.id];
    const results=await db.batch([
      db.prepare(`INSERT INTO homework_feedback(id,group_id,homework_id,submission_id,teacher_id,comment,file_id,created_at,request_hash) SELECT ?,?,?,?,?,?,?,?,? WHERE ${writable}`).bind(id,groupId,homeworkId,submissionId,actor.id,comment,fileId,now,requestHash,...writeArgs),
      ...(fileId?[db.prepare(`UPDATE pdf_files SET status='attached' WHERE id=? AND group_id=? AND status='staged' AND ${claim}`).bind(fileId,groupId,...claimArgs)]:[]),
      db.prepare(`INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) SELECT ?,?,?,?,'publishFeedback',?,? WHERE ${claim}`).bind(groupId,"feedback:"+id,"learning:"+homeworkId,actor.id,JSON.stringify({studentName,submissionId,feedbackId:id,fileId,comment}),now,...claimArgs),
      learningNoticeStatement({groupId,kind:"homework",recordId:homeworkId,eventId:"feedback:"+id,type:"feedback_published",at:now,student:studentName,guard:claim,guardArgs:claimArgs}),
    ]);
    if(!results[0].meta.changes)throw new LearningEditError("班级或操作权限已改变，请重新载入",409);
    return {ok:true,id};
  }
  throw new LearningEditError("请求格式无效");
}
