# Part 01 — API access and response matrix

This is a source review of the current application. It documents intended access boundaries and the local regression contract. It does not claim that every cell has a live production test. Release evidence and credentials belong outside the public repository.

## Conventions

- **Owner**: the platform owner identified by the verified account predicate. May select a group; a supplied group value never upgrades another account.
- **Admin**: an ordinary group administrator. The designated group chief currently adds Quiz management/deletion authority only.
- **Teacher / Student**: the signed-in account's server-side role, group and bound roster identity.
- **Identity gate**: valid, unexpired session; account not disabled; unactivated pending accounts not expired. Account setup/password/profile/linking use this gate so setup remains possible.
- **Business gate**: identity gate, completed initial password/Google setup, and a valid selected group. Ordinary users cannot select another group by header or cookie. Individual modules must also check permitted role and current resource relationships.
- **Group scope**: reads use explicit `group_id`, Drizzle `groupWhere`, or statement-local scoped views through `groupReader`. Caller-provided group/body IDs are not authority.
- **Own/assigned**: ownership or current roster/classroom/recipient relationship as appropriate. A matching display name in another group grants nothing.
- Mutating browser business routes check same origin. Background/export routes use a separate server secret; an ordinary login is insufficient.
- Authentication failure and unavailable resource responses must not return private record contents. Prefer generic denial/unavailable messages.

## Route inventory

