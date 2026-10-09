# app-files project authorization candidate

Local synthetic PostgreSQL verification; no provider call, upload, download,
production metadata read, migration application, or deployment was performed.

```sh
npm ci --ignore-scripts --prefix supabase/tests/app-files
npm test --prefix supabase/tests/app-files
node supabase/tests/app-files/verify.mjs --before-fix
```

The normal command runs 24 checks and executes both actual candidate migration payloads with
real PostgreSQL roles/RLS in PGlite. The baseline uses shipped project-role
functions and Storage-shaped metadata. `--before-fix` intentionally fails the
new isolation checks. This does not emulate the Storage HTTP service, JWT
verification, response headers, object bytes, or overlapping DB connections.

## Required release order

1. Review/apply/stamp preparation candidate
   `20261008234107_app_files_project_authorization.sql` using the repository's
   manual release procedure. Never `db push`, repair, or permissive stamping.
2. Back up database and owned Storage metadata/bytes; retain references and
   version history. Inventory every app-files object and all references.
   `legacy-inventory.sql` is an optional metadata report after preparation.
   It reads persistent relations and writes only temporary scratch rows in
   a transaction that rolls back. It checks all public tables (including JSON arrays/free text),
   so non-project tables and newly introduced reference columns are visible.
   Its substring matches are only review candidates, not proof of ownership.
3. Independently review every pre-existing object (including canonical-looking paths), including
   unreferenced, multiply referenced, archived, and stale-profile cases. Load
   an approved manifest into `private.app_file_scopes` as a privileged operator.
   Include exact object UUID/name, organization, explicit project/organization/
   avatar scope or **quarantine**, and a review/evidence reference. Never derive
   scope from the uploader, first/default/founding project, or one editable
   database URL. Conflicting project references need an explicit disposition;
   do not select one silently. Quarantine retains bytes but deliberately
   prevents access. Obtain operational acceptance for every such interruption.
4. Coordinate client deployment and enforcement candidate
   `20261008234249_enforce_app_files_project_authorization.sql`. It locks object
   metadata while validating the reconciliation, changing the four owned
   policies and adding restrictive guards against permissive-policy bypass. Missing reviewed dispositions abort the entire enforcement
   transaction. Old clients uploading `<org>/uploads/...` fail closed after
   cutover. Preparation alone does not fix the policies.
5. Check exact deployed payloads and exercise the real Storage API matrix below
   in staging before production release. Do not remove historical bytes or
   rewrite database references as part of this candidate.

## Scope contract and inventory

New project objects use `<org>/projects/<project>/uploads/<random UUID>.<ext>`.
The server verifies the project belongs to that organization, current workspace
membership and established project access. Writes require the `field` floor
and an active project. Existing owner checks remain on update/delete; both old
and new row scopes are checked on update/move. Active viewers may read; current
project/workspace admins may read archived evidence, but archived writes fail.
Missing, foreign, malformed and flat `uploads/` paths remain denied.

Reviewed legacy grants bind **both object UUID and exact path**, so deleting
and recreating a name does not inherit access. Legacy read, owner metadata
update, and owner delete work with current role checks. A legacy filename
rename needs a separately reviewed mapping or a move into an authorized new
canonical path. Legacy upsert is deliberately denied: replacement needs a new
project path and a reviewed reference update. Bytes/references/backups are
retained; this is authorization, not a data-copy migration.

Real client uploads were traced through the shared uploader: documents, drawing
sets/revisions/sheets, scope attachments, IFC model registry, RFI attachments,
photos, daily-log/punchlist photo strips, Field Today and offline photo replay.
Each now supplies the record's project explicitly. Shipping-ticket PDF
extraction uses the selected local file; persistence waits until the user
confirms the actual destination project. RFI PDF extraction also uses local bytes because no attachment is persisted
by that importer; CSV parsing remains local. Existing reference inventory also
includes expenses, mitigation proof, uploaded_files, submittal children,
change-order text attachments, and user_profiles.avatar_url.

Explicit organization files use `<org>/organization/uploads/<file>` with current
member read/admin write. No active organization-wide upload UI was found;
missing projectId never falls back to this scope. Own-avatar uploads have the
explicit `scope: 'avatar', userId` contract and use
`<org>/users/<user>/avatars/<file>`. The named user must be the caller for writes
and remain a workspace member. Other current members can read only the exact
file referenced by that user's current avatar_url, while both people still
share that workspace. No avatar upload UI was added and legacy avatar objects
are not automatically assigned to a project. Other buckets' rules are untouched.

## Acceptance still required against Storage

Use synthetic staged users: project field owner, viewer, same-org excluded
member, removed uploader, foreign-org member, current project/workspace admin,
and a shared-workspace avatar peer. Cover list, metadata/read, download, upload,
upsert, move, copy, update and delete, including old/new path checks and a role
change between requests. Verify folder traversal/listing and project export,
account erasure's privileged cleanup, existing references and backup restore.
Confirm Storage populates its UUID `owner` column as expected by existing
policies; the fixture is not evidence about HTTP service internals.

Signed links issued after this client change last **five minutes**. The hook
retains links only within the mounted authenticated consumer and reauthorizes
after 4.5 minutes, on identity/workspace changes, or after expiry on resume.
Full owned Storage URLs are reduced to bucket/path and signed again. Removed
membership cannot obtain new authorized links after policy enforcement, but an
already issued bearer URL remains valid until its server expiry (older links
may retain the former one-hour lifetime). Clearing client state cannot revoke
that capability or retract bytes already downloaded; staging must verify this
bounded behavior rather than claim immediate revocation.

IFC gzip output is streamed with a 128 MiB decoded-byte ceiling and 30-second
deadline; excess output is cancelled before retention/concatenation. New model
persistence enforces the same decoded ceiling before roster extraction, so it
cannot save a model that this client will refuse on reload. Existing larger
compressed models require structural-only re-export or splitting by sequence.
The fixture uses small compressed inputs and checks the boundary; actual
large-model/browser/device memory behavior remains acceptance work.
