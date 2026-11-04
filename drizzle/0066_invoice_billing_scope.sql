-- Separate monthly tuition invoices from later hourly settlement.

-- Run the entire file atomically with foreign keys enabled. Do not split or

-- retry a partly applied migration. Back up and verify the exact schema first.

-- Existing invoices remain all-scope and their issued JSON is never rewritten.

PRAGMA defer_foreign_keys=ON;

CREATE TABLE "_0066_copy_invoices" AS SELECT * FROM "invoices";

CREATE TABLE "_0066_copy_invoice_finance_accounts" AS SELECT * FROM "invoice_finance_accounts";

CREATE TABLE "_0066_copy_invoice_items" AS SELECT * FROM "invoice_items";

CREATE TABLE "_0066_copy_invoice_source_locks" AS SELECT * FROM "invoice_source_locks";

CREATE TABLE "_0066_copy_invoice_payments" AS SELECT * FROM "invoice_payments";

CREATE TABLE "_0066_copy_prepayment_allocations" AS SELECT * FROM "prepayment_allocations";

CREATE TABLE "_0066_copy_invoice_finance_events" AS SELECT * FROM "invoice_finance_events";

CREATE TABLE "_0066_copy_invoice_receipts" AS SELECT * FROM "invoice_receipts";

CREATE TABLE "_0066_copy_prepayment_events" AS SELECT * FROM "prepayment_events";

CREATE TABLE "_0066_copy_invoice_attendance_corrections" AS SELECT * FROM "invoice_attendance_corrections";

DROP TRIGGER "attendance_legacy_sync";

DROP TRIGGER "class_group_attendance_sync";

DROP TRIGGER "class_one_sync";

DROP TRIGGER "invoice_billing_adjustments_delete";

DROP TRIGGER "invoice_billing_adjustments_insert";

DROP TRIGGER "invoice_billing_adjustments_update";

DROP TRIGGER "invoice_billing_policy_versions_insert";

DROP TRIGGER "invoice_billing_rate_versions_insert";

DROP TRIGGER "invoice_class_session_participants_delete";

DROP TRIGGER "invoice_class_session_participants_insert";

DROP TRIGGER "invoice_class_session_participants_update";

DROP TRIGGER "invoice_class_sessions_delete";

DROP TRIGGER "invoice_class_sessions_update";

DROP TRIGGER "invoice_correction_close";

DROP TRIGGER "invoice_correction_delete";

DROP TRIGGER "invoice_correction_open";

DROP TRIGGER "invoice_finance_account_delete";

DROP TRIGGER "invoice_finance_account_insert";

DROP TRIGGER "invoice_finance_account_update";

DROP TRIGGER "invoice_finance_event_apply";

DROP TRIGGER "invoice_finance_event_guard";

DROP TRIGGER "invoice_finance_events_delete";

DROP TRIGGER "invoice_finance_events_update";

DROP TRIGGER "invoice_issued_delete";

DROP TRIGGER "invoice_issued_immutable";

DROP TRIGGER "invoice_issued_item_delete";

DROP TRIGGER "invoice_issued_item_insert";

DROP TRIGGER "invoice_issued_item_update";

DROP TRIGGER "invoice_lessons_delete";

DROP TRIGGER "invoice_lessons_insert";

DROP TRIGGER "invoice_lessons_update";

DROP TRIGGER "invoice_lock_delete";

DROP TRIGGER "invoice_lock_update";

DROP TRIGGER "invoice_payment_identity";

DROP TRIGGER "invoice_payments_delete";

DROP TRIGGER "invoice_payments_update";

DROP TRIGGER "invoice_receipt_identity";

DROP TRIGGER "invoice_receipts_delete";

DROP TRIGGER "invoice_receipts_update";

DROP TRIGGER "prepayment_account_update";

DROP TRIGGER "prepayment_allocation_identity";

DROP TRIGGER "prepayment_allocations_delete";

DROP TRIGGER "prepayment_allocations_update";

DROP TRIGGER "prepayment_event_apply";

DROP TRIGGER "prepayment_event_guard";

DROP TRIGGER "prepayment_events_delete";

DROP TRIGGER "prepayment_events_update";

DROP TABLE "invoice_attendance_corrections";

DROP TABLE "prepayment_events";

DROP TABLE "invoice_receipts";

DROP TABLE "invoice_finance_events";

DROP TABLE "prepayment_allocations";

DROP TABLE "invoice_payments";

DROP TABLE "invoice_source_locks";

DROP TABLE "invoice_items";

DROP TABLE "invoice_finance_accounts";

DROP TABLE "invoices";

CREATE TABLE invoices (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES tuition_groups(id), student_id TEXT NOT NULL,
 month TEXT NOT NULL, billing_scope TEXT NOT NULL DEFAULT 'all' CHECK(billing_scope IN('all','monthly','hourly')), status TEXT NOT NULL CHECK(status IN('draft','issued')), revision INTEGER NOT NULL CHECK(revision>0),
 number TEXT, sequence_year TEXT, sequence_value INTEGER, issued_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 created_by TEXT NOT NULL, issued_by TEXT, due_date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', currency TEXT NOT NULL CHECK(currency='MYR'),
 source_hash TEXT NOT NULL, source_basis_json TEXT NOT NULL, adjustment_basis_json TEXT NOT NULL,
 document_json TEXT NOT NULL CHECK(json_valid(document_json)), total_cents INTEGER NOT NULL CHECK(total_cents>=0 AND total_cents<=100000000),
 extension_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(extension_json)),
 UNIQUE(group_id,id), UNIQUE(group_id,student_id,month,billing_scope), UNIQUE(group_id,number), UNIQUE(group_id,sequence_year,sequence_value),
 FOREIGN KEY(group_id,student_id) REFERENCES billing_students(group_id,id) ON DELETE RESTRICT,
 CHECK(status='draft' AND number IS NULL AND issued_at IS NULL OR status='issued' AND number IS NOT NULL AND issued_at IS NOT NULL)
);

CREATE TABLE invoice_finance_accounts (
 group_id TEXT NOT NULL, invoice_id TEXT NOT NULL, student_id TEXT NOT NULL,
 original_total_cents INTEGER NOT NULL CHECK(original_total_cents BETWEEN 0 AND 100000000),
 charge_cents INTEGER NOT NULL DEFAULT 0 CHECK(charge_cents>=0), credit_cents INTEGER NOT NULL DEFAULT 0 CHECK(credit_cents>=0),
 received_cents INTEGER NOT NULL DEFAULT 0 CHECK(received_cents>=0), reversed_cents INTEGER NOT NULL DEFAULT 0 CHECK(reversed_cents>=0), refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK(refunded_cents>=0),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0), voided_at TEXT, voided_by TEXT, void_reason TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, prepayment_cents INTEGER NOT NULL DEFAULT 0 CHECK(prepayment_cents>=0), PRIMARY KEY(group_id,invoice_id),
 FOREIGN KEY(group_id,invoice_id) REFERENCES invoices(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,student_id) REFERENCES billing_students(group_id,id) ON DELETE RESTRICT,
 CHECK(original_total_cents+charge_cents-credit_cents BETWEEN 0 AND 100000000),
 CHECK(received_cents-reversed_cents-refunded_cents>=0)
);

CREATE TABLE invoice_items (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, invoice_id TEXT NOT NULL, position INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('fee','charge','discount')), source_id TEXT, amount_cents INTEGER NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), UNIQUE(group_id,invoice_id,position),
 FOREIGN KEY(group_id,invoice_id) REFERENCES invoices(group_id,id) ON DELETE CASCADE
);

CREATE TABLE invoice_source_locks (
 group_id TEXT NOT NULL, invoice_id TEXT NOT NULL, source_type TEXT NOT NULL CHECK(source_type IN('lesson','session','rate','student_month','billing_line')),
 source_id TEXT NOT NULL, student_id TEXT NOT NULL, month TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(group_id,invoice_id,source_type,source_id),
 FOREIGN KEY(group_id,invoice_id) REFERENCES invoices(group_id,id) ON DELETE RESTRICT
);

CREATE TABLE invoice_payments (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, invoice_id TEXT NOT NULL, student_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000), paid_at TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method IN('cash','bank_transfer','duitnow','tng','other')),
 reference TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL, operation_id TEXT NOT NULL,
 UNIQUE(group_id,id), UNIQUE(group_id,operation_id),
 FOREIGN KEY(group_id,invoice_id) REFERENCES invoice_finance_accounts(group_id,invoice_id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,student_id) REFERENCES billing_students(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,operation_id) REFERENCES invoice_finance_operations(group_id,operation_id) ON DELETE RESTRICT
);

CREATE TABLE prepayment_allocations(
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL,student_id TEXT NOT NULL,payment_id TEXT NOT NULL,invoice_id TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000),created_at TEXT NOT NULL,operation_id TEXT NOT NULL,
 UNIQUE(group_id,id),UNIQUE(group_id,operation_id),
 FOREIGN KEY(group_id,payment_id) REFERENCES prepayment_payments(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,invoice_id) REFERENCES invoice_finance_accounts(group_id,invoice_id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,operation_id) REFERENCES prepayment_operations(group_id,operation_id) ON DELETE RESTRICT
);

CREATE TABLE invoice_finance_events (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, invoice_id TEXT NOT NULL, payment_id TEXT,
 kind TEXT NOT NULL CHECK(kind IN('payment','reverse','refund','charge','credit','void','attendance_correction')),
 amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 0 AND 100000000), occurred_at TEXT NOT NULL,
 method TEXT NOT NULL DEFAULT '' CHECK(method IN('','cash','bank_transfer','duitnow','tng','other')),
 reason TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', reference TEXT NOT NULL DEFAULT '', actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
 operation_id TEXT NOT NULL, expected_revision INTEGER NOT NULL CHECK(expected_revision>=0),
 UNIQUE(group_id,id), UNIQUE(group_id,invoice_id,expected_revision),
 FOREIGN KEY(group_id,invoice_id) REFERENCES invoice_finance_accounts(group_id,invoice_id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,payment_id) REFERENCES invoice_payments(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,operation_id) REFERENCES invoice_finance_operations(group_id,operation_id) ON DELETE RESTRICT,
 CHECK(kind IN('void','attendance_correction') AND amount_cents=0 OR kind NOT IN('void','attendance_correction') AND amount_cents>0),
 CHECK(kind IN('payment','reverse','refund') AND payment_id IS NOT NULL OR kind IN('charge','credit','void','attendance_correction') AND payment_id IS NULL),
 CHECK(kind='payment' OR length(trim(reason))>0)
);