| Route | Methods / operations | Permitted access | Resource and response boundary |
| --- | --- | --- | --- |
| `/api/auth` | GET, POST password/Google login, DELETE logout | Public login configuration; verified credentials; own session logout | GET exposes public Google client ID and own account/setup status only. Login verifies signature/audience/expiry or password, throttles password failures, rejects disabled/expired pending accounts. Registration uses valid active group invite; never trust posted role/name as binding. No password hashes or session tokens in JSON. |
| `/api/account-setup` | POST | Identity with verified Google identity, no existing local credential | Create credentials only for current account; unique username; recheck disabled/expiry at write; replace sessions. Audit attributed to the account's actual group rather than a database default. |
| `/api/account-link` | POST | Identity, existing noninitial password, password reauthentication and verified Google token | Own account only. Explicit merge confirmation; same-group and compatible identity checks; block protected owner binding and historical Quiz account merge. No arbitrary target binding. |
| `/api/password` | POST | Identity with current password | Current account only; replace hash, clear initial-password flag and revoke old sessions. No account ID supplied by caller can redirect operation. |
| `/api/profile` | POST | Identity after initial password change | Update current account's display name only; never role, bound teacher/student or group. |
| `/api/groups` | GET invite code / group list; POST switch/create/update/setChief | Invite lookup returns minimal public group label; signed-in own group; Owner manages platform groups | Ordinary accounts receive only their own group. Owner group list/admin candidates are platform-only. Chief candidate must be enabled admin in that group; current chief authority remains Quiz-only. |
| `/api/state` | GET core / learning / classrooms / accounts / activity scopes | Business; scopes by role; pending receives own minimal waiting state | Admin sees selected group's records; teacher current assigned scope; student own lessons/recipients only. Accounts/activity admin-only. Student lesson/session/proposal payloads use explicit safe fields; never raw internal notes, billing flags, reviewer/creator IDs or audit snapshots. |
| `/api/revision` | GET | Business | Own account ID and selected-group revision marker only. No foreign-group state. |
| `/api/action` | POST; detailed action matrix below | Business + per-action role/resource gates | All IDs, roster names and plan keys resolved inside selected group. Check current responsible teacher/student, not posted actor IDs. Legacy lesson operations delegate to class-session/attendance controls where required. |
| `/api/conflicts` | POST create/edit/proposeReschedule preview | Admin; teacher create/own proposal; student own proposal | Same-group schedule overlap checks. Nonadmins get conflicting time and reason, not other students' names or full lessons. Group-session preview uses group-session rules. Saving repeats conflict validation. |
| `/api/class-sessions` | GET class options or one classroom's sessions; POST schedule preview | Business + classroom access; preview role rules | Teacher assigned classes; student current membership; admin group scope. Student session response contains own attendance, safe dates/status/link/class identifiers, never other participants or internal attendance/review fields. |
| `/api/attendance` | GET one session's attendance editor state | Admin / assigned teacher | Session ID must be in current permitted class-session state; students and pending denied. Internal attendance fields are staff-only. |
| `/api/lesson-history` | GET one lesson history | Admin / assigned teacher / own student | Own-group lesson first, then role relation. Students receive safe schedule/attendance history only; internal notes, billing/reviewer identifiers and raw before/after objects omitted. |
| `/api/classrooms` | POST terms, classroom, archive, announcements | Admin / teacher, detailed below | Group-scoped teacher, term, student, plan and classroom validation; teachers only own class. Current member relationships required. No automatic disclosure of old recipient content to newly added members. |
| `/api/folders` | GET tree; POST create/rename/move/placeContent/previewDelete/delete | Readers of classroom; mutations Admin / assigned teacher | Folder and content belong to same classroom/group; reject foreign parent/content IDs and cycles. Revision and confirmed delete scope required. Preserve file references and correct quota accounting during cleanup. |
| `/api/learning` | POST materials, homework, marks, submissions, study blocks | Teacher publishes/grades own content; Student own assigned submission/study block | Mandatory valid classroom for publishing; actual recipient/class relationship; file owner/kind/context verified; own homework and submission only; no arbitrary student impersonation. |
| `/api/learning/versions` | GET history; POST edit | Admin reads group; Teacher own content; Student current recipient reads own permitted history; Teacher-owner writes | Immutable content versions and grade history retained. Student response projects published content/version information and own grades; strips internal owner/actor IDs and raw snapshots. Max-score/deadline changes retain existing accepted history rules. |
| `/api/learning/review` | GET review; POST grantResubmission/revokeResubmission/publishFeedback | Admin reads group; teacher-owner reviews/mutates; Student reads own received feedback/history | Student name parameter must equal bound student; current homework access. Resubmission grants tied to latest submission/revision; feedback PDF bound to that submission/class. No other student's grading. |
| `/api/files` | POST PDF upload | Teacher material/homework/feedback; Student own submission | Validate MIME, signature, size, class/homework/submission context and request idempotency. Group quota includes pending Quiz-image reservations. Revalidate live access around upload/commit; reserve and refund only actual file group. Never expose bucket credentials/keys. |
| `/api/files/[id]` | GET preview/download | Business and `pdfMayRead` | Owner's valid staged/attached upload; admin referenced group publication; current student recipient/own submission/feedback/history; teacher-owned homework submission. Anonymous/foreign IDs denied. Private no-store, nosniff, sandboxed PDF response; no raw storage URL. |
| `/api/quizzes` | GET cards/topics/facets/detail/preview/manage; POST save/share/duplicate/maintenanceImport/delete | Active Admin/Teacher; active Student bank preview only | Current own drafts, permitted admin review, explicit shared version for bank. Public bank is intentionally cross-group; organisation bank same group; private absent. Student preview never keys. Creator edit; author/Owner/designated group chief delete rules. Immutable copy/source/image grants survive authorised use. |
| `/api/quiz-images` | POST upload; GET image | Active Admin/Teacher upload; authorised current bank/version/practice viewers read | Server validates image type/content/bytes, quota and owner hash; atomically rechecks live authorisation. Reads require owned/current/shared version or authorised attempt reference. A guessed image ID alone grants nothing; Public Quiz images may legitimately originate in another group. |
| `/api/quiz-practice` | GET list/targets/attempt; POST start/assign/save/check/submit/grade/withdraw/release/accommodate/discard | Active participants; assignment/review staff gates | See detailed practice matrix. Every attempt/assignment binds group, current account, assigned student and current relationships. Keys/results follow release/immediate-feedback rules. Client-provided scores, actor/group IDs never authorise. |
| `/api/academic-catalogues` | GET student or quiz catalogue; POST update | Business authenticated readers across groups/current and future roles; Owner writes | Two independent global menus. Group admins cannot write. Revision and live Owner predicate enforced atomically. Global menu read is deliberate, not a tenant leak. |
| `/api/student-promotions` | GET preview; POST commit | Group Admin / selected-group Owner | Selected-group active students; central catalogue revision; matching prior grade and promotion cycle; duplicate/foreign names rejected. Atomic live admin/group and cycle checks; review before commit. |
| `/api/manage` | POST previewDelete / confirmed permanent deletion | Admin; teacher only own classroom/homework | Group-scoped targets; owner/self/admin protections; historical Quiz ownership blocks account destruction; preview counts only. Bulk fingerprint binds actor/current snapshots/time. Preserve required historical references; cleanup unreferenced files only. |
| `/api/sheet-sync` | POST preview / commit | Admin of explicitly configured bridge group | A single server bridge must be bound to its actual group before network access. Never allow another group's admin to read/write that group's Sheet through shared environment credentials. Current group's pairs only; month and preview token checked. Secrets are server-only. |
| `/api/notifications` | GET centre; POST subscribe/unsubscribe/read/readAll/test | Business, own account | Each item/current lesson/Quiz relationship rechecked. Subscriptions belong to current account; cannot take over another endpoint. Returns public push key only; private key and endpoint secrets not returned as general state. |
| `/api/notifications/dispatch` | POST server dispatch | Dedicated valid Bearer secret | Global scheduled task, not an ordinary admin feature. Derive each recipient's group and current relationship per event; do not trust caller-supplied scope. Invalid secret hidden with 404; no private content in errors. |
| `/api/pending-cleanup` | POST server cleanup | Dedicated valid Bearer secret | Expired never-activated pending accounts only; preserve active/historical accounts and valid references. Not ordinary client cleanup authority. |
| `/api/backup-export` | GET tables/file/image export | Dedicated valid Bearer secret | Deliberately privileged cross-group backup, including credential tables; never public or ordinary logged-in access. Resource IDs validated; no-store responses. Export route excluded from ordinary business-role matrix. |

