CREATE TABLE session_devices (
 id TEXT PRIMARY KEY NOT NULL,
 token_hash TEXT NOT NULL UNIQUE REFERENCES sessions(token_hash) ON DELETE CASCADE,
 created_at TEXT,
 browser TEXT NOT NULL DEFAULT 'unknown',
 os TEXT NOT NULL DEFAULT 'unknown'
);
CREATE INDEX session_account_expiry_idx ON sessions(account_id,expires_at);
-- Existing logins keep their sessions. Device information was not collected.
INSERT INTO session_devices(id,token_hash) SELECT lower(hex(randomblob(16))),token_hash FROM sessions;
