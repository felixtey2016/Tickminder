CREATE TABLE notification_preferences (
 account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 courses_enabled INTEGER NOT NULL DEFAULT 1 CHECK(courses_enabled IN(0,1)),
 homework_enabled INTEGER NOT NULL DEFAULT 1 CHECK(homework_enabled IN(0,1)),
 fees_enabled INTEGER NOT NULL DEFAULT 1 CHECK(fees_enabled IN(0,1)),
 courses_since TEXT NOT NULL DEFAULT '',homework_since TEXT NOT NULL DEFAULT '',fees_since TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL
);