## Legacy action matrix

All entries use business gate and selected-group scope. Owner acting in a group receives that group's administrator role; another group's IDs never become valid just because they are known.

| `/api/action` actions | Role / additional condition |
| --- | --- |
| `createLocalAccount`, `resetLocalPassword`, `activateAccount` | Admin. Target belongs to selected group; no protected owner reset. Teacher/student binding must exist in current active roster and cannot duplicate a live identity. |
| `deleteAccount`, `restoreAccount` | Admin with self/Owner protections. Only Owner removes an administrator. Restore rejects a conflicting live teacher/student account; revoke sessions when disabling. |
| `saveTeacher`, `saveStudent`, `setStudentActive`, `updateStudentProfile` | Admin; selected-group roster only. Classification IDs from central student catalogue, not free text; profile plan/classroom consistency preserved. |
| `savePlan` | Admin; current student, teacher and catalogue subject in group; plan revision/classroom coverage and reassignment conflict checks. |
| `bind` | Admin; own-group target and enabled roster. Cannot change self or Owner, ordinary admin cannot demote another admin. Full chief/CRUD redesign remains Parts 02–03. |
| `updateOnlineLink` | Responsible teacher, active own plan; validated online URL. |
| `create` | Admin or assigned teacher; active current student/subject/teacher plan, valid classroom, scheduling/conflict rules. |
| `proposeReschedule` | Admin or current own teacher/student where permitted; same-group lesson; student cannot change whole-group session. Preserve the student's own request reason. |
| `respondReschedule` | Correct counterpart/admin; pending current request and still-authorised lesson, not arbitrary requester/responder ID. |
| `attendance` / `review` | Teacher owns session; admin reviews. Delegate to current session attendance revision/idempotency checks. Reviewed/locked records obey existing rules. |
| `edit` / `cancel` | Admin; selected-group lesson/series; current state/conflicts. Group-session operation delegates to whole-session logic. |
| `createClassSession` | Admin or responsible teacher; valid current classroom, roster members and conflict-free slots. |
| `editClassSession` / `cancelClassSession` | Admin; selected-group session, revision and live actor guard. |
| `proposeClassReschedule` | Assigned teacher (admin may manage directly); valid session, revision, pending/current conflict rules. |
| `respondClassReschedule` | Admin confirms/rejects current teacher request; no student whole-class approval. |
| `updateClassSessionLink` | Responsible teacher/admin under session action gate; valid URL and revision. |
| `saveSessionAttendance` | Assigned teacher / admin; one session, actual participant lesson IDs, live relationships, version and operation token. |
| `reviewSessionAttendance` | Admin; whole session review, billing fields staff-only, one teaching-time record per session. |

