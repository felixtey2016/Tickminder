-- Student advance payments are independent of final invoices and their immutable cash receipts.
ALTER TABLE invoice_finance_accounts ADD COLUMN prepayment_cents INTEGER NOT NULL DEFAULT 0 CHECK(prepayment_cents>=0);
CREATE TABLE prepayment_accounts(
 group_id TEXT NOT NULL, student_id TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 received_cents INTEGER NOT NULL DEFAULT 0 CHECK(received_cents>=0),refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK(refunded_cents>=0),reversed_cents INTEGER NOT NULL DEFAULT 0 CHECK(reversed_cents>=0),applied_cents INTEGER NOT NULL DEFAULT 0 CHECK(applied_cents>=0),
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(group_id,student_id),
 FOREIGN KEY(group_id,student_id) REFERENCES billing_students(group_id,id) ON DELETE RESTRICT,
 CHECK(received_cents-refunded_cents-reversed_cents-applied_cents>=0)
);
CREATE TABLE prepayment_operations(
 group_id TEXT NOT NULL REFERENCES tuition_groups(id),operation_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,request_hash TEXT NOT NULL,execution_id TEXT NOT NULL,result_json TEXT NOT NULL CHECK(json_valid(result_json)),created_at TEXT NOT NULL,PRIMARY KEY(group_id,operation_id)
);
CREATE TABLE prepayment_sequences(
 group_id TEXT NOT NULL REFERENCES tuition_groups(id),kind TEXT NOT NULL CHECK(kind IN('request','receipt')),year TEXT NOT NULL,last_value INTEGER NOT NULL CHECK(last_value>0),PRIMARY KEY(group_id,kind,year)
);
CREATE TABLE prepayment_requests(
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL,student_id TEXT NOT NULL,month TEXT NOT NULL,subject_key TEXT,
 status TEXT NOT NULL CHECK(status IN('draft','issued','void')),revision INTEGER NOT NULL CHECK(revision>0),number TEXT,issued_at TEXT,
 source_hash TEXT NOT NULL,source_basis_json TEXT NOT NULL CHECK(json_valid(source_basis_json)),document_json TEXT NOT NULL CHECK(json_valid(document_json)),
 total_cents INTEGER NOT NULL CHECK(total_cents BETWEEN 0 AND 100000000),created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,voided_at TEXT,voided_by TEXT,void_reason TEXT NOT NULL DEFAULT '',
 UNIQUE(group_id,id),UNIQUE(group_id,number),FOREIGN KEY(group_id,student_id) REFERENCES billing_students(group_id,id) ON DELETE RESTRICT,
 CHECK(status='draft' AND number IS NULL AND issued_at IS NULL OR status IN('issued','void') AND number IS NOT NULL AND issued_at IS NOT NULL),
 CHECK(status<>'void' OR length(trim(void_reason))>0 AND voided_at IS NOT NULL)
);
CREATE INDEX prepayment_requests_month_idx ON prepayment_requests(group_id,month,student_id,created_at);
CREATE TABLE prepayment_payments(
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL,student_id TEXT NOT NULL,request_id TEXT,amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000),paid_at TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method IN('cash','bank_transfer','duitnow','tng','other')),reference TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL,created_at TEXT NOT NULL,operation_id TEXT NOT NULL,
 UNIQUE(group_id,id),UNIQUE(group_id,operation_id),
 FOREIGN KEY(group_id,student_id) REFERENCES prepayment_accounts(group_id,student_id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,request_id) REFERENCES prepayment_requests(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,operation_id) REFERENCES prepayment_operations(group_id,operation_id) ON DELETE RESTRICT
);
CREATE INDEX prepayment_payments_student_idx ON prepayment_payments(group_id,student_id,created_at,id);
CREATE TABLE prepayment_receipts(
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL,payment_id TEXT NOT NULL,number TEXT NOT NULL,document_json TEXT NOT NULL CHECK(json_valid(document_json)),created_at TEXT NOT NULL,
 UNIQUE(group_id,id),UNIQUE(group_id,payment_id),UNIQUE(group_id,number),
 FOREIGN KEY(group_id,payment_id) REFERENCES prepayment_payments(group_id,id) ON DELETE RESTRICT
);
CREATE TABLE prepayment_allocations(
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL,student_id TEXT NOT NULL,payment_id TEXT NOT NULL,invoice_id TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000),created_at TEXT NOT NULL,operation_id TEXT NOT NULL,
 UNIQUE(group_id,id),UNIQUE(group_id,operation_id),
 FOREIGN KEY(group_id,payment_id) REFERENCES prepayment_payments(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,invoice_id) REFERENCES invoice_finance_accounts(group_id,invoice_id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,operation_id) REFERENCES prepayment_operations(group_id,operation_id) ON DELETE RESTRICT
);
CREATE INDEX prepayment_allocations_invoice_idx ON prepayment_allocations(group_id,invoice_id,created_at,id);
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
CREATE INDEX prepayment_events_month_idx ON prepayment_events(group_id,occurred_at,kind,id);
CREATE INDEX prepayment_events_payment_idx ON prepayment_events(group_id,payment_id,kind);
CREATE INDEX prepayment_events_invoice_idx ON prepayment_events(group_id,invoice_id,kind);
CREATE UNIQUE INDEX prepayment_payment_once ON prepayment_events(group_id,payment_id,kind) WHERE kind IN('payment','reverse');
CREATE TRIGGER prepayment_account_insert BEFORE INSERT ON prepayment_accounts WHEN NEW.revision<>0 OR NEW.received_cents<>0 OR NEW.refunded_cents<>0 OR NEW.reversed_cents<>0 OR NEW.applied_cents<>0 BEGIN SELECT RAISE(ABORT,'prepayment_invalid_account'); END;
CREATE TRIGGER prepayment_payment_identity BEFORE INSERT ON prepayment_payments WHEN NEW.request_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM prepayment_requests r WHERE r.group_id=NEW.group_id AND r.id=NEW.request_id AND r.student_id=NEW.student_id AND r.status='issued') BEGIN SELECT RAISE(ABORT,'prepayment_request_changed'); END;
CREATE TRIGGER prepayment_allocation_identity BEFORE INSERT ON prepayment_allocations WHEN NOT EXISTS(SELECT 1 FROM prepayment_payments p JOIN invoice_finance_accounts a ON a.group_id=p.group_id AND a.student_id=p.student_id WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND p.student_id=NEW.student_id AND a.invoice_id=NEW.invoice_id AND a.voided_at IS NULL) BEGIN SELECT RAISE(ABORT,'prepayment_allocation_identity'); END;
CREATE TRIGGER prepayment_event_guard BEFORE INSERT ON prepayment_events BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM prepayment_accounts a JOIN prepayment_payments p ON p.group_id=a.group_id AND p.student_id=a.student_id WHERE a.group_id=NEW.group_id AND a.student_id=NEW.student_id AND a.revision=NEW.expected_revision AND p.id=NEW.payment_id) THEN RAISE(ABORT,'prepayment_changed') END;
 SELECT CASE WHEN NEW.kind='payment' AND NOT EXISTS(SELECT 1 FROM prepayment_payments p WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND p.amount_cents=NEW.amount_cents AND p.paid_at=NEW.occurred_at AND p.method=NEW.method) THEN RAISE(ABORT,'prepayment_payment_identity') END;
 SELECT CASE WHEN NEW.kind<>'payment' AND NOT EXISTS(SELECT 1 FROM prepayment_payments p WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND EXISTS(SELECT 1 FROM prepayment_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='payment') AND NOT EXISTS(SELECT 1 FROM prepayment_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='reverse') AND julianday(NEW.occurred_at)>=julianday(p.paid_at)) THEN RAISE(ABORT,'prepayment_payment_changed') END;
 SELECT CASE WHEN NEW.kind IN('refund','apply','reverse') AND NOT EXISTS(SELECT 1 FROM prepayment_payments p WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND NEW.amount_cents<=p.amount_cents-coalesce((SELECT sum(CASE kind WHEN 'refund' THEN amount_cents WHEN 'apply' THEN amount_cents WHEN 'release' THEN -amount_cents ELSE 0 END) FROM prepayment_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id),0)) THEN RAISE(ABORT,'prepayment_insufficient_balance') END;
 SELECT CASE WHEN NEW.kind='reverse' AND NOT EXISTS(SELECT 1 FROM prepayment_payments p WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND p.amount_cents=NEW.amount_cents AND p.method=NEW.method AND NOT EXISTS(SELECT 1 FROM prepayment_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='refund')) THEN RAISE(ABORT,'prepayment_invalid_reverse') END;
 SELECT CASE WHEN NEW.kind IN('apply','release') AND NOT EXISTS(SELECT 1 FROM invoice_finance_accounts a JOIN invoices i ON i.group_id=a.group_id AND i.id=a.invoice_id JOIN prepayment_allocations x ON x.group_id=a.group_id AND x.invoice_id=a.invoice_id WHERE a.group_id=NEW.group_id AND a.invoice_id=NEW.invoice_id AND a.student_id=NEW.student_id AND a.revision=NEW.expected_invoice_revision AND a.voided_at IS NULL AND i.status='issued' AND x.id=NEW.allocation_id AND x.payment_id=NEW.payment_id AND x.student_id=NEW.student_id AND CASE WHEN NEW.kind='apply' THEN x.amount_cents=NEW.amount_cents AND NEW.amount_cents<=a.original_total_cents+a.charge_cents-a.credit_cents-a.received_cents+a.reversed_cents+a.refunded_cents-a.prepayment_cents ELSE EXISTS(SELECT 1 FROM prepayment_events e WHERE e.group_id=x.group_id AND e.allocation_id=x.id AND e.kind='apply') AND NEW.amount_cents<=x.amount_cents-coalesce((SELECT sum(e.amount_cents) FROM prepayment_events e WHERE e.group_id=x.group_id AND e.allocation_id=x.id AND e.kind='release'),0) END) THEN RAISE(ABORT,'prepayment_invoice_changed') END;
 SELECT CASE WHEN NEW.kind='apply' AND EXISTS(SELECT 1 FROM prepayment_events e WHERE e.group_id=NEW.group_id AND e.allocation_id=NEW.allocation_id AND e.kind='apply') THEN RAISE(ABORT,'prepayment_allocation_duplicate') END;
