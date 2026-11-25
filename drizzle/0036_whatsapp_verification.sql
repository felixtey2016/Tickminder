CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, lid TEXT NOT NULL DEFAULT '',
  identity_role TEXT NOT NULL, identity_name TEXT NOT NULL,
  verified_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'website_whatsapp',
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS whatsapp_challenges (
  token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL, phone TEXT NOT NULL,
  identity_role TEXT NOT NULL, identity_name TEXT NOT NULL,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', verified_at TEXT, message_id TEXT
);
CREATE INDEX IF NOT EXISTS whatsapp_challenge_account ON whatsapp_challenges(account_id,created_at);
CREATE INDEX IF NOT EXISTS whatsapp_challenge_phone ON whatsapp_challenges(phone,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_contact_identity ON whatsapp_contacts(group_id,identity_role,identity_name) WHERE identity_role IN ('teacher','student');

CREATE TABLE IF NOT EXISTS whatsapp_contact_requests (account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,group_id TEXT NOT NULL,phone TEXT NOT NULL,identity_role TEXT NOT NULL,identity_name TEXT NOT NULL,collected_from TEXT NOT NULL,updated_at TEXT NOT NULL);
