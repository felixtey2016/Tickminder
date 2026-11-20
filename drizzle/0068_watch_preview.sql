CREATE TABLE watch_preview_videos (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES tuition_groups(id),
  youtube_id TEXT NOT NULL CHECK(length(youtube_id)=11),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
  category TEXT NOT NULL DEFAULT '' CHECK(length(category)<=48),
  subject TEXT NOT NULL DEFAULT '' CHECK(length(subject)<=48),
  chapter TEXT NOT NULL DEFAULT '' CHECK(length(chapter)<=80),
  kind TEXT NOT NULL CHECK(kind IN ('short','lesson')),
  created_at TEXT NOT NULL,
  UNIQUE(group_id, youtube_id)
);
CREATE INDEX watch_preview_group_date ON watch_preview_videos(group_id, created_at DESC, id DESC);

CREATE TABLE watch_preview_sessions (
  token_hash TEXT PRIMARY KEY,
  source_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES tuition_groups(id),
  purpose TEXT NOT NULL CHECK(purpose IN ('handoff','watch')),
  challenge_hash TEXT,
  expires_at INTEGER NOT NULL,
  CHECK((purpose='handoff')=(challenge_hash IS NOT NULL))
);
CREATE INDEX watch_preview_session_expiry ON watch_preview_sessions(expires_at);
CREATE INDEX watch_preview_source_session ON watch_preview_sessions(source_hash);
