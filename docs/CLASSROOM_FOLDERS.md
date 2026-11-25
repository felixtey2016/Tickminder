# Part 05: classroom folders and required classroom binding

## Production release — 2026-10-15

Published to https://www.tickminder.com/ and https://tickminder.com/ following the owner's explicit production-publication instruction. The original Part 05 file restricted implementation to the test site; the later instruction authorizes this production release.

- Worker: `tickminder-recovery`; version: `2629965e-e157-40aa-98b1-7bf98f925ab2`.
- Previous version available for code rollback: `e94193b9-52eb-48b5-ba65-a1a78ce3d144`.
- Only the 18 reviewed Part 05 application/schema files were ported from the tested source. Production configuration, real-owner authorization, Google login, scheduled notifications, Sheet settings and the two custom domains were retained. Test-only login, owner migration `0018_staging_owner.sql`, local runtime and secrets were excluded.
- Migration `0019_classroom_folders.sql` was applied directly to the existing production D1 database. It adds two tables, nullable folder locations, indexes and guards; no existing tables or business rows were rebuilt. Do not run the full migration directory against an already-initialized production database.
- The additional backup changes implement `timelyo-d1-v10`, including both folder tables. Readers retain v1–v9 compatibility. Format v10 uses application migrations through 0017 plus 0019; 0018 is test-only.

## User behavior and entry points

Teachers select an active classroom in **Teaching materials (PDF) / 教学资料（PDF）** or **Assign homework / 布置功课**, then browse/create folders and publish content there. The classroom's materials/homework tabs also provide folder navigation. Root navigation, breadcrumbs and parent navigation work on mobile.

New materials and homework require a valid classroom, including homework without an attachment. Teacher PDF uploads record the classroom before publication. Server checks cover group, responsible teacher, subject, active students and folder ownership. A staged PDF cannot be published to another classroom. Existing same-classroom materials may be reused as homework attachments without copying the PDF.

Teachers and group administrators can create, rename and move folders, and move existing content within its classroom. Folders support up to eight levels and 500 folders per classroom. Cycles, foreign parents and cross-classroom/cross-group moves are rejected. Archived classroom folders are read only; published content remains readable under its existing access rules.

Existing unbound material/homework is shown as **Unorganized / 待整理**. Explicit assignment must match the original teacher and subject and include all original recipients in the target classroom. The same record ID, file link, recipients, submissions and scores are retained. Recipients are not expanded to the whole classroom. Unfinished uploads from before this release require re-upload to record their classroom.

Folder deletion first previews subfolder, material, homework, submission and recorded-score counts. Cancel retains all content. Confirmation permanently removes the complete subtree and contained content, clears homework references from personal study plans and retains PDFs still referenced elsewhere. Changed content requires a fresh confirmation. Whole-class deletion previews now include folders. JSON list queries avoid large sets of SQL bound parameters.

Students browse authorized classroom folders without management controls. Materials/homework and PDF access retain recipient and classroom authorization. Existing aggregate learning views remain available.

No resource-library placeholder was added; that integration remains Part 13. No new third-party services or UI library were introduced. Existing theme, Lucide icons, Chinese/English switch and native date inputs remain in use.

## Verification actually performed

- Test-site API checks: 121 successful assertions, covering mandatory classroom binding, upload context, role/group/classroom isolation, tree limits and cycles, legacy IDs/grades/submissions, deletion preview/confirmation and shared PDFs.
- Additional test checks: 9 assertions, including deletion of 120 subfolders and 120 homework items, whole-class stale-preview rejection and legacy-recipient mismatch rejection.
- Test-site browser checks: 14 assertions at 390×844 in Chinese/English and 1440×1000 on desktop; actual uploads, moves, legacy organization, attachment-free homework, cancellation/confirmed deletion, student read-only access, error retry, no overflow or runtime exceptions.
- Production TypeScript and recovery build passed; the build checked the production account, D1/R2 bindings and absence of private assets.
- Before release, a fresh encrypted production snapshot containing 30 tables and nine PDFs was verified. Replaying migration 0019 in memory preserved every original column and row and created seven classroom state records.
- A synthetic v10 backup test restored archived classroom content, a reparented folder supplied before its parent, scores and a PDF; unauthenticated export was rejected. Historical replay temporarily disables the three current publishing guards, restores parents in order, restores state last and validates relationships before reinstating guards.
- After release, a v10 snapshot containing 32 tables and the same nine PDFs was verified with the full encryption/restore tools.
- Eighteen read-only production checks passed: both domains, Google login configuration, anonymous API boundaries, mutation origin rejection, PWA/service-worker resources, five published asset hashes, complete folder export, existing business data/password/grade preservation and unchanged PDF hashes. Only the normal notification runtime timestamp advanced.

These checks did not create production teaching fixtures or perform a new real-user Google login or physical-phone push test. Teacher/student interaction was tested on the isolated test site; production was verified through deployed assets, protected endpoint boundaries and encrypted data comparison.

## Private backups and rollback

Backups remain outside the source repository under the workspace's private `backups` directory:

- `part05-production-before-20261015-current`: verified pre-release D1/PDF snapshot.
- `part05-production-after-20261015`: verified post-release v10 D1/PDF snapshot.
- `part05-production-source-before-20261015`: original copies of the 18 ported source files.

Release manifests, migration rehearsal, synthetic backup proof and production verification are stored outside Git in `work/part05-release`. No secrets or live exports were placed in source. No GitHub upload was performed.

For a code rollback, select the previous Worker version, preserving the additive schema and existing rows. A Worker rollback does not restore database data. Do not remove the new folder tables or use the empty-database restore script against the live database. A database recovery needs a separately coordinated write pause and the matching encrypted snapshot. See [Cloudflare rollback documentation](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) and [D1 backup/export documentation](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

The deployed command used `--keep-vars`; see [Wrangler's deployment options](https://developers.cloudflare.com/workers/wrangler/commands/workers/). Runtime secrets were preserved, and the anonymous auth response confirmed the Google client is still configured.
