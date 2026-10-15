import {groupReader,groupStatement,requireGroup} from "@/lib/group-data";
import { NextResponse } from "next/server";
import { currentBusinessAccount as currentAccount } from "@/lib/auth";
import type { Account } from "@/lib/auth";
import { change, first, learningDb, rows, studentHasHomework, teacherMayAssign } from "@/lib/learning-server";
import { intervalsOverlap, malaysiaInputToIso, STAGED_FILE_TTL_MS, submissionRule } from "@/lib/learning";
import { deleteUnreferencedFile } from "@/lib/pdf-storage";
import { activeClassroomMemberNames, classroomMayManage } from "@/lib/classrooms-server";
import { FolderError, validateContentFolder } from "@/lib/folders-server";
import { activeResubmissionGrant } from "@/lib/homework-review";
import { editPublishedContent, LearningEditError, requireRevision } from "@/lib/learning-versions";

class ActionError extends Error {
  constructor(message: string, readonly status = 400, readonly overlaps?: string[]) { super(message); }
}
const str = (value: unknown) => typeof value === "string" ? value.trim() : "";
const response = (error: ActionError) => NextResponse.json({ error: error.message, overlaps: error.overlaps }, { status: error.status });
function scoreNumber(value: unknown, allowZero: boolean) {
  const raw = typeof value === "number" ? String(value) : str(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new ActionError("分数最多保留两位小数");
  const score = Number(raw);
  if (!Number.isFinite(score) || score > 10000 || (allowZero ? score < 0 : score <= 0)) throw new ActionError("请输入有效的分数（0 至 10000）");
  return score;
}

function recipients(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new ActionError("请选择至少一位学生，最多 100 位");
  const names = [...new Set(value.map(str))];
  if (names.some(name => !name || name.length > 80)) throw new ActionError("学生名单无效");
  return names;
}

async function uploadedFile(actor:Account,fileId: string, kind: string, contextId: string | null = null) {
  const {first}=groupReader(actor.groupId);
  const file = await first<{ id: string; status: string; kind: string; contextId: string | null; createdAt: string }>(
    "SELECT id, status, kind, context_id AS contextId, created_at AS createdAt FROM pdf_files WHERE id = ? AND owner_id = ?", fileId, actor.id);
  if (!file || file.kind !== kind || file.contextId !== contextId || file.status !== "staged" || Date.parse(file.createdAt) < Date.now() - STAGED_FILE_TTL_MS) throw new ActionError("上传的 PDF 已失效，请重新上传", 409);
  return file;
}

export async function POST(request: Request) {
  if (new URL(request.url).origin !== request.headers.get("origin")) return response(new ActionError("Origin mismatch", 403));
  const actor = await currentAccount();
  if (!actor || !["teacher", "student"].includes(actor.role)) return response(new ActionError("没有操作权限", 403));
  const groupId=requireGroup(actor.groupId); const {first,rows}=groupReader(groupId);
  let data: Record<string, unknown>;
  try { data = await request.json() as Record<string, unknown>; }
  catch { return response(new ActionError("请求格式无效")); }
  const action = str(data.action);
  const now = new Date().toISOString();
  try {
    if (await first("SELECT 1 AS mustChange FROM local_credentials WHERE account_id = ? AND must_change_password = 1", actor.id)) throw new ActionError("请先修改初始密码", 403);
    const db = learningDb();
    if (action === "saveMaterial") {
      if (actor.role !== "teacher") throw new ActionError("只有老师可以管理教学资料", 403);
      const title = str(data.title), description = str(data.description), subject = str(data.subject), fileId = str(data.fileId), id = str(data.id);
      if (id) return NextResponse.json(await editPublishedContent(actor,"material",data));
      const existing = id ? await first<{ fileId: string; classroomId: string | null }>("SELECT file_id AS fileId,classroom_id AS classroomId FROM teaching_materials WHERE id = ? AND owner_id = ?", id, actor.id) : null;
      if (id && !existing) throw new ActionError("资料不存在或无权修改", 404);
      const requestedClassroomId = str(data.classroomId);
      if (existing && requestedClassroomId && requestedClassroomId !== existing.classroomId) throw new ActionError("不能把资料移到其他班级", 403);
      const classroomId = existing?.classroomId || requestedClassroomId;
      if (!existing && !classroomId) throw new ActionError("请选择有效班级");
      const classroom = classroomId ? await classroomMayManage(actor, classroomId) : null;
      if (classroomId && (!classroom || classroom.archived || classroom.subject !== subject)) throw new ActionError("班级不存在、已封存或科目不符", 403);
      const students = classroom ? await activeClassroomMemberNames(classroomId,groupId) : recipients(data.students);
      if (!students.length) throw new ActionError("班级尚无学生", 409);
      if (!title || title.length > 120 || description.length > 2000 || !subject || subject.length > 100) throw new ActionError("请填写资料标题、科目和有效说明");
      for (const student of students) if (!await teacherMayAssign(actor, student, subject)) throw new ActionError("只能分配给目前由你负责的学生科目", 403);
      if (id) {
        if (fileId && fileId !== existing!.fileId) throw new ActionError("资料文件不能直接替换，请新增资料");
        await db.batch([
          groupStatement(groupId,"UPDATE teaching_materials SET title = ?, description = ? WHERE (id = ? AND owner_id = ?) AND group_id = ?").bind(title, description || null, id, actor.id,groupId),
          groupStatement(groupId,"DELETE FROM material_recipients WHERE (material_id = ?) AND group_id = ?").bind(id,groupId),
          ...students.map(student => groupStatement(groupId,"INSERT INTO material_recipients (group_id,id, material_id, student_name, subject) VALUES (?,?, ?, ?, ?)").bind(groupId,crypto.randomUUID(), id, student, subject)),
        ]);
        await change(groupId,"updateMaterial", actor.id, id, { title, subject, students });
        return NextResponse.json({ ok: true, id });
      }
      const folderId = await validateContentFolder(groupId,classroomId,str(data.folderId));
      await uploadedFile(actor,fileId, "material",classroomId);
      if (await first("SELECT 1 AS used FROM teaching_materials WHERE file_id = ?", fileId)) throw new ActionError("这份文件已用于另一份资料", 409);
      const newId = crypto.randomUUID();
      await db.batch([
        groupStatement(groupId,"INSERT INTO teaching_materials (group_id,id, owner_id, title, description, file_id, created_at, classroom_id,folder_id) VALUES (?,?, ?, ?, ?, ?, ?, ?, ?)").bind(groupId,newId, actor.id, title, description || null, fileId, now, classroomId,folderId),
        ...students.map(student => groupStatement(groupId,"INSERT INTO material_recipients (group_id,id, material_id, student_name, subject) VALUES (?,?, ?, ?, ?)").bind(groupId,crypto.randomUUID(), newId, student, subject)),
        groupStatement(groupId,"UPDATE pdf_files SET status = 'attached' WHERE (id = ? AND owner_id = ? AND status = 'staged') AND group_id = ?").bind(fileId, actor.id,groupId),
      ]);
      await change(groupId,"saveMaterial", actor.id, newId, { title, subject, students });
      return NextResponse.json({ ok: true, id: newId });
    }
    if (action === "deleteMaterial") {
      if (actor.role !== "teacher") throw new ActionError("只有上传资料的老师可以删除", 403);
      const id = str(data.id);
      const historicalFiles=await rows<{fileId:string}>("SELECT file_id AS fileId FROM learning_versions WHERE kind='material' AND record_id=? AND file_id IS NOT NULL",id);
      const material = await first<{ fileId: string }>("SELECT file_id AS fileId FROM teaching_materials WHERE id = ? AND owner_id = ?", id, actor.id);
      if (!material) throw new ActionError("资料不存在或无权删除", 404);
      await db.batch([
        groupStatement(groupId,"DELETE FROM material_recipients WHERE (material_id = ?) AND group_id = ?").bind(id,groupId),
        groupStatement(groupId,"DELETE FROM teaching_materials WHERE (id = ? AND owner_id = ?) AND group_id = ?").bind(id, actor.id,groupId),
      ]);
      await change(groupId,"deleteMaterial", actor.id, id);
      for (const fileId of new Set([material.fileId,...historicalFiles.map(f=>f.fileId)])) { try { await deleteUnreferencedFile(fileId); } catch { /* Retain metadata for a later cleanup attempt. */ } }
      return NextResponse.json({ ok: true });
    }
    if (action === "publishHomework") {
      if (actor.role !== "teacher") throw new ActionError("只有老师可以布置功课", 403);
      const title = str(data.title), subject = str(data.subject), description = str(data.description);
      const classroomId = str(data.classroomId);
      if (!classroomId) throw new ActionError("请选择有效班级");
      const classroom = classroomId ? await classroomMayManage(actor, classroomId) : null;
      if (classroomId && (!classroom || classroom.archived || classroom.subject !== subject)) throw new ActionError("班级不存在、已封存或科目不符", 403);
      const students = classroom ? await activeClassroomMemberNames(classroomId,groupId) : recipients(data.students);
      if (!students.length) throw new ActionError("班级尚无学生", 409);
      if (!title || title.length > 120 || !subject || subject.length > 100 || description.length > 4000) throw new ActionError("请填写有效的功课标题、科目和要求");
      const maxScore = data.scoreEnabled === true ? scoreNumber(data.maxScore, false) : null;
      const startsAt = malaysiaInputToIso(data.startsAt), dueAt = malaysiaInputToIso(data.dueAt);
      if (dueAt < startsAt) throw new ActionError("截止时间不能早于开始时间");
      for (const student of students) if (!await teacherMayAssign(actor, student, subject)) throw new ActionError("只能布置给目前由你负责的学生科目", 403);
      let attachmentFileId: string | null = null;
      const folderId = await validateContentFolder(groupId,classroomId,str(data.folderId));
      let staged = false;
      const materialId = str(data.materialId), fileId = str(data.fileId);
      if (materialId && fileId) throw new ActionError("请选择已有资料或新 PDF，不能同时选择");
      if (materialId) {
        const material = await first<{ fileId: string; classroomId: string | null }>("SELECT m.file_id AS fileId,m.classroom_id AS classroomId FROM teaching_materials m JOIN material_recipients r ON r.material_id = m.id WHERE m.id = ? AND m.owner_id = ? AND r.subject = ? LIMIT 1", materialId, actor.id, subject);
        if (!material || material.classroomId !== (classroomId || null)) throw new ActionError("只能选择自己上传且属于当前班级的教学资料", 403);
        attachmentFileId = material.fileId;
      } else if (fileId) {
        await uploadedFile(actor,fileId, "homework",classroomId);
        attachmentFileId = fileId;
        staged = true;
      }
      const id = crypto.randomUUID();
      await db.batch([
        groupStatement(groupId,"INSERT INTO homework (group_id,id, owner_id, title, subject, description, starts_at, due_at, max_score, attachment_file_id, created_at, classroom_id,folder_id) VALUES (?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(groupId,id, actor.id, title, subject, description, startsAt, dueAt, maxScore, attachmentFileId, now, classroomId,folderId),
        ...students.map(student => groupStatement(groupId,"INSERT INTO homework_recipients (group_id,id, homework_id, student_name) VALUES (?,?, ?, ?)").bind(groupId,crypto.randomUUID(), id, student)),
        ...(staged ? [groupStatement(groupId,"UPDATE pdf_files SET status = 'attached' WHERE (id = ? AND owner_id = ? AND status = 'staged') AND group_id = ?").bind(attachmentFileId, actor.id,groupId)] : []),
      ]);
      await change(groupId,"publishHomework", actor.id, id, { title, subject, students, startsAt, dueAt, maxScore });
      return NextResponse.json({ ok: true, id });
    }
    if (action === "setHomeworkScore") {
      if (actor.role !== "teacher") throw new ActionError("只有布置功课的老师可以填写分数", 403);
      const id = str(data.homeworkId), student = str(data.studentName);
      const homeworkRevision=requireRevision(data.revision);
      if(!Number.isSafeInteger(data.scoreRevision) || Number(data.scoreRevision)<0)throw new ActionError("成绩已改变，请刷新后再评分",409);
      const task = await first<{ maxScore: number | null; revision:number;classroomId:string|null }>("SELECT max_score AS maxScore,revision,classroom_id AS classroomId FROM homework WHERE id = ? AND owner_id = ?", id, actor.id);
      if (!task || task.maxScore === null) throw new ActionError("功课不存在或未启用分数", 404);
      if(task.revision!==homeworkRevision)throw new ActionError("功课已有新版本，请刷新后再评分",409);
      if(task.classroomId){const room=await classroomMayManage(actor,task.classroomId);if(!room || room.archived)throw new ActionError("班级不存在、已封存或无权管理",403);}
      if (!await first("SELECT 1 AS recipient FROM homework_recipients WHERE homework_id = ? AND student_name = ?", id, student)) throw new ActionError("学生未收到这份功课", 404);
      if (!await first("SELECT 1 AS submitted FROM homework_submissions WHERE homework_id = ? AND student_name = ?", id, student)) throw new ActionError("学生尚未提交功课，暂不能填写分数", 409);
      const score = scoreNumber(data.score, true);
      if (score > task.maxScore) throw new ActionError("得分不能超过满分");
      const latest=await first<{id:string}>("SELECT id FROM homework_submissions WHERE homework_id=? AND student_name=? ORDER BY attempt DESC,submitted_at DESC,id DESC LIMIT 1",id,student);
      if(!latest || data.submissionId!==latest.id)throw new ActionError("提交记录已改变，请刷新后再评分",409);
      const scoreToken=crypto.randomUUID();
      const results=await db.batch([
        groupStatement(groupId,"UPDATE homework_recipients SET score=?,scored_at=?,scored_by=?,score_revision=score_revision+1,score_token=? WHERE homework_id=? AND student_name=? AND group_id=? AND score_revision=? AND EXISTS(SELECT 1 FROM homework h WHERE h.id=? AND h.revision=?) AND ?=(SELECT s.id FROM homework_submissions s WHERE s.homework_id=? AND s.student_name=? ORDER BY s.attempt DESC,s.submitted_at DESC,s.id DESC LIMIT 1)").bind(score,now,actor.id,scoreToken,id,student,groupId,data.scoreRevision,id,homeworkRevision,latest.id,id,student),
        groupStatement(groupId,"INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) SELECT ?,?,?,?,?,NULL,?,? WHERE EXISTS(SELECT 1 FROM homework_recipients WHERE homework_id=? AND student_name=? AND score_token=?)").bind(groupId,crypto.randomUUID(),"learning:"+id,actor.id,"setHomeworkScore",JSON.stringify({student,score,homeworkRevision,submissionId:latest.id}),now,id,student,scoreToken),
      ]);
      if(!results[0].meta.changes)throw new ActionError("成绩、功课或提交记录已改变，请刷新后再评分",409);
      return NextResponse.json({ ok: true, score });
    }
    if (action === "submitHomework") {
      if (actor.role !== "student" || !actor.studentName) throw new ActionError("只有收到功课的学生可以提交", 403);
      const id = str(data.homeworkId), fileId = str(data.fileId);
      if (!await studentHasHomework(actor, id)) throw new ActionError("功课不存在或未分配给你", 404);
      const revision=requireRevision(data.revision);
      const homework = await first<{ startsAt: string; dueAt: string;revision:number }>("SELECT starts_at AS startsAt, due_at AS dueAt,revision FROM homework WHERE id = ?", id);
      if (!homework) throw new ActionError("功课不存在", 404);
      const sameFile = await first<{ id: string; submittedAt: string; late: number }>("SELECT id, submitted_at AS submittedAt, late FROM homework_submissions WHERE homework_id = ? AND student_name = ? AND file_id = ?", id, actor.studentName, fileId);
      if (sameFile) return NextResponse.json({ ok: true, submission: sameFile });
      if(homework.revision!==revision)throw new ActionError("功课已有新版本，请查看最新要求后再提交",409);
      const previous = await first("SELECT 1 AS submitted FROM homework_submissions WHERE homework_id = ? AND student_name = ?", id, actor.studentName);
      const rule = submissionRule(now, homework.startsAt, homework.dueAt, Boolean(previous));
      if (rule === "not_started") throw new ActionError("开始时间尚未到，暂不能提交", 403);
      const grant=await activeResubmissionGrant(actor,id);
      if (rule === "replacement_closed" && (!grant || str(data.grantId)!==grant.id)) throw new ActionError("截止后需要老师授权才能重新提交",403);
      const previousSubmissionId=str(data.previousSubmissionId),grantId=str(data.grantId);
      await uploadedFile(actor,fileId, "submission", id);
      const submissionId = crypto.randomUUID();
      const results = await db.batch([
        groupStatement(groupId,`INSERT INTO homework_submissions (group_id,id,homework_id,student_name,file_id,submitted_at,late,homework_revision,starts_at_submission,due_at_submission,max_score_submission,authorized_grant_id,attempt)
          SELECT ?,?,h.id,?,?,?,CASE WHEN ?>h.due_at THEN 1 ELSE 0 END,h.revision,h.starts_at,h.due_at,h.max_score,CASE WHEN ?>h.due_at THEN ? ELSE NULL END,coalesce((SELECT max(attempt) FROM homework_submissions WHERE homework_id=h.id AND student_name=?),0)+1 FROM homework h WHERE h.id=? AND h.revision=? AND ?>=h.starts_at
          AND coalesce((SELECT id FROM homework_submissions WHERE homework_id=h.id AND student_name=? ORDER BY attempt DESC,submitted_at DESC,id DESC LIMIT 1),'')=?
          AND (?<=h.due_at OR NOT EXISTS(SELECT 1 FROM homework_submissions WHERE homework_id=h.id AND student_name=?) OR EXISTS(SELECT 1 FROM homework_recipients r JOIN homework_resubmission_grants g ON g.id=r.active_grant_id WHERE r.homework_id=h.id AND r.student_name=? AND r.group_id=h.group_id AND g.id=? AND g.group_id=h.group_id AND g.base_submission_id=? AND g.used_at IS NULL AND g.revoked_at IS NULL))`)
          .bind(groupId,submissionId,actor.studentName,fileId,now,now,now,grantId||null,actor.studentName,id,revision,now,actor.studentName,previousSubmissionId,now,actor.studentName,actor.studentName,grantId,previousSubmissionId),
        groupStatement(groupId,"UPDATE homework_resubmission_grants SET used_at=?,used_submission_id=? WHERE id IN(SELECT active_grant_id FROM homework_recipients WHERE homework_id=? AND student_name=?) AND group_id=? AND used_at IS NULL AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM homework_submissions WHERE id=?)").bind(now,submissionId,id,actor.studentName,groupId,submissionId),
        groupStatement(groupId,"UPDATE pdf_files SET status = 'attached' WHERE (id = ? AND owner_id = ? AND status = 'staged' AND EXISTS (SELECT 1 FROM homework_submissions WHERE file_id = ?)) AND group_id = ?").bind(fileId, actor.id, fileId,groupId),
        groupStatement(groupId,"UPDATE homework_recipients SET score = NULL, scored_at = NULL, scored_by = NULL, score_revision=score_revision+1, score_token=NULL,active_grant_id=NULL,resubmit_revision=resubmit_revision+1 WHERE (homework_id = ? AND student_name = ? AND EXISTS (SELECT 1 FROM homework_submissions WHERE file_id = ?)) AND group_id = ?").bind(id, actor.studentName, fileId,groupId),
        groupStatement(groupId,"INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) SELECT ?,?,?,?,'submitHomework',?,? WHERE EXISTS(SELECT 1 FROM homework_submissions WHERE id=?)").bind(groupId,"submission:"+submissionId,"learning:"+id,actor.id,JSON.stringify({submissionId,late:rule==='late'||rule==='replacement_closed',grantId:rule==='replacement_closed'?grantId:null,homeworkRevision:revision}),now,submissionId),
      ]);
      if (!results[0].meta.changes) throw new ActionError("功课、日期或提交记录已改变，请刷新后再提交",409);
      return NextResponse.json({ ok: true, submission: { id: submissionId, submittedAt: now, late: rule === "late" || rule === "replacement_closed" } });
    }
    if (action === "saveStudyBlock") {
      if (actor.role !== "student" || !actor.studentName) throw new ActionError("只有学生可以编辑个人学习安排", 403);
      const id = str(data.id), title = str(data.title), subject = str(data.subject), note = str(data.note), homeworkId = str(data.homeworkId);
      if (!title || title.length > 120 || subject.length > 100 || note.length > 1000) throw new ActionError("请填写有效的学习安排");
      const startsAt = malaysiaInputToIso(data.startsAt), endsAt = malaysiaInputToIso(data.endsAt);
      if (endsAt <= startsAt || Date.parse(endsAt) - Date.parse(startsAt) > 24 * 60 * 60 * 1000) throw new ActionError("结束时间必须晚于开始时间，最长 24 小时");
      if (homeworkId && !await studentHasHomework(actor, homeworkId)) throw new ActionError("只能关联自己的功课", 403);
      if (id && !await first("SELECT 1 AS owned FROM study_blocks WHERE id = ? AND account_id = ?", id, actor.id)) throw new ActionError("安排不存在或无权修改", 404);
      const [lessons, blocks] = await Promise.all([
        rows<{ subject: string; plannedStart: string; plannedEnd: string }>("SELECT subject, planned_start AS plannedStart, planned_end AS plannedEnd FROM lessons WHERE student = ? AND status <> 'cancelled' AND planned_start < ? AND planned_end > ?", actor.studentName, endsAt, startsAt),
        rows<{ id: string; title: string; startsAt: string; endsAt: string }>("SELECT id, title, starts_at AS startsAt, ends_at AS endsAt FROM study_blocks WHERE account_id = ? AND starts_at < ? AND ends_at > ?", actor.id, endsAt, startsAt),
      ]);
      const overlaps = [...lessons.filter(l => intervalsOverlap(startsAt, endsAt, l.plannedStart, l.plannedEnd)).map(l => `补习课：${l.subject}`),
        ...blocks.filter(b => b.id !== id && intervalsOverlap(startsAt, endsAt, b.startsAt, b.endsAt)).map(b => `学习安排：${b.title}`)];
      if (overlaps.length && data.keepOverlap !== true) throw new ActionError("时间与已有安排重叠，仍要保存吗？", 409, overlaps);
      const recordId = id || crypto.randomUUID();
      if (id) await groupStatement(groupId,"UPDATE study_blocks SET title = ?, subject = ?, note = ?, starts_at = ?, ends_at = ?, homework_id = ?, updated_at = ? WHERE (id = ? AND account_id = ?) AND group_id = ?")
        .bind(title, subject || null, note || null, startsAt, endsAt, homeworkId || null, now, id, actor.id,groupId).run();
      else await groupStatement(groupId,"INSERT INTO study_blocks (group_id,id, account_id, title, subject, note, starts_at, ends_at, homework_id, created_at, updated_at) VALUES (?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(groupId,recordId, actor.id, title, subject || null, note || null, startsAt, endsAt, homeworkId || null, now, now).run();
      await change(groupId,id ? "updateStudyBlock" : "saveStudyBlock", actor.id, recordId, { title, startsAt, endsAt });
      return NextResponse.json({ ok: true, id: recordId });
    }
    if (action === "deleteStudyBlock") {
      if (actor.role !== "student") throw new ActionError("只有学生可以删除个人学习安排", 403);
      const id = str(data.id);
      const deleted = await groupStatement(groupId,"DELETE FROM study_blocks WHERE (id = ? AND account_id = ?) AND group_id = ?").bind(id, actor.id,groupId).run();
      if (!deleted.meta.changes) throw new ActionError("安排不存在或无权删除", 404);
      await change(groupId,"deleteStudyBlock", actor.id, id);
      return NextResponse.json({ ok: true });
    }
    throw new ActionError("未知操作", 400);
  } catch (error) {
    if(error instanceof LearningEditError)return response(new ActionError(error.message,error.status));
    if(/score maximum conflict/.test(String(error)))return response(new ActionError("功课满分已改变，请刷新后再评分",409));
    return response(error instanceof ActionError ? error : error instanceof FolderError ? new ActionError(error.message,error.status) : new ActionError("服务器未能确认结果，请刷新列表检查后再重试", 503));
  }
}
