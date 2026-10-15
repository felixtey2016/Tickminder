-- Additive only. Existing lessons, homework and PDF records are not rewritten.
CREATE TABLE quizzes (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES tuition_groups(id), owner_id TEXT NOT NULL REFERENCES accounts(id),
 title TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', exam TEXT NOT NULL DEFAULT '', year INTEGER,
 difficulty TEXT NOT NULL DEFAULT 'mixed' CHECK(difficulty IN ('easy','medium','hard','mixed')),
 visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','organisation','public')),
 revision INTEGER NOT NULL DEFAULT 0, shared_revision INTEGER, question_count INTEGER NOT NULL DEFAULT 0,
 total_score REAL NOT NULL DEFAULT 0, time_limit_seconds INTEGER,
 source_key TEXT, source_version_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(group_id,owner_id,source_key)
);
CREATE INDEX quiz_owner_idx ON quizzes(group_id,owner_id,updated_at);
CREATE INDEX quiz_bank_idx ON quizzes(visibility,subject,year,updated_at);
CREATE TABLE quiz_versions (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES tuition_groups(id), quiz_id TEXT NOT NULL REFERENCES quizzes(id),
 revision INTEGER NOT NULL CHECK(revision>0), content_json TEXT NOT NULL CHECK(json_valid(content_json)),
 actor_id TEXT NOT NULL REFERENCES accounts(id), operation_id TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 created_at TEXT NOT NULL, UNIQUE(quiz_id,revision)
);
CREATE TABLE quiz_answer_keys (
 version_id TEXT PRIMARY KEY REFERENCES quiz_versions(id), group_id TEXT NOT NULL REFERENCES tuition_groups(id),
 answers_json TEXT NOT NULL CHECK(json_valid(answers_json))
);
CREATE TABLE quiz_images (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES tuition_groups(id), owner_id TEXT NOT NULL REFERENCES accounts(id),
 object_key TEXT NOT NULL UNIQUE, filename TEXT NOT NULL, mime TEXT NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp')),
 bytes INTEGER NOT NULL CHECK(bytes>0 AND bytes<=5242880), sha256 TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('uploading','ready')), created_at TEXT NOT NULL,
 UNIQUE(group_id,owner_id,sha256)
);
CREATE INDEX quiz_image_owner_idx ON quiz_images(group_id,owner_id,created_at);
-- Explicit immutable-version grants preserve a legitimate duplicate's image access
-- even if its source is later withdrawn. Only server-authorised copies create them.
CREATE TABLE quiz_version_images (
 version_id TEXT NOT NULL REFERENCES quiz_versions(id), image_id TEXT NOT NULL REFERENCES quiz_images(id),
 group_id TEXT NOT NULL REFERENCES tuition_groups(id), PRIMARY KEY(version_id,image_id)
);
CREATE TRIGGER quiz_version_group_guard BEFORE INSERT ON quiz_versions
BEGIN SELECT RAISE(ABORT,'quiz group mismatch') WHERE NOT EXISTS(SELECT 1 FROM quizzes q WHERE q.id=NEW.quiz_id AND q.group_id=NEW.group_id); END;
CREATE TRIGGER quiz_key_group_guard BEFORE INSERT ON quiz_answer_keys
BEGIN SELECT RAISE(ABORT,'quiz key group mismatch') WHERE NOT EXISTS(SELECT 1 FROM quiz_versions v WHERE v.id=NEW.version_id AND v.group_id=NEW.group_id); END;
CREATE TRIGGER quiz_image_group_guard BEFORE INSERT ON quiz_version_images
BEGIN SELECT RAISE(ABORT,'quiz image grant mismatch') WHERE NOT EXISTS(SELECT 1 FROM quiz_versions v WHERE v.id=NEW.version_id AND v.group_id=NEW.group_id); END;
