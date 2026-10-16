# Monthly invoices

## Access and entry

Open Finance (财务), then Tuition, Invoices, or Institution & templates. Only administrators may access financial screens. The platform Owner and each group's chief can manage that group's institution and template settings. Ordinary administrators require explicit invoices.view/create/edit/issue grants; enabling a new invoice capability does not widen existing saved permission profiles.

## Workflow

1. Set institution name, contact details, payment details, invoice prefix and default payment deadline. Choose standard, centered or brand layout. A logo is optional; uploads must be a supported transparent PNG within 2 MB and 2048 x 2048 pixels.
2. Choose a student and month to create a draft. There is one invoice per group, student and month. Generating again opens the existing invoice.
3. Review the existing fee calculation, attendance, makeup lessons and missing-rate warnings. Add charges or discounts with reasons. Refresh a stale draft explicitly; manual additions are retained.
4. Issue after unresolved and upcoming lessons have been settled. Drafts and running tuition totals remain available before month end; there is no fixed month-end date gate when the month is already complete.
5. Use Print / Save as PDF to open the secured A4 document and the browser's print dialog. PDF saving uses the browser; no server-side browser service is required.

## Issued originals and locks

Issuance allocates an atomic group/year sequence and freezes student, institution, logo reference, template, fee versions, amounts, lesson times and additions. Subsequent institution or fee changes do not rewrite an issued invoice. Replaced logo objects remain private and available for old originals.

Issuance locks the student's billing month and the financially relevant lessons and sessions, including replacement relatives outside the billed month. New billable lessons, rescheduling, attendance or financial-source changes in a locked period are rejected by database triggers, including old/direct/bulk API paths. Non-financial note changes remain possible. The confirmation screen explains the month closure before issuance.

Payments, receipts, voiding, refunds and reopening a period are later modules. This part cannot void an issued invoice or release its locks. The extension object reserves stable references; it is not an LHDN e-Invoice integration.

## Data and deployment

Apply additive migrations 0033_invoices.sql, 0034_invoice_attendance_locks.sql and 0035_invoice_brand_settings.sql together, after an encrypted database backup. Existing business IDs are retained. Snapshot format v22 includes all seven invoice/brand tables and private logo objects; older snapshot versions remain supported.

A code rollback can retain the additive tables and locks. Never drop issued invoices, items, logos or source locks to roll back the interface. Reconciliation or lock release requires a separately reviewed adjustment workflow. An application rollback does not undo database changes.

Local fixtures use fictional groups and accounts. No production student should be used to test issuing a real invoice. The production release targets www.tickminder.com and tickminder.com; the separate demo is not part of this rollout.
