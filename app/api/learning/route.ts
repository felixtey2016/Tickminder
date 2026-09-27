import { NextResponse } from "next/server";
import { currentAccount } from "@/lib/auth";
import { change, first, learningDb, rows, studentHasHomework, teacherMayAssign } from "@/lib/learning-server";
import { intervalsOverlap, malaysiaInputToIso, STAGED_FILE_TTL_MS, submissionRule } from "@/lib/learning";
import { deleteUnreferencedFile } from "@/lib/pdf-storage";
import { activeClassroomMemberNames, classroomMayManage } from "@/lib/classrooms-server";

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

async function uploadedFile(fileId: string, ownerId: string, kind: string, contextId: string | null = null) {
  const file = await first<{ id: string; status: string; kind: string; contextId: string | null; createdAt: string }>(
    "SELECT id, status, kind, context_id AS contextId, created_at AS createdAt FROM pdf_files WHERE id = ? AND owner_id = ?", fileId, ownerId);
  if (!file || file.kind !== kind || file.contextId !== contextId || file.status !== "staged" || Date.parse(file.createdAt) < Date.now() - STAGED_FILE_TTL_MS) throw new ActionError("上传的 PDF 已失效，请重新上传", 409);
  return file;
}

export async function POST(request: Request) {
  if (new URL(request.url).origin !== request.headers.get("origin")) return response(new ActionError("Origin mismatch", 403));
  const actor = await currentAccount();
  if (!actor || !["teacher", "student"].includes(actor.role)) return response(new ActionError("没有操作权限", 403));
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
      const existing = id ? await first<{ fileId: string; classroomId: string | null }>("SELECT file_id AS fileId,classroom_id AS classroomId FROM teaching_materials WHERE id = ? AND owner_id = ?", id, actor.id) : null;
      if (id && !existing) throw new ActionError("资料不存在或无权修改", 404);
      const requestedClassroomId = str(data.classroomId);
      if (existing && requestedClassroomId && requestedClassroomId !== existing.classroomId) throw new ActionError("不能把资料移到其他班级", 403);
      const classroomId = existing?.classroomId || requestedClassroomId;
      const classroom = classroomId ? await classroomMayManage(actor, classroomId) : null;
      if (classroomId && (!classroom || classroom.archived || classroom.subject !== subject)) throw new ActionError("班级不存在、已封存或科目不符", 403);
      const students = classroom ? await activeClassroomMemberNames(classroomId) : recipients(data.students);
      if (!students.length) throw new ActionError("班级尚无学生", 409);
      if (!title || title.length > 120 || description.length > 2000 || !subject || subject.length > 100) throw new ActionError("请填写资料标题、科目和有效说明");
      for (const student of students) if (!await teacherMayAssign(actor, student, subject)) throw new ActionError("只能分配给目前由你负责的学生科目", 403);
      if (id) {
        if (fileId && fileId !== existing!.fileId) throw new ActionError("资料文件不能直接替换，请新增资料");
        await db.batch([
          db.prepare("UPDATE teaching_materials SET title = ?, description = ? WHERE id = ? AND owner_id = ?").bind(title, description || null, id, actor.id),
          db.prepare("DELETE FROM material_recipients WHERE material_id = ?").bind(id),
          ...students.map(student => db.prepare("INSERT INTO material_recipients (id, material_id, student_name, subject) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), id, student, subject)),
        ]);
        await change("updateMaterial", actor.id, id, { title, subject, students });
        return NextResponse.json({ ok: true, id });
      }
      await uploadedFile(fileId, actor.id, "material");
      if (await first("SELECT 1 AS used FROM teaching_materials WHERE file_id = ?", fileId)) throw new ActionError("这份文件已用于另一份资料", 409);
      const newId = crypto.randomUUID();
      await db.batch([
        db.prepare("INSERT INTO teaching_materials (id, owner_id, title, description, file_id, created_at, classroom_id) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(newId, actor.id, title, description || null, fileId, now, classroomId || null),
        ...students.map(student => db.prepare("INSERT INTO material_recipients (id, material_id, student_name, subject) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), newId, student, subject)),
        db.prepare("UPDATE pdf_files SET status = 'attached' WHERE id = ? AND owner_id = ? AND status = 'staged'").bind(fileId, actor.id),
      ]);
      await change("saveMaterial", actor.id, newId, { title, subject, students });
      return NextResponse.json({ ok: true, id: newId });
    }
    if (action === "deleteMaterial") {
      if (actor.role !== "teacher") throw new ActionError("只有上传资料的老师可以删除", 403);
      const id = str(data.id);
      const material = await first<{ fileId: string }>("SELECT file_id AS fileId FROM teaching_materials WHERE id = ? AND owner_id = ?", id, actor.id);
      if (!material) throw new ActionError("资料不存在或无权删除", 404);
      await db.batch([
        db.prepare("DELETE FROM material_recipients WHERE material_id = ?").bind(id),
        db.prepare("DELETE FROM teaching_materials WHERE id = ? AND owner_id = ?").bind(id, actor.id),
      ]);
      await change("deleteMaterial", actor.id, id);
      try { await deleteUnreferencedFile(material.fileId); } catch { /* Retain metadata for a later cleanup attempt. */ }
      return NextResponse.json({ ok: true });
    }
    if (action === "publishHomework") {
      if (actor.role !== "teacher") throw new ActionError("只有老师可以布置功课", 403);
      const title = str(data.title), subject = str(data.subject), description = str(data.description);
      const classroomId = str(data.classroomId);
      const classroom = classroomId ? await classroomMayManage(actor, classroomId) : null;
      if (classroomId && (!classroom || classroom.archived || classroom.subject !== subject)) throw new ActionError("班级不存在、已封存或科目不符", 403);
      const students = classroom ? await activeClassroomMemberNames(classroomId) : recipients(data.students);
      if (!students.length) throw new ActionError("班级尚无学生", 409);
      if (!title || title.length > 120 || !subject || subject.length > 100 || description.length > 4000) throw new ActionError("请填写有效的功课标题、科目和要求");
      const maxScore = data.scoreEnabled === true ? scoreNumber(data.maxScore, false) : null;
      const startsAt = malaysiaInputToIso(data.startsAt), dueAt = malaysiaInputToIso(data.dueAt);
      if (dueAt < startsAt) throw new ActionError("截止时间不能早于开始时间");
      for (const student of students) if (!await teacherMayAssign(actor, student, subject)) throw new ActionError("只能布置给目前由你负责的学生科目", 403);
      let attachmentFileId: string | null = null;
      let staged = false;
      const materialId = str(data.materialId), fileId = str(data.fileId);
      if (materialId && fileId) throw new ActionError("请选择已有资料或新 PDF，不能同时选择");
      if (materialId) {
        const material = await first<{ fileId: string; classroomId: string | null }>("SELECT m.file_id AS fileId,m.classroom_id AS classroomId FROM teaching_materials m JOIN material_recipients r ON r.material_id = m.id WHERE m.id = ? AND m.owner_id = ? AND r.subject = ? LIMIT 1", materialId, actor.id, subject);
        if (!material || material.classroomId !== (classroomId || null)) throw new ActionError("只能选择自己上传且属于当前班级的教学资料", 403);
        attachmentFileId = material.fileId;
      } else if (fileId) {
        await uploadedFile(fileId, actor.id, "homework");
        attachmentFileId = fileId;
        staged = true;
      }
      const id = crypto.randomUUID();
      await db.batch([
        db.prepare("INSERT INTO homework (id, owner_id, title, subject, description, starts_at, due_at, max_score, attachment_file_id, created_at, classroom_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(id, actor.id, title, subject, description, startsAt, dueAt, maxScore, attachmentFileId, now, classroomId || null),
        ...students.map(student => db.prepare("INSERT INTO homework_recipients (id, homework_id, student_name) VALUES (?, ?, ?)").bind(crypto.randomUUID(), id, student)),
        ...(staged ? [db.prepare("UPDATE pdf_files SET status = 'attached' WHERE id = ? AND owner_id = ? AND status = 'staged'").bind(attachmentFileId, actor.id)] : []),
      ]);
      await change("publishHomework", actor.id, id, { title, subject, students, startsAt, dueAt, maxScore });
      return NextResponse.json({ ok: true, id });
    }
    if (action === "setHomeworkScore") {
      if (actor.role !== "teacher") throw new ActionError("只有布置功课的老师可以填写分数", 403);
      const id = str(data.homeworkId), student = str(data.studentName);
      const task = await first<{ maxScore: number | null }>("SELECT max_score AS maxScore FROM homework WHERE id = ? AND owner_id = ?", id, actor.id);
      if (!task || task.maxScore === null) throw new ActionError("功课不存在或未启用分数", 404);
      if (!await first("SELECT 1 AS recipient FROM homework_recipients WHERE homework_id = ? AND student_name = ?", id, student)) throw new ActionError("学生未收到这份功课", 404);
      if (!await first("SELECT 1 AS submitted FROM homework_submissions WHERE homework_id = ? AND student_name = ?", id, student)) throw new ActionError("学生尚未提交功课，暂不能填写分数", 409);
      const score = scoreNumber(data.score, true);
      if (score > task.maxScore) throw new ActionError("得分不能超过满分");
      await learningDb().prepare("UPDATE homework_recipients SET score = ?, scored_at = ?, scored_by = ? WHERE homework_id = ? AND student_name = ?")
        .bind(score, now, actor.id, id, student).run();
      await change("setHomeworkScore", actor.id, id, { student, score });
      return NextResponse.json({ ok: true, score });
    }
    if (action === "submitHomework") {
      if (actor.role !== "student" || !actor.studentName) throw new ActionError("只有收到功课的学生可以提交", 403);
      const id = str(data.homeworkId), fileId = str(data.fileId);
      if (!await studentHasHomework(actor, id)) throw new ActionError("功课不存在或未分配给你", 404);
      const homework = await first<{ startsAt: string; dueAt: string }>("SELECT starts_at AS startsAt, due_at AS dueAt FROM homework WHERE id = ?", id);
      if (!homework) throw new ActionError("功课不存在", 404);
      const sameFile = await first<{ id: string; submittedAt: string; late: number }>("SELECT id, submitted_at AS submittedAt, late FROM homework_submissions WHERE homework_id = ? AND student_name = ? AND file_id = ?", id, actor.studentName, fileId);
      if (sameFile) return NextResponse.json({ ok: true, submission: sameFile });
      const previous = await first("SELECT 1 AS submitted FROM homework_submissions WHERE homework_id = ? AND student_name = ?", id, actor.studentName);
      const rule = submissionRule(now, homework.startsAt, homework.dueAt, Boolean(previous));
      if (rule === "not_started") throw new ActionError("开始时间尚未到，暂不能提交", 403);
      if (rule === "replacement_closed") throw new ActionError("截止后不能替换已提交的功课", 403);
      await uploadedFile(fileId, actor.id, "submission", id);
      const submissionId = crypto.randomUUID();
      const results = await db.batch([
        db.prepare(`INSERT INTO homework_submissions (id, homework_id, student_name, file_id, submitted_at, late)
          SELECT ?, ?, ?, ?, ?, ? WHERE ? <= (SELECT due_at FROM homework WHERE id = ?)
          OR NOT EXISTS (SELECT 1 FROM homework_submissions WHERE homework_id = ? AND student_name = ?)`)
          .bind(submissionId, id, actor.studentName, fileId, now, rule === "late" ? 1 : 0, now, id, id, actor.studentName),
        db.prepare("UPDATE pdf_files SET status = 'attached' WHERE id = ? AND owner_id = ? AND status = 'staged' AND EXISTS (SELECT 1 FROM homework_submissions WHERE file_id = ?)").bind(fileId, actor.id, fileId),
        db.prepare("UPDATE homework_recipients SET score = NULL, scored_at = NULL, scored_by = NULL WHERE homework_id = ? AND student_name = ? AND EXISTS (SELECT 1 FROM homework_submissions WHERE file_id = ?)").bind(id, actor.studentName, fileId),
      ]);
      if (!results[0].meta.changes) throw new ActionError("截止后不能替换已提交的功课", 403);
      await change("submitHomework", actor.id, id, { submissionId, late: rule === "late" });
      return NextResponse.json({ ok: true, submission: { id: submissionId, submittedAt: now, late: rule === "late" } });
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
      if (id) await db.prepare("UPDATE study_blocks SET title = ?, subject = ?, note = ?, starts_at = ?, ends_at = ?, homework_id = ?, updated_at = ? WHERE id = ? AND account_id = ?")
        .bind(title, subject || null, note || null, startsAt, endsAt, homeworkId || null, now, id, actor.id).run();
      else await db.prepare("INSERT INTO study_blocks (id, account_id, title, subject, note, starts_at, ends_at, homework_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(recordId, actor.id, title, subject || null, note || null, startsAt, endsAt, homeworkId || null, now, now).run();
      await change(id ? "updateStudyBlock" : "saveStudyBlock", actor.id, recordId, { title, startsAt, endsAt });
      return NextResponse.json({ ok: true, id: recordId });
    }
    if (action === "deleteStudyBlock") {
      if (actor.role !== "student") throw new ActionError("只有学生可以删除个人学习安排", 403);
      const id = str(data.id);
      const deleted = await db.prepare("DELETE FROM study_blocks WHERE id = ? AND account_id = ?").bind(id, actor.id).run();
      if (!deleted.meta.changes) throw new ActionError("安排不存在或无权删除", 404);
      await change("deleteStudyBlock", actor.id, id);
      return NextResponse.json({ ok: true });
    }
    throw new ActionError("未知操作", 400);
  } catch (error) {
    return response(error instanceof ActionError ? error : new ActionError("暂时无法保存，请重试", 503));
  }
}
