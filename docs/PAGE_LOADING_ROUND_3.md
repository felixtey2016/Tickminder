# Page loading, round 3

This round reduces overlapping reads and unnecessary navigation refreshes. It builds on round 2's page-scoped loading without changing the page URLs, visible UI, database schema, or business write APIs.

## Pending requests only

Identical authorized GET requests may share a transport while it is still pending. The opt-in consumers keep their existing server authorization and response-contract checks. A completed response is removed immediately; a later visit or retry performs a fresh server read. This is not a private response cache or a promise of request-free return navigation.

Private data is not stored in localStorage, sessionStorage, a service worker cache or a shared server cache. The browser's ordinary cache of versioned JavaScript and CSS remains separate.

The opt-in read families are workspace projections, paged courses, authentication checks and the navigation-count summary. This does not change the behavior of every GET in the application. The pending broker is bounded to 32 transports with a 30-second lifetime; a timeout is a visible, retryable failure.

The existing group revision is based on audit insertion order. Some data changes and their audit records are separate transactions, and restore does not provide a monotonic cache generation. A matching numeric revision therefore cannot prove that an older private response is still current. This round deliberately retains live reads instead of introducing revision-only or TTL result replay.

## Isolation and refresh rules

Pending reads are separated by the full account/role/binding/grant context, selected group, client authentication generation and exact endpoint/query. A session boundary is not inferred merely from an unchanged account ID. Identity changes, login/logout, authorization failures and write invalidation prevent earlier responses from becoming the new page's data.

Each subscriber owns its cancellation. One unmount must not cancel another active subscriber; the shared transport can be aborted when no subscriber remains, its context is invalidated, or its bounded lifetime expires. Results are isolated between consumers. Errors stay explicit and retryable, and settled failures are not reused as empty results.

Writes, uploads, password recovery, financial previews and action-preparation requests are outside automatic business-read sharing. Write attempts and known or unknown outcomes invalidate affected pending reads; operation IDs and explicit user retry behavior remain unchanged. A refresh received during a read must not be silently lost.

Navigation-summary refreshes are coordinated for the active identity and representation rather than repeated simply because another non-home route opens. Authentication refreshes still contact the server, with equivalent pending checks coordinated. Existing foreground, role/onboarding and revision checks remain in place.

## Verification boundaries

Use the immutable verified round 2 build as the baseline. Test subscriber cancellation, identity/session changes, authorization denial, error/retry, mutation races, different range/filter representations, result ownership and cleanup. Then verify the final built Worker with fictional role/tenant fixtures, existing route/Quiz/WebMCP flows, active drafts and a real local write followed by UI refresh and API readback.

Compare the same local cold navigation, repeat navigation and overlapping-refresh scenarios. Record requests, canceled requests, transferred bytes and content-ready timing separately. A single local timing sample does not establish production or physical-phone latency, and in-flight sharing does not guarantee savings for sequential reads. Report actual observed request reductions rather than assuming every GET benefits.

Production verification reads Worker configuration and static resources only; it does not query production D1 or exercise customer business APIs. No database migration, test-site deployment or real email test is required. Preserve runtime variables/secrets, D1/R2 bindings and scheduled reminders.