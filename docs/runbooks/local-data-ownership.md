# Browser-local notes, audit and field capture ownership

Notes and destructive-action history use versioned keys scoped to the authenticated user ID and active workspace ID:

- Notes: `sbp-tools-notes:v2:<encoded-user-id>:<encoded-workspace-id>`
- Audit: `sbp_audit_log:v2:<encoded-user-id>:<encoded-workspace-id>`

Both identifiers use JavaScript `encodeURIComponent`. Without both authenticated identity and workspace, the app does not read or create a scoped store. Changing either identifier remounts the notes editor, including its selection, ink and undo/redo state. Returning to that scope restores its saved notes. This provides application-level ownership isolation on shared devices; local browser storage is not an encrypted or server-authoritative audit system.

## Existing notes

The original `sbp-tools-notes` payload has no trustworthy ownership metadata. The app checks only whether the key exists, displays a recovery notice, and never reads, rewrites, deletes, imports or assigns that payload to the current user.

Recovery requires an administrator and the original author to establish ownership outside the payload, confirm the intended workspace, and authorize access on a trusted device. Preserve an exact backup before any authorized inspection. Do not infer ownership from the currently signed-in account, note titles, a project name, or first use after upgrading.

After ownership is confirmed, review each note with its author. Copy only confirmed notes into that author's scoped notes array, preserving every note field and the serialized `ink` value. Merge with existing scoped notes without overwriting or duplicating IDs. Validate text, stroke count, paper style and timestamps in the intended authenticated account and workspace. Retain the original legacy key and backup unchanged. This release provides no automatic migration or bulk recovery button. If ownership cannot be established, leave the legacy content untouched and hidden.

## Existing audit history

The original `sbp_audit_log` remains unchanged. Its `userId` is historical recorded metadata, not verified authorship: older callers could overwrite details and browser storage is editable. Matching it is a privacy filter, not proof that an action occurred. Its rows are eligible for display only when their recorded `userId` exactly matches the authenticated user. A recorded `orgId` must also match the selected workspace. Rows without a workspace are marked `legacyWorkspaceUnknown: true`; they are user-attributed historical records, not evidence of membership in the current workspace. Ownerless rows are never exposed.

New audit entries use the current scoped key and authoritative user/workspace fields; caller-supplied details cannot replace them. Each scope keeps at most 200 new entries. Clearing a scope writes an empty scoped view and hides legacy rows for that scope; it does not remove or alter the legacy store or another user's/workspace's data. No legacy audit rows are automatically copied into a workspace store.

## Offline field captures

New queued operations carry both the authenticated user ID and active workspace ID. Replay requires an exact match, completed authentication/MFA checks, and a resolved workspace. A replay client holds that user's original access token; it cannot acquire a replacement user's token while waiting for an SDK authentication lock. Workspace-generation changes and unmount cancel the transport, including delayed upload retries. Cancellation cannot undo a request already accepted by the server.

The pre-upgrade queue has no trustworthy ownership metadata. Ownerless operations and their pending photo blobs remain quarantined in place; they are not adopted by the next user, shown in that user's pending count, or replayed automatically. As with notes, an administrator and original author must establish ownership and intended workspace before inspecting or recovering captures on a trusted device. Do not infer ownership from a shared project ID.

Deployment preparation must preserve any confirmed legacy captures **before signing out or switching accounts**. Existing successful logout/account-switch cleanup still removes the old field queue and pending photo blobs. This release does not add a migration/export interface or change that purge policy. Keep an authorized backup of legacy localStorage and IndexedDB data before recovery; do not expose it to another device user. A failed sign-out retains the session and drafts and reports failure.

Photo, daily-log and punch rows retain their existing `client_op_id` deduplication keys. A lost response after photo-row creation can still leave an extra uploaded Storage object on a later replay: uploads and record creation are separate operations with a newly generated upload path. Record deduplication is not proof of exactly-once file storage. Do not delete presumed orphan objects automatically; reconcile references and apply the established storage retention/backup policy before cleanup.
