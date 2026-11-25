# November 4 usability corrections

Production scope: www.tickminder.com and tickminder.com; public source branch feat/tuition-groups. Test-site and demo deployments are excluded. No database migration.

## Scheduling

One-to-one, whole-class, planned lesson editing and reschedule requests share a lesson date, start time, end time and explicit Next-day end checkbox. A 23:00 to next-day 00:00 lesson lasts one hour. Same-day reversed times are invalid; the existing server limit remains strictly more than zero and no more than 12 hours. Repeat, conflict checks and request permissions remain in force. Existing actual-attendance and non-lesson date/time fields retain their purpose-specific custom controls.

## Group and classroom navigation

The platform Owner can create and manage groups from Group information. Ordinary group administrators do not gain platform controls. Additional platform-only tabs remain outside the information view.

New classroom uses a framed dialog with a visible 44-pixel close button. Choose name, term, teacher, paired students and course. The course selector is always shown; exactly one common course is automatically selected. Multiple courses remain explicit choices. Curriculum, grade and subject are derived from the complete common course identity, not a subject label alone. Missing classification or no common active pairing blocks creation with a meaningful explanation. Existing classroom edits keep the previous immutable classification and historical members.

Homework opens the full classroom list. Folder filtering is optional and does not change stored folders, ownership, recipients or permissions.

## Tasks

Creation accepts optional boolean requiresReview, default true for compatibility. The publishing teacher chooses whether student submission needs teacher review. Student action submit remains the supported API; the server returns awaiting_review or self_completed from the stored task mode. Old complete events remain legacy_completed; approved work remains completed. Modes are not retroactively applied to old tasks.

Task deletion requires the publishing teacher with current classroom access, or an administrator with tasks.delete. previewDelete returns a short-lived impact fingerprint. delete requires the same target, previewAt, fingerprint, confirm:true and an operationId. Preview is not a write. The transaction rechecks current session, permissions, creator, task and all student history, including former class members. Deleted tasks disappear from lists, inbox and direct views; tombstone and completion/audit history remain. Stale previews require another preview. Unknown results are retried with the original operation ID.

## Closing dialogs and completing fees

Shared dialogs and sheets retain a visible close button during scrolling. Long titles reserve space. Framed classroom and course/fee dialogs scroll the body while the title, close button and footer stay available. Custom quiz/recovery dialogs keep their dedicated close behavior; native finance, invoice and recording dialogs have explicit X controls. A pending write can temporarily disable closing rather than hide the control.

The course fee workflow uses Save and finish. Rate and, when changed, collection timing are separate existing server operations. Close only after both necessary responses confirm success. If the rate succeeds but timing is unconfirmed, keep the dialog open and retain the operation ID; do not create a duplicate rate. Unknown timing locks draft fields until the same operation is retried or current server data is explicitly reloaded. Unsaved fee edits require an explicit discard choice before closing.

## Removing unused fee configuration

Permanent student-course deletion may remove unused rate versions, rate configuration, subject collection timing and billing subject configuration only after transactional proof that no actual financial, lesson, shared-plan or accrued monthly-billing dependency exists. Current billing authority is required in addition to course deletion authority. Existing protective database triggers remain unchanged. Finance and audit history, student identity and global billing policies are retained. Real invoices, receipts, payments, adjustments, shared configurations or used schedules continue to block removal.

## Spreadsheet write retirement

The spreadsheet write panel, permission module, server bridge, Apps Script source and runtime type requirements are removed. The old /api/sheet-sync GET and POST endpoint returns 410 without database or outbound requests. Existing CSV downloads, Google sign-in and Google Drive imports remain. Only the three retired permission keys are ignored when reading old stored grants; unknown keys, duplicates and missing dependencies still fail closed, and new configurations cannot submit retired keys.

Existing external spreadsheet data is retained. Website publication does not remove any previously deployed Apps Script web app or its independent triggers. Those external resources require separate verification in their owning Google project. Historical audit records remain intact.

## Validation boundaries

Use fictional SQLite/D1 data and local browser fixtures for writes and permission races. Final compiled CSS and isolated built-Worker checks cover the current candidate. Production verification reads Worker metadata and static assets only; it does not create lessons, alter fees, send emails or query production D1.