END;
CREATE TRIGGER prepayment_event_apply AFTER INSERT ON prepayment_events BEGIN
 UPDATE prepayment_accounts SET revision=revision+1,received_cents=received_cents+CASE WHEN NEW.kind='payment' THEN NEW.amount_cents ELSE 0 END,refunded_cents=refunded_cents+CASE WHEN NEW.kind='refund' THEN NEW.amount_cents ELSE 0 END,reversed_cents=reversed_cents+CASE WHEN NEW.kind='reverse' THEN NEW.amount_cents ELSE 0 END,applied_cents=applied_cents+CASE NEW.kind WHEN 'apply' THEN NEW.amount_cents WHEN 'release' THEN -NEW.amount_cents ELSE 0 END,updated_at=NEW.created_at WHERE group_id=NEW.group_id AND student_id=NEW.student_id;
 UPDATE invoice_finance_accounts SET revision=revision+1,prepayment_cents=prepayment_cents+CASE NEW.kind WHEN 'apply' THEN NEW.amount_cents ELSE -NEW.amount_cents END,updated_at=NEW.created_at WHERE group_id=NEW.group_id AND invoice_id=NEW.invoice_id AND NEW.kind IN('apply','release');
END;
CREATE TRIGGER prepayment_account_update BEFORE UPDATE ON prepayment_accounts WHEN NEW.group_id IS NOT OLD.group_id OR NEW.student_id IS NOT OLD.student_id OR NEW.created_at IS NOT OLD.created_at
 OR NEW.revision<>(SELECT count(*) FROM prepayment_events WHERE group_id=OLD.group_id AND student_id=OLD.student_id)
 OR NEW.received_cents<>coalesce((SELECT sum(amount_cents) FROM prepayment_events WHERE group_id=OLD.group_id AND student_id=OLD.student_id AND kind='payment'),0)
 OR NEW.refunded_cents<>coalesce((SELECT sum(amount_cents) FROM prepayment_events WHERE group_id=OLD.group_id AND student_id=OLD.student_id AND kind='refund'),0)
 OR NEW.reversed_cents<>coalesce((SELECT sum(amount_cents) FROM prepayment_events WHERE group_id=OLD.group_id AND student_id=OLD.student_id AND kind='reverse'),0)
 OR NEW.applied_cents<>coalesce((SELECT sum(CASE kind WHEN 'apply' THEN amount_cents WHEN 'release' THEN -amount_cents ELSE 0 END) FROM prepayment_events WHERE group_id=OLD.group_id AND student_id=OLD.student_id),0)
 BEGIN SELECT RAISE(ABORT,'prepayment_immutable'); END;
