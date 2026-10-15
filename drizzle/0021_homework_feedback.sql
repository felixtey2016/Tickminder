ALTER TABLE homework_recipients ADD COLUMN resubmit_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE homework_recipients ADD COLUMN active_grant_id TEXT;
ALTER TABLE homework_submissions ADD COLUMN authorized_grant_id TEXT;
ALTER TABLE homework_submissions ADD COLUMN attempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pdf_files ADD COLUMN upload_request_id TEXT;
ALTER TABLE pdf_files ADD COLUMN sha256 TEXT;
CREATE UNIQUE INDEX pdf_upload_request ON pdf_files(owner_id,upload_request_id) WHERE upload_request_id IS NOT NULL;

CREATE TABLE homework_resubmission_grants (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, homework_id TEXT NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
 recipient_id TEXT NOT NULL REFERENCES homework_recipients(id) ON DELETE CASCADE,
 student_name TEXT NOT NULL, base_submission_id TEXT NOT NULL REFERENCES homework_submissions(id) ON DELETE CASCADE,
 granted_by TEXT NOT NULL, granted_at TEXT NOT NULL, request_hash TEXT NOT NULL,
 used_at TEXT, used_submission_id TEXT REFERENCES homework_submissions(id) ON DELETE SET NULL,
 revoked_at TEXT, revoked_by TEXT
);
CREATE INDEX homework_grant_recipient ON homework_resubmission_grants(group_id,homework_id,student_name,granted_at DESC);
CREATE TABLE homework_feedback (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL,homework_id TEXT NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
 submission_id TEXT NOT NULL REFERENCES homework_submissions(id) ON DELETE CASCADE,
 teacher_id TEXT NOT NULL,comment TEXT NOT NULL,file_id TEXT REFERENCES pdf_files(id),
 created_at TEXT NOT NULL,request_hash TEXT NOT NULL
);
CREATE INDEX homework_feedback_submission ON homework_feedback(group_id,submission_id,created_at DESC);
CREATE INDEX homework_feedback_file ON homework_feedback(file_id);
CREATE TABLE learning_notifications (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 event_id TEXT NOT NULL,content_kind TEXT NOT NULL CHECK(content_kind IN ('material','homework')),record_id TEXT NOT NULL,
 content_revision INTEGER NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,subject TEXT NOT NULL,
 created_at TEXT NOT NULL,read_at TEXT,UNIQUE(account_id,event_id)
);
CREATE INDEX learning_notification_account ON learning_notifications(group_id,account_id,created_at DESC);
CREATE TABLE learning_notification_deliveries (
 id TEXT PRIMARY KEY,notification_id TEXT NOT NULL REFERENCES learning_notifications(id) ON DELETE CASCADE,
 subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TEXT NOT NULL,lock_until TEXT,sent_at TEXT,
 UNIQUE(notification_id,subscription_id)
);
CREATE INDEX learning_delivery_due ON learning_notification_deliveries(status,next_attempt_at);

CREATE TRIGGER grant_group_guard BEFORE INSERT ON homework_resubmission_grants BEGIN
 SELECT RAISE(ABORT,'invalid resubmission grant') WHERE NOT EXISTS(
 SELECT 1 FROM homework_recipients r JOIN homework h ON h.id=r.homework_id JOIN homework_submissions s ON s.id=NEW.base_submission_id
 WHERE r.id=NEW.recipient_id AND r.group_id=NEW.group_id AND h.group_id=NEW.group_id AND r.homework_id=NEW.homework_id
 AND r.student_name=NEW.student_name AND s.group_id=NEW.group_id AND s.homework_id=h.id AND s.student_name=r.student_name AND h.owner_id=NEW.granted_by);
END;
CREATE TRIGGER feedback_group_guard BEFORE INSERT ON homework_feedback BEGIN
 SELECT RAISE(ABORT,'invalid feedback submission') WHERE NOT EXISTS(SELECT 1 FROM homework_submissions s JOIN homework h ON h.id=s.homework_id WHERE s.id=NEW.submission_id AND s.group_id=NEW.group_id AND h.group_id=NEW.group_id AND s.homework_id=NEW.homework_id AND h.owner_id=NEW.teacher_id);
 SELECT RAISE(ABORT,'invalid feedback file') WHERE NEW.file_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pdf_files f WHERE f.id=NEW.file_id AND f.group_id=NEW.group_id AND f.owner_id=NEW.teacher_id AND f.kind='feedback' AND f.context_id=NEW.submission_id AND f.status IN ('staged','attached'));
END;
CREATE TRIGGER feedback_insert_revision AFTER INSERT ON homework_feedback BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=(SELECT classroom_id FROM homework WHERE id=NEW.homework_id); END;
CREATE TRIGGER feedback_delete_revision AFTER DELETE ON homework_feedback BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=(SELECT classroom_id FROM homework WHERE id=OLD.homework_id); END;
CREATE TRIGGER material_delete_learning_notifications AFTER DELETE ON teaching_materials BEGIN DELETE FROM learning_notifications WHERE content_kind='material' AND record_id=OLD.id AND group_id=OLD.group_id; END;
CREATE TRIGGER homework_delete_learning_notifications AFTER DELETE ON homework BEGIN DELETE FROM learning_notifications WHERE content_kind='homework' AND record_id=OLD.id AND group_id=OLD.group_id; END;
-- Submission order is independent of millisecond ties or edge-clock skew.
DROP TRIGGER homework_score_change_history;
CREATE TRIGGER homework_score_change_history AFTER UPDATE OF score,scored_at ON homework_recipients
 WHEN NEW.score IS NOT OLD.score OR NEW.scored_at IS NOT OLD.scored_at BEGIN
 INSERT INTO homework_score_history(id,group_id,homework_id,student_name,submission_id,homework_revision,score,previous_score,max_score,actor_id,changed_at,reason)
 SELECT lower(hex(randomblob(16))),NEW.group_id,NEW.homework_id,NEW.student_name,
 (SELECT id FROM homework_submissions WHERE homework_id=NEW.homework_id AND student_name=NEW.student_name AND group_id=NEW.group_id ORDER BY attempt DESC,submitted_at DESC,id DESC LIMIT 1),h.revision,NEW.score,OLD.score,h.max_score,NEW.scored_by,
 coalesce(NEW.scored_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),CASE WHEN NEW.score IS NULL THEN 'resubmitted' ELSE 'graded' END
 FROM homework h WHERE h.id=NEW.homework_id AND h.group_id=NEW.group_id;
END;
