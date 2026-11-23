CREATE TABLE IF NOT EXISTS watch_playlists (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES tuition_groups(id),
  created_by TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
  video_ids TEXT NOT NULL CHECK(json_valid(video_ids) AND json_type(video_ids)='array' AND json_array_length(video_ids) BETWEEN 1 AND 100),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS watch_playlists_group_date ON watch_playlists(group_id, created_at DESC, id DESC);
