-- Classroom teacher remuneration; legacy defaults are frozen only for existing associations.
ALTER TABLE payroll_rate_versions ADD COLUMN mode TEXT NOT NULL DEFAULT 'hour' CHECK(mode IN('hour','lesson','month'));
CREATE TABLE payroll_legacy_rate_links (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL,teacher_id TEXT NOT NULL,classroom_id TEXT,session_id TEXT,
 scope_id TEXT NOT NULL,max_revision INTEGER NOT NULL CHECK(max_revision>0),created_at TEXT NOT NULL,
 UNIQUE(group_id,id),
 FOREIGN KEY(group_id,teacher_id) REFERENCES payroll_teachers(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,classroom_id) REFERENCES classrooms(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(session_id) REFERENCES class_sessions(id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,scope_id) REFERENCES payroll_rate_scopes(group_id,id) ON DELETE RESTRICT,
 CHECK((classroom_id IS NOT NULL AND session_id IS NULL) OR (classroom_id IS NULL AND session_id IS NOT NULL))
);
CREATE UNIQUE INDEX payroll_legacy_class_once ON payroll_legacy_rate_links(group_id,teacher_id,classroom_id) WHERE classroom_id IS NOT NULL;
CREATE UNIQUE INDEX payroll_legacy_session_once ON payroll_legacy_rate_links(group_id,teacher_id,session_id) WHERE session_id IS NOT NULL;
INSERT INTO payroll_legacy_rate_links(id,group_id,teacher_id,classroom_id,session_id,scope_id,max_revision,created_at)
 SELECT lower(hex(randomblob(16))),s.group_id,s.teacher_id,c.id,NULL,s.id,s.revision,s.updated_at
 FROM payroll_rate_scopes s JOIN payroll_teachers t ON t.group_id=s.group_id AND t.id=s.teacher_id
 JOIN classrooms c ON c.group_id=s.group_id AND (c.teacher_name=t.teacher_name OR EXISTS(SELECT 1 FROM class_sessions x WHERE x.group_id=c.group_id AND x.classroom_id=c.id AND x.teacher_name=t.teacher_name))
 WHERE s.classroom_id IS NULL AND s.revision>0;
INSERT INTO payroll_legacy_rate_links(id,group_id,teacher_id,classroom_id,session_id,scope_id,max_revision,created_at)
 SELECT lower(hex(randomblob(16))),s.group_id,s.teacher_id,NULL,x.id,s.id,s.revision,s.updated_at
 FROM payroll_rate_scopes s JOIN payroll_teachers t ON t.group_id=s.group_id AND t.id=s.teacher_id
 JOIN class_sessions x ON x.group_id=s.group_id AND x.classroom_id IS NULL AND x.teacher_name=t.teacher_name
 WHERE s.classroom_id IS NULL AND s.revision>0;
CREATE TRIGGER payroll_legacy_link_guard BEFORE INSERT ON payroll_legacy_rate_links BEGIN
 SELECT RAISE(ABORT,'payroll_invalid_legacy') WHERE NOT EXISTS(SELECT 1 FROM payroll_rate_scopes s WHERE s.group_id=NEW.group_id AND s.id=NEW.scope_id AND s.teacher_id=NEW.teacher_id AND s.classroom_id IS NULL AND s.revision>=NEW.max_revision)
 OR (NEW.session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM class_sessions x JOIN payroll_teachers t ON t.group_id=x.group_id AND t.teacher_name=x.teacher_name WHERE x.group_id=NEW.group_id AND x.id=NEW.session_id AND t.id=NEW.teacher_id AND x.classroom_id IS NULL));
END;
CREATE TRIGGER payroll_legacy_links_update BEFORE UPDATE ON payroll_legacy_rate_links BEGIN SELECT RAISE(ABORT,'payroll_immutable'); END;
CREATE TRIGGER payroll_legacy_links_delete BEFORE DELETE ON payroll_legacy_rate_links BEGIN SELECT RAISE(ABORT,'payroll_immutable'); END;
CREATE TABLE payroll_monthly_reviews (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL,teacher_id TEXT NOT NULL,classroom_id TEXT NOT NULL,month TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0),amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 0 AND 100000000),
 reason TEXT NOT NULL CHECK(length(trim(reason))>0),basis_hash TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,operation_id TEXT NOT NULL,
 UNIQUE(group_id,id),UNIQUE(group_id,teacher_id,classroom_id,month,revision),
 FOREIGN KEY(group_id,teacher_id) REFERENCES payroll_teachers(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,classroom_id) REFERENCES classrooms(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,operation_id) REFERENCES payroll_operations(group_id,operation_id) ON DELETE RESTRICT
);
CREATE TRIGGER payroll_month_review_guard BEFORE INSERT ON payroll_monthly_reviews BEGIN
 SELECT RAISE(ABORT,'payroll_month_review_changed') WHERE NEW.revision<>coalesce((SELECT max(r.revision) FROM payroll_monthly_reviews r WHERE r.group_id=NEW.group_id AND r.teacher_id=NEW.teacher_id AND r.classroom_id=NEW.classroom_id AND r.month=NEW.month),0)+1;
