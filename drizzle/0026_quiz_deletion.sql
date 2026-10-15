-- Explicit organisation designation; never infer elevated rights from creation order.
ALTER TABLE tuition_groups ADD COLUMN chief_admin_id TEXT;
ALTER TABLE quizzes ADD COLUMN deleted_at TEXT;
ALTER TABLE quizzes ADD COLUMN deleted_by TEXT;
CREATE INDEX quiz_deleted_idx ON quizzes(group_id,deleted_at,updated_at);
-- Deletion keeps immutable versions, image grants, attempts and grades.
CREATE TRIGGER quiz_deleted_write_guard BEFORE UPDATE ON quizzes WHEN OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'quiz deleted'); END;
