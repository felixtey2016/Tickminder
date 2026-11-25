-- Add formal publishing policy while preserving all earlier practice records.
ALTER TABLE quiz_practice_assignments ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(settings_json));
ALTER TABLE quiz_practice_assignments ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE quiz_practice_assignments ADD COLUMN scores_released_at TEXT;
ALTER TABLE quiz_practice_assignments ADD COLUMN answers_released_at TEXT;
ALTER TABLE quiz_practice_recipients ADD COLUMN due_at TEXT;
ALTER TABLE quiz_practice_recipients ADD COLUMN extra_attempts INTEGER NOT NULL DEFAULT 0 CHECK(extra_attempts>=0 AND extra_attempts<=20);
ALTER TABLE quiz_practice_attempts ADD COLUMN flagged_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(flagged_json));
ALTER TABLE quiz_practice_attempts ADD COLUMN submission_reason TEXT CHECK(submission_reason IS NULL OR submission_reason IN ('student','timer','deadline'));
ALTER TABLE quiz_practice_attempts ADD COLUMN submission_due_at TEXT;
ALTER TABLE quiz_practice_attempts ADD COLUMN late INTEGER NOT NULL DEFAULT 0 CHECK(late IN (0,1));
ALTER TABLE quiz_practice_attempts ADD COLUMN attempt_number INTEGER NOT NULL DEFAULT 0 CHECK(attempt_number>=0);
UPDATE quiz_practice_attempts SET attempt_number=(SELECT count(*) FROM quiz_practice_attempts prior WHERE prior.group_id=quiz_practice_attempts.group_id AND prior.quiz_id=quiz_practice_attempts.quiz_id AND prior.assignment_id IS quiz_practice_attempts.assignment_id AND ((prior.assignment_id IS NULL AND prior.account_id=quiz_practice_attempts.account_id) OR (prior.assignment_id IS NOT NULL AND prior.student_name=quiz_practice_attempts.student_name)) AND prior.rowid<=quiz_practice_attempts.rowid);
-- Keep an attempt started by the preceding Worker during a rolling deployment
-- numbered as well. The new Worker supplies this value in its atomic insert.
CREATE TRIGGER quiz_practice_attempt_legacy_number AFTER INSERT ON quiz_practice_attempts
WHEN NEW.attempt_number=0
BEGIN
 UPDATE quiz_practice_attempts SET attempt_number=(SELECT count(*) FROM quiz_practice_attempts prior WHERE prior.group_id=NEW.group_id AND prior.quiz_id=NEW.quiz_id AND prior.assignment_id IS NEW.assignment_id AND ((NEW.assignment_id IS NULL AND prior.account_id=NEW.account_id) OR (NEW.assignment_id IS NOT NULL AND prior.student_name=NEW.student_name)) AND prior.rowid<=NEW.rowid) WHERE id=NEW.id;
END;

CREATE TABLE quiz_practice_events (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES tuition_groups(id),
 assignment_id TEXT REFERENCES quiz_practice_assignments(id),attempt_id TEXT REFERENCES quiz_practice_attempts(id),
 actor_id TEXT REFERENCES accounts(id),action TEXT NOT NULL,
 before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
 after_json TEXT CHECK(after_json IS NULL OR json_valid(after_json)),created_at TEXT NOT NULL
);
CREATE INDEX quiz_practice_event_assignment_idx ON quiz_practice_events(group_id,assignment_id,created_at);
CREATE INDEX quiz_practice_event_attempt_idx ON quiz_practice_events(group_id,attempt_id,created_at);
CREATE TRIGGER quiz_practice_event_group_guard BEFORE INSERT ON quiz_practice_events
BEGIN
 SELECT RAISE(ABORT,'quiz event relationship mismatch') WHERE
  (NEW.assignment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM quiz_practice_assignments p WHERE p.id=NEW.assignment_id AND p.group_id=NEW.group_id))
  OR (NEW.attempt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM quiz_practice_attempts a WHERE a.id=NEW.attempt_id AND a.group_id=NEW.group_id AND a.assignment_id IS NEW.assignment_id));
END;
CREATE TRIGGER quiz_practice_assignment_identity_immutable BEFORE UPDATE ON quiz_practice_assignments
BEGIN
 SELECT RAISE(ABORT,'quiz assignment immutable identity') WHERE NEW.group_id<>OLD.group_id OR NEW.quiz_id<>OLD.quiz_id
  OR NEW.version_id<>OLD.version_id OR NEW.created_by<>OLD.created_by OR NEW.classroom_id IS NOT OLD.classroom_id
  OR NEW.subject<>OLD.subject OR NEW.settings_json<>OLD.settings_json;
END;
