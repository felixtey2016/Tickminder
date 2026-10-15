-- Preserve unfinished self-practice answers and history while hiding a
-- discarded attempt from its owner's resumable practice list.
ALTER TABLE quiz_practice_attempts ADD COLUMN discarded_at TEXT;