CREATE TABLE invoice_receipts (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, invoice_id TEXT NOT NULL, payment_id TEXT NOT NULL,
 number TEXT NOT NULL, sequence_year TEXT NOT NULL, sequence_value INTEGER NOT NULL CHECK(sequence_value>0),
 document_json TEXT NOT NULL CHECK(json_valid(document_json)), created_at TEXT NOT NULL,
 UNIQUE(group_id,id), UNIQUE(group_id,payment_id), UNIQUE(group_id,number), UNIQUE(group_id,sequence_year,sequence_value),
 FOREIGN KEY(group_id,invoice_id) REFERENCES invoice_finance_accounts(group_id,invoice_id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,payment_id) REFERENCES invoice_payments(group_id,id) ON DELETE RESTRICT
);

CREATE TABLE prepayment_events(
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL,student_id TEXT NOT NULL,payment_id TEXT NOT NULL,invoice_id TEXT,allocation_id TEXT,
 kind TEXT NOT NULL CHECK(kind IN('payment','refund','reverse','apply','release')),amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000),occurred_at TEXT NOT NULL,
 method TEXT NOT NULL DEFAULT '' CHECK(method IN('','cash','bank_transfer','duitnow','tng','other')),reason TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',reference TEXT NOT NULL DEFAULT '',actor_id TEXT NOT NULL,created_at TEXT NOT NULL,
 operation_id TEXT NOT NULL,expected_revision INTEGER NOT NULL CHECK(expected_revision>=0),expected_invoice_revision INTEGER,
 UNIQUE(group_id,id),UNIQUE(group_id,student_id,expected_revision),UNIQUE(group_id,operation_id),
 FOREIGN KEY(group_id,student_id) REFERENCES prepayment_accounts(group_id,student_id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,payment_id) REFERENCES prepayment_payments(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,invoice_id) REFERENCES invoice_finance_accounts(group_id,invoice_id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,allocation_id) REFERENCES prepayment_allocations(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,operation_id) REFERENCES prepayment_operations(group_id,operation_id) ON DELETE RESTRICT,
 CHECK(kind IN('apply','release') AND invoice_id IS NOT NULL AND allocation_id IS NOT NULL AND expected_invoice_revision>=0 AND method='' OR kind IN('payment','refund','reverse') AND invoice_id IS NULL AND allocation_id IS NULL AND expected_invoice_revision IS NULL AND method<>''),
 CHECK(kind IN('payment','apply') OR length(trim(reason))>0)
);

CREATE TABLE invoice_attendance_corrections (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, invoice_id TEXT NOT NULL, lesson_id TEXT NOT NULL, session_id TEXT NOT NULL,
 event_id TEXT NOT NULL, operation_id TEXT NOT NULL, actor_id TEXT NOT NULL, reason TEXT NOT NULL CHECK(length(trim(reason))>0),
 before_json TEXT NOT NULL CHECK(json_valid(before_json)), after_json TEXT NOT NULL CHECK(json_valid(after_json)),
 active INTEGER NOT NULL CHECK(active IN(0,1)), created_at TEXT NOT NULL, closed_at TEXT,
 UNIQUE(group_id,id), UNIQUE(group_id,event_id),
 FOREIGN KEY(group_id,invoice_id) REFERENCES invoice_finance_accounts(group_id,invoice_id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,event_id) REFERENCES invoice_finance_events(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,operation_id) REFERENCES invoice_finance_operations(group_id,operation_id) ON DELETE RESTRICT,
 CHECK(active=1 AND closed_at IS NULL OR active=0 AND closed_at IS NOT NULL)
);

CREATE INDEX invoice_attendance_corrections_source ON invoice_attendance_corrections(group_id,lesson_id,active);

CREATE INDEX invoice_finance_events_invoice_idx ON invoice_finance_events(group_id,invoice_id,created_at,id);

CREATE INDEX invoice_finance_events_payment_idx ON invoice_finance_events(group_id,payment_id,kind);

CREATE UNIQUE INDEX invoice_finance_payment_once ON invoice_finance_events(group_id,payment_id,kind) WHERE kind IN('payment','reverse');

CREATE INDEX invoice_payments_invoice_idx ON invoice_payments(group_id,invoice_id,created_at,id);

CREATE INDEX invoice_source_lock_lookup ON invoice_source_locks(group_id,source_type,source_id);

CREATE INDEX invoice_source_lock_student_month ON invoice_source_locks(group_id,student_id,month);

CREATE INDEX invoices_month_idx ON invoices(group_id,month,updated_at,id);

CREATE INDEX prepayment_allocations_invoice_idx ON prepayment_allocations(group_id,invoice_id,created_at,id);

CREATE INDEX prepayment_events_invoice_idx ON prepayment_events(group_id,invoice_id,kind);

CREATE INDEX prepayment_events_month_idx ON prepayment_events(group_id,occurred_at,kind,id);

CREATE INDEX prepayment_events_payment_idx ON prepayment_events(group_id,payment_id,kind);

CREATE UNIQUE INDEX prepayment_payment_once ON prepayment_events(group_id,payment_id,kind) WHERE kind IN('payment','reverse');

INSERT INTO "invoices" ("id","group_id","student_id","month","status","revision","number","sequence_year","sequence_value","issued_at","created_at","updated_at","created_by","issued_by","due_date","notes","currency","source_hash","source_basis_json","adjustment_basis_json","document_json","total_cents","extension_json") SELECT "id","group_id","student_id","month","status","revision","number","sequence_year","sequence_value","issued_at","created_at","updated_at","created_by","issued_by","due_date","notes","currency","source_hash","source_basis_json","adjustment_basis_json","document_json","total_cents","extension_json" FROM "_0066_copy_invoices";

INSERT INTO "invoice_finance_accounts" ("group_id","invoice_id","student_id","original_total_cents","charge_cents","credit_cents","received_cents","reversed_cents","refunded_cents","revision","voided_at","voided_by","void_reason","created_at","updated_at","prepayment_cents") SELECT "group_id","invoice_id","student_id","original_total_cents","charge_cents","credit_cents","received_cents","reversed_cents","refunded_cents","revision","voided_at","voided_by","void_reason","created_at","updated_at","prepayment_cents" FROM "_0066_copy_invoice_finance_accounts";

INSERT INTO "invoice_items" ("id","group_id","invoice_id","position","kind","source_id","amount_cents","snapshot_json") SELECT "id","group_id","invoice_id","position","kind","source_id","amount_cents","snapshot_json" FROM "_0066_copy_invoice_items";

INSERT INTO "invoice_source_locks" ("group_id","invoice_id","source_type","source_id","student_id","month","created_at") SELECT "group_id","invoice_id","source_type","source_id","student_id","month","created_at" FROM "_0066_copy_invoice_source_locks";

INSERT INTO "invoice_payments" ("id","group_id","invoice_id","student_id","amount_cents","paid_at","method","reference","notes","created_by","created_at","operation_id") SELECT "id","group_id","invoice_id","student_id","amount_cents","paid_at","method","reference","notes","created_by","created_at","operation_id" FROM "_0066_copy_invoice_payments";

INSERT INTO "prepayment_allocations" ("id","group_id","student_id","payment_id","invoice_id","amount_cents","created_at","operation_id") SELECT "id","group_id","student_id","payment_id","invoice_id","amount_cents","created_at","operation_id" FROM "_0066_copy_prepayment_allocations";

INSERT INTO "invoice_finance_events" ("id","group_id","invoice_id","payment_id","kind","amount_cents","occurred_at","method","reason","notes","reference","actor_id","created_at","operation_id","expected_revision") SELECT "id","group_id","invoice_id","payment_id","kind","amount_cents","occurred_at","method","reason","notes","reference","actor_id","created_at","operation_id","expected_revision" FROM "_0066_copy_invoice_finance_events";

INSERT INTO "invoice_receipts" ("id","group_id","invoice_id","payment_id","number","sequence_year","sequence_value","document_json","created_at") SELECT "id","group_id","invoice_id","payment_id","number","sequence_year","sequence_value","document_json","created_at" FROM "_0066_copy_invoice_receipts";

INSERT INTO "prepayment_events" ("id","group_id","student_id","payment_id","invoice_id","allocation_id","kind","amount_cents","occurred_at","method","reason","notes","reference","actor_id","created_at","operation_id","expected_revision","expected_invoice_revision") SELECT "id","group_id","student_id","payment_id","invoice_id","allocation_id","kind","amount_cents","occurred_at","method","reason","notes","reference","actor_id","created_at","operation_id","expected_revision","expected_invoice_revision" FROM "_0066_copy_prepayment_events";

INSERT INTO "invoice_attendance_corrections" ("id","group_id","invoice_id","lesson_id","session_id","event_id","operation_id","actor_id","reason","before_json","after_json","active","created_at","closed_at") SELECT "id","group_id","invoice_id","lesson_id","session_id","event_id","operation_id","actor_id","reason","before_json","after_json","active","created_at","closed_at" FROM "_0066_copy_invoice_attendance_corrections";

