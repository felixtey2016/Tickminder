CREATE TABLE class_sessions (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL,session_type TEXT NOT NULL CHECK(session_type IN ('one_to_one','group')),
 classroom_id TEXT REFERENCES classrooms(id) ON DELETE SET NULL,classroom_title TEXT,
 teacher_name TEXT NOT NULL,subject TEXT NOT NULL,planned_start TEXT NOT NULL,planned_end TEXT NOT NULL,
 online_link TEXT,status TEXT NOT NULL DEFAULT 'scheduled',series_id TEXT,revision INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,mutation_id TEXT,
 create_request_id TEXT,occurrence INTEGER NOT NULL DEFAULT 0,create_hash TEXT,
 UNIQUE(group_id,create_request_id,occurrence)
);
CREATE INDEX class_session_teacher_time ON class_sessions(group_id,teacher_name,planned_start);
CREATE INDEX class_session_class_time ON class_sessions(group_id,classroom_id,planned_start);
ALTER TABLE lessons ADD COLUMN session_id TEXT REFERENCES class_sessions(id);
ALTER TABLE reschedule_requests ADD COLUMN session_id TEXT REFERENCES class_sessions(id);
CREATE TABLE class_session_participants (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL,session_id TEXT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
 lesson_id TEXT NOT NULL UNIQUE REFERENCES lessons(id) ON DELETE CASCADE,student_name TEXT NOT NULL,
 UNIQUE(session_id,student_name)
);
CREATE INDEX class_participant_student ON class_session_participants(group_id,student_name,session_id);
CREATE INDEX lesson_session ON lessons(session_id);
CREATE INDEX class_reschedule_pending ON reschedule_requests(session_id,status);

-- No legacy rows are merged: each preserved lesson ID receives its own session.
INSERT INTO class_sessions(id,group_id,session_type,teacher_name,subject,planned_start,planned_end,online_link,status,series_id,created_by,created_at,updated_at)
 SELECT 'one:'||l.id,l.group_id,'one_to_one',l.teacher_name,l.subject,l.planned_start,l.planned_end,
 (SELECT p.online_link FROM plans p WHERE p.group_id=l.group_id AND p.student=l.student AND p.subject=l.subject AND p.teacher_name=l.teacher_name),
 l.status,l.series_id,l.created_by,l.updated_at,l.updated_at FROM lessons l;
UPDATE lessons SET session_id='one:'||id;
INSERT INTO class_session_participants(id,group_id,session_id,lesson_id,student_name) SELECT 'participant:'||id,group_id,session_id,id,student FROM lessons;
UPDATE reschedule_requests SET session_id=(SELECT session_id FROM lessons WHERE id=reschedule_requests.lesson_id AND group_id=reschedule_requests.group_id);

CREATE TRIGGER class_session_link_insert BEFORE INSERT ON lessons WHEN NEW.session_id IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'invalid class session link') WHERE NOT EXISTS(SELECT 1 FROM class_sessions s WHERE s.id=NEW.session_id AND s.group_id=NEW.group_id AND s.teacher_name=NEW.teacher_name AND s.subject=NEW.subject AND s.planned_start=NEW.planned_start AND s.planned_end=NEW.planned_end);
END;
CREATE TRIGGER class_session_link_update BEFORE UPDATE OF planned_start,planned_end,teacher_name,subject,student,session_id ON lessons WHEN NEW.session_id IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'group session must change together') WHERE EXISTS(SELECT 1 FROM class_sessions s WHERE s.id=NEW.session_id AND s.session_type='group' AND (s.group_id<>NEW.group_id OR s.teacher_name<>NEW.teacher_name OR s.subject<>NEW.subject OR s.planned_start<>NEW.planned_start OR s.planned_end<>NEW.planned_end OR OLD.student<>NEW.student OR OLD.session_id<>NEW.session_id));
END;
CREATE TRIGGER class_session_conflict_insert BEFORE INSERT ON lessons WHEN NEW.status='scheduled' BEGIN
 SELECT RAISE(ABORT,'lesson slot conflict') WHERE EXISTS(SELECT 1 FROM lessons other WHERE other.group_id=NEW.group_id AND other.status<>'cancelled' AND NEW.planned_start<other.planned_end AND other.planned_start<NEW.planned_end AND
 (other.student=NEW.student OR (other.teacher_name=NEW.teacher_name AND (NEW.session_id IS NULL OR other.session_id IS NULL OR other.session_id<>NEW.session_id))));
