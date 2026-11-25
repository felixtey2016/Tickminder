-- Immutable question provenance. Source versions remain available after ordinary
-- sharing withdrawal, so a copied quiz never follows a changing source draft.
CREATE TABLE quiz_question_sources (
 version_id TEXT NOT NULL REFERENCES quiz_versions(id),
 question_id TEXT NOT NULL,
 source_version_id TEXT NOT NULL REFERENCES quiz_versions(id),
 source_question_id TEXT NOT NULL,
 group_id TEXT NOT NULL REFERENCES tuition_groups(id),
 PRIMARY KEY(version_id,question_id)
);
CREATE INDEX quiz_question_source_lookup ON quiz_question_sources(source_version_id,source_question_id);
CREATE INDEX quiz_question_source_group ON quiz_question_sources(group_id,version_id);
CREATE TRIGGER quiz_question_source_guard BEFORE INSERT ON quiz_question_sources
BEGIN
 SELECT RAISE(ABORT,'quiz question source mismatch') WHERE NOT EXISTS(
  SELECT 1 FROM quiz_versions v,json_each(v.content_json,'$.questions') q
  WHERE v.id=NEW.version_id AND v.group_id=NEW.group_id AND json_extract(q.value,'$.id')=NEW.question_id
 ) OR NOT EXISTS(
  SELECT 1 FROM quiz_versions v,json_each(v.content_json,'$.questions') q
  WHERE v.id=NEW.source_version_id AND json_extract(q.value,'$.id')=NEW.source_question_id
 ) OR NEW.version_id=NEW.source_version_id;
END;
