# Tickminder independent Cloudflare recovery

## Current release - Complete-only Quiz submission and automatic self-practice

Both formal domains run Worker `e9c38aca-e16b-45e6-9d1c-522f5384cd2e` from runtime source `0aff48c77c0923b7a0c6316df75bcab8688af084` (tree `27fb8b50c87c9667c08247cd6401dc990f1a592f`). No migration; v19/53 tables, runtime settings and original bindings retained. Only local isolated testing preceded production publication.

Assigned manual submission requires every answer. Self-practice completes automatically through save/check; text editing defers completion until blur, and immediate feedback requires objective answer confirmation. Actual timer/deadline finalisation still accepts only saved work. History actions distinguish editable unfinished work, authorised saved progress and final results. Destructive Quiz confirmation remains readable under dark OS preferences.

Completion134, editing82, discard169, performance52, publishing92 and original practice tests passed; mobile Chromium32 and formal read-only/security/assets36 checks passed. Encrypted pre/post snapshots restore all53 tables and173 files with unchanged Quiz/attempt data and file checksums. Concurrent live savePlan metadata changes (student/class grade and revision) are recorded separately and retained. Existing8 test papers remain unclassified. Evidence is outside Git in `work/quiz-completion-release/` and `backups/`. A rollback must retain discard filtering/write guards and later user records; never replace production data with an older snapshot for a code rollback.

## Preceding release - Unfinished self-practice removal

Worker `1ebdaa8e-aa37-421f-8aae-76ba2017f3f6` serves both formal domains from source commit `66a49ab29582283c83210033c20cd4f5084f6c7c` (tree `ae58d289de67dc5f65b13d3871695c39a4b8f20b`). Only `0030_quiz_practice_discard.sql` was executed. Runtime settings, domain bindings, global menus, classifications and original business data are retained.

Backups are **v19/53 tables** with a nullable `quiz_practice_attempts.discarded_at`. Soft-discarded records retain answers, versions, keys, images and events; only own unfinished self-practice is eligible. Server save/submit/resume/history paths honor the flag. Rollback must retain those filters and write guards; the earlier unmodified Worker would resume discarded records. A restored v18 database needs additive migration 0030 before running this runtime. Do not replay unrelated historical migrations.

Verification includes 169 discard checks, 82 assigned-answer editing checks, 31 actual backup export/restore checks, 12 real mobile Chromium checks and 36 formal-domain/security/asset/integrity checks. Existing test quizzes remain unclassified; no production attempt or Quiz was removed for testing. Evidence and encrypted snapshots are outside public source in `work/quiz-self-practice-discard-release/` and `backups/`.

## Preceding release - Academic catalogues and Quiz paging

Published on **2026-10-16** as Worker `fdbfd958-cff7-4466-9b54-c41b96a4bddc`, from source commit `3f4ad0e4917e20e094bd0deed25795717b240476` (tree `bcc0d102257100cd50c90e5726dddf799b43a7d6`). Both formal domains, runtime variables and original D1/R2 resources are retained. GitHub `feat/tuition-groups` holds the complete source, including preceding feature commit `5363c02159310506c72d54a6c1f314ec5d0f0a58`.

Only additive migration `0029_academic_catalogues.sql` and an externally reviewed profile/classification plan were applied. Backups use **v18/53 tables** and include `academic_catalogues` plus `student_grade_promotions`. Historical records, original plan keys and raw subject labels remain intact. Restoring an earlier Worker must retain this schema, classifications, promotion history and later user work; do not blanket-apply the restored historical migration list or restore an old database as a code rollback.

Encrypted cutover snapshots before and after both restore locally. Post-release comparison passed 67 preservation checks, including identical bytes for all 10 PDFs and 163 question images. Seven student profiles/pairings/classes are classified, with only the four supplied student grades populated. No real student was promoted and no synthetic production Quiz was created. Formal acceptance passed 35 read-only/security/asset checks with zero FK violations; mobile Chromium passed 21 checks. See [ACADEMIC_CATALOGUES.md](ACADEMIC_CATALOGUES.md) and `work/academic-catalogues-release/` outside public source for evidence.

## Preceding release - Quiz responsiveness and image-heavy publishing

