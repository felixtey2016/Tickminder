# Classroom deletion and financial history

This document describes the implemented source behavior. It is not a deployment confirmation.

## Choose the appropriate flow

| Classroom state | Result |
| --- | --- |
| No protected financial associations | The deletion preview can include the classroom and its scheduled, completed and cancelled courses. Confirming removes the listed operational records. |
| Empty classroom with immutable payroll associations | An administrator can remove it from operational classroom lists. Its financial identity remains stored, with a `classroom_retirements` record and archived status. |
| Protected classroom still containing students or courses | Direct deletion is blocked. Use student departure and cleanup after resolving teaching and financial items. |
| Shared classroom with remaining students | Cleaning one departing student preserves the other students, classroom and shared courses. |

Removing a protected empty classroom from the lists is **operational retirement**, not physical deletion of its financial identity. The preview identifies this explicitly as keeping financial history.

## Ordinary deletion

- The preview lists classroom content, sessions, lessons, attendance, notifications and resource placements affected by the selection.
- Where no financial protection applies, scheduled, completed and cancelled courses belonging to the selected classroom can be removed together. Student and teacher accounts are not deleted by classroom deletion.
- A subject pairing is disabled only if the selected classrooms provide its last active classroom coverage. Its student profile and financial history remain.
- Administrators need `classrooms.delete`, plus `lessons.delete` for existing courses and `plans.disable` for affected pairings. Teachers cannot cascade existing courses or disable student pairings.
- Invoice source locks, protected payroll associations and replacement lessons belonging to other classrooms can block direct deletion. The response identifies the blocking category.
- The five-minute preview proof and transaction guards reject stale membership, content, courses, coverage or financial associations. A failed bulk operation rolls back the whole selection.

## Protected student departure

Use [Student offboarding](STUDENT_OFFBOARDING.md) when a student is leaving but has invoice or payroll history.

1. Mark the student as leaving; optionally enter the planned last lesson date.
2. Complete or cancel remaining courses and resolve invoices, prepayments and related payroll items.
3. Review the cleanup preview and its blockers.
4. Explicitly confirm cleanup.

Cleanup removes the student's teaching allocations and login methods, hides their retained historical courses from teaching pages, and retires classrooms used only by departed students. Required lesson, attendance, student and classroom identities remain available to financial services.

## Files and financial boundaries

- Unreferenced teaching files are removed only after the transaction succeeds. Shared files remain while another reference exists.
- Recording cleanup removes stored links and allocations; it does not delete Google Drive videos.
- Financial documents, rate versions, receipts, payments, refunds, ledger events and required source facts remain stored.
- The additive offboarding migration does not rebuild financial tables or change financial foreign keys or immutability triggers. The previously proposed payroll foreign-key migration is not part of this implementation.

## Local verification

Relevant suites include `tests/classroom-deletion.mjs`, `tests/student-offboarding.mjs`, `tests/operational-cleanup-visibility.mjs` and the TypeScript check. They use fictional local databases; running them is not evidence of a production release.
