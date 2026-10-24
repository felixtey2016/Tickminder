-- Catalog metadata shares the existing PDF entity store. File identities are
-- immutable; each classroom placement also pins the exact PDF version.
CREATE TABLE resource_catalog (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES tuition_groups(id), owner_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('link','file')), link_url TEXT, file_id TEXT REFERENCES pdf_files(id) ON DELETE RESTRICT,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200), description TEXT NOT NULL DEFAULT '',
 syllabus_id TEXT NOT NULL, syllabus_name TEXT NOT NULL, subject_id TEXT, subject_name TEXT NOT NULL DEFAULT '',
 year INTEGER CHECK(year IS NULL OR year BETWEEN 1900 AND 2100), paper_code TEXT NOT NULL DEFAULT '', chapter TEXT NOT NULL DEFAULT '',
 resource_type TEXT NOT NULL CHECK(resource_type IN('directory','past_year','worksheet','original','reference')),
 source_name TEXT NOT NULL, source_url TEXT NOT NULL, license_type TEXT NOT NULL CHECK(license_type IN('official_link','permission','original')),
 authorization_note TEXT NOT NULL, public_status TEXT NOT NULL DEFAULT 'private' CHECK(public_status IN('private','pending','approved','rejected')),
 public_requested_at TEXT, approved_by TEXT, approved_at TEXT, moderation_note TEXT NOT NULL DEFAULT '',
 link_status TEXT NOT NULL DEFAULT 'active' CHECK(link_status IN('active','reported','invalid')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK(kind='link' AND link_url IS NOT NULL AND file_id IS NULL OR kind='file' AND link_url IS NULL AND file_id IS NOT NULL AND public_status='private'),
 UNIQUE(group_id,id)
);
CREATE INDEX resource_catalog_filters ON resource_catalog(group_id,active,syllabus_id,subject_id,year,resource_type,updated_at,id);
CREATE INDEX resource_catalog_public ON resource_catalog(public_status,active,updated_at,id);
CREATE TABLE resource_assignments (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES tuition_groups(id), resource_id TEXT NOT NULL REFERENCES resource_catalog(id) ON DELETE RESTRICT,
 classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE, folder_id TEXT REFERENCES classroom_folders(id) ON DELETE CASCADE,
 file_id TEXT REFERENCES pdf_files(id) ON DELETE RESTRICT, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)), revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 assigned_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(group_id,resource_id,classroom_id)
);
CREATE INDEX resource_assignments_folder ON resource_assignments(group_id,classroom_id,folder_id,active,id);
CREATE INDEX resource_assignments_resource ON resource_assignments(resource_id,active);
CREATE INDEX resource_catalog_file ON resource_catalog(file_id);
CREATE INDEX resource_assignments_file ON resource_assignments(file_id);
CREATE TABLE resource_reports (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES tuition_groups(id), resource_id TEXT NOT NULL REFERENCES resource_catalog(id) ON DELETE RESTRICT,
 assignment_id TEXT REFERENCES resource_assignments(id) ON DELETE SET NULL, reporter_id TEXT NOT NULL, reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved')), created_at TEXT NOT NULL, resolved_at TEXT, resolved_by TEXT
);
CREATE INDEX resource_reports_source ON resource_reports(resource_id,status,created_at,id);
CREATE UNIQUE INDEX resource_reports_open ON resource_reports(resource_id,reporter_id) WHERE status='open';
CREATE TABLE resource_operations (
 operation_id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES tuition_groups(id), actor_id TEXT NOT NULL,
 action TEXT NOT NULL, request_hash TEXT NOT NULL, result_json TEXT NOT NULL CHECK(json_valid(result_json)), created_at TEXT NOT NULL
);
CREATE TRIGGER resource_file_group BEFORE INSERT ON resource_catalog WHEN NEW.kind='file' BEGIN
 SELECT RAISE(ABORT,'resource_file_group') WHERE NOT EXISTS(SELECT 1 FROM pdf_files f WHERE f.id=NEW.file_id AND f.group_id=NEW.group_id);
END;
CREATE TRIGGER resource_identity_immutable BEFORE UPDATE OF id,group_id,owner_id,kind,file_id ON resource_catalog
 WHEN NEW.id IS NOT OLD.id OR NEW.group_id IS NOT OLD.group_id OR NEW.owner_id IS NOT OLD.owner_id OR NEW.kind IS NOT OLD.kind OR NEW.file_id IS NOT OLD.file_id
 BEGIN SELECT RAISE(ABORT,'resource_identity_immutable'); END;
CREATE TRIGGER resource_assignment_insert BEFORE INSERT ON resource_assignments BEGIN
 SELECT RAISE(ABORT,'resource_assignment_invalid') WHERE NOT EXISTS(SELECT 1 FROM resource_catalog r JOIN classrooms c ON c.id=NEW.classroom_id AND c.group_id=NEW.group_id AND c.archived=0 WHERE r.id=NEW.resource_id AND r.active=1 AND r.link_status<>'invalid' AND (r.group_id=NEW.group_id OR r.kind='link' AND r.public_status='approved') AND NEW.file_id IS r.file_id);
 SELECT RAISE(ABORT,'resource_folder_invalid') WHERE NEW.folder_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM classroom_folders f WHERE f.id=NEW.folder_id AND f.group_id=NEW.group_id AND f.classroom_id=NEW.classroom_id);
END;
CREATE TRIGGER resource_assignment_update BEFORE UPDATE ON resource_assignments BEGIN
 SELECT RAISE(ABORT,'resource_assignment_immutable') WHERE NEW.id IS NOT OLD.id OR NEW.group_id IS NOT OLD.group_id OR NEW.resource_id IS NOT OLD.resource_id OR NEW.classroom_id IS NOT OLD.classroom_id OR NEW.file_id IS NOT OLD.file_id;
 SELECT RAISE(ABORT,'resource_assignment_invalid') WHERE NEW.active=1 AND NOT EXISTS(SELECT 1 FROM resource_catalog r JOIN classrooms c ON c.id=NEW.classroom_id AND c.group_id=NEW.group_id AND c.archived=0 WHERE r.id=NEW.resource_id AND r.active=1 AND r.link_status<>'invalid' AND (r.group_id=NEW.group_id OR r.kind='link' AND r.public_status='approved') AND NEW.file_id IS r.file_id);
 SELECT RAISE(ABORT,'resource_folder_invalid') WHERE NEW.folder_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM classroom_folders f WHERE f.id=NEW.folder_id AND f.group_id=NEW.group_id AND f.classroom_id=NEW.classroom_id);
END;
CREATE TRIGGER resource_assignment_revision_insert AFTER INSERT ON resource_assignments BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=NEW.classroom_id AND group_id=NEW.group_id; END;
CREATE TRIGGER resource_assignment_revision_update AFTER UPDATE ON resource_assignments BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=NEW.classroom_id AND group_id=NEW.group_id; END;
CREATE TRIGGER resource_assignment_revision_delete AFTER DELETE ON resource_assignments BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id=OLD.classroom_id AND group_id=OLD.group_id; END;
CREATE TRIGGER resource_catalog_folder_revision AFTER UPDATE ON resource_catalog BEGIN UPDATE classroom_content_state SET revision=revision+1 WHERE classroom_id IN(SELECT classroom_id FROM resource_assignments WHERE resource_id=NEW.id); END;
