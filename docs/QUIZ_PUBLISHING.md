# Quiz publishing, timed attempts and marking

## Scope and destination

Part 17 extends the existing Quiz hub. The current user instruction selects the independent Cloudflare production Worker on www.tickminder.com and tickminder.com. The old Part attachment's local public staging target is not used. No GitHub upload, paid service or mobile-store submission is included.

The same immutable Quiz version can be used for self practice, teacher-assigned practice, a formal quiz or Quiz homework. Quiz homework is answered and reviewed in Quiz; it does not duplicate the existing PDF/submission homework records. Homework always requires a valid class. Other Quiz allocations can target a class or selected current students.

## Teacher scope and publishing

All teachers may assign any subject to their own active classes/students. The quiz subject remains content metadata and a bank filter. It is not an allocation permission. Class membership alone can establish the relationship without a duplicate legacy subject plan. Active group, account, teacher and student checks are still enforced inside writes and historical file access.

Publishing pins the saved question/answer version and a settings snapshot. Formal quizzes and Quiz homework require a future due time; open time may be omitted for immediate access. Times use GMT+8, including native datetime controls. A per-allocation duration may inherit the source, be untimed, or override it with 1–360 minutes. Attempts may be unlimited or limited to 1–20, with one as the default for formal work. Late submissions default to rejection; teachers may explicitly allow them. Raw per-question marks remain unchanged, with optional aggregate scaling up to a chosen maximum.

Formal quizzes default to publishing scores and answers after the deadline. Homework defaults to scores after submission and answers after the deadline. Teacher-assigned practice retains completion feedback by default. Formal quizzes disable per-question immediate feedback. Self practice keeps its student's feedback choice and optional exit.

Public banks remain suitable for practice; a formal allocation does not make already public questions or previously disclosed answers confidential. Independent score/answer releases are explicit teacher decisions, including any release before other attempts finish.

## Attempts, clocks and disclosure

- Start, save, check, submit, release, grant and grade requests use stable operation IDs and revision checks. A new start resumes an existing live attempt. Start ordinals are assigned atomically rather than ranked by random IDs or equal timestamps.
- Personal timers are fixed at start. The effective end is the earlier of that timer and a rejecting assignment's individual/global due time. Refresh, another device, an extension or leaving the page does not reset the personal timer.
- The browser synchronises its displayed clock from server time. Browser automatic-expiry requests only ask the server to check expiry; they cannot submit a still-live clock early. Deadline/timeout processing grades saved answers and records the effective end separately from the later processing time. Unsaved late answers are rejected.
- Saved answers, flags for later review, question/option order and save time survive resuming. Numbered navigation shows answered and flagged questions. Self practice may exit without submitting; save uncertainty is explicitly reported.
- Answer keys remain server-side until the configured answer release. A separately released aggregate score does not expose per-question correctness or keys. Teacher-authorised review may see marking information. In-progress immediate practice reveals only the confirmed question's correctness and locks that answer.
- The due time and late judgement are snapshotted on submission and are not changed by a later extension.

## Management and notices

Teachers/admins review recipients, attempts, waiting manual work and raw/scaled scores. Manual scores stay within each question's original points. Changing an already graded answer requires a reason. Events retain old/new marks and feedback, release actions and individual accommodations; save events store revision/count metadata rather than copies of answer text.

An individual accommodation changes that recipient's due window and total extra attempts (0–20), requiring a reason and current assignment revision. It cannot reopen submitted work or reset the personal timer. Elapsed work is finalised before the accommodation; extra attempts allow a new attempt where applicable. Withdrawing stops new starts and preserves existing attempts/results, including continuation of an already started attempt.

Durable in-app notices cover allocations, updates, additional attempts and pending teacher marking. They use the current notification centre and per-account read status; Quiz has its own unread count and header totals do not count the same message twice. Membership/access loss, withdrawal and completed marking remove the corresponding visible pending notices. This release does not add or claim physical-device OS push delivery.

## Data, backups and rollback

Only additive migrations `0027_quiz_publishing.sql` and `0028_quiz_assignment_notices.sql` are required. Existing allocation policy defaults preserve legacy practice behaviour. They add event/notice tables, settings/release metadata, recipient accommodations and attempt flags/submission snapshots/ordinals. No original IDs, questions, answers, scores, PDF objects or image objects are rewritten.

Full backups become v17 with 51 exported tables; earlier v1–v16 snapshots remain supported. New exports include events, notices and all publication fields. Validate the encrypted pre-release snapshot and the migration against a copy before production. The recovered D1 migration history is incomplete: never apply all historical pending migrations wholesale.

An application rollback may keep the additive schema. Do not drop new history or overwrite a live database with an old snapshot. Known limitations and actual acceptance evidence, including the precise deployed Worker, belong in RELEASES.md; automated Chromium checks do not imply physical Android or fresh Google login testing.
