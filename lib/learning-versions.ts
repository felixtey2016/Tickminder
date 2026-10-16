import {guardedLearningReader} from "@/lib/learning-permission-read";
import type { Account } from "./auth";
import { groupReader, requireGroup } from "./group-data";
import { classroomMayManage } from "./classrooms-server";
import { learningDb, studentHasMaterial, studentHasHomework } from "./learning-server";
import { malaysiaInputToIso, STAGED_FILE_TTL_MS } from "./learning";
import {operationId,operationHash} from "./learning-operations";
import {learningNoticeStatement} from "./learning-notices";

export class LearningEditError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export type ContentKind = "material" | "homework";
type ContentRecord = Record<string, unknown> & {
  id: string; ownerId: string; title: string; description: string | null; fileId: string | null;
  classroomId: string | null; folderId: string | null; revision: number; updatedAt: string | null;
  subject?: string; startsAt?: string; dueAt?: string; maxScore?: number | null;
};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
function studentContentSnapshot(value: unknown) {
  const source=value && typeof value==="object" && !Array.isArray(value)?value as Record<string,unknown>:{};
  const snapshot:Record<string,unknown>={};
  for(const key of ["title","description","fileId","startsAt","dueAt","subject"]){
    if(typeof source[key]==="string"||source[key]===null)snapshot[key]=source[key];
  }
  if(source.maxScore===null||typeof source.maxScore==="number"&&Number.isFinite(source.maxScore))snapshot.maxScore=source.maxScore;
  return snapshot;
}
export function requireRevision(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new LearningEditError("请重新打开编辑窗口后保存", 409);
  return Number(value);
}
export async function contentRecord(actor: Account, kind: ContentKind, id: string, write = false) {
  const { first } = guardedLearningReader(actor,kind === "material" ? "materials.view" : "homework.view");
  const table = kind === "material" ? "teaching_materials" : "homework";
  const record = await first<ContentRecord>(`SELECT id,owner_id AS ownerId,title,description,${kind === "material" ? "file_id" : "attachment_file_id"} AS fileId,classroom_id AS classroomId,folder_id AS folderId,revision,updated_at AS updatedAt${kind === "homework" ? ",subject,starts_at AS startsAt,due_at AS dueAt,max_score AS maxScore" : ""} FROM ${table} WHERE id=?`, id);
  if (!record) throw new LearningEditError("内容不存在或无权访问", 404);
  if (write) {
    // Granular administrator grants do not expand teacher-owned edit rights.
    if (actor.role !== "teacher" || record.ownerId !== actor.id) throw new LearningEditError("只有发布内容的老师可以编辑", 403);
    if (record.classroomId) {
      const classroom = await classroomMayManage(actor, record.classroomId);
      if (!classroom || classroom.archived) throw new LearningEditError("班级不存在、已封存或无权管理", 403);
    }
  } else if (actor.role === "teacher" && record.ownerId === actor.id || actor.role === "admin") {
    // Group scope was enforced by the reader.
  } else if (actor.role === "student" && (kind === "homework" ? await studentHasHomework(actor, id) : await studentHasMaterial(actor,id))) {
    // Authorized recipients may read content history, never other students' grading history.
  } else throw new LearningEditError("内容不存在或无权访问", 404);
  return record;
}
export async function versionHistory(actor: Account, kind: ContentKind, id: string) {
  const record = await contentRecord(actor, kind, id);
  const { rows } = guardedLearningReader(actor,kind === "material" ? "materials.view" : "homework.view");
  const versions = await rows(`SELECT v.revision,v.file_id AS fileId,v.snapshot_json AS snapshotJson,v.actor_id AS actorId,v.changed_at AS changedAt,v.reason,coalesce(a.teacher_name,a.name,'老师') AS actorName,f.filename FROM learning_versions v LEFT JOIN accounts a ON a.id=v.actor_id LEFT JOIN pdf_files f ON f.id=v.file_id WHERE v.kind=? AND v.record_id=? ORDER BY v.revision DESC`, kind, id);
  const scores = kind === "homework" ? await rows(`SELECT s.id,s.student_name AS studentName,s.submission_id AS submissionId,s.homework_revision AS homeworkRevision,s.score,s.previous_score AS previousScore,s.max_score AS maxScore,s.changed_at AS changedAt,s.reason,coalesce(a.teacher_name,a.name,'老师') AS actorName FROM homework_score_history s LEFT JOIN accounts a ON a.id=s.actor_id WHERE s.homework_id=?${actor.role === "student" ? " AND s.student_name=?" : ""} ORDER BY s.changed_at DESC,s.id DESC`, id, ...(actor.role === "student" ? [actor.studentName] : [])) : [];
  if(actor.role==="student")return {
    record:{id:record.id,title:record.title,description:record.description,fileId:record.fileId,classroomId:record.classroomId,folderId:record.folderId,revision:record.revision,updatedAt:record.updatedAt,subject:record.subject,startsAt:record.startsAt,dueAt:record.dueAt,maxScore:record.maxScore},
    versions:versions.map(version=>({revision:version.revision,fileId:version.fileId,changedAt:version.changedAt,actorName:version.actorName,filename:version.filename,reason:["baseline","created"].includes(String(version.reason))?version.reason:"updated",snapshot:studentContentSnapshot(JSON.parse(String(version.snapshotJson)))})),
    scores:scores.map(score=>({id:score.id,studentName:score.studentName,submissionId:score.submissionId,homeworkRevision:score.homeworkRevision,score:score.score,previousScore:score.previousScore,maxScore:score.maxScore,changedAt:score.changedAt,actorName:score.actorName})),
  };
  return { record, versions: versions.map(v => ({ ...v, snapshotJson: undefined, snapshot: JSON.parse(String(v.snapshotJson)) })), scores };
}
export async function editPublishedContent(actor: Account, kind: ContentKind, data: Record<string, unknown>) {
  const groupId = requireGroup(actor.groupId), id = text(data.id), revision = requireRevision(data.revision);
  const record = await contentRecord(actor, kind, id, true);
  const requestId=data.requestId===undefined?crypto.randomUUID():operationId(data.requestId);
  const requestHash=await operationHash([kind,id,revision,text(data.title),text(data.description),text(data.startsAt),text(data.dueAt),data.scoreEnabled===true,String(data.maxScore??""),text(data.fileId),text(data.materialId),data.removeAttachment===true,data.notifyStudents===true]);
  const previousOperation=await groupReader(groupId).first<{afterJson:string}>("SELECT after_json AS afterJson FROM audit WHERE id=? AND actor_id=? AND lesson_id=?","edit:"+requestId,actor.id,"learning:"+id);
  if(previousOperation){const saved=JSON.parse(previousOperation.afterJson);if(saved.requestHash!==requestHash)throw new LearningEditError("重复操作的内容不一致，请重新打开窗口",409);return {ok:true,id,revision:saved.revision,replayed:true};}
  if (record.revision !== revision) throw new LearningEditError("内容已有新版本。请查看最新版本，再重新打开编辑窗口。你的输入尚未保存。", 409);
  const title = text(data.title), description = text(data.description);
  if (!title || title.length > 120 || description.length > (kind === "material" ? 2000 : 4000)) throw new LearningEditError("请填写有效的标题与内容");
  const { first } = groupReader(groupId);
  let fileId = record.fileId, staged = false;
  const replacement = text(data.fileId), materialId = text(data.materialId);
  if (replacement && materialId) throw new LearningEditError("请选择已有资料或新 PDF，不能同时选择");
  if (data.removeAttachment === true) {
    if (kind !== "homework" || replacement || materialId) throw new LearningEditError("附件选项无效");
    fileId = null;
  } else if (replacement && replacement !== record.fileId || materialId) {
    if (!record.classroomId) throw new LearningEditError("请先将旧内容整理到有效班级，再替换 PDF", 409);
    if (materialId) {
      if (kind !== "homework") throw new LearningEditError("附件选项无效");
      const material = await first<{fileId:string}>("SELECT file_id AS fileId FROM teaching_materials WHERE id=? AND owner_id=? AND classroom_id=?", materialId, actor.id, record.classroomId);
      if (!material) throw new LearningEditError("只能选择自己上传且属于当前班级的教学资料", 403);
      fileId = material.fileId;
    } else {
      const file = await first<{createdAt:string}>("SELECT created_at AS createdAt FROM pdf_files WHERE id=? AND owner_id=? AND kind=? AND context_id=? AND status='staged'", replacement, actor.id, kind, record.classroomId);
      if (!file || Date.parse(file.createdAt) < Date.now()-STAGED_FILE_TTL_MS) throw new LearningEditError("上传的 PDF 已失效，请重新上传",409);
      fileId = replacement; staged = true;
    }
  }
  const now = new Date().toISOString(), token = requestId, db = learningDb();
  const table = kind === "material" ? "teaching_materials" : "homework";
  const classGuard = `EXISTS(SELECT 1 FROM accounts a WHERE a.id=? AND a.group_id=? AND a.disabled_at IS NULL AND a.role='teacher') AND (classroom_id IS NULL OR EXISTS(SELECT 1 FROM classrooms c JOIN teachers t ON t.name=c.teacher_name AND t.group_id=c.group_id AND t.active=1 WHERE c.id=classroom_id AND c.group_id=? AND c.archived=0 AND c.teacher_name=?))`;
  let startsAt=record.startsAt, dueAt=record.dueAt, maxScore=record.maxScore;
  if (kind === "homework") {
    startsAt = malaysiaInputToIso(data.startsAt); dueAt = malaysiaInputToIso(data.dueAt);
    if (dueAt < startsAt) throw new LearningEditError("截止时间不能早于开始时间");
    if (data.scoreEnabled === true) {
      const raw = typeof data.maxScore === "number" ? String(data.maxScore) : text(data.maxScore);
      if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || Number(raw)<=0 || Number(raw)>10000) throw new LearningEditError("请输入有效的满分（最多两位小数）");
      maxScore = Number(raw);
    } else maxScore = null;
    const highest = await first<{score:number|null}>("SELECT max(score) AS score FROM homework_recipients WHERE homework_id=?",id);
    if (highest?.score != null && (maxScore===null || highest.score>maxScore)) throw new LearningEditError("已有成绩超过新满分，或仍有成绩记录。请先调整成绩；已评分功课不能关闭分数。",409);
  }
  const before = {title:record.title,description:record.description,fileId:record.fileId,...(kind==="homework"?{startsAt:record.startsAt,dueAt:record.dueAt,maxScore:record.maxScore}:{})};
  const after = {title,description,fileId,...(kind==="homework"?{startsAt,dueAt,maxScore}:{})};
  const changedFields=Object.keys(after).filter(key=>JSON.stringify(before[key as keyof typeof before] ?? null)!==JSON.stringify(after[key as keyof typeof after] ?? null));
  if (!changedFields.length) return {ok:true,id,revision,unchanged:true};
  const update = db.prepare(`UPDATE ${table} SET title=?,description=?,${kind === "material" ? "file_id=?" : "attachment_file_id=?,starts_at=?,due_at=?,max_score=?"},revision=revision+1,updated_at=?,edit_token=? WHERE id=? AND group_id=? AND owner_id=? AND revision=? AND ${classGuard}`)
    .bind(title,description|| (kind==="material"?null:""),fileId,...(kind==="homework"?[startsAt,dueAt,maxScore]:[]),now,token,id,groupId,actor.id,revision,actor.id,groupId,groupId,actor.teacherName);
  const claim=`EXISTS(SELECT 1 FROM ${table} WHERE id=? AND group_id=? AND edit_token=?)`,claimArgs=[id,groupId,token];
  try {
    const results=await db.batch([
      update,
      ...(staged?[db.prepare(`UPDATE pdf_files SET status='attached' WHERE id=? AND group_id=? AND owner_id=? AND status='staged' AND ${claim}`).bind(fileId,groupId,actor.id,...claimArgs)]:[]),
      db.prepare(`INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) SELECT ?,?,?,?,?,?,?,? WHERE ${claim}`).bind(groupId,"edit:"+requestId,`learning:${id}`,actor.id,kind==="homework"?"editHomework":"updateMaterial",JSON.stringify(before),JSON.stringify({...after,revision:revision+1,changedFields,requestHash,notifyStudents:data.notifyStudents===true}),now,...claimArgs),
      ...(data.notifyStudents===true?[learningNoticeStatement({groupId,kind,recordId:id,eventId:"edit:"+requestId,type:kind==="homework"?"homework_updated":"material_updated",at:now,guard:claim,guardArgs:claimArgs})]:[]),
    ]);
    if (!results[0].meta.changes) throw new LearningEditError("内容已有新版本。请查看最新版本，再重新打开编辑窗口。你的输入尚未保存。",409);
  } catch (error) {
    if(/UNIQUE constraint/.test(String(error))){const saved=await first<{afterJson:string}>("SELECT after_json AS afterJson FROM audit WHERE id=? AND actor_id=? AND lesson_id=?","edit:"+requestId,actor.id,"learning:"+id);if(saved&&JSON.parse(saved.afterJson).requestHash===requestHash)return {ok:true,id,revision:JSON.parse(saved.afterJson).revision,replayed:true};}
    if (/score maximum conflict/.test(String(error))) throw new LearningEditError("已有成绩超过新满分，或仍有成绩记录。请先调整成绩；已评分功课不能关闭分数。",409);
    throw error;
  }
  return {ok:true,id,revision:revision+1};
}
