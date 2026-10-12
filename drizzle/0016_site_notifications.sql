CREATE TABLE site_notifications (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE UNIQUE INDEX site_notification_event_unique ON site_notifications(account_id, event_id);
CREATE INDEX site_notification_account_idx ON site_notifications(account_id, created_at);
