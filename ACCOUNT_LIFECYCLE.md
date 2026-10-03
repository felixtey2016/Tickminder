# Unified login and account lifecycle

## Sign-in and setup

The existing custom Google JWT, password and session implementation is retained. No Identity Platform migration or email registration service is introduced. Verified Google identities and local credentials reference the same existing account ID. The password login input accepts a case-insensitive username or a verified Google email. Ambiguous duplicate emails are rejected; names never identify accounts. Existing duplicate-account merges still require password proof, Google proof, matching role/identity and explicit confirmation.

Google-only users confirm their existing name and set a unique username and their own 8–128 character password. Setup changes neither role nor assignment state. Business endpoints enforce setup. Administrator password reset still revokes sessions and requires a password change. Password changes revoke other sessions. Existing accounts, courses, submissions, PDF ownership and history are retained.

## Pending assignment

New self-registered Google accounts have a 7-day `pending_expires_at`. Username/password setup and repeated sign-in do not extend it. They have only Home, My account and legal links; API state exposes no other users or learning records.

Administrator confirmation sets `activated_at`; binding a teacher/student identity or granting admin role also sets it. Administrator-created accounts are activated when created. Subject/course/classroom assignments already require an assigned teacher/student identity, so those accounts have already met an activation condition. Once set, activation never clears on unassignment, archive or classroom closure. Account merge carries activation forward. Legacy accounts have no deadline and are excluded from automatic deletion, including legacy accounts awaiting a role.

## Automatic cleanup

`POST /api/pending-cleanup` requires a separate secret `PENDING_CLEANUP_TOKEN`. The backup export secret cannot authorize cleanup. No public GET cleanup or browser-only timer exists.

The cleanup selects at most 50 accounts per call, then rechecks eligibility inside each atomic D1 batch. It requires an expired deadline, no activation, pending role, no teacher/student identity, no assignment and no owned/shared business records. Sessions, Google identity, local credential, login attempt and private study blocks are removed with the account. Username claims are released by deleting the unique local credential. A minimal expiry audit event retains the account ID and timestamp; no profile, password or email is copied to that event. Existing encrypted backups remain subject to their retention policy.

An activation/assignment committed before the deletion batch prevents deletion. If deletion commits first, later binding/activation reports account-not-found rather than claiming success. A failed batch rolls back. Retrying cleanup is idempotent.

The operator's Windows task `Tickminder Pending Cleanup` calls the protected endpoint hourly with a DPAPI credential outside Git. It starts missed runs when available and writes `backups/pending-cleanup-status.json`. This is computer-dependent, not a cloud cron guarantee. The computer and the operator's Windows login must be available; otherwise physical deletion waits. Server expiry checks restrict access at the deadline independently. To remove the computer dependency, a hosted HTTPS scheduler needs the dedicated secret configured privately. No secret may enter a task prompt, browser code, repository or command argument.

The current implementation has no Identity Platform account or push subscription to delete. If those services are added later, their cleanup must be implemented before registering their data.

## Backup and migration

Migration `0014_unified_login` adds three nullable account columns only. It does not alter previous migration files or enroll legacy users into expiry. Encrypted export format `timelyo-d1-v6` includes the columns and the restore verifier applies migration 0014. Formats v1–v5 remain supported. Database records and R2 PDF files continue to be backed up separately from GitHub source.

## Verification

`tests/unified-login.mjs` executes real route handlers, signature validation, PBKDF2 and SQL against an isolated SQLite database. Only runtime bindings/cookie transport and Google certificate retrieval are substituted. It covers canonical IDs, email/username login, invalid signatures, setup gates, Pending privacy, admin confirmation, binding, legacy protection, expiry, retries, cleanup races, unique usernames and invalidated sessions. Existing account merge/deletion, password, lesson rules, Sheet sync and translation checks also run. Browser checks use 390px and 1280px widths in Chinese and English. Hosted test-site smoke checks use only test accounts.
