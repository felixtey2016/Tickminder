-- Google Drive links only. Whole-class visibility follows the current membership;
-- explicitly selected recipients remain a fixed assignment list.
CREATE TABLE class_recordings (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES tuition_groups(id),
 classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
 session_id TEXT REFERENCES class_sessions(id) ON DELETE SET NULL,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 description TEXT NOT NULL DEFAULT '' CHECK(length(description)<=4000),
 drive_url TEXT NOT NULL, lesson_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 audience_mode TEXT NOT NULL DEFAULT 'classroom' CHECK(audience_mode IN ('classroom','selected')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by TEXT NOT NULL REFERENCES accounts(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(group_id,id)
);
CREATE INDEX class_recordings_list_idx ON class_recordings(group_id,lesson_date DESC,created_at DESC,id DESC);
CREATE INDEX class_recordings_class_idx ON class_recordings(group_id,classroom_id,status,lesson_date DESC);
CREATE TABLE recording_recipients (
 group_id TEXT NOT NULL,recording_id TEXT NOT NULL,student_name TEXT NOT NULL,
 PRIMARY KEY(group_id,recording_id,student_name),
 FOREIGN KEY(group_id,recording_id) REFERENCES class_recordings(group_id,id) ON DELETE CASCADE
);
CREATE INDEX recording_recipients_student_idx ON recording_recipients(group_id,student_name,recording_id);
CREATE TABLE recording_operations (
 group_id TEXT NOT NULL REFERENCES tuition_groups(id),operation_id TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 request_hash TEXT NOT NULL,execution_id TEXT NOT NULL,result_json TEXT NOT NULL CHECK(json_valid(result_json)),created_at TEXT NOT NULL,
 PRIMARY KEY(group_id,operation_id)
);
CREATE TRIGGER class_recordings_group_guard_insert BEFORE INSERT ON class_recordings
BEGIN SELECT RAISE(ABORT,'recording_classroom_mismatch') WHERE NOT EXISTS(SELECT 1 FROM classrooms WHERE id=NEW.classroom_id AND group_id=NEW.group_id)
 OR (NEW.session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM class_sessions WHERE id=NEW.session_id AND group_id=NEW.group_id AND classroom_id=NEW.classroom_id)); END;
CREATE TRIGGER class_recordings_group_guard_update BEFORE UPDATE ON class_recordings
BEGIN SELECT RAISE(ABORT,'recording_classroom_mismatch') WHERE NEW.group_id<>OLD.group_id OR NEW.id<>OLD.id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NOT EXISTS(SELECT 1 FROM classrooms WHERE id=NEW.classroom_id AND group_id=NEW.group_id)
 OR (NEW.session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM class_sessions WHERE id=NEW.session_id AND group_id=NEW.group_id AND classroom_id=NEW.classroom_id)); END;
