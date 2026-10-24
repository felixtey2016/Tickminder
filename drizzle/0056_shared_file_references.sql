-- Additive reference adapters: existing IDs, bytes, quota and history stay put.
-- Native relationships remain the source of truth; no lossy ref backfill.
CREATE TABLE file_extra_references (
 group_id TEXT NOT NULL REFERENCES tuition_groups(id), asset_kind TEXT NOT NULL CHECK(asset_kind IN('pdf','quiz_image','invoice_logo')),
 file_id TEXT NOT NULL, source_kind TEXT NOT NULL CHECK(length(source_kind) BETWEEN 1 AND 64), source_id TEXT NOT NULL CHECK(length(source_id) BETWEEN 1 AND 160), created_at TEXT NOT NULL,
 PRIMARY KEY(group_id,asset_kind,file_id,source_kind,source_id)
);
CREATE INDEX file_extra_references_entity ON file_extra_references(asset_kind,file_id);
CREATE TRIGGER file_extra_reference_insert BEFORE INSERT ON file_extra_references BEGIN
 SELECT RAISE(ABORT,'unsupported retention asset kind') WHERE NEW.asset_kind<>'pdf';
 SELECT RAISE(ABORT,'invalid stored file reference') WHERE
   (NEW.asset_kind='pdf' AND NOT EXISTS(SELECT 1 FROM pdf_files f WHERE f.id=NEW.file_id AND f.group_id=NEW.group_id AND f.status IN('staged','attached')))
   OR (NEW.asset_kind='quiz_image' AND NOT EXISTS(SELECT 1 FROM quiz_images f WHERE f.id=NEW.file_id AND f.group_id=NEW.group_id AND f.status='ready'))
   OR (NEW.asset_kind='invoice_logo' AND NOT EXISTS(SELECT 1 FROM invoice_brand_assets f WHERE f.id=NEW.file_id AND f.group_id=NEW.group_id));
END;
CREATE TRIGGER file_extra_reference_immutable BEFORE UPDATE ON file_extra_references BEGIN SELECT RAISE(ABORT,'immutable stored file reference'); END;
CREATE VIEW stored_file_references AS
 SELECT * FROM (
  SELECT group_id,'pdf' AS asset_kind,file_id,'material' AS source_kind,id AS source_id FROM teaching_materials
  UNION ALL SELECT group_id,'pdf',attachment_file_id,'homework',id FROM homework WHERE attachment_file_id IS NOT NULL
  UNION ALL SELECT group_id,'pdf',file_id,'submission',id FROM homework_submissions
  UNION ALL SELECT group_id,'pdf',file_id,'learning_version',id FROM learning_versions WHERE file_id IS NOT NULL
 )
 UNION ALL SELECT * FROM (
  SELECT group_id,'pdf' AS asset_kind,file_id,'feedback' AS source_kind,id AS source_id FROM homework_feedback WHERE file_id IS NOT NULL
  UNION ALL SELECT group_id,'pdf',file_id,'resource_catalog',id FROM resource_catalog WHERE file_id IS NOT NULL
  UNION ALL SELECT group_id,'pdf',file_id,'resource_assignment',id FROM resource_assignments WHERE file_id IS NOT NULL
  UNION ALL SELECT group_id,asset_kind,file_id,source_kind,source_id FROM file_extra_references
 );

-- Status transitions remain valid. Replacing bytes always creates a new entity.
CREATE TRIGGER pdf_identity_immutable BEFORE UPDATE ON pdf_files WHEN
 NEW.id IS NOT OLD.id OR NEW.group_id IS NOT OLD.group_id OR NEW.object_key IS NOT OLD.object_key
 OR NEW.owner_id IS NOT OLD.owner_id OR NEW.bytes IS NOT OLD.bytes OR NEW.sha256 IS NOT OLD.sha256
 BEGIN SELECT RAISE(ABORT,'immutable PDF entity'); END;
CREATE TRIGGER learning_version_immutable BEFORE UPDATE ON learning_versions BEGIN SELECT RAISE(ABORT,'immutable learning version'); END;
-- Resource references, including revoked placements, must never be attached
-- after a collector has claimed the file for deletion.
CREATE TRIGGER resource_file_ready BEFORE INSERT ON resource_catalog WHEN NEW.kind='file' BEGIN
 SELECT RAISE(ABORT,'resource file unavailable') WHERE NOT EXISTS(SELECT 1 FROM pdf_files f WHERE f.id=NEW.file_id AND f.group_id=NEW.group_id AND f.status='attached');
END;
CREATE TRIGGER pdf_extra_reference_delete BEFORE DELETE ON pdf_files BEGIN
 SELECT RAISE(ABORT,'stored file still referenced') WHERE EXISTS(SELECT 1 FROM file_extra_references r WHERE r.asset_kind='pdf' AND r.file_id=OLD.id);
END;