CREATE TRIGGER attendance_legacy_sync AFTER UPDATE OF status,actual_start,actual_end,reviewed_at,chargeable,note ON lessons
 WHEN EXISTS(SELECT 1 FROM class_sessions s WHERE s.id=NEW.session_id AND s.attendance_written_at IS NOT NEW.updated_at) AND NOT EXISTS(SELECT 1 FROM invoice_attendance_corrections c WHERE c.group_id=NEW.group_id AND c.lesson_id=NEW.id AND c.active=1) BEGIN
 UPDATE class_sessions SET teaching_status=CASE WHEN OLD.status IS NOT NEW.status OR OLD.actual_start IS NOT NEW.actual_start OR OLD.actual_end IS NOT NEW.actual_end OR teaching_status='pending' THEN CASE WHEN NEW.status='completed' AND NEW.actual_start IS NOT NULL AND NEW.actual_end IS NOT NULL THEN 'taught' WHEN NEW.status='teacher_absent' THEN 'teacher_absent' WHEN NEW.status='student_absent' THEN 'not_taught' ELSE 'pending' END ELSE teaching_status END,
 actual_start=CASE WHEN OLD.actual_start IS NOT NEW.actual_start OR teaching_status='pending' THEN NEW.actual_start ELSE actual_start END,actual_end=CASE WHEN OLD.actual_end IS NOT NEW.actual_end OR teaching_status='pending' THEN NEW.actual_end ELSE actual_end END,attendance_note=CASE WHEN OLD.note IS NOT NEW.note THEN NEW.note ELSE attendance_note END,attendance_recorded_at=CASE WHEN OLD.status IS NOT NEW.status OR OLD.actual_start IS NOT NEW.actual_start OR OLD.actual_end IS NOT NEW.actual_end THEN CASE WHEN NEW.status IN ('completed','student_absent','teacher_absent') THEN NEW.updated_at END ELSE attendance_recorded_at END,attendance_reviewed_at=NEW.reviewed_at,attendance_reviewed_by=NEW.reviewed_by,attendance_written_at=NEW.updated_at
 WHERE id=NEW.session_id AND session_type='one_to_one';
 UPDATE class_session_participants SET attendance_status=CASE WHEN OLD.status IS NOT NEW.status OR attendance_status='pending' THEN CASE WHEN NEW.status='completed' THEN 'present' WHEN NEW.status IN ('student_absent','teacher_absent') THEN 'absent' ELSE 'pending' END ELSE attendance_status END,arrived_at=NEW.actual_start,left_at=NEW.actual_end,attendance_note=NEW.note,attendance_updated_at=NEW.updated_at WHERE lesson_id=NEW.id;
END;

CREATE TRIGGER class_group_attendance_sync AFTER UPDATE OF status,actual_start,actual_end,reviewed_at ON lessons WHEN NEW.session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoice_attendance_corrections c WHERE c.group_id=NEW.group_id AND c.lesson_id=NEW.id AND c.active=1) BEGIN
 UPDATE class_sessions SET status=CASE
  WHEN EXISTS(SELECT 1 FROM lessons WHERE session_id=NEW.session_id AND status='scheduled') THEN 'scheduled'
  WHEN NOT EXISTS(SELECT 1 FROM lessons WHERE session_id=NEW.session_id AND status<>'cancelled') THEN 'cancelled'
  ELSE 'completed' END,revision=revision+1,updated_at=NEW.updated_at WHERE id=NEW.session_id AND session_type='group' AND attendance_written_at IS NOT NEW.updated_at;
END;

CREATE TRIGGER class_one_sync AFTER UPDATE OF planned_start,planned_end,teacher_name,subject,status,series_id,updated_at ON lessons WHEN NOT EXISTS(SELECT 1 FROM invoice_attendance_corrections c WHERE c.group_id=NEW.group_id AND c.lesson_id=NEW.id AND c.active=1) BEGIN
 UPDATE class_sessions SET teacher_name=NEW.teacher_name,subject=NEW.subject,planned_start=NEW.planned_start,planned_end=NEW.planned_end,status=NEW.status,series_id=NEW.series_id,updated_at=NEW.updated_at,revision=revision+1 WHERE id=NEW.session_id AND session_type='one_to_one';
END;

CREATE TRIGGER invoice_billing_adjustments_delete BEFORE DELETE ON billing_adjustments WHEN EXISTS(SELECT 1 FROM invoice_source_locks il WHERE il.group_id=OLD.group_id AND il.student_id=OLD.student_id AND il.month=OLD.month AND (il.source_type='student_month' OR il.source_type='billing_line' AND il.source_id=OLD.line_id)) BEGIN SELECT RAISE(ABORT,'invoice_source_locked'); END;

CREATE TRIGGER invoice_billing_adjustments_insert BEFORE INSERT ON billing_adjustments WHEN EXISTS(SELECT 1 FROM invoice_source_locks il WHERE il.group_id=NEW.group_id AND il.student_id=NEW.student_id AND il.month=NEW.month AND (il.source_type='student_month' OR il.source_type='billing_line' AND il.source_id=NEW.line_id)) BEGIN SELECT RAISE(ABORT,'invoice_source_locked'); END;

CREATE TRIGGER invoice_billing_adjustments_update BEFORE UPDATE OF group_id,student_id,month,line_id,amount_cents,basis_hash,reason ON billing_adjustments WHEN (OLD.group_id IS NOT NEW.group_id OR OLD.student_id IS NOT NEW.student_id OR OLD.month IS NOT NEW.month OR OLD.line_id IS NOT NEW.line_id OR OLD.amount_cents IS NOT NEW.amount_cents OR OLD.basis_hash IS NOT NEW.basis_hash OR OLD.reason IS NOT NEW.reason) AND (EXISTS(SELECT 1 FROM invoice_source_locks il WHERE il.group_id=OLD.group_id AND il.student_id=OLD.student_id AND il.month=OLD.month AND (il.source_type='student_month' OR il.source_type='billing_line' AND il.source_id=OLD.line_id)) OR EXISTS(SELECT 1 FROM invoice_source_locks il WHERE il.group_id=NEW.group_id AND il.student_id=NEW.student_id AND il.month=NEW.month AND (il.source_type='student_month' OR il.source_type='billing_line' AND il.source_id=NEW.line_id))) BEGIN SELECT RAISE(ABORT,'invoice_source_locked'); END;

CREATE TRIGGER invoice_billing_policy_versions_insert BEFORE INSERT ON billing_policy_versions WHEN EXISTS(SELECT 1 FROM invoice_source_locks il WHERE il.group_id=NEW.group_id AND il.source_type IN('student_month','rate','billing_line') AND NEW.effective_from<date(il.month||'-01','+1 month')) BEGIN SELECT RAISE(ABORT,'invoice_source_locked'); END;

CREATE TRIGGER invoice_billing_rate_versions_insert BEFORE INSERT ON billing_rate_versions WHEN EXISTS(SELECT 1 FROM billing_rates br JOIN invoice_source_locks il ON il.group_id=br.group_id AND il.student_id=br.student_id WHERE br.id=NEW.rate_id AND br.group_id=NEW.group_id AND (il.source_type='student_month' OR il.source_type='rate' AND EXISTS(SELECT 1 FROM billing_rate_versions held WHERE held.group_id=il.group_id AND held.id=il.source_id AND held.rate_id=NEW.rate_id)) AND NEW.effective_from<date(il.month||'-01','+1 month')) BEGIN SELECT RAISE(ABORT,'invoice_source_locked'); END;

CREATE TRIGGER invoice_class_session_participants_delete BEFORE DELETE ON class_session_participants WHEN (EXISTS(SELECT 1 FROM invoice_source_locks il WHERE il.group_id=OLD.group_id AND il.source_type='lesson' AND il.source_id=OLD.lesson_id) OR EXISTS(SELECT 1 FROM class_sessions cs WHERE cs.id=OLD.session_id AND cs.group_id=OLD.group_id AND EXISTS(SELECT 1 FROM invoice_source_locks il JOIN billing_students ib ON ib.id=il.student_id AND ib.group_id=il.group_id WHERE il.source_type='student_month' AND il.group_id=OLD.group_id AND ib.student_name=OLD.student_name AND il.month=strftime('%Y-%m',coalesce(cs.actual_start,cs.planned_start),'+8 hours')))) BEGIN SELECT RAISE(ABORT,'invoice_source_locked'); END;

CREATE TRIGGER invoice_class_session_participants_insert BEFORE INSERT ON class_session_participants WHEN (EXISTS(SELECT 1 FROM invoice_source_locks il WHERE il.group_id=NEW.group_id AND il.source_type='lesson' AND il.source_id=NEW.lesson_id) OR EXISTS(SELECT 1 FROM class_sessions cs WHERE cs.id=NEW.session_id AND cs.group_id=NEW.group_id AND EXISTS(SELECT 1 FROM invoice_source_locks il JOIN billing_students ib ON ib.id=il.student_id AND ib.group_id=il.group_id WHERE il.source_type='student_month' AND il.group_id=NEW.group_id AND ib.student_name=NEW.student_name AND il.month=strftime('%Y-%m',coalesce(cs.actual_start,cs.planned_start),'+8 hours')))) BEGIN SELECT RAISE(ABORT,'invoice_source_locked'); END;

