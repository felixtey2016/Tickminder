CREATE TABLE tickgame_catalog_sessions (
  token_hash TEXT PRIMARY KEY,
  source_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK(purpose IN ('handoff','catalog')),
  access TEXT NOT NULL CHECK(access IN ('admin','reader')),
  expires_at INTEGER NOT NULL
);
CREATE INDEX tickgame_catalog_session_expiry ON tickgame_catalog_sessions(expires_at);
CREATE INDEX tickgame_catalog_source_session ON tickgame_catalog_sessions(source_hash);

DROP TRIGGER accounts_group_required;
CREATE TRIGGER accounts_group_required BEFORE INSERT ON accounts
WHEN NEW.group_id IS NULL
  AND NOT(NEW.role='admin' AND NEW.id NOT LIKE 'local:%' AND lower(trim(NEW.email))='felixtey2016@gmail.com')
  AND NOT(NEW.role='learner' AND coalesce(NEW.activation_reason,'')='ticklearn_signup'
    AND NEW.student_name IS NULL AND NEW.teacher_name IS NULL)
BEGIN SELECT RAISE(ABORT,'Account group required'); END;

DROP TRIGGER accounts_group_immutable;
CREATE TRIGGER accounts_group_immutable BEFORE UPDATE OF group_id ON accounts
WHEN OLD.group_id IS NOT NEW.group_id AND NOT(
  OLD.group_id IS NULL AND OLD.role='learner' AND coalesce(OLD.activation_reason,'')='ticklearn_signup'
  AND NEW.group_id IS 'next-genn-edu' AND NEW.role='student' AND NEW.activation_reason IS OLD.activation_reason
  AND NEW.teacher_name IS NULL AND EXISTS(SELECT 1 FROM students s
    WHERE s.group_id=NEW.group_id AND s.name=NEW.student_name AND s.active=1)
  AND EXISTS(SELECT 1 FROM tuition_groups g WHERE g.id=NEW.group_id AND g.active=1)
)
BEGIN SELECT RAISE(ABORT,'Account group is immutable'); END;
