# Tuition group isolation

## Product scope

Each ordinary administrator, teacher, student and pending account has exactly one fixed tuition group. The verified platform owner's Google identity is the only global administrator. The owner enters a group context to use that group's existing management tools; the platform console lists all groups and can create, rename, disable, enable and enter them. Disabling a group preserves its records and denies business access to its ordinary accounts. The owner can inspect and enable a disabled group.

Existing records migrate to **Next Genn Edu**. Account IDs, names, credential hashes, Google subjects, sessions, business IDs, course times, scores, PDF bodies and object keys remain unchanged. The platform owner has a NULL stored group; authenticated business requests resolve an explicit selected group. No additional live test group or test administrator is required for release.

The current group is visible in the desktop header and the mobile workspace. `中文 | EN`, refresh and logout remain available. Ordinary administrators see Group information and their invitation link; only the owner sees Platform console and group management controls.

New groups start with empty rosters, accounts, classes, lessons and learning content. The owner can enter a new group and create its first ordinary administrator through the existing Account management form. Password usernames and verified Google identities remain globally unique. New Google users opening `/?group=<join-code>` enter that group as pending users; existing Google identities always retain their original group. An invitation grants registration access only, not an administrator role or course access. Default registration without an invitation retains Next Genn Edu for compatibility.

This version has no branches, multi-group memberships, account transfers between groups, group deletion, billing or custom group domains. The existing Google Sheet connection is restricted to Next Genn Edu. Other groups receive an unconfigured response and cannot write to the existing operational spreadsheet; separate per-group connector configuration is a subsequent feature.

## Backend boundaries

- Migration `0017_tuition_groups.sql` adds `tuition_groups` and indexed `group_id` ownership to business tables. Teacher/student names, student name keys, plan keys and term names are unique within a group. Existing name-based relationships are retained as composite group/name references; this does not add renaming or global person IDs.
- `currentBusinessAccount` validates the account and group on every request. Ordinary accounts cannot override their group using cookies, request bodies or `X-Tickminder-Group`. The owner may select a valid group using that header; this isolates concurrent owner tabs even when their selection cookie changes.
- Drizzle business queries use `groupWhere`. Raw business statements use `groupReader`/`groupStatement` to provide statement-local SQLite common table expressions for each referenced business table. Nested joins/subqueries see the same group. The helper accepts trusted server SQL only, rejects explicit `main.`/schema reads and does not store connection-wide group state. Mutations explicitly bind `group_id` on insertion and in target predicates; statement views alone do not constrain a mutation's target. New handlers must follow both rules.
- Database triggers prevent group transfers, unknown group insertions and cross-group UUID parent references. Missing historical parent rows are tolerated for backup compatibility; current write handlers require authorized existing parents.
- Account management, permanent deletion previews/commits, conflict checks, lesson history, revision polling, classrooms/terms/announcements, homework/submissions/scores, student study blocks and PDF access all use the selected group. Foreign IDs are refused and foreign names cannot widen a query.
- PDF objects remain in the same private R2 bucket. The authenticated metadata check happens before reading the object. Group storage counters have a composite `(group_id,id)` key; cleanup deducts bytes only from the file's group.
- User notifications and read state are group-scoped. Background dispatch is intentionally global and joins account, lesson, plan, teacher, student and active group ownership. It does not confuse same-name people in different groups. The owner may receive administrative change messages in each group and reads only the current group's inbox. Push endpoints and the runtime dispatch health row stay global; 30-minute, 5-minute and start reminders retain their existing behavior.
- Pending cleanup remains safe for fixed, globally unique account identities. Account merging refuses identities from different groups. A future multi-group membership feature must change deletion eligibility before reusing these cleanup rules.
- Frontend API calls attach their current group. Group switches perform a full navigation; workspace, notification state, dialog payloads and group-specific filter preferences are isolated. Protected API data is not placed in persistent browser storage.

## Verification

- `tests/tuition-groups.mjs` executes real SQL and route handlers with isolated SQLite/R2 bindings. It creates two groups with identical teacher/student names and verifies owner control, empty new groups, ordinary header spoof rejection, account mutations, file/history access, classrooms/terms, homework publication/submission/scoring, submission idempotence, group-specific reminders, same-name deletion, paused groups, invitation routing and merge refusal. Only the Google provider is substituted in this test.
- Existing `tests/unified-login.mjs` independently verifies actual Google signatures, key caching, password login/setup, pending expiry and guarded cleanup. Notification encryption/provider restrictions, account management, startup scopes and revision regression checks remain in their existing tests with fixed-group fixtures.
- Built Worker QA uses local synthetic D1/R2, Chromium at 390 × 844 and 1280 × 900, and the installed Workerd's local compatibility date. Production compatibility/configuration is unchanged. It exercises actual mobile console creation/switching, ordinary menus, PDF/submission paths and English/invitation layouts. Any narrowly retried development-proxy restart is recorded; accepted writes and application errors are not automatically retried.
- Before release, an encrypted production snapshot is restored in memory and migration output is compared using each original table's columns and sorted row hashes. Private content is not written to source or reports. Schema v9 adds the groups table to encrypted exports and preserves v1–v8 backup-reader compatibility. Older recovery snapshots restore the platform owner's unassigned group correctly.

## Release procedure

Complete local gates, coordinate a short pause in business writes, take a fresh encrypted D1/R2 snapshot, apply only migration 0017 to the owner D1 database, deploy the tested recovery Worker with retained runtime secrets, verify canonical endpoints/assets and ownership counts, and take/verify a v9 snapshot. Compare original business columns against the pre-migration snapshot; background notification timestamps, sessions and unread-state changes may legitimately advance. Resume use after the verified release. Keep all private snapshots and QA fixtures outside Git. Do not apply a restore to the live database as a test.

Production publication is pending until the release procedure completes.
