# Four-entry navigation — test UI

The test UI uses full-page feature groups instead of a sidebar or a More drawer. Existing feature pages, access checks, URLs, browser history, forms and data scopes remain in place.

| Role | Primary entries |
| --- | --- |
| Administrator | Home, Teaching, Finance, Manage |
| Teacher | Home, Courses, Teaching, My account |
| Student | Home, Courses, Learning, My account |
| Parent | Home, Learning, Fees, My account |

The primary bar appears at the bottom on mobile and desktop. It temporarily yields to dialogs, focused text fields and active editing surfaces. Course and classroom tabs remain inside their existing pages. Browser Back returns through the same leaf and hub history, and the primary entry stays selected for its descendants.

Teaching groups lessons, classes, homework/tasks, Quiz and materials. Admin Manage groups directories, accounts, group settings, logs and personal settings; the platform console is visible only to its owner. Parent learning pages continue to use existing child selection and access rules. Finance permissions are unchanged: administrators without access see a short unavailable state rather than financial data.

This change is on `feat/ui-refresh-test-r1` for `https://tuition.tickminder.com` only. It does not migrate databases, copy accounts/courses, modify business records, or publish production. Future promotion should merge the reviewed UI code with current production code; never copy test database contents or test Worker configuration.

Implementation: shared `MobileBottomNavigation` in primary mode, `NavigationHub`, role mapping in `lib/four-entry-navigation.ts`, parent mapping in `lib/parent-shell-navigation.ts`, and the existing scheduler/parent shells. No sample preview data is included.

## Teaching information hierarchy follow-up

The Homework & tasks entry now has two in-page tabs. Homework visibility still requires `homework.view`; Task visibility requires `tasks.view`, with review actions separately guarded by `tasks.review`. Task-only administrators do not load or render homework data. Switching tabs retains mounted homework drafts; filtering the list no longer removes the currently open submission receipt.

Teachers can browse homework across their classes before choosing a class to create new work. Students start with To do, with resubmission-allowed and overdue work first, and can open Submitted or All. An active resubmission grant is labelled as permission to resubmit, not assumed to mean a failed assignment.

The existing production Task confirmation workflow is selectively reused: student request, teacher approval or return with a reason, immutable history, request idempotency and optimistic concurrency. Earlier self-completions retain their distinct legacy status. The bounded cross-class inbox loads only when its tab is opened; review links open the exact class and Task. No database migration or business-data copy is needed. This does not import the separate production Quiz question-position migration.

Quiz starts with assigned work for staff who can view assignments, prioritizes assigning and viewing completion, and retains the existing attempt IDs for resume actions. Students see resumable work first. Class directories show search and term first, with advanced filters collapsed and a visible first teacher group. Existing classroom arrows and permission checks remain.

Deploy this follow-up only to the test Worker and the independent UI branch. Production stays unchanged; merge reviewed source with the then-current production branch before any future promotion.
