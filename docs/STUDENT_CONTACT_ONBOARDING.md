# Student contact-number onboarding

Students with a confirmed identity and completed required login setup are shown a
short contact form when their ordinary contact record is missing. Their linked
student name is read-only. They choose student or parent and enter an
international telephone number. Siblings may share a parent's number.

The prompt follows required temporary-password, name and Google credential setup,
pending approval and group availability checks, and precedes optional Google
linking. Existing students without a contact see it on their next visit; a saved
contact suppresses repeat prompts. Quiz-link navigation is retained after saving.
Students can edit the number in My account. Authorized administrators see it in
Personnel and accounts using the existing accounts.view scope.

`GET /api/student-contact` reads the current student's contact. `POST` accepts
only `{phone, kind}` where kind is `student` or `parent`. The number is normalized
to a leading plus and international digits. The API checks the live student,
roster, group, completed credentials and session; write guards also protect
against concurrent identity or contact changes. Audit records indicate the kind
and presence of a number without duplicating the telephone value.

These are self-declared contact details. Saving does not verify phone ownership,
create a WhatsApp challenge, grant messaging consent or change a verified
WhatsApp contact. No SMS is sent. Other roles retain their existing login flow.

Migration 0060 adds three nullable account columns: contact_phone,
contact_phone_kind and contact_phone_updated_at. Existing values remain intact.
Backup v36 restores the new columns; v35 and older retain their historical schema
and become NULL in these columns when subsequently migrated. Account merge keeps
the target contact, inheriting a valid source only when absent, with concurrent
change guards. Student offboarding clears the three fields on retained anonymized
accounts while preserving financial history.