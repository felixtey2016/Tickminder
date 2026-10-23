-- Date expressions also handle existing timestamps with explicit UTC offsets.
CREATE INDEX lessons_group_planned_range ON lessons(group_id,julianday(planned_start),id);
CREATE INDEX lessons_teacher_planned_range ON lessons(group_id,teacher_name,julianday(planned_start),id);
CREATE INDEX lessons_student_planned_range ON lessons(group_id,student,julianday(planned_start),id);
CREATE INDEX lessons_group_actual_range ON lessons(group_id,julianday(actual_start),id);
CREATE INDEX lessons_group_replacement ON lessons(group_id,replacement_for,status);
CREATE INDEX lessons_group_pending_range ON lessons(group_id,status,julianday(planned_end),id);
CREATE INDEX sessions_group_planned_range ON class_sessions(group_id,julianday(planned_start),id);
CREATE INDEX sessions_group_actual_range ON class_sessions(group_id,julianday(coalesce(actual_start,planned_start)),id);
CREATE INDEX requests_group_status_time ON reschedule_requests(group_id,status,requested_at,id);
CREATE INDEX audit_lesson_history_page ON audit(group_id,lesson_id,at DESC,id DESC);