CREATE TRIGGER prepayment_receipt_identity BEFORE INSERT ON prepayment_receipts WHEN NOT EXISTS(SELECT 1 FROM prepayment_payments p WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND p.amount_cents=json_extract(NEW.document_json,'$.amountCents') AND p.student_id=json_extract(NEW.document_json,'$.student.id')) OR json_extract(NEW.document_json,'$.id') IS NOT NEW.id OR json_extract(NEW.document_json,'$.number') IS NOT NEW.number BEGIN SELECT RAISE(ABORT,'prepayment_receipt_identity'); END;
CREATE TRIGGER prepayment_request_update BEFORE UPDATE ON prepayment_requests WHEN NEW.id IS NOT OLD.id OR NEW.group_id IS NOT OLD.group_id OR NEW.student_id IS NOT OLD.student_id OR NEW.created_at IS NOT OLD.created_at OR NEW.created_by IS NOT OLD.created_by OR NEW.revision<>OLD.revision+1 OR OLD.status='void' OR OLD.status='issued' AND (NEW.status<>'void' OR NEW.document_json IS NOT OLD.document_json OR NEW.source_basis_json IS NOT OLD.source_basis_json OR NEW.source_hash IS NOT OLD.source_hash OR NEW.total_cents<>OLD.total_cents OR NEW.month IS NOT OLD.month OR NEW.subject_key IS NOT OLD.subject_key OR NEW.number IS NOT OLD.number OR NEW.issued_at IS NOT OLD.issued_at) BEGIN SELECT RAISE(ABORT,'prepayment_request_immutable'); END;
CREATE TRIGGER prepayment_request_delete BEFORE DELETE ON prepayment_requests WHEN OLD.status<>'draft' BEGIN SELECT RAISE(ABORT,'prepayment_request_immutable'); END;
-- Extend aggregate verification without rewriting any historic invoice, event or receipt bytes.
DROP TRIGGER invoice_finance_account_insert;
CREATE TRIGGER invoice_finance_account_insert BEFORE INSERT ON invoice_finance_accounts WHEN NOT EXISTS(SELECT 1 FROM invoices i WHERE i.group_id=NEW.group_id AND i.id=NEW.invoice_id AND i.student_id=NEW.student_id AND i.status='issued' AND i.total_cents=NEW.original_total_cents) OR NEW.revision<>0 OR NEW.charge_cents<>0 OR NEW.credit_cents<>0 OR NEW.received_cents<>0 OR NEW.reversed_cents<>0 OR NEW.refunded_cents<>0 OR NEW.prepayment_cents<>0 OR NEW.voided_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'invoice_finance_invalid_account'); END;
DROP TRIGGER invoice_finance_account_update;

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
CREATE TABLE prepayment_collection_settings(
 group_id TEXT NOT NULL,student_id TEXT NOT NULL,subject_key TEXT NOT NULL,timing TEXT NOT NULL CHECK(timing IN('advance','arrears')),revision INTEGER NOT NULL CHECK(revision>0),updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,
 PRIMARY KEY(group_id,student_id,subject_key),FOREIGN KEY(group_id,student_id,subject_key) REFERENCES billing_subjects(group_id,student_id,subject_key) ON DELETE RESTRICT
);

