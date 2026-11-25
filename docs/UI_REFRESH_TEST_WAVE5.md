# UI refresh — wave 5 acceptance and fixes

Scope: the fifth wave of the R01–R15 test UI redesign. Baseline: `cce5d036dc44b8e478237d8341634dd41c97bf98`. Release target: `https://tuition.tickminder.com`; source branch: `feat/ui-refresh-test-r1`.

## User requirements retained

- Keep test accounts, courses, financial history and permissions. No production release, database migration, business-rule change, or financial recalculation.
- Keep the classroom mobile tabs visible horizontally with left/right arrows. This explicit user choice takes precedence over the reference dropdown.
- Retain all functions and existing branded assets; use the references for hierarchy and layout rather than their blurred mascot renderings.
- Preserve separate loading, unavailable, zero, unconfigured and permission-denied states. A compact screen must not imply that missing data is zero.
- Keep the UI changes portable to production for a later explicitly requested promotion.

## Fixes from acceptance checks

- The shared header can wrap when text is enlarged. Sidebar, backdrop and sticky page heading follow its measured height. Mobile navigation labels fit without overlapping, including English at 320px.
- Home tasks, account details and phone-number ownership controls reflow at large text sizes. Account loading failures show a persistent translated error and Retry; expired sign-in remains identified as expired sign-in.
- Quiz editor tabs, add-question controls and actions wrap. Long quiz titles and creator names remain readable. Cancelling a confirmation returns keyboard focus to its opener.
- Homework actions wrap, long feedback-dialog titles clear the close button, and closing the feedback dialog restores focus. The native recording editor also restores its opener on close.
- Schedule time fields stack when their text no longer fits the paired layout. Ordinary text keeps the paired fields.
- Teaching statistics filters, metrics and workload rows reflow while preserving time and financial meanings.
- Parent home cards and calendar controls reflow. Calendar dates stay intact; an enlarged month grid scrolls locally and keyboard-selected dates remain reachable. Failed parent requests retain an explanation next to Reload.
- Student statement controls, finance navigation, KPI actions and dialog footers accommodate enlarged text. Existing financial calculations, print documents, save rules and role restrictions remain unchanged.

## Verification

Browser checks cover 320px, 390px and 1280px; Chinese/English; light/dark; all four signed-in roles; keyboard controls; long names/titles; loading, empty, failed and permission-limited states. Not every combination applies to every component.

The component checks use current source and fictional intercepted responses. Worker checks run the real built application and API against copied fictional SQLite data, with outbound networking blocked. Protected financial and Quiz records are compared before and after; no live business records are used.

Evidence is stored outside the source checkout under `work/ui-refresh-wave1/`:

| Area | Evidence |
| --- | --- |
| Shared shell, role homes, menu focus, account navigation | `qa/wave5-navigation/results.json`, `qa/navigation-targeted-results.json` |
| Account layout, failed loading, expired session, failed password changes | `accounts-wave5-qa/results.json`, `accounts-wave5-qa/expired-results.json` |
| Courses, classroom tabs, files and recordings | `qa/course-wave5-results.json`, `qa/files-wave5-results.json`, `qa/recordings-wave5-results.json` |
| Homework and statistics | `homework-wave5-qa/results.json`, `homework-wave5-qa/targeted-results.json`, `statistics-wave5-qa/results.json` |
| Quiz editor, ZIP guidance, sharing, player and errors | `quiz-accessibility-wave5-qa/results.json`, `player-wave5-qa/results.json`, `player-errors-wave5-qa/results.json`, `qa/quiz-library-wave3-results.json` |
| Parent home/calendar and finance visibility | `parent-home-wave5-qa/results.json`, `parent-home-wave5-qa/focused-results.json`, `billing-parent-wave5-qa/results.json` |
| Finance accounts, operations and dialog actions | `finance-accounts-wave5-qa/results.json`, `finance-operations-wave5-qa/results.json`, `finance-operations-wave5-qa/edge-results.json` |
| Actual Worker finance routes and server permission denials | `qa/finance-wave4-results.json`, `qa/finance-wave5-final.log` |

TypeScript and the Worker production build are checked. Representative screenshots are visually inspected in addition to geometry and interaction assertions. Exact deployed module/asset hashes and source commit are recorded in the external wave-5 delivery receipt.

## Boundaries

200% text checks double rendered computed font sizes and line heights; this is a deterministic browser simulation, not native iOS/Android accessibility certification. Native single-line input/select contents may scroll or truncate while closed. Local calendar/tab scrolling is intentional.

The test site's file storage and Google/Drive configuration remain deferred as requested. External Google consent, real uploads, real payments, and physical-device keyboard behavior are not certified by this UI-only pass. Production remains unchanged.
