# Attendance undo and linked teacher/student selectors

## Behaviour

- Administrators with `attendance.edit` can open an existing attendance record and use the top **还原为未登记** action. Its reason and confirmation are independent of the normal register-all-students checkbox. Opening undo hides the ordinary attendance form and prevents accidental form submission.
- Undo restores uninvoiced attendance, actual teaching times and chargeability to the existing service's unrecorded state. Original submission evidence and history remain. Teachers stay locked after their first submission; an administrator handles any later registration or correction.
- Invoiced students continue through the existing financial attendance correction flow, preserving original invoices and receipts. Mixed sessions identify the uninvoiced students that can be restored separately.
- Never-saved attendance displays an explicit unsaved state; closing it does not require an undo. `未授课` is an actual attendance result, distinct from undo.
- Teacher/student filters are bidirectional in course lists, attendance boards, both timetables, classroom directories, student course settings and one-to-one scheduling. Neither person is automatically selected. Invalid selections and dependent scheduling plan/class/replacement choices are cleared.
- Course relation metadata includes current active assignments/class memberships and authorized historical records in the query context. Both person filters are omitted when finding options; DISTINCT occurs before pagination. Bound students without lessons remain available, as do names needed to find historical records.
- Timetables load names-only relation metadata before choosing either person. This request omits lesson decoration, summaries and paged lesson data. Cross-month stale secondary-only choices are cleared.
- New/edit assignment forms retain the full available teacher/student lists because they create new relationships. This exception is explained in the form. Existing group, role and module authorization still applies.

## Verification (2026-10-24)

- Unified TypeScript and production recovery build passed.
- Pure bidirectional options: 21 checks.
- Scoped complete course option service: 116 checks, including pagination, current/historical relationships, roles, revocation and metadata-only requests.
- Existing course range regression: 170 checks.
- Attendance edit window: 53 checks, including real-service undo of future scheduled mistaken attendance.
- Automatic attendance confirmation: 39 checks.
- Invoiced attendance corrections: 112 checks.
- Actual isolated Miniflare API: 9 checks with fictional accounts, current/historical relationships and a mistaken future attendance record.
- Chromium at 320/390/1280 pixels: 9 workflow groups passed. Verified both selection orders, bound-but-unscheduled students, secondary-only historical filter clearing after month change, dependent schedule reset, classroom/course directory filters, unrestricted new assignment form, actual top-action undo, retained first-submission evidence, teacher-only view and control geometry. Screenshots inspected.
- QA fixtures and credentials are local only; no real notification permission requested and no production records changed by QA.

## Release scope

Production `www.tickminder.com` / `tickminder.com`, GitHub branch `feat/tuition-groups`. No schema migration. Preserve existing D1 data, R2 binding, variables, WhatsApp integration and reminder cron. The demo deployment is outside this release.
