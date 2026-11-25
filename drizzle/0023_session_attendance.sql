ALTER TABLE class_sessions ADD COLUMN teaching_status TEXT NOT NULL DEFAULT 'pending' CHECK(teaching_status IN ('pending','taught','not_taught','teacher_absent'));
ALTER TABLE class_sessions ADD COLUMN actual_start TEXT;
ALTER TABLE class_sessions ADD COLUMN actual_end TEXT;
ALTER TABLE class_sessions ADD COLUMN attendance_note TEXT;
ALTER TABLE class_sessions ADD COLUMN attendance_recorded_at TEXT;
ALTER TABLE class_sessions ADD COLUMN attendance_recorded_by TEXT;
ALTER TABLE class_sessions ADD COLUMN attendance_reviewed_at TEXT;
ALTER TABLE class_sessions ADD COLUMN attendance_reviewed_by TEXT;
ALTER TABLE class_sessions ADD COLUMN attendance_written_at TEXT;
ALTER TABLE class_session_participants ADD COLUMN attendance_status TEXT NOT NULL DEFAULT 'pending' CHECK(attendance_status IN ('pending','present','absent','late','early_leave','late_early'));
ALTER TABLE class_session_participants ADD COLUMN arrived_at TEXT;
ALTER TABLE class_session_participants ADD COLUMN left_at TEXT;
ALTER TABLE class_session_participants ADD COLUMN attendance_note TEXT;
ALTER TABLE class_session_participants ADD COLUMN attendance_updated_at TEXT;

-- Preserve legacy student facts; never infer group teaching time from a student row.
UPDATE class_session_participants SET
 attendance_status=(SELECT CASE WHEN l.status='completed' THEN 'present' WHEN l.status IN ('student_absent','teacher_absent') THEN 'absent' ELSE 'pending' END FROM lessons l WHERE l.id=lesson_id),
 arrived_at=(SELECT actual_start FROM lessons WHERE id=lesson_id),left_at=(SELECT actual_end FROM lessons WHERE id=lesson_id),
 attendance_note=(SELECT note FROM lessons WHERE id=lesson_id),attendance_updated_at=(SELECT CASE WHEN status IN ('completed','student_absent','teacher_absent') THEN updated_at END FROM lessons WHERE id=lesson_id);
UPDATE class_sessions SET
 teaching_status=(SELECT CASE WHEN l.status='completed' AND l.actual_start IS NOT NULL AND l.actual_end IS NOT NULL THEN 'taught' WHEN l.status='teacher_absent' THEN 'teacher_absent' WHEN l.status='student_absent' THEN 'not_taught' ELSE 'pending' END FROM lessons l WHERE l.session_id=class_sessions.id LIMIT 1),
 actual_start=(SELECT actual_start FROM lessons WHERE session_id=class_sessions.id LIMIT 1),actual_end=(SELECT actual_end FROM lessons WHERE session_id=class_sessions.id LIMIT 1),
 attendance_note=(SELECT note FROM lessons WHERE session_id=class_sessions.id LIMIT 1),
 attendance_recorded_at=(SELECT CASE WHEN status IN ('completed','student_absent','teacher_absent') THEN updated_at END FROM lessons WHERE session_id=class_sessions.id LIMIT 1),
 attendance_reviewed_at=(SELECT reviewed_at FROM lessons WHERE session_id=class_sessions.id LIMIT 1),attendance_reviewed_by=(SELECT reviewed_by FROM lessons WHERE session_id=class_sessions.id LIMIT 1),attendance_written_at=(SELECT updated_at FROM lessons WHERE session_id=class_sessions.id LIMIT 1)
 WHERE session_type='one_to_one';

CREATE INDEX teaching_month ON class_sessions(group_id,teacher_name,actual_start,teaching_status);
CREATE INDEX attendance_missing ON class_sessions(group_id,teaching_status,planned_start);
CREATE TRIGGER attendance_teaching_conflict BEFORE UPDATE OF actual_start,actual_end,teaching_status ON class_sessions WHEN NEW.teaching_status='taught' BEGIN
 SELECT RAISE(ABORT,'actual teaching conflict') WHERE EXISTS(SELECT 1 FROM class_sessions s WHERE s.id<>NEW.id AND s.group_id=NEW.group_id AND s.teacher_name=NEW.teacher_name AND s.teaching_status='taught' AND NEW.actual_start<s.actual_end AND s.actual_start<NEW.actual_end);
END;
CREATE TRIGGER attendance_student_conflict BEFORE UPDATE OF arrived_at,left_at,attendance_status ON class_session_participants WHEN NEW.attendance_status NOT IN ('pending','absent') BEGIN
 SELECT RAISE(ABORT,'actual student attendance conflict') WHERE EXISTS(SELECT 1 FROM class_session_participants p WHERE p.id<>NEW.id AND p.group_id=NEW.group_id AND p.student_name=NEW.student_name AND p.attendance_status NOT IN ('pending','absent') AND NEW.arrived_at<p.left_at AND p.arrived_at<NEW.left_at);
END;

-- Keep in-flight clients of the previous release consistent during cutover.
-- The new atomic writer sets its marker first; independent teaching times must not be replaced by a student's presence interval.
CREATE TRIGGER attendance_legacy_sync AFTER UPDATE OF status,actual_start,actual_end,reviewed_at,chargeable,note ON lessons
 WHEN EXISTS(SELECT 1 FROM class_sessions s WHERE s.id=NEW.session_id AND s.attendance_written_at IS NOT NEW.updated_at) BEGIN
 UPDATE class_sessions SET teaching_status=CASE WHEN OLD.status IS NOT NEW.status OR OLD.actual_start IS NOT NEW.actual_start OR OLD.actual_end IS NOT NEW.actual_end OR teaching_status='pending' THEN CASE WHEN NEW.status='completed' AND NEW.actual_start IS NOT NULL AND NEW.actual_end IS NOT NULL THEN 'taught' WHEN NEW.status='teacher_absent' THEN 'teacher_absent' WHEN NEW.status='student_absent' THEN 'not_taught' ELSE 'pending' END ELSE teaching_status END,
 actual_start=CASE WHEN OLD.actual_start IS NOT NEW.actual_start OR teaching_status='pending' THEN NEW.actual_start ELSE actual_start END,actual_end=CASE WHEN OLD.actual_end IS NOT NEW.actual_end OR teaching_status='pending' THEN NEW.actual_end ELSE actual_end END,attendance_note=CASE WHEN OLD.note IS NOT NEW.note THEN NEW.note ELSE attendance_note END,attendance_recorded_at=CASE WHEN OLD.status IS NOT NEW.status OR OLD.actual_start IS NOT NEW.actual_start OR OLD.actual_end IS NOT NEW.actual_end THEN CASE WHEN NEW.status IN ('completed','student_absent','teacher_absent') THEN NEW.updated_at END ELSE attendance_recorded_at END,attendance_reviewed_at=NEW.reviewed_at,attendance_reviewed_by=NEW.reviewed_by,attendance_written_at=NEW.updated_at
 WHERE id=NEW.session_id AND session_type='one_to_one';
 UPDATE class_session_participants SET attendance_status=CASE WHEN OLD.status IS NOT NEW.status OR attendance_status='pending' THEN CASE WHEN NEW.status='completed' THEN 'present' WHEN NEW.status IN ('student_absent','teacher_absent') THEN 'absent' ELSE 'pending' END ELSE attendance_status END,arrived_at=NEW.actual_start,left_at=NEW.actual_end,attendance_note=NEW.note,attendance_updated_at=NEW.updated_at WHERE lesson_id=NEW.id;
END;
