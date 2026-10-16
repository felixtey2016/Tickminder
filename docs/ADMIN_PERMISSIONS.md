# Administrator permission configuration

## Current operation

The production release configuration enables module permissions with `ADMIN_PERMISSIONS_MODE=enforced`. Current administrator access uses the explicitly stored permissions and the existing administrator hierarchy. **Saving a draft does not apply it.** A manager must review and explicitly apply the saved draft to change access.

In **People & accounts → Accounts**, the platform owner or organisation chief can choose **Permission settings** for an ordinary administrator in the selected organisation. Suspended accounts may be configured without being reactivated. Ordinary administrators cannot change their own permissions or another administrator's permissions.

The editor groups available actions by module. It offers explicit starting templates, a current-access summary, a saved-configuration summary and a review of additions and removals before saving. Choosing a template changes only the current draft. Required viewing permissions are added with dependent actions; removing a prerequisite also removes dependent actions.

Only actions already supported by the application are configurable. Teaching-material editing and homework publishing or marking remain subject to the existing teacher ownership rules. Administrator account management retains the platform owner and organisation chief restrictions. Tuition fee viewing is a separate `fees.view` capability. Rate settings and amount adjustments are limited to the platform owner and the live designated chief of the selected organisation. Ordinary administrators remain read-only. Future and platform-only modules are shown separately and cannot be granted.

## Existing and new accounts

Existing administrator identities receive an explicit snapshot of their existing scope. The snapshot does not expand when new modules are added. Accounts created after the migration begin with an empty stored configuration and have no business-module access until an authorised manager applies their permissions. The platform owner and designated organisation chief retain their existing protected management authority.

Saved drafts do not alter the stored baseline or live access. Configuration changes are recorded with before/after values and a revision. Concurrent edits require reloading and reviewing the latest version; a stale page cannot silently replace newer settings. Configuration history is visible only to authorised administrator managers.

## Integrated access checks

Module permissions are connected to business queries and actions, current and historic files, navigation and controls. The integration and application workflow are verified with synthetic accounts in an isolated local environment before release. Saved drafts remain pending until explicitly applied.

Selectors return only the names, academic labels and references needed for the permitted action. A scheduling administrator can select students and teachers without receiving their complete profiles. Quiz-library access and student-assignment access are independent. Statistics can be viewed without attendance notes, and activity-log snapshots require access to the relevant module. Student, teacher, creator, recipient and organisation restrictions continue to apply alongside module permissions.

Folder and classroom deletion retain their existing confirmed cascade behaviour. Permission to delete these containers includes deleting the affected contents described in their confirmation. This does not grant separate content editing, publishing or grading rights. Preview the deletion effects before confirming.

## Saved drafts and explicit application

When runtime enforcement is enabled, the permission editor separates the current access, saved draft and unsaved changes. Save the draft, review its additions and removals against the current configuration, then explicitly confirm **Apply permissions**. Only the exact saved server draft can be applied; the application request cannot supply replacement grants. Applying an empty draft revokes every configurable permission. Discarding a draft preserves current access. Suspended accounts can be configured without being reactivated.

Save, apply and discard use the expected profile revision and live manager, target, organisation and session checks. The configuration change and before/after audit record commit together; a conflict or failed audit rolls the whole operation back. A stale editor must reload and review the current version. Ordinary administrators cannot edit themselves, promote their own authority or configure another administrator. The platform owner and organisation chief remain protected targets.

Authenticated administrator requests retain a private, non-serialised session binding. Guarded reads and writes check that the original session still exists and has not expired. Logging out, resetting a password, disabling an account, changing its role or handing over the chief position cannot let a pending guarded operation continue with the old authority. Bulk mutations and their audits share the same rollback boundary. The UI refreshes private scopes and closes stale dialogs after a change; API checks do not wait for that refresh.

Uploads recheck authority after file storage. PDF failures clean their own reservation and object. A revoked Quiz upload removes only its unpublished, unreferenced reservation when its owner has lost every legal upload identity or grant; revoking one session does not delete an upload another valid session may be resuming. Database and object storage are separate services: a storage deletion failure can leave an inaccessible object that needs a later orphan-cleanup retry.

Google Sheet requests recheck authority after signing, immediately before dispatch. A request already sent to Google cannot be recalled by revoking access. Its acknowledgement is returned honestly so an administrator can inspect the sheet before retrying. Likewise, access revocation cannot erase a response already delivered to a browser.

## Formal rollout and recovery

The tracked production configuration sets `ADMIN_PERMISSIONS_MODE=enforced` following explicit approval for the release. Applying a draft is rejected if a deployment retains preparation mode by omitting this binding. Isolated fixtures verify both modes. The static preparation constant is the fallback response label, not an activation switch.

Before formal activation, create and verify an encrypted production backup, rehearse migration `0032_admin_permissions.sql` and the v21 restore, then add only the missing permission table and frozen legacy profiles. Do not run all historical migrations against a database restored without matching migration tracking. Existing administrators receive their explicit legacy scope; new administrators have no configurable permissions until a manager applies a draft. An existing draft is never applied automatically during rollout. Students, teachers, content ownership, tenant boundaries and platform-owner and own-organisation-chief fee-management controls remain in force.

Build and verify the exact source/configuration intended for release before setting the runtime binding. Keep the previous Worker version and encrypted snapshot for recovery. A Worker rollback can retain the additive permission table and stored drafts; do not delete profiles or reset business data as part of rollback. Roll back enforcement and application code together, verify current access, and create a new protected backup after a successful release. An unrelated disaster recovery restore should use the reviewed v21 snapshot/restore procedure so applied permissions and revisions survive.
