-- Parent reminders have independent source and permission epochs. Legacy
-- teacher/student notification queues are intentionally unchanged.
CREATE TABLE parent_notifications (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES tuition_groups(id),account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 student_id TEXT NOT NULL,link_id TEXT NOT NULL,link_revision INTEGER NOT NULL CHECK(link_revision>0),
 finance_access_id TEXT,finance_revision INTEGER CHECK(finance_revision>0),
 kind TEXT NOT NULL CHECK(kind IN('invoice_issued','invoice_due_soon','invoice_due','invoice_overdue','student_absent')),
 source_id TEXT NOT NULL,cycle_key TEXT NOT NULL,dedup_key TEXT NOT NULL,source_revision TEXT NOT NULL CHECK(json_valid(source_revision)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),due_at TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,read_at TEXT,cancelled_at TEXT,cancel_reason TEXT NOT NULL DEFAULT '',
 UNIQUE(group_id,id),UNIQUE(group_id,account_id,dedup_key),
 CHECK((kind='student_absent' AND finance_access_id IS NULL AND finance_revision IS NULL) OR (kind<>'student_absent' AND finance_access_id IS NOT NULL AND finance_revision IS NOT NULL)),
 CHECK((cancelled_at IS NULL AND cancel_reason='') OR (cancelled_at IS NOT NULL AND length(cancel_reason)>0)),
 FOREIGN KEY(group_id,link_id) REFERENCES parent_child_links(group_id,id) ON DELETE CASCADE,
 FOREIGN KEY(group_id,finance_access_id) REFERENCES parent_financial_access(group_id,id) ON DELETE CASCADE
);
CREATE INDEX parent_notifications_inbox_idx ON parent_notifications(group_id,account_id,created_at DESC,id);
CREATE INDEX parent_notifications_source_idx ON parent_notifications(group_id,source_id,cycle_key);
CREATE INDEX parent_notifications_queue_idx ON parent_notifications(cancelled_at,due_at,created_at);
CREATE TABLE parent_notification_deliveries (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES tuition_groups(id),item_id TEXT NOT NULL,subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
 notification_revision INTEGER NOT NULL CHECK(notification_revision>0),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','sent','expired','failed','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),next_attempt_at TEXT NOT NULL,lock_until TEXT,claim_token TEXT,sent_at TEXT,last_error TEXT NOT NULL DEFAULT '',
 UNIQUE(item_id,subscription_id),
 CHECK((lock_until IS NULL AND claim_token IS NULL) OR (lock_until IS NOT NULL AND claim_token IS NOT NULL)),
 FOREIGN KEY(group_id,item_id) REFERENCES parent_notifications(group_id,id) ON DELETE CASCADE
);
CREATE INDEX parent_notification_delivery_queue_idx ON parent_notification_deliveries(status,next_attempt_at,lock_until);
CREATE TABLE parent_notification_runtime (
 id INTEGER PRIMARY KEY CHECK(id=1),activation_at TEXT NOT NULL,last_generated_at TEXT,last_dispatch_at TEXT,lease_until TEXT,lease_token TEXT,
 CHECK((lease_until IS NULL AND lease_token IS NULL) OR (lease_until IS NOT NULL AND lease_token IS NOT NULL))
);
-- Activation excludes historical issued/absence events while allowing today's
-- applicable due/overdue milestones on earlier invoices.
INSERT INTO parent_notification_runtime(id,activation_at) VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER parent_notification_identity_insert BEFORE INSERT ON parent_notifications BEGIN
 SELECT RAISE(ABORT,'parent_notification_identity_invalid') WHERE NEW.revision<>1 OR NOT EXISTS(
  SELECT 1 FROM parent_child_links l JOIN accounts a ON a.id=l.parent_account_id AND a.group_id=l.group_id
  JOIN billing_students b ON b.group_id=l.group_id AND b.id=l.student_id JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name
  JOIN tuition_groups g ON g.id=l.group_id AND g.active=1 WHERE l.group_id=NEW.group_id AND l.id=NEW.link_id AND l.parent_account_id=NEW.account_id AND l.student_id=NEW.student_id
  AND l.active=1 AND l.revision=NEW.link_revision AND a.role='parent' AND a.disabled_at IS NULL AND s.active=1);
 SELECT RAISE(ABORT,'parent_notification_finance_epoch_invalid') WHERE NEW.kind<>'student_absent' AND NOT EXISTS(
  SELECT 1 FROM parent_financial_access f WHERE f.group_id=NEW.group_id AND f.id=NEW.finance_access_id AND f.parent_account_id=NEW.account_id AND f.student_id=NEW.student_id AND f.link_id=NEW.link_id AND f.active=1 AND f.revision=NEW.finance_revision AND f.link_revision=NEW.link_revision);
END;
CREATE TRIGGER parent_notification_identity_update BEFORE UPDATE ON parent_notifications BEGIN
 SELECT RAISE(ABORT,'parent_notification_identity_invalid') WHERE NEW.id<>OLD.id OR NEW.group_id<>OLD.group_id OR NEW.account_id<>OLD.account_id OR NEW.student_id<>OLD.student_id OR NEW.link_id<>OLD.link_id OR NEW.link_revision<>OLD.link_revision
  OR NEW.finance_access_id IS NOT OLD.finance_access_id OR NEW.finance_revision IS NOT OLD.finance_revision OR NEW.source_id<>OLD.source_id OR NEW.cycle_key<>OLD.cycle_key OR NEW.dedup_key<>OLD.dedup_key OR NEW.created_at<>OLD.created_at OR (NEW.kind='student_absent')<>(OLD.kind='student_absent');
 SELECT RAISE(ABORT,'parent_notification_revision_invalid') WHERE NEW.revision<>OLD.revision+CASE WHEN NEW.kind<>OLD.kind OR NEW.source_revision<>OLD.source_revision OR NEW.due_at<>OLD.due_at OR NEW.updated_at<>OLD.updated_at OR NEW.cancelled_at IS NOT OLD.cancelled_at OR NEW.cancel_reason<>OLD.cancel_reason THEN 1 ELSE 0 END;
END;
CREATE TRIGGER parent_notification_activation_immutable BEFORE UPDATE OF activation_at ON parent_notification_runtime BEGIN
 SELECT RAISE(ABORT,'parent_notification_activation_immutable') WHERE NEW.activation_at<>OLD.activation_at;
END;