## Other mutation details

| Module | Action rules |
| --- | --- |
| Classroom terms | `saveTerm` Admin. `createTerm` Teacher may create a new noncurrent term only; editing/selecting current term remains Admin. |
| Classrooms | `saveClassroom`, `archiveClassroom`, `saveAnnouncement`, `deleteAnnouncement`: Admin or responsible teacher, current classroom/resource ownership and membership rules. |
| Learning | `saveMaterial`, `deleteMaterial`, `publishHomework`, `setHomeworkScore`: teacher-owned content and current recipients/classroom. `submitHomework`: current bound student recipient, compatible owned staged PDF, starts/due/resubmission/revision rules. `saveStudyBlock`, `deleteStudyBlock`: current student/account only. |
| Published edits | Only publishing teacher edits content; administrator read-only review remains current policy. Revision/operation token, compatible replacement file, score ceiling and historical deadline judgement preserved. |
| Homework review | Only publishing teacher grants/revokes resubmission or publishes feedback; latest submission/revision and compatible feedback file. Student can read own feedback and released grade history, not mutate grants. |
| Quiz saving/import | Teacher/Admin may import creator ZIP via server save pathway. Platform bank editing/import only Admin. Existing quiz ID cannot overwrite another author's/group's draft; images must be owned or have a valid saved/copy-source grant. |
| Quiz sharing/copy | Author controls private/organisation/public shared revision. Teacher/Admin copy only a server-authorised source version. Public cross-group copy grants required images, not source editing/deletion. Publishing moderation is not added by Part 01. |
| Quiz delete | Creator deletes own; Owner all; designated group chief deletes that group's Quiz. Ordinary Admin does not gain chief deletion power. Tombstone preserves historical assignment/attempt/image references. |

## Practice action matrix

| Action | Authorisation and answer boundary |
| --- | --- |
| `targets` / `assign` | Teacher/Admin; current assigned classroom/students. Quiz subject is metadata, not a teacher-subject permission. No group/student ID override. |
| `start` | Current bank source or current assigned recipient; server fixes version, order, deadline, immediate-feedback policy and attempt limits. |
| `save` | Own in-progress, nondiscarded attempt with revision/operation and live access. Student cannot mutate another account's attempt. |
| `check` | Own attempt, enabled immediate-feedback policy, answered question; only authorised checked-question result/answer disclosed and that answer becomes locked. |
| `submit` / self-practice finish | Own in-progress attempt; normal completion requires all required questions answered; assigned timeout/deadline auto-finalisation follows teacher policy. Client score ignored. |
| `grade` | Admin or permitted responsible teacher; submitted attempt, valid question points and reason; current review access checked at commit. |
| `withdraw` / `release` / `accommodate` | Assignment creator teacher or group Admin, assignment revision and live authority. Release score/answers explicitly; retake/extra attempts only through authorised accommodation. |
| `discard` | Only own unfinished autonomous practice. Assigned homework/practice and completed attempts cannot be discarded or used to reset limits. |
| Results / images | Own or authorised review attempt. Student scores and keys withheld until allowed; unfinished attempts do not expose final results. Copied/historical assigned images remain accessible through their authorised immutable reference. |

