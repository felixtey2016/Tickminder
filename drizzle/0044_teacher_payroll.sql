-- Teacher remuneration is independent of student fees and invoice receipts.
CREATE UNIQUE INDEX payroll_classroom_group_identity ON classrooms(group_id,id);
CREATE TABLE payroll_teachers (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, teacher_name TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(group_id,id), UNIQUE(group_id,teacher_name),
 FOREIGN KEY(group_id,teacher_name) REFERENCES teachers(group_id,name) ON DELETE RESTRICT
);
CREATE TABLE payroll_rate_scopes (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL,teacher_id TEXT NOT NULL,classroom_id TEXT,scope_key TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),updated_at TEXT NOT NULL,
 UNIQUE(group_id,id),UNIQUE(group_id,teacher_id,scope_key),
 FOREIGN KEY(group_id,teacher_id) REFERENCES payroll_teachers(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,classroom_id) REFERENCES classrooms(group_id,id) ON DELETE RESTRICT,
 CHECK(scope_key=coalesce(classroom_id,''))
);
CREATE TABLE payroll_rate_versions (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL,scope_id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),
 amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000),currency TEXT NOT NULL CHECK(currency='MYR'),
 effective_from TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,operation_id TEXT NOT NULL,
 UNIQUE(group_id,id),UNIQUE(group_id,scope_id,revision),
 FOREIGN KEY(group_id,scope_id) REFERENCES payroll_rate_scopes(group_id,id) ON DELETE RESTRICT
);
CREATE INDEX payroll_rates_effective ON payroll_rate_versions(group_id,scope_id,effective_from,revision);
CREATE TABLE payroll_runs (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL,teacher_id TEXT NOT NULL,month TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('draft','confirmed')),revision INTEGER NOT NULL CHECK(revision>0),
 document_json TEXT NOT NULL CHECK(json_valid(document_json)),source_hash TEXT NOT NULL,
 base_total_cents INTEGER NOT NULL CHECK(base_total_cents BETWEEN 0 AND 100000000),
 bonus_cents INTEGER NOT NULL DEFAULT 0 CHECK(bonus_cents>=0),deduction_cents INTEGER NOT NULL DEFAULT 0 CHECK(deduction_cents>=0),
 paid_cents INTEGER NOT NULL DEFAULT 0 CHECK(paid_cents>=0),reversed_cents INTEGER NOT NULL DEFAULT 0 CHECK(reversed_cents>=0),
 created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,confirmed_by TEXT,confirmed_at TEXT,
 UNIQUE(group_id,id),UNIQUE(group_id,teacher_id,month),
 FOREIGN KEY(group_id,teacher_id) REFERENCES payroll_teachers(group_id,id) ON DELETE RESTRICT,
 CHECK(base_total_cents+bonus_cents-deduction_cents BETWEEN 0 AND 100000000),
 CHECK(paid_cents-reversed_cents BETWEEN 0 AND base_total_cents+bonus_cents-deduction_cents),
 CHECK(status='draft' AND confirmed_at IS NULL OR status='confirmed' AND confirmed_at IS NOT NULL)
);
CREATE INDEX payroll_runs_month ON payroll_runs(group_id,month,teacher_id);
CREATE TABLE payroll_operations (
 group_id TEXT NOT NULL REFERENCES tuition_groups(id),operation_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,
 request_hash TEXT NOT NULL,execution_id TEXT NOT NULL,result_json TEXT NOT NULL CHECK(json_valid(result_json)),created_at TEXT NOT NULL,
 PRIMARY KEY(group_id,operation_id)
);
CREATE TABLE payroll_events (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL,payroll_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('bonus','deduction','payment','reverse')),
 amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000),payment_id TEXT,
 occurred_at TEXT NOT NULL,method TEXT NOT NULL DEFAULT '' CHECK(method IN('','cash','bank_transfer','duitnow','tng','other')),
 reference TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',reason TEXT NOT NULL DEFAULT '',actor_id TEXT NOT NULL,
 created_at TEXT NOT NULL,operation_id TEXT NOT NULL,expected_revision INTEGER NOT NULL CHECK(expected_revision>0),
 UNIQUE(group_id,id),UNIQUE(group_id,payroll_id,expected_revision),
 FOREIGN KEY(group_id,payroll_id) REFERENCES payroll_runs(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,operation_id) REFERENCES payroll_operations(group_id,operation_id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,payment_id) REFERENCES payroll_events(group_id,id) ON DELETE RESTRICT,
 CHECK(kind='reverse' AND payment_id IS NOT NULL OR kind<>'reverse' AND payment_id IS NULL),
 CHECK(kind='payment' OR length(trim(reason))>0),
 CHECK(kind IN('payment','reverse') AND method<>'' OR kind IN('bonus','deduction') AND method='')
);
CREATE INDEX payroll_events_period ON payroll_events(group_id,occurred_at,kind);
CREATE INDEX payroll_events_run ON payroll_events(group_id,payroll_id,expected_revision);
CREATE UNIQUE INDEX payroll_reverse_once ON payroll_events(group_id,payment_id) WHERE kind='reverse';
CREATE TRIGGER payroll_event_guard BEFORE INSERT ON payroll_events BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM payroll_runs r WHERE r.group_id=NEW.group_id AND r.id=NEW.payroll_id AND r.status='confirmed' AND r.revision=NEW.expected_revision) THEN RAISE(ABORT,'payroll_changed') END;
 SELECT CASE WHEN NEW.kind='payment' AND NOT EXISTS(SELECT 1 FROM payroll_runs r WHERE r.group_id=NEW.group_id AND r.id=NEW.payroll_id AND NEW.amount_cents<=r.base_total_cents+r.bonus_cents-r.deduction_cents-r.paid_cents+r.reversed_cents) THEN RAISE(ABORT,'payroll_overpayment') END;
 SELECT CASE WHEN NEW.kind='deduction' AND NOT EXISTS(SELECT 1 FROM payroll_runs r WHERE r.group_id=NEW.group_id AND r.id=NEW.payroll_id AND NEW.amount_cents<=r.base_total_cents+r.bonus_cents-r.deduction_cents-r.paid_cents+r.reversed_cents) THEN RAISE(ABORT,'payroll_invalid_deduction') END;
 SELECT CASE WHEN NEW.kind='bonus' AND NOT EXISTS(SELECT 1 FROM payroll_runs r WHERE r.group_id=NEW.group_id AND r.id=NEW.payroll_id AND r.base_total_cents+r.bonus_cents-r.deduction_cents+NEW.amount_cents<=100000000) THEN RAISE(ABORT,'payroll_invalid_bonus') END;
 SELECT CASE WHEN NEW.kind='reverse' AND NOT EXISTS(SELECT 1 FROM payroll_events e WHERE e.group_id=NEW.group_id AND e.id=NEW.payment_id AND e.payroll_id=NEW.payroll_id AND e.kind='payment' AND e.amount_cents=NEW.amount_cents AND e.method=NEW.method AND julianday(NEW.occurred_at)>=julianday(e.occurred_at) AND NOT EXISTS(SELECT 1 FROM payroll_events x WHERE x.group_id=e.group_id AND x.payment_id=e.id AND x.kind='reverse')) THEN RAISE(ABORT,'payroll_invalid_reverse') END;