Published on **2026-10-16** as Worker `9f0008a6-90c2-46f8-a90c-92993f59b453` to both formal domains. GitHub source is `47733bdf87f41c0cf16d826be08539dd6efe4c09`, tree `7bc4c4779273e3266b05f47dbeff7d8f6d17c7b9`. Runtime variables and D1/R2 bindings were preserved. This is a code-only release with no database migration; retain v17/51 tables and all later user work when rolling back to Worker `6533355f-fb7f-4dcd-b618-c4d3e1f63a58`.

The release fixes local navigation blocked by autosave, serial image uploads, redundant Quiz reads, full question transfers for library cards and refresh of inactive page scopes. A 40-question/40-picture import/save/publication passed against an isolated real Worker. All 30 final browser checks and 30 production boundary/asset/integrity checks passed. Encrypted pre/post backup and restore checks accompany this release. No public test site or synthetic production fixture was used. See [QUIZ_PERFORMANCE.md](QUIZ_PERFORMANCE.md).

The earlier GitHub source gap is resolved: commit `81065b83a01f98517b16e1477816828e1dd0644c` preserves the deployed source through Part 17 before this optimization; the performance commit follows it on `feat/tuition-groups`. Historical notes below retain what was backed up at each earlier publication. Uploads, records and credentials remain in independent encrypted backups, outside public source.

## Preceding release - Part 17 Quiz publishing and marking

Published on **2026-10-15** as Worker `6533355f-fb7f-4dcd-b618-c4d3e1f63a58` to both formal domains, retaining runtime configuration and D1/R2 bindings. Initial Part 17 publication was `c346754e-8d42-4728-8910-d8dbf312a0d0`; final follow-up clarifies feedback wording. See [QUIZ_PUBLISHING.md](QUIZ_PUBLISHING.md).

Scheduled Quiz allocations, attempts, late rules, release controls, teacher marking/accommodations and durable Quiz notices extend the existing immutable practice model. All teachers can allocate across subjects within their own active class/student relationships. Quiz homework requires a class. Real read-only helper queries confirm Mathematics targets are now available to Mr Tey, without changing any real teaching data.

Only additive migrations 0027/0028 were executed, after encrypted pre-backup restoration and a real-data RAM-only rehearsal preserving all 1,348 original rows. Exports now use v17/51 tables and retain earlier-format support. The recovered database's historical migration list must not be applied wholesale. There was no public staging update, production QA fixture or GitHub upload. Preceding Worker `0c3dc68b-076c-4fb7-8ae7-9e2ab71abf94` remains an earlier rollback reference; keep the additive schema and all later history during an application rollback.

Final production acceptance passed 34 checks, including exact built/deployed asset hashes and zero remote FK errors. Encrypted post-backup restores 51 tables locally; independent comparison preserves all original business fields/records and all ten PDFs/163 quiz images. Only push-subscription and notification-runtime values changed. Actual production target SQL for Mr Tey returns one class and one student for Mathematics; no real account login or production student submission was manufactured for QA.

## Preceding release - Mobile Quiz layout and self-practice exit

Published on **2026-10-15** as Worker `0c3dc68b-076c-4fb7-8ae7-9e2ab71abf94` to both formal domains, retaining runtime configuration and D1/R2 bindings. Long titles wrap, preview/practice/image close controls have independent 44px targets, and phone navigation buttons fit their modal. Self practice may exit without submission, saving changes or warning when saving cannot be confirmed. Teacher allocations remain incomplete until submission. See [QUIZ_PRACTICE.md](QUIZ_PRACTICE.md).

Frontend-only update: no migration, production QA fixtures, file changes or public staging update. Preceding Worker `046c32b7-f01f-4d2f-a9ed-582f3e4f6582` remains a rollback reference. TypeScript, guarded build and focused phone browser checks passed; 18 read-only production checks confirm formal domains, authentication boundaries and published asset hashes. Evidence: `work/quiz-mobile-fix-20261015/` outside the application root.

## Preceding release - Quiz practice and scoped removal

Published on **2026-10-15** as Worker 046c32b7-f01f-4d2f-a9ed-582f3e4f6582 to www.tickminder.com and tickminder.com, keeping runtime configuration. Students practise shared quizzes; teachers import creator ZIPs, allocate practice and mark answers. Authors, explicitly designated group chiefs and platform owner have distinct removal scopes. See [QUIZ_PRACTICE.md](QUIZ_PRACTICE.md).

