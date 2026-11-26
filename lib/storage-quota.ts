// Bind the group ID to look up its Quiz image reservations, including uploads in flight.
export const quizImageStorageBytesSql =
  'coalesce((SELECT used_bytes FROM quiz_image_storage_usage WHERE group_id = ?), 0)';
