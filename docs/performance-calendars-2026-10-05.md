# Startup, push delivery and role calendars — 2026-10-05

## Changes

- Session, account, Google identity and initial-password/setup flags share one database join. Session expiry, disabled accounts and setup restrictions remain enforced on every authenticated request.
- Password and Google sign-in return the public account payload after successful verification and session creation. The client skips the redundant authenticated GET; older compatible responses still fall back to GET. Password hashing strength is unchanged. Google signing keys respect the advertised cache lifetime (at most one hour), with refresh for an unknown key ID; signatures are always verified.
- `/api/state?scope=core` provides course/roster/monthly data. Learning, classrooms/terms, account directory and activity are loaded separately when needed. The original full endpoint remains compatible. Independent queries run concurrently; teacher/student SQL reads only their courses and relevant plans, with existing active-plan checks. Administrator scopes reject other roles. No schema or charging/attendance changes.
- Core data appears before optional home homework counts. Counts show loading or a mapped error until confirmed, rather than a false zero. Requests coalesce, reject stale account/request generations, and preserve explicit retry states. Mutations still wait for server confirmation and refresh confirmed data; requests are guarded against repeat clicks.
- Reused Malaysia date/time formatters avoid creating an Intl formatter per row. IANA time-zone semantics are retained. Revision-based polling remains every ten seconds while visible; background pages do not poll.
- Service worker caches only allowlisted public JS/CSS/fonts and branding assets, capped at 100 entries. It never caches navigations, account/course APIs or PDFs. Reload and no-store are respected. This reduces repeat asset loading; it cannot prevent Android from unloading a closed browser process.
- Web Push uses high urgency and bounded provider retention: 25 minutes for the 30-minute reminder, 5 minutes for the 5-minute reminder and 10 minutes at lesson start. The existing minute cloud clock, two-minute dispatch/retry window, ownership, logout privacy and notification centre remain intact. Provider acceptance is not proof of phone display. Android lock-screen receipt still requires physical-device testing; OS/battery restrictions remain possible.
- Teachers receive the shared month/day calendar, current course time, year, Meet link, history and existing attendance/reschedule dialogs. Administrators use the same month/day agenda, retaining teacher filters, day/week views and their existing edit dialog. Personal study actions remain student-only. Students retain their existing study and mutual-reschedule flows.

## Evaluation of the supplied Sonnet review

| Suggestion | Assessment / action |
| --- | --- |
| Serial database and reload requests contribute to delays | Correct direction; the quoted query counts were estimates of an older source. Joins, concurrent reads and scoped refresh reduce work. |
| Stop awaiting reload or optimistically patch a lesson | Feasible with careful stale/error/duplicate handling; not applied blindly. Confirmed refresh and submission guards are retained. |
| Filter everything to selected month | Insufficient for current history, future courses, pending attendance and reschedules. Role filtering and page scopes implemented; arbitrary history truncation deferred. |
| Compare revision rather than JSON-stringifying full state | Already present for change polling. New core merges avoid full-state string comparison. |
| Extend polling to 20–30 seconds | Possible tradeoff, but not required to reduce initial load and would slow cross-device updates. Existing cadence retained. |
| Reduce the 324 KB PNG logo | Outdated: the approved logo is already SVG; old unused assets are not the displayed logo. |
| Remove post-login GET and cache Google public keys | Implemented with real identity/password/signature regression tests. |
| Reuse date/time formatters | Implemented, preserving the current Malaysia time zone instead of changing date semantics. |
| Move D1 nearer users | Location cannot be inferred from source. No database migration or region change was attempted. |

## Evidence and limits

- Same private staging origin and demo teacher, desktop Edge HTTP requests from the development machine. Before v40 full state: 6601 / 6161 / 6233 ms, 7177 bytes. After v41 core state: 3681 / 3177 / 2991 ms, 2738 bytes (additional core check 3418 ms). Median of the first three: 6233 → 3177 ms, about 49% less. These are end-to-end samples, not a controlled load benchmark or a guaranteed mobile latency. The reduced payload is intentionally core data; learning is fetched separately.
- Password POST was 4310 ms before and 4344 ms after; improvement is eliminating the subsequent GET (4122 ms before, 3615 ms after in diagnostic sampling), not weakening PBKDF2.
- TypeScript; real-route SQLite/WebCrypto unified login and signing-key cache; one-query identity/expiry/setup/role/lazy-state tests; notification authorization, encryption, TTL/urgency and reminder bounds; public-cache privacy/background push simulation; Malaysia calendar/attendance rules; translations; Google Sheet exact-name import tests passed.
- Actual React at 390×844 and 1440×1000: teacher/admin agenda, Meet, existing dialogs, Back, month/Today, teacher filter, day/week/month, bilingual labels, no overflow, student-only study, coalesced requests and explicit lazy-load failure passed. These emulate mobile browsers and do not establish physical Android receipt.
- Private staging live: teacher/student login and restricted state; teacher PDF upload/publish, student PDF access/upload/formal submission, teacher score save, bilingual calendar and cleanup of only the newly created test homework/PDFs passed. No production account/course/push data was used for staging tests.
- Pre-release encrypted portable snapshot `tickminder-before-startup-calendars-live-2026-10-05`: 28 tables, 5 PDFs, 6812612 bytes; independent recovery-key verification returned memory-and-files-ok. Backup files and credentials remain outside Git. No cloud-copy verification is claimed for this snapshot.

See RELEASES.md for the exact production/staging source commits and deployment versions.
