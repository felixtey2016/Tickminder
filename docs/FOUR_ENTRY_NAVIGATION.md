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
