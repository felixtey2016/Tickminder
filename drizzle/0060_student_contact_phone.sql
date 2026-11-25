-- Self-declared student contact details never grant WhatsApp ownership.
ALTER TABLE accounts ADD COLUMN contact_phone TEXT;
ALTER TABLE accounts ADD COLUMN contact_phone_kind TEXT CHECK (contact_phone_kind IS NULL OR contact_phone_kind IN ('student','parent'));
ALTER TABLE accounts ADD COLUMN contact_phone_updated_at TEXT;