## Student response contract

Use purpose-specific projections; never remove historical database records just to hide fields.

Keep own lesson/class IDs needed for navigation, planned times, permitted actual/personal attendance, public teacher/subject labels, class link, session revision/status and own reschedule dates/status/reason. Keep published homework/material text, own submissions, authorised feedback/grades, version timestamps and required file IDs.

Omit internal lesson/attendance notes, billing flags, raw reviewer/creator/account IDs, staff-only attendance snapshots, other participants' names, other students' work, credential/storage internals and unreleased Quiz keys. A field named `note` is not automatically private: the student's own request and study-plan note are legitimate.

## Local regression contract

Use isolated synthetic D1/R2 only:

1. Two groups with same-name teachers/students and Owner/Admin/chief/teacher/student accounts; include pending, expired pending, disabled, first-password-change and setup-only identities.
2. Exercise header/body group spoofing, foreign lesson/classroom/folder/file/version/image/assignment/attempt IDs and posted actor IDs. Verify no foreign read or write and unchanged target data.
3. Include positive tests for own schedules/reschedule, assignments/feedback/files and shared Public Quiz across groups. Global authenticated catalogues remain readable while nonowner writes are denied.
4. Assert student JSON allowlists across state/session/history/version and result paths, not only visible page text. Verify internal staff fields remain available for authorised staff.
5. Revoke account/roster/classroom/recipient access between preview and commit; stale page/token cannot retain write permission. Test response after a second request and the high-latency upload/mutation paths explicitly.
6. File cleanup preserves current/historical references, retries safely, and deducts only the actual file group's bytes once. Include other group's simultaneously present quota row.
7. Dedicated backup/dispatch/cleanup secrets are never interchangeable with ordinary sessions; anonymous private files denied.
8. Record executable check coverage separately from source-review expectations. Unimplemented Parts 02/03/19/20 remain explicit follow-up scope.

## Implemented safeguards and verification

The implementation replaces student lesson/session/history spreads with explicit projections, including learning version and grade history. Shared reschedule reasons, own attendance, authorised teacher feedback and own grades remain available. Staff access and stored history are preserved.

Credential setup records the stored account group. The existing single Google Sheet bridge is restricted to its original group; other groups need their own integration configuration before using this feature. PDF uploads recheck live account/classroom/recipient authority during reservation, metadata insertion and storage completion. Homework submission checks staged file ownership, purpose, context and expiry inside the transaction.

Local regression uses fictional accounts and isolated SQLite/D1/R2 only:

| Suite | Verified scope |
| --- | --- |
| `part01-access-boundaries.mjs` | 230 checks: anonymous/disabled/expired/setup-only accounts, forged group header and actor/body values, shared catalogues, cross-origin writes, Sheet binding, setup audit attribution, separate privileged task tokens. |
| `part01-student-response.mjs` | 49 checks: safe student state/session/history/version/review payloads; valid schedules, links, reschedule reasons, own scores and published feedback; preserved staff and database history. |
| `part01-files.mjs` | Private PDFs, two-group same-name identities, five reference families, correct-group quota, concurrent cleanup, R2 retries, revoked uploads, submission/cleanup race, permitted public/copied Quiz image references. |
| Existing security and workflow suites | `tuition-groups`, `unified-login`, `account-management`, `student-classroom-sessions`, `student-classrooms`, `quiz-practice-server`, `quiz-publishing-server`, `quiz-discard-server`, `academic-catalogues`, `student-promotions`, `sheet-sync`. |

The production build also runs against isolated Miniflare for HTTP-level checks. No schema migration or production test fixtures are required. Detailed release results remain outside public source control.

Full administrator hierarchies/CRUD grants, Public bank moderation and comprehensive capacity/backup acceptance remain the separately scoped Parts 02/03/20/36. This review does not claim a full independent penetration test or that every matrix cell was exercised in production.

