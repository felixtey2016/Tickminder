import {groupReader,groupStatement} from "@/lib/group-data";
import { env } from "cloudflare:workers";
import type { Account } from "@/lib/auth";
import { configuredBytes, DEFAULT_PDF_MAX_BYTES, displayPdfName } from "@/lib/learning";

type Row = Record<string, unknown>;

export function learningDb() {
  if (!env.DB) throw new Error("数据库暂时不可用");
  return env.DB;
}

export async function rows<T extends Row = Row>(query: string, ...values: unknown[]): Promise<T[]> {
  const result = await learningDb().prepare(query).bind(...values).all<T>();
  return result.results || [];
}

export async function first<T extends Row = Row>(query: string, ...values: unknown[]): Promise<T | null> {
  return await learningDb().prepare(query).bind(...values).first<T>();
}

export async function change(groupId:string, action: string, actorId: string, recordId: string, after: Record<string, unknown> | null = null) {
  await learningDb().prepare("INSERT INTO audit (group_id,id, lesson_id, actor_id, action, before_json, after_json, at) VALUES (?,?, ?, ?, ?, NULL, ?, ?)")
    .bind(groupId,crypto.randomUUID(), `learning:${recordId}`, actorId, action, after ? JSON.stringify(after) : null, new Date().toISOString()).run();
}

export async function teacherMayAssign(account: Account, student: string, subject: string) {
  const {first,rows}=groupReader(account.groupId);
  if (account.role !== "teacher" || !account.teacherName) return false;
  return Boolean(await first(`SELECT 1 AS allowed FROM plans p
    JOIN students s ON s.name = p.student JOIN teachers t ON t.name = p.teacher_name
    WHERE p.student = ? AND p.subject = ? AND p.teacher_name = ? AND p.active = 1 AND s.active = 1 AND t.active = 1`, student, subject, account.teacherName));
}

export async function teacherSubjects(account: Account) {
  const {first,rows}=groupReader(account.groupId);
  if (account.role !== "teacher" || !account.teacherName) return [];
  return rows<{ student: string; subject: string }>(`SELECT p.student, p.subject FROM plans p
    JOIN students s ON s.name = p.student JOIN teachers t ON t.name = p.teacher_name
    WHERE p.teacher_name = ? AND p.active = 1 AND s.active = 1 AND t.active = 1 ORDER BY p.student, p.subject`, account.teacherName);
}

function activeClassroomAccess(alias: string) {
  return `(${alias}.classroom_id IS NULL OR EXISTS (
    SELECT 1 FROM classroom_members cm
    JOIN classrooms c ON c.id = cm.classroom_id
    JOIN plans p ON p.student = cm.student_name AND p.subject = c.subject AND p.teacher_name = c.teacher_name AND p.active = 1
    JOIN students student ON student.name = cm.student_name AND student.active = 1
    JOIN teachers teacher ON teacher.name = c.teacher_name AND teacher.active = 1
    WHERE cm.classroom_id = ${alias}.classroom_id AND cm.student_name = ?
  ))`;
}

export async function studentHasHomework(account: Account, homeworkId: string) {
  const {first,rows}=groupReader(account.groupId);
  if (account.role !== "student" || !account.studentName) return false;
  return Boolean(await first(`SELECT 1 AS allowed FROM homework_recipients r JOIN homework h ON h.id = r.homework_id
    WHERE r.homework_id = ? AND r.student_name = ? AND ${activeClassroomAccess("h")}`, homeworkId, account.studentName, account.studentName));
}

export async function pdfMayRead(account: Account, fileId: string) {
  const {first,rows}=groupReader(account.groupId);
  const file = await first<{ id: string; objectKey: string; filename: string; bytes: number; status: string; ownerId: string }>(`SELECT id, object_key AS objectKey, filename, bytes, status, owner_id AS ownerId FROM pdf_files WHERE id = ?`, fileId);
  if (!file || !["staged", "attached"].includes(file.status)) return null;
  if (file.ownerId === account.id) return file;
  if (account.role === "admin" && file.status === "attached") {
    const published = await first(`SELECT 1 AS allowed FROM teaching_materials WHERE file_id = ?
      UNION ALL SELECT 1 FROM homework WHERE attachment_file_id = ?
      UNION ALL SELECT 1 FROM homework_submissions WHERE file_id = ? LIMIT 1`, fileId, fileId, fileId);
    if (published) return file;
  }
  if (account.role === "student" && account.studentName) {
    const material = await first(`SELECT 1 AS allowed FROM teaching_materials m JOIN material_recipients r ON r.material_id = m.id WHERE m.file_id = ? AND r.student_name = ? AND ${activeClassroomAccess("m")}`, fileId, account.studentName, account.studentName);
    const homework = await first(`SELECT 1 AS allowed FROM homework h JOIN homework_recipients r ON r.homework_id = h.id WHERE h.attachment_file_id = ? AND r.student_name = ? AND ${activeClassroomAccess("h")}`, fileId, account.studentName, account.studentName);
    const submission = await first(`SELECT 1 AS allowed FROM homework_submissions WHERE file_id = ? AND student_name = ?`, fileId, account.studentName);
    if (material || homework || submission) return file;
  }
  if (account.role === "teacher") {
    const submission = await first(`SELECT 1 AS allowed FROM homework_submissions s JOIN homework h ON h.id = s.homework_id WHERE s.file_id = ? AND h.owner_id = ?`, fileId, account.id);
    if (submission) return file;
  }
  return null;
}