CREATE TRIGGER invoice_class_session_participants_update BEFORE UPDATE OF group_id,session_id,lesson_id,student_name,attendance_status,arrived_at,left_at ON class_session_participants WHEN ((OLD.group_id IS NOT NEW.group_id OR OLD.session_id IS NOT NEW.session_id OR OLD.lesson_id IS NOT NEW.lesson_id OR OLD.student_name IS NOT NEW.student_name OR OLD.attendance_status IS NOT NEW.attendance_status OR OLD.arrived_at IS NOT NEW.arrived_at OR OLD.left_at IS NOT NEW.left_at) AND ((EXISTS(SELECT 1 FROM invoice_source_locks il WHERE il.group_id=OLD.group_id AND il.source_type='lesson' AND il.source_id=OLD.lesson_id) OR EXISTS(SELECT 1 FROM class_sessions cs WHERE cs.id=OLD.session_id AND cs.group_id=OLD.group_id AND EXISTS(SELECT 1 FROM invoice_source_locks il JOIN billing_students ib ON ib.id=il.student_id AND ib.group_id=il.group_id WHERE il.source_type='student_month' AND il.group_id=OLD.group_id AND ib.student_name=OLD.student_name AND il.month=strftime('%Y-%m',coalesce(cs.actual_start,cs.planned_start),'+8 hours')))) OR (EXISTS(SELECT 1 FROM invoice_source_locks il WHERE il.group_id=NEW.group_id AND il.source_type='lesson' AND il.source_id=NEW.lesson_id) OR EXISTS(SELECT 1 FROM class_sessions cs WHERE cs.id=NEW.session_id AND cs.group_id=NEW.group_id AND EXISTS(SELECT 1 FROM invoice_source_locks il JOIN billing_students ib ON ib.id=il.student_id AND ib.group_id=il.group_id WHERE il.source_type='student_month' AND il.group_id=NEW.group_id AND ib.student_name=NEW.student_name AND il.month=strftime('%Y-%m',coalesce(cs.actual_start,cs.planned_start),'+8 hours')))))) AND NOT EXISTS(SELECT 1 FROM invoice_attendance_corrections c WHERE c.active=1 AND c.group_id=OLD.group_id AND c.lesson_id=OLD.lesson_id AND c.session_id=OLD.session_id AND OLD.group_id IS NEW.group_id AND OLD.session_id IS NEW.session_id AND OLD.lesson_id IS NEW.lesson_id AND OLD.student_name IS NEW.student_name AND NEW.attendance_status IS json_extract(c.after_json,'$.attendanceKind') AND NEW.arrived_at IS json_extract(c.after_json,'$.actualStart') AND NEW.left_at IS json_extract(c.after_json,'$.actualEnd')) BEGIN SELECT RAISE(ABORT,'invoice_source_locked'); END;

CREATE TRIGGER invoice_class_sessions_delete BEFORE DELETE ON class_sessions WHEN (EXISTS(SELECT 1 FROM invoice_source_locks il WHERE il.group_id=OLD.group_id AND il.source_type='session' AND il.source_id=OLD.id) OR EXISTS(SELECT 1 FROM class_session_participants ilp WHERE ilp.group_id=OLD.group_id AND ilp.session_id=OLD.id AND EXISTS(SELECT 1 FROM invoice_source_locks il JOIN billing_students ib ON ib.id=il.student_id AND ib.group_id=il.group_id WHERE il.source_type='student_month' AND il.group_id=OLD.group_id AND ib.student_name=ilp.student_name AND il.month=strftime('%Y-%m',coalesce(OLD.actual_start,OLD.planned_start),'+8 hours')))) BEGIN SELECT RAISE(ABORT,'invoice_source_locked'); END;

CREATE TRIGGER invoice_class_sessions_update BEFORE UPDATE OF group_id,teacher_name,subject,session_type,planned_start,planned_end,actual_start,actual_end,teaching_status,attendance_reviewed_at,attendance_reviewed_by,status,classroom_id ON class_sessions WHEN (OLD.group_id IS NOT NEW.group_id OR OLD.teacher_name IS NOT NEW.teacher_name OR OLD.subject IS NOT NEW.subject OR OLD.session_type IS NOT NEW.session_type OR OLD.planned_start IS NOT NEW.planned_start OR OLD.planned_end IS NOT NEW.planned_end OR OLD.actual_start IS NOT NEW.actual_start OR OLD.actual_end IS NOT NEW.actual_end OR OLD.teaching_status IS NOT NEW.teaching_status OR OLD.attendance_reviewed_at IS NOT NEW.attendance_reviewed_at OR OLD.attendance_reviewed_by IS NOT NEW.attendance_reviewed_by OR OLD.status IS NOT NEW.status OR OLD.classroom_id IS NOT NEW.classroom_id) AND ((EXISTS(SELECT 1 FROM invoice_source_locks il WHERE il.group_id=OLD.group_id AND il.source_type='session' AND il.source_id=OLD.id) OR EXISTS(SELECT 1 FROM class_session_participants ilp WHERE ilp.group_id=OLD.group_id AND ilp.session_id=OLD.id AND EXISTS(SELECT 1 FROM invoice_source_locks il JOIN billing_students ib ON ib.id=il.student_id AND ib.group_id=il.group_id WHERE il.source_type='student_month' AND il.group_id=OLD.group_id AND ib.student_name=ilp.student_name AND il.month=strftime('%Y-%m',coalesce(OLD.actual_start,OLD.planned_start),'+8 hours')))) OR (EXISTS(SELECT 1 FROM invoice_source_locks il WHERE il.group_id=NEW.group_id AND il.source_type='session' AND il.source_id=NEW.id) OR EXISTS(SELECT 1 FROM class_session_participants ilp WHERE ilp.group_id=NEW.group_id AND ilp.session_id=NEW.id AND EXISTS(SELECT 1 FROM invoice_source_locks il JOIN billing_students ib ON ib.id=il.student_id AND ib.group_id=il.group_id WHERE il.source_type='student_month' AND il.group_id=NEW.group_id AND ib.student_name=ilp.student_name AND il.month=strftime('%Y-%m',coalesce(NEW.actual_start,NEW.planned_start),'+8 hours'))))) AND NOT EXISTS(SELECT 1 FROM invoice_attendance_corrections c WHERE c.active=1 AND c.group_id=OLD.group_id AND c.session_id=OLD.id AND json_type(c.after_json,'$.teachingStatus') IS NOT NULL AND OLD.group_id IS NEW.group_id AND OLD.teacher_name IS NEW.teacher_name AND OLD.subject IS NEW.subject AND OLD.session_type IS NEW.session_type AND OLD.planned_start IS NEW.planned_start AND OLD.planned_end IS NEW.planned_end AND OLD.classroom_id IS NEW.classroom_id AND OLD.revision=json_extract(c.before_json,'$.sessionRevision') AND NEW.revision=OLD.revision+1 AND NEW.teaching_status IS json_extract(c.after_json,'$.teachingStatus') AND NEW.actual_start IS json_extract(c.after_json,'$.teachingStart') AND NEW.actual_end IS json_extract(c.after_json,'$.teachingEnd') AND NEW.status IS json_extract(c.after_json,'$.sessionStatus') AND NEW.attendance_reviewed_at IS json_extract(c.after_json,'$.sessionReviewedAt') AND NEW.attendance_reviewed_by IS json_extract(c.after_json,'$.sessionReviewedBy')) BEGIN SELECT RAISE(ABORT,'invoice_source_locked'); END;

CREATE TRIGGER invoice_correction_close BEFORE UPDATE ON invoice_attendance_corrections WHEN OLD.active<>1 OR NEW.active<>0 OR NEW.closed_at IS NULL
 OR OLD.id IS NOT NEW.id OR OLD.group_id IS NOT NEW.group_id OR OLD.invoice_id IS NOT NEW.invoice_id OR OLD.lesson_id IS NOT NEW.lesson_id OR OLD.session_id IS NOT NEW.session_id OR OLD.event_id IS NOT NEW.event_id OR OLD.operation_id IS NOT NEW.operation_id OR OLD.actor_id IS NOT NEW.actor_id OR OLD.reason IS NOT NEW.reason OR OLD.before_json IS NOT NEW.before_json OR OLD.after_json IS NOT NEW.after_json OR OLD.created_at IS NOT NEW.created_at
 OR NOT EXISTS(SELECT 1 FROM lessons l JOIN class_sessions s ON s.group_id=l.group_id AND s.id=l.session_id JOIN class_session_participants p ON p.group_id=l.group_id AND p.session_id=s.id AND p.lesson_id=l.id WHERE l.group_id=NEW.group_id AND l.id=NEW.lesson_id AND s.id=NEW.session_id AND s.revision=json_extract(NEW.before_json,'$.sessionRevision')+1 AND l.status IS json_extract(NEW.after_json,'$.status') AND l.attendance_kind IS json_extract(NEW.after_json,'$.attendanceKind') AND l.actual_start IS json_extract(NEW.after_json,'$.actualStart') AND l.actual_end IS json_extract(NEW.after_json,'$.actualEnd') AND l.chargeable IS json_extract(NEW.after_json,'$.chargeable') AND l.reviewed_at IS json_extract(NEW.after_json,'$.reviewedAt') AND l.reviewed_by IS json_extract(NEW.after_json,'$.reviewedBy') AND (json_type(NEW.after_json,'$.teachingStatus') IS NULL OR (s.teaching_status IS json_extract(NEW.after_json,'$.teachingStatus') AND s.actual_start IS json_extract(NEW.after_json,'$.teachingStart') AND s.actual_end IS json_extract(NEW.after_json,'$.teachingEnd') AND s.status IS json_extract(NEW.after_json,'$.sessionStatus') AND s.attendance_reviewed_at IS json_extract(NEW.after_json,'$.sessionReviewedAt') AND s.attendance_reviewed_by IS json_extract(NEW.after_json,'$.sessionReviewedBy'))) AND p.attendance_status IS l.attendance_kind AND p.arrived_at IS l.actual_start AND p.left_at IS l.actual_end)
 BEGIN SELECT RAISE(ABORT,'invoice_correction_incomplete'); END;

CREATE TRIGGER invoice_correction_delete BEFORE DELETE ON invoice_attendance_corrections BEGIN SELECT RAISE(ABORT,'invoice_finance_immutable'); END;

