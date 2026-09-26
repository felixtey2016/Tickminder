# Learning materials, homework, and personal study calendar

This feature branch adds private PDF materials, PDF homework submission, optional manual scoring, and student-owned study plans. It does not add chat, automatic marking, analytics, or a public file library. The existing lesson, attendance, account, and Google Sheet import routes remain separate.

## Data and storage

- D1 holds material and homework records, recipient permissions, submission history, optional maximum score and per-student score, study plans, and PDF metadata. PDF bytes stay in a private Cloudflare R2 bucket bound as `BUCKET`.
- Upload is limited to PDF MIME type, PDF signature and end marker, and 10 MiB by default. `PDF_MAX_BYTES` changes the per-file limit; `PDF_TOTAL_STORAGE_LIMIT_BYTES` changes the default 1 GiB site-wide quota. The upload API checks both limits. These variables must be positive integer byte counts.
- PDF URLs are authenticated API routes. R2 object keys are random, are not public, and are not exposed in API responses. The server checks each account's role and recipient or owner relationship before streaming a PDF. Browser responses prohibit caching and use generic download names; visible file labels strip email addresses and phone-like strings.
- Staged uploads are not submissions or distributed materials. Unused staged files expire after 24 hours and are cleaned on later uploads. Attached objects are deleted only after all material, homework and submission references are gone.
- R2 Standard storage pricing is published by [Cloudflare](https://developers.cloudflare.com/r2/pricing/): after any applicable free tier, storage and operations are billed. The default 1 GiB quota limits application uploads but does not cap provider charges for request volume or backups. Review current account pricing before relying on a free tier.

## Behavior and permissions

- Teachers can assign PDF materials and homework only to active students and subjects currently associated with their teacher record. They can view submissions only for homework they created. Only the assigning teacher can enter a score, and only after that student submits. Scoring is optional; a new submission clears a previously entered score.
- A student sees only their own materials, homework, submissions, and scores. Selecting a PDF file, uploading it, and submitting the homework are distinct actions. Submission opens at the start time. First submission after the deadline is marked late; replacing an existing submission after the deadline is blocked.
- Study plans are keyed by the student account, never added to the lesson table or attendance totals. Overlaps with lessons or other study plans need an explicit confirmation. A study plan linked to homework can be repeated and never marks homework as submitted.
- Dates and times in the forms are interpreted in `Asia/Kuala_Lumpur`.

## Local verification

Use an isolated Wrangler state rather than a copy of production data:

1. Build with `node scripts/run-framework.mjs build`.
2. Apply migrations `0000` through `0008` in order to `.wrangler/learning-test` using `wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/learning-test --file <migration>`.
3. Start `wrangler dev` on `127.0.0.1:5174` with the same `--persist-to` directory.
4. Run `node scripts/verify-learning.mjs`. The script uses fictional test accounts and clears its isolated local tables before seeding them. Never point port 5174 at production.
5. Run the existing `tests/*.mjs` checks, TypeScript, lint, and build.

## Production release gate

On 2026-09-26, the eleven existing D1 tables were read into memory and encrypted directly into `C:\Users\felix\Documents\Timelyo-Backups\production-pre-learning-2026-09-26.json.dpapi` (SHA-256 `ab970a1e8b8157be8c141adf2458c034a2cb086d79a1aace64c8a867c8847cc5`). A separate process decrypted it, restored every row into an in-memory SQLite database, compared all row contents, ran migrations `0007` and `0008`, and checked that pre-existing row counts remained unchanged. A second live read matched the captured rows. The export is a bounded read, not an atomic D1 snapshot; it is adequate as a tested pre-release recovery copy for the current low-activity test phase, but not a substitute for a provider-level transactional restore.

The backup key is protected with Windows CurrentUser DPAPI. The file can be restored only from the same Windows user profile; it is not a portable or offsite disaster-recovery copy. The encrypted file and any future PDF objects must not enter Git. To recheck the file from this checkout, run `node scripts/secure-d1-backup.mjs verify --in C:\Users\felix\Documents\Timelyo-Backups\production-pre-learning-2026-09-26.json.dpapi`. The verifier never writes plaintext to disk.

The existing production site has no PDF objects yet. Before release, provision and verify the private R2 `BUCKET` binding, test real teacher and student upload/download flows in an isolated deployment, and verify the mobile UI. After launch, PDF objects need a separate backup and restore plan. Keep the live site on its current version until these gates pass. Record the deployed Sites version and exact source commit in `RELEASES.md` after release.

### Isolated staging result (2026-09-27)

- Private staging Site: `https://timelyo-learning-staging.zezhou2009.chatgpt.site`, deployed version 7, staging source commit `37eb152c55285c7a6fa525a822eb74907549b383`. It uses a separate D1 database and R2 binding, with fictional teacher/student accounts. Production remains Site version 17.
- Live staging API checks passed: R2 PDF upload and byte-for-byte download, invalid PDF rejection, unpublished upload isolation, material recipient checks, independent homework submission, optional manual scoring, and student-only study plans. The temporary database bootstrap route and its secret were removed in staging version 5.
- The staging-only local credential setup route was removed before version 7. A live POST to that route returned 404 after deployment. Three fictional local accounts (one teacher, two students) were then confirmed to sign in and receive the correct roles on version 7. Demo credentials are held outside the repository and are for manual testing only.
- Existing lesson, identity, password, calendar, and Google Sheet sync regression tests, TypeScript, lint and build passed. The live Google Sheet endpoint was not called from staging, to avoid affecting production data.
- Mobile visual and tap-flow verification remains open because the connected browser test runtime failed to start. The fictional local accounts permit owner-run mobile checks without adding the staging origin to Google OAuth. Do not publish this feature to the public production Site until that final check is complete.
