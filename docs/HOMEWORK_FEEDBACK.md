# Part 07: resubmission, feedback and marked PDFs

## Scope and operation

The user's direct instruction authorizes production publication, overriding Part-07.txt's earlier test-only scope. Implementation uses the existing production source and a new isolated local built-Worker environment. The public test site's code, accounts, files and runtime are not changed.

- Teachers open **Assign homework → classroom → student → Submissions and feedback**. They can select a specific submission, append comments, publish an optional marked PDF, allow one resubmission or revoke unused permission.
- One permission applies to the latest submission and is consumed by the student's next submission, including a normal replacement before the deadline. It is not a permanent deadline bypass. Existing first late submissions and ordinary replacements before the deadline retain their previous rules.
- Students open **My homework → Submissions and feedback**. Only their own submission files, comments, marked PDFs and grades are returned. An authorized replacement clears the current grade, while earlier grades and feedback remain attached to the relevant submission.
- Submission order uses an increasing attempt number, then time and ID, so tied timestamps or clock skew cannot silently select an earlier attempt as current. Existing attempts default to zero; their dates, files and IDs remain unchanged.
- Administrators retain the existing group-scoped read-only review access. Part 03 granular administration is not installed; this release does not grant administrators teacher feedback or resubmission actions.
- The existing editor offers **Notify assigned students who still have access**. Only originally assigned, active students who still meet classroom access rules receive an event. Shared access to the same PDF does not grant access to another homework's notices or history.
- Feedback publication and resubmission grants generate notifications for the affected student. Inbox messages contribute to the existing unread red badge, can be marked read, and open the existing homework/material page.

## Integrity and permissions

- Immutable feedback is tied to an exact submission. A marked PDF must be uploaded by the homework's teacher, in the correct classroom and submission context. Staged files become visible to the student only after publication.
- Teacher ownership, active classroom management, account role, recipient identity and group scope are checked on the server. Students cannot retrieve another student's review or marked PDF. Current access is checked again for inbox retrieval and push delivery.
- Grant revisions and latest-submission checks reject stale permission/submission actions. File uploads use request IDs and file digests; feedback, grants and optional edit notifications use operation IDs/hashes. Identical retries reuse their saved outcome, and transaction/unique constraints prevent duplicate records. Concurrent collisions may return a reload/retry message.
- Submission, grant, revocation, feedback/file publication and notification choices are audited. Existing grades with an unknown historical submission remain explicitly unlinked; no association or old denominator is invented.
- Confirmed folder/homework/classroom deletion includes feedback, grants and all retained submission PDFs. Unreferenced files are removed, while shared files remain until their last reference is removed.

## Migration, backup and rollback

- Additive migration **0021_homework_feedback.sql** adds four tables and request/permission/attempt columns. It does not rebuild existing tables or change existing business values.
- Full backup **timelyo-d1-v12** includes all 38 tables and referenced PDF bytes. Restoration loads parents/submissions before grants/feedback, validates their group/file relationships and accepts previous v11 snapshots.
- Pre-release encrypted database/PDF backup and pre-release source snapshot are outside the deployed source. The existing v11 production snapshot was restored in memory, migration 0021 applied and all original columns/rows in 34 tables compared exactly.
- For a code rollback, restore the preceding Worker version while retaining the additive schema. Do not reapply migration 0021 or delete new feedback/history. A full data rollback requires a separately reviewed recovery procedure; the existing restore tool refuses nonempty targets. The updated grade-history trigger depends on the retained attempt column.

## Actual verification

- TypeScript and guarded production build passed.
- 28 assertions against the actual locally built Worker: authorization/revocation/consumption, post-deadline rejection, original/current grades, exact submission feedback, student/group boundaries, upload/event retries, recipients, read counts, encrypted Web Push and persisted delivery state.
- 19 Chromium assertions: Chinese/English at 390×844 plus desktop; teacher feedback/PDF publication, revoke/grant, old grades, student resubmission, administrator review, notification navigation, touch targets, year display and no page errors. Screenshots are retained in the private local release evidence directory.
- Six deletion assertions verified folder warnings, corrected/submission-file removal, notice removal, shared-file retention and classroom cleanup.
- Synthetic v12 backup (38 tables) and pre-release production v11 backup restoration passed.
- Local workerd supports compatibility date 2026-05-22; the production compatibility date remains 2026-10-10. Production read-only checks and post-release full backup provide a separate verification of the actual deployed assets/schema.
- Push testing uses generated isolated VAPID/device keys and a mocked FCM endpoint; seven encrypted requests reached only the intended fictional device. Repeat dispatch produced no additional requests. No real phone operating-system delivery is claimed.

## Push limits

The existing authenticated cloud scheduler invokes the same dispatcher. No new service is required. Eligible teaching events enter the existing Web Push path, with up to three bounded attempts, a 24-hour dispatch window and a one-hour provider TTL. Delivery failures are reflected in per-device state; access revocation prevents dispatch. Normal retries do not resend completed jobs. If a provider accepts a request but its response is lost, a retry can occur; the stable notification ID also supplies the existing OS tag for display deduplication. Browser/system delivery still depends on device permission, subscription and connectivity.

## Production release — 2026-10-15

- Published Worker version e1b0f6dd-e104-4628-9415-41649646dbe4 to both www.tickminder.com and tickminder.com, retaining dashboard variables/secrets. Previous code version: 343968c2-9063-41ac-8d1e-1d24b6464516.
- Migration 0021 completed on tickminder-recovery-db with 38 tables and zero foreign-key violations.
- Twenty-five read-only production assertions passed: canonical domains, retained Google login configuration/PWA resources, anonymous/origin/method boundaries, five exact built-asset hashes and all original business rows/columns.
- Pre/post encrypted snapshots contain 34/38 tables and the identical nine PDF hashes and bytes (10,983,211 bytes). The only changed previous table is the background notification_runtime timestamp. No synthetic accounts, feedback, grants or notices were written to production.
- Private evidence is in work/part07-release outside the deployed source: api-results.json, browser-results.json, deletion-results.json, migration-results.json, backup-results.json and production-results.json. Pre-release source and encrypted production snapshots are in backups/part07-*.
- No GitHub upload, public test-site update, real Google re-login, physical-phone push delivery test or new paid service was performed.
