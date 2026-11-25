-- Additive history: retain every existing content, recipient, submission and score ID.
ALTER TABLE teaching_materials ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE teaching_materials ADD COLUMN updated_at TEXT;
ALTER TABLE teaching_materials ADD COLUMN edit_token TEXT;
ALTER TABLE homework ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE homework ADD COLUMN updated_at TEXT;
ALTER TABLE homework ADD COLUMN edit_token TEXT;
ALTER TABLE homework_recipients ADD COLUMN score_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE homework_recipients ADD COLUMN score_token TEXT;
ALTER TABLE homework_submissions ADD COLUMN homework_revision INTEGER;
ALTER TABLE homework_submissions ADD COLUMN starts_at_submission TEXT;
ALTER TABLE homework_submissions ADD COLUMN due_at_submission TEXT;
ALTER TABLE homework_submissions ADD COLUMN max_score_submission REAL;

CREATE TABLE learning_versions (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('material','homework')),
 record_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>=1),
 file_id TEXT REFERENCES pdf_files(id), snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 actor_id TEXT NOT NULL, changed_at TEXT NOT NULL, reason TEXT NOT NULL,
 UNIQUE(kind,record_id,revision)
);
CREATE INDEX learning_versions_record ON learning_versions(group_id,kind,record_id,revision DESC);
CREATE INDEX learning_versions_file ON learning_versions(file_id);
CREATE TABLE homework_score_history (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, homework_id TEXT NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
 student_name TEXT NOT NULL, submission_id TEXT, homework_revision INTEGER,
 score REAL, previous_score REAL, max_score REAL, actor_id TEXT, changed_at TEXT NOT NULL,
 reason TEXT NOT NULL
);
CREATE INDEX homework_score_history_record ON homework_score_history(group_id,homework_id,student_name,changed_at DESC);

-- The baseline is the content that exists now, not an invented reconstruction of old edits.
INSERT INTO learning_versions(id,group_id,kind,record_id,revision,file_id,snapshot_json,actor_id,changed_at,reason)
 SELECT lower(hex(randomblob(16))),group_id,'material',id,revision,file_id,
 json_object('title',title,'description',description,'fileId',file_id,'classroomId',classroom_id,'folderId',folder_id),
 owner_id,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'baseline' FROM teaching_materials;
INSERT INTO learning_versions(id,group_id,kind,record_id,revision,file_id,snapshot_json,actor_id,changed_at,reason)
 SELECT lower(hex(randomblob(16))),group_id,'homework',id,revision,attachment_file_id,
 json_object('title',title,'description',description,'subject',subject,'startsAt',starts_at,'dueAt',due_at,'maxScore',max_score,'fileId',attachment_file_id,'classroomId',classroom_id,'folderId',folder_id),
 owner_id,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'baseline' FROM homework;
-- Earlier grading events are retained verbatim; their old denominators/version were not recorded.
INSERT INTO homework_score_history(id,group_id,homework_id,student_name,score,actor_id,changed_at,reason)
 SELECT 'audit:'||a.id,a.group_id,h.id,json_extract(a.after_json,'$.student'),json_extract(a.after_json,'$.score'),a.actor_id,a.at,'legacy_grade'
 FROM audit a JOIN homework h ON a.lesson_id='learning:'||h.id AND a.group_id=h.group_id
 WHERE a.action='setHomeworkScore' AND json_valid(a.after_json) AND json_type(a.after_json,'$.score') IN ('integer','real') AND json_type(a.after_json,'$.student')='text';
INSERT INTO homework_score_history(id,group_id,homework_id,student_name,score,actor_id,changed_at,reason)
 SELECT 'baseline:'||r.id,r.group_id,r.homework_id,r.student_name,r.score,r.scored_by,coalesce(r.scored_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),'baseline_grade'
 FROM homework_recipients r WHERE r.score IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM homework_score_history s WHERE s.homework_id=r.homework_id AND s.student_name=r.student_name AND s.score=r.score AND s.changed_at=r.scored_at);

CREATE TRIGGER material_initial_version AFTER INSERT ON teaching_materials BEGIN
 INSERT INTO learning_versions(id,group_id,kind,record_id,revision,file_id,snapshot_json,actor_id,changed_at,reason)
 VALUES(lower(hex(randomblob(16))),NEW.group_id,'material',NEW.id,NEW.revision,NEW.file_id,
 json_object('title',NEW.title,'description',NEW.description,'fileId',NEW.file_id,'classroomId',NEW.classroom_id,'folderId',NEW.folder_id),NEW.owner_id,NEW.created_at,'created');
END;
CREATE TRIGGER homework_initial_version AFTER INSERT ON homework BEGIN
 INSERT INTO learning_versions(id,group_id,kind,record_id,revision,file_id,snapshot_json,actor_id,changed_at,reason)
 VALUES(lower(hex(randomblob(16))),NEW.group_id,'homework',NEW.id,NEW.revision,NEW.attachment_file_id,
 json_object('title',NEW.title,'description',NEW.description,'subject',NEW.subject,'startsAt',NEW.starts_at,'dueAt',NEW.due_at,'maxScore',NEW.max_score,'fileId',NEW.attachment_file_id,'classroomId',NEW.classroom_id,'folderId',NEW.folder_id),NEW.owner_id,NEW.created_at,'created');
