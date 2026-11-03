# Page loading, round 1

This change separates navigation intent from data loading while keeping the existing four-entry UI and business rules. It targets the production branch `feat/tuition-groups`; it does not require a database migration or copy test-site data.

## Page addresses

`lib/workspace-route.ts` is the shared allow-list. The page path survives login, reload and browser history. Unknown paths return 404. Paths never grant permission: the current account, organisation and server-side action permissions still apply.

| Destination | Path |
| --- | --- |
| Home | `/` |
| Personal settings | `/settings` |
| Account hub | `/account` |
| Teaching / learning hubs | `/teaching`, `/learning` |
| Course calendar / list | `/courses/calendar`, `/courses/list` |
| Teacher lessons / attendance | `/courses/lessons`, `/courses/attendance` |
| Classrooms / homework / materials | `/classrooms`, `/homework`, `/materials` |
| Quiz library | `/quizzes` |
| Finance | `/finance` |
| Management hub | `/manage` |
| People and accounts | `/manage/students`, `/manage/teachers`, `/manage/parents`, `/manage/accounts` |
| Group settings | `/manage/group` |
| Notifications | `/notifications` |

Personal settings and group settings are distinct destinations. Existing `/quiz/<id>?assignment=<id>` links and old `?view=notifications`, `?view=quizzes` and `?view=quizBank` entries remain supported. Invalid or duplicate assignment parameters remain invalid; they must not silently become self-practice.

## Loading boundaries

- `SchedulerEntry` reads authentication before importing the authenticated management workspace. Anonymous visitors use the extracted existing login/recovery UI.
- Homepage cards use `GET /api/home-summary` rather than loading the full core state, rosters, month statistics or complete learning arrays. The day contains up to three authorised, deduplicated lesson previews and a correct total; the next lesson appears when today is empty.
- Personal settings load their own account endpoints. Shared navigation badges may read a count-only summary. This is separate from loading course lists or learning content.
- Heavy pages continue to request their required core/scopes when opened. Splitting all remaining pages, broader cache reuse and final performance acceptance belong to later rounds.
- Identity/group/permission changes invalidate old state. The new summaries are private and not cached between requests. Backend authorization is rechecked before returning data.
- Password recovery keeps its three-step flow and per-tab expiry. Canonical same-origin workspace return paths now survive recovery as well as Quiz paths; passwords and codes are not persisted.
- Hermes browser automation can use the new page URLs, then wait for the actual page content. Existing business APIs retain their authorization and parameters. A navigation change alone does not prove a write succeeded.

## Release constraints

Preserve production runtime secrets, D1/R2 bindings, scheduled tasks, existing sessions and business records. Deploy the exact reviewed package with `--keep-vars`. Do not deploy the UI test environment or run database migrations for this round.

Validation evidence and measured before/after results are stored outside the public repository under the release workspace. They must be based on the final built bundle and must distinguish isolated fixtures from production read-only checks.
