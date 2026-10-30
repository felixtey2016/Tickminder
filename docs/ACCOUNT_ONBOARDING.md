# Personnel and account onboarding

The account-management entry creates a login and its personnel profile together.
Student and teacher directories remain the views for existing personnel. They no
longer need a separate profile-creation step before account creation.

## Administrator workflow

- `POST /api/action`, `action: createLocalAccount`: administrator supplies username,
  initial password, name and role. New student/teacher profiles use
  `identityMode: new`; the profile name is the entered account name. Students also
  supply the existing catalogue fields `syllabusId`, `grade`, optional `age`.
- Existing students/teachers use `identityMode: existing` and the exact
  `studentName` / `teacherName`. Academic fields are not overwritten by linking.
- Google-first users remain pending. An authorized administrator uses `action:
  bind` with the same profile fields and a target `userId`. This updates the
  account name, assigns its role, creates or links its profile and activates it.
  Google identity proof stays attached to the original account.
- Admin and parent roles use their account records without creating student or
  teacher profiles. Parent management and administrator hierarchy guards apply.
- Legacy requests without `identityMode` retain the existing-person linking mode.

New profiles need `students.create` / `teachers.create` in addition to the
account action permission (`accounts.create` / `accounts.assign`). Existing
personnel linking needs the account action permission and all existing role,
group and account-management authority checks. Public authentication cannot
self-assign roles or provision a roster profile.

## Consistency

Creation/linking, credentials, activation and audits execute in one D1 batch with
live authority and permission guards. Existing active identities are never
silently matched by name in new-person mode. Disabled profiles and identities
already owned by an account (including a disabled account) require using or
restoring the original record. Concurrent roster, catalogue, identity or grant
changes roll the request back for a refresh. A failed account write cannot leave
an orphan profile.

Administrator-entered names are marked confirmed. Local accounts retain the
required first-password change. The optional Google-link prompt is a separate
login onboarding step; skipping it leaves the local login usable. No schema
migration is required for the personnel-provisioning changes.

Class enrollment and subject/teacher pairings remain explicit teaching choices.
Existing pairings continue to provision their normal classroom access when an
existing identity is bound. Account creation does not invent a class or subject.

## Student contact details

After required login setup, students without a saved contact complete the
[contact-number step](STUDENT_CONTACT_ONBOARDING.md). Existing names remain
read-only; student or parent numbers are accepted without WhatsApp verification.
