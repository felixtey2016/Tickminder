-- Explicit choices coexist with legacy sharing without rewriting existing versions.
CREATE TABLE quiz_share_settings (
 quiz_id TEXT PRIMARY KEY REFERENCES quizzes(id),group_id TEXT NOT NULL REFERENCES tuition_groups(id),
 mode TEXT NOT NULL CHECK(mode IN('private','public','selected')),
 version_id TEXT REFERENCES quiz_versions(id),revision INTEGER NOT NULL CHECK(revision>0),
 author_name TEXT NOT NULL CHECK(length(trim(author_name)) BETWEEN 1 AND 120),
 updated_by TEXT NOT NULL REFERENCES accounts(id),updated_at TEXT NOT NULL,
 CHECK((mode='private' AND version_id IS NULL) OR (mode<>'private' AND version_id IS NOT NULL))
);
CREATE INDEX quiz_share_settings_group ON quiz_share_settings(group_id,mode,quiz_id);
CREATE TABLE quiz_share_recipients (
 group_id TEXT NOT NULL REFERENCES tuition_groups(id),quiz_id TEXT NOT NULL REFERENCES quiz_share_settings(quiz_id),
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,created_at TEXT NOT NULL,
 PRIMARY KEY(quiz_id,account_id)
);
CREATE INDEX quiz_share_recipient_account ON quiz_share_recipients(group_id,account_id,quiz_id);
CREATE TRIGGER quiz_share_settings_insert BEFORE INSERT ON quiz_share_settings BEGIN
 SELECT RAISE(ABORT,'quiz sharing relationship mismatch') WHERE NOT EXISTS(SELECT 1 FROM quizzes q WHERE q.id=NEW.quiz_id AND q.group_id=NEW.group_id AND q.owner_id=NEW.updated_by)
 OR (NEW.version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM quiz_versions v WHERE v.id=NEW.version_id AND v.quiz_id=NEW.quiz_id AND v.group_id=NEW.group_id));
END;
CREATE TRIGGER quiz_share_settings_update BEFORE UPDATE ON quiz_share_settings BEGIN
 SELECT RAISE(ABORT,'quiz sharing relationship mismatch') WHERE OLD.quiz_id IS NOT NEW.quiz_id OR OLD.group_id IS NOT NEW.group_id OR NEW.revision<>OLD.revision+1
 OR NOT EXISTS(SELECT 1 FROM quizzes q WHERE q.id=NEW.quiz_id AND q.group_id=NEW.group_id AND q.owner_id=NEW.updated_by)
 OR (NEW.version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM quiz_versions v WHERE v.id=NEW.version_id AND v.quiz_id=NEW.quiz_id AND v.group_id=NEW.group_id));
END;
CREATE TRIGGER quiz_share_recipient_insert BEFORE INSERT ON quiz_share_recipients BEGIN
 SELECT RAISE(ABORT,'quiz sharing recipient mismatch') WHERE NOT EXISTS(SELECT 1 FROM quiz_share_settings s JOIN accounts a ON a.id=NEW.account_id AND a.group_id=s.group_id WHERE s.quiz_id=NEW.quiz_id AND s.group_id=NEW.group_id AND s.mode='selected');
END;
CREATE TRIGGER quiz_share_recipient_update BEFORE UPDATE ON quiz_share_recipients BEGIN
 SELECT RAISE(ABORT,'quiz sharing recipient identity') WHERE NEW.group_id IS NOT OLD.group_id OR NEW.quiz_id IS NOT OLD.quiz_id OR NEW.account_id IS NOT OLD.account_id OR NEW.created_at IS NOT OLD.created_at;
END;
