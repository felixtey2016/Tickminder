# Tickminder lesson reminder clock

The website stores private notification subscriptions and enforces all course
permissions. This separate Cloudflare Worker calls one secret-protected website
endpoint every minute. It has no business database or teaching-file access. A dedicated private diagnostics R2 binding stores only sanitized error records.

Deploy only after the website notification migration and isolated tests pass.
From this directory, use the project's installed Wrangler CLI to log in through
the browser, install the `NOTIFICATIONS_CRON_TOKEN` Worker secret through stdin,
then deploy. This secret must match the website's dedicated secret. Never commit
credentials or place a token in the public `vars` section.

Verify an unattended invocation and the website `notification_runtime` heartbeat
before claiming automatic reminders are available. Repeated invocations use
atomic delivery claims; a crash after provider acceptance can still cause a
retry, so the service worker also coalesces the same reminder using its tag.

Cloudflare's free Workers plan currently includes 100,000 requests per day.
One invocation per minute is 1,440 per day. Check current quotas/pricing before
changing plans; no paid account is required by this configuration. The website's
own hosting/database usage and push provider/device limitations are separate.
Cron and push delivery are best effort, not exact-time guarantees.

The current website handles 32 delivery attempts per dispatch with 8 concurrent
provider requests. It retries transient failures at most three times within a
two-minute freshness window. Expired reminders are never sent hours later. This
bound suits the current small deployment; a much larger population would need
a queue and separate capacity verification.

Stop the clock before rolling the website back to a version without this route.
Browser push data and notification records are included in encrypted database
backup format `timelyo-d1-v7`. Inbox records are retained for 90 days; backup
retention follows the existing encrypted-backup policy.


## Independent diagnostics

The clock also makes one bounded homepage probe per minute and records detected
503/timeout/1102 failures directly to diagnostic R2. The authenticated
/diagnostics/feed endpoint reuses expiring, scoped, read-only diagnostic keys;
all other HTTP paths return 404. It does not reuse the reminder dispatch secret
for AI access. See [diagnostics](../../docs/DIAGNOSTICS.md) for coverage, retention
and platform-outage limits. Deployment retains the existing minute cron and secret.
