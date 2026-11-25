# Account login and classroom removal — 2026-11-04

This update separates login access, student/teacher subject pairings, and classrooms. Existing financial, lesson, and teaching records are preserved.

## Accounts

The account directory action is **Disable login / 停用登录**. The existing management API `permanentDelete` and preview contract remain accepted for compatibility; account records are disabled, not physically purged. Existing sessions are revoked. Password recovery, password sign-in, and Google sign-in cannot issue a valid session for a disabled account. Usernames and linked identities remain reserved; authorized administrators may explicitly restore access.

Disabling access preserves the student/teacher entity, subject pairings, class memberships, lessons, finance, files, Quiz, Task, and audit history. These are managed separately. Owner, self, current chief, tenant, and permission protections still apply.

## Classrooms and individual lessons

Removing a classroom no longer requires moving the student's active pairing into another class or deactivating that pairing. If any lesson, teaching content, Task history, or payroll reference exists, the classroom is removed from the working list and its source records are retained. An unused empty classroom and its membership links may be deleted; account and pairing records remain.

Removing a class does not hide its retained lessons from the course history. Ordinary classroom archive/restore is distinct from deletion retirement. Student offboarding keeps its existing privacy and visibility behavior.

Pairing and account operations no longer implicitly create classrooms. A valid one-to-one pairing with no eligible classroom can be scheduled independently. One eligible class is selected automatically; multiple eligible classes require explicit selection. Loading or failed class-option requests cannot submit. Whole-class lessons still require a classroom. Transaction checks reject stale membership changes or invalid explicit selections.

## Dialogs and automation

Shared Dialog, Sheet, and AlertDialog layers cover the fixed app header, including nested dialogs. Their upper-right close controls remain visible and reachable on narrow screens.

Deletion preview errors stay inside the designed dialog and can be retried or closed. Account success feedback says login was disabled, and classroom feedback says it was removed with history retained.

Hermes and other integrations must inspect preview effects (`disable`, `revoke`, `retain_history`) instead of assuming every `deletedCount` means physical data erasure. No schema migration, test-site deployment, real-account deletion, or production-data repair is included.
