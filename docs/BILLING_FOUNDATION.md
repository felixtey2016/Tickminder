# Student course fees and monthly preview

Part 22 adds course rate settings and a monthly fee preview. It does not issue invoices, accept payments or export CSV files.

## Access and navigation

- Existing student allocations are now under **Student course settings**. Course and teacher management remain available to administrators.
- The platform owner can open **Fee settings** for each student course, or save a new course and continue to its fee settings.
- **Fees & billing** opens the monthly preview. Financial features are initially available only to the platform owner. Group chiefs, ordinary administrators, teachers and students cannot read or change fees through the API.
- Financial data is excluded from shared roster/core responses. Financial audit events are filtered before ordinary administrator activity pagination.

## Rates and calculation

- Supported rates: hourly, per lesson and fixed monthly, with an explicit effective date.
- Currency is MYR. Money is stored as integer cents. Hourly calculations use the nearest whole minute, then round each charge half up to cents.
- Late arrival or early departure initially uses the full actual teaching duration. Login and online presence are never used to infer attendance.
- Charges belong to the GMT+8 month when teaching actually started. Unrecorded lessons appear under their planned date for review. Rates are selected by the same date.
- Only reviewed attendance can produce a confirmed charge. Reviewed absence billing decisions are respected. Teacher absences are exempt. Makeup chains are checked to avoid charging both the original and replacement lesson.
- Missing rates, unreviewed attendance, unresolved makeup billing and uncertain enrolment are shown as needing review and excluded from the calculated subtotal.
- Partial-month joining, pausing or leaving requires an explicit manual confirmation or amount adjustment. An inactive course is not silently charged a full monthly fee.
- An amount adjustment requires a reason. Zero is an allowed waiver. Clearing an adjustment records the reason and keeps its history.
- Changes to the underlying attendance, rate or policy invalidate an old adjustment and return the line to review.
- First rate/policy versions can be backdated. Subsequent versions take effect tomorrow or later and retain previous versions.

## Data integrity and future exports

The financial identities are separate from legacy student names and plan keys. Existing lesson, classroom and student identifiers remain intact. Student-course financial identities include the syllabus. Deleting an item with financial history is blocked; deactivate it instead.

The monthly API returns paginated student summaries, with line details requested for one student. Structured lines retain the student and lesson identifiers, rate and policy version references, raw duration, billable minutes, integer amounts, currency, status and adjustment history. A later CSV export can consume the same calculation result instead of calculating a second total from rendered text. An export must cover the selected query, rather than only the currently displayed page.

Backup format v20 includes eight financial tables. Restore remains compatible with earlier supported snapshots; restoring an older snapshot creates financial identities without inventing rates.

The full cloud restore script requires an independently approved target file outside the source repository, supplied with `--expected-target`. Its account, database and bucket must match the deployment configuration before any cloud command runs. Legacy snapshots without group membership also require the legacy owner's email in that private file. No live target identifiers are embedded in the restore script.

## Duration display

Shared formatting converts lesson durations to **1小时30分钟** or **1 hour 30 minutes**. Totals accumulate the raw duration before formatting. Missing timestamps remain unknown rather than becoming zero. Existing numeric Sheet write values and business calculations are preserved.

## Verification

- `tests/billing.mjs`: real SQLite migrations and API handlers, exact fee calculations, pagination, versions, adjustments, role/group access and transaction races.
- `tests/billing-backup.mjs`: actual snapshot export and restore, old snapshot compatibility and financial referential integrity.
- `tests/part01-access-boundaries.mjs`: actual State response privacy, audit filtering before pagination and role boundaries.
- `tests/account-management.mjs`: history-preserving deletion guards and precise duration preview values.
- `tests/duration-format.mjs`: Chinese/English formatting, invalid values and aggregate precision.
- Isolated built Worker/browser checks use fictional records for responsive layouts and the owner-only workflow.