CREATE TRIGGER invoice_correction_open BEFORE INSERT ON invoice_attendance_corrections WHEN NEW.active<>1 OR NOT EXISTS(
 SELECT 1 FROM invoice_finance_operations op JOIN invoice_finance_events e ON e.group_id=op.group_id AND e.operation_id=op.operation_id JOIN invoices i ON i.group_id=e.group_id AND i.id=e.invoice_id JOIN billing_students b ON b.group_id=i.group_id AND b.id=i.student_id JOIN lessons l ON l.group_id=i.group_id AND l.id=NEW.lesson_id AND l.student=b.student_name JOIN class_sessions s ON s.group_id=l.group_id AND s.id=l.session_id JOIN class_session_participants p ON p.group_id=l.group_id AND p.session_id=s.id AND p.lesson_id=l.id
 WHERE op.group_id=NEW.group_id AND op.operation_id=NEW.operation_id AND op.actor_id=NEW.actor_id AND op.action='correctAttendance' AND e.id=NEW.event_id AND e.kind='attendance_correction' AND i.id=NEW.invoice_id AND l.session_id=NEW.session_id
 AND EXISTS(SELECT 1 FROM json_each(i.document_json,'$.sourceLines') j WHERE json_extract(j.value,'$.lessonId')=l.id)
 AND l.updated_at IS json_extract(NEW.before_json,'$.updatedAt') AND s.revision IS json_extract(NEW.before_json,'$.sessionRevision')
 AND l.status IS json_extract(NEW.before_json,'$.status') AND l.attendance_kind IS json_extract(NEW.before_json,'$.attendanceKind')
 AND l.actual_start IS json_extract(NEW.before_json,'$.actualStart') AND l.actual_end IS json_extract(NEW.before_json,'$.actualEnd')
 AND l.chargeable IS json_extract(NEW.before_json,'$.chargeable') AND l.reviewed_at IS json_extract(NEW.before_json,'$.reviewedAt') AND l.reviewed_by IS json_extract(NEW.before_json,'$.reviewedBy') AND l.note IS json_extract(NEW.before_json,'$.note')
 AND s.teaching_status IS json_extract(NEW.before_json,'$.teachingStatus') AND s.actual_start IS json_extract(NEW.before_json,'$.teachingStart') AND s.actual_end IS json_extract(NEW.before_json,'$.teachingEnd')
 AND p.attendance_status IS json_extract(NEW.before_json,'$.participantStatus') AND p.arrived_at IS json_extract(NEW.before_json,'$.arrivedAt') AND p.left_at IS json_extract(NEW.before_json,'$.leftAt')
) BEGIN SELECT RAISE(ABORT,'invoice_correction_changed'); END;

CREATE TRIGGER invoice_finance_account_delete BEFORE DELETE ON invoice_finance_accounts BEGIN SELECT RAISE(ABORT,'invoice_finance_immutable'); END;

CREATE TRIGGER invoice_finance_account_insert BEFORE INSERT ON invoice_finance_accounts WHEN NOT EXISTS(SELECT 1 FROM invoices i WHERE i.group_id=NEW.group_id AND i.id=NEW.invoice_id AND i.student_id=NEW.student_id AND i.status='issued' AND i.total_cents=NEW.original_total_cents) OR NEW.revision<>0 OR NEW.charge_cents<>0 OR NEW.credit_cents<>0 OR NEW.received_cents<>0 OR NEW.reversed_cents<>0 OR NEW.refunded_cents<>0 OR NEW.prepayment_cents<>0 OR NEW.voided_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'invoice_finance_invalid_account'); END;

CREATE TRIGGER invoice_finance_account_update BEFORE UPDATE ON invoice_finance_accounts WHEN
 NEW.group_id IS NOT OLD.group_id OR NEW.invoice_id IS NOT OLD.invoice_id OR NEW.student_id IS NOT OLD.student_id OR NEW.original_total_cents IS NOT OLD.original_total_cents OR NEW.created_at IS NOT OLD.created_at
 OR NEW.revision<>(SELECT count(*) FROM invoice_finance_events e WHERE e.group_id=OLD.group_id AND e.invoice_id=OLD.invoice_id)+(SELECT count(*) FROM prepayment_events e WHERE e.group_id=OLD.group_id AND e.invoice_id=OLD.invoice_id AND kind IN('apply','release'))
 OR NEW.prepayment_cents<>coalesce((SELECT sum(CASE kind WHEN 'apply' THEN amount_cents WHEN 'release' THEN -amount_cents ELSE 0 END) FROM prepayment_events e WHERE e.group_id=OLD.group_id AND e.invoice_id=OLD.invoice_id),0)
 OR NEW.charge_cents<>coalesce((SELECT sum(amount_cents) FROM invoice_finance_events e WHERE e.group_id=OLD.group_id AND e.invoice_id=OLD.invoice_id AND e.kind='charge'),0)
 OR NEW.credit_cents<>coalesce((SELECT sum(amount_cents) FROM invoice_finance_events e WHERE e.group_id=OLD.group_id AND e.invoice_id=OLD.invoice_id AND e.kind='credit'),0)
 OR NEW.received_cents<>coalesce((SELECT sum(amount_cents) FROM invoice_finance_events e WHERE e.group_id=OLD.group_id AND e.invoice_id=OLD.invoice_id AND e.kind='payment'),0)
 OR NEW.reversed_cents<>coalesce((SELECT sum(amount_cents) FROM invoice_finance_events e WHERE e.group_id=OLD.group_id AND e.invoice_id=OLD.invoice_id AND e.kind='reverse'),0)
 OR NEW.refunded_cents<>coalesce((SELECT sum(amount_cents) FROM invoice_finance_events e WHERE e.group_id=OLD.group_id AND e.invoice_id=OLD.invoice_id AND e.kind='refund'),0)
 OR NEW.voided_at IS NOT (SELECT occurred_at FROM invoice_finance_events e WHERE e.group_id=OLD.group_id AND e.invoice_id=OLD.invoice_id AND e.kind='void')
 BEGIN SELECT RAISE(ABORT,'invoice_finance_immutable'); END;

CREATE TRIGGER invoice_finance_event_apply AFTER INSERT ON invoice_finance_events BEGIN
 UPDATE invoice_finance_accounts SET revision=revision+1,
 charge_cents=charge_cents+CASE WHEN NEW.kind='charge' THEN NEW.amount_cents ELSE 0 END,
 credit_cents=credit_cents+CASE WHEN NEW.kind='credit' THEN NEW.amount_cents ELSE 0 END,
 received_cents=received_cents+CASE WHEN NEW.kind='payment' THEN NEW.amount_cents ELSE 0 END,
 reversed_cents=reversed_cents+CASE WHEN NEW.kind='reverse' THEN NEW.amount_cents ELSE 0 END,
 refunded_cents=refunded_cents+CASE WHEN NEW.kind='refund' THEN NEW.amount_cents ELSE 0 END,
 voided_at=CASE WHEN NEW.kind='void' THEN NEW.occurred_at ELSE voided_at END,
 voided_by=CASE WHEN NEW.kind='void' THEN NEW.actor_id ELSE voided_by END,
 void_reason=CASE WHEN NEW.kind='void' THEN NEW.reason ELSE void_reason END,
 updated_at=NEW.created_at WHERE group_id=NEW.group_id AND invoice_id=NEW.invoice_id;
END;

CREATE TRIGGER invoice_finance_event_guard BEFORE INSERT ON invoice_finance_events BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM invoice_finance_accounts a JOIN invoices i ON i.group_id=a.group_id AND i.id=a.invoice_id WHERE a.group_id=NEW.group_id AND a.invoice_id=NEW.invoice_id AND a.revision=NEW.expected_revision AND a.voided_at IS NULL AND i.status='issued') THEN RAISE(ABORT,'invoice_finance_changed') END;
 SELECT CASE WHEN NEW.kind='payment' AND (NOT EXISTS(SELECT 1 FROM invoice_payments p JOIN invoice_finance_accounts a ON a.group_id=p.group_id AND a.invoice_id=p.invoice_id WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND p.invoice_id=NEW.invoice_id AND p.amount_cents=NEW.amount_cents AND NEW.amount_cents<=a.original_total_cents+a.charge_cents-a.credit_cents-a.received_cents+a.reversed_cents+a.refunded_cents-a.prepayment_cents)) THEN RAISE(ABORT,'invoice_finance_overpayment') END;
 SELECT CASE WHEN NEW.kind IN('reverse','refund') AND NOT EXISTS(SELECT 1 FROM invoice_payments p WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND p.invoice_id=NEW.invoice_id AND julianday(NEW.occurred_at)>=julianday(p.paid_at) AND NOT EXISTS(SELECT 1 FROM invoice_finance_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='reverse') AND EXISTS(SELECT 1 FROM invoice_finance_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='payment') AND CASE WHEN NEW.kind='reverse' THEN p.amount_cents=NEW.amount_cents AND NOT EXISTS(SELECT 1 FROM invoice_finance_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='refund') ELSE NEW.amount_cents<=p.amount_cents-coalesce((SELECT sum(e.amount_cents) FROM invoice_finance_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='refund'),0) END) THEN RAISE(ABORT,'invoice_finance_invalid_refund') END;
 SELECT CASE WHEN NEW.kind='credit' AND NOT EXISTS(SELECT 1 FROM invoice_finance_accounts a WHERE a.group_id=NEW.group_id AND a.invoice_id=NEW.invoice_id AND NEW.amount_cents<=a.original_total_cents+a.charge_cents-a.credit_cents-a.prepayment_cents) THEN RAISE(ABORT,'invoice_finance_invalid_credit') END;
 SELECT CASE WHEN NEW.kind='charge' AND NOT EXISTS(SELECT 1 FROM invoice_finance_accounts a WHERE a.group_id=NEW.group_id AND a.invoice_id=NEW.invoice_id AND a.original_total_cents+a.charge_cents-a.credit_cents+NEW.amount_cents<=100000000) THEN RAISE(ABORT,'invoice_finance_invalid_charge') END;
 SELECT CASE WHEN NEW.kind='void' AND NOT EXISTS(SELECT 1 FROM invoice_finance_accounts a WHERE a.group_id=NEW.group_id AND a.invoice_id=NEW.invoice_id AND a.received_cents-a.reversed_cents-a.refunded_cents+a.prepayment_cents=0) THEN RAISE(ABORT,'invoice_finance_void_has_payment') END;
