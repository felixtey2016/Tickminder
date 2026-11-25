# Test UI refresh — finance and teaching statistics

This is wave 4 of the R01–R15 reference refresh. It is separate from the historical `UI_ROUND4.md` project.

## Delivery scope

- Test site: `https://tuition.tickminder.com`
- Source branch: `feat/ui-refresh-test-r1`
- Production is unchanged. Keep test accounts, courses and financial history.
- No database migration, pricing change, payment operation or permission change.
- Storage and Google configuration for the test site remain deferred.

## Reference coverage

| Reference | Implemented presentation |
| --- | --- |
| R12-01/02, R14-01/02 | Underlined desktop finance navigation, labelled mobile page selector, grouped monetary metrics, aligned reminder rows and collapsed secondary reports. |
| R12-03 | Tuition list aligned by student, estimated fee, fee items and status; compact mobile rows; calculation details remain available. |
| R12-04/05 | Invoice list, filters, single draft action and empty state. Printed invoice templates and financial operations are preserved. |
| R12-06–09 | Parent child selection, underlined invoice/prepayment tabs, clear balance rows and distinct loading/no-access/empty states. |
| R13-01 | Student account search and month selection; list amount explicitly means current unallocated prepayments. Monthly statement calculations remain separate. |
| R13-02 | Expense registration remains primary; export and refresh are secondary. |
| R13-03 | Payroll tabs, compact teacher records and explicit ungenerated/pending/incomplete draft states. |
| R13-04–07 | Prepayment requests, balances and activity navigation; aligned balances and separate form actions. |
| R13-08/09 | Institution/template sections, logo placeholder and grouped save actions. Existing logo validation and template preview are preserved. |
| R13-10–12, R14-05–07 | Teaching progress, teaching scope, attendance and homework groups, aligned workloads and collapsed trends. |
| R14-03/04 | Classroom payroll settings and unconfigured state; history remains expandable. |
| R15 | Shared theme tokens, readable dark surfaces, touch actions and clear heading/action hierarchy. |

## Semantics retained

Zero, unconfigured, pending review and loading are different states. Invoice balances, unallocated prepayments and provisional monthly carry-forward are labelled independently. Cash balance is not described as profit.

Teacher teaching time and chargeable student time use separate groups. Statistics keep their existing filters, denominators, calculations and detail destinations. Zero denominators remain `—`, rather than becoming 0%. Teachers cannot access the administrator's chargeable-student-time section. Long calculation rules remain available in a disclosure.

The previous user override for classroom navigation remains in force: horizontal mobile tabs with left/right controls. This finance update does not replace classroom navigation with a selector.

## Verification approach

Use actual components and compiled styles with fictional responses for populated, empty, loading, permission and incomplete-money states across phone/desktop, Chinese/English and both themes. Inspect screenshots as well as overflow and interaction checks.

Then verify the assembled Worker against an isolated fictional database, including finance navigation, statistics detail loading and role restrictions. Compare financial tables before and after the read-only checks. Deployment verification must compare active test Worker modules and public assets with the reviewed package. Component mocks do not prove live account or payment behavior.