Migrations 0025 and 0026 are additive. Production uses v16 exports with 49 tables. Historical migration tracking in the recovered database is incomplete: execute only explicitly verified new files; never run all listed pending migrations. The preceding Worker 28a9c5a3-cd5f-4fb7-92af-0fa5f7f6baa2 and encrypted pre-release snapshot are retained. No test-site update or production QA fixtures. Encrypted pre/post snapshots restore locally; original business records, ten PDFs and 163 quiz images match. A concurrent normal user quiz copy was independently verified and preserved.

## Preceding maintenance release — raw mathematics import and Quiz search

Published on **2026-10-15** as Worker `28a9c5a3-cd5f-4fb7-92af-0fa5f7f6baa2`, retaining runtime settings and existing D1/R2 bindings. It fixes literal Quiz title/subject searches for original ZIP filenames. The preceding unified-hub Worker is `6d29bea2-a9b8-4016-9ba9-c5dd14ca026d`; no migration was required.

The user's four selected papers are public creator quizzes, with exactly 160 questions and 125 source images, Mathematics subject and no catalogue grouping. Standard authenticated administrator APIs, stable retries, full image/answer readback and encrypted pre/post backups were used. All original business rows/PDFs are preserved. Concurrent private imports/copies and normal login/logout/notification runtime changes were distinguished from this four-paper batch. Evidence: `work/math-four-import-20261015/` outside the application root. No public test site was updated.

## Unified Quiz hub follow-up — production release

The unified Quiz hub was published on **2026-10-15** as Worker `6d29bea2-a9b8-4016-9ba9-c5dd14ca026d`. This historical release is followed by the maintenance version above; the original Part 16 Worker remains an earlier rollback reference.

This follow-up combines navigation into one Quiz entry and Question bank / My quizzes tabs; adds real subject/Form/chapter filters without a year browse filter; groups platform subtopics and Chapter/Form Overall into difficulty → 40-question Sets; and displays immutable-version update dates in GMT+8 with default newest sorting. Both owner and ordinary group administrators may use ZIP maintenance import; teachers/students are rejected server-side. The large real question collection remains for a later local-indexing/manifest stage followed by approved batch import. Student assignment and recorded attempts remain Part 17. See [QUIZ_BUILDER.md](QUIZ_BUILDER.md).

The catalogue fields use existing quiz-version JSON, with no additional database migration. TypeScript, guarded build, catalogue rules, 39 isolated API checks, 41 browser checks and 33 read-only production checks passed. Pre/post encrypted snapshots restored locally with 45 tables, ten PDFs and 11,467,300 PDF bytes. Existing business/quiz rows, subscription identities/keys and PDF hashes match; only push-subscription refresh and notification runtime timestamps advanced. Remote foreign-key check is clean, and deployed Quiz assets match the tested build. No public test-site update, real ZIP import or GitHub upload. Evidence: `../../work/quiz-unified-release/`.

## Current production status

Latest production update: **Part 17 Quiz publishing, deadlines and marking on 2026-10-15**, Worker `6533355f-fb7f-4dcd-b618-c4d3e1f63a58`. See the current release above and [QUIZ_PUBLISHING.md](QUIZ_PUBLISHING.md).

Preceding production update: **Part 16 on 2026-10-15**, Worker `64780359-9624-445b-ad96-4d95841aeb8c` on feat/tuition-groups. Quiz drafts, math/image authoring, ZIP import and versioned private/organisation/public creator sharing use additive migration 0024. v15 backups contain 45 tables and private quiz images. TypeScript, guarded build, 14 parser/rule checks, 27 isolated API checks, 37 browser assertions, legacy/current backup restoration and 31 read-only production checks passed. All original business rows in 40 tables, 58 lessons/sessions and ten PDF hashes remain unchanged; remote FK violations are zero. Only notification runtime advanced. Actual student assignments/attempts remain Part 17; see [QUIZ_BUILDER.md](QUIZ_BUILDER.md). No public staging update or GitHub upload.

Preceding production update: **Part 09 on 2026-10-15**, Worker `6b82d3f3-4d15-40bf-b875-71d3258490b1` on feat/tuition-groups. Full-class attendance, independent teacher teaching periods, individual presence intervals and administrator review use additive migration 0023. All original fields in 40 tables, 58 lessons/sessions, exact historical one-to-one teaching totals and all ten PDFs are retained. v14 backup/local restoration, 25 isolated API assertions, one badge assertion, 17 browser assertions and 31 read-only production checks passed; remote FK, teaching-range and participant-link errors are zero. See [SESSION_ATTENDANCE.md](SESSION_ATTENDANCE.md).

