CREATE TABLE IF NOT EXISTS watch_video_owners (
  video_id TEXT PRIMARY KEY REFERENCES watch_preview_videos(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES tuition_groups(id),
  account_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS watch_video_owners_account ON watch_video_owners(group_id, account_id, video_id);

CREATE TABLE IF NOT EXISTS watch_video_reactions (
  video_id TEXT NOT NULL REFERENCES watch_preview_videos(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES tuition_groups(id),
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('like','favorite')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(video_id, kind, account_id)
);
CREATE INDEX IF NOT EXISTS watch_favorites_account ON watch_video_reactions(group_id, account_id, kind, created_at DESC, video_id DESC);

CREATE TABLE IF NOT EXISTS watch_comments (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES watch_preview_videos(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES tuition_groups(id),
  account_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS watch_comments_video_date ON watch_comments(video_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS watch_comment_likes (
  comment_id TEXT NOT NULL REFERENCES watch_comments(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  PRIMARY KEY(comment_id, account_id)
);

CREATE TABLE IF NOT EXISTS watch_notifications (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES tuition_groups(id),
  video_id TEXT NOT NULL REFERENCES watch_preview_videos(id) ON DELETE CASCADE,
  comment_id TEXT REFERENCES watch_comments(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('like','comment','comment-like')),
  created_at TEXT NOT NULL,
  read_at TEXT,
  dedupe_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS watch_notifications_account_date ON watch_notifications(group_id, recipient_id, created_at DESC, id DESC);