export async function learningState(account: Account) {
  const {first,rows}=groupReader(account.groupId);
  const limits = { pdfMaxBytes: configuredBytes(env.PDF_MAX_BYTES, DEFAULT_PDF_MAX_BYTES) };
  if (account.role === "teacher" || account.role === "admin") {
    const ownerWhere = (alias: string) => account.role === "admin" ? "" : ` WHERE ${alias}.owner_id = ?`;
    const ownerValues = account.role === "admin" ? [] : [account.id];
    const [materials, materialRecipients, homework, homeworkRecipients, submissions, eligible] = await Promise.all([
      rows(`SELECT m.id, m.title, m.description, m.file_id AS fileId, m.created_at AS createdAt, m.classroom_id AS classroomId, m.owner_id AS ownerId, coalesce(u.teacher_name,u.name,'老师') AS teacherName, c.title AS classroomTitle, f.filename FROM teaching_materials m JOIN pdf_files f ON f.id = m.file_id LEFT JOIN accounts u ON u.id = m.owner_id LEFT JOIN classrooms c ON c.id = m.classroom_id${ownerWhere("m")} ORDER BY m.created_at DESC`, ...ownerValues),
      rows<{ materialId: string; studentName: string; subject: string }>(`SELECT r.material_id AS materialId, r.student_name AS studentName, r.subject FROM material_recipients r JOIN teaching_materials m ON m.id = r.material_id${ownerWhere("m")}`, ...ownerValues),
      rows(`SELECT h.id, h.title, h.subject, h.description, h.starts_at AS startsAt, h.due_at AS dueAt, h.max_score AS maxScore, h.attachment_file_id AS attachmentFileId, h.classroom_id AS classroomId, h.created_at AS createdAt, h.owner_id AS ownerId, coalesce(u.teacher_name,u.name,'老师') AS teacherName, c.title AS classroomTitle FROM homework h LEFT JOIN accounts u ON u.id = h.owner_id LEFT JOIN classrooms c ON c.id = h.classroom_id${ownerWhere("h")} ORDER BY h.created_at DESC`, ...ownerValues),
      rows<{ homeworkId: string; studentName: string; score: number | null; scoredAt: string | null }>(`SELECT r.homework_id AS homeworkId, r.student_name AS studentName, r.score, r.scored_at AS scoredAt FROM homework_recipients r JOIN homework h ON h.id = r.homework_id${ownerWhere("h")}`, ...ownerValues),
      rows(`SELECT s.id, s.homework_id AS homeworkId, s.student_name AS studentName, s.file_id AS fileId, s.submitted_at AS submittedAt, s.late, f.filename FROM homework_submissions s JOIN homework h ON h.id = s.homework_id JOIN pdf_files f ON f.id = s.file_id${ownerWhere("h")} ORDER BY s.submitted_at DESC`, ...ownerValues),
      teacherSubjects(account),
    ]);
    return {
      materials: materials.map(m => ({ ...m, filename: displayPdfName(String(m.filename), "教学资料"), recipients: materialRecipients.filter(r => r.materialId === m.id) })),
      homework: homework.map(h => ({ ...h, recipients: homeworkRecipients.filter(r => r.homeworkId === h.id).map(r => r.studentName), scores: homeworkRecipients.filter(r => r.homeworkId === h.id).map(r => ({ studentName: r.studentName, score: r.score, scoredAt: r.scoredAt })) })),
      submissions: submissions.map(s => ({ ...s, filename: displayPdfName(String(s.filename), "功课提交") })),
      eligible,
      studyBlocks: [],
      limits,
    };
  }
  if (account.role === "student" && account.studentName) {
    const [materials, homework, submissions, studyBlocks] = await Promise.all([
      rows(`SELECT m.id, m.title, m.description, m.file_id AS fileId, m.created_at AS createdAt, m.classroom_id AS classroomId, r.subject, f.filename FROM teaching_materials m JOIN material_recipients r ON r.material_id = m.id JOIN pdf_files f ON f.id = m.file_id WHERE r.student_name = ? AND ${activeClassroomAccess("m")} ORDER BY m.created_at DESC`, account.studentName, account.studentName),
      rows(`SELECT h.id, h.title, h.subject, h.description, h.starts_at AS startsAt, h.due_at AS dueAt, h.max_score AS maxScore, r.score, r.scored_at AS scoredAt, h.attachment_file_id AS attachmentFileId, h.classroom_id AS classroomId, h.created_at AS createdAt FROM homework h JOIN homework_recipients r ON r.homework_id = h.id WHERE r.student_name = ? AND ${activeClassroomAccess("h")} ORDER BY h.due_at`, account.studentName, account.studentName),
      rows(`SELECT s.id, s.homework_id AS homeworkId, s.file_id AS fileId, s.submitted_at AS submittedAt, s.late, f.filename FROM homework_submissions s JOIN pdf_files f ON f.id = s.file_id WHERE s.student_name = ? ORDER BY s.submitted_at DESC`, account.studentName),
      rows(`SELECT id, title, subject, note, starts_at AS startsAt, ends_at AS endsAt, homework_id AS homeworkId, created_at AS createdAt FROM study_blocks WHERE account_id = ? ORDER BY starts_at`, account.id),
    ]);
    return {
      materials: materials.map(m => ({ ...m, filename: displayPdfName(String(m.filename), "教学资料") })),
      homework,
      submissions: submissions.map(s => ({ ...s, filename: displayPdfName(String(s.filename), "功课提交") })),
      studyBlocks,
      eligible: [],
      limits,
    };
  }
  return { materials: [], homework: [], submissions: [], studyBlocks: [], eligible: [], limits };
}
