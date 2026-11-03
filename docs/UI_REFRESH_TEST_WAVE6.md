# UI refresh — wave 6 management and remaining surfaces

Scope: the sixth round of the R01–R15 test UI redesign, following wave 5 and the shared dark-tab/month-field fixes. Baseline: `695df5b8808c78e4d533cbb5a4cb271fcb31e8a3`. Release target: `https://tuition.tickminder.com`; source branch: `feat/ui-refresh-test-r1`.

## Boundaries retained

- This is a test-site UI change. Production `www.tickminder.com` remains unchanged.
- Keep existing test accounts, courses, teaching records, financial history and permissions. No backend changes, database migrations, business-data edits, financial recalculation or deletion are part of this round.
- Keep the UI portable to production for a later explicitly requested promotion.
- Keep classroom mobile navigation horizontal with left/right arrows, as requested by the user.
- File storage and Google/Drive configuration on the test site remain deferred.

## Changes

### Platform management

- Split the Owner console into Centres, Catalogues and System issues, with keyboard-operable tabs and browser/app history support.
- Mount catalogue and diagnostic content on first visit. Once visited, keep panels mounted while hidden so switching tabs preserves unsaved form input within the current page session. This does not save a draft across a full reload.
- Keep the primary centre-management action visible. Put invitation details, chief-admin controls and secondary operations into disclosures.
- Reflow centre counts, long names, form fields and actions for narrow screens and enlarged text. Preserve Owner-only controls and the existing non-Owner view.

### Activity history

- Collapse filters by default and show a compact summary of the applied criteria. Typing a new filter does not misrepresent it as already applied.
- Keep GMT+8 visible. Preserve the existing date range meaning, GET request parameters, snapshots, pagination, refresh and reset behavior.
- Give class-task creation, completion and archive events readable Chinese/English action names. Keep the original action code and target identifier in expanded details; unknown event codes remain visible as raw codes.
- Reflow the summary and detail rows, with readable dark-mode secondary text and touch-sized controls.

### Notifications

- Use compact notification rows and clearer primary actions for learning notifications and the parent inbox. Keep read state, categories and destination behavior intact.
- Separate notification loading, request failure, genuinely empty results and unavailable content. Device settings do not present unavailable data as a confirmed disabled state.
- Keep device settings in their own disclosure, and match empty states, buttons and secondary text to the active theme. The dark-mode empty-state background is included in the final targeted fix.

### People, parent permissions and account dialogs

- Apply consistent spacing, theme colors and responsive layouts to account forms, parent-child permission dialogs, administrator permissions and student offboarding previews.
- Wrap long names, permission labels and action rows so controls remain reachable on mobile and with enlarged text.
- Correct the student-course editor guidance to direct account creation through Personnel & accounts, matching the current workflow.
- Preserve the existing account, permission, parent finance-authorization and offboarding rules. Preview checks do not perform final offboarding or deletion.

### Sheet preview and system diagnostics

- Make Sheet preview tables readable in both themes, with a labelled, keyboard-focusable local scrolling region and column headers.
- Retain the visible `Lesson Records!B2` prerequisite and the distinction between preview and writing to the Sheet.
- Improve diagnostic report, scope, access-key and connection-information layouts without changing the API contract or key permissions. Long routes and instructions wrap within their panel.
- Ignore nested disclosure toggle events when handling the outer diagnostics panel. Opening a nested section no longer triggers outer-panel lifecycle handling.

## Verification

The component checks use the current source with fictional intercepted responses. They cover Chinese/English, light/dark and 320px, 390px and 1280px viewports, including long text, keyboard controls, state transitions and simulated enlarged text where applicable. Representative screenshots are also inspected visually.

The integration checks run the real built Worker and API against a copied fictional SQLite database with external services offline. They check role visibility, real read endpoints and preservation of protected data. They do not use live business records or make production writes.

Evidence is stored outside the source checkout under `work/ui-refresh-wave1/`:

| Area | Recorded result | Evidence |
| --- | --- | --- |
| Learning and parent notifications | 1,205 checks; 24 layouts, 8 state scenarios and 2 interaction flows | `notification-wave6-qa/results.json` |
| People, accounts, permissions and offboarding previews | 398 checks; 48 cases | `people-wave6-qa/results.json` |
| Activity filters, summaries, pagination and states | 171 checks; 12 layouts | `audit-wave6-qa/results.json` |
| Owner navigation, catalogue, diagnostics and Sheet preview | 397 checks; 36 cases | `management-wave6-qa/results.json` |
| Real Worker role and data-preservation integration | 141 checks; 24 layouts | `qa/wave6-integration/results.json` |
| Rebuilt Worker notification empty-state follow-up | 21 checks; 3 layouts | `qa/wave6-integration-empty/results.json` |

The final TypeScript/build result, affected-target rerun after the notification empty-state fix, source commit and deployed module/asset hashes are recorded by the release verification and external delivery receipt. A passing local result in this document does not by itself establish a deployed version.

## Verification limits

Mobile checks run in a desktop browser at mobile viewport widths. The 200% text checks simulate enlarged computed font sizes and line heights; they are not physical iOS/Android accessibility certification. Single-line native inputs/selects may scroll their contents, while tables intentionally scroll inside their labelled region.

Google consent, real uploads, push delivery on a physical device, live Sheets writes, live payments and real diagnostic-key creation are outside this UI-only verification. No production promotion is included.
