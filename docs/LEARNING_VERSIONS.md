# Part 06: non-destructive homework edits and PDF version history

## Production release — 2026-10-15

Published to https://www.tickminder.com/ and https://tickminder.com/ under the user's explicit production instruction. This overrides the attachment's older test-site-only deployment scope. No public test-site source, hosting, account or data was changed.

- Worker: `tickminder-recovery`; version: `343968c2-9063-41ac-8d1e-1d24b6464516`.
- Previous Worker version: `2629965e-e157-40aa-98b1-7bf98f925ab2`.
- Additive migration: `0020_learning_versions.sql`; 31 queries applied successfully. Final D1 bookmark: `00000030-0000002f-00005104-fb69727ca90a1cddf566f8db22e85926`.
- Runtime secrets, Google login, group boundaries, notifications, Sheet connection, private R2 storage and canonical domains were retained. No GitHub upload or paid-service change was performed.

## Entry points and behavior

Teachers can use **Edit homework / 编辑功课** and **Edit material / 编辑资料** on published items, including items inside classroom folders. The editor loads the latest record before accepting changes. Titles, descriptions, homework start/deadline, maximum score and PDFs can be changed while keeping the same content ID, assigned students, submissions and grading history. Editing does not republish content to newly added classroom members.

New PDFs can replace teaching material or homework attachments. Homework can also use existing same-classroom teaching material, or remove its current attachment. Old PDF objects remain available through authorized versions, submissions or other content references. Legacy unassigned content may have its text edited, but must be explicitly organized into an active classroom before uploading a replacement PDF.

**Versions and history / 版本与记录** is available to teachers, administrators and authorized students. It identifies the editor, date, version and changed content. Students only receive their own grading history. Knowing or accessing a shared PDF does not grant access to another material's version history. Administrator review remains read only because Part 03's granular administrator permissions have not been implemented; no new administrator write permission was inferred.

Archived classroom content remains readable, but edits and grading are blocked. Teacher ownership, active classroom responsibility, group identity, student assignment and file authorization are checked on the server. Existing download URLs remain protected.

## Confirmed business rules

- **Lowering maximum score:** block a new maximum below any existing score; first adjust the affected grades. No silent score deletion or proportional conversion. Grading cannot be disabled while current scores exist. Original scores remain in grading history, including when students resubmit and their current grade is cleared under the existing resubmission workflow.
- **Deadline changes:** existing submissions retain their original timestamp and late status. New submissions store the exact homework revision, start/deadline and maximum score at submission. Old submissions have unknown historical version/deadline fields left null rather than guessed from today's content.
- **Concurrent changes:** content saves compare the editor's captured revision. Grade saves also compare grade revision and the submission being graded. Submissions compare the version selected with their PDF. Transactions and database guards prevent a concurrent score change from creating an invalid new maximum. Conflicts preserve the content editor's unsaved draft, offer latest history and require an explicit reload before replacing that draft.

## History and deletion

Existing teaching content was captured as 16 baseline versions. Baselines are labeled as the content present when version tracking began, not reconstructed prior edits. Earlier grading audit events are imported where available; unknown historical denominators and content versions are explicitly shown as unknown.

Permanent homework/classroom deletion previews include content versions and grading history. Recursive folder deletion includes version counts. Explicitly confirmed deletion removes the affected history and cleans only files with no remaining reference. PDF cleanup first claims a file atomically; new version rows cannot reference a file being deleted. Failed R2 cleanup retains metadata for retry.

## Verification actually completed

- TypeScript and guarded independent Cloudflare production build passed.
- 26 checks against the actual built Worker in an isolated local Miniflare D1/R2 environment: each editable field with graded/submitted homework; old and new PDF access; version snapshots; score conflicts and score correction; stale editors/grades/submissions; read-only student/admin history; exact shared-file history boundaries; archived classrooms; normal publication and deletion preview.
- 17 real Chromium browser assertions: Chinese/English 390×844 editors and history; actual save/list refresh; visible year and native date inputs; preserving drafts through conflict and latest-history viewing; private student grading history; administrator desktop review at 1366×900; no horizontal overflow or browser runtime errors. Visual inspection confirmed the new dialog is above the mobile topbar.
- Six actual deletion assertions: historical file cleanup, shared PDF retention, folder version counts, release of final references and whole-classroom deletion. All mutations used only fictional data in the separate temporary local environment.
- Real encrypted production snapshot migration rehearsal preserved every old column and row across 32 tables. Foreign keys/integrity and accurate content baselines passed. No historical submission version was invented.
- v11 synthetic full backup restored 34 tables and five fictional PDFs, including multi-version content and grades. Previous production v10 backup also passed restoration into the current schema. Neither restoration applied data to the live database.
- 20 read-only production checks passed after publication: both domains, Google login configuration, anonymous/origin boundaries, PWA resources, five matching published asset hashes, v11 export, exact preservation of old business rows and PDF hashes, accurate baseline snapshots and historical late status. Only the expected background notification runtime timestamp changed.

Local workerd supports compatibility date `2026-05-22`; production retains its existing `2026-10-10` date and `nodejs_compat` flag. Real user Google login, physical phone notifications and hardware-device rendering were not retested for this teaching-content release.

## Backups and evidence

Private encrypted snapshots are outside the application repository:

- `backups/part06-production-before-20261015-current`: portable v10 snapshot, 32 tables, nine PDFs, 10,983,211 bytes, verified recoverable.
- `backups/part06-production-after-20261015`: portable v11 snapshot, 34 tables, the same nine PDF IDs/bytes/SHA256 hashes, verified recoverable.
- `backups/part06-production-before-20261015`: an additional Windows DPAPI backup of the original 32-table data.

Evidence is in the task's private `work/part06-release` directory: `api-results.json`, `browser-results.json`, `deletion-results.json`, `migration-results.json`, `backup-results.json`, `production-results.json`, `build.log` and phone/desktop PNG previews. Tokens, real database exports and PDF bodies were not written to public source/assets. The local QA runtime was stopped after completion.

## Rollback and limits

Do not replay the full migration directory on the live database. Do not remove the additive history schema to roll back UI code. For emergency code rollback, use the preceding Worker version and retain the migration and encrypted snapshots. Its older backup exporter does not include the new history tables; therefore restore the v11 exporter before relying on scheduled history backups. The separate restore tool refuses nonempty target resources and was only used in local dry-run mode here.

This part does not add Quiz Builder, granular administrator permissions, cross-classroom redistribution, automatic historical regrading or additional notifications. Old edits that were never recorded cannot be reconstructed.
