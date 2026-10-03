export const PENDING_DAYS = 7;
export function pendingDeadline(now = new Date()) {
  return new Date(now.getTime() + PENDING_DAYS * 86400000).toISOString();
}
type Lifecycle = { role: string; pendingExpiresAt?: string | null; activatedAt?: string | null; teacherName?: string | null; studentName?: string | null };
export function isPendingAssignment(account: Lifecycle) {
  return account.role === "pending" && !account.activatedAt && !account.teacherName && !account.studentName;
}
export function pendingExpired(account: Lifecycle, now = new Date().toISOString()) {
  return isPendingAssignment(account) && Boolean(account.pendingExpiresAt && account.pendingExpiresAt <= now);
}
export function lifecycleView(account: Lifecycle) {
  return { assignmentStatus: isPendingAssignment(account) ? "PENDING_ASSIGNMENT" : "ACTIVE", pendingExpiresAt: isPendingAssignment(account) ? account.pendingExpiresAt || null : null, activatedAt: account.activatedAt || null };
}
