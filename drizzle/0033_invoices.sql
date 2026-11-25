-- Additive invoices: legacy lessons, student identities and fee versions retain their IDs.
CREATE TABLE invoices (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES tuition_groups(id), student_id TEXT NOT NULL,
 month TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('draft','issued')), revision INTEGER NOT NULL CHECK(revision>0),
 number TEXT, sequence_year TEXT, sequence_value INTEGER, issued_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 created_by TEXT NOT NULL, issued_by TEXT, due_date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', currency TEXT NOT NULL CHECK(currency='MYR'),
 source_hash TEXT NOT NULL, source_basis_json TEXT NOT NULL, adjustment_basis_json TEXT NOT NULL,
 document_json TEXT NOT NULL CHECK(json_valid(document_json)), total_cents INTEGER NOT NULL CHECK(total_cents>=0 AND total_cents<=100000000),
 extension_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(extension_json)),
 UNIQUE(group_id,id), UNIQUE(group_id,student_id,month), UNIQUE(group_id,number), UNIQUE(group_id,sequence_year,sequence_value),
 FOREIGN KEY(group_id,student_id) REFERENCES billing_students(group_id,id) ON DELETE RESTRICT,
 CHECK(status='draft' AND number IS NULL AND issued_at IS NULL OR status='issued' AND number IS NOT NULL AND issued_at IS NOT NULL)
);
CREATE INDEX invoices_month_idx ON invoices(group_id,month,updated_at,id);
CREATE TABLE invoice_items (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, invoice_id TEXT NOT NULL, position INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('fee','charge','discount')), source_id TEXT, amount_cents INTEGER NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), UNIQUE(group_id,invoice_id,position),
 FOREIGN KEY(group_id,invoice_id) REFERENCES invoices(group_id,id) ON DELETE CASCADE
);
CREATE TABLE invoice_operations (
 group_id TEXT NOT NULL REFERENCES tuition_groups(id), operation_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 action TEXT NOT NULL, request_hash TEXT NOT NULL, execution_id TEXT NOT NULL, result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 created_at TEXT NOT NULL, PRIMARY KEY(group_id,operation_id)
);
CREATE TABLE invoice_sequences (
 group_id TEXT NOT NULL REFERENCES tuition_groups(id), year TEXT NOT NULL, last_value INTEGER NOT NULL DEFAULT 0 CHECK(last_value>=0),
 PRIMARY KEY(group_id,year)
);
CREATE TABLE invoice_source_locks (
 group_id TEXT NOT NULL, invoice_id TEXT NOT NULL, source_type TEXT NOT NULL CHECK(source_type IN('lesson','session','rate','student_month')),
 source_id TEXT NOT NULL, student_id TEXT NOT NULL, month TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(group_id,invoice_id,source_type,source_id),
 FOREIGN KEY(group_id,invoice_id) REFERENCES invoices(group_id,id) ON DELETE RESTRICT
);
CREATE INDEX invoice_source_lock_lookup ON invoice_source_locks(group_id,source_type,source_id);
CREATE INDEX invoice_source_lock_student_month ON invoice_source_locks(group_id,student_id,month);
-- Issued originals are immutable. Corrections will use separate credit/adjustment records.
CREATE TRIGGER invoice_issued_immutable BEFORE UPDATE ON invoices WHEN OLD.status='issued'
 BEGIN SELECT RAISE(ABORT,'invoice_issued_immutable'); END;
CREATE TRIGGER invoice_issued_delete BEFORE DELETE ON invoices WHEN OLD.status='issued'
 BEGIN SELECT RAISE(ABORT,'invoice_issued_immutable'); END;
CREATE TRIGGER invoice_issued_item_update BEFORE UPDATE ON invoice_items WHEN EXISTS(SELECT 1 FROM invoices WHERE id=OLD.invoice_id AND group_id=OLD.group_id AND status='issued')
 BEGIN SELECT RAISE(ABORT,'invoice_issued_immutable'); END;
CREATE TRIGGER invoice_issued_item_delete BEFORE DELETE ON invoice_items WHEN EXISTS(SELECT 1 FROM invoices WHERE id=OLD.invoice_id AND group_id=OLD.group_id AND status='issued')
 BEGIN SELECT RAISE(ABORT,'invoice_issued_immutable'); END;
CREATE TRIGGER invoice_issued_item_insert BEFORE INSERT ON invoice_items WHEN EXISTS(SELECT 1 FROM invoices WHERE id=NEW.invoice_id AND group_id=NEW.group_id AND status='issued')
 BEGIN SELECT RAISE(ABORT,'invoice_issued_immutable'); END;
CREATE TRIGGER invoice_lock_update BEFORE UPDATE ON invoice_source_locks BEGIN SELECT RAISE(ABORT,'invoice_issued_immutable'); END;
CREATE TRIGGER invoice_lock_delete BEFORE DELETE ON invoice_source_locks BEGIN SELECT RAISE(ABORT,'invoice_issued_immutable'); END;
