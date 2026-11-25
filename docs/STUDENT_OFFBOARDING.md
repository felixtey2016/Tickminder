# Student departure and cleanup

This document describes the implemented source behavior. Release status is tracked separately.

## Purpose and entry

Use the student directory's departure/cleanup action when a student will leave but their historical invoices, payments or teacher payroll must remain intact. The pending-cleanup list lets administrators return to unfinished cases.

This flow cleans teaching and private login data while retaining accounting evidence. It does not promise physical deletion of protected source rows.

## Lifecycle

| Status | Meaning |
| --- | --- |
| `marked` | Leaving / pending cleanup. The student remains enabled and can continue using scheduled teaching features. |
| `cancelled` | The departure marker was withdrawn. It does not cancel courses or alter financial records. |
| `cleaned` | An administrator confirmed cleanup. The marker is final in this workflow and the student is excluded from normal operational lists. |

- The planned last lesson date is optional and uses GMT+8 calendar dates. A future date blocks cleanup until that date.
- The date is a planning field. It does not automatically disable the account, cancel lessons or execute cleanup.
- A pending departure can be edited or cancelled before cleanup. Administrators resolve pending cases and explicitly confirm each cleanup; there is no automatic financial deletion.

## Review and confirmation

The preview shows the cleanup effects and outstanding teaching or financial items. Examples of blockers are:

- Future planned departure date, unfinished or uncancelled courses, and unresolved attendance or chargeability.
- Draft invoices, outstanding invoice amounts, refunds or overpayments requiring review, and taught/chargeable lessons not yet covered by issued invoices.
- Fixed monthly-fee periods still requiring invoicing or waiver review.
- Remaining prepayment balances, draft or incomplete prepayment requests, or inconsistent balances.
- Related payroll drafts, unpaid or inconsistent payroll, and taught sessions not included in settled payroll.

Resolve these items in their existing teaching or finance screens, then refresh the preview. A generated preview is valid for five minutes and is tied to the student, current revision, financial sources and cleanup effects.

Confirmation rechecks permissions and data in the same transaction. Concurrent changes invalidate the preview and abort cleanup rather than partially applying it.

## What cleanup changes

- Disables the student profile and subject pairings, and clears age and grade from the retained roster profile.
- Disables bound student login accounts; removes local and Google login methods, sessions, push subscriptions, WhatsApp bindings and personal study allocations. The retained account row is no longer presented as an active student account.
- Removes the student's homework submissions, feedback, scores, resubmission grants, teaching-material allocations, recording allocations and personal Quiz responses/allocations.
- Removes classroom membership. A shared classroom and other students' teaching records survive.
- Clears classroom-owned teaching content only when the classroom belongs entirely to departed students; its operational identity is retired and hidden.
- Hides cleaned students, pairings, courses, participant names and retired classrooms from normal roster, account, teaching, calendar and statistics views. Pending departure markers do not hide them.

Files are collected after the transaction and deleted only when no remaining reference requires them. At most two candidates are processed during confirmation; remaining unreferenced files are retried by the existing cleanup on later uploads, and the response displays a pending-file-cleanup notice. Google Drive videos are not deleted; only the site's recording links are removed.

## What remains

- Historical invoices, receipts, payments, refunds, adjustments, prepayments and teacher payroll documents/events.
- Student, account, classroom, lesson and attendance identity/source rows required for reliable accounting history.
- Existing financial foreign keys and immutable-record triggers.
- Audit records and the final offboarding/retirement markers.

Operational readers apply cleanup filters. Financial services continue to use their guarded raw accounting sources and snapshots, so cleaning a student does not erase their historical financial amounts or rewrite issued documents.

## Access

Only administrators can use the API. Viewing requires `students.view`; marking, editing or cancelling a pending departure requires `students.edit`.

Cleanup additionally requires `students.delete`, `students.disable`, `plans.disable`, `accounts.delete`, `lessons.delete`, `invoices.view`, `payments.view`, `prepayments.view` and `payroll.view`. Permissions are checked again during execution. Teachers, students and parents cannot confirm cleanup.

## Re-enrolment

The current cleanup marker cannot be cancelled after confirmation. Retained student identities and historical financial relationships must not be reused implicitly by ordinary account creation or linking.

A returning student needs a separately supported restoration process or a distinct valid profile. Re-enabling an old identity must not silently restore previously cleaned teaching records or combine another person's history merely because their name matches.

## API and audit

`/api/student-offboarding` uses the normal authenticated, group-scoped administrator session. POST requests require the same origin. Actions are `mark`, `cancel`, `preview` and `cleanup`; cleanup requires the current revision, preview token and explicit confirmation.

Audit actions are `studentDeparture.mark`, `studentDeparture.cancel` and `studentDeparture.clean`. Client responses expose blocker labels/counts and cleanup effects; the internal financial snapshots used for transaction checks stay on the server.

The schema addition is limited to `student_offboarding` and `classroom_retirements`. No financial table rebuild, financial foreign-key rewrite or removal of immutable financial triggers is part of this flow.
