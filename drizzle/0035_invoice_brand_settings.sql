CREATE TABLE invoice_brand_assets (
 id TEXT PRIMARY KEY NOT NULL,
 group_id TEXT NOT NULL REFERENCES tuition_groups(id),
 object_key TEXT NOT NULL UNIQUE,
 bytes INTEGER NOT NULL CHECK(bytes > 0 AND bytes <= 2097152),
 width INTEGER NOT NULL CHECK(width > 0 AND width <= 2048),
 height INTEGER NOT NULL CHECK(height > 0 AND height <= 2048),
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL
);
CREATE INDEX invoice_brand_assets_group ON invoice_brand_assets(group_id,id);
CREATE TABLE invoice_brand_settings (
 group_id TEXT PRIMARY KEY NOT NULL REFERENCES tuition_groups(id),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
 settings_json TEXT NOT NULL CHECK(json_valid(settings_json)),
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL
);
