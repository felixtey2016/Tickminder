# WhatsApp production runtime recovery

The production Worker was updated outside this repository on 2026-10-20. Its original TypeScript sources and database migrations have not been supplied. The source tree at commit `22bc135` predates those changes. **Do not redeploy the main source tree until the new source has been reconciled; doing so would remove the WhatsApp integration and other changes.**

`runtime-snapshot.json.gz` is a gzip-compressed JSON export of the deployed JavaScript modules and their publicly served client assets. It contains compiled code, not the original source, configuration secrets or database records. `manifest.json` records the originating version and SHA256 hashes. Production bindings and secrets remain in Cloudflare and are deliberately excluded. Database schema/migrations and data are not part of this code recovery.

The layout fix is maintained as readable CSS at `app/whatsapp-layout.css`. The standalone WhatsApp server page receives the additional `whatsapp-page` class. Until original sources are recovered, `apply-layout.mjs` applies exactly two guarded changes to the recovered runtime: that page class and an inline style element in the server-rendered root layout. No verification, consent, account, OTP or API behavior is rewritten. Existing client assets are retained at deployment.

To inspect or prepare the runtime locally:

```sh
node recovery/2026-10-22-whatsapp/apply-layout.mjs /absolute/path/to/private-output
```

This writes a `server` directory and `client` directory to the specified output, checks the snapshot hash, and applies the style-only patch. It does not deploy, create bindings, or access a database. A complete deployment also requires the current Cloudflare settings and bindings. The original live version remains available for rollback in Cloudflare.

When the original sources become available, retain the CSS import in `app/layout.tsx`, add `whatsapp-page` to the main element of `app/whatsapp/page.tsx`, and remove reliance on this compiled recovery workflow.
