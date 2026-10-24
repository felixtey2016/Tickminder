-- Operational cleanup keeps immutable financial documents and their source identities.
-- No financial table, foreign key or immutability trigger is changed.
CREATE TABLE student_offboarding (
 group_id TEXT NOT NULL REFERENCES tuition_groups(id),student_name TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('marked','cancelled','cleaned')),
 last_lesson_date TEXT,reason TEXT NOT NULL DEFAULT '' CHECK(length(reason)<=500),
 revision INTEGER NOT NULL CHECK(revision>0),marked_by TEXT NOT NULL,marked_at TEXT NOT NULL,
 updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,cleaned_at TEXT,
 PRIMARY KEY(group_id,student_name),
 CHECK((status='cleaned' AND cleaned_at IS NOT NULL) OR (status<>'cleaned' AND cleaned_at IS NULL))
);
CREATE INDEX student_offboarding_queue ON student_offboarding(group_id,status,last_lesson_date,updated_at);
CREATE TABLE classroom_retirements (
 group_id TEXT NOT NULL REFERENCES tuition_groups(id),classroom_id TEXT NOT NULL,
 student_name TEXT NOT NULL DEFAULT '',retired_at TEXT NOT NULL,retired_by TEXT NOT NULL,
 PRIMARY KEY(group_id,classroom_id)
);
CREATE TRIGGER student_offboarding_identity BEFORE UPDATE OF group_id,student_name ON student_offboarding
 WHEN OLD.group_id IS NOT NEW.group_id OR OLD.student_name IS NOT NEW.student_name
 BEGIN SELECT RAISE(ABORT,'student_offboarding_identity'); END;
CREATE TRIGGER student_offboarding_final BEFORE UPDATE ON student_offboarding WHEN OLD.status='cleaned'
 BEGIN SELECT RAISE(ABORT,'student_offboarding_final'); END;
CREATE TRIGGER student_offboarding_history BEFORE DELETE ON student_offboarding
 BEGIN SELECT RAISE(ABORT,'student_offboarding_history'); END;
CREATE TRIGGER classroom_retirement_update BEFORE UPDATE ON classroom_retirements
 BEGIN SELECT RAISE(ABORT,'classroom_retirement_immutable'); END;
CREATE TRIGGER classroom_retirement_delete BEFORE DELETE ON classroom_retirements
 BEGIN SELECT RAISE(ABORT,'classroom_retirement_immutable'); END;
