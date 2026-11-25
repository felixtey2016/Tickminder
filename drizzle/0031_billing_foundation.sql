-- Additive financial identities: existing student names, plan keys and lesson IDs stay intact.
CREATE TABLE billing_students (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES tuition_groups(id), student_name TEXT NOT NULL,
 created_at TEXT NOT NULL, UNIQUE(group_id,student_name), UNIQUE(group_id,id),
 FOREIGN KEY(group_id,student_name) REFERENCES students(group_id,name) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE TABLE billing_subjects (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, student_id TEXT NOT NULL, subject_key TEXT NOT NULL,
 subject TEXT NOT NULL, subject_id TEXT, syllabus_id TEXT, created_at TEXT NOT NULL,
 UNIQUE(group_id,student_id,subject_key),
 FOREIGN KEY(group_id,student_id) REFERENCES billing_students(group_id,id) ON DELETE CASCADE
);
CREATE TABLE billing_policies (
 group_id TEXT PRIMARY KEY REFERENCES tuition_groups(id), revision INTEGER NOT NULL DEFAULT 0,
 current_version_id TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE billing_policy_versions (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES billing_policies(group_id), revision INTEGER NOT NULL CHECK(revision>0),
 currency TEXT NOT NULL CHECK(currency='MYR'), hour_rounding TEXT NOT NULL CHECK(hour_rounding IN ('minute','quarter_up')),
 attendance_basis TEXT NOT NULL CHECK(attendance_basis IN ('personal','teaching')),
 monthly_partial TEXT NOT NULL CHECK(monthly_partial IN ('manual','daily')), effective_from TEXT NOT NULL,
 actor_id TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(group_id,revision), UNIQUE(group_id,effective_from)
);
CREATE TABLE billing_rates (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, student_id TEXT NOT NULL, subject_key TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0, current_version_id TEXT, updated_at TEXT NOT NULL,
 UNIQUE(group_id,student_id,subject_key), UNIQUE(group_id,id),
 FOREIGN KEY(group_id,student_id,subject_key) REFERENCES billing_subjects(group_id,student_id,subject_key) ON DELETE RESTRICT
);
CREATE TABLE billing_rate_versions (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, rate_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
 mode TEXT NOT NULL CHECK(mode IN ('hour','lesson','month')),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0 AND amount_cents<=100000000), currency TEXT NOT NULL CHECK(currency='MYR'),
 effective_from TEXT NOT NULL, subject_snapshot TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(group_id,rate_id) REFERENCES billing_rates(group_id,id) ON DELETE RESTRICT,
 UNIQUE(rate_id,revision), UNIQUE(rate_id,effective_from)
);
CREATE INDEX billing_rate_date_idx ON billing_rate_versions(group_id,rate_id,effective_from);
CREATE TABLE billing_operations (
 group_id TEXT NOT NULL REFERENCES tuition_groups(id), operation_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 action TEXT NOT NULL, request_hash TEXT NOT NULL, result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 created_at TEXT NOT NULL, PRIMARY KEY(group_id,operation_id)
);
CREATE TABLE billing_adjustments (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, student_id TEXT NOT NULL, month TEXT NOT NULL,
 line_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0), amount_cents INTEGER CHECK(amount_cents>=0 AND amount_cents<=100000000),
 basis_hash TEXT NOT NULL, reason TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(group_id,line_id,revision),
 FOREIGN KEY(group_id,student_id) REFERENCES billing_students(group_id,id) ON DELETE RESTRICT
);
CREATE INDEX billing_adjustment_month_idx ON billing_adjustments(group_id,student_id,month,line_id,revision);
INSERT INTO billing_students(id,group_id,student_name,created_at)
 SELECT lower(hex(randomblob(16))),group_id,name,created_at FROM students;
INSERT INTO billing_subjects(id,group_id,student_id,subject_key,subject,subject_id,syllabus_id,created_at)
 SELECT lower(hex(randomblob(16))),p.group_id,b.id,CASE WHEN p.subject_id IS NOT NULL THEN 'id:'||s.syllabus_id||':'||p.subject_id ELSE 'label:'||lower(trim(p.subject)) END,
 min(p.subject),p.subject_id,s.syllabus_id,min(p.created_at)
 FROM plans p JOIN billing_students b ON b.group_id=p.group_id AND b.student_name=p.student
 JOIN students s ON s.group_id=p.group_id AND s.name=p.student
 GROUP BY p.group_id,b.id,CASE WHEN p.subject_id IS NOT NULL THEN 'id:'||s.syllabus_id||':'||p.subject_id ELSE 'label:'||lower(trim(p.subject)) END;
