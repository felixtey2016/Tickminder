# Students with cancelled courses

Administrators with `students.delete` can permanently delete a student whose
remaining courses are all cancelled, without first disabling the pairing,
removing classroom membership or archiving the classroom manually.

The existing deletion preview lists cancelled lessons, reschedule requests,
notifications, pairings, memberships and eligible empty classrooms. Cancelling a
lesson no longer makes its student undeletable solely because its session exists.
Uncancelled courses, linked login accounts, student financial history, invoice
locks, replacement-course dependencies and referenced payroll remain protected.

Only this student's cancelled lessons are removed. A shared group session and
other students' lesson records remain. A classroom is removed automatically only
when it has no other present or historical participants, teaching content,
resource/Quiz assignments or payroll settings. Empty folders are included.

An otherwise empty classroom with a frozen legacy payroll-rate association is
archived automatically rather than deleting that immutable association. The
preview labels this separately as automatic archival. The student and cancelled
lessons are still deleted; the empty classroom leaves the ordinary active list.
No payroll trigger, rate mapping or financial ledger is rewritten.

The preview fingerprints source relationships. Live guards run before the whole
batch so membership, course, account, replacement or protected-source changes
reject the operation atomically. Shared bulk selections check their original
relationships before any selected student is changed. Group boundaries and the
existing administrator permission transaction remain in force.

Focused verification: `node tests/cancelled-student-deletion.mjs` uses all current
migrations and real route SQL in an isolated database. It covers four cancelled
courses, empty/shared rooms, retained teacher content, active/completed courses,
fee history, authority, group isolation, late changes, bulk deletion, legacy-rate
retention and foreign-key integrity.
