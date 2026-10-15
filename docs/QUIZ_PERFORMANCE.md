# Quiz responsiveness and publishing

## Changes

- Imported question pictures use a queue of at most three concurrent uploads.
  SHA-256 content identity reuses identical pictures and successful uploads after
  a failure. In-flight requests settle before retry becomes available. Server
  ownership, quota, MIME and image-grant checks remain authoritative.
- Progress distinguishes picture count, saving question/answer content, and
  publishing visibility. A 40-question paper is one version save; publishing its
  saved version updates the sharing pointer and does not upload pictures again.
- Saving, uploading and publishing protect against leaving through navigation or
  accidentally refreshing. The uncertain outcome of a committed request is
  resolved with the existing operation identity on retry.
- Background answer saves allow local question navigation. New edits made while
  a previous save is pending remain queued. Check, submit and grading keep their
  transaction guards. Ordinary saves retain existing confirmed results instead
  of evaluating the complete paper again; submission and expiry still grade it.
- Loaded attempts and answer keys are reused only inside the current request.
  Release decisions, active group/roster access, version conflicts, deadlines and
  submission/marking history continue to be enforced by server/atomic SQL guards.
- Quiz details join their selected immutable version in one database read.
  Group and active teacher/student membership are checked together. Bank cards,
  filters and facets use the shared version even when the author has a newer
  private draft. Cards return summaries rather than the complete question JSON.
- Directory metadata is reused within its mounted account/group workspace and
  invalidated on content changes. Hidden directories stop requesting pages;
  obsolete reads are cancelled. Preview/edit open immediate loading shells;
  cancelled requests cannot subsequently reopen a dialog. Editor preview uses
  the last successfully saved snapshot, including when there are unsaved edits.
- Quiz renders independently of course-state loading. Core refresh invalidates
  inactive scopes and refreshes the current page's dependencies. Classrooms keep
  their materials/homework dependency, selected tab and retry states.

## Verification

The regression suites use fictional in-memory SQLite/D1 data:

- `tests/quiz-performance-server.mjs`: 52 checks; a 40-question ordinary save
  uses three reads and one guarded batch, with one attempt/key read and zero
  grading evaluations. These counts exclude the mocked authentication provider.
  An immediate check evaluates one new question; expiry/submission evaluate all
  40. Timing, operation replay, live roster changes and disclosure races are
  covered.
- `tests/quiz-library-performance.mjs`: 125 checks, including an older shared
  version versus a newer 40-question draft, metadata/filter correctness,
  permissions, deleted/inactive records, save/share retry and payload budgets.
- `tests/quiz-upload.mjs`: 40-image queue limit, progress, duplicate content,
  already successful images, failure draining and retry.
- The existing 92 publishing checks, original practice, subject targeting,
  mathematical notation, TypeScript and guarded recovery build remain gates.

Browser evidence is outside the source repository in
`work/quiz-performance-release/`. It exercises an actual isolated built Worker,
40 different images through the real upload/save/share endpoints, slow saves,
mobile layouts and scope refresh. Injected network delays and local elapsed
times are not production performance promises. No test paper or synthetic
account is created in production.

## Release and rollback

No database migration, API-permission expansion, public test deployment or new
service is required. Keep existing D1/R2 bindings and production variables.
Before changing production, retain the encrypted full backup and the source
checkpoint. The deployed source through Part 17 is backed up on GitHub at commit
`81065b83a01f98517b16e1477816828e1dd0644c`, tree
`5d5204788e302d6633530be39b97e8aa5516ec26`.

Rollback to the preceding Worker requires no database restore or migration
reversal. Database/file backups are retained independently from public source;
never overwrite current user work merely to reverse a code-only release.

Published on 2026-10-16 as Worker
`9f0008a6-90c2-46f8-a90c-92993f59b453`, using source commit
`47733bdf87f41c0cf16d826be08539dd6efe4c09`. Final browser and production acceptance
each passed 30 checks. The prior Worker is
`6533355f-fb7f-4dcd-b618-c4d3e1f63a58`. Deployment metadata is recorded in a follow-up
documentation commit; it does not change the runtime build.
