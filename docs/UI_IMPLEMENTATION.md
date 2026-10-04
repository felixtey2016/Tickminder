# Approved mobile UI and mascots — 2026-10-04

## Scope

Implements approved research schemes 01–07 using existing React, Lucide and Radix components. No new UI library, business feature, API permission rule or database migration.

- Menu groups and distinct icons; desktop opens by default and phone starts closed. Refresh, sign out and legal links retained.
- Compact home greeting, next lesson, existing summary counts and shortcuts.
- Calendar with labelled Add button, readable weekdays/adjacent dates, separate formal lesson/study styles and selected-day agenda. The existing student reschedule action is retained.
- Lesson cards keep attendance visible and move secondary actions into More. Existing actual times, fees, review and history remain unchanged.
- Classroom, subject and lesson filters collapse behind Filters. Manage terms stays beside the term field. Archived/cancelled/removed filters and Reset are inside Filters; bulk deletion stays above the results. Existing teacher groups remain.
- Homework/material forms have meaningful sections. Native date/time inputs are retained, with year-bearing date text. Existing recipients, optional scores, validation and reset semantics are unchanged.
- Original transparent mascots appear in whole-page empty/loading/error states, cleared attendance tasks, the home greeting and a confirmed homework submission. Never in menus, buttons, fields, rows or toast messages; no animation.
- New user-supplied logo used in topbar, authentication, account setup, legal pages, favicon and PWA icons.
- Existing class reminder push messages carry a presentation-only visual hint. Transparent reminder/start images and monochrome badge are used where the operating system supports them. Notification recipients and timing are unchanged; no new notification event types. System notifications can ignore images or render their own background.

## Verification

- 22 Chinese/English phone views at 390 × 844, actual React UI with isolated fictional API fixtures: no horizontal overflow or browser errors.
- Focused UI flows: grouped menu, Back/Forward, Back closes dialogs, secondary actions, terms/reset/archive/bulk controls; native dates/optional scores and reset after confirmed homework publishing; file selection alone does not submit, one upload followed by formal submission, transparent success illustration; permission error persists without false success; loading/error/retry; desktop menu defaults and calendar layout.
- Existing notification, student calendar, lesson rule, translation, Google Sheet exact-name import and account-management regression tests passed.
- TypeScript passed. Production build passed. Scoped lint comparison: seven existing errors remain (six in scheduler, one in classrooms); no additional errors introduced.
- Original five SVG mascot files and logo are byte-identical to the provided assets. Fixed dimensions prevent image layout shifts.
- Browser checks emulate phone dimensions; physical Android/iOS system push image rendering has not been verified.

## Recovery and publication

Stable production before this work: v43, source `326bd564ec6924413c3f0e251bd0eceb1ff6daea`; isolated staging before this work: v39, source `6ada514a59b3b821da01cf36eee7b7778fcb9be0`.

Fresh encrypted database and PDF backup was verified before release, outside Git: `backups/tickminder-before-approved-ui-2026-10-04`, 28 tables and 7 PDF files. No schema migrations are included in deployment archives. See RELEASES.md for final source/version mapping and live smoke results.

Research screenshots and third-party reference images remain review artifacts and are not part of the application deployment.

### Final live checks

Staging v40 and production v44 are published. Their application sources were compared and match, with each environment retaining its own project bindings. Real isolated staging teacher publishing with a valid PDF, student attachment download and PDF submission, teacher score saving, and bilingual calendar checks passed without browser errors. Only the newly created test homework and its two PDFs were deleted after verification.

Production read-only checks passed for the canonical homepage, updated metadata, nine byte-matched logo/mascot/notification assets, PWA icons, service worker mapping, anonymous API access denial, and Chinese/English phone login rendering with a visible new logo. The final production backup after v44 restored all 28 tables and seven PDFs (6,860,115 bytes); it is outside Git. No fresh cloud backup verification was performed as part of this UI release.

Source IDs and stable GitHub tag are recorded in RELEASES.md. The GitHub runtime commit is `013fde5fc754503e14858b322b01a4e03b30ccfc`.
