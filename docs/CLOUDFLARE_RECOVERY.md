# Tickminder independent Cloudflare recovery

## Source and scope

- Branch: `recovery/cloudflare-2026-10-10`.
- Base: production Sites v45, Git commit `4e0caad7805710471058259f9ad55a4193d1cf93`.
- The Google Meet feature remains on `feat/google-meet-detection`; it is not part of this recovery release.
- The original Sites manifest and deployment connection are retained. No domain switch is performed by these scripts.
- Application pages, business rules, account IDs, password hashes, roles, calendars, attendance and Sheet matching are unchanged.

## Owner-controlled resources

`wrangler.recovery.json` targets the owner's new `tickminder-recovery-db` (APAC) and private `tickminder-recovery-files` (APAC, Standard). The configuration contains resource identifiers and PDF limits only. Runtime secrets and production data must never be committed.

## Build and deploy

For Cloudflare Workers Builds, choose this recovery branch, repository root `/`, and disable preview builds. Use Node.js 22.13 or later.

- Build command: `npm run build:recovery`
- Deploy command: `npm run deploy:recovery`

The independent Vite configuration does not load the Sites authentication plugin or local dotenv secrets. Vinext emits `dist/server/wrangler.json`. The build wrapper verifies the account/storage targets, removes generated development credentials, and rejects private files in public assets. The deployment command preserves dashboard variables; runtime secrets are not sourced from Git.

## Encrypted restoration

A fresh snapshot was retrieved from the original site at **2026-10-10 22:31:56 Malaysia time**. It contains 28 tables and 7 PDF objects (9,308,490 bytes). Existing encrypted backup tooling validated both DPAPI recovery and the portable recovery key.

On the same Windows account, outside the repository:

```text
node scripts/restore-cloudflare-backup.mjs --in <encrypted-snapshot-directory>
node scripts/restore-cloudflare-backup.mjs --in <encrypted-snapshot-directory> --apply
```

The first command decrypts only in memory and checks SQLite schema, all rows, integrity and PDF metadata. The second refuses nonempty recovery resources, imports the database, compares every table's canonical row hash, uploads PDFs through stdin, downloads through stdout in memory and checks every SHA-256. D1's CLI requires a temporary SQL file: its directory is restricted to the current Windows user before writing, CLI output is captured, and the temporary directory is removed in `finally`. No plaintext database or PDF is written to the repository.

If restoration is interrupted after cloud writes, inspect and verify the recovery resources before proceeding. Do not remove the empty-resource guard or retry by overwriting an existing database. The original site remains the source of current operational data until cutover.

## Remaining configuration and cutover

1. Configure runtime `GOOGLE_CLIENT_ID`. Add the exact new test origin to the existing OAuth client's Authorized JavaScript origins before testing Google login.
2. Recover `SHEET_SYNC_URL` and `SHEET_SYNC_SECRET` without putting them in Git or chat. Confirm exact-match import in the test environment.
3. Configure the existing VAPID keys and notification dispatcher token. Keep automatic dispatch disabled during recovery testing to avoid duplicate reminders. Reconcile delivery state at cutover.
4. Configure `BACKUP_EXPORT_TOKEN` and verify a complete encrypted backup from the new deployment. Keep backup tokens and recovery keys separate from database snapshots.
5. Test teacher/student/admin account access, PDF upload/download and homework submission on the recovery deployment.
6. Take a final snapshot during a controlled cutover window, reconcile changes since the test snapshot, then switch the existing domain. Restore the latest data only through a separately reviewed refresh procedure; the empty-target script is intentionally not an overwrite tool.
7. Record the exact recovery Git commit and Cloudflare Worker version ID. Original Sites version numbers do not apply to this independent Worker.

Code backup is not a backup of live database/PDF data. A functioning recovery test deployment is not proof that a domain/data cutover is complete.

## Verification completed before initial deployment

- Independent Vite build and Wrangler deploy dry-run.
- TypeScript `tsc --noEmit`.
- Existing isolated tests: unified login, startup/role filtering, notifications, lesson rules, Sheet matching and account management.
- Encrypted snapshot restoration in memory, including all table content.
- Owner account, database identity, empty target and private R2 resource checks.
- Cloud restoration completed: all 28 tables matched their source row hashes; all 7 uploaded PDFs were downloaded and matched their source SHA-256 checksums.

The restored resources contain the 22:31:56 Malaysia-time test snapshot. The scheduled backup status file and offsite backup copy were not updated by this manual recovery. Later production writes still require reconciliation before cutover.

Live application checks and domain cutover must be recorded separately after deployment; they have not been claimed by the checks above.
