-- Issued invoice originals remain immutable. Every change is an append-only ledger event.
CREATE TABLE invoice_finance_accounts (
 group_id TEXT NOT NULL, invoice_id TEXT NOT NULL, student_id TEXT NOT NULL,
 original_total_cents INTEGER NOT NULL CHECK(original_total_cents BETWEEN 0 AND 100000000),
 charge_cents INTEGER NOT NULL DEFAULT 0 CHECK(charge_cents>=0), credit_cents INTEGER NOT NULL DEFAULT 0 CHECK(credit_cents>=0),
 received_cents INTEGER NOT NULL DEFAULT 0 CHECK(received_cents>=0), reversed_cents INTEGER NOT NULL DEFAULT 0 CHECK(reversed_cents>=0), refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK(refunded_cents>=0),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0), voided_at TEXT, voided_by TEXT, void_reason TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(group_id,invoice_id),
 FOREIGN KEY(group_id,invoice_id) REFERENCES invoices(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,student_id) REFERENCES billing_students(group_id,id) ON DELETE RESTRICT,
 CHECK(original_total_cents+charge_cents-credit_cents BETWEEN 0 AND 100000000),
 CHECK(received_cents-reversed_cents-refunded_cents>=0)
);
CREATE TABLE invoice_finance_operations (
 group_id TEXT NOT NULL REFERENCES tuition_groups(id), operation_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 action TEXT NOT NULL, request_hash TEXT NOT NULL, execution_id TEXT NOT NULL,
 result_json TEXT NOT NULL CHECK(json_valid(result_json)), created_at TEXT NOT NULL, PRIMARY KEY(group_id,operation_id)
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
CREATE INDEX invoice_payments_invoice_idx ON invoice_payments(group_id,invoice_id,created_at,id);
CREATE TABLE invoice_receipt_sequences (
 group_id TEXT NOT NULL REFERENCES tuition_groups(id), year TEXT NOT NULL, last_value INTEGER NOT NULL CHECK(last_value>0), PRIMARY KEY(group_id,year)
);
CREATE TABLE invoice_receipts (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, invoice_id TEXT NOT NULL, payment_id TEXT NOT NULL,
 number TEXT NOT NULL, sequence_year TEXT NOT NULL, sequence_value INTEGER NOT NULL CHECK(sequence_value>0),
 document_json TEXT NOT NULL CHECK(json_valid(document_json)), created_at TEXT NOT NULL,
 UNIQUE(group_id,id), UNIQUE(group_id,payment_id), UNIQUE(group_id,number), UNIQUE(group_id,sequence_year,sequence_value),
 FOREIGN KEY(group_id,invoice_id) REFERENCES invoice_finance_accounts(group_id,invoice_id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,payment_id) REFERENCES invoice_payments(group_id,id) ON DELETE RESTRICT
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
CREATE INDEX invoice_finance_events_invoice_idx ON invoice_finance_events(group_id,invoice_id,created_at,id);
CREATE INDEX invoice_finance_events_payment_idx ON invoice_finance_events(group_id,payment_id,kind);
CREATE UNIQUE INDEX invoice_finance_payment_once ON invoice_finance_events(group_id,payment_id,kind) WHERE kind IN('payment','reverse');
CREATE TRIGGER invoice_finance_account_insert BEFORE INSERT ON invoice_finance_accounts WHEN NOT EXISTS(
 SELECT 1 FROM invoices i WHERE i.group_id=NEW.group_id AND i.id=NEW.invoice_id AND i.student_id=NEW.student_id AND i.status='issued' AND i.total_cents=NEW.original_total_cents
) OR NEW.revision<>0 OR NEW.charge_cents<>0 OR NEW.credit_cents<>0 OR NEW.received_cents<>0 OR NEW.reversed_cents<>0 OR NEW.refunded_cents<>0 OR NEW.voided_at IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'invoice_finance_invalid_account'); END;
CREATE TRIGGER invoice_finance_event_guard BEFORE INSERT ON invoice_finance_events BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM invoice_finance_accounts a JOIN invoices i ON i.group_id=a.group_id AND i.id=a.invoice_id WHERE a.group_id=NEW.group_id AND a.invoice_id=NEW.invoice_id AND a.revision=NEW.expected_revision AND a.voided_at IS NULL AND i.status='issued') THEN RAISE(ABORT,'invoice_finance_changed') END;
 SELECT CASE WHEN NEW.kind='payment' AND (NOT EXISTS(SELECT 1 FROM invoice_payments p JOIN invoice_finance_accounts a ON a.group_id=p.group_id AND a.invoice_id=p.invoice_id WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND p.invoice_id=NEW.invoice_id AND p.amount_cents=NEW.amount_cents AND NEW.amount_cents<=a.original_total_cents+a.charge_cents-a.credit_cents-a.received_cents+a.reversed_cents+a.refunded_cents)) THEN RAISE(ABORT,'invoice_finance_overpayment') END;
 SELECT CASE WHEN NEW.kind IN('reverse','refund') AND NOT EXISTS(SELECT 1 FROM invoice_payments p WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND p.invoice_id=NEW.invoice_id AND julianday(NEW.occurred_at)>=julianday(p.paid_at) AND NOT EXISTS(SELECT 1 FROM invoice_finance_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='reverse') AND EXISTS(SELECT 1 FROM invoice_finance_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='payment') AND CASE WHEN NEW.kind='reverse' THEN p.amount_cents=NEW.amount_cents AND NOT EXISTS(SELECT 1 FROM invoice_finance_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='refund') ELSE NEW.amount_cents<=p.amount_cents-coalesce((SELECT sum(e.amount_cents) FROM invoice_finance_events e WHERE e.group_id=p.group_id AND e.payment_id=p.id AND e.kind='refund'),0) END) THEN RAISE(ABORT,'invoice_finance_invalid_refund') END;
 SELECT CASE WHEN NEW.kind='credit' AND NOT EXISTS(SELECT 1 FROM invoice_finance_accounts a WHERE a.group_id=NEW.group_id AND a.invoice_id=NEW.invoice_id AND NEW.amount_cents<=a.original_total_cents+a.charge_cents-a.credit_cents) THEN RAISE(ABORT,'invoice_finance_invalid_credit') END;
 SELECT CASE WHEN NEW.kind='charge' AND NOT EXISTS(SELECT 1 FROM invoice_finance_accounts a WHERE a.group_id=NEW.group_id AND a.invoice_id=NEW.invoice_id AND a.original_total_cents+a.charge_cents-a.credit_cents+NEW.amount_cents<=100000000) THEN RAISE(ABORT,'invoice_finance_invalid_charge') END;
 SELECT CASE WHEN NEW.kind='void' AND NOT EXISTS(SELECT 1 FROM invoice_finance_accounts a WHERE a.group_id=NEW.group_id AND a.invoice_id=NEW.invoice_id AND a.received_cents-a.reversed_cents-a.refunded_cents=0) THEN RAISE(ABORT,'invoice_finance_void_has_payment') END;
