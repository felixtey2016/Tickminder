# WhatsApp production runtime recovery

The production Worker was updated outside this repository on 2026-10-20. This directory preserves its compiled runtime before the layout repair. On 2026-10-22 the original WhatsApp source was located in `kelvinyi2004/Tickminder`, branch `feat/whatsapp-phone-verification-20261018`, commit `82ae6865b331198c63bf9077f7898e17e9d40ee0` (based on `22bc135`). The WhatsApp source, migration and tests have now been reconciled into the main source tree, so new releases can use the normal source build.

The deployed self-registration behavior (`students.active=0`) and WhatsApp page styling were retained. Uncommitted production changes that bypassed student, teacher and plan deletion safeguards were not imported; this tree retains the existing account, classroom, course and billing-history protections. Cloudflare's existing WhatsApp settings and secrets must be preserved with `--keep-vars` during deployment. Private native D1 backups preserve the additional console/Bot schema and records; these are not contained in this public runtime archive.

`runtime-snapshot.json.gz` is a gzip-compressed JSON export of the deployed JavaScript modules and their publicly served client assets. It contains compiled code, not the original source, configuration secrets or database records. `manifest.json` records the originating version and SHA256 hashes. Production bindings and secrets remain in Cloudflare and are deliberately excluded. Database schema/migrations and data are not part of this code recovery.

The layout fix is maintained as readable CSS at `app/whatsapp-layout.css`, imported from `app/layout.tsx`. The standalone WhatsApp server page receives the additional `whatsapp-page` class. The historical fallback `apply-layout.mjs` applies exactly two guarded changes to the archived runtime: that page class and an inline style element in the server-rendered root layout. It is for recovery of this older version, not for publishing subsequent features.

To inspect or prepare the runtime locally:

```sh
node recovery/2026-10-22-whatsapp/apply-layout.mjs /absolute/path/to/private-output
```

This writes a `server` directory and `client` directory to the specified output, checks the snapshot hash, and applies the style-only patch. It does not deploy, create bindings, or access a database. A complete deployment also requires the current Cloudflare settings and bindings. The original live version remains available for rollback in Cloudflare.

Normal source builds now retain the CSS import and page class directly. The compiled archive remains available as evidence and as an older-version fallback.
