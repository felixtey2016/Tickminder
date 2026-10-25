# Unified Quiz library and sharing

## User behaviour

The Quiz library presents accessible quizzes together. The old platform and creator bank labels no longer divide the browsing interface. Existing bank-kind and catalogue metadata remain in saved versions for compatibility; this change does not discard questions or rewrite existing attempts.

Each Quiz card, preview and practice shows its creator's name. A sharing update records the creator's account name alongside its currently shared version. Recipient names are displayed only in the creator's sharing controls; public cards do not expose recipient account IDs, email addresses or internal owner/group IDs.

Teachers and authorised administrators create and edit their own quizzes. A Quiz has three new sharing choices:

| Choice | Who can browse and start their own practice |
| --- | --- |
| Private | Its creator only |
| Public | Signed-in users in active groups, immediately after the creator saves public sharing |
| Selected people | The explicitly selected, currently eligible accounts in the creator's group |

Teachers may select active student accounts linked to them through an active teaching plan or classroom. Administrators with the Quiz sharing permission may select active student, teacher, administrator and parent accounts in their current group. Pending and disabled accounts are excluded. Target names support search and pagination. Student and teacher accounts also require their active roster profile.

Parents can browse shared quizzes and practise under their own account. A parent's own practice is separate from a child's assignments, answers and scores. Students and parents cannot create quizzes, change sharing, fetch author marking keys or enumerate sharing recipients.

Sharing controls visibility; assigning a Quiz remains a separate action with its existing student/classroom, timing and attempt rules. Sharing a Quiz with a parent does not assign it to their child.

## Saved versions and existing shares

Public and selected sharing pin the saved immutable version selected when sharing is updated. Subsequent draft edits do not silently replace that version. Save sharing again to publish the updated saved draft. Private mode removes its selected audience and shared-version pointer. Sharing updates retain their actor, before/after state and operation ID in the audit log.

Legacy organisation shares retain their previous group-wide audience until the creator explicitly saves a new sharing choice. They appear as an existing group share in the sharing controls. There is no automatic conversion to selected recipients.

New public shares take effect directly and do not need an Owner approval row. Historical approved public versions continue to work where no explicit new sharing policy exists. Historical `legacy_pending` or other unapproved publication records remain unavailable to new public browsing and practice unless the creator explicitly chooses public. Saving a new sharing choice withdraws old pending publication requests. Historical declarations, review events, reports and appeals remain stored.

Platform takedown continues to block shared discovery, copying and new attempts, including newly published public quizzes. Reports and historical moderation records remain available through their existing authorised routes. Previously saved assignment and attempt history follows the existing access and retention rules; withdrawing a share does not erase that history or its legitimate version-image references.

## Server contract

`GET /api/quizzes?bank=1` returns a single authorised collection: the author's own drafts plus accessible shared versions. Each card contains `creator`, `sharingMode`, `sharingRevision` and `bank`. Clients must use the card's `bank` flag when opening, copying or starting it, because an author's own private draft can appear in this collection. Read-only preview responses contain question content and creator attribution, without marking keys.

`GET /api/quiz-share-targets?quizId=...&search=...&offset=...` is limited to the Quiz's actual creator and the sharing permission. It returns up to 40 eligible people, `hasMore`, current `selectedIds`, eligible selected display names, the teacher/group selection scope and a legacy-organisation flag. Omitting `quizId` lists eligible candidates for a creator's new Quiz. Another administrator cannot use this route to inspect a colleague's private audience.

Sharing uses the existing Quiz endpoint:

```json
{
  "action": "share",
  "id": "quiz-id",
  "revision": 3,
  "sharingRevision": 1,
  "visibility": "selected",
  "recipientIds": ["account-id"],
  "operationId": "a-new-unique-operation-id"
}
```

`visibility` accepts `private`, `public` or `selected`. Private/public requests have no recipients; selected requests require at least one and accept up to 1,000 unique account IDs. `revision` protects the saved draft; `sharingRevision` protects simultaneous audience edits. A Quiz with no new policy starts at sharing revision 0. Reusing the same operation ID with the same request replays its recorded outcome; changing the request with that ID conflicts. A stale revision returns 409. An initially invalid recipient returns 400; eligibility changing during the transaction produces a conflict and rolls back the complete audience update.

The server rechecks the live account, group, session, author identity, administrative permission and teacher/student relationship inside the write transaction. Shared readers use the same central access predicate. Removing a teaching relationship or disabling a target revokes live selected access without erasing historical audience records. Creator-only recipient details and search results never include email addresses.

## Copying and opening Quiz links

Saved Quiz cards and the creator sharing panel offer **Copy link**. The stable URL is `/quiz/<quizId>` and contains only a strictly validated Quiz ID. It carries no session, account, group, recipient grant or answer key. Clipboard failures provide a selectable read-only URL for manual copying.

The link renders the existing login and account-setup flow in place. Password login, Google sign-in, required password/name/account setup, approval and optional Google linking preserve the destination. They do not enrol a new identity into the author group. Once authorised, the page loads a read-only summary through the existing Quiz preview API and requires an explicit Start action before creating or resuming an attempt.

Public, private and selected audiences are checked by the same live server policy as the library. Missing, removed and inaccessible Quizzes show a generic failure after sign-in. Private authors may open their own saved draft; other readers need a published version and the applicable live grant. Browser navigation away from the link clears its intent; closing an attempt returns to the linked summary. There is no arbitrary return URL or new authentication token.

## Schema and backups

Migration `0059_quiz_sharing.sql` adds `quiz_share_settings` and `quiz_share_recipients`. The existing Quiz visibility CHECK remains unchanged: selected sharing is represented internally as `organisation` with an explicit selected policy. Private policies have no version; public/selected policies point to an immutable version of that same Quiz and group. Structural guards validate policy ownership, group identity and revision increments. Recipient-account deletion cascades only that recipient grant.

Backup format v35 includes both sharing tables and the existing `student_offboarding` and `classroom_retirements` tables from migration 0058. Restore orders accounts and Quiz versions before policies and recipient grants, validates structural identities and keeps dormant historical grants even when a relationship is no longer currently eligible. Older supported formats, including v24, remain readable. This feature does not modify financial records.

Do not roll back to code that interprets every internal `organisation` share as group-wide while selected policies exist: that would widen the audience. Retain the additive schema and saved history, and use a sharing-aware release or fix forward.

## Local regression checks

- `tests/quiz-sharing-server.mjs`: actual API/service code with an isolated SQLite fixture; creator-only drafts, direct public access, selected audiences, parent practice, live relationships, revision conflicts and no-answer-key responses.
- `tests/quiz-sharing-backup.mjs`: actual v35 backup export and secure restore; nonempty sharing/lifecycle tables, parent attempts, version-image grants, cross-group/version/owner rejection and old v24 compatibility.

These fixtures use fictional data and forbid network requests. Passing them is local validation, not evidence of deployment or a production data change.
