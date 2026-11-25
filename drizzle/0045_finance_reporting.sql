-- Expenses are immutable cash records; corrections append a reversal and, when needed, a replacement.
CREATE TABLE finance_expense_operations (
 group_id TEXT NOT NULL REFERENCES tuition_groups(id),operation_id TEXT NOT NULL,actor_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN('recordExpense','reverseExpense')),request_hash TEXT NOT NULL,execution_id TEXT NOT NULL,
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),created_at TEXT NOT NULL,PRIMARY KEY(group_id,operation_id)
);
CREATE TABLE finance_expenses (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES tuition_groups(id),category TEXT NOT NULL CHECK(category IN('rent','utilities','materials','software','other')),
 description TEXT NOT NULL CHECK(length(trim(description))>0),amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000),
 spent_at TEXT NOT NULL,method TEXT NOT NULL CHECK(method IN('cash','bank_transfer','duitnow','tng','other')),
 reference TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',replacement_for TEXT,
 actor_id TEXT NOT NULL,operation_id TEXT NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(group_id,id),UNIQUE(group_id,operation_id),
 FOREIGN KEY(group_id,operation_id) REFERENCES finance_expense_operations(group_id,operation_id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,replacement_for) REFERENCES finance_expenses(group_id,id) ON DELETE RESTRICT
);
CREATE INDEX finance_expenses_date ON finance_expenses(group_id,spent_at,id);
CREATE TABLE finance_expense_events (
 id TEXT PRIMARY KEY,group_id TEXT NOT NULL,expense_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('record','reverse')),
 amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000),occurred_at TEXT NOT NULL,
 reason TEXT NOT NULL DEFAULT '',actor_id TEXT NOT NULL,operation_id TEXT NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(group_id,id),UNIQUE(group_id,expense_id,kind),
 FOREIGN KEY(group_id,expense_id) REFERENCES finance_expenses(group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(group_id,operation_id) REFERENCES finance_expense_operations(group_id,operation_id) ON DELETE RESTRICT,
 CHECK(kind='record' OR length(trim(reason))>0)
);
CREATE INDEX finance_expense_events_date ON finance_expense_events(group_id,occurred_at,id);
CREATE TRIGGER finance_expense_event_guard BEFORE INSERT ON finance_expense_events WHEN NOT EXISTS(
 SELECT 1 FROM finance_expenses e WHERE e.group_id=NEW.group_id AND e.id=NEW.expense_id AND e.amount_cents=NEW.amount_cents
 AND (NEW.kind='record' AND NEW.occurred_at=e.spent_at OR NEW.kind='reverse' AND julianday(NEW.occurred_at)>=julianday(e.spent_at) AND EXISTS(SELECT 1 FROM finance_expense_events p WHERE p.group_id=e.group_id AND p.expense_id=e.id AND p.kind='record'))
) BEGIN SELECT RAISE(ABORT,'finance_expense_invalid_event'); END;
CREATE TRIGGER finance_expense_replacement_guard BEFORE INSERT ON finance_expenses WHEN NEW.replacement_for IS NOT NULL AND NOT EXISTS(SELECT 1 FROM finance_expense_events e WHERE e.group_id=NEW.group_id AND e.expense_id=NEW.replacement_for AND e.kind='reverse') BEGIN SELECT RAISE(ABORT,'finance_expense_replacement_not_reversed'); END;
CREATE TRIGGER finance_expense_update BEFORE UPDATE ON finance_expenses BEGIN SELECT RAISE(ABORT,'finance_expense_immutable'); END;
CREATE TRIGGER finance_expense_delete BEFORE DELETE ON finance_expenses BEGIN SELECT RAISE(ABORT,'finance_expense_immutable'); END;
CREATE TRIGGER finance_expense_event_update BEFORE UPDATE ON finance_expense_events BEGIN SELECT RAISE(ABORT,'finance_expense_immutable'); END;
CREATE TRIGGER finance_expense_event_delete BEFORE DELETE ON finance_expense_events BEGIN SELECT RAISE(ABORT,'finance_expense_immutable'); END;
