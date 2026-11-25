-- Durable in-app Quiz messages. Delivery/read status is per account; answers
-- and scores are deliberately excluded from notification records.
CREATE TABLE quiz_assignment_notifications (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES tuition_groups(id),
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 event_id TEXT NOT NULL,assignment_id TEXT NOT NULL REFERENCES quiz_practice_assignments(id),
 attempt_id TEXT REFERENCES quiz_practice_attempts(id),
 kind TEXT NOT NULL CHECK(kind IN ('assigned','updated','retake_granted','pending_marking')),
 title TEXT NOT NULL,subject TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT,
 UNIQUE(account_id,event_id)
);
CREATE INDEX quiz_assignment_notice_account ON quiz_assignment_notifications(group_id,account_id,created_at DESC);
CREATE INDEX quiz_assignment_notice_attempt ON quiz_assignment_notifications(attempt_id,kind);
CREATE TRIGGER quiz_assignment_notice_group_guard BEFORE INSERT ON quiz_assignment_notifications
BEGIN
 SELECT RAISE(ABORT,'quiz notification mismatch') WHERE NOT EXISTS(
  SELECT 1 FROM quiz_practice_assignments qa JOIN accounts a ON a.id=NEW.account_id
  WHERE qa.id=NEW.assignment_id AND qa.group_id=NEW.group_id
  AND (a.group_id=NEW.group_id OR (a.group_id IS NULL AND a.role='admin' AND a.id NOT LIKE 'local:%' AND lower(trim(a.email))='felixtey2016@gmail.com'))
 ) OR (NEW.attempt_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM quiz_practice_attempts pa WHERE pa.id=NEW.attempt_id AND pa.group_id=NEW.group_id AND pa.assignment_id=NEW.assignment_id
 ));
END;
