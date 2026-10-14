# WhatsApp ↔ Tickminder timetable integration

This is separate from an AI job worker that only returns scheduling
recommendations. This backend connects the existing four-tool WhatsApp classroom
workflow to the website timetable. It adds no participant commands or model tools.

## Behavior

1. Resolve the WhatsApp sender and enrollment using the existing trusted backend.
2. Read that enrollment's website timetable. The website is authoritative;
   other courses contribute only anonymous busy intervals.
3. A draft or one person's proposal does not write a website lesson.
4. After both participants agree to the same dated proposal, commit through
   `POST /api/hermes/timetable` using a dedicated server credential.
5. The website checks the configured enrollment, old version, lesson status,
   competing lessons and pending website changes. A D1 transaction either applies
   all changes and audits or rolls them all back. The existing website revision
   mechanism observes these audit writes.
6. Only after a verified website success may the existing backend send the full
   revised month to both people. A WhatsApp partial send retains the website
   agreement and the existing per-recipient failure handling.

If the website update is rejected or its result is uncertain, no confirmed
timetable notification is sent. A persisted `website_pending` record blocks
further schedule edits until an administrator checks the operation's audit record.
Do not automatically retry an uncertain request. Replaying an identical committed
operation at the API is idempotent; changing its payload is rejected.

## Deployment and binding

The feature is **not active just because these files are present**. Deploy the
website code to the existing `tickminder.com` deployment and configure its private
runtime environment, preserving the current audience, authentication and storage:

- `HERMES_TIMETABLE_TOKEN`: a new, random, dedicated secret, at least 32 characters.
  Do not reuse the AI worker, owner login, backup or notification credential.
- `HERMES_TIMETABLE_BINDINGS`: JSON mapping administrator-chosen aliases to exact
  existing website student/subject/teacher assignments. Example with fake data:

```json
{"sample_course":{"student":"Example Student","subject":"Maths","teacherName":"Example Teacher"}}
```

Only active website assignments and active people can be used. Do not match phone
numbers, names or roles from chat claims. Verify each mapping with the operator.
Do not include secrets or real contact data in Git, prompts, screenshots or chat.
There are no new database migrations; do not reapply existing migrations.

Set `TICKMINDER_TIMETABLE_TOKEN` in the private Hermes classroom runtime to the
same dedicated secret. Prepare a copy of the currently installed classroom plugin:

```sh
python3 services/whatsapp-sync/prepare_plugin.py \
  --source /absolute/path/to/current/tuition-demo-plugin \
  --output /absolute/path/to/private/staged-plugin
```

The preparer does not install files, modify memory, activate the integration or
restart any bot. It rejects a changed or previously patched source. The staged
copy retains the current private roster; **never commit that staged roster**.

After verification and a private backup, the operator can install that prepared
copy and configure `<classroom-profile>/data/tickminder-sync.json`:

```json
{
  "enabled": false,
  "origin": "https://tickminder.com",
  "classrooms": {"verified_local_classroom_id": "sample_course"}
}
```

Enable only after the endpoint, credential and exact assignments are verified.
On the first successful import, the backend archives the previous local
timetables, draft proposals and reschedule record inside `before_website_import`;
it does not upload demo lessons. Old pending time proposals become superseded.
Existing questions, participant identities, language preferences, skills and
memory files are retained. Keep the private backup for rollback.

## First-version limits

- Supports confirmed initial lessons and dated changes to existing lessons.
- Does not change attendance, marks, fees, accounts, roles or teaching assignments.
- Does not delete existing lessons or replace a whole month by silently omitting
  old website lessons. Those cases require operator reconciliation.
- Undated carry-forward and overnight lessons require operator handling.
- Website `updated` does not mean the participant has read a WhatsApp message.
- Whole conversation text and attachments are not uploaded to the website;
  only the timetable change and two confirmation message references are audited.
- Existing website lesson mutations outside this endpoint retain their existing
  concurrency behavior; this endpoint does not refactor all website mutations.

## Verification

```sh
node tests/hermes-timetable.mjs
python3 -m unittest discover -s services/whatsapp-sync -p 'test_*.py'
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Tests use in-memory SQLite or temporary files, fake people, and mocked transports.
No real website lessons or WhatsApp recipients are used. The timetable API suite
covers authentication, enrollment boundaries, two consents, invalid times,
conflicts, stale snapshots, transaction rollback, concurrent changes, idempotency,
and attendance protection. Python tests cover import preservation, stable IDs,
busy intervals and uncertain-result handling.

The private current-plugin tests also verify: teacher proposal → student agreement
→ website update → complete month to both; and website failure → no confirmed
month sent. Historical five-person tests must use their historical roster, not a
new operator roster. The current pre-integration plugin already has six failures
in those 57 historical checks (poll send counts and newer recipient/task behavior);
the staged integration has the same failures and introduces none in that comparison.
This is not a claim that every old test passes, nor a live production acceptance.
