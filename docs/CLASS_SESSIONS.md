# Independent class sessions and group scheduling — Part 08

Part 09 is now released: independent teacher teaching time, full-class attendance, personal presence and administrator review are documented in [SESSION_ATTENDANCE.md](SESSION_ATTENDANCE.md). The Part 08 release evidence and its earlier limitations below remain as history.

## Production release

- Released 2026-10-15 to https://www.tickminder.com and https://tickminder.com.
- Worker: `tickminder-recovery`; version `138539ac-50c2-4fdd-b942-34f1a6c94a35`. Previous Part 07 version: `e1b0f6dd-e104-4628-9415-41649646dbe4`.
- The user's direct production instruction supersedes the attachment's original staging-only instructions. No public test source/runtime, GitHub repository, paid service or external account configuration was changed.
- Existing runtime secrets/variables and D1/R2/domain bindings were retained using the guarded recovery build and `--keep-vars`.

## Entry points and rules

- Administrators and classroom teachers: **安排课程 → 整班课程** / **Schedule a lesson → Group class**. Select an active classroom, review current active students, enter start/end, optional weekly end date and an existing online lesson link.
- Each occurrence has one canonical session with an immutable participant snapshot. Classroom title, teacher, subject, planned times and shared online link are saved with the session. Adding/removing members later does not rewrite existing sessions. Subsequent schedules use the new roster.
- Administrators can directly change/cancel a whole-class session. Teachers submit an entire-class reschedule request; an administrator approves or rejects it. Original times remain until approval. Students cannot alter the entire class using the old individual request route. Existing one-to-one confirmation behavior remains.
- Single or subsequent unrecorded recurring sessions can be changed/cancelled together. Already recorded sessions cannot be bulk rescheduled. Cancellation retains participant IDs, lessons and history. Individual permanent deletion of a group participant's lesson is blocked.
- Teacher ownership, group membership, active role and classroom state are checked server-side. Operation IDs make retries safe; revision checks reject stale/concurrent edits. SQL guards recheck roster and permissions at commit. All participant time changes, pending-request invalidation, audit records and site notices commit atomically.
- Conflicts check the teacher and every student, including other subjects. Participant records belonging to the same session are not mistaken for duplicate teacher bookings. Targeted recurring slots are released only inside the same transaction before the complete update, allowing a valid shift over their old slots.
- Calendars and teacher timetables show the group session once. Each student sees their own linked lesson and the shared group time/link, without other students' names. Teacher/admin views can inspect saved participants. Removed members retain their historical session access.
- Existing reminder generation sends one teacher reminder per group session and one to each participating student. Approved changes notify the saved students and teacher, group admins and platform owner, excluding the acting user and duplicate teacher/admin events.

## Data migration and backup

- Additive migration: `drizzle/0022_class_sessions.sql`. New tables: `class_sessions`, `class_session_participants`; nullable session links added to `lessons` and `reschedule_requests`.
- All 58 production lessons received separate `one:<lesson ID>` sessions and one participant each. No old records were merged using matching dates/names. Every original lesson/request ID and original field value was retained.
- Database triggers maintain old one-to-one API/Sheet insert/update compatibility and protect common group fields, participant links and booking conflicts.
- Encrypted full backup format v13 includes all 40 tables, original ordering and participant validation. Restore supports v12 and earlier accepted formats, builds the missing legacy session links after historical import, then reenables integrity triggers. Historical import does not retroactively reject preexisting overlaps.
- Private pre-release backup: `backups/part08-production-before-20261015-final`; post-release backup: `backups/part08-production-after-20261015`, both outside this source repository. Each includes all 10 PDFs, 11,467,300 bytes; every PDF SHA-256 matched. Credentials and decrypted business data were not added to the repository.

## Verification actually completed

- TypeScript `--noEmit` and guarded production build: passed.
- Latest real-snapshot migration rehearsal: all original columns/rows in 38 tables unchanged, 58 separate legacy sessions/participants and 10 PDFs retained.
- Isolated built-Worker API: 31 assertions passed with fictional groups/accounts. Covers legacy approvals, same-session conflicts, real conflicts, group permissions/isolation, roster snapshots, retry idempotence, two concurrent editors, whole-series changes/cancellation, shared link, archive restrictions, notices and reminder deduplication.
- Chromium: 17 assertions passed at 390×844 in Chinese and English plus a 1366×900 English admin flow. Actual UI saves a group, teacher requests a new time, admin approves, both students' calendars show the new session. Native date inputs, full year, 44px form controls, no horizontal overflow, explicit 中文 / EN and no runtime errors verified. Private screenshots are in `work/part08-release/previews`, outside this repository.
- Synthetic v13 backup restore and real v12 compatibility restore: passed. Post-release production v13 restore: passed in a separate local dry run, 40 tables and 10 PDFs. No restore was applied to production.
- Production: 27 read-only assertions passed. Both domains, anonymous role boundaries, origin rejection, preserved Google configuration/PWA files, exact published asset hashes, unchanged old business fields, every session association and all PDF hashes verified. Only background notification runtime changed.
- Remote foreign-key check: zero violations; missing or inconsistent session/participant links: zero. No test students, lessons or class groups were created in production.

## Limits and recovery

- Part 08 establishes schedule/session identity. Existing per-student attendance and accumulated student-hours remain; when group attendance is present, the teacher statistics page explicitly states its per-student basis. Separate teacher session-hours/payroll and redesigned personal attendance are Part 09 and were not invented here.
- Old lessons remain independent one-to-one sessions unless a later explicit, validated mapping operation is implemented. New group scheduling requires a valid active classroom/roster.
- Existing Google/Sheet configuration was preserved. A real Google re-login, live Sheet commit, physical phone background push and a real class attendance session were not retested; local reminder generation is not evidence of OS notification delivery.
- Retain the additive schema during a code rollback. Pause writes before any recovery. Once group data exists, the previous UI does not understand its workflows; disable group changes while investigating and prefer a forward fix. Do not drop session tables or restore the old snapshot over subsequent legitimate writes. A full restore requires an explicit maintenance/reconciliation plan; the documented pre/post restore tests were local only.

## Main source files

- Model and transaction rules: `lib/class-sessions.ts`, `db/schema.ts`, migration 0022.
- UI/API: `app/class-session-schedule.tsx`, `app/api/class-sessions/route.ts`, existing action/state/conflict/manage/history routes.
- Calendar/portal integrations: `app/scheduler.tsx`, `app/portals.tsx`, `app/student-calendar.tsx`, `app/timetables.tsx`, `app/home-dashboard.tsx`, `components/class-session-label.tsx`, `lib/class-session-display.ts`.
- Reminders/history/export compatibility: notification access/server, inbox, group reader and backup/restore scripts. English strings use existing i18n; existing purple components and native date controls are retained.
