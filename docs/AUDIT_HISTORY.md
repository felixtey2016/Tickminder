# Activity history and retention

Activity history uses `GET /api/audit-history` independently of the main state payload. `from` and `to` are inclusive GMT+8 calendar dates; `operatorId` and `action` are exact filters. Filtering and live access checks precede counts and pagination. The response includes `entries`, `total`, `page`, `pages`, `pageSize`, `snapshot`, and visible operator/action options. The default page size is 30, with a maximum of 100.

The first request captures a group-scoped audit row watermark. Later pages use that watermark and `at DESC, id DESC`, including when timestamps repeat or newer/backdated records arrive. The snapshot is bound to the account, group, filters, page size and current permission state. Refreshing or changing filters starts a new snapshot. Invalid or stale snapshots receive 409; a lost identity, session or viewing permission receives 403. This GET does not write data.

All rows, counts and filter options use the same administrator/group/permission predicates. Billing configuration events remain Owner-only. Invoice history, payments and financial attendance corrections, payroll, expenses, prepayments, parent changes and administrator-permission history retain their existing separate access restrictions. Financial restrictions remain explicit in preparation/recovery mode. Permissions and the original authenticated session are checked again before sending the response.

The API returns field summaries, never raw before/after JSON. Known action families have bounded field allowlists; unknown or malformed historical payloads have no displayable summary. Passwords, credentials, authentication tokens, cookies, login sessions, private keys and private file/meeting URLs are removed from new shared-helper snapshots and excluded from the history response. Detail also follows the existing module and attendance permissions. Historical source JSON is not rewritten. A free-form business reason remains business content, so the interface continues to ask users not to place credentials or identity documents in notes.

`appendAudit(db,event)` builds a prepared statement for the caller's existing transaction and optional authority claim. It does not execute or commit independently. `auditJson(value,metadata)` supports existing bulk inserts. Trusted server-side account and object names are stored in `_audit` metadata. The learning log wrapper, account lifecycle and permission changes, individual scheduling changes, class-session operations, and invoice/payment/receipt events use the shared statement or snapshot contract. Existing business transactions and guards remain the authority source; bulk SQL can retain its shape while using the same sanitization and metadata. Other existing business writers remain readable without a bulk rewrite.

Readable identities resolve from current accounts, trusted audit name snapshots, known account lifecycle records and historical merge events, all within the current group. New suspension, restore and permanent-deletion events preserve the affected account's name. Some old deleted identities have no surviving name evidence; these are shown explicitly as a deleted account with an ID suffix rather than receiving an invented name.

## Critical writer snapshots

Account creation, activation, role assignment, password resets and administrator-permission draft/apply/discard events preserve the trusted acting account and affected account names. Password values and hashes are never included. Activation records a safe active-state transition. Permission changes retain the existing before/after profile summaries and management-only visibility.

Individual and class scheduling changes preserve readable student/subject or classroom/subject names alongside their existing business snapshots. Private meeting URLs are removed from new shared snapshots. Class-create, class-event and class-operation IDs, replay hashes, authority claims, and the audit-event IDs referenced by notifications retain their existing meaning. Creating a record legitimately has no previous snapshot.

Invoice snapshots include only the student name, document number, service month, status, revision, total and lesson count, rather than the full invoice document. Draft changes and deletion preserve their previous summary. Issuance reads the final generated number and status within the same claimed transaction. Payment/receipt history preserves the previous financial status and total, then reads the committed event's resulting status, total and actual receipt number in that transaction. Existing finance visibility and summary-field allowlists continue to apply.

For older events without object metadata, authorized invoice viewers can resolve the object from the surviving same-group invoice, and permission managers can resolve the affected account's name. These are read-time fallbacks; historical audit JSON is not rewritten.

## Retention policy

Audit history currently has **no automatic deletion or pruning job**. Migration `0051_audit_history_indexes.sql` adds read indexes only; it does not add tables/columns, rewrite rows, clear history, or change backup format. Existing audit records remain included in database backup and restore.

There is currently no audit retention-days setting to turn down. The configured operating policy is to keep the existing records. A future change to retention must first document and approve the business policy, covered event families, group scope, archival/backup treatment and a reviewed implementation. Financial retention periods remain **unconfirmed**; financial audit records continue to be retained until that policy is confirmed. No legal retention period is assumed and this release adds no cleanup automation.

## Local acceptance

`node tests/audit-history.mjs` uses fictional accounts and a real in-memory SQLite database with the application migrations and API handlers. It checks more than 30 records, tied timestamps, inserted/backdated events between pages, inclusive GMT+8 dates and combined filters, group/role/module access, finance isolation in enforced and preparation modes, revoked permissions/sessions during reads, historical names including actual lifecycle handlers, sensitive payload handling and read-only GET behavior. Browser layout/navigation verification is performed with the combined release build.

The same fixture also exercises real account, permission, class-session and individual schedule writers, including forged metadata rejection, safe snapshots, replay and unchanged notification-event IDs. `tests/invoices.mjs` and `tests/invoice-finance.mjs` cover final generated numbers, before/after states, draft deletion/retry, legacy object-name fallback and the safe audit response alongside their existing transaction, concurrency and financial integrity checks. `tests/financial-activity-privacy.mjs` retains the explicit finance-permission regression.