END;

CREATE TRIGGER invoice_finance_events_delete BEFORE DELETE ON invoice_finance_events BEGIN SELECT RAISE(ABORT,'invoice_finance_immutable'); END;

CREATE TRIGGER invoice_finance_events_update BEFORE UPDATE ON invoice_finance_events BEGIN SELECT RAISE(ABORT,'invoice_finance_immutable'); END;

CREATE TRIGGER invoice_issued_delete BEFORE DELETE ON invoices WHEN OLD.status='issued'
 BEGIN SELECT RAISE(ABORT,'invoice_issued_immutable'); END;

CREATE TRIGGER invoice_issued_immutable BEFORE UPDATE ON invoices WHEN OLD.status='issued'
 BEGIN SELECT RAISE(ABORT,'invoice_issued_immutable'); END;

CREATE TRIGGER invoice_issued_item_delete BEFORE DELETE ON invoice_items WHEN EXISTS(SELECT 1 FROM invoices WHERE id=OLD.invoice_id AND group_id=OLD.group_id AND status='issued')
 BEGIN SELECT RAISE(ABORT,'invoice_issued_immutable'); END;

CREATE TRIGGER invoice_issued_item_insert BEFORE INSERT ON invoice_items WHEN EXISTS(SELECT 1 FROM invoices WHERE id=NEW.invoice_id AND group_id=NEW.group_id AND status='issued')
 BEGIN SELECT RAISE(ABORT,'invoice_issued_immutable'); END;

CREATE TRIGGER invoice_issued_item_update BEFORE UPDATE ON invoice_items WHEN EXISTS(SELECT 1 FROM invoices WHERE id=OLD.invoice_id AND group_id=OLD.group_id AND status='issued')
 BEGIN SELECT RAISE(ABORT,'invoice_issued_immutable'); END;

CREATE TRIGGER invoice_lessons_delete BEFORE DELETE ON lessons WHEN (EXISTS(SELECT 1 FROM invoice_source_locks il WHERE il.group_id=OLD.group_id AND il.source_type='lesson' AND il.source_id=OLD.id) OR EXISTS(SELECT 1 FROM invoice_source_locks il JOIN billing_students ib ON ib.id=il.student_id AND ib.group_id=il.group_id WHERE il.source_type='student_month' AND il.group_id=OLD.group_id AND ib.student_name=OLD.student AND il.month=strftime('%Y-%m',coalesce((SELECT actual_start FROM class_sessions ils WHERE ils.id=OLD.session_id AND ils.group_id=OLD.group_id),OLD.actual_start,OLD.planned_start),'+8 hours'))) BEGIN SELECT RAISE(ABORT,'invoice_source_locked'); END;

CREATE TRIGGER invoice_lessons_insert BEFORE INSERT ON lessons WHEN (EXISTS(SELECT 1 FROM invoice_source_locks il WHERE il.group_id=NEW.group_id AND il.source_type='lesson' AND il.source_id=NEW.id) OR EXISTS(SELECT 1 FROM invoice_source_locks il JOIN billing_students ib ON ib.id=il.student_id AND ib.group_id=il.group_id WHERE il.source_type='student_month' AND il.group_id=NEW.group_id AND ib.student_name=NEW.student AND il.month=strftime('%Y-%m',coalesce((SELECT actual_start FROM class_sessions ils WHERE ils.id=NEW.session_id AND ils.group_id=NEW.group_id),NEW.actual_start,NEW.planned_start),'+8 hours'))) BEGIN SELECT RAISE(ABORT,'invoice_source_locked'); END;

CREATE TRIGGER invoice_lessons_update BEFORE UPDATE OF group_id,student,subject,teacher_name,planned_start,planned_end,actual_start,actual_end,status,chargeable,reviewed_at,reviewed_by,attendance_kind,session_id,replacement_for ON lessons WHEN ((OLD.group_id IS NOT NEW.group_id OR OLD.student IS NOT NEW.student OR OLD.subject IS NOT NEW.subject OR OLD.teacher_name IS NOT NEW.teacher_name OR OLD.planned_start IS NOT NEW.planned_start OR OLD.planned_end IS NOT NEW.planned_end OR OLD.actual_start IS NOT NEW.actual_start OR OLD.actual_end IS NOT NEW.actual_end OR OLD.status IS NOT NEW.status OR OLD.chargeable IS NOT NEW.chargeable OR OLD.reviewed_at IS NOT NEW.reviewed_at OR OLD.reviewed_by IS NOT NEW.reviewed_by OR OLD.attendance_kind IS NOT NEW.attendance_kind OR OLD.session_id IS NOT NEW.session_id OR OLD.replacement_for IS NOT NEW.replacement_for) AND ((EXISTS(SELECT 1 FROM invoice_source_locks il WHERE il.group_id=OLD.group_id AND il.source_type='lesson' AND il.source_id=OLD.id) OR EXISTS(SELECT 1 FROM invoice_source_locks il JOIN billing_students ib ON ib.id=il.student_id AND ib.group_id=il.group_id WHERE il.source_type='student_month' AND il.group_id=OLD.group_id AND ib.student_name=OLD.student AND il.month=strftime('%Y-%m',coalesce((SELECT actual_start FROM class_sessions ils WHERE ils.id=OLD.session_id AND ils.group_id=OLD.group_id),OLD.actual_start,OLD.planned_start),'+8 hours'))) OR (EXISTS(SELECT 1 FROM invoice_source_locks il WHERE il.group_id=NEW.group_id AND il.source_type='lesson' AND il.source_id=NEW.id) OR EXISTS(SELECT 1 FROM invoice_source_locks il JOIN billing_students ib ON ib.id=il.student_id AND ib.group_id=il.group_id WHERE il.source_type='student_month' AND il.group_id=NEW.group_id AND ib.student_name=NEW.student AND il.month=strftime('%Y-%m',coalesce((SELECT actual_start FROM class_sessions ils WHERE ils.id=NEW.session_id AND ils.group_id=NEW.group_id),NEW.actual_start,NEW.planned_start),'+8 hours'))))) AND NOT EXISTS(SELECT 1 FROM invoice_attendance_corrections c WHERE c.active=1 AND c.group_id=OLD.group_id AND c.lesson_id=OLD.id AND OLD.group_id IS NEW.group_id AND OLD.student IS NEW.student AND OLD.subject IS NEW.subject AND OLD.teacher_name IS NEW.teacher_name AND OLD.planned_start IS NEW.planned_start AND OLD.planned_end IS NEW.planned_end AND OLD.session_id IS NEW.session_id AND OLD.replacement_for IS NEW.replacement_for AND NEW.status IS json_extract(c.after_json,'$.status') AND NEW.attendance_kind IS json_extract(c.after_json,'$.attendanceKind') AND NEW.actual_start IS json_extract(c.after_json,'$.actualStart') AND NEW.actual_end IS json_extract(c.after_json,'$.actualEnd') AND NEW.chargeable IS json_extract(c.after_json,'$.chargeable') AND NEW.reviewed_at IS json_extract(c.after_json,'$.reviewedAt') AND NEW.reviewed_by IS json_extract(c.after_json,'$.reviewedBy')) BEGIN SELECT RAISE(ABORT,'invoice_source_locked'); END;

CREATE TRIGGER invoice_lock_delete BEFORE DELETE ON invoice_source_locks BEGIN SELECT RAISE(ABORT,'invoice_issued_immutable'); END;

CREATE TRIGGER invoice_lock_update BEFORE UPDATE ON invoice_source_locks BEGIN SELECT RAISE(ABORT,'invoice_issued_immutable'); END;

CREATE TRIGGER invoice_payment_identity BEFORE INSERT ON invoice_payments WHEN NOT EXISTS(SELECT 1 FROM invoice_finance_accounts a WHERE a.group_id=NEW.group_id AND a.invoice_id=NEW.invoice_id AND a.student_id=NEW.student_id)
 BEGIN SELECT RAISE(ABORT,'invoice_finance_payment_identity'); END;

CREATE TRIGGER invoice_payments_delete BEFORE DELETE ON invoice_payments BEGIN SELECT RAISE(ABORT,'invoice_finance_immutable'); END;

CREATE TRIGGER invoice_payments_update BEFORE UPDATE ON invoice_payments BEGIN SELECT RAISE(ABORT,'invoice_finance_immutable'); END;

CREATE TRIGGER invoice_receipt_identity BEFORE INSERT ON invoice_receipts WHEN NOT EXISTS(SELECT 1 FROM invoice_payments p WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND p.invoice_id=NEW.invoice_id AND p.amount_cents=json_extract(NEW.document_json,'$.amountCents') AND p.student_id=json_extract(NEW.document_json,'$.student.id'))
 OR json_extract(NEW.document_json,'$.id') IS NOT NEW.id OR json_extract(NEW.document_json,'$.invoiceId') IS NOT NEW.invoice_id OR json_extract(NEW.document_json,'$.number') IS NOT NEW.number
 BEGIN SELECT RAISE(ABORT,'invoice_finance_receipt_identity'); END;

CREATE TRIGGER invoice_receipts_delete BEFORE DELETE ON invoice_receipts BEGIN SELECT RAISE(ABORT,'invoice_finance_immutable'); END;

CREATE TRIGGER invoice_receipts_update BEFORE UPDATE ON invoice_receipts BEGIN SELECT RAISE(ABORT,'invoice_finance_immutable'); END;

