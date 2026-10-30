import {learningDb} from './learning-server';

// Retention is maintenance, not minute-by-minute delivery work. Keep the same
// ninety-day/orphan rules; delivery still checks live source and access itself.
export const NOTIFICATION_MAINTENANCE_CRON='0 19 * * *'; // 03:00 GMT+8
export async function maintainNotificationHistory(nowMs=Date.now()){
 const db=learningDb(),cutoff=new Date(nowMs-90*86400000).toISOString();
 await db.batch([
  db.prepare('DELETE FROM notification_deliveries WHERE item_id IN (SELECT id FROM notification_items WHERE created_at<? OR NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id=notification_items.lesson_id)) OR NOT EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.id=notification_deliveries.subscription_id)').bind(cutoff),
  db.prepare('DELETE FROM notification_items WHERE created_at<? OR NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id=notification_items.lesson_id)').bind(cutoff),
  db.prepare('DELETE FROM site_notifications WHERE created_at<? OR NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id=site_notifications.lesson_id)').bind(cutoff),
  db.prepare('DELETE FROM quiz_assignment_notifications WHERE created_at<? OR NOT EXISTS(SELECT 1 FROM accounts a WHERE a.id=quiz_assignment_notifications.account_id)').bind(cutoff),
  db.prepare('DELETE FROM learning_notifications WHERE created_at<? OR NOT EXISTS(SELECT 1 FROM accounts WHERE id=learning_notifications.account_id)').bind(cutoff),
  db.prepare('DELETE FROM learning_notification_deliveries WHERE NOT EXISTS(SELECT 1 FROM push_subscriptions WHERE id=learning_notification_deliveries.subscription_id)'),
  db.prepare('DELETE FROM parent_notifications WHERE created_at<?').bind(cutoff),
 ]);
}