DROP TRIGGER invoice_finance_event_guard;
CREATE TRIGGER invoice_finance_event_guard BEFORE INSERT ON invoice_finance_events BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM invoice_finance_accounts a JOIN invoices i ON i.group_id=a.group_id AND i.id=a.invoice_id WHERE a.group_id=NEW.group_id AND a.invoice_id=NEW.invoice_id AND a.revision=NEW.expected_revision AND a.voided_at IS NULL AND i.status='issued') THEN RAISE(ABORT,'invoice_finance_changed') END;
 SELECT CASE WHEN NEW.kind='payment' AND (NOT EXISTS(SELECT 1 FROM invoice_payments p JOIN invoice_finance_accounts a ON a.group_id=p.group_id AND a.invoice_id=p.invoice_id WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND p.invoice_id=NEW.invoice_id AND p.amount_cents=NEW.amount_cents AND NEW.amount_cents<=a.original_total_cents+a.charge_cents-a.credit_cents-a.received_cents+a.reversed_cents+a.refunded_cents-a.prepayment_cents)) THEN RAISE(ABORT,'invoice_finance_overpayment') END;
 SELECT CASE WHEN NEW.kind IN('reverse','refund') AND NOT EXISTS(SELECT 1 FROM invoice_payments p WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND p.invoice_id=NEW.invoice_id AND julianday(NEW.occurred_at)>=julianday(p.paid_at) AND NOT EXISTS(SELECT 1 FROM invoice_finance_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='reverse') AND EXISTS(SELECT 1 FROM invoice_finance_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='payment') AND CASE WHEN NEW.kind='reverse' THEN p.amount_cents=NEW.amount_cents AND NOT EXISTS(SELECT 1 FROM invoice_finance_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='refund') ELSE NEW.amount_cents<=p.amount_cents-coalesce((SELECT sum(e.amount_cents) FROM invoice_finance_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='refund'),0) END) THEN RAISE(ABORT,'invoice_finance_invalid_refund') END;
 SELECT CASE WHEN NEW.kind='credit' AND NOT EXISTS(SELECT 1 FROM invoice_finance_accounts a WHERE a.group_id=NEW.group_id AND a.invoice_id=NEW.invoice_id AND NEW.amount_cents<=a.original_total_cents+a.charge_cents-a.credit_cents-a.prepayment_cents) THEN RAISE(ABORT,'invoice_finance_invalid_credit') END;
 SELECT CASE WHEN NEW.kind='charge' AND NOT EXISTS(SELECT 1 FROM invoice_finance_accounts a WHERE a.group_id=NEW.group_id AND a.invoice_id=NEW.invoice_id AND a.original_total_cents+a.charge_cents-a.credit_cents+NEW.amount_cents<=100000000) THEN RAISE(ABORT,'invoice_finance_invalid_charge') END;
 SELECT CASE WHEN NEW.kind='void' AND NOT EXISTS(SELECT 1 FROM invoice_finance_accounts a WHERE a.group_id=NEW.group_id AND a.invoice_id=NEW.invoice_id AND a.received_cents-a.reversed_cents-a.refunded_cents+a.prepayment_cents=0) THEN RAISE(ABORT,'invoice_finance_void_has_payment') END;