CREATE TRIGGER prepayment_account_update BEFORE UPDATE ON prepayment_accounts WHEN NEW.group_id IS NOT OLD.group_id OR NEW.student_id IS NOT OLD.student_id OR NEW.created_at IS NOT OLD.created_at
 OR NEW.revision<>(SELECT count(*) FROM prepayment_events WHERE group_id=OLD.group_id AND student_id=OLD.student_id)
 OR NEW.received_cents<>coalesce((SELECT sum(amount_cents) FROM prepayment_events WHERE group_id=OLD.group_id AND student_id=OLD.student_id AND kind='payment'),0)
 OR NEW.refunded_cents<>coalesce((SELECT sum(amount_cents) FROM prepayment_events WHERE group_id=OLD.group_id AND student_id=OLD.student_id AND kind='refund'),0)
 OR NEW.reversed_cents<>coalesce((SELECT sum(amount_cents) FROM prepayment_events WHERE group_id=OLD.group_id AND student_id=OLD.student_id AND kind='reverse'),0)
 OR NEW.applied_cents<>coalesce((SELECT sum(CASE kind WHEN 'apply' THEN amount_cents WHEN 'release' THEN -amount_cents ELSE 0 END) FROM prepayment_events WHERE group_id=OLD.group_id AND student_id=OLD.student_id),0)
 BEGIN SELECT RAISE(ABORT,'prepayment_immutable'); END;

CREATE TRIGGER prepayment_allocation_identity BEFORE INSERT ON prepayment_allocations WHEN NOT EXISTS(SELECT 1 FROM prepayment_payments p JOIN invoice_finance_accounts a ON a.group_id=p.group_id AND a.student_id=p.student_id WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND p.student_id=NEW.student_id AND a.invoice_id=NEW.invoice_id AND a.voided_at IS NULL) BEGIN SELECT RAISE(ABORT,'prepayment_allocation_identity'); END;

CREATE TRIGGER prepayment_allocations_delete BEFORE DELETE ON prepayment_allocations BEGIN SELECT RAISE(ABORT,'prepayment_immutable'); END;

CREATE TRIGGER prepayment_allocations_update BEFORE UPDATE ON prepayment_allocations BEGIN SELECT RAISE(ABORT,'prepayment_immutable'); END;

CREATE TRIGGER prepayment_event_apply AFTER INSERT ON prepayment_events BEGIN
 UPDATE prepayment_accounts SET revision=revision+1,received_cents=received_cents+CASE WHEN NEW.kind='payment' THEN NEW.amount_cents ELSE 0 END,refunded_cents=refunded_cents+CASE WHEN NEW.kind='refund' THEN NEW.amount_cents ELSE 0 END,reversed_cents=reversed_cents+CASE WHEN NEW.kind='reverse' THEN NEW.amount_cents ELSE 0 END,applied_cents=applied_cents+CASE NEW.kind WHEN 'apply' THEN NEW.amount_cents WHEN 'release' THEN -NEW.amount_cents ELSE 0 END,updated_at=NEW.created_at WHERE group_id=NEW.group_id AND student_id=NEW.student_id;
 UPDATE invoice_finance_accounts SET revision=revision+1,prepayment_cents=prepayment_cents+CASE NEW.kind WHEN 'apply' THEN NEW.amount_cents ELSE -NEW.amount_cents END,updated_at=NEW.created_at WHERE group_id=NEW.group_id AND invoice_id=NEW.invoice_id AND NEW.kind IN('apply','release');
END;

CREATE TRIGGER prepayment_event_guard BEFORE INSERT ON prepayment_events BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM prepayment_accounts a JOIN prepayment_payments p ON p.group_id=a.group_id AND p.student_id=a.student_id WHERE a.group_id=NEW.group_id AND a.student_id=NEW.student_id AND a.revision=NEW.expected_revision AND p.id=NEW.payment_id) THEN RAISE(ABORT,'prepayment_changed') END;
 SELECT CASE WHEN NEW.kind='payment' AND NOT EXISTS(SELECT 1 FROM prepayment_payments p WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND p.amount_cents=NEW.amount_cents AND p.paid_at=NEW.occurred_at AND p.method=NEW.method) THEN RAISE(ABORT,'prepayment_payment_identity') END;
 SELECT CASE WHEN NEW.kind<>'payment' AND NOT EXISTS(SELECT 1 FROM prepayment_payments p WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND EXISTS(SELECT 1 FROM prepayment_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='payment') AND NOT EXISTS(SELECT 1 FROM prepayment_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='reverse') AND julianday(NEW.occurred_at)>=julianday(p.paid_at)) THEN RAISE(ABORT,'prepayment_payment_changed') END;
 SELECT CASE WHEN NEW.kind IN('refund','apply','reverse') AND NOT EXISTS(SELECT 1 FROM prepayment_payments p WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND NEW.amount_cents<=p.amount_cents-coalesce((SELECT sum(CASE kind WHEN 'refund' THEN amount_cents WHEN 'apply' THEN amount_cents WHEN 'release' THEN -amount_cents ELSE 0 END) FROM prepayment_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id),0)) THEN RAISE(ABORT,'prepayment_insufficient_balance') END;
 SELECT CASE WHEN NEW.kind='reverse' AND NOT EXISTS(SELECT 1 FROM prepayment_payments p WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND p.amount_cents=NEW.amount_cents AND p.method=NEW.method AND NOT EXISTS(SELECT 1 FROM prepayment_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='refund')) THEN RAISE(ABORT,'prepayment_invalid_reverse') END;
 SELECT CASE WHEN NEW.kind IN('apply','release') AND NOT EXISTS(SELECT 1 FROM invoice_finance_accounts a JOIN invoices i ON i.group_id=a.group_id AND i.id=a.invoice_id JOIN prepayment_allocations x ON x.group_id=a.group_id AND x.invoice_id=a.invoice_id WHERE a.group_id=NEW.group_id AND a.invoice_id=NEW.invoice_id AND a.student_id=NEW.student_id AND a.revision=NEW.expected_invoice_revision AND a.voided_at IS NULL AND i.status='issued' AND x.id=NEW.allocation_id AND x.payment_id=NEW.payment_id AND x.student_id=NEW.student_id AND CASE WHEN NEW.kind='apply' THEN x.amount_cents=NEW.amount_cents AND NEW.amount_cents<=a.original_total_cents+a.charge_cents-a.credit_cents-a.received_cents+a.reversed_cents+a.refunded_cents-a.prepayment_cents ELSE EXISTS(SELECT 1 FROM prepayment_events e WHERE e.group_id=x.group_id AND e.allocation_id=x.id AND e.kind='apply') AND NEW.amount_cents<=x.amount_cents-coalesce((SELECT sum(e.amount_cents) FROM prepayment_events e WHERE e.group_id=x.group_id AND e.allocation_id=x.id AND e.kind='release'),0) END) THEN RAISE(ABORT,'prepayment_invoice_changed') END;
 SELECT CASE WHEN NEW.kind='apply' AND EXISTS(SELECT 1 FROM prepayment_events e WHERE e.group_id=NEW.group_id AND e.allocation_id=NEW.allocation_id AND e.kind='apply') THEN RAISE(ABORT,'prepayment_allocation_duplicate') END;
END;

CREATE TRIGGER prepayment_events_delete BEFORE DELETE ON prepayment_events BEGIN SELECT RAISE(ABORT,'prepayment_immutable'); END;

CREATE TRIGGER prepayment_events_update BEFORE UPDATE ON prepayment_events BEGIN SELECT RAISE(ABORT,'prepayment_immutable'); END;

CREATE TRIGGER invoice_scope_conflict BEFORE INSERT ON invoices WHEN EXISTS(SELECT 1 FROM invoices prior WHERE prior.group_id=NEW.group_id AND prior.student_id=NEW.student_id AND prior.month=NEW.month AND (prior.billing_scope='all' OR NEW.billing_scope='all')) BEGIN SELECT RAISE(ABORT,'invoice_scope_conflict'); END;

CREATE TRIGGER invoice_scope_immutable BEFORE UPDATE OF group_id,student_id,month,billing_scope ON invoices WHEN OLD.group_id IS NOT NEW.group_id OR OLD.student_id IS NOT NEW.student_id OR OLD.month IS NOT NEW.month OR OLD.billing_scope IS NOT NEW.billing_scope BEGIN SELECT RAISE(ABORT,'invoice_scope_immutable'); END;

CREATE TABLE _0066_preservation_guard(ok INTEGER NOT NULL CHECK(ok=1));

INSERT INTO _0066_preservation_guard(ok) SELECT CASE WHEN (SELECT count(*) FROM "invoices")=(SELECT count(*) FROM "_0066_copy_invoices") AND NOT EXISTS(SELECT "id","group_id","student_id","month","status","revision","number","sequence_year","sequence_value","issued_at","created_at","updated_at","created_by","issued_by","due_date","notes","currency","source_hash","source_basis_json","adjustment_basis_json","document_json","total_cents","extension_json" FROM "invoices" EXCEPT SELECT "id","group_id","student_id","month","status","revision","number","sequence_year","sequence_value","issued_at","created_at","updated_at","created_by","issued_by","due_date","notes","currency","source_hash","source_basis_json","adjustment_basis_json","document_json","total_cents","extension_json" FROM "_0066_copy_invoices") AND NOT EXISTS(SELECT "id","group_id","student_id","month","status","revision","number","sequence_year","sequence_value","issued_at","created_at","updated_at","created_by","issued_by","due_date","notes","currency","source_hash","source_basis_json","adjustment_basis_json","document_json","total_cents","extension_json" FROM "_0066_copy_invoices" EXCEPT SELECT "id","group_id","student_id","month","status","revision","number","sequence_year","sequence_value","issued_at","created_at","updated_at","created_by","issued_by","due_date","notes","currency","source_hash","source_basis_json","adjustment_basis_json","document_json","total_cents","extension_json" FROM "invoices") THEN 1 ELSE 0 END;

