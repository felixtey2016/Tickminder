-- Version-specific public review. Existing shares are not implicitly approved.
ALTER TABLE quizzes ADD COLUMN public_blocked_at TEXT;
-- Deleted content stays immutable, while a platform takedown can still stop
-- new attempts using a previously assigned, retained version.
DROP TRIGGER quiz_deleted_write_guard;
CREATE TRIGGER quiz_deleted_write_guard BEFORE UPDATE ON quizzes WHEN OLD.deleted_at IS NOT NULL AND (
 OLD.id IS NOT NEW.id OR OLD.group_id IS NOT NEW.group_id OR OLD.owner_id IS NOT NEW.owner_id OR OLD.title IS NOT NEW.title OR OLD.subject IS NOT NEW.subject OR OLD.exam IS NOT NEW.exam OR OLD.year IS NOT NEW.year OR OLD.difficulty IS NOT NEW.difficulty OR OLD.visibility IS NOT NEW.visibility OR OLD.revision IS NOT NEW.revision OR OLD.shared_revision IS NOT NEW.shared_revision OR OLD.question_count IS NOT NEW.question_count OR OLD.total_score IS NOT NEW.total_score OR OLD.time_limit_seconds IS NOT NEW.time_limit_seconds OR OLD.source_key IS NOT NEW.source_key OR OLD.source_version_id IS NOT NEW.source_version_id OR OLD.created_at IS NOT NEW.created_at OR OLD.deleted_at IS NOT NEW.deleted_at OR OLD.deleted_by IS NOT NEW.deleted_by
) BEGIN SELECT RAISE(ABORT,'quiz deleted'); END;
CREATE TABLE quiz_publications (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES tuition_groups(id),quiz_id TEXT NOT NULL REFERENCES quizzes(id),version_id TEXT NOT NULL REFERENCES quiz_versions(id),
 applicant_id TEXT NOT NULL,author_display_name TEXT NOT NULL DEFAULT '',source_type TEXT NOT NULL CHECK(source_type IN('original','licensed','unknown')),source_url TEXT NOT NULL DEFAULT '',authorization TEXT NOT NULL DEFAULT '',rights_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(rights_confirmed IN(0,1)),
 status TEXT NOT NULL CHECK(status IN('legacy_pending','pending','approved','returned','rejected','withdrawn','taken_down')),revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),reviewer_id TEXT,review_reason TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,reviewed_at TEXT
);
CREATE INDEX quiz_publication_queue_idx ON quiz_publications(status,updated_at,id);
CREATE INDEX quiz_publication_version_idx ON quiz_publications(quiz_id,version_id,status);
CREATE INDEX quiz_publication_author_idx ON quiz_publications(group_id,applicant_id,quiz_id,created_at);
CREATE TABLE quiz_publication_reports (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES tuition_groups(id),quiz_id TEXT NOT NULL REFERENCES quizzes(id),version_id TEXT NOT NULL REFERENCES quiz_versions(id),reporter_id TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN('content','rights')),reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','in_review','resolved','dismissed')),revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),resolution TEXT NOT NULL DEFAULT '',reviewer_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE INDEX quiz_publication_report_queue_idx ON quiz_publication_reports(status,created_at,id);
CREATE INDEX quiz_publication_reporter_idx ON quiz_publication_reports(reporter_id,created_at,id);
CREATE TABLE quiz_publication_appeals (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES tuition_groups(id),publication_id TEXT NOT NULL REFERENCES quiz_publications(id),quiz_id TEXT NOT NULL REFERENCES quizzes(id),applicant_id TEXT NOT NULL,reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved','rejected')),revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),resolution TEXT NOT NULL DEFAULT '',reviewer_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE INDEX quiz_publication_appeal_queue_idx ON quiz_publication_appeals(status,created_at,id);
CREATE TABLE quiz_moderation_events (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES tuition_groups(id),quiz_id TEXT NOT NULL REFERENCES quizzes(id),entity_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE INDEX quiz_moderation_event_idx ON quiz_moderation_events(quiz_id,created_at,id);
CREATE TABLE quiz_moderation_operations (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES tuition_groups(id),actor_id TEXT NOT NULL,record_id TEXT NOT NULL,kind TEXT NOT NULL,request_hash TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE TRIGGER quiz_publication_version_guard BEFORE INSERT ON quiz_publications
 BEGIN SELECT RAISE(ABORT,'quiz publication version mismatch') WHERE NOT EXISTS(SELECT 1 FROM quizzes q JOIN quiz_versions v ON v.quiz_id=q.id AND v.group_id=q.group_id WHERE q.id=NEW.quiz_id AND q.group_id=NEW.group_id AND v.id=NEW.version_id); END;
CREATE TRIGGER quiz_publication_report_guard BEFORE INSERT ON quiz_publication_reports
 BEGIN SELECT RAISE(ABORT,'quiz publication report mismatch') WHERE NOT EXISTS(SELECT 1 FROM quiz_versions v WHERE v.id=NEW.version_id AND v.quiz_id=NEW.quiz_id); END;
CREATE TRIGGER quiz_publication_appeal_guard BEFORE INSERT ON quiz_publication_appeals
 BEGIN SELECT RAISE(ABORT,'quiz publication appeal mismatch') WHERE NOT EXISTS(SELECT 1 FROM quiz_publications p WHERE p.id=NEW.publication_id AND p.quiz_id=NEW.quiz_id AND p.group_id=NEW.group_id); END;
INSERT INTO quiz_publications(id,group_id,quiz_id,version_id,applicant_id,source_type,status,review_reason,created_at,updated_at)
 SELECT 'legacy-'||v.id,q.group_id,q.id,v.id,q.owner_id,'unknown','legacy_pending','Legacy public version requires source declaration and review',q.created_at,q.updated_at
 FROM quizzes q JOIN quiz_versions v ON v.quiz_id=q.id AND v.group_id=q.group_id AND v.revision=q.shared_revision
 WHERE q.visibility='public' AND q.shared_revision IS NOT NULL AND q.deleted_at IS NULL;
