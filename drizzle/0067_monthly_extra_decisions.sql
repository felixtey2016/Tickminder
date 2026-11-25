-- Explicit, immutable decisions for extra scheduled sessions after a monthly
-- invoice is issued. Zero is a real waiver decision, never a fabricated payment.
CREATE TABLE invoice_monthly_extra_decisions (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES tuition_groups(id),
 invoice_id TEXT NOT NULL, student_id TEXT NOT NULL, subject_key TEXT NOT NULL,
 rate_version_id TEXT NOT NULL, included_sessions INTEGER NOT NULL CHECK(included_sessions BETWEEN 1 AND 62),
 scheduled_sessions INTEGER NOT NULL CHECK(scheduled_sessions>=0),
 previous_excess_count INTEGER NOT NULL CHECK(previous_excess_count>=0),
 confirmed_excess_count INTEGER NOT NULL CHECK(confirmed_excess_count>previous_excess_count),
 amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 0 AND 100000000),
 basis_hash TEXT NOT NULL, source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 operation_id TEXT NOT NULL, event_id TEXT, reason TEXT NOT NULL CHECK(length(trim(reason))>0),
 actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(group_id,id), UNIQUE(group_id,operation_id), UNIQUE(group_id,event_id),
 UNIQUE(group_id,invoice_id,subject_key,previous_excess_count),
 FOREIGN KEY(group_id,invoice_id) REFERENCES invoices(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,student_id) REFERENCES billing_students(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,operation_id) REFERENCES invoice_finance_operations(group_id,operation_id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,event_id) REFERENCES invoice_finance_events(group_id,id) ON DELETE RESTRICT,
 CHECK((amount_cents=0 AND event_id IS NULL) OR (amount_cents>0 AND event_id IS NOT NULL)),
 CHECK(confirmed_excess_count=max(0,scheduled_sessions-included_sessions))
);
CREATE INDEX invoice_monthly_extra_invoice ON invoice_monthly_extra_decisions(group_id,invoice_id,subject_key,confirmed_excess_count);
CREATE TRIGGER invoice_monthly_extra_identity BEFORE INSERT ON invoice_monthly_extra_decisions WHEN
 NOT EXISTS(SELECT 1 FROM invoices i WHERE i.group_id=NEW.group_id AND i.id=NEW.invoice_id AND i.student_id=NEW.student_id AND i.status='issued' AND i.billing_scope='monthly')
 OR NOT EXISTS(SELECT 1 FROM billing_rate_versions v JOIN billing_rates r ON r.group_id=v.group_id AND r.id=v.rate_id WHERE v.group_id=NEW.group_id AND v.id=NEW.rate_version_id AND r.student_id=NEW.student_id AND r.subject_key=NEW.subject_key AND v.mode='month' AND v.included_sessions=NEW.included_sessions)
 OR NEW.amount_cents>0 AND NOT EXISTS(SELECT 1 FROM invoice_finance_events e WHERE e.group_id=NEW.group_id AND e.id=NEW.event_id AND e.invoice_id=NEW.invoice_id AND e.operation_id=NEW.operation_id AND e.kind='charge' AND e.amount_cents=NEW.amount_cents)
 BEGIN SELECT RAISE(ABORT,'invoice_monthly_extra_changed'); END;
CREATE TRIGGER invoice_monthly_extra_update BEFORE UPDATE ON invoice_monthly_extra_decisions BEGIN SELECT RAISE(ABORT,'invoice_monthly_extra_immutable'); END;
CREATE TRIGGER invoice_monthly_extra_delete BEFORE DELETE ON invoice_monthly_extra_decisions BEGIN SELECT RAISE(ABORT,'invoice_monthly_extra_immutable'); END;