Preceding production update: **Part 08 on 2026-10-15**, Worker version `138539ac-50c2-4fdd-b942-34f1a6c94a35` on feat/tuition-groups. Canonical group sessions, saved participant lists, weekly whole-class scheduling and administrator-approved group reschedules use additive migration 0022. Twenty-seven read-only production checks and full v13 backup/local-restore verification passed: all original fields in 38 tables, 58 old lesson IDs and all 10 PDFs are retained; the new snapshot has 40 tables. Foreign-key and session/participant mismatch checks are zero. See [CLASS_SESSIONS.md](CLASS_SESSIONS.md). The following paragraphs retain preceding releases and recovery history. Part 07 feedback and resubmission remain included; see [HOMEWORK_FEEDBACK.md](HOMEWORK_FEEDBACK.md).

Production cutover completed on **2026-10-11 at 14:56 Malaysia time**. Both `https://www.tickminder.com` and `https://tickminder.com` now serve the owner's `tickminder-recovery` Worker. The preceding application update published Part 05 classroom folders and required classroom assignment for new PDFs and homework (2026-10-15), on `feat/tuition-groups`, Worker version `2629965e-e157-40aa-98b1-7bf98f925ab2`. TypeScript, guarded production build, real-snapshot rehearsal of additive migration 0019, complete v10 backup/restoration and 18 read-only production checks passed. All existing business records and nine PDFs are preserved. This update has no GitHub upload; see [CLASSROOM_FOLDERS.md](CLASSROOM_FOLDERS.md) and the 2026-10-15 entry in [RELEASES.md](../RELEASES.md).

The preceding approved bilingual interface copy release (2026-10-14) used application source `e26d35104e54263463a49552cc805dae924a84ee` and Worker version `e94193b9-52eb-48b5-ba65-a1a78ce3d144`. Its explicitly authorized 33-file public backup is GitHub commit `bf1d79a0a001cddc9a3c7cb6b1e9989a4d083080`, whose tree matches that tested application source. This is a historical backup, not the source of the latest folder release.

Isolated tuition groups and the owner's platform console were introduced on 2026-10-12 at 20:51 Malaysia time (source `e8540a7`, Worker version `83573b14-7860-49fd-9633-4723bc489100`); see [TUITION_GROUPS.md](TUITION_GROUPS.md). Existing records belong to Next Genn Edu and ordinary administrators are restricted to their group. Unread/task badges and bordered filters remain included; see [MENU_BADGES.md](MENU_BADGES.md). Administrator homework/PDF review also remains included within group boundaries; see [ADMIN_LEARNING.md](ADMIN_LEARNING.md). The initial cutover used source `3f445c2` and Worker version `5055f5c3-ed5f-43b7-ac94-7d2a1bc6d095`. The original OpenAI Sites management permission was not restored. Registration and renewal remain with Exabytes.

The verification and historical preparation notes below distinguish pre-cutover checks from the completed cutover. The Google Meet feature remains on its separate development branch.

## Source and scope

- Initial recovery branch: `recovery/cloudflare-2026-10-10`. Current deployed application branch: `feat/tuition-groups` (see the verified publication record above).
- Base: production Sites v45, Git commit `4e0caad7805710471058259f9ad55a4193d1cf93`.
- The Google Meet feature remains on `feat/google-meet-detection`; it is not part of this recovery release.
- The original Sites manifest is retained. The independent recovery configuration now contains the two production custom domains; restoration scripts do not switch domains.
- Application pages, business rules, account IDs, password hashes, roles, calendars, attendance and Sheet matching are unchanged.

## Owner-controlled resources

`wrangler.recovery.json` targets the owner's new `tickminder-recovery-db` (APAC) and private `tickminder-recovery-files` (APAC, Standard). The configuration contains resource identifiers and PDF limits only. Runtime secrets and production data must never be committed.

## Build and deploy

For Cloudflare Workers Builds, choose the current deployed application branch recorded above, repository root `/`, and disable preview builds. Use Node.js 22.13 or later. Publishing this release used the authorized Wrangler connection directly; this record does not assert that a Git Builds connection was established or reconfigured. Do not deploy the older unscoped recovery source against the migrated groups database.

