# Google Drive PDF import

## Public Google branding links

The application's public description is available at
`https://www.tickminder.com/about`, with the English privacy policy at
`https://www.tickminder.com/privacy?lang=en` and terms at
`https://www.tickminder.com/terms?lang=en`. These pages are accessible without a
Tickminder account. The public description links to the same policy and terms
URLs and explains the optional Drive import.

For Google Auth Platform **Branding**, use the Tickminder app name, a monitored
support email, those public URLs, and the authorized domain `tickminder.com`.
Save the required fields and follow any branding or domain-verification checks
Google presents. The OAuth **Audience** publishing status is managed separately:
deploying Tickminder does not change Google's Testing status. External users
outside a Testing project's test-user list cannot authorize Drive access.
See [Google's branding requirements](https://support.google.com/cloud/answer/15549049?hl=en).

## Classroom import

Classroom → Teaching materials → **Import from Google Drive** copies selected
PDFs into the current Tickminder class and folder. Teachers can use their own
active classes. An ordinary administrator needs explicitly configured
`materials.create` with its `materials.view` and `classrooms.view` dependencies;
placing files in a selected folder also requires `folders.placeContent` and its
read dependency. Existing platform Owner and group chief authority still applies.
Legacy administrator grants and permission templates do not silently gain this
new capability, including in permissions preparation mode.

Students and parents use the existing protected material views. The assigned
class teacher can read administrator-published class materials without becoming
their uploader. Creating materials does not grant administrator editing,
homework publication or scoring powers.

## Google Cloud configuration

Use one Google Cloud project for the OAuth web client, Picker key and project
number. Enable **Google Picker API** and **Google Drive API**.

For the API key, select **Websites** restrictions and allow:

```text
https://www.tickminder.com/*
https://tickminder.com/*
https://docs.google.com/*
```

Restrict that key to **Google Picker API** and **Google Drive API**. Picker's
iframe uses `docs.google.com`; omitting it can produce an invalid developer-key
error. On the OAuth **Web application** client, authorize JavaScript origins
`https://www.tickminder.com` and `https://tickminder.com` without paths or wildcards.
Keep existing sign-in configuration intact. Local testing needs its exact
localhost origin and a correspondingly restricted test key. See Google's
[Picker setup guide](https://developers.google.com/workspace/drive/picker/guides/web-picker).

Set these variables on the deployed application Worker, preserving its other
variables, secrets and bindings:

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Existing OAuth web client ID from that project. |
| `GOOGLE_PICKER_API_KEY` | Website- and API-restricted Picker key. |
| `GOOGLE_DRIVE_APP_ID` | Actual numeric **project number** from Google Cloud project information. |

Do not infer the project number from a client ID or confuse it with the textual
project ID. No client secret, service account or permanent Drive token is needed.
The authorized config endpoint returns these browser configuration values only
after checking live class/folder authority; it never returns a client secret.
An incomplete configuration returns `configured:false`, not a partially usable
key set. Real key values and OAuth credentials do not belong in this document,
source control or diagnostic output.

Configure the Google OAuth audience and consent screen for the intended users,
including `drive.file` in Data Access for an external application.
A Testing audience requires permitted test users; an application screen that
loads successfully does not prove that a different teacher can consent. Actual
Google selection and download must be checked with an authorized test user. See
[Google's consent setup](https://developers.google.com/workspace/guides/configure-oauth-consent).

## Import and authorization behavior

1. Open the import panel, then press **Choose Drive PDFs**. That user gesture
   starts Google's consent/Picker flow; ordinary Tickminder sign-in alone does
   not grant Drive access.
2. The Picker opens at the **My Drive root**. Open folders to browse their
   contents, use the Picker's parent navigation to go back, or search for a PDF.
   Folders are shown for browsing only and cannot be selected or imported as a
   whole. Select up to **20 PDFs**, including multiple files in one selection.
   Review their names in the queue and remove unwanted items. Selecting files
   does not upload or publish them.
3. Press **Import and publish**. Each PDF is downloaded, checked, uploaded to the
   existing private `BUCKET`, and published through the existing learning API.
   Published copies appear in the normal file library and its PDF preview.

Folder browsing uses Google's native Picker with the existing `drive.file`
scope. It does not add a background Drive listing or require a new database
migration. Existing upload authority, file limits, import preview and retry
deduplication continue to apply.

For an account with a verified Google binding, the protected config response
provides `loginHint` from that account's `google_identities.subject`. It never
falls back to a local account email or username. The client supplies this as
Google's `login_hint` with `prompt:""` to prefer the bound account. Google may
still require consent, sign-in or security checks; a hint is an account-selection
preference, not proof that the returned Drive token belongs to that identity.
Unlinked accounts receive no hint and retain the existing Google selection and
authorization flow, also using `prompt:""`; an account chooser is not forced.
No broader scope or lasting token is introduced. See the
[GIS token client reference](https://developers.google.com/identity/oauth2/web/reference/js-reference#TokenClientConfig).

The current import ceiling is **10 MiB per PDF** (10,485,760 bytes, shown as
10 MB), or a lower configured `PDF_MAX_BYTES` limit. Existing group storage quota
still applies. Google-native documents are not exported to PDF by this feature.
Metadata must identify the selected PDF and explicitly allow download; actual
received bytes and the PDF signature are checked even when Content-Length is
missing or inaccurate.

The browser requests `https://www.googleapis.com/auth/drive.file` and holds its
short-lived access token in memory. It calls Google directly with a bearer
header; the token is not sent to Tickminder APIs or saved in browser storage.
Closing the panel, changing its account/class/folder context or leaving the page
clears the token. Expiry requires another user-driven connection. No server-side
refresh token or background Drive access is used. See Google's
[token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model).

This is a **copy**, not synchronization. Editing or deleting the Drive original
does not update a published Tickminder copy; deleting the copy does not delete
the original. A failed item can be retried within the current queue with the
same upload request ID and publication operation ID, so a lost response does not
create duplicate records. A new import after closing the queue is a new copy.
Pause stops work still in progress; it does not undo items already published.
Authority is checked again on upload, publication and replay, so revoked access
cannot continue a stale queue.

## Database and backup compatibility

Apply `drizzle/0061_admin_material_creation.sql` before enabling this release.
It replaces only `material_active_class_insert`, retaining teacher ownership
checks while allowing authorized administrator uploaders. It does not change
tables, columns or historical business rows. The application additionally checks
the current session and live class, teacher, folder and grant state.

Verified backup export recognizes the actual trigger SQL. The original 0019
teacher-only guard with the contact schema exports **v36**; the exact 0061 guard
exports **v37**. Missing, unrecognized or incomplete current guard state fails
export with 503. Secure v37 rehearsal includes 0061 and preserves administrator
materials and their recipients/files. Historical v35/v36 restores retain their
original schema behavior; they are not silently upgraded. Recovery into the
current application schema is a separate forward-migration step.

Keep a verified encrypted pre-migration snapshot and rehearse the migration
before production application. Release checks should include both site origins,
an actual Google authorization/selection/download, and teacher and explicitly
granted administrator publication into the intended class. Automated local
coverage is in `tests/google-drive-import-permissions.mjs` and
`tests/google-drive-client-download.mjs`; those use fictional data and mocked
Google responses and do not replace a real Google consent check.
