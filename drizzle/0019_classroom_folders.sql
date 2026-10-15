CREATE TABLE classroom_folders (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
 parent_id TEXT REFERENCES classroom_folders(id) ON DELETE CASCADE,
 name TEXT NOT NULL, name_key TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX folder_sibling_name ON classroom_folders(group_id,classroom_id,coalesce(parent_id,''),name_key);
CREATE INDEX folder_class_parent ON classroom_folders(group_id,classroom_id,parent_id);
CREATE TABLE classroom_content_state (
 classroom_id TEXT PRIMARY KEY REFERENCES classrooms(id) ON DELETE CASCADE, group_id TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0, mutation_id TEXT
);
INSERT INTO classroom_content_state(classroom_id,group_id) SELECT id,group_id FROM classrooms;
CREATE TRIGGER folder_state_new_class AFTER INSERT ON classrooms BEGIN
 INSERT INTO classroom_content_state(classroom_id,group_id) VALUES(NEW.id,NEW.group_id);
END;
ALTER TABLE teaching_materials ADD COLUMN folder_id TEXT;
ALTER TABLE homework ADD COLUMN folder_id TEXT;
CREATE INDEX material_class_folder ON teaching_materials(group_id,classroom_id,folder_id);
CREATE INDEX homework_class_folder ON homework(group_id,classroom_id,folder_id);
CREATE TRIGGER material_active_class_insert BEFORE INSERT ON teaching_materials WHEN NEW.classroom_id IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'invalid content classroom') WHERE NOT EXISTS(SELECT 1 FROM classrooms c JOIN accounts a ON a.id=NEW.owner_id AND a.group_id=c.group_id WHERE c.id=NEW.classroom_id AND c.group_id=NEW.group_id AND c.archived=0 AND a.role='teacher' AND a.teacher_name=c.teacher_name);
END;
CREATE TRIGGER homework_active_class_insert BEFORE INSERT ON homework WHEN NEW.classroom_id IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'invalid content classroom') WHERE NOT EXISTS(SELECT 1 FROM classrooms c JOIN accounts a ON a.id=NEW.owner_id AND a.group_id=c.group_id WHERE c.id=NEW.classroom_id AND c.group_id=NEW.group_id AND c.archived=0 AND c.subject=NEW.subject AND a.role='teacher' AND a.teacher_name=c.teacher_name);
END;
CREATE TRIGGER folder_parent_insert BEFORE INSERT ON classroom_folders BEGIN
 SELECT RAISE(ABORT,'invalid folder classroom') WHERE NOT EXISTS(SELECT 1 FROM classrooms WHERE id=NEW.classroom_id AND group_id=NEW.group_id AND archived=0);
 SELECT RAISE(ABORT,'invalid folder parent') WHERE NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM classroom_folders WHERE id=NEW.parent_id AND group_id=NEW.group_id AND classroom_id=NEW.classroom_id);
END;
CREATE TRIGGER folder_parent_update BEFORE UPDATE ON classroom_folders BEGIN
 SELECT RAISE(ABORT,'folder classroom cannot change') WHERE NEW.classroom_id<>OLD.classroom_id OR NEW.group_id<>OLD.group_id;
 SELECT RAISE(ABORT,'invalid folder parent') WHERE NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM classroom_folders WHERE id=NEW.parent_id AND group_id=NEW.group_id AND classroom_id=NEW.classroom_id);
 SELECT RAISE(ABORT,'folder cycle') WHERE NEW.parent_id IN (WITH RECURSIVE subtree(id) AS (SELECT OLD.id UNION ALL SELECT f.id FROM classroom_folders f JOIN subtree s ON f.parent_id=s.id) SELECT id FROM subtree);
END;
CREATE TRIGGER material_folder_insert BEFORE INSERT ON teaching_materials WHEN NEW.folder_id IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'invalid content folder') WHERE NOT EXISTS(SELECT 1 FROM classroom_folders WHERE id=NEW.folder_id AND classroom_id=NEW.classroom_id AND group_id=NEW.group_id);
END;
CREATE TRIGGER material_folder_update BEFORE UPDATE OF folder_id,classroom_id,group_id ON teaching_materials WHEN NEW.folder_id IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'invalid content folder') WHERE NOT EXISTS(SELECT 1 FROM classroom_folders WHERE id=NEW.folder_id AND classroom_id=NEW.classroom_id AND group_id=NEW.group_id);
END;
CREATE TRIGGER homework_folder_insert BEFORE INSERT ON homework WHEN NEW.folder_id IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'invalid content folder') WHERE NOT EXISTS(SELECT 1 FROM classroom_folders WHERE id=NEW.folder_id AND classroom_id=NEW.classroom_id AND group_id=NEW.group_id);
END;
CREATE TRIGGER homework_folder_update BEFORE UPDATE OF folder_id,classroom_id,group_id ON homework WHEN NEW.folder_id IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'invalid content folder') WHERE NOT EXISTS(SELECT 1 FROM classroom_folders WHERE id=NEW.folder_id AND classroom_id=NEW.classroom_id AND group_id=NEW.group_id);
END;
CREATE TRIGGER folders_insert_revision AFTER INSERT ON classroom_folders BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=NEW.classroom_id; END;
CREATE TRIGGER folders_update_revision AFTER UPDATE ON classroom_folders BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=NEW.classroom_id; END;
CREATE TRIGGER folders_delete_revision AFTER DELETE ON classroom_folders BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=OLD.classroom_id; END;
CREATE TRIGGER material_insert_revision AFTER INSERT ON teaching_materials BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=NEW.classroom_id; END;
CREATE TRIGGER material_update_revision AFTER UPDATE ON teaching_materials BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id IN (OLD.classroom_id,NEW.classroom_id); END;
CREATE TRIGGER material_delete_revision AFTER DELETE ON teaching_materials BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=OLD.classroom_id; END;
CREATE TRIGGER homework_insert_revision AFTER INSERT ON homework BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=NEW.classroom_id; END;
CREATE TRIGGER homework_update_revision AFTER UPDATE ON homework BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id IN (OLD.classroom_id,NEW.classroom_id); END;
CREATE TRIGGER homework_delete_revision AFTER DELETE ON homework BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=OLD.classroom_id; END;
CREATE TRIGGER submission_insert_revision AFTER INSERT ON homework_submissions BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=(SELECT classroom_id FROM homework WHERE id=NEW.homework_id); END;
CREATE TRIGGER submission_delete_revision AFTER DELETE ON homework_submissions BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=(SELECT classroom_id FROM homework WHERE id=OLD.homework_id); END;
CREATE TRIGGER score_update_revision AFTER UPDATE ON homework_recipients BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=(SELECT classroom_id FROM homework WHERE id=NEW.homework_id); END;
CREATE TRIGGER classroom_update_revision AFTER UPDATE ON classrooms BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=NEW.id; END;
CREATE TRIGGER member_insert_revision AFTER INSERT ON classroom_members BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=NEW.classroom_id; END;
CREATE TRIGGER member_delete_revision AFTER DELETE ON classroom_members BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=OLD.classroom_id; END;
