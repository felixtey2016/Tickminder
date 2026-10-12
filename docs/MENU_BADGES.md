# Menu notification counts and filter controls

## Behaviour

- The top-right menu button shows the total of unread notifications and outstanding menu tasks. Zero hides the badge; more than 99 displays `99+` with the exact count in its accessible label.
- Notification Centre: unread 30/5/start reminders plus new lesson-time changes, accepted/declined reschedules and cancellations. Opening the menu or page does not mark messages as read; use the existing individual/all-read controls.
- Teacher **Courses & check-in**: scheduled lessons whose planned end has passed without attendance being recorded.
- Teacher/student **Reschedule requests**: pending requests from the other participant, attached to a still-scheduled lesson. Outgoing/closed requests are excluded.
- Administrator **Attendance to review**: the existing page's missed-lesson and unresolved-absence conditions, including makeup handling.
- Counts use existing authorized core data across months. Resolved tasks disappear on data refresh. Notification read state is stored on the server and remains independent between accounts/devices.

Notification refresh runs every 30 seconds while visible, on return to the page and after core data changes. Existing revision polling remains unchanged. This release adds site inbox messages; it does not add system-push action buttons or daily missed-attendance dispatch.

## Inbox data and permissions

Migration `0016_site_notifications.sql` adds one metadata table with account/event uniqueness and an account/date index. It contains no PDF bodies, login credentials or Google tokens.

Time edits, reschedule responses and cancellation actions commit their audit record and recipient inbox entries in one D1 batch. Only changes after deployment generate messages; historical audit records are not backfilled. The actor receives no duplicate message. Active assigned teacher/student accounts and other administrators can receive the event. Generation/read predicates share the existing participant access checks; disabled, pending and unrelated accounts are excluded. Only selected date fields from audit snapshots are returned, with no internal notes or raw audit JSON.

The minute reminder dispatcher keeps the original push recipients, timing and payload behaviour. It also prunes obsolete inbox metadata after the existing 90-day retention window. Account merge, deletion, pending cleanup and lesson deletion include inbox metadata. Backup export is v8 with the new table; v7 recovery remains supported.

## Filters and navigation

Shared filter controls have individual visible borders, labels above the control, 46–48px touch heights, focus outlines, two columns on desktop and one column on phone. Native select/date controls and checkbox styling are retained. No component library was added.

A fresh entry clears only the persisted menu-overlay flag while retaining the selected page. This prevents an old mobile menu history entry reopening the overlay after selecting the current page.

## Verification

- TypeScript, guarded recovery build and Git whitespace checks passed.
- Actual SQLite notification routes/SQL passed durable event generation, role/assignment/actor isolation, foreign read denial, single/all-read persistence, exact counts beyond the 100-item limit, date snapshots and task-resolution tests, plus existing encrypted push/security checks.
- Account management/merge/deletion, unified-login/guarded-cleanup, revision and startup-scope tests passed.
- Five built-Worker browser scenarios passed: real administrator time edits; teacher read controls and re-entry; actual attendance/reschedule actions; student English navigation; administrator badges and native bordered/resettable filters. Chinese/English phone 390×844 and desktop 1280×900 were checked, with no horizontal overflow or page JavaScript errors. Mobile checks are emulated Chromium, not physical-device push tests.
- Pre-release encrypted snapshot `tickminder-before-menu-badges-2026-10-12` verified 28 business tables and seven PDFs (9,308,490 bytes), including recovery dry-run against the current schema. Migration was applied once to the owner-controlled recovery D1, creating table 29 without altering existing business rows.

Deployment and post-release backup evidence are recorded after publication.
