# Timelyo versions and recovery

| Site version | Site source commit | GitHub recovery point | Notes |
| --- | --- | --- | --- |
| 17 | `59f57bbccc79465f555512d03a49a61d1a2c9f06` | `site-v17-stable-2026-09-26` | Initial private GitHub backup. The GitHub snapshot uses fictional student examples and a generic identity migration; the deployed application code is otherwise unchanged. |

The local `main` branch retains the original Sites commit history and deployment lineage. A separate local `github-main` branch backs up a sanitized snapshot. The older Sites commits are intentionally not pushed to GitHub because some contain student names in tests and a migration. Do not push local `main`, use `--all`, or make an original Sites commit a parent of a GitHub branch.

Before each feature, confirm that the latest stable tag can be fetched from GitHub and that the current Sites version can be identified. Create a feature branch from local `main`, verify the change, and commit it. Review the complete GitHub upload history again, then mirror the tested source tree onto `github-main` with a parent in the sanitized GitHub history and push it. The GitHub mirror commit is a separate recovery point and will have a different SHA from the Sites commit. After release, record both SHAs, the saved Sites version number, and the deployment URL in this table. Keep the Sites project configuration in `.openai/hosting.json`; the `github` Git remote is solely for source backup.

The private GitHub repository backs up source code only. Live attendance, accounts, schedules, password hashes, and audit records are in the Sites D1 `DB` binding. The repository does not contain a database export or a tested database restore procedure. Treat the D1 data as **not independently backed up** until an encrypted offsite export and restore test are established. Cloudflare D1 Time Travel may offer a limited point-in-time recovery window, subject to the actual plan and database type; verify availability before relying on it.

The current Site has no R2 binding and no PDF upload storage. Before adding homework PDFs, choose private object storage, a separate encrypted backup destination, a retention policy, and a restore test. Never commit uploaded PDFs, database exports, secrets, or `.env` files.