END;
CREATE TRIGGER payroll_event_apply AFTER INSERT ON payroll_events BEGIN
 UPDATE payroll_runs SET bonus_cents=bonus_cents+CASE WHEN NEW.kind='bonus' THEN NEW.amount_cents ELSE 0 END,
 deduction_cents=deduction_cents+CASE WHEN NEW.kind='deduction' THEN NEW.amount_cents ELSE 0 END,
 paid_cents=paid_cents+CASE WHEN NEW.kind='payment' THEN NEW.amount_cents ELSE 0 END,
 reversed_cents=reversed_cents+CASE WHEN NEW.kind='reverse' THEN NEW.amount_cents ELSE 0 END,
 revision=revision+1,updated_at=NEW.created_at WHERE group_id=NEW.group_id AND id=NEW.payroll_id;
END;
CREATE TRIGGER payroll_confirmed_snapshot BEFORE UPDATE ON payroll_runs WHEN OLD.status='confirmed' AND (
 OLD.id IS NOT NEW.id OR OLD.group_id IS NOT NEW.group_id OR OLD.teacher_id IS NOT NEW.teacher_id OR OLD.month IS NOT NEW.month OR OLD.status IS NOT NEW.status OR OLD.document_json IS NOT NEW.document_json OR OLD.source_hash IS NOT NEW.source_hash OR OLD.base_total_cents IS NOT NEW.base_total_cents OR OLD.created_by IS NOT NEW.created_by OR OLD.created_at IS NOT NEW.created_at OR OLD.confirmed_by IS NOT NEW.confirmed_by OR OLD.confirmed_at IS NOT NEW.confirmed_at)
 BEGIN SELECT RAISE(ABORT,'payroll_immutable'); END;