END;
CREATE TRIGGER prepayment_payments_update BEFORE UPDATE ON prepayment_payments BEGIN SELECT RAISE(ABORT,'prepayment_immutable'); END;
CREATE TRIGGER prepayment_payments_delete BEFORE DELETE ON prepayment_payments BEGIN SELECT RAISE(ABORT,'prepayment_immutable'); END;
CREATE TRIGGER prepayment_receipts_update BEFORE UPDATE ON prepayment_receipts BEGIN SELECT RAISE(ABORT,'prepayment_immutable'); END;
CREATE TRIGGER prepayment_receipts_delete BEFORE DELETE ON prepayment_receipts BEGIN SELECT RAISE(ABORT,'prepayment_immutable'); END;
CREATE TRIGGER prepayment_allocations_update BEFORE UPDATE ON prepayment_allocations BEGIN SELECT RAISE(ABORT,'prepayment_immutable'); END;
CREATE TRIGGER prepayment_allocations_delete BEFORE DELETE ON prepayment_allocations BEGIN SELECT RAISE(ABORT,'prepayment_immutable'); END;
CREATE TRIGGER prepayment_events_update BEFORE UPDATE ON prepayment_events BEGIN SELECT RAISE(ABORT,'prepayment_immutable'); END;
CREATE TRIGGER prepayment_events_delete BEFORE DELETE ON prepayment_events BEGIN SELECT RAISE(ABORT,'prepayment_immutable'); END;
CREATE TRIGGER prepayment_account_delete BEFORE DELETE ON prepayment_accounts BEGIN SELECT RAISE(ABORT,'prepayment_immutable'); END;
CREATE TRIGGER prepayment_request_insert_identity BEFORE INSERT ON prepayment_requests WHEN
 json_extract(NEW.document_json,'$.id') IS NOT NEW.id OR json_extract(NEW.document_json,'$.groupId') IS NOT NEW.group_id OR json_extract(NEW.document_json,'$.studentId') IS NOT NEW.student_id OR json_extract(NEW.document_json,'$.student.id') IS NOT NEW.student_id OR json_extract(NEW.document_json,'$.month') IS NOT NEW.month OR json_extract(NEW.document_json,'$.totalCents') IS NOT NEW.total_cents OR json_extract(NEW.document_json,'$.sourceHash') IS NOT NEW.source_hash OR json_extract(NEW.document_json,'$.status') IS NOT NEW.status OR json_extract(NEW.document_json,'$.revision') IS NOT NEW.revision OR json_extract(NEW.document_json,'$.number') IS NOT NEW.number
 BEGIN SELECT RAISE(ABORT,'prepayment_request_identity'); END;