END;
CREATE TRIGGER material_edit_version AFTER UPDATE OF revision ON teaching_materials WHEN NEW.revision<>OLD.revision BEGIN
 SELECT RAISE(ABORT,'invalid content revision') WHERE NEW.revision<>OLD.revision+1;
 INSERT INTO learning_versions(id,group_id,kind,record_id,revision,file_id,snapshot_json,actor_id,changed_at,reason)
 VALUES(lower(hex(randomblob(16))),NEW.group_id,'material',NEW.id,NEW.revision,NEW.file_id,
 json_object('title',NEW.title,'description',NEW.description,'fileId',NEW.file_id,'classroomId',NEW.classroom_id,'folderId',NEW.folder_id),NEW.owner_id,NEW.updated_at,'edited');
END;
CREATE TRIGGER homework_edit_version AFTER UPDATE OF revision ON homework WHEN NEW.revision<>OLD.revision BEGIN
 SELECT RAISE(ABORT,'invalid content revision') WHERE NEW.revision<>OLD.revision+1;
 INSERT INTO learning_versions(id,group_id,kind,record_id,revision,file_id,snapshot_json,actor_id,changed_at,reason)
 VALUES(lower(hex(randomblob(16))),NEW.group_id,'homework',NEW.id,NEW.revision,NEW.attachment_file_id,
 json_object('title',NEW.title,'description',NEW.description,'subject',NEW.subject,'startsAt',NEW.starts_at,'dueAt',NEW.due_at,'maxScore',NEW.max_score,'fileId',NEW.attachment_file_id,'classroomId',NEW.classroom_id,'folderId',NEW.folder_id),NEW.owner_id,NEW.updated_at,'edited');
END;
CREATE TRIGGER learning_version_group BEFORE INSERT ON learning_versions BEGIN
 SELECT RAISE(ABORT,'invalid version file') WHERE NEW.file_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pdf_files WHERE id=NEW.file_id AND group_id=NEW.group_id AND status IN ('staged','attached'));
 SELECT RAISE(ABORT,'invalid version record') WHERE (NEW.kind='material' AND NOT EXISTS(SELECT 1 FROM teaching_materials WHERE id=NEW.record_id AND group_id=NEW.group_id)) OR (NEW.kind='homework' AND NOT EXISTS(SELECT 1 FROM homework WHERE id=NEW.record_id AND group_id=NEW.group_id));
END;
CREATE TRIGGER material_delete_versions AFTER DELETE ON teaching_materials BEGIN DELETE FROM learning_versions WHERE kind='material' AND record_id=OLD.id AND group_id=OLD.group_id; END;
CREATE TRIGGER homework_delete_versions AFTER DELETE ON homework BEGIN DELETE FROM learning_versions WHERE kind='homework' AND record_id=OLD.id AND group_id=OLD.group_id; END;
CREATE TRIGGER homework_max_score_guard BEFORE UPDATE OF max_score ON homework BEGIN
 SELECT RAISE(ABORT,'score maximum conflict') WHERE EXISTS(SELECT 1 FROM homework_recipients WHERE homework_id=NEW.id AND group_id=NEW.group_id AND score IS NOT NULL AND (NEW.max_score IS NULL OR score>NEW.max_score));
END;
CREATE TRIGGER homework_grade_guard BEFORE UPDATE OF score ON homework_recipients WHEN NEW.score IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'score maximum conflict') WHERE NOT EXISTS(SELECT 1 FROM homework WHERE id=NEW.homework_id AND group_id=NEW.group_id AND max_score IS NOT NULL AND NEW.score>=0 AND NEW.score<=max_score);
END;
CREATE TRIGGER homework_score_change_history AFTER UPDATE OF score,scored_at ON homework_recipients
 WHEN NEW.score IS NOT OLD.score OR NEW.scored_at IS NOT OLD.scored_at BEGIN
 INSERT INTO homework_score_history(id,group_id,homework_id,student_name,submission_id,homework_revision,score,previous_score,max_score,actor_id,changed_at,reason)
 SELECT lower(hex(randomblob(16))),NEW.group_id,NEW.homework_id,NEW.student_name,
 (SELECT id FROM homework_submissions WHERE homework_id=NEW.homework_id AND student_name=NEW.student_name AND group_id=NEW.group_id ORDER BY submitted_at DESC,id DESC LIMIT 1),h.revision,NEW.score,OLD.score,h.max_score,NEW.scored_by,
 coalesce(NEW.scored_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),CASE WHEN NEW.score IS NULL THEN 'resubmitted' ELSE 'graded' END
 FROM homework h WHERE h.id=NEW.homework_id AND h.group_id=NEW.group_id;
END;