INSERT INTO _0066_preservation_guard(ok) SELECT CASE WHEN (SELECT count(*) FROM "invoice_finance_accounts")=(SELECT count(*) FROM "_0066_copy_invoice_finance_accounts") AND NOT EXISTS(SELECT "group_id","invoice_id","student_id","original_total_cents","charge_cents","credit_cents","received_cents","reversed_cents","refunded_cents","revision","voided_at","voided_by","void_reason","created_at","updated_at","prepayment_cents" FROM "invoice_finance_accounts" EXCEPT SELECT "group_id","invoice_id","student_id","original_total_cents","charge_cents","credit_cents","received_cents","reversed_cents","refunded_cents","revision","voided_at","voided_by","void_reason","created_at","updated_at","prepayment_cents" FROM "_0066_copy_invoice_finance_accounts") AND NOT EXISTS(SELECT "group_id","invoice_id","student_id","original_total_cents","charge_cents","credit_cents","received_cents","reversed_cents","refunded_cents","revision","voided_at","voided_by","void_reason","created_at","updated_at","prepayment_cents" FROM "_0066_copy_invoice_finance_accounts" EXCEPT SELECT "group_id","invoice_id","student_id","original_total_cents","charge_cents","credit_cents","received_cents","reversed_cents","refunded_cents","revision","voided_at","voided_by","void_reason","created_at","updated_at","prepayment_cents" FROM "invoice_finance_accounts") THEN 1 ELSE 0 END;

INSERT INTO _0066_preservation_guard(ok) SELECT CASE WHEN (SELECT count(*) FROM "invoice_items")=(SELECT count(*) FROM "_0066_copy_invoice_items") AND NOT EXISTS(SELECT "id","group_id","invoice_id","position","kind","source_id","amount_cents","snapshot_json" FROM "invoice_items" EXCEPT SELECT "id","group_id","invoice_id","position","kind","source_id","amount_cents","snapshot_json" FROM "_0066_copy_invoice_items") AND NOT EXISTS(SELECT "id","group_id","invoice_id","position","kind","source_id","amount_cents","snapshot_json" FROM "_0066_copy_invoice_items" EXCEPT SELECT "id","group_id","invoice_id","position","kind","source_id","amount_cents","snapshot_json" FROM "invoice_items") THEN 1 ELSE 0 END;

INSERT INTO _0066_preservation_guard(ok) SELECT CASE WHEN (SELECT count(*) FROM "invoice_source_locks")=(SELECT count(*) FROM "_0066_copy_invoice_source_locks") AND NOT EXISTS(SELECT "group_id","invoice_id","source_type","source_id","student_id","month","created_at" FROM "invoice_source_locks" EXCEPT SELECT "group_id","invoice_id","source_type","source_id","student_id","month","created_at" FROM "_0066_copy_invoice_source_locks") AND NOT EXISTS(SELECT "group_id","invoice_id","source_type","source_id","student_id","month","created_at" FROM "_0066_copy_invoice_source_locks" EXCEPT SELECT "group_id","invoice_id","source_type","source_id","student_id","month","created_at" FROM "invoice_source_locks") THEN 1 ELSE 0 END;

INSERT INTO _0066_preservation_guard(ok) SELECT CASE WHEN (SELECT count(*) FROM "invoice_payments")=(SELECT count(*) FROM "_0066_copy_invoice_payments") AND NOT EXISTS(SELECT "id","group_id","invoice_id","student_id","amount_cents","paid_at","method","reference","notes","created_by","created_at","operation_id" FROM "invoice_payments" EXCEPT SELECT "id","group_id","invoice_id","student_id","amount_cents","paid_at","method","reference","notes","created_by","created_at","operation_id" FROM "_0066_copy_invoice_payments") AND NOT EXISTS(SELECT "id","group_id","invoice_id","student_id","amount_cents","paid_at","method","reference","notes","created_by","created_at","operation_id" FROM "_0066_copy_invoice_payments" EXCEPT SELECT "id","group_id","invoice_id","student_id","amount_cents","paid_at","method","reference","notes","created_by","created_at","operation_id" FROM "invoice_payments") THEN 1 ELSE 0 END;

INSERT INTO _0066_preservation_guard(ok) SELECT CASE WHEN (SELECT count(*) FROM "prepayment_allocations")=(SELECT count(*) FROM "_0066_copy_prepayment_allocations") AND NOT EXISTS(SELECT "id","group_id","student_id","payment_id","invoice_id","amount_cents","created_at","operation_id" FROM "prepayment_allocations" EXCEPT SELECT "id","group_id","student_id","payment_id","invoice_id","amount_cents","created_at","operation_id" FROM "_0066_copy_prepayment_allocations") AND NOT EXISTS(SELECT "id","group_id","student_id","payment_id","invoice_id","amount_cents","created_at","operation_id" FROM "_0066_copy_prepayment_allocations" EXCEPT SELECT "id","group_id","student_id","payment_id","invoice_id","amount_cents","created_at","operation_id" FROM "prepayment_allocations") THEN 1 ELSE 0 END;

INSERT INTO _0066_preservation_guard(ok) SELECT CASE WHEN (SELECT count(*) FROM "invoice_finance_events")=(SELECT count(*) FROM "_0066_copy_invoice_finance_events") AND NOT EXISTS(SELECT "id","group_id","invoice_id","payment_id","kind","amount_cents","occurred_at","method","reason","notes","reference","actor_id","created_at","operation_id","expected_revision" FROM "invoice_finance_events" EXCEPT SELECT "id","group_id","invoice_id","payment_id","kind","amount_cents","occurred_at","method","reason","notes","reference","actor_id","created_at","operation_id","expected_revision" FROM "_0066_copy_invoice_finance_events") AND NOT EXISTS(SELECT "id","group_id","invoice_id","payment_id","kind","amount_cents","occurred_at","method","reason","notes","reference","actor_id","created_at","operation_id","expected_revision" FROM "_0066_copy_invoice_finance_events" EXCEPT SELECT "id","group_id","invoice_id","payment_id","kind","amount_cents","occurred_at","method","reason","notes","reference","actor_id","created_at","operation_id","expected_revision" FROM "invoice_finance_events") THEN 1 ELSE 0 END;

INSERT INTO _0066_preservation_guard(ok) SELECT CASE WHEN (SELECT count(*) FROM "invoice_receipts")=(SELECT count(*) FROM "_0066_copy_invoice_receipts") AND NOT EXISTS(SELECT "id","group_id","invoice_id","payment_id","number","sequence_year","sequence_value","document_json","created_at" FROM "invoice_receipts" EXCEPT SELECT "id","group_id","invoice_id","payment_id","number","sequence_year","sequence_value","document_json","created_at" FROM "_0066_copy_invoice_receipts") AND NOT EXISTS(SELECT "id","group_id","invoice_id","payment_id","number","sequence_year","sequence_value","document_json","created_at" FROM "_0066_copy_invoice_receipts" EXCEPT SELECT "id","group_id","invoice_id","payment_id","number","sequence_year","sequence_value","document_json","created_at" FROM "invoice_receipts") THEN 1 ELSE 0 END;

INSERT INTO _0066_preservation_guard(ok) SELECT CASE WHEN (SELECT count(*) FROM "prepayment_events")=(SELECT count(*) FROM "_0066_copy_prepayment_events") AND NOT EXISTS(SELECT "id","group_id","student_id","payment_id","invoice_id","allocation_id","kind","amount_cents","occurred_at","method","reason","notes","reference","actor_id","created_at","operation_id","expected_revision","expected_invoice_revision" FROM "prepayment_events" EXCEPT SELECT "id","group_id","student_id","payment_id","invoice_id","allocation_id","kind","amount_cents","occurred_at","method","reason","notes","reference","actor_id","created_at","operation_id","expected_revision","expected_invoice_revision" FROM "_0066_copy_prepayment_events") AND NOT EXISTS(SELECT "id","group_id","student_id","payment_id","invoice_id","allocation_id","kind","amount_cents","occurred_at","method","reason","notes","reference","actor_id","created_at","operation_id","expected_revision","expected_invoice_revision" FROM "_0066_copy_prepayment_events" EXCEPT SELECT "id","group_id","student_id","payment_id","invoice_id","allocation_id","kind","amount_cents","occurred_at","method","reason","notes","reference","actor_id","created_at","operation_id","expected_revision","expected_invoice_revision" FROM "prepayment_events") THEN 1 ELSE 0 END;

INSERT INTO _0066_preservation_guard(ok) SELECT CASE WHEN (SELECT count(*) FROM "invoice_attendance_corrections")=(SELECT count(*) FROM "_0066_copy_invoice_attendance_corrections") AND NOT EXISTS(SELECT "id","group_id","invoice_id","lesson_id","session_id","event_id","operation_id","actor_id","reason","before_json","after_json","active","created_at","closed_at" FROM "invoice_attendance_corrections" EXCEPT SELECT "id","group_id","invoice_id","lesson_id","session_id","event_id","operation_id","actor_id","reason","before_json","after_json","active","created_at","closed_at" FROM "_0066_copy_invoice_attendance_corrections") AND NOT EXISTS(SELECT "id","group_id","invoice_id","lesson_id","session_id","event_id","operation_id","actor_id","reason","before_json","after_json","active","created_at","closed_at" FROM "_0066_copy_invoice_attendance_corrections" EXCEPT SELECT "id","group_id","invoice_id","lesson_id","session_id","event_id","operation_id","actor_id","reason","before_json","after_json","active","created_at","closed_at" FROM "invoice_attendance_corrections") THEN 1 ELSE 0 END;

DROP TABLE _0066_preservation_guard;

DROP TABLE "_0066_copy_invoice_attendance_corrections";

DROP TABLE "_0066_copy_prepayment_events";

DROP TABLE "_0066_copy_invoice_receipts";

DROP TABLE "_0066_copy_invoice_finance_events";

DROP TABLE "_0066_copy_prepayment_allocations";

DROP TABLE "_0066_copy_invoice_payments";

DROP TABLE "_0066_copy_invoice_source_locks";

DROP TABLE "_0066_copy_invoice_items";

DROP TABLE "_0066_copy_invoice_finance_accounts";

DROP TABLE "_0066_copy_invoices";

PRAGMA defer_foreign_keys=OFF;
