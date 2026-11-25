-- Keep overlap comparisons compatible with historical timestamps with UTC offsets.
CREATE INDEX IF NOT EXISTS sessions_group_planned_end_idx ON class_sessions(group_id,julianday(planned_end));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS lessons_reminder_start_idx ON lessons(julianday(planned_start),id) WHERE status='scheduled';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notification_items_due_idx ON notification_items(due_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_class_task_classroom_idx ON audit(
  group_id,json_extract(CASE WHEN json_valid(after_json) THEN after_json ELSE '{}' END,'$.classroomId'),at DESC,id DESC
) WHERE action='classTask.create';
