// Parent access is projected by /api/parents and never inherits a former role's
// course, file ownership, notification or administrator response permissions.
export function isLegacyBusinessRole(role: unknown): role is 'admin' | 'teacher' | 'student' {
  return role === 'admin' || role === 'teacher' || role === 'student';
}