- Build command: `npm run build:recovery`
- Deploy command: `npm run deploy:recovery`

The independent Vite configuration does not load the Sites authentication plugin or local dotenv secrets. Vinext emits `dist/server/wrangler.json`. The build wrapper verifies the account/storage targets, removes generated development credentials, and rejects private files in public assets. The deployment command preserves dashboard variables; runtime secrets are not sourced from Git.

## Encrypted restoration

A fresh snapshot was retrieved from the original site at **2026-10-10 22:31:56 Malaysia time**. It contains 28 tables and 7 PDF objects (9,308,490 bytes). Existing encrypted backup tooling validated both DPAPI recovery and the portable recovery key.

On the same Windows account, outside the repository:

```text
node scripts/restore-cloudflare-backup.mjs --in <encrypted-snapshot-directory>
node scripts/restore-cloudflare-backup.mjs --in <encrypted-snapshot-directory> --apply
```

The first command decrypts only in memory and checks SQLite schema, all rows, integrity and PDF metadata. The second refuses nonempty recovery resources, imports the database, compares every table's canonical row hash, uploads PDFs through stdin, downloads through stdout in memory and checks every SHA-256. D1's CLI requires a temporary SQL file: its directory is restricted to the current Windows user before writing, CLI output is captured, and the temporary directory is removed in `finally`. No plaintext database or PDF is written to the repository.

If restoration is interrupted after cloud writes, inspect and verify the recovery resources before proceeding. Do not remove the empty-resource guard or retry by overwriting an existing database. The original site remains the source of current operational data until cutover.

## Pre-cutover configuration checklist (historical)

This checklist records the initial recovery prerequisites. Their completed checks and remaining follow-ups are recorded in the final cutover section.

1. Google client configuration and the owner's real Google sign-in are verified below. Preserve the existing OAuth client and authorized production origin at cutover.
2. Recover `SHEET_SYNC_URL` and `SHEET_SYNC_SECRET` without putting them in Git or chat. The owner confirms that Sheet import is still in use. Verify the selected month and a read-only preview before cutover; do not commit a test preview to the operational sheet.
3. The existing VAPID keys are configured. Keep `NOTIFICATIONS_CRON_TOKEN` and `PENDING_CLEANUP_TOKEN` absent during recovery testing to avoid duplicate reminders or deleting copied accounts. Preserve the original scheduled service credentials and reconcile delivery state at cutover.
4. A new recovery-only `BACKUP_EXPORT_TOKEN` and complete encrypted recovery backup are verified below. The original scheduled backup still uses its original protected token: align this at cutover and verify the scheduled job separately. Keep backup tokens and recovery keys separate from database snapshots.
5. Role isolation and private PDF reads/rejected uploads are verified below. A successful browser upload and homework submission remain to be checked using isolated test records.
6. Take a final snapshot during a controlled cutover window, reconcile changes since the test snapshot, then switch the existing domain. Restore the latest data only through a separately reviewed refresh procedure; the empty-target script is intentionally not an overwrite tool.
7. Record the exact recovery Git commit and Cloudflare Worker version ID. Original Sites version numbers do not apply to this independent Worker.

Code backup is not a backup of live database/PDF data. A functioning recovery test deployment is not proof that a domain/data cutover is complete.

## Verification completed before initial deployment

- Independent Vite build and Wrangler deploy dry-run.
- TypeScript `tsc --noEmit`.
- Existing isolated tests: unified login, startup/role filtering, notifications, lesson rules, Sheet matching and account management.
- Encrypted snapshot restoration in memory, including all table content.
- Owner account, database identity, empty target and private R2 resource checks.
- Cloud restoration completed: all 28 tables matched their source row hashes; all 7 uploaded PDFs were downloaded and matched their source SHA-256 checksums.

The restored resources contain the 22:31:56 Malaysia-time test snapshot. The scheduled backup status file and offsite backup copy were not updated by this manual recovery. Later production writes still require reconciliation before cutover.

Live application checks are recorded separately below. Domain cutover has not occurred.

## Initial recovery deployment (2026-10-10)

