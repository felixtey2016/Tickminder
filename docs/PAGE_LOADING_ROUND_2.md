# Page loading, round 2

The workspace opens each page with its own data and code. Opening finance, statistics, paginated course lists, recordings, or the resource catalogue no longer waits for the general course/roster bootstrap. The existing UI, page URLs, role navigation, and write APIs remain in place.

## Page data

`GET /api/workspace-data?view=...` is an additive, authenticated read interface. It returns `{view, account, revision, data}`. The view is an allow-list, not a permission. The server applies the current account, selected group, session, role binding, and action grants, including guards around database reads.

- `calendar` reads the requested calendar range and its required course relations.
- `schedule`, `teacher-plans`, and `course-options` provide only the selectors/plans required by their consuming pages.
- `students`, `teachers`, `subjects`, `account-options`, `classroom-options`, and `terms` keep complete management records distinct from limited selector projections.
- `materials` and `homework` are separate learning projections. A partial projection is never marked as the complete legacy learning state.
- `study` is a student calendar range projection, loaded independently of the course range.

Existing independently paginated APIs continue to serve course lists, attendance, reschedules, finance, and statistics. The legacy `/api/state` interface remains available for older clients and explicit Hermes/WebMCP calls; it is not a prerequisite for every workspace page.

The tuition tab obtains its student filter from `GET /api/billing?view=students`. This is a read-only, `fees.view`-authorized projection of operational roster names, including inactive students and excluding cleaned operational profiles. It does not initialize billing identities, read invoice history, calculate fees, or load courses. Other finance tabs do not request this selector. Fee calculations and financial write rules are unchanged.

## Client boundaries

The shell retains authentication, permission changes, navigation/draft protection, and identity invalidation. Extracted course, roster, and teacher/student page modules load on demand. Each required projection has its own loading/error state and rejects stale responses after its identity or request changes. Group and account changes must not reuse another identity's records.

Read responses remain private and `no-store`. Cross-page reusable caching belongs to round 3. Mutations retain their existing authorization, revision/conflict guards and user-visible success/failure handling; their affected reads refresh after completion.

## Verification and release

Use the fixed picker release as the baseline and compare the final production build against it with the same local fictional database and browser conditions. Keep functional interception separate from HTTP-cache performance measurement. Record request/asset counts and distinguish local timings from real-user production latency.

Relevant checks cover permission-equivalent projections, same-name identities in different groups, revocation during reads, session invalidation, range boundaries, route/history behavior, post-mutation refresh, and Hermes/WebMCP demand loading. The billing selector has a dedicated real-route/SQLite suite: `node tests/billing-selector.mjs`.

This change requires no database migration. Production publication preserves runtime variables/secrets, D1/R2 bindings, and scheduled reminders. The UI test environment is not updated. Release receipts and measurements are kept outside the public repository.
