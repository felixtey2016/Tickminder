# Class recordings

## User flow

- Teaching materials has PDF and Class recordings tabs. The classroom page has a Class recordings tab for the same records.
- Staff can add a recording from a classroom's course schedule, with the class, session and local lesson date prefilled.
- Required: classroom, title, Google Drive video URL and lesson date. A scheduled session and description are optional. Several segments can reference one session.
- Recordings start as drafts or can be published immediately. Videos remain on Google Drive; the website stores links and metadata only.
- **Whole classroom is the default audience, including students who join later.** Teachers can instead choose specific students. That explicit selection remains fixed until edited. Both audiences require current classroom membership.
- Students see only published recordings they can access. Drafts never expose Drive links to students. Google Drive sharing settings still need to permit the intended viewers; website access does not change Google permissions.
- Staff can edit, unpublish and delete records. Deleting a recording or classroom does not delete any Google Drive file.
- Lists load 24 records at a time, newest lesson date first. Search title and filter by classroom, subject and lesson month.

## Authorization and data integrity

`recordings.view/create/edit/delete` are separate administrator grants. Existing ordinary administrator grants are not silently expanded. Platform Owner and organisation chief have their existing privileged access within the selected organisation. Teachers can create in their own classrooms and edit/delete their own recordings. Students have no writes.

Every query and mutation is scoped to the current organisation and identity. Writes recheck authority, active classroom membership, session/date consistency and revision in the atomic batch. Operation IDs make retries idempotent. Public Google Drive URLs are validated and normalized; servers do not fetch arbitrary links.

Migration `0037_class_recordings.sql` adds `class_recordings`, `recording_recipients` and `recording_operations`. There is no modification of existing lessons or attendance. Account deletion and merging are blocked while the account owns recordings. Student deletion clears selected-recipient entries. Classroom deletion removes its recording metadata and records that effect in the existing deletion workflow.

The backup format includes all recording tables and the reconciled WhatsApp tables. Production deployment preserves existing database/file bindings and secrets. Use a complete private database snapshot before applying migrations.

## Checks

- `node tests/recordings.mjs`: domain, route permissions, organisation isolation, audience rules, pagination, revision/race guards and deletion.
- `node tests/recordings-backup.mjs`: export/restore structure and recording links.
- `node tests/whatsapp-onboarding.mjs`: reconciled WhatsApp source regression coverage.
- Local built Worker and mobile browser checks use fictional accounts and data, separate from production.