-- Cached balances are derived only from append-only events. The confirmed
-- document revision is the baseline; every later event advances it once.
CREATE TRIGGER payroll_run_aggregates BEFORE UPDATE ON payroll_runs WHEN NEW.status='confirmed' AND (
 NEW.revision<>json_extract(NEW.document_json,'$.revision')+(SELECT count(*) FROM payroll_events e WHERE e.group_id=NEW.group_id AND e.payroll_id=NEW.id)
 OR NEW.bonus_cents<>coalesce((SELECT sum(amount_cents) FROM payroll_events e WHERE e.group_id=NEW.group_id AND e.payroll_id=NEW.id AND e.kind='bonus'),0)
 OR NEW.deduction_cents<>coalesce((SELECT sum(amount_cents) FROM payroll_events e WHERE e.group_id=NEW.group_id AND e.payroll_id=NEW.id AND e.kind='deduction'),0)
 OR NEW.paid_cents<>coalesce((SELECT sum(amount_cents) FROM payroll_events e WHERE e.group_id=NEW.group_id AND e.payroll_id=NEW.id AND e.kind='payment'),0)
 OR NEW.reversed_cents<>coalesce((SELECT sum(amount_cents) FROM payroll_events e WHERE e.group_id=NEW.group_id AND e.payroll_id=NEW.id AND e.kind='reverse'),0))
 BEGIN SELECT RAISE(ABORT,'payroll_immutable'); END;
CREATE TRIGGER payroll_runs_delete BEFORE DELETE ON payroll_runs BEGIN SELECT RAISE(ABORT,'payroll_immutable'); END;
CREATE TRIGGER payroll_events_update BEFORE UPDATE ON payroll_events BEGIN SELECT RAISE(ABORT,'payroll_immutable'); END;
CREATE TRIGGER payroll_events_delete BEFORE DELETE ON payroll_events BEGIN SELECT RAISE(ABORT,'payroll_immutable'); END;
CREATE TRIGGER payroll_rates_update BEFORE UPDATE ON payroll_rate_versions BEGIN SELECT RAISE(ABORT,'payroll_immutable'); END;
CREATE TRIGGER payroll_rates_delete BEFORE DELETE ON payroll_rate_versions BEGIN SELECT RAISE(ABORT,'payroll_immutable'); END;
CREATE TRIGGER payroll_operations_update BEFORE UPDATE ON payroll_operations BEGIN SELECT RAISE(ABORT,'payroll_immutable'); END;
CREATE TRIGGER payroll_operations_delete BEFORE DELETE ON payroll_operations BEGIN SELECT RAISE(ABORT,'payroll_immutable'); END;
CREATE TRIGGER payroll_rate_scope_identity BEFORE UPDATE OF id,group_id,teacher_id,classroom_id,scope_key ON payroll_rate_scopes WHEN OLD.id IS NOT NEW.id OR OLD.group_id IS NOT NEW.group_id OR OLD.teacher_id IS NOT NEW.teacher_id OR OLD.classroom_id IS NOT NEW.classroom_id OR OLD.scope_key IS NOT NEW.scope_key BEGIN SELECT RAISE(ABORT,'payroll_immutable'); END;
