-- Cover operational cleanup lesson checks and session-driven participant reads without full-group scans.
CREATE INDEX IF NOT EXISTS lessons_group_session_student_idx ON lessons(group_id,session_id,student);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS class_session_participants_group_session_student_idx ON class_session_participants(group_id,session_id,student_name);