CREATE TRIGGER billing_student_identity_insert AFTER INSERT ON students BEGIN
 INSERT OR IGNORE INTO billing_students(id,group_id,student_name,created_at) VALUES(lower(hex(randomblob(16))),NEW.group_id,NEW.name,NEW.created_at);
END;
CREATE TRIGGER billing_subject_identity_insert AFTER INSERT ON plans BEGIN
 INSERT OR IGNORE INTO billing_subjects(id,group_id,student_id,subject_key,subject,subject_id,syllabus_id,created_at)
 SELECT lower(hex(randomblob(16))),NEW.group_id,b.id,CASE WHEN NEW.subject_id IS NOT NULL THEN 'id:'||s.syllabus_id||':'||NEW.subject_id ELSE 'label:'||lower(trim(NEW.subject)) END,
 NEW.subject,NEW.subject_id,s.syllabus_id,NEW.created_at FROM billing_students b JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name
 WHERE b.group_id=NEW.group_id AND b.student_name=NEW.student;
END;
CREATE TRIGGER billing_subject_identity_update AFTER UPDATE OF student,subject,subject_id ON plans BEGIN
 INSERT OR IGNORE INTO billing_subjects(id,group_id,student_id,subject_key,subject,subject_id,syllabus_id,created_at)
 SELECT lower(hex(randomblob(16))),NEW.group_id,b.id,CASE WHEN NEW.subject_id IS NOT NULL THEN 'id:'||s.syllabus_id||':'||NEW.subject_id ELSE 'label:'||lower(trim(NEW.subject)) END,
 NEW.subject,NEW.subject_id,s.syllabus_id,NEW.created_at FROM billing_students b JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name
 WHERE b.group_id=NEW.group_id AND b.student_name=NEW.student;
END;
-- Historical rates make deletion fail rather than silently reattaching fees to a recreated name.
CREATE TRIGGER billing_student_history_delete BEFORE DELETE ON students WHEN EXISTS(
 SELECT 1 FROM billing_students b JOIN billing_rates r ON r.group_id=b.group_id AND r.student_id=b.id JOIN billing_rate_versions v ON v.group_id=r.group_id AND v.rate_id=r.id
 WHERE b.group_id=OLD.group_id AND b.student_name=OLD.name
) OR EXISTS(SELECT 1 FROM billing_students b JOIN billing_adjustments a ON a.group_id=b.group_id AND a.student_id=b.id WHERE b.group_id=OLD.group_id AND b.student_name=OLD.name)
 BEGIN SELECT RAISE(ABORT,'Student has financial history; deactivate instead'); END;
CREATE TRIGGER billing_plan_history_delete BEFORE DELETE ON plans WHEN EXISTS(
 SELECT 1 FROM students s JOIN billing_students b ON b.group_id=s.group_id AND b.student_name=s.name
 JOIN billing_subjects bs ON bs.group_id=b.group_id AND bs.student_id=b.id AND bs.subject_key=CASE WHEN OLD.subject_id IS NOT NULL THEN 'id:'||s.syllabus_id||':'||OLD.subject_id ELSE 'label:'||lower(trim(OLD.subject)) END
 WHERE s.group_id=OLD.group_id AND s.name=OLD.student AND (
 EXISTS(SELECT 1 FROM billing_rates r JOIN billing_rate_versions v ON v.group_id=r.group_id AND v.rate_id=r.id WHERE r.group_id=b.group_id AND r.student_id=b.id AND r.subject_key=bs.subject_key)
 OR EXISTS(SELECT 1 FROM billing_adjustments a WHERE a.group_id=b.group_id AND a.student_id=b.id AND (
 substr(a.line_id,1,length('monthly:'||b.id||':'||bs.subject_key||':'))='monthly:'||b.id||':'||bs.subject_key||':'
 OR EXISTS(SELECT 1 FROM lessons l WHERE l.group_id=OLD.group_id AND l.student=OLD.student AND a.line_id='lesson:'||l.id AND lower(trim(l.subject))=lower(trim(OLD.subject))))))
) BEGIN SELECT RAISE(ABORT,'Plan has financial history; deactivate instead'); END;
CREATE TRIGGER billing_student_syllabus_identity_update AFTER UPDATE OF syllabus_id ON students WHEN NEW.syllabus_id<>OLD.syllabus_id BEGIN
 INSERT OR IGNORE INTO billing_subjects(id,group_id,student_id,subject_key,subject,subject_id,syllabus_id,created_at)
 SELECT lower(hex(randomblob(16))),NEW.group_id,b.id,'id:'||NEW.syllabus_id||':'||p.subject_id,p.subject,p.subject_id,NEW.syllabus_id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
 FROM plans p JOIN billing_students b ON b.group_id=p.group_id AND b.student_name=p.student WHERE p.group_id=NEW.group_id AND p.student=NEW.name AND p.subject_id IS NOT NULL;
END;
