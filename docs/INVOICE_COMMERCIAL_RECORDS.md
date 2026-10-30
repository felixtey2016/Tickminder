# Commercial invoice records

The invoice and receipt features create ordinary commercial records. They do not
submit documents to MyInvois or certify that a transaction qualifies for a tax
relief or deduction. Institutions whose circumstances require an e-Invoice or
SST particulars must meet those separate requirements. The official references
used for this change are the LHDN e-Invoice Guideline v4.8 (30 August 2026), its
Specific Guideline v4.9 (7 September 2026), and the MySST invoice guidance:

- https://www.hasil.gov.my/wp-content/uploads/IRBM-e-Invoice-Guideline.pdf
- https://www.hasil.gov.my/wp-content/uploads/IRBM-e-Invoice-Specific-Guideline.pdf
- https://mysst.customs.gov.my/issuing-invoices/

Ordinary invoice generation remains available without registration or tax numbers.
Optional legal name, business registration number, TIN and SST registration number
record actual issuer information when supplied. Recording a number does not
verify it or enable tax calculation. No SST rate is inferred or charged by this
change. No official validation identifier, QR code or successful e-Invoice state
is generated from user-entered data.

A draft may specify a separate bill-to party (such as a parent or business) while
keeping the existing student identity as the tuition beneficiary. Party details
are optional and bounded. They are preserved through draft refresh and frozen
with the issued invoice. New receipts copy their issuer and payer facts from the
issued invoice, rather than the latest editable settings. Activity logging avoids
duplicating payer addresses, contact details and tax numbers.

The concise print view uses the invoice number, dates, billing period, issuer,
bill-to party, short service descriptions, billed quantities, unit prices and
amounts. Discounts appear once in the totals. Internal adjustment reasons and
calculation instructions stay in the administration interface. Only notes entered
for the document or institution are printed. Lesson records are an optional annex.

Billed quantity is separate from attendance count: rounded billable hours and
chargeable lessons use the billing source quantities; monthly quantities come
from monthly fee lines. A manual fee override does not fabricate a unit price.
Printed amounts and payment balances remain based on their authoritative stored
records. Current adjustments, payments, balances, voids and reversed payments
remain visible where applicable, without a full explanatory ledger on the page.

A print-version marker applies the concise layout to new or updated drafts.
Historical issued JSON is not rewritten. The current concise view is available
without changing the original amounts; the older original layout remains
available for unmarked historical documents. New optional JSON fields remain
compatible with older backups, and restoration validates them when present.

MyInvois integration would additionally require the relevant taxpayer's genuine
identity, credentials or authorised intermediary permissions and successful
submission/validation. The invoice software's availability is separate from the
institution's registration, licensing and tax obligations.
The two intended recordkeeping uses are institution income/accounting records
and a parent's evidence of actual tuition payments. An invoice records a charge;
a receipt records money actually received. A separate payer and student allow
both to be identified without labelling every tuition payment as deductible.
Eligibility for a parent's personal relief depends on the applicable assessment
year, service and institution conditions, and the claimant's own circumstances.
No relief eligibility decision is automated. Consult the current LHDN relief
rules rather than applying a later budget proposal to an earlier tax year:
https://www.hasil.gov.my/individu/pelepasan-cukai/
