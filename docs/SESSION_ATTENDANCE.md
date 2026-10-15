# Full-class attendance and teacher teaching hours — Part 09

## Production delivery

- Released 2026-10-15 to https://www.tickminder.com and https://tickminder.com.
- Final Worker version: `6b82d3f3-4d15-40bf-b875-71d3258490b1`; initial Part 09 deployment: `6779dadc-9577-4202-afe4-511662932f67`. Previous Part 08: `138539ac-50c2-4fdd-b942-34f1a6c94a35`.
- The user's direct production instruction overrides the attachment's old staging-only scope. The public test site/runtime, GitHub and external account configuration were not changed. Existing D1, R2, domain bindings and runtime secrets were retained.

## Using attendance

- Teacher: **课程与出席 → 登记课次考勤** / **Lessons and attendance → Record session attendance**. A class appears once, with its saved participants and full dates. Normal attendance defaults to the actual teaching interval. Confirm the affected student count, then save everyone in one request.
- **全班设为出席** sets every participant to present. Individual students may instead be absent, late, leave early, or both late and early. Late arrival/early departure use native date-time inputs. Each student has a separate note and attendance history.
- Record whether teaching took place, did not take place, or the teacher was absent. Actual teaching start/end belong to the session, independently of individual students' presence intervals. Student times must be positive and inside the teaching interval. Future actual dates and intervals over the existing 12-hour maximum are rejected.
- Teacher submissions await administrator review. Administrators can review the whole session or correct it, including per-student billable flags. Reviewed teacher records are read-only; corrections require an administrator. Existing historical reviewed records remain reviewed.
- Administrator: **出席待处理** for missing attendance, pending reviews and existing absence/makeup work; **课程总览** for teacher hours and separate student accumulated hours. Pending review badges count a group once. Missing group attendance also counts once, rather than once per student.
- Teacher **出席记录** lists each session once and expands into individual details. **课时统计** uses actual teacher teaching periods and distinguishes recorded/reviewed totals. Students see only their own attendance, presence interval and before/after history through their existing calendar/list.
- Existing individual and group rescheduling, scheduling, history and makeup entrances remain. Group attendance cannot be saved by modifying one participant's legacy lesson endpoint; the response directs the user to whole-session attendance.

## Calculation and Sheet compatibility

- Teacher hours = actual session teaching end minus start, counted once for a taught session. A ten-student one-hour session contributes **1 teacher hour** and ten independent student records. Non-taught/teacher-absent sessions contribute zero. Reporting month uses actual teaching start; non-taught records use planned date for display.
- Student attendance hours use that student's arrival/departure, which may be shorter for lateness/early departure. Absent students have no presence interval. An absence billable flag is a retained administrative reference, not an inferred presence duration or monetary calculation.
- Existing Google Sheet bridge remains an administrator-only, preview/commit, student-subject hour transfer. Per-student presence intervals and review/billable flags are mirrored atomically into the existing lesson fields used by `monthlySheetPairs`; teacher totals are not substituted into the student sheet. Both sync modes and existing signed payload shape remain compatible.
- No live Sheet write was performed as a test. Existing configuration was retained; local actual-data calculations verified the source and the unauthenticated production boundary was checked.
- Part 22 monetary billing is outside this release. No fee amounts, salary rates or new payroll policy were introduced.

## Model, transactions and security

