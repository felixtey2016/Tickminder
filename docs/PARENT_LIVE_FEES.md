# Parent lesson summaries and live fees

## Parent views

- Calendar, lesson list and attendance use one compact lesson card. Time and duration share a row; teacher and classroom are concise metadata. Arrival/departure exceptions remain visible, and full attendance facts expand under lesson details.
- Each child's financial permission remains independent and defaults to closed. Authorized parents see the selected month's currently recorded fees before invoice generation or month end. The default live month is the current business month.
- Live fees use the same effective rate, per-minute rounding, attendance and monthly package rules as administrator billing. Future unstarted lessons do not accrue fees. Unknown prices remain marked for review rather than appearing as zero.
- The recorded total includes already invoiced teaching. The unbilled subtotal excludes only matching issued source coverage; later lessons remain visible. Monthly packages are labeled separately and retain existing review rules.
- Formal invoice balances, payments and receipts remain separate. The live estimate is not added to invoice debt. The response contains no payroll, private administrator notes or rate-policy records. Financial grants and current account authority are checked throughout the read.

## Attendance corrections

- A teacher may make only the first submission. Submitted or historical attendance is read-only to teachers, including after an administrator restores it to unrecorded.
- Administrators with attendance edit permission can correct or reset unbilled attendance, including explicitly locked attendance. A reason and current revision are required; changes are atomic, audited and retry-safe. Original first-submission and recording evidence remain intact.
- Issued sources stay locked to ordinary writes. Administrators use the finance attendance correction entry, choosing the financial adjustment explicitly. Resetting can credit an incorrect charge; re-recording can charge again through the same entry. Original invoices and receipts remain unchanged. Actual refunds are separate records.
- For group courses, resetting one student's attendance preserves shared teaching facts while another participant is still recorded. Common teaching facts clear only when the last recorded participant is restored to unrecorded. Issued student invoices are corrected separately. In mixed classes, the normal reset restores only unbilled students and clearly identifies the students that need finance correction.

## Migration and restoration

Migration `0054_attendance_admin_reset.sql` replaces two issued-source correction guards and updates the existing group attendance synchronizer to preserve explicit service writes. It changes no table or column shape and preserves all existing rows. JSON backup format remains v32; restoration replays the new guards, with old v31/v32 snapshots still supported. Platform `_cf_KV` contents and the external Bot schema are not modified.
