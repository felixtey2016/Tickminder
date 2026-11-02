# Test UI theme and external-service marks

Baseline: `e4880ebb80edffe99f03425664b5af2668435f3d`. Target: `tuition.tickminder.com`, branch `feat/ui-refresh-test-r1`. Production is not part of this release.

## Appearance

- Light mode separates a grey-lavender canvas, pale navigation/header surfaces and white reading cards. The existing purple remains the primary action color.
- The wordmark and today's agenda receive restrained brand accents. Success, warning and error colors keep their existing meaning; financial amounts are not assigned decorative colors.
- Dark-mode navigation, content colors and quiet underline tabs retain their established appearance. Printing keeps neutral surfaces.

## Startup and errors

- The normal root already uses the synchronous `next-themes` initialization script. No competing theme initializer is added.
- The workspace startup and retry states now use theme tokens instead of fixed light colors.
- The root error boundary replaces the normal layout, so it includes its own fallback styles and the same appearance provider, including operation without the layout stylesheet.

## External-service marks

- Google Drive import actions and panel heading, WhatsApp menu/connection actions and standalone heading, and the Google Sheets sync heading use recognizable official marks.
- Assets are served locally, without adding third-party image requests. Source attribution is in `public/brands/README.md`.
- Logos retain original colors and proportions; adjacent action labels remain accessible. The existing Google-rendered sign-in/link buttons already supply Google's identity and are unchanged.
- Uploads, account linking, WhatsApp verification, Sheet writing and role permissions are unchanged. A logo does not enable an unconfigured integration on the test site.

## Verification

Verification artifacts are kept outside the source checkout under `work/ui-refresh-wave1/`: `service-brand-qa`, `theme-startup-qa`, `qa/theme-startup-worker` and `qa/theme-brand-integration`.

The checks cover Chinese/English, both themes, mobile/desktop widths, enlarged text, navigation, delayed startup/auth loading, theme persistence, error fallback and brand-image loading. The actual built Worker runs against copied fictional data with external services blocked. Final counts, source tree and live module/asset hashes are recorded in `theme-brand-delivery-receipt.json`.

Browser viewport and font-size simulations do not replace physical iOS/Android testing. Live OAuth, file import, WhatsApp sending and Sheet writes are outside this presentation-only change. No database migration or business-data change is included.