- Additive migration `0023_session_attendance.sql` adds teaching/recording/review fields to `class_sessions`, and individual status/arrival/departure/note fields to `class_session_participants`. The database still has 40 tables. Existing lesson IDs and all old columns/values are preserved.
- Legacy one-to-one completed teaching intervals/reviews are copied exactly. Existing student attendance facts are retained. Old `early_dismissal` meant the whole lesson ended early; it remains on the original lesson, while the personal record is present for that shorter teaching period. No extra teacher time is inferred from student absence or old group participant records.
- The old individual attendance/review API routes use the new writer for one-to-one sessions and require current session revision and operation ID. Compatibility triggers also synchronize in-flight previous-release writes during cutover; the new writer's marker prevents a student's shorter interval from overwriting independent teacher time.
- Role/group/teacher ownership is checked on read and again against persisted active accounts/groups/teachers at commit. Existing strict roles apply; finer Part 03 permissions were not invented. Students cannot fetch the full-class attendance endpoint, and their core/history responses do not include peers.
- The request must include every saved participant exactly once. Revision checks reject stale work. Operation IDs/hashes make repeat submissions idempotent and reject changed retry bodies.
- One D1 batch updates teacher time, every participant, legacy lesson mirrors, per-student before/after audit entries and stale reschedules. Bulk SQL keeps database query count independent of class size. Actual teacher/student overlap triggers abort the entire transaction. One invalid or conflicting student cannot leave a partial class result.
- Before/after history includes teaching time/note, personal status/time/note, billable flag and review state. Group snapshots remain unchanged after membership edits. Existing individual makeup/billable safeguards remain.

## Verification actually completed

- TypeScript and guarded recovery build passed. Runtime variables, D1/R2 and exact formal domain targets were checked by the existing build guard.
- Latest real-production v13 backup rehearsal: original fields in all **40 tables** unchanged, **58 original lessons/sessions**, **10 PDFs** retained; historical one-to-one actual intervals and review state matched.
- **25 isolated built-Worker API assertions passed**: ten students/one hour, independent student facts, absent/late/early, admin review, own-only student history, unrelated teacher/group rejection, exact retry, stale concurrent editors, actual teacher/student conflicts, atomic rollback including history, old one-to-one teaching totals, independent one-to-one late arrival, in-flight old-version synchronization, and Sheet calculation compatibility.
- Separate focused assertion: ten completed student rows in one pending group produce one administrator review badge.
- **17 actual Chromium assertions passed** at 390×844 Chinese/English and 1366×900 admin desktop: ten-person teacher form, exceptions, affected-count confirmation, full-class save/review, reviewed teacher read-only display, student own history, native date inputs/full year, 44px form controls, no horizontal overflow or browser errors. Screenshots/evidence remain privately under `work/part09-release` outside this repository.
- Synthetic v14 backup/restore and previous production v13 restore passed. Production post-release v14 encrypted backup restored successfully in a separate local dry run: 40 tables/10 PDFs. No restore was applied to production.
- **31 read-only production checks passed**: final published resource hashes, both domains, Google configuration/PWA resources, sign-in/origin boundaries, unchanged original business rows/account/password/grade data, all old session/participant links, exact old one-to-one teaching totals and all PDF hashes. Only notification runtime advanced in the compared snapshots.
- Remote integrity: zero foreign-key errors, zero invalid teaching intervals and zero missing/foreign participant links. No synthetic accounts, classes, attendance or lessons were inserted into production.

## Private backups and recovery

- Pre-source snapshot: `backups/part09-production-source-before-20261015`.
- Final pre-data snapshot: `backups/part09-production-before-20261015-final` (v13); post-data: `backups/part09-production-after-20261015` (v14). All ten PDF hashes/bytes matched: **11,467,300 bytes**. Paths are relative to the parent workspace, outside this source repository; secrets/decrypted business data were not checked in.
- v14 export/full-backup validation and restoration preserve all new columns and audit history. Older accepted backups backfill missing attendance fields after historical import, without retroactively rejecting existing overlaps. Restored teaching/presence ranges and existing group relationships are validated.
- Retain the additive schema during code recovery. Prefer a forward correction; a previous UI cannot represent independent attendance safely. Pause operational writes and reconcile subsequent legitimate changes before any restore. The old snapshot must not be restored over new attendance without an approved recovery plan.
- Real Google re-login, physical phone push presentation and a real external Sheet commit were not retested in this release. Their retained configuration and local/production boundaries are not claims of a device or external-write test.

## Main source

- `lib/session-attendance.ts`, `lib/attendance-types.ts`, `app/api/attendance/route.ts`, migration 0023 and schema.
- `app/session-attendance.tsx`, teacher/admin portals, overview, calendar/list/history integrations, teacher timetable, menu badges and i18n.
- Existing action/state/history routes, canonical class-session reader and student Sheet source. v14 backup/export/restore and relationship validation remain in the existing backup scripts.
