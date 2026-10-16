# Administrator permission configuration

## Round 1: preparation

Permission configurations can be prepared and saved as drafts. **They are not active.** Existing access continues under the administrator hierarchy until the complete permission rollout is enabled after integration and verification.

In **People & accounts → Accounts**, the platform owner or organisation chief can choose **Permission settings** for an ordinary administrator in the selected organisation. Suspended accounts may be configured without being reactivated. Ordinary administrators cannot change their own permissions or another administrator's permissions.

The editor groups available actions by module. It offers explicit starting templates, a current-access summary, a saved-configuration summary and a review of additions and removals before saving. Choosing a template changes only the current draft. Required viewing permissions are added with dependent actions; removing a prerequisite also removes dependent actions.

Only actions already supported by the application are configurable. Teaching-material editing and homework publishing or marking remain subject to the existing teacher ownership rules. Administrator account management retains the platform owner and organisation chief restrictions. Billing remains the platform owner's pilot. Future and platform-only modules are shown separately and cannot be granted.

## Existing and new accounts

Existing administrator identities receive an explicit snapshot of their existing scope. The snapshot does not expand when new modules are added. Accounts created after the migration begin with an empty stored configuration for the future rollout; preparation mode continues to use existing access rules.

Saved drafts do not alter the stored baseline or live access. Configuration changes are recorded with before/after values and a revision. Concurrent edits require reloading and reviewing the latest version; a stale page cannot silently replace newer settings. Configuration history is visible only to authorised administrator managers.

## Round 2: integration

Module permissions are connected to business queries and actions, current and historic files, navigation and controls. This integration is verified in an isolated local environment. The normal deployment configuration continues to use existing access rules; saved drafts remain pending.

Selectors return only the names, academic labels and references needed for the permitted action. A scheduling administrator can select students and teachers without receiving their complete profiles. Quiz-library access and student-assignment access are independent. Statistics can be viewed without attendance notes, and activity-log snapshots require access to the relevant module. Student, teacher, creator, recipient and organisation restrictions continue to apply alongside module permissions.

Folder and classroom deletion retain their existing confirmed cascade behaviour. Permission to delete these containers includes deleting the affected contents described in their confirmation. This does not grant separate content editing, publishing or grading rights. Preview the deletion effects before confirming.

## Round 3: saved drafts and explicit application

When runtime enforcement is enabled, the permission editor separates the current access, saved draft and unsaved changes. Save the draft, review its additions and removals against the current configuration, then explicitly confirm **Apply permissions**. Only the exact saved server draft can be applied; the application request cannot supply replacement grants. Applying an empty draft revokes every configurable permission. Discarding a draft preserves current access. Suspended accounts can be configured without being reactivated.

Save, apply and discard use the expected profile revision and live manager, target, organisation and session checks. The configuration change and before/after audit record commit together; a conflict or failed audit rolls the whole operation back. A stale editor must reload and review the current version. Ordinary administrators cannot edit themselves, promote their own authority or configure another administrator. The platform owner and organisation chief remain protected targets.

Authenticated administrator requests retain a private, non-serialised session binding. Guarded reads and writes check that the original session still exists and has not expired. Logging out, resetting a password, disabling an account, changing its role or handing over the chief position cannot let a pending guarded operation continue with the old authority. Bulk mutations and their audits share the same rollback boundary. The UI refreshes private scopes and closes stale dialogs after a change; API checks do not wait for that refresh.

Uploads recheck authority after file storage. PDF failures clean their own reservation and object. A revoked Quiz upload removes only its unpublished, unreferenced reservation when its owner has lost every legal upload identity or grant; revoking one session does not delete an upload another valid session may be resuming. Database and object storage are separate services: a storage deletion failure can leave an inaccessible object that needs a later orphan-cleanup retry.

Google Sheet requests recheck authority after signing, immediately before dispatch. A request already sent to Google cannot be recalled by revoking access. Its acknowledgement is returned honestly so an administrator can inspect the sheet before retrying. Likewise, access revocation cannot erase a response already delivered to a browser.

## Formal rollout and recovery

The tracked deployment configuration still omits `ADMIN_PERMISSIONS_MODE`; formal activation requires a separately approved release. Applying a draft is rejected while runtime enforcement is off. The isolated fixtures enable `ADMIN_PERMISSIONS_MODE=enforced` to verify the finished workflow in advance. The static preparation constant is not an activation switch.

Before formal activation, create and verify an encrypted production backup, rehearse migration `0032_admin_permissions.sql` and the v21 restore, then add only the missing permission table and frozen legacy profiles. Do not run all historical migrations against a database restored without matching migration tracking. Existing administrators receive their explicit legacy scope; new administrators have no configurable permissions until a manager applies a draft. An existing draft is never applied automatically during rollout. Students, teachers, content ownership, tenant boundaries and the owner-only billing pilot remain in force.

Build and verify the exact source/configuration intended for release before setting the runtime binding. Keep the previous Worker version and encrypted snapshot for recovery. A Worker rollback can retain the additive permission table and stored drafts; do not delete profiles or reset business data as part of rollback. Roll back enforcement and application code together, verify current access, and create a new protected backup after a successful release. An unrelated disaster recovery restore should use the reviewed v21 snapshot/restore procedure so applied permissions and revisions survive.
