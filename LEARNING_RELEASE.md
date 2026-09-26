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

The site currently uses managed D1. The Sites database tools provide bounded read access, but no confirmed export/restore operation. The existing production site has no PDF objects yet, so the new R2 bucket starts empty; after launch, PDF objects also require a separate backup and restore plan. Keep the live site on its current version until a secure, recoverable D1 snapshot is verified, the R2 binding is provisioned, and real mobile, teacher and student flows can be checked in a nonproduction deployment. Do not put a database export or PDF objects in Git. Record the deployed Sites version and exact source commit in `RELEASES.md` after release.