- Uploaded directly with the authorized Wrangler connection because the dashboard creation form did not expose a Git branch selector.
- Source commit: `2fcc253d98f33f5b7c27aeae51977c09ecf710b4`.
- Test origin: `https://tickminder-recovery.felixtey2016.workers.dev`.
- Initial Worker version: `305fb852-e054-471e-be0d-105b44bf3d96`.
- After configuring the original Google client ID as a runtime secret: `4e1bfbe4-8b90-4164-ba55-eee6b1432d59`.
- Live anonymous checks: home and Chinese terms returned HTML 200; manifest and service worker returned 200; `/api/auth` returned 200 with no account; `/api/state` returned 401. Google client configuration was confirmed present after propagation.
- Google login itself still requires the new test origin to be authorized in the existing Google OAuth client and a real sign-in check. No authenticated teacher/student/admin workflow is claimed here.
- No automatic reminders, Sheet sync secrets, backup export token, Git build connection or domain cutover was configured in this deployment step.

## Subsequent recovery verification (2026-10-10)

- The owner added the recovery origin to the original Google OAuth client and confirmed Google sign-in to the administrator account, with original courses, classrooms and accounts visible.
- Latest recorded Worker version after runtime secret configuration: `9bf87f37-d82f-4ba5-a169-23aeaf427bf6`. Application source remains `2fcc253d98f33f5b7c27aeae51977c09ecf710b4`; later commits record deployment evidence only.
- Runtime secrets present: `GOOGLE_CLIENT_ID`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `BACKUP_EXPORT_TOKEN`. Values remain outside source control. Automatic notification dispatch remains disabled.
- A fresh-profile Chrome check at 390 × 844 confirmed Chinese and English login rendering, no horizontal overflow or page errors, and successful Google button resource loading without an origin rejection.
- Thirteen deployed API checks passed using temporary synthetic teacher/student/admin accounts: password login with secure session cookies; lesson isolation; administrator scopes; blocked teacher/student account administration and Sheet imports; learning/classroom scopes; notification configuration without automatic dispatch; invalid/cross-origin/oversized upload rejection; private PDF access and SHA-256; and logout session invalidation.
- The private PDF fixture was placed through the storage CLI. This verifies storage/read permissions, not a successful browser upload or homework submission. Rejected upload requests failed before staged-file cleanup.
- The test harness initially used the wrong delivery-table cleanup column. D1 rolled back that cleanup; the harness was corrected, exact fixtures were removed, and a protected export then confirmed zero fixture rows across all tables. This was a harness issue, not an application schema change. All test storage objects were removed.
- A complete encrypted backup from the deployed recovery Worker was written outside Git to `backups/tickminder-recovery-2026-10-10-deployed` and verified with DPAPI and the portable recovery key: 28 tables, 7 PDFs, 9,308,490 PDF bytes.
- Final resource check at `2026-10-10T15:19:03.007Z` confirmed 28 tables, 7 PDFs, no fixture rows, anonymous backup export 404 and automatic dispatch 404.
- Evidence and mobile screenshots are outside Git in `outputs/recovery-verification/`. The local scheduled backup status and an offsite Drive copy have not been repaired or verified by these checks.
- Sheet runtime configuration, final source-data reconciliation, background service cutover, Git Builds connection and domain switch remain outstanding. The original production site is still authoritative for subsequent business writes.

## Reconnect the existing Google Sheet integration

In the original operational spreadsheet, open Extensions → Apps Script. Copy the existing `/exec` Web App URL from Deploy → Manage deployments. In Project Settings → Script Properties, find the existing `SHEET_SYNC_SECRET` value. Add the URL and secret directly to the recovery Worker's Settings → Variables and Secrets as runtime secrets named `SHEET_SYNC_URL` and `SHEET_SYNC_SECRET`, then deploy the settings. Do not send either credential in chat or store it in source/build environment files.

The current signed-request integration is `integrations/GoogleSheetLessonSync.gs`; it reads `SHEET_SYNC_SECRET`. The old prototype in the parent `work/apps-script-sync.js` reads `SYNC_SECRET` and uses a different protocol. If only that older property is present, identify the actual deployed script before changing anything. Do not rotate the secret, overwrite the original script, initialize months or create a replacement deployment just to reconnect the host.

After configuration, verify a month read and a preview only. Preserve exact student/subject matching, the existing mode, and the spreadsheet's current selected month. Commit import is an operational write and is not part of the connectivity check.

## Sheet reconnection verified (2026-10-10)

