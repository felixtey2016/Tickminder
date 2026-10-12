-- All existing business records retain their IDs and belong to Next Genn Edu.
CREATE TABLE tuition_groups (id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,join_code TEXT NOT NULL UNIQUE,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX tuition_groups_name_unique ON tuition_groups(name COLLATE NOCASE);
INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES('next-genn-edu','Next Genn Edu','next-genn-edu',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
ALTER TABLE accounts ADD COLUMN group_id TEXT DEFAULT 'next-genn-edu';
CREATE INDEX accounts_group_idx ON accounts(group_id);
CREATE TABLE teachers_grouped (
	`name` text  NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
,group_id TEXT NOT NULL DEFAULT 'next-genn-edu',PRIMARY KEY(group_id,`name`));
INSERT INTO teachers_grouped(`name`,`active`,`created_at`) SELECT `name`,`active`,`created_at` FROM teachers;
DROP TABLE teachers;
ALTER TABLE teachers_grouped RENAME TO teachers;
CREATE INDEX teachers_group_idx ON teachers(group_id);
CREATE TABLE students_grouped (
	`name` text  NOT NULL,
	`name_key` text NOT NULL,
	`active` integer NOT NULL DEFAULT 1,
	`created_at` text NOT NULL
,group_id TEXT NOT NULL DEFAULT 'next-genn-edu',PRIMARY KEY(group_id,`name`));
INSERT INTO students_grouped(`name`,`name_key`,`active`,`created_at`) SELECT `name`,`name_key`,`active`,`created_at` FROM students;
DROP TABLE students;
ALTER TABLE students_grouped RENAME TO students;
CREATE UNIQUE INDEX students_name_key_unique ON students(group_id,name_key);
CREATE INDEX students_group_idx ON students(group_id);
CREATE TABLE plans_grouped (
	`key` text  NOT NULL,
	`student` text NOT NULL,
	`subject` text NOT NULL,
	`teacher_name` text NOT NULL,
	`duration` real DEFAULT 1 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
, `online_link` text,group_id TEXT NOT NULL DEFAULT 'next-genn-edu',PRIMARY KEY(group_id,`key`));
INSERT INTO plans_grouped(`key`,`student`,`subject`,`teacher_name`,`duration`,`active`,`created_at`,`online_link`) SELECT `key`,`student`,`subject`,`teacher_name`,`duration`,`active`,`created_at`,`online_link` FROM plans;
DROP TABLE plans;
ALTER TABLE plans_grouped RENAME TO plans;
CREATE INDEX plans_group_idx ON plans(group_id);
ALTER TABLE assignments ADD COLUMN group_id TEXT NOT NULL DEFAULT 'next-genn-edu';
CREATE INDEX assignments_group_idx ON assignments(group_id);
ALTER TABLE lessons ADD COLUMN group_id TEXT NOT NULL DEFAULT 'next-genn-edu';
CREATE INDEX lessons_group_idx ON lessons(group_id);
ALTER TABLE reschedule_requests ADD COLUMN group_id TEXT NOT NULL DEFAULT 'next-genn-edu';
CREATE INDEX reschedule_requests_group_idx ON reschedule_requests(group_id);
ALTER TABLE audit ADD COLUMN group_id TEXT NOT NULL DEFAULT 'next-genn-edu';
CREATE INDEX audit_group_idx ON audit(group_id);
ALTER TABLE pdf_files ADD COLUMN group_id TEXT NOT NULL DEFAULT 'next-genn-edu';
CREATE INDEX pdf_files_group_idx ON pdf_files(group_id);
ALTER TABLE teaching_materials ADD COLUMN group_id TEXT NOT NULL DEFAULT 'next-genn-edu';
CREATE INDEX teaching_materials_group_idx ON teaching_materials(group_id);
ALTER TABLE material_recipients ADD COLUMN group_id TEXT NOT NULL DEFAULT 'next-genn-edu';
CREATE INDEX material_recipients_group_idx ON material_recipients(group_id);
ALTER TABLE homework ADD COLUMN group_id TEXT NOT NULL DEFAULT 'next-genn-edu';
CREATE INDEX homework_group_idx ON homework(group_id);
ALTER TABLE homework_recipients ADD COLUMN group_id TEXT NOT NULL DEFAULT 'next-genn-edu';
CREATE INDEX homework_recipients_group_idx ON homework_recipients(group_id);
ALTER TABLE homework_submissions ADD COLUMN group_id TEXT NOT NULL DEFAULT 'next-genn-edu';
CREATE INDEX homework_submissions_group_idx ON homework_submissions(group_id);
ALTER TABLE study_blocks ADD COLUMN group_id TEXT NOT NULL DEFAULT 'next-genn-edu';
CREATE INDEX study_blocks_group_idx ON study_blocks(group_id);
ALTER TABLE classrooms ADD COLUMN group_id TEXT NOT NULL DEFAULT 'next-genn-edu';
CREATE INDEX classrooms_group_idx ON classrooms(group_id);
ALTER TABLE academic_terms ADD COLUMN group_id TEXT NOT NULL DEFAULT 'next-genn-edu';
CREATE INDEX academic_terms_group_idx ON academic_terms(group_id);
ALTER TABLE classroom_members ADD COLUMN group_id TEXT NOT NULL DEFAULT 'next-genn-edu';
CREATE INDEX classroom_members_group_idx ON classroom_members(group_id);
ALTER TABLE classroom_announcements ADD COLUMN group_id TEXT NOT NULL DEFAULT 'next-genn-edu';
CREATE INDEX classroom_announcements_group_idx ON classroom_announcements(group_id);
ALTER TABLE notification_items ADD COLUMN group_id TEXT NOT NULL DEFAULT 'next-genn-edu';
CREATE INDEX notification_items_group_idx ON notification_items(group_id);
ALTER TABLE site_notifications ADD COLUMN group_id TEXT NOT NULL DEFAULT 'next-genn-edu';
CREATE INDEX site_notifications_group_idx ON site_notifications(group_id);
CREATE TABLE storage_quota_grouped (
	`id` integer  NOT NULL,
	`used_bytes` integer DEFAULT 0 NOT NULL
,group_id TEXT NOT NULL DEFAULT 'next-genn-edu',PRIMARY KEY(group_id,`id`));
INSERT INTO storage_quota_grouped(`id`,`used_bytes`) SELECT `id`,`used_bytes` FROM storage_quota;
DROP TABLE storage_quota;
ALTER TABLE storage_quota_grouped RENAME TO storage_quota;
DROP INDEX academic_terms_name_unique;
CREATE UNIQUE INDEX academic_terms_name_unique ON academic_terms(group_id,name);
UPDATE accounts SET group_id=NULL WHERE role='admin' AND id NOT LIKE 'local:%' AND lower(trim(email))='felixtey2016@gmail.com';
CREATE TRIGGER accounts_group_immutable BEFORE UPDATE OF group_id ON accounts WHEN OLD.group_id IS NOT NEW.group_id BEGIN SELECT RAISE(ABORT,'Account group is immutable'); END;
CREATE TRIGGER accounts_group_required BEFORE INSERT ON accounts WHEN NEW.group_id IS NULL AND NOT(NEW.role='admin' AND NEW.id NOT LIKE 'local:%' AND lower(trim(NEW.email))='felixtey2016@gmail.com') BEGIN SELECT RAISE(ABORT,'Account group required'); END;
CREATE TRIGGER teachers_group_immutable BEFORE UPDATE OF group_id ON teachers WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER teachers_group_exists BEFORE INSERT ON teachers WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER students_group_immutable BEFORE UPDATE OF group_id ON students WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER students_group_exists BEFORE INSERT ON students WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER plans_group_immutable BEFORE UPDATE OF group_id ON plans WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER plans_group_exists BEFORE INSERT ON plans WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER assignments_group_immutable BEFORE UPDATE OF group_id ON assignments WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER assignments_group_exists BEFORE INSERT ON assignments WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER lessons_group_immutable BEFORE UPDATE OF group_id ON lessons WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER lessons_group_exists BEFORE INSERT ON lessons WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER reschedule_requests_group_immutable BEFORE UPDATE OF group_id ON reschedule_requests WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER reschedule_requests_group_exists BEFORE INSERT ON reschedule_requests WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER audit_group_immutable BEFORE UPDATE OF group_id ON audit WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER audit_group_exists BEFORE INSERT ON audit WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER pdf_files_group_immutable BEFORE UPDATE OF group_id ON pdf_files WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER pdf_files_group_exists BEFORE INSERT ON pdf_files WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER teaching_materials_group_immutable BEFORE UPDATE OF group_id ON teaching_materials WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER teaching_materials_group_exists BEFORE INSERT ON teaching_materials WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER material_recipients_group_immutable BEFORE UPDATE OF group_id ON material_recipients WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER material_recipients_group_exists BEFORE INSERT ON material_recipients WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER homework_group_immutable BEFORE UPDATE OF group_id ON homework WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER homework_group_exists BEFORE INSERT ON homework WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER homework_recipients_group_immutable BEFORE UPDATE OF group_id ON homework_recipients WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER homework_recipients_group_exists BEFORE INSERT ON homework_recipients WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER homework_submissions_group_immutable BEFORE UPDATE OF group_id ON homework_submissions WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER homework_submissions_group_exists BEFORE INSERT ON homework_submissions WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER study_blocks_group_immutable BEFORE UPDATE OF group_id ON study_blocks WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER study_blocks_group_exists BEFORE INSERT ON study_blocks WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER classrooms_group_immutable BEFORE UPDATE OF group_id ON classrooms WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER classrooms_group_exists BEFORE INSERT ON classrooms WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER academic_terms_group_immutable BEFORE UPDATE OF group_id ON academic_terms WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER academic_terms_group_exists BEFORE INSERT ON academic_terms WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER classroom_members_group_immutable BEFORE UPDATE OF group_id ON classroom_members WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER classroom_members_group_exists BEFORE INSERT ON classroom_members WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER classroom_announcements_group_immutable BEFORE UPDATE OF group_id ON classroom_announcements WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER classroom_announcements_group_exists BEFORE INSERT ON classroom_announcements WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER notification_items_group_immutable BEFORE UPDATE OF group_id ON notification_items WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER notification_items_group_exists BEFORE INSERT ON notification_items WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER site_notifications_group_immutable BEFORE UPDATE OF group_id ON site_notifications WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER site_notifications_group_exists BEFORE INSERT ON site_notifications WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER storage_quota_group_immutable BEFORE UPDATE OF group_id ON storage_quota WHEN OLD.group_id<>NEW.group_id BEGIN SELECT RAISE(ABORT,'Record group is immutable'); END;
CREATE TRIGGER storage_quota_group_exists BEFORE INSERT ON storage_quota WHEN NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
CREATE TRIGGER reschedule_requests_lesson_id_group_insert BEFORE INSERT ON reschedule_requests WHEN EXISTS(SELECT 1 FROM lessons WHERE id=NEW.lesson_id) AND NOT EXISTS(SELECT 1 FROM lessons WHERE id=NEW.lesson_id AND group_id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Cross-group reference'); END;
CREATE TRIGGER reschedule_requests_lesson_id_group_update BEFORE UPDATE ON reschedule_requests WHEN EXISTS(SELECT 1 FROM lessons WHERE id=NEW.lesson_id) AND NOT EXISTS(SELECT 1 FROM lessons WHERE id=NEW.lesson_id AND group_id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Cross-group reference'); END;
CREATE TRIGGER material_recipients_material_id_group_insert BEFORE INSERT ON material_recipients WHEN EXISTS(SELECT 1 FROM teaching_materials WHERE id=NEW.material_id) AND NOT EXISTS(SELECT 1 FROM teaching_materials WHERE id=NEW.material_id AND group_id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Cross-group reference'); END;
CREATE TRIGGER material_recipients_material_id_group_update BEFORE UPDATE ON material_recipients WHEN EXISTS(SELECT 1 FROM teaching_materials WHERE id=NEW.material_id) AND NOT EXISTS(SELECT 1 FROM teaching_materials WHERE id=NEW.material_id AND group_id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Cross-group reference'); END;
CREATE TRIGGER homework_recipients_homework_id_group_insert BEFORE INSERT ON homework_recipients WHEN EXISTS(SELECT 1 FROM homework WHERE id=NEW.homework_id) AND NOT EXISTS(SELECT 1 FROM homework WHERE id=NEW.homework_id AND group_id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Cross-group reference'); END;
CREATE TRIGGER homework_recipients_homework_id_group_update BEFORE UPDATE ON homework_recipients WHEN EXISTS(SELECT 1 FROM homework WHERE id=NEW.homework_id) AND NOT EXISTS(SELECT 1 FROM homework WHERE id=NEW.homework_id AND group_id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Cross-group reference'); END;
CREATE TRIGGER homework_submissions_homework_id_group_insert BEFORE INSERT ON homework_submissions WHEN EXISTS(SELECT 1 FROM homework WHERE id=NEW.homework_id) AND NOT EXISTS(SELECT 1 FROM homework WHERE id=NEW.homework_id AND group_id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Cross-group reference'); END;
CREATE TRIGGER homework_submissions_homework_id_group_update BEFORE UPDATE ON homework_submissions WHEN EXISTS(SELECT 1 FROM homework WHERE id=NEW.homework_id) AND NOT EXISTS(SELECT 1 FROM homework WHERE id=NEW.homework_id AND group_id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Cross-group reference'); END;
CREATE TRIGGER classroom_members_classroom_id_group_insert BEFORE INSERT ON classroom_members WHEN EXISTS(SELECT 1 FROM classrooms WHERE id=NEW.classroom_id) AND NOT EXISTS(SELECT 1 FROM classrooms WHERE id=NEW.classroom_id AND group_id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Cross-group reference'); END;
CREATE TRIGGER classroom_members_classroom_id_group_update BEFORE UPDATE ON classroom_members WHEN EXISTS(SELECT 1 FROM classrooms WHERE id=NEW.classroom_id) AND NOT EXISTS(SELECT 1 FROM classrooms WHERE id=NEW.classroom_id AND group_id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Cross-group reference'); END;
CREATE TRIGGER classroom_announcements_classroom_id_group_insert BEFORE INSERT ON classroom_announcements WHEN EXISTS(SELECT 1 FROM classrooms WHERE id=NEW.classroom_id) AND NOT EXISTS(SELECT 1 FROM classrooms WHERE id=NEW.classroom_id AND group_id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Cross-group reference'); END;
CREATE TRIGGER classroom_announcements_classroom_id_group_update BEFORE UPDATE ON classroom_announcements WHEN EXISTS(SELECT 1 FROM classrooms WHERE id=NEW.classroom_id) AND NOT EXISTS(SELECT 1 FROM classrooms WHERE id=NEW.classroom_id AND group_id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Cross-group reference'); END;
CREATE TRIGGER notification_items_lesson_id_group_insert BEFORE INSERT ON notification_items WHEN EXISTS(SELECT 1 FROM lessons WHERE id=NEW.lesson_id) AND NOT EXISTS(SELECT 1 FROM lessons WHERE id=NEW.lesson_id AND group_id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Cross-group reference'); END;
CREATE TRIGGER notification_items_lesson_id_group_update BEFORE UPDATE ON notification_items WHEN EXISTS(SELECT 1 FROM lessons WHERE id=NEW.lesson_id) AND NOT EXISTS(SELECT 1 FROM lessons WHERE id=NEW.lesson_id AND group_id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Cross-group reference'); END;
CREATE TRIGGER site_notifications_lesson_id_group_insert BEFORE INSERT ON site_notifications WHEN EXISTS(SELECT 1 FROM lessons WHERE id=NEW.lesson_id) AND NOT EXISTS(SELECT 1 FROM lessons WHERE id=NEW.lesson_id AND group_id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Cross-group reference'); END;
CREATE TRIGGER site_notifications_lesson_id_group_update BEFORE UPDATE ON site_notifications WHEN EXISTS(SELECT 1 FROM lessons WHERE id=NEW.lesson_id) AND NOT EXISTS(SELECT 1 FROM lessons WHERE id=NEW.lesson_id AND group_id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Cross-group reference'); END;

CREATE TRIGGER accounts_group_exists BEFORE INSERT ON accounts WHEN NEW.group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tuition_groups WHERE id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Unknown tuition group'); END;
