// This predicate is checked inside the same D1 batch as every deletion. It does
// not trust the candidate snapshot, a browser status, or a caller-supplied ID.
export const expiryPredicate = `a.pending_expires_at IS NOT NULL AND a.pending_expires_at <= ?
 AND a.activated_at IS NULL AND a.role = 'pending'
 AND a.teacher_name IS NULL AND a.student_name IS NULL
 AND NOT EXISTS (SELECT 1 FROM assignments WHERE account_id = a.id)
 AND NOT EXISTS (SELECT 1 FROM pdf_files WHERE owner_id = a.id)
 AND NOT EXISTS (SELECT 1 FROM teaching_materials WHERE owner_id = a.id)
 AND NOT EXISTS (SELECT 1 FROM homework WHERE owner_id = a.id)
 AND NOT EXISTS (SELECT 1 FROM classrooms WHERE created_by = a.id)
 AND NOT EXISTS (SELECT 1 FROM classroom_announcements WHERE author_id = a.id)
 AND NOT EXISTS (SELECT 1 FROM lessons WHERE created_by = a.id OR reviewed_by = a.id)
 AND NOT EXISTS (SELECT 1 FROM reschedule_requests WHERE requested_by = a.id OR responded_by = a.id)`;

export async function cleanupPendingAccounts(db: D1Database, now = new Date().toISOString()) {
  const candidateIds = (await db.prepare(`SELECT a.id FROM accounts a WHERE ${expiryPredicate} ORDER BY a.pending_expires_at LIMIT 50`).bind(now).all<{id:string}>()).results.map(a=>a.id);
  let deleted = 0;
  for (const id of candidateIds) {
    const eligible = `EXISTS (SELECT 1 FROM accounts a WHERE a.id = ? AND ${expiryPredicate})`;
    const statement = (sql:string) => db.prepare(sql).bind(id,now);
    const batch = [
      statement(`INSERT INTO audit (id,lesson_id,actor_id,action,at) SELECT lower(hex(randomblob(16))),'account:' || a.id,'system','expirePendingAccount',?2 FROM accounts a WHERE a.id = ?1 AND ${expiryPredicate.replace('<= ?', '<= ?2')}`),
      statement(`DELETE FROM login_attempts WHERE username IN (SELECT username FROM local_credentials WHERE account_id = ?1) AND ${eligible.replace('a.id = ?', 'a.id = ?1').replace('<= ?', '<= ?2')}`),
      statement(`DELETE FROM notification_deliveries WHERE (item_id IN (SELECT id FROM notification_items WHERE account_id=?1) OR subscription_id IN (SELECT id FROM push_subscriptions WHERE account_id=?1)) AND ${eligible.replace('a.id = ?', 'a.id = ?1').replace('<= ?', '<= ?2')}`),
      ...["notification_items","push_subscriptions","sessions","study_blocks","local_credentials","google_identities","assignments"].map(table=>statement(`DELETE FROM ${table} WHERE account_id = ?1 AND ${eligible.replace('a.id = ?', 'a.id = ?1').replace('<= ?', '<= ?2')}`)),
      statement(`DELETE FROM accounts AS a WHERE a.id = ?1 AND ${expiryPredicate.replace('<= ?', '<= ?2')}`),
    ];
    const results = await db.batch(batch);
    deleted += results.at(-1)?.meta.changes || 0;
  }
  return {deleted,checked:candidateIds.length,at:now};
}