END;
CREATE TRIGGER payroll_month_reviews_update BEFORE UPDATE ON payroll_monthly_reviews BEGIN SELECT RAISE(ABORT,'payroll_immutable'); END;
CREATE TRIGGER payroll_month_reviews_delete BEFORE DELETE ON payroll_monthly_reviews BEGIN SELECT RAISE(ABORT,'payroll_immutable'); END;
CREATE TABLE payroll_deleted_drafts (
 group_id TEXT NOT NULL,payroll_id TEXT NOT NULL,teacher_id TEXT NOT NULL,month TEXT NOT NULL,revision INTEGER NOT NULL,
 run_snapshot_json TEXT NOT NULL CHECK(json_valid(run_snapshot_json)),deleted_by TEXT NOT NULL,deleted_at TEXT NOT NULL,operation_id TEXT NOT NULL,
 PRIMARY KEY(group_id,payroll_id),UNIQUE(group_id,operation_id),
 FOREIGN KEY(group_id,teacher_id) REFERENCES payroll_teachers(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,operation_id) REFERENCES payroll_operations(group_id,operation_id) ON DELETE RESTRICT
);
CREATE TRIGGER payroll_deleted_draft_guard BEFORE INSERT ON payroll_deleted_drafts BEGIN
 SELECT RAISE(ABORT,'payroll_invalid_draft_delete') WHERE NOT EXISTS(SELECT 1 FROM payroll_runs r WHERE r.group_id=NEW.group_id AND r.id=NEW.payroll_id AND r.teacher_id=NEW.teacher_id AND r.month=NEW.month AND r.revision=NEW.revision AND r.status='draft' AND r.bonus_cents=0 AND r.deduction_cents=0 AND r.paid_cents=0 AND r.reversed_cents=0 AND json_extract(NEW.run_snapshot_json,'$.id')=r.id AND json_extract(NEW.run_snapshot_json,'$.document_json')=r.document_json AND json_extract(NEW.run_snapshot_json,'$.source_hash')=r.source_hash AND json_extract(NEW.run_snapshot_json,'$.base_total_cents')=r.base_total_cents AND NOT EXISTS(SELECT 1 FROM payroll_events e WHERE e.group_id=r.group_id AND e.payroll_id=r.id))
 OR NOT EXISTS(SELECT 1 FROM payroll_operations o WHERE o.group_id=NEW.group_id AND o.operation_id=NEW.operation_id AND o.actor_id=NEW.deleted_by AND o.action='deleteDraft');
END;
DROP TRIGGER payroll_runs_delete;
CREATE TRIGGER payroll_runs_delete BEFORE DELETE ON payroll_runs WHEN OLD.status<>'draft' OR EXISTS(SELECT 1 FROM payroll_events e WHERE e.group_id=OLD.group_id AND e.payroll_id=OLD.id) OR NOT EXISTS(SELECT 1 FROM payroll_deleted_drafts d WHERE d.group_id=OLD.group_id AND d.payroll_id=OLD.id AND d.teacher_id=OLD.teacher_id AND d.month=OLD.month AND d.revision=OLD.revision AND json_extract(d.run_snapshot_json,'$.document_json')=OLD.document_json AND json_extract(d.run_snapshot_json,'$.source_hash')=OLD.source_hash)
 BEGIN SELECT RAISE(ABORT,'payroll_immutable'); END;
CREATE TRIGGER payroll_deleted_drafts_update BEFORE UPDATE ON payroll_deleted_drafts BEGIN SELECT RAISE(ABORT,'payroll_immutable'); END;
CREATE TRIGGER payroll_deleted_drafts_delete BEFORE DELETE ON payroll_deleted_drafts BEGIN SELECT RAISE(ABORT,'payroll_immutable'); END;

