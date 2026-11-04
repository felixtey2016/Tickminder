# Classroom deletion and financial history

This document describes the implemented source behavior. It is not a deployment confirmation.

## Current classroom removal (2026-11-04)

| Classroom state | Result |
| --- | --- |
| No course, teaching, Task or payroll history | Remove the classroom and membership links; accounts and subject pairings remain. |
| Any course, teaching, Task or payroll history | Archive and retire from operational classroom lists; retain all source records and existing lessons. |
| Shared classroom | Removing the classroom preserves everyone's accounts and pairings. Separate student-departure cleanup remains a different flow. |

Classroom removal never disables a subject pairing, deletes a lesson, or cascades teaching and financial history. Teachers may remove only their own classrooms through existing classroom permissions. Administrators still need the existing classroom-delete grant; no lesson-delete or pairing-disable grant is needed because those records are not changed.

The preview lists retained records. Its five-minute proof and transaction guards reject stale membership, content, Task, course and payroll changes; a failed bulk operation rolls back the complete selection. A retained classroom's sessions remain visible through the existing authorized course history. Ordinary archive/restore and student offboarding are distinct from deletion retirement.

## Protected student departure

Use [Student offboarding](STUDENT_OFFBOARDING.md) when a student is leaving but has invoice or payroll history.

1. Mark the student as leaving; optionally enter the planned last lesson date.
2. Complete or cancel remaining courses and resolve invoices, prepayments and related payroll items.
3. Review the cleanup preview and its blockers.
4. Explicitly confirm cleanup.

Cleanup removes the student's teaching allocations and login methods, hides their retained historical courses from teaching pages, and retires classrooms used only by departed students. Required lesson, attendance, student and classroom identities remain available to financial services.

## Files and financial boundaries

- Classroom removal preserves teaching files and references. Separate authorized teaching-content cleanup may remove an unreferenced file after its transaction succeeds.
- Recording cleanup removes stored links and allocations; it does not delete Google Drive videos.
- Financial documents, rate versions, receipts, payments, refunds, ledger events and required source facts remain stored.
- The additive offboarding migration does not rebuild financial tables or change financial foreign keys or immutability triggers. The previously proposed payroll foreign-key migration is not part of this implementation.

## Local verification

Relevant suites include `tests/classroom-deletion.mjs`, `tests/student-offboarding.mjs`, `tests/operational-cleanup-visibility.mjs` and the TypeScript check. They use fictional local databases; running them is not evidence of a production release.
