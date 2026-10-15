# Student classrooms and legacy association

## One place for each teaching pairing

Every active student/subject/teacher pairing has an active classroom. Saving a pairing, restoring a student or teacher, or binding an existing identity provisions missing rooms without inventing a subject or grade. A student name without a subject pairing remains a roster profile until the administrator chooses a subject and teacher. Matching active rooms are reused; multiple rooms require an explicit choice when scheduling.

Existing one-to-one lessons keep their lesson/session/participant IDs, times, attendance, review state, replacement links and bilateral rescheduling rules. Their session gains classroom metadata; it is not converted into a group session and no new billable lesson is created. Teacher reassignment updates only scheduled one-to-one work. Completed history and prior teacher files retain their existing ownership.

## Legacy teaching content

A read-only migration plan resolves a single recipient, canonical subject and saved teacher identity. It associates the existing PDF material or homework row with the appropriate room without copying files, recipients, submissions, scores, feedback or historical version JSON. Archived historical rooms are created from real saved student/subject/teacher triples when a current active pairing no longer exists. Students and pairings are never reactivated by migration.

The plan is rehearsed against an encrypted production snapshot in memory, then executed in one guarded batch. An audit contains migration counts. Live metadata and recipients are checked again; a stale item aborts the complete batch. Migration SQL and real identities stay outside public Git source.

## Expanding a classroom

Teachers can edit the room and add eligible students who have the same teacher/subject pairing and compatible classification. New members receive the existing class materials and homework, as chosen by the operator. The teacher can edit those materials and homework through existing controls. Historical student submissions, scores and Quiz attempts are not copied. Existing session participants are snapshots: joining a classroom does not rewrite past attendance or turn an already scheduled one-to-one lesson into a group lesson. The class planner schedules subsequent group lessons.

## Safeguards and screens

- Removing members, archiving or deleting rooms must leave every active pairing covered. A final group-scoped assertion in the mutation transaction also catches concurrent pairing/member changes.
- A classroom with linked course history cannot be permanently deleted; use archive after moving/ending active pairings. Preview and in-transaction checks prevent detaching history through foreign-key nulling.
- One-to-one creation shows the classroom, automatically choosing its unique match. A selection is required when multiple valid classrooms match.
- Classroom details have a lazily loaded Course schedule tab with one-to-one and group lessons. Editing and attendance continue through the established calendar flows and permissions.
- Schedule dropdowns use visible borders, separated labels, keyboard focus and full-width mobile controls.

## Verification and rollback

Fictional native-SQL/handler tests verify provisioning, aliases, tenant boundaries, immutable history, teacher reassignment, transaction rollback, and classroom coverage. A real local Worker with separate fictional D1/R2 data verifies mobile schedule creation, class browsing, inherited content and guarded deletion. No public staging deployment or production fixture is required.

No schema migration is required. Backups remain v19/53 tables. A code rollback keeps all new class links, archive rooms and later user work; restoring an older database is not a code rollback. The preceding Worker already supports classroom-bound content and session metadata. Preserve the earlier Quiz discard safeguards in any rollback.