END;
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
-- Derived balances cannot be changed without matching immutable events.
CREATE TRIGGER invoice_finance_account_update BEFORE UPDATE ON invoice_finance_accounts WHEN
 NEW.group_id IS NOT OLD.group_id OR NEW.invoice_id IS NOT OLD.invoice_id OR NEW.student_id IS NOT OLD.student_id OR NEW.original_total_cents IS NOT OLD.original_total_cents OR NEW.created_at IS NOT OLD.created_at
 OR NEW.revision<>(SELECT count(*) FROM invoice_finance_events e WHERE e.group_id=OLD.group_id AND e.invoice_id=OLD.invoice_id)
 OR NEW.charge_cents<>coalesce((SELECT sum(amount_cents) FROM invoice_finance_events e WHERE e.group_id=OLD.group_id AND e.invoice_id=OLD.invoice_id AND e.kind='charge'),0)
 OR NEW.credit_cents<>coalesce((SELECT sum(amount_cents) FROM invoice_finance_events e WHERE e.group_id=OLD.group_id AND e.invoice_id=OLD.invoice_id AND e.kind='credit'),0)
 OR NEW.received_cents<>coalesce((SELECT sum(amount_cents) FROM invoice_finance_events e WHERE e.group_id=OLD.group_id AND e.invoice_id=OLD.invoice_id AND e.kind='payment'),0)
 OR NEW.reversed_cents<>coalesce((SELECT sum(amount_cents) FROM invoice_finance_events e WHERE e.group_id=OLD.group_id AND e.invoice_id=OLD.invoice_id AND e.kind='reverse'),0)
 OR NEW.refunded_cents<>coalesce((SELECT sum(amount_cents) FROM invoice_finance_events e WHERE e.group_id=OLD.group_id AND e.invoice_id=OLD.invoice_id AND e.kind='refund'),0)
 OR NEW.voided_at IS NOT (SELECT occurred_at FROM invoice_finance_events e WHERE e.group_id=OLD.group_id AND e.invoice_id=OLD.invoice_id AND e.kind='void')
 BEGIN SELECT RAISE(ABORT,'invoice_finance_immutable'); END;
