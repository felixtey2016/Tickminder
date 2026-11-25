# Student classrooms and legacy association

## Independent pairings and explicit classrooms

Student/subject/teacher pairings and classrooms are independent. Saving a pairing, restoring a student or teacher, or binding an identity does not create or restore a classroom. Teachers and authorized administrators explicitly create classrooms and select paired students. For individual scheduling, zero matching classes allows an independent lesson, one is selected automatically, and multiple matches require a choice.

Existing one-to-one lessons keep their lesson/session/participant IDs, times, attendance, review state, replacement links and bilateral rescheduling rules. Their session gains classroom metadata; it is not converted into a group session and no new billable lesson is created. Teacher reassignment updates only scheduled one-to-one work. Completed history and prior teacher files retain their existing ownership.

## Legacy teaching content

A read-only migration plan resolves a single recipient, canonical subject and saved teacher identity. It associates the existing PDF material or homework row with the appropriate room without copying files, recipients, submissions, scores, feedback or historical version JSON. Archived historical rooms are created from real saved student/subject/teacher triples when a current active pairing no longer exists. Students and pairings are never reactivated by migration.

The plan is rehearsed against an encrypted production snapshot in memory, then executed in one guarded batch. An audit contains migration counts. Live metadata and recipients are checked again; a stale item aborts the complete batch. Migration SQL and real identities stay outside public Git source.

## Expanding a classroom

Teachers can edit the room and add eligible students who have the same teacher/subject pairing and compatible classification. New members receive the existing class materials and homework, as chosen by the operator. The teacher can edit those materials and homework through existing controls. Historical student submissions, scores and Quiz attempts are not copied. Existing session participants are snapshots: joining a classroom does not rewrite past attendance or turn an already scheduled one-to-one lesson into a group lesson. The class planner schedules subsequent group lessons.

## Safeguards and screens

- Removing members, archiving or removing rooms leaves active subject pairings unchanged. Scheduling checks the current pairing, member selection and teacher in its write transaction.
- A classroom with course, teaching, Task or payroll history is retired from the working list with history retained. An empty unused classroom can be deleted. Neither flow requires moving or ending active pairings.
- One-to-one creation allows no classroom when the successfully loaded options have no match, automatically chooses a unique match, and requires selection among multiple matches. Whole-class scheduling always requires a class.
- Classroom details have a lazily loaded Course schedule tab with one-to-one and group lessons. Editing and attendance continue through the established calendar flows and permissions.
- Schedule dropdowns use visible borders, separated labels, keyboard focus and full-width mobile controls.
- Course lists, whole-class sessions, teacher attendance lists, student lists and classroom schedules offer All / Completed / Incomplete filters. Preferences are isolated by account/role/view. A taught group session counts as completed even if an individual student was absent; cancelled visibility remains a separate control. Group-only boards are labelled Group class sessions to distinguish them from classroom-linked individual lessons.

## Verification and rollback

Fictional native-SQL/handler tests verify independent pairings, explicit classroom creation, aliases, tenant boundaries, immutable history, teacher reassignment, transaction rollback, and stale class selection. A real local Worker with separate fictional D1/R2 data verifies mobile schedule creation, class browsing, inherited content and guarded deletion. No public staging deployment or production fixture is required.

No schema migration is required. Backups remain v19/53 tables. A code rollback keeps all new class links, archive rooms and later user work; restoring an older database is not a code rollback. The preceding Worker already supports classroom-bound content and session metadata. Preserve the earlier Quiz discard safeguards in any rollback.
