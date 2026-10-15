# Quiz practice and removal

## Scope

Students open the existing Quiz menu to practise an accessible public or organisation bank. Teacher/admin authoring and preview remain in the same hub. Teachers may import ZIPs into their own private creator drafts; platform-bank maintenance remains administrator-only. No staging site is updated by this release.

Self practice chooses correctness after each confirmed answer or results after completion. Teacher/admin allocations target an active own classroom or selected current students across quiz subjects, snapshot an immutable saved version, and control feedback policy. Students cannot override that policy. Legacy practice remains repeatable without a due date. Part 17 adds scheduled quizzes and Quiz homework, attempt/late policies and score/answer release; see [QUIZ_PUBLISHING.md](QUIZ_PUBLISHING.md). Quiz homework requires a valid class and is answered in Quiz, without duplicating existing PDF-homework records.

## Attempts and marking

- Server-persisted answers, question/option order, version ID, start time and optional deadline survive reloads and device changes. Requests compare revisions and record operation IDs. A stale device receives a conflict rather than overwriting a newer save.
- The browser autosaves changed answers and offers resume/history. Server time enforces the duration inherited from the quiz. On timeout, only previously saved answers are graded; late supplied answers are ignored.
- Self practice has an explicit **Exit practice** action and independent close button. Exiting saves changed answers, including changes made during an autosave. Partial work remains resumable; a fully answered self-practice completes automatically. If saving cannot be confirmed, exit remains available and shows a warning to check practice history. Previously saved answers remain resumable; an inherited timed attempt keeps its server deadline.
- Teacher-allocated work uses **Back to Quiz** and retains save/navigation protection. Leaving an allocation does not complete it: only submission records completion. A browser timeout only asks the server to confirm expiry; client clock changes cannot submit a still-live server timer.
- Long Quiz names wrap within phone cards and dialogs, with separate 44px close targets in preview, practice and enlarged-image dialogs. Phone navigation buttons wrap their labels rather than widening the modal.
- Initial content and saved-answer responses do not contain grading keys. Immediate confirmation locks the first answer and reveals only that question's correctness. Self-practice answers/keys are available after completion; allocations follow independent teacher-configured score/answer release. A released aggregate score does not disclose per-question correctness before answer release.
- MCQ/true-false, explicit text matches (whitespace/case rules), finite numeric literals and fractions/tolerance use the existing grading rules. Written answers and manual math remain pending an authorised teacher/admin's score. Scores never exceed the question's points.
- Teachers may review their allocations and current own students' self practice across subjects. Other students, unrelated teachers and groups cannot read arbitrary attempts. Disabled identities and changed memberships are rechecked on the server.
- Base practice-list loads use three bounded queries plus one batch when deadlines require finalisation, instead of querying every record separately. Selected teacher reports include an additional bounded event query.

## Completion and history actions (2026-10-16)

- Manual submission requires a valid answer for every question. The server rejects incomplete submissions; there is no submit-anyway action. Assigned work remains editable until its explicit confirmation, except already confirmed immediate-feedback answers.
- Self-practice has no Submit button. A full normal save completes it automatically; immediate-feedback practice additionally requires all automatically graded answers to be confirmed. Text-field autosaves defer completion until focus leaves the answer field. The final completing save locks answer edits so an older response cannot discard a newer answer.
- Real server-side time/deadline expiry still finalises previously saved partial work. An early client `automatic: true` request cannot force completion or accept late answers.
- History opens an own unfinished attempt with Resume, another learner's saved progress with View saved answers, and a finished attempt with View results. All use the same primary action styling. Unfinished cards do not show a final aggregate score. Completed self-practice uses Completed and a completion timestamp; allocated work keeps Submitted.
- Deleting one's own unfinished self-practice still requires confirmation. The destructive confirmation uses a dark red with white text that remains readable when the OS requests a dark theme. Assigned, completed and expired records remain protected.
- No schema migration is needed. Existing attempts, papers, test-paper classification, grading history and release rules remain unchanged. Completion regression tests use fictional in-memory data; actual browser flows use a separate local D1/R2 instance.

## Mathematics and universal ZIPs

Formatting applies only where relevant notation occurs, across any subject. Explicit `$...$` / `$$...$$` remains supported. Legacy unambiguous `2^2+2` and `101_2` display powers/subscripts without rewriting the stored source. Braces preserve scope. Ambiguous expressions such as `2^1/2` and `a^bc` remain literal and generate located import warnings. English blank lines, filenames, URLs and code are preserved. The importer does not infer missing digits, a number base, an educational answer or an ambiguous exponent range.

## Removal and organisation designation

- The quiz's author may delete it. Platform owner may delete any group's quiz. A designated organisation chief administrator may delete any quiz in that organisation; other administrators may delete only their own.
- Platform owner designates one existing active group administrator under **Platform console → organisation → Organisation chief administrator**. No existing administrator is promoted automatically. The designation currently grants the documented Quiz management/removal permission; it is not a new general permissions system.
- Author lists and permitted bank cards expose removal. Chiefs and platform owner also have **Quiz → Manage quizzes**, including unpublished private quizzes. Platform owner sees all groups there; a chief sees only their own group. Confirmation is required.
- Removal is a tombstone: it hides the quiz and stops new starts/allocations, retaining versions, submitted answers, scores and legitimate historical image grants. An already started attempt may finish. The old source hash is retained in the deletion audit while the active import key is released for a future reimport. No shared source images or copies are physically deleted.

## Schema, recovery and verification

Additive migration `0025_quiz_practice.sql` creates four practice tables. `0026_quiz_deletion.sql` adds nullable deletion metadata and a nullable organisation chief designation. Historical classroom/student labels remain snapshots; current assignment access still requires current eligibility. Existing account deletion/merge paths reject identities with immutable Quiz history and offer a useful explanation.

Part 17 adds migrations 0027/0028 for policy, submission snapshots, stable ordinals, accommodations, event history and notifications. Encrypted full backups now use D1 v17 (51 exported tables), together with PDF and quiz-image objects. Previous v1–v16 D1 snapshots remain supported. Restore scripts default to local validation. A code rollback can retain the additive schema; do not drop history or overwrite current production data with an older backup.

Isolated API/SQLite and real Chromium Chinese/English phone checks cover practice, teacher ZIP import, allocation, manual grades and deletion permissions. Production acceptance and the deployed Worker version are recorded in RELEASES.md. Physical-phone UI, OS push delivery and a new Google login are not implied by local browser verification.
