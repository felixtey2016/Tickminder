# Test-site parent roster and Quiz synchronization

Target: `tuition.tickminder.com` / Worker `tuitionos-web-test`. Functionality reference: production source `f4a9ee3`. The production site, Worker and database are not release targets.

| Release item | Status |
| --- | --- |
| Active test deployment version | `cdceb8da-f966-4bee-a709-e874ea17519a`, 100% active on 2026-11-03 |
| Remote 0062 migration and data-preservation receipt | Applied to the existing test D1; protected record counts unchanged, original columns preserved, zero foreign-key violations |
| Published homepage assets and active Worker verification | Both test hostnames verified; all 334 packaged Worker modules match; existing bindings and cron schedules preserved |

## Changes and UI boundary

- **Manage → People & accounts → Parent roster** is now alongside the student and teacher rosters. It opens the existing account directory filtered to parents, with the parent group expanded, separate search/status preferences and parent creation selected by default. The all-account directory remains available.
- The parent entry requires `accounts.view`. Linked child names, child-name searches and the existing child-management dialog require `parents.view`; mutations retain `parents.manage` and their existing account/action permissions. Existing child links and financial authorizations are reused; no parallel parent model is introduced.
- Quiz behavior is synchronized from `f4a9ee3`: assignment-specific links and copy actions, strict assignment-link validation, continuing the existing attempt, saving/restoring the current question, preserving drafts across failed saves, retrying the same operation and confirming revision conflicts. The home page shows up to three pending Quiz items plus history; staff history separates all, assigned and self-practice records.
- The test site's current four-entry navigation, responsive layouts, horizontal menus, themes, teacher Assign action, permissions and display preferences remain in place. Production functionality is integrated into this UI. Existing classroom task inbox/review behavior and account settings are retained.
- Mobile Quiz completion hints now sit above the submit button, preventing full-width buttons from squeezing the hint into a vertical column.

## Data, migration and backup

The release must retain the test site's own accounts, credentials, courses, child links and financial records. It neither copies production users nor restores production data into the test database. Only the existing test environment is upgraded; its current bindings, schedules and private integration wrapper are retained.

Migration `0062_quiz_resume_position.sql` adds the nullable `quiz_practice_attempts.current_question_id` column. Existing attempts, answers, ordering and revisions remain intact. Apply only the missing 0062 migration, including when the test database already has 0063/0064; do not rerun those settings migrations or rebuild the database. The local migration rehearsal preserved all original columns and rows.

Backup format v39 includes notification choices and all three re-enable cutoffs. Current recovery creates the session-device table/index but does not export device metadata. v37/v38 snapshots retain their historical validation; recovery into an empty current schema leaves absent notification preferences at the established defaults. This release does not perform a database restore. See [schema and backup release notes](TEST_PARITY_BACKUP_RELEASE.md).

## Verified locally

All browser/Worker checks below use isolated fictional data. Publication and remote migration were verified separately as recorded above.

| Area | Completed verification | Evidence |
| --- | --- | --- |
| Parent roster | 308 real built-Worker checks; 52 screenshots at 320/390/1280 px, Chinese/English and light/dark themes; permission, search, status, creation-default and account-return checks | `work/ui-refresh-wave1/parent-sync-qa/results.json` |
| Existing account settings | 64 real built-Worker checks for notification preferences, devices and display settings | `work/ui-refresh-wave1/parent-quiz-sync-settings-qa/results.json` |
| Backup/migration compatibility | 273 checks across notification backup (28), Drive permissions (88), invoice settings (71), prepayments backup (31), student contact backup (30) and restore-target guards (25) | [Detailed test list](TEST_PARITY_BACKUP_RELEASE.md#local-validation-completed) |
| Quiz player | 24 component-browser checks for resume, failed-save retry, conflicts and in-flight state | `work/ui-refresh-wave1/quiz-parity-qa/quiz-resume-browser-results.json` |
| Quiz links/home/history | 58 component-browser checks across 22 cases | `work/ui-refresh-wave1/quiz-parity-qa/quiz-workflow-ui-results.json` |
| Classroom tasks | 306 UI checks and 21 screenshots; 218 server checks | `work/ui-refresh-wave1/quiz-parity-qa/classroom-tasks-ui.log` |
| Quiz/Task real built-Worker workflow | 42 checks and 16 screenshots: actual password login preserves assignment intent, same-attempt question/answer resume, home Continue, and Task submit/return/resubmit/approve history | `work/ui-refresh-wave1/quiz-parity-qa/task-ui-7ff6bd01/results.json` |
| Final Quiz mobile layout | 12 checks and 4 screenshots with fresh 320/390 px Chinese/English browser contexts; no CSS injection or endpoint mocks | `work/ui-refresh-wave1/quiz-parity-qa/task-ui-7ff6bd01/quiz-footer-final-results.json` |

TypeScript and the unified build passed. Additional parent regression coverage passed: UI rendering 26, permission client 66, parent account lifecycle 103, financial access 133 and account-state privacy 22 checks, plus navigation tests. The parent browser run made no business writes or external requests, produced no browser errors, and preserved every application table except session tracking; Cloudflare's internal transaction counter was excluded from comparison.

The account-state test was updated to the existing sanitized audit-summary contract and current SQL read hook. Its original failure was reproduced against baseline `c3293ea`; the corrected 22 checks pass against both baseline and current source. No audit business implementation was changed.

## Existing limits and release closeout

Test-site Google/Drive configuration and R2 file storage remain unconfigured/deferred and are outside this release. Local browser checks do not certify real Google consent, real file uploads, live Sheets writes or physical-device push delivery.

Private release evidence is recorded in `work/ui-refresh-wave1/environment/parent-quiz-sync-release-verified.private.json` and `parent-quiz-sync-migration-applied.private.json`; the source/build/client-asset delivery receipt is `work/ui-refresh-wave1/parent-quiz-sync-delivery-receipt.json`. Wrangler completed the upload but its subsequent account-subdomain lookup lacked permission; independent live version, deployment and byte-for-byte module checks confirmed the actual release before reconciling the CLI receipt. No additional Cloudflare privileges were introduced. Keep private fixtures, encrypted snapshots and credentials outside Git.
