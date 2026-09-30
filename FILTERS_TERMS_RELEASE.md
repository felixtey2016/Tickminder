# Saved filters, deletion impact and classroom terms

## Scope

- Remember account-specific device preferences for classroom teacher/student/term/archive filters, course-list teacher/student/cancelled filters, subject teacher/student/status filters, account/roster searches and status, timetable names, reporting month and administrator calendar view/teacher. Reset controls restore each directory's defaults. This is browser preference storage, not a cross-device account setting; browsing without storage still works.
- Add a selection dialog (up to 50 records of one kind) and server-generated impact preview for accounts, teachers, students, subject links, lessons, classrooms and teacher homework. Existing single permanent-delete buttons use the same preview. Show exact affected record counts, attendance count and approved taught hours for deleted lessons. Audit history and independently scheduled lessons are retained; shared PDFs are cleaned only after all references disappear. Existing exported Sheet values are not automatically reverted.
- Refuse the entire requested batch if any selected record is blocked. Verify permissions again, compare affected-record fingerprints and reject expired previews (five minutes) or changed records. Execute all database deletions in one D1 batch. PDF cleanup is subsequent and reports partial completion if it fails.
- Administrator manages named terms and selects one current term. Teachers select a term for their own classroom. All roles filter their authorized classrooms by current/all/specific/unassigned term. Names can repeat across different terms. Existing classroom records start unassigned; no schedules, materials, homework, membership or scores are duplicated or reset.

## Schema and backup

- Migration 0012 adds `academic_terms` and nullable `classrooms.term_id`; prior migrations remain immutable.
- Backup export v4 includes all 24 tables. Restore helpers still accept v1/v2/v3 snapshots with their corresponding schema, and validate v4 against migrations through 0012.
- Pre-release complete encrypted backup: `timelyo-before-terms-2026-09-30`, 23 tables and 7 PDFs, restored and verified. Files and recovery keys remain outside Git. The earlier cloud-verified daily snapshot is retained.

## Verification

- TypeScript and production build.
- Existing 12 rule/API test files, expanded actual-route tests for read-only preview, hours/counts, stale/expired rejection, blocked all-or-nothing batches, owner protection, role denial and current-term switching.
- Existing isolated Worker classroom regression: roster privacy, announcements, one-file distribution, independent submissions, scoring, removal/rejoin/archive and administrator creation.
- Compiled Worker + Chromium at 360/390/1280 widths: bilingual term management, duplicate classroom names across terms, filter restoration after page changes/reload, no mobile impact-dialog overflow, preview remains read-only, modal Back/Forward, persistent network error, successful bulk deletion. Synthetic local accounts only; no production test writes.

## Limits

- Read/validate and batch execution are separate operations. Fingerprints catch changes observed before execution, but there is no global lock across all dependency creators; a concurrent mutation between final validation and execution can still race. Do not describe this as complete concurrency isolation.
- R2 cleanup is outside the database transaction; referenced files remain protected by existing reference checks and failed cleanup is retried by the existing orphan sweep.
- Mobile checks use browser emulation, not a physical Android device. Real Google consent remains on the existing verified authentication path.
- Terms organize existing classrooms; creating a new term does not create new classroom copies automatically. Administrators edit a classroom or create a new one for the new term.

Deployment version and exact source mappings are recorded in RELEASES.md after successful publication.

Production v30 and private staging v26 are published. Post-release encrypted backup `timelyo-after-terms-2026-09-30` verifies all 24 tables and seven PDFs. Original business records and all PDF hashes match the immediate pre-release snapshot; five login sessions are unchanged and one session was replaced during live use. These supplemental snapshots are local encrypted copies, not a new cloud-verification claim.
