# Content tabs and complete month labels

Test UI follow-up to wave 5. Target: `https://tuition.tickminder.com`, branch `feat/ui-refresh-test-r1`. Production is outside this release.

## Changes

- Content tabs use transparent backgrounds, selected text and a 2px underline. Dark mode uses a softer accent for these tabs. Touch-retained hover no longer leaves a bright block behind; keyboard focus remains visible.
- This treatment covers Quiz, its editor, classrooms, teaching resources, course views, account/settings navigation, parent views, finance and the course/fee-settings dialog. Primary actions, badges, form choices, sidebar and bottom navigation retain their respective treatments.
- Visible month fields use a shared native month control with a wrapping localized month/year display, so a long month cannot hide the year. The native `YYYY-MM` value, events, field names, validation and limits remain in place. Browsers without a usable picker receive a visible native-input fallback.
- Cramped month filters reflow rather than squeezing two controls into narrow columns. The existing parent calendar month control is retained.

## Verification

Current source checks include controlled/uncontrolled month fields, labels and accessible names, focus/ref forwarding, keyboard editing, picker activation, required/min/max, disabled/read-only, form values and reset, and unavailable/throwing picker fallbacks. Layout checks cover long month names and years at 320/390/1280, Chinese/English, light/dark and simulated 200% text.

The final Worker checks use copied fictional data, real application/API routes and blocked external networking. They exercise touch-retained hover, desktop hover, active underlines, keyboard tabs, and finance pages. Financial records are compared before and after. No business calculations, backend APIs, database schema or live business data are changed.

Evidence outside the checkout: `work/ui-refresh-wave1/month-field-qa/`, `qa/surface-polish/`, `qa/finance-polish-results.json`, and `surface-polish-delivery-receipt.json`. Representative screenshots are visually inspected. Text enlargement and mobile input are browser simulations, not physical-device certification.
