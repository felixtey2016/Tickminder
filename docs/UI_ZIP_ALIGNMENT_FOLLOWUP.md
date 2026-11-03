# UI reference-package follow-up

Target: `tuition.tickminder.com`, branch `feat/ui-refresh-test-r1`.
Baseline: `e8002093563b2d433d9299d8cc6b1452bd63e619`.

This change closes the concrete presentation gaps found in the R01–R15 package review. The later user choices for horizontal mobile classroom tabs, restrained brand colors and locally served service logos take precedence over older mockups.

## Changes

- Quiz authoring uses the available desktop width for prompt/preview and answer-option columns. Mobile question controls remain compact, with readable labels and touch targets. Only the selected correct option shows a check and “Correct answer”; other options say “Set as correct answer”. Existing bilingual fields, answer values, locking, saved-version preview and sharing behavior remain intact.
- About, privacy and terms pages use the shared appearance tokens and saved theme. About features become short grouped rows, and optional Drive information is expandable. Mobile policy contents collapse; desktop contents remain visible. Policy text and language routes are unchanged.
- Teacher student/subject links use separated rows, with desktop inputs beside their per-row save buttons. Student course settings have one visible page title and retain their named section and actions.
- Parent learning totals, results, feedback, single-child filters and material disclosure states follow the shared theme. Parent home places the child shortcut before today's lessons and avoids splitting English summary labels inside words on narrow screens.
- Activity rows show a readable fallback when a target name is unavailable. Original identifiers remain available in expanded details.

## Verification and boundaries

Type checking, the production build, focused browser component checks and built-Worker checks use local fictional data. They cover Chinese/English, light/dark, narrow mobile/desktop layouts, enlarged text, keyboard interaction and retained action payloads. Evidence is under `work/ui-refresh-wave1/`, including `academic-parent-zip-qa`, `quiz-editor-reaudit-qa`, `parent-home-zip-followup-qa`, `audit-zip-followup-qa` and `qa/zip-followup-integration`.

Release verification checks the test Worker's active code and public assets. The existing test database, accounts, courses, bindings, scheduled jobs and custom AI wrapper are preserved. No database migration, financial transaction or production deployment is included. Deferred test-site Google/Drive and file-storage setup is not enabled by these UI changes. Browser simulations do not replace physical-device testing.