END;
CREATE TRIGGER class_session_conflict_update BEFORE UPDATE OF planned_start,planned_end,teacher_name,status ON lessons
 WHEN NEW.status='scheduled' AND (NEW.planned_start<>OLD.planned_start OR NEW.planned_end<>OLD.planned_end OR NEW.teacher_name<>OLD.teacher_name OR OLD.status='cancelled') BEGIN
 SELECT RAISE(ABORT,'lesson slot conflict') WHERE EXISTS(SELECT 1 FROM lessons other WHERE other.id<>NEW.id AND other.group_id=NEW.group_id AND other.status<>'cancelled' AND NEW.planned_start<other.planned_end AND other.planned_start<NEW.planned_end AND
 (other.student=NEW.student OR (other.teacher_name=NEW.teacher_name AND (NEW.session_id IS NULL OR other.session_id IS NULL OR other.session_id<>NEW.session_id))));
END;
CREATE TRIGGER class_session_auto_insert AFTER INSERT ON lessons BEGIN
 INSERT INTO class_sessions(id,group_id,session_type,teacher_name,subject,planned_start,planned_end,online_link,status,series_id,created_by,created_at,updated_at)
 SELECT 'one:'||NEW.id,NEW.group_id,'one_to_one',NEW.teacher_name,NEW.subject,NEW.planned_start,NEW.planned_end,
 (SELECT online_link FROM plans WHERE group_id=NEW.group_id AND student=NEW.student AND subject=NEW.subject AND teacher_name=NEW.teacher_name),NEW.status,NEW.series_id,NEW.created_by,NEW.updated_at,NEW.updated_at WHERE NEW.session_id IS NULL;
 UPDATE lessons SET session_id='one:'||NEW.id WHERE id=NEW.id AND session_id IS NULL;
 INSERT INTO class_session_participants(id,group_id,session_id,lesson_id,student_name) VALUES('participant:'||NEW.id,NEW.group_id,coalesce(NEW.session_id,'one:'||NEW.id),NEW.id,NEW.student);
END;
CREATE TRIGGER class_participant_guard BEFORE INSERT ON class_session_participants BEGIN
 SELECT RAISE(ABORT,'invalid class participant') WHERE NOT EXISTS(SELECT 1 FROM lessons l JOIN class_sessions s ON s.id=l.session_id WHERE l.id=NEW.lesson_id AND l.session_id=NEW.session_id AND l.group_id=NEW.group_id AND s.group_id=NEW.group_id AND l.student=NEW.student_name);
END;
CREATE TRIGGER class_participant_snapshot BEFORE UPDATE OF session_id,lesson_id,student_name,group_id ON class_session_participants BEGIN SELECT RAISE(ABORT,'participant snapshot is immutable'); END;
CREATE TRIGGER class_one_sync AFTER UPDATE OF planned_start,planned_end,teacher_name,subject,status,series_id,updated_at ON lessons BEGIN
 UPDATE class_sessions SET teacher_name=NEW.teacher_name,subject=NEW.subject,planned_start=NEW.planned_start,planned_end=NEW.planned_end,status=NEW.status,series_id=NEW.series_id,updated_at=NEW.updated_at,revision=revision+1 WHERE id=NEW.session_id AND session_type='one_to_one';
END;
CREATE TRIGGER class_group_attendance_sync AFTER UPDATE OF status,actual_start,actual_end,reviewed_at ON lessons WHEN NEW.session_id IS NOT NULL BEGIN
 UPDATE class_sessions SET status=CASE
  WHEN EXISTS(SELECT 1 FROM lessons WHERE session_id=NEW.session_id AND status='scheduled') THEN 'scheduled'
  WHEN NOT EXISTS(SELECT 1 FROM lessons WHERE session_id=NEW.session_id AND status<>'cancelled') THEN 'cancelled'
  ELSE 'completed' END,revision=revision+1,updated_at=NEW.updated_at WHERE id=NEW.session_id AND session_type='group';
END;
CREATE TRIGGER class_one_delete AFTER DELETE ON lessons BEGIN DELETE FROM class_sessions WHERE id=OLD.session_id AND session_type='one_to_one'; END;
CREATE TRIGGER class_request_link AFTER INSERT ON reschedule_requests WHEN NEW.session_id IS NULL BEGIN UPDATE reschedule_requests SET session_id=(SELECT session_id FROM lessons WHERE id=NEW.lesson_id AND group_id=NEW.group_id) WHERE id=NEW.id; END;