- The owner supplied the existing deployment configuration and added both runtime secrets. Because the credential appeared in chat, rotate it in both Apps Script and the new host during the coordinated cutover; rotating only the script now would break the original production host, whose settings cannot be updated.
- The existing deployment accepted a signed month read and an empty preview. A preview containing the recovery database's actual multilingual names failed signature validation. An otherwise identical preview with ASCII JSON escapes succeeded. This establishes a transport/signature encoding incompatibility; the exact Google-side default encoding was not assumed.
- Recovery application source `1edec1e236fef0a261c3f48451586caa0a398fce` serializes the signed payload as ASCII JSON text. `JSON.parse` restores exact names and subject text. HMAC, timestamp/nonce checking, permissions, matching, lesson calculations and import confirmation are retained.
- Regression tests exercise the actual Apps Script verifier with Chinese, accented text, supplementary Unicode, quotes, newlines and literal escape sequences, and reject a tampered hours value. Existing Sheet matching tests, TypeScript checking and the guarded recovery build passed.
- Deployed recovery Worker version: `37288605-22c7-436a-bf0b-1cc6849ad064`.
- Deployed administrator API previews passed for both `billable` and `all_completed`: HTTP 200, selected month `2026-09`, 5 matching rows and 2 `not_found` rows safely skipped. Confirmation tokens were returned. No spreadsheet commit was sent.
- The temporary verification administrator and its login/session records were removed; cleanup verification passed. Existing operational accounts and records were not edited. Evidence is outside Git in `outputs/recovery-verification/sheet-preview-report.json`.
- Both connection settings have a DPAPI-protected local copy outside source control. No plaintext credentials or spreadsheet contents are in these verification reports.
- The proposed extra temporary cloud diagnostic Worker was rejected by automatic approval review and was not created. Existing recovery resources and local checks were sufficient to resolve the issue.

## Domain readiness (2026-10-10)

- Read-only Cloudflare API check for the owner account returned no `tickminder.com` zone.
- Public authoritative nameservers still point to Exabytes: `ns184.mschosting.com`, `ns185.mschosting.com`, `ns186.mschosting.com`.
- No DNS, registrar setting or custom domain was modified. Onboarding the existing domain into the owner Cloudflare account and retaining all existing DNS records is required before a Worker custom domain can be attached. Nameserver activation and final routing/data cutover must be coordinated separately.

## Cutover preparation and initial DNS obstacle (2026-10-11)

- The owner authorized a maintenance window and paused operational writes. At `2026-10-11T06:21:24.640Z`, the owner zone was active and public NS resolution returned `dee.ns.cloudflare.com` and `matias.ns.cloudflare.com`. Registration and renewal remain with Exabytes.
- Fresh encrypted source and target snapshots were verified at 06:15 UTC: 28 tables and all 7 PDFs (9,308,490 bytes). Three-way comparison found no conflicting rows or business-record changes. Overnight additions were notification state only; the recovery sign-in added one session.
- A guarded reconciliation fetched current source data, refused unrelated business changes, inserted 9 notification items and 3 delivery records, and updated only the dispatch timestamp and two subscription `updated_at` fields. All 28 post-write table hashes matched the expected merged data; the additional recovery session was retained. No PDF objects were modified.
- Fresh-profile Chrome browser multipart checks passed with isolated local D1/R2 at 390 × 844: teacher PDF upload, assigned homework publication, student PDF upload without implicit submission, explicit submission, idempotent repeat, and blocked student publication. These exercise the built application's browser/API path, not all visible UI button flows. The installed local Workerd supports compatibility date 2026-05-22; that local override did not change the cloud configuration's 2026-10-10 date.
- Existing dedicated reminder, pending-cleanup and backup credentials were copied from DPAPI-protected local files through memory/stdin. VAPID, Google and Sheet settings were preserved. The original backup token now applies to the recovery Worker; the earlier recovery-only token is historical.
- The existing daily 02:30 Malaysia-time `Timelyo Encrypted Backup` task now targets `https://www.tickminder.com/`. Its other settings were retained. A successful post-cutover scheduled backup and cloud/offsite synchronization are still unverified.
- Recovery source commit `3f445c2` adds only the two existing production custom domains and a build guard for those targets. The guarded build passed. Worker version `5055f5c3-ed5f-43b7-ac94-7d2a1bc6d095` was uploaded and deployed, preserving runtime settings.
- Initial domain attachment failed with Cloudflare code `100117`: externally managed legacy DNS records could not be replaced by the Worker domain API. At that preparation checkpoint, the Worker had no production custom domains and original Sites still served the canonical website. The completed attachment is recorded below.
- The owner must remove exactly the two legacy apex A records (`162.159.143.30`, `172.66.3.26`) and the `www` CNAME (`custom-domains.chatgpt.site`) in the new Cloudflare zone. Preserve all TXT, MX, `mail` and `ftp` records. Then attach both authorized hostnames to `tickminder-recovery`, verify canonical HTTPS/routing/data and the next real reminder-clock invocation, and run the repaired backup job. Do not treat a changeset with zero conflicts as evidence that these legacy records are absent; public authoritative DNS still returned them.
- The Sheet shared credential was exposed in chat earlier. Coordinated rotation in Apps Script and the owner Worker remains necessary; a Sheet preview does not perform that rotation.
- Cutover evidence, encrypted snapshots and protected credentials remain outside Git. User `docs/ui-research/` is not part of this release.

