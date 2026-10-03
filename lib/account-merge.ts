import type { Account } from "@/lib/auth";
import { first, learningDb } from "@/lib/learning-server";

// Only called after the signed-in user's current password AND the Google credential
// have both been verified. A second explicit confirmation is required for a merge.
export async function prepareAccountMerge(actor: Account, duplicateId: string, confirmed: boolean) {
  const db = learningDb();
  const duplicate = await first<{ id: string; name: string; role: string; teacher_name: string | null; student_name: string | null; disabled_at: string | null }>("SELECT * FROM accounts WHERE id = ?", duplicateId);
  if (!duplicate || duplicate.disabled_at) return { error: "此 Google 账号已停用，请联系管理员", statements: [] };
  const same = duplicate.role === actor.role && (actor.role === "teacher" ? Boolean(actor.teacherName) && duplicate.teacher_name === actor.teacherName : actor.role === "student" && Boolean(actor.studentName) && duplicate.student_name === actor.studentName);
  if (duplicate.role !== "pending" && !same) return { error: "两个账号的身份不同，请联系管理员核对后再连接", statements: [] };
  if (await first("SELECT 1 AS found FROM local_credentials WHERE account_id = ?", duplicate.id)) return { error: "Google 已连接另一个密码账号，请联系管理员", statements: [] };
  if (!confirmed) return { mergeName: duplicate.name, error: "发现已有 Google 账号，确认后会合并登录方式并保留资料", statements: [] };
  const statements = [];
  // A previously activated account can never return to the expiry pool.
  statements.push(db.prepare("UPDATE accounts SET activated_at = coalesce(activated_at,(SELECT activated_at FROM accounts WHERE id = ?)), activation_reason = coalesce(activation_reason,(SELECT activation_reason FROM accounts WHERE id = ?)), pending_expires_at = CASE WHEN activated_at IS NOT NULL OR (SELECT activated_at FROM accounts WHERE id = ?) IS NOT NULL THEN NULL ELSE pending_expires_at END WHERE id = ?").bind(duplicate.id,duplicate.id,duplicate.id,actor.id));
  // Immutable audit events retain their original actor IDs; the merge event records the mapping.
  for (const [table, column] of [["pdf_files", "owner_id"], ["teaching_materials", "owner_id"], ["homework", "owner_id"], ["study_blocks", "account_id"], ["classrooms", "created_by"], ["classroom_announcements", "author_id"], ["homework_recipients", "scored_by"], ["lessons", "created_by"], ["lessons", "reviewed_by"], ["reschedule_requests", "requested_by"], ["reschedule_requests", "responded_by"]]) {
    statements.push(db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`).bind(actor.id, duplicate.id));
  }
  statements.push(db.prepare("INSERT OR IGNORE INTO assignments (id,account_id,plan_key) SELECT lower(hex(randomblob(16))),?,plan_key FROM assignments WHERE account_id = ?").bind(actor.id, duplicate.id));
  statements.push(db.prepare("DELETE FROM assignments WHERE account_id = ?").bind(duplicate.id));
  statements.push(db.prepare("DELETE FROM sessions WHERE account_id = ?").bind(duplicate.id));
  statements.push(db.prepare("DELETE FROM google_identities WHERE account_id = ?").bind(duplicate.id));
  statements.push(db.prepare("DELETE FROM accounts WHERE id = ?").bind(duplicate.id));
  statements.push(db.prepare("INSERT INTO audit (id,lesson_id,actor_id,action,after_json,at) VALUES (?,?,?,'mergeAccount',?,?)").bind(crypto.randomUUID(), `account:${actor.id}`, actor.id, JSON.stringify({ oldAccountId: duplicate.id, oldName: duplicate.name, accountId: actor.id }), new Date().toISOString()));
  return { statements };
}
