-- Financial viewing is an explicit grant for one verified parent/child binding epoch.
-- Existing parents remain teaching-only. Expired epochs never revive on re-link.
CREATE TABLE parent_financial_operations (
 group_id TEXT NOT NULL REFERENCES tuition_groups(id),operation_id TEXT NOT NULL,actor_id TEXT NOT NULL,
 request_hash TEXT NOT NULL,execution_id TEXT NOT NULL,result_json TEXT NOT NULL CHECK(json_valid(result_json)),created_at TEXT NOT NULL,
 PRIMARY KEY(group_id,operation_id)
);
CREATE TABLE parent_financial_access (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES tuition_groups(id),link_id TEXT NOT NULL,
 parent_account_id TEXT NOT NULL,student_id TEXT NOT NULL,
 active INTEGER NOT NULL CHECK(active IN (0,1)),revision INTEGER NOT NULL CHECK(revision>0),link_revision INTEGER NOT NULL CHECK(link_revision>0),
 updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,operation_id TEXT NOT NULL,reason TEXT NOT NULL CHECK(length(reason) BETWEEN 2 AND 500),
 UNIQUE(group_id,id),UNIQUE(group_id,link_id),
 FOREIGN KEY(group_id,link_id) REFERENCES parent_child_links(group_id,id) ON DELETE CASCADE,
 FOREIGN KEY(group_id,operation_id) REFERENCES parent_financial_operations(group_id,operation_id)
);
CREATE INDEX parent_financial_active_idx ON parent_financial_access(group_id,parent_account_id,student_id,active,link_revision);
-- Snapshots retain the original verified identities after account/student deletion.
CREATE TABLE parent_financial_events (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES tuition_groups(id),access_id TEXT NOT NULL,link_id TEXT NOT NULL,
 parent_account_id TEXT NOT NULL,student_id TEXT NOT NULL,student_name TEXT NOT NULL,parent_name TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0),link_revision INTEGER NOT NULL CHECK(link_revision>0),action TEXT NOT NULL CHECK(action IN ('grant','revoke')),
 actor_id TEXT NOT NULL,reason TEXT NOT NULL CHECK(length(reason) BETWEEN 2 AND 500),operation_id TEXT NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(group_id,access_id,revision),UNIQUE(group_id,operation_id),
 FOREIGN KEY(group_id,operation_id) REFERENCES parent_financial_operations(group_id,operation_id)
);
CREATE TRIGGER parent_financial_identity_insert BEFORE INSERT ON parent_financial_access BEGIN
 SELECT RAISE(ABORT,'parent_financial_revision_invalid') WHERE NEW.revision<>1 OR NEW.active<>1;
 SELECT RAISE(ABORT,'parent_financial_identity_invalid') WHERE NOT EXISTS(
  SELECT 1 FROM parent_child_links l JOIN accounts a ON a.id=l.parent_account_id AND a.group_id=l.group_id
  JOIN billing_students b ON b.group_id=l.group_id AND b.id=l.student_id JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name
  WHERE l.group_id=NEW.group_id AND l.id=NEW.link_id AND l.parent_account_id=NEW.parent_account_id AND l.student_id=NEW.student_id
  AND l.active=1 AND l.revision=NEW.link_revision AND a.role='parent' AND a.disabled_at IS NULL AND s.active=1);
END;
CREATE TRIGGER parent_financial_identity_update BEFORE UPDATE ON parent_financial_access BEGIN
 SELECT RAISE(ABORT,'parent_financial_revision_invalid') WHERE NEW.id<>OLD.id OR NEW.group_id<>OLD.group_id OR NEW.link_id<>OLD.link_id
  OR NEW.parent_account_id<>OLD.parent_account_id OR NEW.student_id<>OLD.student_id OR NEW.revision<>OLD.revision+1 OR NEW.link_revision<OLD.link_revision
  OR (NEW.active=OLD.active AND (NEW.active<>1 OR NEW.link_revision<=OLD.link_revision)) OR (NEW.active=0 AND NEW.link_revision<>OLD.link_revision);
 SELECT RAISE(ABORT,'parent_financial_identity_invalid') WHERE NOT EXISTS(SELECT 1 FROM parent_child_links l WHERE l.group_id=NEW.group_id AND l.id=NEW.link_id AND l.parent_account_id=NEW.parent_account_id AND l.student_id=NEW.student_id)
  OR (NEW.active=1 AND NOT EXISTS(
   SELECT 1 FROM parent_child_links l JOIN accounts a ON a.id=l.parent_account_id AND a.group_id=l.group_id
   JOIN billing_students b ON b.group_id=l.group_id AND b.id=l.student_id JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name
   WHERE l.group_id=NEW.group_id AND l.id=NEW.link_id AND l.active=1 AND l.revision=NEW.link_revision AND a.role='parent' AND a.disabled_at IS NULL AND s.active=1));
END;
CREATE TRIGGER parent_financial_insert_history AFTER INSERT ON parent_financial_access BEGIN
 INSERT INTO parent_financial_events(id,group_id,access_id,link_id,parent_account_id,student_id,student_name,parent_name,revision,link_revision,action,actor_id,reason,operation_id,created_at)
 SELECT lower(hex(randomblob(16))),NEW.group_id,NEW.id,NEW.link_id,NEW.parent_account_id,NEW.student_id,b.student_name,a.name,NEW.revision,NEW.link_revision,'grant',NEW.updated_by,NEW.reason,NEW.operation_id,NEW.updated_at FROM accounts a JOIN billing_students b ON b.group_id=NEW.group_id AND b.id=NEW.student_id WHERE a.id=NEW.parent_account_id;
END;
CREATE TRIGGER parent_financial_update_history AFTER UPDATE ON parent_financial_access BEGIN
 INSERT INTO parent_financial_events(id,group_id,access_id,link_id,parent_account_id,student_id,student_name,parent_name,revision,link_revision,action,actor_id,reason,operation_id,created_at)
 SELECT lower(hex(randomblob(16))),NEW.group_id,NEW.id,NEW.link_id,NEW.parent_account_id,NEW.student_id,b.student_name,a.name,NEW.revision,NEW.link_revision,CASE WHEN NEW.active=1 THEN 'grant' ELSE 'revoke' END,NEW.updated_by,NEW.reason,NEW.operation_id,NEW.updated_at FROM accounts a JOIN billing_students b ON b.group_id=NEW.group_id AND b.id=NEW.student_id WHERE a.id=NEW.parent_account_id;
END;
CREATE TRIGGER parent_financial_events_immutable_update BEFORE UPDATE ON parent_financial_events BEGIN SELECT RAISE(ABORT,'parent_financial_history_immutable'); END;
CREATE TRIGGER parent_financial_events_immutable_delete BEFORE DELETE ON parent_financial_events BEGIN SELECT RAISE(ABORT,'parent_financial_history_immutable'); END;
CREATE TRIGGER parent_financial_operations_immutable_update BEFORE UPDATE ON parent_financial_operations BEGIN SELECT RAISE(ABORT,'parent_financial_history_immutable'); END;
CREATE TRIGGER parent_financial_operations_immutable_delete BEFORE DELETE ON parent_financial_operations BEGIN SELECT RAISE(ABORT,'parent_financial_history_immutable'); END;
