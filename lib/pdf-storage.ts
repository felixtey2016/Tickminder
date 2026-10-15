import { env } from "cloudflare:workers";
import { configuredBytes, DEFAULT_PDF_MAX_BYTES, DEFAULT_TOTAL_STORAGE_BYTES, STAGED_FILE_TTL_MS } from "@/lib/learning";
import { learningDb, rows } from "@/lib/learning-server";

export function pdfBucket() {
  if (!env.BUCKET) throw new Error("PDF 私有储存尚未接通");
  return env.BUCKET;
}

export function pdfLimits() {
  return {
    perFile: configuredBytes(env.PDF_MAX_BYTES, DEFAULT_PDF_MAX_BYTES),
    total: configuredBytes(env.PDF_TOTAL_STORAGE_LIMIT_BYTES, DEFAULT_TOTAL_STORAGE_BYTES),
  };
}

export async function cleanOldStagedFiles() {
  const old = new Date(Date.now() - STAGED_FILE_TTL_MS).toISOString();
  const candidates = await rows<{ id: string; objectKey: string; bytes: number;groupId:string }>(`SELECT f.id, f.object_key AS objectKey, f.bytes,f.group_id AS groupId FROM pdf_files f WHERE f.status = 'staged' AND f.created_at < ?
    AND NOT EXISTS (SELECT 1 FROM teaching_materials m WHERE m.file_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM homework h WHERE h.attachment_file_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM homework_submissions s WHERE s.file_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM learning_versions v WHERE v.file_id=f.id)
    AND NOT EXISTS(SELECT 1 FROM homework_feedback fb WHERE fb.file_id=f.id) LIMIT 20`, old);
  for (const file of candidates) {
    try {
      await deleteUnreferencedFile(file.id);
    } catch { /* Retry cleanup on a later upload without blocking this upload. */ }
  }
  const unused = await rows<{ id: string }>(`SELECT f.id FROM pdf_files f WHERE (f.status='deleting' OR (f.status = 'attached' AND f.created_at < ?))
    AND NOT EXISTS (SELECT 1 FROM teaching_materials m WHERE m.file_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM homework h WHERE h.attachment_file_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM homework_submissions s WHERE s.file_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM learning_versions v WHERE v.file_id=f.id)
    AND NOT EXISTS(SELECT 1 FROM homework_feedback fb WHERE fb.file_id=f.id) LIMIT 20`, old);
  for (const file of unused) {
    try { await deleteUnreferencedFile(file.id); }
    catch { /* Retry cleanup on a later upload. */ }
  }
}

export async function deleteUnreferencedFile(fileId: string) {
  const file = await learningDb().prepare("SELECT id, object_key AS objectKey, bytes,group_id AS groupId FROM pdf_files WHERE id = ?").bind(fileId).first<{ id: string; objectKey: string; bytes: number; groupId:string }>();
  if (!file) return;
  // Claim atomically before touching R2. New version rows cannot reference a
  // deleting file; a failed R2 delete retains metadata for a later retry.
  const claimed=await learningDb().prepare(`UPDATE pdf_files SET status='deleting' WHERE id=? AND status IN ('staged','attached','deleting')
    AND NOT EXISTS(SELECT 1 FROM teaching_materials WHERE file_id=?) AND NOT EXISTS(SELECT 1 FROM homework WHERE attachment_file_id=?)
    AND NOT EXISTS(SELECT 1 FROM homework_submissions WHERE file_id=?) AND NOT EXISTS(SELECT 1 FROM learning_versions WHERE file_id=?) AND NOT EXISTS(SELECT 1 FROM homework_feedback WHERE file_id=?)`).bind(fileId,fileId,fileId,fileId,fileId,fileId).run();
  if(!claimed.meta.changes)return;
  await pdfBucket().delete(file.objectKey);
  const deleted = await learningDb().prepare("DELETE FROM pdf_files WHERE id = ? AND status='deleting'").bind(fileId).run();
  if (deleted.meta.changes) await learningDb().prepare("UPDATE storage_quota SET used_bytes = max(0, used_bytes - ?) WHERE id = 1 AND group_id=?").bind(file.bytes,file.groupId).run();
}