## Production cutover completed and verified (2026-10-11)

- The owner confirmed removing only the two legacy apex A records and the `www` CNAME from Cloudflare. Both custom domains were successfully attached to `tickminder-recovery`, production, at `2026-10-11T06:56:04.026Z`. All unrelated TXT, MX, `mail` and `ftp` records were preserved. This was a domain attachment to the already deployed application, not another application code release.
- Canonical HTTPS checks passed for the root and `www` domains. `/api/auth` returned an anonymous account and the configured original Google client; `/api/state` correctly rejected an anonymous request. The manifest, service worker, Chinese/English terms and privacy pages returned 200, and an anonymous backup export returned 404.
- A protected canonical export matched the reconciled snapshot for all 25 tables outside notification generation/delivery/runtime state. All 7 private PDF objects matched SHA-256 (9,308,490 bytes). The additional recovery sign-in session, 22 sessions in total, and all 6 device push subscriptions were retained. Notification tables were allowed to advance as background dispatch resumed.
- Fresh-profile Chrome at 390 × 844 passed Chinese and English login rendering, with no horizontal overflow or page errors and the original Google sign-in iframe present. The owner had already verified real Google sign-in and original records on the recovery host before cutover. A new real sign-in on the canonical host and actual phone notification delivery after migration were not exercised by these automated checks.
- The existing `tickminder-lesson-reminder-clock` still targeted `https://www.tickminder.com` with `* * * * *`. Its protected dispatch credential was aligned with the preserved production credential. An authenticated dispatch returned 200 with no sends or failures. Wrangler tail then captured actual automatic scheduled invocations at 15:05, 15:06 and 15:07 Malaysia time, each `Ok`; the canonical dispatch timestamp advanced to `2026-10-11T07:07:26.642Z` without another manual dispatch. This verifies automatic server scheduling, not Android background notification presentation.
- The existing `Tickminder Pending Cleanup` Windows task remains ready and the canonical Worker's cleanup credential is configured. No account deletion was invoked as a connectivity test.
- The existing daily 02:30 Malaysia-time encrypted-backup task was blocked by its battery start/stop conditions while the computer was on battery. Only those two task conditions were changed to allow running on battery; its canonical URL and other settings were retained. A run through the task scheduler completed with result 0 at 15:04 Malaysia time. Backup status at `2026-10-11T07:04:07.124Z` records success, 28 tables and all 7 PDFs. The encrypted copy in the local OneDrive folder matched all file hashes and passed decryption/restore verification. Upload to OneDrive's cloud service remains unverified (`cloudSync: not-verified`); Windows-based jobs still require the host computer and their configured user session to be available.
- Encrypted post-reconciliation and scheduled snapshots, private credentials, verification JSON and the two mobile screenshots remain outside Git. Primary evidence: `production-domains.json`, `production-verification.json`, `production-services-check.json`, `reminder-clock-health.json` and `backups/backup-status.json`.
- Operational writes can resume. Remaining follow-up: rotate the Sheet shared credential in both Apps Script and the owner Worker because it appeared in chat, and verify actual cloud backup upload. The existing Sheet connection and both read-only preview modes passed before cutover; no operational Sheet commit or credential rotation is claimed.
