# Test-site parity: schema and backup release notes

Scope: `tuition.tickminder.com`, Worker `tuitionos-web-test`, existing test data. The production Worker, database and branch are not release targets. This note records local implementation and fictional validation; it is not a deployment receipt.

## Migration contract

- Restore the production `0062_quiz_resume_position.sql` unchanged. It adds nullable `quiz_practice_attempts.current_question_id`; existing attempts, answers, ordering and revisions remain intact.
- Keep the previously deployed `0063_notification_preferences.sql` and `0064_session_devices.sql` unchanged. A test database that has 0063/0064 may receive 0062 afterwards. Do not rerun either settings migration or rebuild the database.
- Before uploading new code, verify the test Worker still binds its existing test D1, check migration names and SHA256 against the local files, inspect `quiz_practice_attempts`, `notification_preferences`, `session_devices` and the `session_account_expiry_idx`, and check foreign keys. The new login implementation atomically inserts into `sessions` and `session_devices`; both tables must exist before deployment.
- Apply only the missing 0062 migration and record its filename/hash in the existing test migration ledger. If the column already exists but its ledger record is absent or mismatched, stop for reconciliation rather than retrying an `ALTER TABLE` or changing existing rows.
- The local fixture rehearses the exact existing-test order (0063/0064 followed by 0062) and compares every original table column and row. No application restore, account reset, course reset or business-data replacement is part of this upgrade.

## Snapshot compatibility

| Format | Exported schema | Verification / recovery |
| --- | --- | --- |
| v1–v37 | Historical schema; v37 ends at 0061 | Historical verification retains the matching schema. The Cloudflare recovery tool supports v7 onward and builds the current schema before replaying the historical columns. |
| v38 | Adds `current_question_id` via 0062 | Includes production resume-position validation; null remains a valid legacy value. |
| v39 | Adds the complete `notification_preferences` table | Requires all three enabled flags, all three re-enable cutoffs, account identity and update time. The secure restore migration map includes 0063 and 0064. |

The v39 validator rejects missing/extra columns, missing tables, unknown accounts, duplicate preference owners, invalid booleans and noncanonical timestamps. `courses_since`, `homework_since` and `fees_since` accept the empty legacy cutoff or a canonical ISO timestamp. Disabled choices and original cutoffs round-trip exactly, so reopening notifications does not cause older reminders to be delivered again.

`session_devices` is reconstructible display metadata and is deliberately excluded from snapshots. The current recovery schema creates its table/index, leaving metadata empty. The authenticated account-devices GET can recreate metadata only from surviving, unexpired `sessions` rows. It never creates a session, and revoked sessions absent from the snapshot cannot reappear from metadata. The existing snapshot policy for `sessions` is unchanged; this release does not perform recovery or replay old session snapshots.

Older backups cannot recover notification choices they never stored. Recovering a v37/v38 snapshot into an empty current schema leaves `notification_preferences` empty and uses the established enabled defaults; it does not fabricate historical choices or cutoff times. Current test data is upgraded in place, preserving existing preference rows.

`restore-cloudflare-backup.mjs` continues to require an independently supplied private expected target and an empty database/bucket. Its local dry run is the explicit historical-snapshot-to-current-schema upgrade path. Never point it at the populated test database for this release.

## Existing private release tooling

The local `work/ui-refresh-wave1/environment` directory has the established test release tools. Keep generated private files outside the source checkout.

1. Refresh `snapshot-worker.mjs` before packaging. `prepare-package.mjs` requires a test Worker inventory less than six hours old and copies the built server/client into a new release stage.
2. Preserve the current custom AI entry wrapper, `legacy-ai-worker.mjs`, all existing bindings and secret names, staging `AI_JOB_SERVICE`, and current cron schedules. `prepare-package.mjs` validates the fixed test Worker/D1 and rejects unknown binding types. Do not enable additional cron schedules implicitly.
3. `deploy-package.mjs` with no arguments performs a dry run. Its mutation mode requires the exact `--deploy --target tuitionos-web-test` arguments, the matching test D1, a successful migration receipt and unchanged live bindings. It uses `--keep-vars`, disallows routes, and preserves the existing no-R2/no-external-diagnostics test configuration.
4. After the authorized root-agent deployment, run `verify-active-release.mjs`, compare the active deployment version to the newly packaged version, verify all Worker module hashes (including the AI wrapper/module), compare current schedules, and check the changed client assets against the new stage.
5. Produce a new source/delivery receipt with the new commit, build, exact active version and this release's isolated QA. The old `settings-preferences-delivery-receipt.json` documents c3293ea and is only a prior baseline.

The new private `environment/parent-quiz-sync-migration.mjs` supplies the scoped 0062-only path: no arguments performs preflight; mutation mode requires exactly `--apply --target tuitionos-web-test`. Its read-only review confirmed fixed Worker/D1 guards, the exact additive SQL, settings ledger hashes, schema/ledger agreement, protected record counts, unchanged original column definitions and foreign-key checks. The release operator must also confirm the complete settings/device schema and required session index before code deployment.

The old `settings-migrations.mjs` permits only 0063/0064 additions to its saved ledger and will reject an unrecognized 0062 entry. Do not use it to apply this release. The broad `apply-migrations.mjs` is also not a substitute for a scoped 0062-only upgrade. `verify-preservation.mjs` depends on its saved rehearsal/plan; refresh or replace those inputs before interpreting it as verification of this change.

## Local validation completed

All data in the following checks is fictional; no customer export, remote migration or deployment ran as part of this backup subtask.

- `node tests/notification-preferences-backup.mjs`: 28 checks, including real backup-export route, v37/v38/v39 secure round-trips, exact out-of-order migration rehearsal, and actual Cloudflare recovery script local dry runs using encrypted fictional payloads and stubbed process/network boundaries.
- `node tests/google-drive-import-permissions.mjs`: 88 checks; its historical guard regression is intentionally pinned through 0061.
- `node tests/invoice-settings.mjs`: 71 checks, now including v39 export/restore.
- `node tests/prepayments-backup.mjs`: 31 checks, including current v39 and historical v27.
- `node tests/student-contact-backup.mjs`: 30 checks, including v35/v36 compatibility.
- `node tests/restore-target.mjs`: 25 checks for private-target validation and refusal before any cloud command.

The root release process supplies full type/build, application QA, remote schema verification and the final active deployment receipt.
