import { env } from "cloudflare:workers";
import { configuredBytes, DEFAULT_PDF_MAX_BYTES, DEFAULT_TOTAL_STORAGE_BYTES, STAGED_FILE_TTL_MS } from "@/lib/learning";
import { learningDb, rows } from "@/lib/learning-server";
import {unreferencedPdfSql} from './file-references';

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
    AND ${unreferencedPdfSql('f')} LIMIT 20`, old);
  for (const file of candidates) {
    try {
      await deleteUnreferencedFile(file.id);
    } catch { /* Retry cleanup on a later upload without blocking this upload. */ }
  }
  const unused = await rows<{ id: string }>(`SELECT f.id FROM pdf_files f WHERE (f.status='deleting' OR (f.status = 'attached' AND f.created_at < ?))
    AND ${unreferencedPdfSql('f')} LIMIT 20`, old);
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
  const claimed=await learningDb().prepare(`UPDATE pdf_files AS f SET status='deleting' WHERE id=? AND status IN ('staged','attached','deleting')
    AND ${unreferencedPdfSql('f')}`).bind(fileId).run();
  if(!claimed.meta.changes)return;
  await pdfBucket().delete(file.objectKey);
  // Metadata and its owning group's charge commit together. An R2 or database
  // failure leaves a retryable deleting row; concurrent retries charge once.
  await learningDb().batch([
    learningDb().prepare("DELETE FROM pdf_files WHERE id = ? AND group_id=? AND status='deleting'").bind(fileId,file.groupId),
    learningDb().prepare("UPDATE storage_quota SET used_bytes=max(0,used_bytes-?) WHERE id=1 AND group_id=? AND changes()=1").bind(file.bytes,file.groupId),
  ]);
}
