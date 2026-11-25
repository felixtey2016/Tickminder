# Monthly invoices

## Access and entry

Open Finance (财务), then Tuition, Invoices, or Institution & templates. Only administrators may access financial screens. The platform Owner and each group's chief can manage that group's institution and template settings. Ordinary administrators require explicit invoices.view/create/edit/issue grants; enabling a new invoice capability does not widen existing saved permission profiles.

## Workflow

1. Set institution name, contact details, payment details, invoice prefix and default payment deadline. Choose standard, centered or brand layout. A logo is optional; uploads must be a supported transparent PNG within 2 MB and 2048 x 2048 pixels.
2. Choose a student and month to create a draft. There is one invoice per group, student and month. Generating again opens the existing invoice.
3. Review the existing fee calculation, attendance, makeup lessons and missing-rate warnings. Add charges or discounts with reasons. Refresh a stale draft explicitly; manual additions are retained.
4. Issue after unresolved and upcoming lessons have been settled. Drafts and running tuition totals remain available before month end; there is no fixed month-end date gate when the month is already complete.
5. Use Print / Save as PDF to open the secured A4 document and the browser's print dialog. PDF saving uses the browser; no server-side browser service is required.

Drafts can be deleted by administrators with invoices.edit, after confirmation. Deletion is revision checked and replayable; it removes the draft and its items while preserving lessons, attendance, fee settings and audit history. A draft may then be generated again. Issued invoices cannot be deleted.

Cancelled lessons remain in operational history and the frozen billing basis, but do not appear as pending attendance or extra zero-value entries on the printed invoice. The totals remain unchanged.

Logo uploads provide separate generic Files and Photos selectors. A generic MIME type from a mobile Files picker is accepted only when the file has a PNG name and passes the actual PNG signature, transparency, dimensions, checksum and size checks.

## Issued originals and locks

Saving complete attendance confirms it under the recording teacher or administrator. A second administrator review is not required for billing or invoice issuance. Administrators can correct confirmed attendance until an issued invoice locks its financial sources. Teachers must contact an administrator to correct a confirmed record.

Issuance allocates an atomic group/year sequence and freezes student, institution, logo reference, template, fee versions, amounts, lesson times and additions. Subsequent institution or fee changes do not rewrite an issued invoice. Replaced logo objects remain private and available for old originals.

Issuance locks the student's billing month and the financially relevant lessons and sessions, including replacement relatives outside the billed month. New billable lessons, rescheduling, attendance or financial-source changes in a locked period are rejected by database triggers, including old/direct/bulk API paths. Non-financial note changes remain possible. The confirmation screen explains the month closure before issuance.

Payments, partial receipts, refund records, reversals, issued-invoice amount adjustments and voiding use a separate immutable finance ledger. Each payment belongs to one invoice and produces one receipt. Refunds record returned funds; a separate fee credit can be recorded in the same transaction. Student access remains disabled.

Voiding retains the original invoice, its monthly identity and all source locks. It does not allow another invoice for the same student and month. Use an amount adjustment when charges should remain, or the authorised attendance correction workflow to amend an invoiced student's attendance and record any agreed amount change. Corrections close their narrowly scoped write window in the same transaction. Student attendance corrections preserve the teacher's recorded teaching interval; changes to teacher teaching times or schedules involving several billed students remain outside this correction form. The extension object reserves stable references; it is not an LHDN e-Invoice integration.

## Data and deployment

Apply additive migrations 0033_invoices.sql, 0034_invoice_attendance_locks.sql and 0035_invoice_brand_settings.sql together, after an encrypted database backup. Existing business IDs are retained. Snapshot format v25 also includes payments, receipts, financial operations/events and closed attendance corrections. Older snapshot versions remain supported. Apply additive migrations 0042_invoice_finance.sql and 0043_invoice_attendance_corrections.sql for this release.

A code rollback can retain the additive tables and locks. Never drop issued invoices, items, logos or source locks to roll back the interface. Reconciliation or lock release requires a separately reviewed adjustment workflow. An application rollback does not undo database changes.

Local fixtures use fictional groups and accounts. No production student should be used to test issuing a real invoice. The production release targets www.tickminder.com and tickminder.com; the separate demo is not part of this rollout.
