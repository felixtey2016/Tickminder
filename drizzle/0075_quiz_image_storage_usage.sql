-- Derived from image reservations, including in-flight uploads.
-- Backups restore quiz_images and the triggers rebuild the derived totals.
CREATE TABLE quiz_image_storage_usage (
  group_id TEXT PRIMARY KEY NOT NULL REFERENCES tuition_groups(id) ON DELETE CASCADE,
  used_bytes INTEGER NOT NULL CONSTRAINT quiz_image_storage_usage_nonnegative CHECK(used_bytes >= 0)
);

INSERT INTO quiz_image_storage_usage (group_id, used_bytes)
SELECT group_id, sum(bytes) FROM quiz_images GROUP BY group_id;

CREATE TRIGGER quiz_image_storage_usage_insert
AFTER INSERT ON quiz_images
BEGIN
  INSERT INTO quiz_image_storage_usage (group_id, used_bytes)
  VALUES (NEW.group_id, NEW.bytes)
  ON CONFLICT(group_id) DO UPDATE SET used_bytes = used_bytes + excluded.used_bytes;
END;

CREATE TRIGGER quiz_image_storage_usage_delete
AFTER DELETE ON quiz_images
BEGIN
  UPDATE quiz_image_storage_usage
  SET used_bytes = used_bytes - OLD.bytes
  WHERE group_id = OLD.group_id;
END;

CREATE TRIGGER quiz_image_storage_usage_update
AFTER UPDATE OF bytes, group_id ON quiz_images
WHEN NEW.bytes <> OLD.bytes OR NEW.group_id <> OLD.group_id
BEGIN
  UPDATE quiz_image_storage_usage
  SET used_bytes = used_bytes - OLD.bytes
  WHERE group_id = OLD.group_id;
  INSERT INTO quiz_image_storage_usage (group_id, used_bytes)
  VALUES (NEW.group_id, NEW.bytes)
  ON CONFLICT(group_id) DO UPDATE SET used_bytes = used_bytes + excluded.used_bytes;
END;
