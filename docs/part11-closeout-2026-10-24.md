# Part11 closeout — 2026-10-24

## Scope verified

The original Part-11.txt full scope was checked against the current implementation. Core lessons, sessions and participants use the requested GMT+8 overlap range, limited to 62 days. Calendar dates are separate from the reporting month. Long course lists, old pending attendance, pending reschedules, makeup originals and per-lesson history use their existing SQL pagination. Aggregates remain SQL queries and preserve distinct group teaching sessions. Financial calculations were not changed.

## Repairs in this closeout

- A partly reset class can retain shared taught/completed facts while one or more student lessons are unrecorded. The pending session query now finds a session by its overdue scheduled student lessons, independently of the selected month or the shared teaching status. It returns each session once, excludes cancelled sessions and retains the current actor/grant guards. This aligns the discoverable pending list with the pending task count.
- An inline schedule submission can remain in flight while the user changes the calendar month. Its original reload callback now reads the live reporting month and calendar range, so a completed save cannot replace the newer range with the range captured before submission. The existing request generation and permission refresh controls remain in place.

## Local verification

- `tests/course-ranges.mjs`: 170 checks, actual route/SQLite queries, including cross-month overlap, reporting/calendar independence, pagination/filter counts, old pending/reschedules, mixed class pending deduplication, cancelled classes, role restrictions and permission revocation after pending page selection.
- `tests/admin-permissions-state.mjs`: 14 sections passed, including ordinary/preparation and enforced administrator branches, minimal selectors, teacher/student scope and late grant revocation.
- `tests/course-completion.mjs`: 50 checks passed.
- `tests/student-calendar.mjs`: calendar date and lesson selection checks passed.
- TypeScript `--noEmit` passed.
- The shared isolated browser QA script includes a real inline create-form POST held while navigating to the next calendar month, followed by release and verification that the final core response and visible calendar use the new range. This subagent only syntax-checked the added case; the root release workflow runs the browser/server/build checks.

## Payload and query sample

The same fictional fixture includes 2,000 historical lessons. A local sample compared the old unrestricted lesson/session/participant source with the actual bounded core handler:

| Measurement | Unrestricted source | Bounded core |
| --- | ---: | ---: |
| JSON bytes | 3,512,479 | 61,461 |
| SQL statements | 3 source reads | 15 including permissions and summaries |
| Core HTTP requests | Not measured for the old source | 1 |
| Local elapsed milliseconds, latest sample | 16.13 | 26.06 |

The measured payload reduction is approximately 98.3%. The bounded handler performs additional security checks and aggregates; this sample does not demonstrate faster SQL execution, network latency or production performance. Existing range indexes were reused. No schema migration was added in this closeout.

No production, hosted-service or Git operations were performed by this subagent.
