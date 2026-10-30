# Student monthly reconciliation

Finance → Student accounts shows a student's opening balance, payments, refunds,
payment reversals, confirmed tuition and the net amount carried into the next
month. A positive amount is credit; a negative amount is fees owing.

This is a live, read-only reconciliation, not a second cash ledger or a frozen
month-close document. Selecting an old month uses current corrections to its
service-period charges and actual transaction dates for cash. Original invoices,
receipts and their financial event histories are retained. Corrections can
therefore restate an earlier reconciliation.

## Receiving payments

An administrator records the actual amount, date and payment method once, using
the existing payment or prepayment form. Existing payment records are included
automatically. There is no bank transaction import or automatic bank debit.

Net cash includes payments against invoices and independent prepayments, less
their refunds and reversals. Applying or releasing a prepayment is an internal
allocation and never counts as another payment. A receipt already recorded
against an invoice must not also be entered as a new prepayment.

## Charges and review

Charges comprise effective issued invoice totals (including their additions,
discounts and later financial adjustments) plus confirmed, uncovered tuition
from the existing billing calculator. Lesson IDs are covered across all service
months. Monthly packages are covered by subject and service month. Both original
document sources and legacy invoice item snapshots establish coverage.

A voided invoice contributes zero charges and retires its original covered
sources; it does not silently recreate those charges as unbilled tuition.
Additional, uncovered lessons still accrue normally.

Hourly and per-lesson prices use the existing effective rate and attendance
rules. Fixed monthly fees retain the existing monthly pricing and exception
review rules. Pending attendance, missing rates and stale adjustments are never
converted into zero-price completed lessons or final spendable credit. Estimates
are excluded from confirmed charges. Unreviewed edits to invoiced sources are
flagged for the existing administrator correction/adjustment workflow.

The current month is provisional. A past period with unresolved records remains
under review. A fully checked past period carries its net amount forward without
copying balances or creating artificial transactions. This net includes unbilled
tuition and is distinct from the existing unallocated prepayment wallet. It does
not automatically allocate money to invoices, refund money or rewrite bills.

## Access and resource use

Only administrators with all four grants—`fees.view`, `invoices.view`,
`payments.view`, `prepayments.view`—can open this combined view. Each read checks
the current account session, active organisation and grants; teacher, student and
parent access is not broadened. Data responses are private and non-cacheable.

History is loaded for the selected student in bounded pages of three calendar
months. A revision token pins the pages; concurrent edits require a refresh.
Incomplete or mixed histories never render as a completed balance. There is no
new cron, database table, migration or whole-roster background calculation.
The billing read omits editing-only hashes unless existing adjustments need
validation; normal billing and invoice editing retain their original behavior.

## Local verification

Run the statement calculation and backend integration scripts, the billing,
invoice, prepayment and invoice-finance regressions, TypeScript and the recovery
build. Browser checks cover mobile/desktop navigation, payment routing, history
continuation, failed or stale requests and incomplete reconciliation. All test
money and student records are fictional and local.
