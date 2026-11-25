CREATE TABLE ticklearn_video_daily_usage (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  day_start TEXT NOT NULL,
  video_ids TEXT NOT NULL CHECK (json_valid(video_ids) AND json_type(video_ids) = 'array')
) WITHOUT ROWID;
