# Account directory and record management

Implemented on `feature/account-directory-cleanup`, based on the verified v27 GitHub recovery point `62a5e5d`. The separate Sites production history remains intact. Production was v27; private staging was v23 at the start.

- One Account management page groups accounts by administrator, teacher, student and pending identity. Password and Google login methods are displayed together.
- A password account connects Google through My account after verifying its current password and a signed Google credential. Existing duplicates merge only after explicit confirmation and when identities match (or the Google account is pending). Administrator accounts cannot be merged through this flow. Password accounts cannot connect the reserved owner identity.
- Merge transfers ownership and revokes the duplicate's sessions in one D1 batch. Immutable audit events remain unchanged; a mapping event preserves historical actor names. No automatic name/email authorization or production test bypass is introduced.
- Disabled accounts and removed roster entries are hidden by default. Restore remains available. Permanent deletion requires confirmation; owner/self protection and dependency checks run on the server. Roster/subject removal retains historical lessons. Deleting a lesson removes its recorded hours; the UI explicitly warns about this. Audit events are retained.
- Class deletion removes its announcements, materials, homework and submissions, while retaining independently scheduled lessons. Shared PDFs remain until unreferenced. A failed file cleanup is reported as partial completion and retried by existing unused-file cleanup.
- Cancelled lessons are hidden in the default course list and calendar, with a separate cancelled-record filter. Student subjects and courses are grouped by teacher and can be filtered by teacher/student. Admin classrooms use the same filters and grouping.
- Student subject editing opens a visible dialog and saves the online lesson link. New dialogs preserve browser Back/Forward behavior.

## Migration and backups

Migration `0011_account_identity` adds nullable `accounts.disabled_at` and `google_identities` (one signed Google subject per canonical account). Existing Google accounts are backfilled by their original identity IDs. No account is automatically merged or removed by migration. Both existing Sites archives must contain only migration 0011; historic migrations remain in source for restore.

Complete backup exports now use `timelyo-d1-v3` for 23 tables. Restore scripts retain compatibility with v1/v2. Before release, a fresh encrypted v27 snapshot verified all 22 existing tables and seven PDFs (4,289,198 bytes). No credentials, plaintext database or uploaded PDFs are committed.

## Verification

TypeScript and production build pass. All 12 rule tests pass, including in-memory execution of actual account-link/merge/deletion SQL with authentication boundaries mocked only in the test harness. This verifies double proof requirements, explicit confirmation, incompatible identities, transaction rollback, owner protection and shared-file preservation; it does not claim a real Google consent interaction was automated.

Compiled isolated Worker checks pass for disabling/login blocking/restoring/deleting accounts, roster dependencies, duplicate account prevention, plan-link updates, cancelled/permanently deleted lessons and original classroom/PDF/homework authorization. Browser checks cover 128 desktop/mobile role/language/page combinations, plus phone-size editing and new dialog Back/Forward. Mobile tests are Chromium emulation rather than physical Android hardware.

Dependency checks precede deletion batches; concurrent changes to dependencies are not protected by a global application transaction. Existing scheduling concurrency limitations are unchanged. Follow-up ideas are reserved for user review and not implemented.

## Published version

Private staging v24 and public production v28 succeeded on 2026-09-30. Production source is 933af96f61faa4b61288615073b7b555934a72fc; GitHub source recovery point is feb8071618816198a2e3b777bff7583022c3b162. Post-release comparison confirmed that all pre-existing 22 tables retain identical values in their original columns, including 10 accounts and 43 lessons. All seven PDFs retain matching hashes. The expanded 23-table v3 export also passed encrypted restore verification. The pre-release cloud snapshot contains nine ciphertext/manifest files, downloaded and verified from the authorized Drive folder.

Final publication is production v29 (source 03f69b53de0ffe905154a7fa74a4478819fed794), with private staging v25. It adds an expired-session guard to My account after phone-size browser verification; no further schema or backend change. GitHub source recovery is 0d46ffd3958f30b0023079559042946507313002. Stable release tags retain both v28 and v29 recovery records.
