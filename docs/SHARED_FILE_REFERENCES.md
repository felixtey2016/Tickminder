# Shared file references — Part 13

## One entity, explicit sharing

`pdf_files` remains the only PDF entity store. An upload reserves bytes once;
placing the PDF in two classroom Folders or using it in homework adds references
without uploading/copying bytes or reserving quota again. The existing resource
catalog is the shared-file picker; there is no second binary library.

A teacher explicitly publishes an attached, personally owned teaching PDF to the
group catalog, with `original` or `permission` license evidence. Student submissions,
feedback, staged uploads, another teacher's private file, a bare hash, or a foreign
group file cannot become a sharing source. File catalog entries remain group only;
public sharing currently supports links only. Merely knowing an ID grants no access.

`assertReusablePdfSource` returns a live SQL scope. Catalog creation includes it in
the transaction. `readResourceFile` provides the catalog/assignment scope for the
private binary endpoint and material/homework reuse. Reuse checks the source and
target teacher/classroom/session again in its write statement. Student downloads
require a current assignment, classroom membership and folder relationship. The
download endpoint rechecks the same scope after fetching R2 bytes, returns private
no-store sandboxed PDF content, and never returns an object key or content hash.

## Fixed versions

Catalog kind/file identity cannot change. A replacement creates a new uploaded
entity and a new catalog entry. Every Folder placement snapshots its exact file ID.
Native material/homework attachments likewise store the exact file ID; edits append
a `learning_versions` row, leaving earlier versions and submission version evidence
intact. Database triggers prevent changing physical identity, byte accounting or
content hash of an existing PDF, and prevent updating a saved learning version.

## Reference retention and recycling

`stored_file_references` derives PDF use directly from materials, homework,
submissions, learning versions, feedback, catalog entries and Folder assignments.
It reads existing relationships in place; migration 0056 neither rewrites old IDs
nor invents old versions, moves R2 objects, or recalculates historical quota.

**Archive/revoke is not physical deletion and does not release storage.** Archived
catalog entries, revoked placements, content history and submissions still retain
their PDF. No automatic expiry for these histories is introduced. A future approved
retention policy must explicitly remove the retaining relationship before collection.
The present app offers no destructive catalog-history purge button.

Once all current, historical and extension references have actually been removed,
the existing collector can recycle the entity. Routine upload cleanup waits for the
staged-file grace period; explicit content deletion also invokes the collector.
The collector atomically claims an unreferenced entity as `deleting`. New references
cannot attach after this claim. R2 deletion happens next; metadata deletion and the
owning group's one-time quota decrement then commit in one database transaction.
R2/database failures leave retryable metadata. Concurrent collection cannot charge
twice, and a reference committed before the claim prevents collection.

## Future attachment adapter and existing asset families

`retainFileReference` / `releaseFileReference` are internal statements for a source
module's authorized transaction. This release accepts **PDF references only**, with
same-group/entity-status validation and deletion guards. Both the helper and database
reject quiz/logo retention writes until their native collectors have been integrated.
The typed model reserves `quiz_image` / `invoice_logo` as future adapter kinds; it
does not promise retention for those domains today. These references retain data;
they **never** grant read permission. A future PDF chat attachment can use the same
interface after validating its own actor/source. Native PDF relationships are derived,
avoiding a second manually synchronized reference cache.

Existing `quiz_images`, version-image grants and `invoice_brand_assets` remain in
their current stores and access paths. PDF collection never deletes those domains.
This change neither migrates their bytes nor recounts their quota. A future collector
for those asset kinds must also adapt their existing native version references before
recycling them; the new adapter is not authorization to purge existing logos/images.

## Migration and rollback

0056 adds a view, an initially empty extension table and protective triggers. Old
relations remain authoritative and untouched. Reverting application code and then
dropping the new view/triggers/table returns to the old relation model when the
extension table is empty. If later modules have added extension references, export
and migrate those refs first; dropping them blindly would discard retention evidence.
Root's snapshot version 33 preserves the resource and extension tables on restore.

## Local evidence

`node tests/shared-file-reuse.mjs` executes actual handlers/services against fictional
SQLite and an in-memory R2 map. It verifies two teachers/two classes plus homework use
one object; current group, assignment and session fences; immutable replacements and
submission version evidence; revocation/archive retention; extended refs; final
collection, race ordering, and retryable quota transactions. It also checks separate
quiz/logo adapter writes are rejected and PDF cleanup never touches those assets.

For a reusable browser fixture, set `SHARED_FILE_QA_DIR` to a local work directory and
run the same test. `fixture.sqlite` and `fixture.json` contain only invented accounts,
local session cookies, resource/classroom IDs and base64 R2 objects, captured before
the test's destructive withdrawal/collection checks. Import into a fresh local
Miniflare environment; never into production. This export does not start a server or
confirm browser layout, which remains a separate release check.
