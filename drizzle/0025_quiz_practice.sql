-- Practice is separate from formal homework. Attempts pin immutable quiz versions.
CREATE TABLE quiz_practice_assignments (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES tuition_groups(id),quiz_id TEXT NOT NULL REFERENCES quizzes(id),
 version_id TEXT NOT NULL REFERENCES quiz_versions(id),created_by TEXT NOT NULL REFERENCES accounts(id),
 title TEXT NOT NULL,subject TEXT NOT NULL,classroom_id TEXT,
 immediate INTEGER NOT NULL DEFAULT 0 CHECK(immediate IN (0,1)),created_at TEXT NOT NULL,withdrawn_at TEXT,
 operation_id TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL
);
CREATE INDEX quiz_practice_assignment_group_idx ON quiz_practice_assignments(group_id,created_by,created_at);
CREATE TABLE quiz_practice_recipients (
 assignment_id TEXT NOT NULL REFERENCES quiz_practice_assignments(id),group_id TEXT NOT NULL REFERENCES tuition_groups(id),
 student_name TEXT NOT NULL,PRIMARY KEY(assignment_id,student_name)
);
CREATE TABLE quiz_practice_attempts (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES tuition_groups(id),account_id TEXT NOT NULL REFERENCES accounts(id),
 student_name TEXT,quiz_id TEXT NOT NULL REFERENCES quizzes(id),version_id TEXT NOT NULL REFERENCES quiz_versions(id),
 assignment_id TEXT REFERENCES quiz_practice_assignments(id),immediate INTEGER NOT NULL CHECK(immediate IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','submitted')),
 order_json TEXT NOT NULL CHECK(json_valid(order_json)),answers_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(answers_json)),
 checked_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(checked_json)),results_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(results_json)),
 started_at TEXT NOT NULL,deadline_at TEXT,submitted_at TEXT,updated_at TEXT NOT NULL,
 score REAL NOT NULL DEFAULT 0,total_score REAL NOT NULL,pending_manual INTEGER NOT NULL DEFAULT 0,
 operation_id TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL
);
CREATE INDEX quiz_practice_attempt_account_idx ON quiz_practice_attempts(group_id,account_id,started_at);
CREATE INDEX quiz_practice_attempt_assignment_idx ON quiz_practice_attempts(group_id,assignment_id,student_name);
CREATE TABLE quiz_practice_operations (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES tuition_groups(id),actor_id TEXT NOT NULL REFERENCES accounts(id),
 record_id TEXT NOT NULL,kind TEXT NOT NULL,request_hash TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE TRIGGER quiz_practice_assignment_version_guard BEFORE INSERT ON quiz_practice_assignments
BEGIN SELECT RAISE(ABORT,'quiz practice assignment mismatch') WHERE NOT EXISTS(SELECT 1 FROM quiz_versions v WHERE v.id=NEW.version_id AND v.quiz_id=NEW.quiz_id) OR (NEW.classroom_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM classrooms c WHERE c.id=NEW.classroom_id AND c.group_id=NEW.group_id)); END;
CREATE TRIGGER quiz_practice_recipient_group_guard BEFORE INSERT ON quiz_practice_recipients
BEGIN SELECT RAISE(ABORT,'quiz practice recipient mismatch') WHERE NOT EXISTS(SELECT 1 FROM quiz_practice_assignments p WHERE p.id=NEW.assignment_id AND p.group_id=NEW.group_id); END;
CREATE TRIGGER quiz_practice_attempt_version_guard BEFORE INSERT ON quiz_practice_attempts
BEGIN SELECT RAISE(ABORT,'quiz practice attempt mismatch') WHERE NOT EXISTS(SELECT 1 FROM quiz_versions v WHERE v.id=NEW.version_id AND v.quiz_id=NEW.quiz_id) OR (NEW.assignment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM quiz_practice_assignments p WHERE p.id=NEW.assignment_id AND p.group_id=NEW.group_id AND p.version_id=NEW.version_id AND p.quiz_id=NEW.quiz_id AND EXISTS(SELECT 1 FROM quiz_practice_recipients r WHERE r.assignment_id=p.id AND r.group_id=p.group_id AND r.student_name=NEW.student_name))); END;
CREATE TRIGGER quiz_practice_attempt_identity_immutable BEFORE UPDATE ON quiz_practice_attempts
BEGIN SELECT RAISE(ABORT,'quiz practice immutable identity') WHERE NEW.group_id<>OLD.group_id OR NEW.account_id<>OLD.account_id OR NEW.quiz_id<>OLD.quiz_id OR NEW.version_id<>OLD.version_id OR NEW.assignment_id IS NOT OLD.assignment_id OR NEW.student_name IS NOT OLD.student_name OR NEW.immediate<>OLD.immediate OR NEW.order_json<>OLD.order_json OR NEW.started_at<>OLD.started_at OR NEW.deadline_at IS NOT OLD.deadline_at; END;
