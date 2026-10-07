# Tickminder lesson reminder clock

The website stores private notification subscriptions and enforces all course
permissions. This separate Cloudflare Worker calls one secret-protected website
endpoint every minute. It has no database or file-storage access.

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
backup formats `timelyo-d1-v7` and `timelyo-d1-v8`. Inbox records are retained for 90 days; backup
retention follows the existing encrypted-backup policy.

## Optional Google Meet detection

Only after the Meet site migration, Google configuration and live acceptance pass,
install the independent `MEET_CRON_TOKEN` secret matching that site's Meet secret.
The minute invocation then also calls `/api/meet/dispatch`. Without this secret the
existing reminder behavior is unchanged. Meeting detection is bounded to two due
lessons per invocation and has a separate heartbeat in `meet_runtime`.

For isolation testing, deploy a separate Worker with its own name and secrets,
setting `TICKMINDER_ORIGIN` to the existing private staging site's origin. The
code permits only the current production and staging origins; don't reuse the
production clock name, secrets or business data. Cron and Google API latency
mean detection is not a guarantee of real-time presence. See
`../../docs/meet-monitoring.md` for configuration and limitations.
