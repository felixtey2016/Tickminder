-- Parent access is a separately verified, revocable relationship. No existing account changes role.
CREATE TABLE parent_operations (
 group_id TEXT NOT NULL REFERENCES tuition_groups(id),operation_id TEXT NOT NULL,actor_id TEXT NOT NULL,
 request_hash TEXT NOT NULL,execution_id TEXT NOT NULL,result_json TEXT NOT NULL CHECK(json_valid(result_json)),created_at TEXT NOT NULL,
 PRIMARY KEY(group_id,operation_id)
);
CREATE TABLE parent_child_links (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES tuition_groups(id),parent_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 student_id TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN (0,1)),revision INTEGER NOT NULL CHECK(revision>0),
 updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,operation_id TEXT NOT NULL,reason TEXT NOT NULL CHECK(length(reason) BETWEEN 2 AND 500),
 UNIQUE(group_id,parent_account_id,student_id),UNIQUE(group_id,id),
 FOREIGN KEY(group_id,student_id) REFERENCES billing_students(group_id,id) ON DELETE CASCADE,
 FOREIGN KEY(group_id,operation_id) REFERENCES parent_operations(group_id,operation_id)
);
CREATE INDEX parent_child_active_idx ON parent_child_links(group_id,parent_account_id,active,student_id);
CREATE INDEX parent_child_reverse_idx ON parent_child_links(group_id,student_id,active,parent_account_id);
-- History survives deletion of a login or student. These snapshots grant no access.
CREATE TABLE parent_link_events (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES tuition_groups(id),link_id TEXT NOT NULL,parent_account_id TEXT NOT NULL,
 student_id TEXT NOT NULL,student_name TEXT NOT NULL,parent_name TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),
 action TEXT NOT NULL CHECK(action IN ('grant','revoke')),actor_id TEXT NOT NULL,reason TEXT NOT NULL CHECK(length(reason) BETWEEN 2 AND 500),
 operation_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(group_id,link_id,revision),UNIQUE(group_id,operation_id),
 FOREIGN KEY(group_id,operation_id) REFERENCES parent_operations(group_id,operation_id)
);
CREATE TRIGGER parent_link_identity_insert BEFORE INSERT ON parent_child_links BEGIN
 SELECT RAISE(ABORT,'parent_link_identity_invalid') WHERE NEW.revision<>1 OR NEW.active<>1 OR NOT EXISTS(SELECT 1 FROM accounts a WHERE a.id=NEW.parent_account_id AND a.group_id=NEW.group_id AND a.role='parent' AND a.disabled_at IS NULL) OR NOT EXISTS(SELECT 1 FROM billing_students b JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name WHERE b.group_id=NEW.group_id AND b.id=NEW.student_id AND s.active=1);
END;
CREATE TRIGGER parent_link_identity_update BEFORE UPDATE ON parent_child_links BEGIN
 SELECT RAISE(ABORT,'parent_link_revision_invalid') WHERE NEW.id<>OLD.id OR NEW.group_id<>OLD.group_id OR NEW.parent_account_id<>OLD.parent_account_id OR NEW.student_id<>OLD.student_id OR NEW.revision<>OLD.revision+1 OR NEW.active=OLD.active;
 SELECT RAISE(ABORT,'parent_link_identity_invalid') WHERE NOT EXISTS(SELECT 1 FROM accounts a WHERE a.id=NEW.parent_account_id AND a.group_id=NEW.group_id AND a.role='parent') OR (NEW.active=1 AND (NOT EXISTS(SELECT 1 FROM accounts a WHERE a.id=NEW.parent_account_id AND a.disabled_at IS NULL) OR NOT EXISTS(SELECT 1 FROM billing_students b JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name WHERE b.group_id=NEW.group_id AND b.id=NEW.student_id AND s.active=1)));
END;
CREATE TRIGGER parent_link_insert_history AFTER INSERT ON parent_child_links BEGIN
 INSERT INTO parent_link_events(id,group_id,link_id,parent_account_id,student_id,student_name,parent_name,revision,action,actor_id,reason,operation_id,created_at)
 SELECT lower(hex(randomblob(16))),NEW.group_id,NEW.id,NEW.parent_account_id,NEW.student_id,b.student_name,a.name,NEW.revision,'grant',NEW.updated_by,NEW.reason,NEW.operation_id,NEW.updated_at FROM accounts a JOIN billing_students b ON b.group_id=NEW.group_id AND b.id=NEW.student_id WHERE a.id=NEW.parent_account_id;
END;
CREATE TRIGGER parent_link_update_history AFTER UPDATE ON parent_child_links BEGIN
 INSERT INTO parent_link_events(id,group_id,link_id,parent_account_id,student_id,student_name,parent_name,revision,action,actor_id,reason,operation_id,created_at)
 SELECT lower(hex(randomblob(16))),NEW.group_id,NEW.id,NEW.parent_account_id,NEW.student_id,b.student_name,a.name,NEW.revision,CASE WHEN NEW.active=1 THEN 'grant' ELSE 'revoke' END,NEW.updated_by,NEW.reason,NEW.operation_id,NEW.updated_at FROM accounts a JOIN billing_students b ON b.group_id=NEW.group_id AND b.id=NEW.student_id WHERE a.id=NEW.parent_account_id;
END;
CREATE TRIGGER parent_events_immutable_update BEFORE UPDATE ON parent_link_events BEGIN SELECT RAISE(ABORT,'parent_history_immutable'); END;
CREATE TRIGGER parent_events_immutable_delete BEFORE DELETE ON parent_link_events BEGIN SELECT RAISE(ABORT,'parent_history_immutable'); END;
CREATE TRIGGER parent_operations_immutable_update BEFORE UPDATE ON parent_operations BEGIN SELECT RAISE(ABORT,'parent_history_immutable'); END;
CREATE TRIGGER parent_operations_immutable_delete BEFORE DELETE ON parent_operations BEGIN SELECT RAISE(ABORT,'parent_history_immutable'); END;
