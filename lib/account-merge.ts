import {accountSessionPredicate} from "@/lib/account-session";
import type { Account } from "@/lib/auth";
import { first, learningDb } from "@/lib/learning-server";
import { authorityGuard } from "@/lib/admin-authority";

// Account IDs are globally unique. Check every organisation because shared
// versions and historical practice can outlive an account's group membership.
export async function hasQuizAccountHistory(accountId: string) {
  // D1 limits compound SELECT terms more strictly than local SQLite. Keep all
  // six history checks in one read without a six-term UNION.
  return Boolean(await first(`SELECT 1 AS found WHERE
    EXISTS(SELECT 1 FROM quizzes WHERE owner_id=?)
    OR EXISTS(SELECT 1 FROM quiz_images WHERE owner_id=?)
    OR EXISTS(SELECT 1 FROM quiz_versions WHERE actor_id=?)
    OR EXISTS(SELECT 1 FROM quiz_practice_assignments WHERE created_by=?)
    OR EXISTS(SELECT 1 FROM quiz_practice_attempts WHERE account_id=?)
    OR EXISTS(SELECT 1 FROM quiz_practice_operations WHERE actor_id=?)`,
    accountId,accountId,accountId,accountId,accountId,accountId));
}

// Only called after the signed-in user's current password AND the Google credential
// have both been verified. A second explicit confirmation is required for a merge.
export async function prepareAccountMerge(actor: Account, duplicateId: string, confirmed: boolean) {
  const db = learningDb();
  const duplicate = await first<{ id: string; name: string; role: string; teacher_name: string | null; student_name: string | null; disabled_at: string | null; group_id: string | null }>("SELECT * FROM accounts WHERE id = ?", duplicateId);
  if (!duplicate || duplicate.disabled_at) return { error: "此 Google 账号已停用，请联系管理员", statements: [] };
  if (duplicate.group_id !== actor.groupId) return {error:"两个账号属于不同补习集团，请联系管理员",statements:[]};
  let parentMergeGuard:{sql:string;args:unknown[]}|null=null;
  let same = duplicate.role === actor.role && (actor.role === "teacher" ? Boolean(actor.teacherName) && duplicate.teacher_name === actor.teacherName : actor.role === "student" && Boolean(actor.studentName) && duplicate.student_name === actor.studentName);
  if(actor.role==='parent'&&['parent','pending'].includes(duplicate.role)){
    const snapshotSql="SELECT coalesce(json_group_array(json(item)),'[]') AS snapshot FROM(SELECT json_object('studentId',student_id,'active',active,'revision',revision) item FROM parent_child_links WHERE group_id=? AND parent_account_id=? ORDER BY student_id)", snapshots=await Promise.all([first<{snapshot:string}>(snapshotSql,actor.groupId,actor.id),first<{snapshot:string}>(snapshotSql,actor.groupId,duplicate.id)]);
    const left=snapshots[0]?.snapshot||'[]',right=snapshots[1]?.snapshot||'[]',active=(v:string)=>(JSON.parse(v) as {studentId:string;active:number}[]).filter(l=>l.active===1).map(l=>l.studentId);
    if(duplicate.role==='pending'&&active(right).length||duplicate.role==='parent'&&JSON.stringify(active(left))!==JSON.stringify(active(right)))return{error:'两个家长账号的孩子授权不同，请联系管理员核对后再连接',statements:[]};
    same=duplicate.role==='parent';const session=accountSessionPredicate(actor);
    parentMergeGuard={sql:`(${snapshotSql})=? AND (${snapshotSql})=? AND (${session.sql})`,args:[actor.groupId,actor.id,left,actor.groupId,duplicate.id,right,...session.args]};
  }
  if (duplicate.role !== "pending" && !same) return { error: "两个账号的身份不同，请联系管理员核对后再连接", statements: [] };
  if (await first("SELECT 1 AS found FROM local_credentials WHERE account_id = ?", duplicate.id)) return { error: "Google 已连接另一个密码账号，请联系管理员", statements: [] };
  if (await hasQuizAccountHistory(duplicate.id)) return {error:"account.quizHistoryMergeBlocked",statements:[]};
  if(await first("SELECT 1 FROM class_recordings WHERE created_by=? LIMIT 1",duplicate.id))return{error:"此账号拥有课堂录影，请联系管理员处理后再合并",statements:[]};
  if (!confirmed) return { mergeName: duplicate.name, error: "发现已有 Google 账号，确认后会合并登录方式并保留资料", statements: [] };
  const statements = [authorityGuard({
    sql: `EXISTS(SELECT 1 FROM accounts d JOIN tuition_groups g ON g.id=d.group_id
      WHERE d.id=? AND d.group_id=? AND d.role=? AND d.teacher_name IS ? AND d.student_name IS ?
      AND d.disabled_at IS NULL AND g.chief_admin_id IS NOT d.id)
      AND EXISTS(SELECT 1 FROM accounts a JOIN local_credentials c ON c.account_id=a.id
      WHERE a.id=? AND a.group_id IS ? AND a.role=? AND a.teacher_name IS ? AND a.student_name IS ?
      AND a.disabled_at IS NULL AND c.must_change_password=0)`,
    args:[duplicate.id,actor.groupId,duplicate.role,duplicate.teacher_name,duplicate.student_name,actor.id,actor.groupId,actor.role,actor.teacherName,actor.studentName],
  })];
  if(parentMergeGuard)statements.push(authorityGuard(parentMergeGuard));
  statements.push(db.prepare("INSERT INTO site_notifications (group_id,id,account_id,event_id,lesson_id,kind,created_at,read_at) SELECT group_id,lower(hex(randomblob(16))),?,event_id,lesson_id,kind,created_at,read_at FROM site_notifications WHERE account_id=? ON CONFLICT(account_id,event_id) DO UPDATE SET read_at=coalesce(site_notifications.read_at,excluded.read_at)").bind(actor.id,duplicate.id));
  statements.push(db.prepare("DELETE FROM site_notifications WHERE account_id=?").bind(duplicate.id));
  statements.push(db.prepare("DELETE FROM notification_deliveries WHERE item_id IN (SELECT n.id FROM notification_items n JOIN notification_items kept ON kept.account_id=? AND kept.lesson_id=n.lesson_id AND kept.planned_start=n.planned_start AND kept.offset_minutes=n.offset_minutes WHERE n.account_id=?)").bind(actor.id,duplicate.id));
  statements.push(db.prepare("DELETE FROM notification_items WHERE account_id=? AND EXISTS (SELECT 1 FROM notification_items kept WHERE kept.account_id=? AND kept.lesson_id=notification_items.lesson_id AND kept.planned_start=notification_items.planned_start AND kept.offset_minutes=notification_items.offset_minutes)").bind(duplicate.id,actor.id));
  statements.push(db.prepare("UPDATE notification_items SET account_id=? WHERE account_id=?").bind(actor.id,duplicate.id));
  statements.push(db.prepare("UPDATE push_subscriptions SET account_id=? WHERE account_id=?").bind(actor.id,duplicate.id));
  // A previously activated account can never return to the expiry pool.
  statements.push(db.prepare("UPDATE accounts SET activated_at = coalesce(activated_at,(SELECT activated_at FROM accounts WHERE id = ?)), activation_reason = coalesce(activation_reason,(SELECT activation_reason FROM accounts WHERE id = ?)), pending_expires_at = CASE WHEN activated_at IS NOT NULL OR (SELECT activated_at FROM accounts WHERE id = ?) IS NOT NULL THEN NULL ELSE pending_expires_at END WHERE id = ?").bind(duplicate.id,duplicate.id,duplicate.id,actor.id));
  // Immutable audit events retain their original actor IDs; the merge event records the mapping.
  for (const [table, column] of [["pdf_files", "owner_id"], ["teaching_materials", "owner_id"], ["homework", "owner_id"], ["study_blocks", "account_id"], ["classrooms", "created_by"], ["classroom_announcements", "author_id"], ["homework_recipients", "scored_by"], ["lessons", "created_by"], ["lessons", "reviewed_by"], ["reschedule_requests", "requested_by"], ["reschedule_requests", "responded_by"]]) {
    statements.push(db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`).bind(actor.id, duplicate.id));
  }
  statements.push(db.prepare("INSERT OR IGNORE INTO assignments (group_id,id,account_id,plan_key) SELECT group_id,lower(hex(randomblob(16))),?,plan_key FROM assignments WHERE account_id = ?").bind(actor.id, duplicate.id));
  statements.push(db.prepare("DELETE FROM assignments WHERE account_id = ?").bind(duplicate.id));
  statements.push(db.prepare("DELETE FROM sessions WHERE account_id = ?").bind(duplicate.id));
  statements.push(db.prepare("DELETE FROM google_identities WHERE account_id = ?").bind(duplicate.id));
  statements.push(db.prepare("DELETE FROM accounts WHERE id = ?").bind(duplicate.id));
  statements.push(db.prepare("INSERT INTO audit (group_id,id,lesson_id,actor_id,action,after_json,at) VALUES (?,?,?,?,'mergeAccount',?,?)").bind(actor.groupId,crypto.randomUUID(), `account:${actor.id}`, actor.id, JSON.stringify({ oldAccountId: duplicate.id, oldName: duplicate.name, accountId: actor.id }), new Date().toISOString()));
  return { statements };
}