CREATE TRIGGER prepayment_request_update_identity BEFORE UPDATE ON prepayment_requests WHEN
 json_extract(NEW.document_json,'$.id') IS NOT NEW.id OR json_extract(NEW.document_json,'$.groupId') IS NOT NEW.group_id OR json_extract(NEW.document_json,'$.studentId') IS NOT NEW.student_id OR json_extract(NEW.document_json,'$.student.id') IS NOT NEW.student_id OR json_extract(NEW.document_json,'$.month') IS NOT NEW.month OR json_extract(NEW.document_json,'$.totalCents') IS NOT NEW.total_cents OR json_extract(NEW.document_json,'$.sourceHash') IS NOT NEW.source_hash OR json_extract(NEW.document_json,'$.status') IS NOT CASE WHEN NEW.status='void' THEN 'issued' ELSE NEW.status END OR NEW.status<>'void' AND json_extract(NEW.document_json,'$.revision') IS NOT NEW.revision OR json_extract(NEW.document_json,'$.number') IS NOT NEW.number
 BEGIN SELECT RAISE(ABORT,'prepayment_request_identity'); END;

CREATE TRIGGER prepayment_request_unique_issue BEFORE UPDATE ON prepayment_requests WHEN NEW.status='issued' AND OLD.status='draft' AND EXISTS(
 SELECT 1 FROM prepayment_requests r,json_each(r.document_json,'$.lessons') x,json_each(NEW.document_json,'$.lessons') y
 WHERE r.group_id=NEW.group_id AND r.student_id=NEW.student_id AND r.status='issued' AND r.id<>NEW.id AND json_extract(x.value,'$.lessonId')=json_extract(y.value,'$.lessonId')
) BEGIN SELECT RAISE(ABORT,'prepayment_request_duplicate_issue'); END;
