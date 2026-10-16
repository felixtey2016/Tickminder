# Student fee preview guide

## Access

The platform owner can configure rates, confirm billing rules and adjust amounts. Administrators with **Tuition fee viewing** (`fees.view`), including the designated organisation chief, can view only their own group's tuition estimates and breakdowns. Teachers, students and pending accounts cannot access these pages or APIs. Viewing never grants rate-setting or adjustment authority.

The approved viewing rollout explicitly grants `fees.view` to existing ordinary administrators, with a before/after permission audit and revision check. Existing drafts are retained without application; applying an older draft later uses exactly its reviewed permissions. New administrators still begin with no module grants until a manager applies a configuration. The historical legacy snapshot remains frozen.

Amounts on this page are **student tuition fees**. Teacher pay is a separate future calculation and is not derived from these amounts. This release does not introduce salary records or change tuition calculation rules.

## Set course fees

Open **Student course settings**, choose a course and select **Fee settings**. Choose an hourly, per-lesson or fixed monthly rate and its effective date.

The initial fee save enables these defaults when no billing rules have been set:

- Currency: MYR.
- Ordinary recorded attendance uses the duration scheduled for that lesson. Late arrival does not automatically reduce the duration.
- A teacher must explicitly record early departure for a shorter duration to apply. Missing departure details are flagged for review.
- Duration is rounded to the nearest whole minute. Each charge is rounded to cents.
- Changes partway through a month require manual review for a fixed monthly fee.

An existing set of billing rules is preserved. Later rate changes keep previous versions and have their own effective dates.

## View accrued fees

Open **Tuition fees**, select a month and optionally a student, then open the fee breakdown. Accrued fees can be viewed during the month; there is no need to wait until month end.

**Current estimated fees** can include ordinary attendance awaiting review. The reviewed portion is shown separately. Future lessons without attendance do not block the current fixed monthly fee. Items with missing rates or other required details show **Needs review**, rather than implying that the course is free.

The page refreshes when you return to it and periodically while it is visible. An open amount-adjustment form keeps its unsaved entries during automatic updates.

## Review and adjust

Open an item's fee breakdown to check its lesson duration, rate and review reminders. An adjustment requires an amount and reason; zero can be used for an agreed waiver. Previous adjustments remain in the history. **Restore system calculation** returns to the calculated amount and keeps the reason and earlier history.

This feature provides fee settings and a preview. Invoice, receipt and CSV download features are separate development stages.
