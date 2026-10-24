# Parent home and combined child courses

## Navigation and presentation

The parent workspace has a dedicated **Home** menu entry and uses it as the default landing view. The course area contains calendar and list views with the child's attendance displayed on the same lesson card. Homework, teaching materials/recordings, learning, finance, notifications and account settings retain their existing modules.

Home shows, in this order:

1. The current GMT+8 date and the parent's name.
2. Today's courses across all currently linked children. Cancelled courses are excluded from this section. If there are no courses today, show the next scheduled course; the lookup uses one ordered result and has no arbitrary 90-day cutoff.
3. Short reminders for incomplete homework, issued-invoice balances within the parent's financial authorization, and unread notifications.
4. Linked children's names, syllabus and grade with links to their courses.

Children and today's course records each use independent pages of at most 20 records. Home does not download every child's full schedule, homework history or billing history. It loads a summary endpoint; the other modules remain lazy loaded.

## Combined calendar and list

For parents with multiple children, the course picker offers **All children** as well as individual names. A single linked child is displayed directly. All means every currently authorized child, including children beyond the first 20-name picker page.

The list supports All, Upcoming/Not yet taught, Completed, Absent and Cancelled. Upcoming identifies uncompleted course records and also includes older unrecorded lessons. It does not discard a missed record merely because its planned start is in the past.

Each calendar count represents a **child's course record**. Two siblings attending the same group session contribute two records. Their attendance remains separate, and combined lesson cards identify the child. No attendance information about other class members is returned.

Calendar summaries contain at most 31 daily aggregates. Daily and monthly detail lists are paginated independently of those totals. Time ranges use GMT+8 and half-open overlap: a lesson ending exactly at midnight does not also belong to the next day; a lesson crossing midnight can appear on both affected dates. Offset-formatted historical timestamps are compared as real instants.

## Home reminder definitions

- **Incomplete homework:** count currently published homework recipient records without a real submission. Future publication is excluded, and the child's current classroom, subject and teacher access is required. Grading does not determine completion. A group assignment pending for two linked children counts twice. The summary spans all published due months, and its target includes the relevant due month.
- **Unpaid invoices:** count issued, non-void invoices with a positive remaining balance. Drafts and paid invoices are excluded. Remaining balance follows the existing ledger: original total + charges - credits - received + reversals + refunds - applied prepayments, floored at zero for each invoice.
- **Financial scope:** only children with a current explicit financial grant enter the balance query. The response reports `financialChildren` and `totalChildren`; the UI states the coverage and displays an authorization message instead of a zero balance when no child is authorized. It does not combine unpublished estimates with formal debt.
- **Navigation targets:** financial reminders prefer a child with debt and a valid financial grant, then the first financially authorized child. Homework reminders target the earliest due incomplete recipient. Both targets carry the child's name-picker page. Course records also carry `childPage`, so children beyond page one can be opened accurately.

## API contract

All responses use private, no-store caching with cookie and group variation. These endpoints require the current parent role, active group, active account and valid current session when session bound.

### Home

`GET /api/parents?view=home&childrenPage=1&lessonsPage=1`

Optional `date=YYYY-MM-DD` chooses a valid day for the course section; omission means today's GMT+8 date. Homework publication uses the current instant, and issued-invoice balances remain the current authorized balances.

The `ParentHomeResponse` type in `lib/parent-home-types.ts` contains:

- `date`
- `children: ParentPage<ParentChild>`
- `today: ParentPage<ParentCourseLesson>`
- `nextLesson: ParentCourseLesson | null`
- `financeTarget: { studentId, childPage } | null`
- `homeworkTarget: { studentId, childPage, month } | null`
- `summary: { pendingHomework, unpaidInvoices, remainingCents, financialChildren, totalChildren }`

### Courses

`GET /api/parents?view=calendar&studentId=all&month=2026-10&status=all`

`GET /api/parents?view=lessons&studentId=all&month=2026-10&date=2026-10-15&status=all&page=1`

`studentId=all` or an omitted/empty student ID selects the combined scope. An individual ID must be a currently linked active child. `status` accepts `all`, `upcoming`, `completed`, `absent` or `cancelled`. A requested detail date must be within the selected month.

Combined/new-filter responses include `child` (null for All), `selection`, `totalChildren`, `status` and `month`, followed by `days` or a detail page. Detail records add `studentId`, `student` and `childPage` to the previous whitelisted parent lesson projection. Internal notes, fee rates, account credentials and other class members are not included.

For compatibility, existing individual-child calendar/list requests that omit `status` retain the previous service and response shape. The new UI explicitly sends `status`.

## Authorization and storage

Every combined query starts from active parent-child links joined to active students in the selected group; it never trusts a client-supplied list of child IDs. The service captures the complete link and financial-grant epochs and rechecks them with live identity/session predicates after the data reads. Revocation, relinking, account/group deactivation or logout during a request rejects the stale response. Relinking a child does not revive an old financial grant.

Parents cannot use the administrative association-management endpoints or edit attendance, teaching records or money through these read views. Existing per-child financial and document checks remain in place. No database migration, backfill, account creation or existing teaching/financial data rewrite is required for these features.

## Local verification evidence

At implementation time:

- `tests/parent-home-courses.mjs`: **163 checks passed**, using real SQLite with all current migrations, foreign keys and triggers.
- `tests/parents-calendar.mjs`: **133 checks passed**, including the original individual-child response shape, daily totals and authorization compatibility.
- `tests/parent-notifications.mjs`: **148 checks passed**, including a reproduced mixed `+08:00`/`Z` timestamp case crossing a 20-record page boundary. Notification lesson positions now use the same real-instant ordering as the course list.
- TypeScript `tsc --noEmit` passed.

The new suite covers 25 linked children, independent 20-record pages, same-session siblings with different attendance, status/category totals, GMT+8 boundaries and offset timestamps, a next lesson beyond 90 days, real homework submissions, current classroom access, partial financial grants, ledger adjustments/payments/refunds, exclusion of drafts/void/paid invoices, cross-group and role denials, no per-child query loop, revoked link/grant epochs, logout during reads and foreign-key integrity.

## Integrated local acceptance (2026-10-24, GMT+8)

- Recovery build and project TypeScript passed.
- Actual built Worker on local Miniflare/D1: 14 parent API requests passed with fictional accounts, linked children, teaching data and issued invoices. Totals, excluded cancelled/private records and per-child financial coverage matched the fixture.
- Browser: 7 check groups passed, including 320/390/1280-pixel layouts, the default homepage, all/individual child calendars, one month picker, status filters, correct lesson/financial targets, one-child and unlinked families, shared error popup plus retry, and an expired home target that prompts before safe reset.
- Original parent account/teaching projections: 131 checks; financial grants and ledger/document privacy: 126 checks; calendar: 133 checks; notifications: 148 checks. All passed alongside the new 163-check suite.
- The browser fixture does not request real push permission or send external notifications. No real business records were used for local tests.

Production availability, deployed version and preserved bindings/schema are confirmed separately in the release records.