CREATE TRIGGER invoice_payment_identity BEFORE INSERT ON invoice_payments WHEN NOT EXISTS(SELECT 1 FROM invoice_finance_accounts a WHERE a.group_id=NEW.group_id AND a.invoice_id=NEW.invoice_id AND a.student_id=NEW.student_id)
 BEGIN SELECT RAISE(ABORT,'invoice_finance_payment_identity'); END;
CREATE TRIGGER invoice_receipt_identity BEFORE INSERT ON invoice_receipts WHEN NOT EXISTS(SELECT 1 FROM invoice_payments p WHERE p.group_id=NEW.group_id AND p.id=NEW.payment_id AND p.invoice_id=NEW.invoice_id AND p.amount_cents=json_extract(NEW.document_json,'$.amountCents') AND p.student_id=json_extract(NEW.document_json,'$.student.id'))
 OR json_extract(NEW.document_json,'$.id') IS NOT NEW.id OR json_extract(NEW.document_json,'$.invoiceId') IS NOT NEW.invoice_id OR json_extract(NEW.document_json,'$.number') IS NOT NEW.number
 BEGIN SELECT RAISE(ABORT,'invoice_finance_receipt_identity'); END;
CREATE TRIGGER invoice_finance_account_delete BEFORE DELETE ON invoice_finance_accounts BEGIN SELECT RAISE(ABORT,'invoice_finance_immutable'); END;
CREATE TRIGGER invoice_payments_update BEFORE UPDATE ON invoice_payments BEGIN SELECT RAISE(ABORT,'invoice_finance_immutable'); END;
CREATE TRIGGER invoice_payments_delete BEFORE DELETE ON invoice_payments BEGIN SELECT RAISE(ABORT,'invoice_finance_immutable'); END;
CREATE TRIGGER invoice_receipts_update BEFORE UPDATE ON invoice_receipts BEGIN SELECT RAISE(ABORT,'invoice_finance_immutable'); END;
CREATE TRIGGER invoice_receipts_delete BEFORE DELETE ON invoice_receipts BEGIN SELECT RAISE(ABORT,'invoice_finance_immutable'); END;
CREATE TRIGGER invoice_finance_events_update BEFORE UPDATE ON invoice_finance_events BEGIN SELECT RAISE(ABORT,'invoice_finance_immutable'); END;
CREATE TRIGGER invoice_finance_events_delete BEFORE DELETE ON invoice_finance_events BEGIN SELECT RAISE(ABORT,'invoice_finance_immutable'); END;
