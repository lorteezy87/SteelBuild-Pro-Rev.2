# App-files project access boundary — audit and proposed contract

Status: **read-only audit; proposed follow-up, not implemented or released**.
This work does not change the frozen release, production policies, object bytes,
paths, customer records, or submitted drawing evidence.

## Evidence scope

Source snapshot: `origin/main` `00cc7a70f3bb6eb1d5864f5f3f7358d03bac0aeb`,
with the relevant uploader/storage/export code also inspected on release
integration `c3649d15102c25c3d7284921ba1c99da372fa915`.
Production catalog and aggregate-only SQL inspection used project
`kjrwqagyeswwoxpjkcko` on 2026-10-09. No customer object names, paths, contents,
tokens or signed URLs were retrieved. These are time-specific observations.

The dirty candidate migrations `20261008234107` and `20261008234249` in the
separate security checkout were neither adopted nor edited. This proposal must
receive its own source review, synthetic acceptance and manual release process.

## Verified current policy and producer behavior

`app-files` is private, with a 50 MiB object limit and 31 allowed MIME entries.
The permissive policies on `storage.objects` are:

| Policy | Command | Effective predicate |
| --- | --- | --- |
| `auth_read` | SELECT | app-files bucket, first path segment is a UUID, current organization membership |
| `auth_upload` | INSERT | Same organization predicate on the new path |
| `auth_update` | UPDATE | app-files bucket and object owner equals `auth.uid()`, in both USING and WITH CHECK |
| `auth_delete` | DELETE | app-files bucket and object owner equals `auth.uid()` |

The restrictive `require_enrolled_mfa` policy remains in force. This enforces
the existing enrolled-factor policy, not mandatory enrollment for every user.
Other bucket policies cover `email-attachments` through project access and
`blueline-files` through per-user paths. `sheets-files` also exists and is
outside this change's ownership boundary.

`src/api/client/uploads.ts` accepts a file and optional workflow, but no project
identity. It chooses `<org>/uploads/<random>.<extension>` from active workspace
state and requests `upsert: false`. Client validation checks content and size;
it is not server authorization. A caller may use the Storage API directly.

This disagrees with the project visibility contract exposed by OrgMembers:
with no default project role, members see only explicitly assigned projects.
The actual `user_has_project_access` helper also excludes archived projects.
Neither condition appears in the app-files predicates.

## Reproduced defects and limits

A disposable local PGlite probe used synthetic UUIDs only, the current Storage
predicates, and the production definitions of `user_is_org_member`,
`user_has_project_access`, `get_my_project_role` and
`user_has_project_role_at_least`. No hosted mutations occurred.
The probe modeled satisfied MFA; it does not establish hosted factor enrollment
or Storage service behavior.

1. With organization membership, NULL default project role and no project grant,
   `user_has_project_access(project)` is false while Storage SELECT and INSERT
   succeed under the organization's uploads prefix.
2. An explicit project viewer fails `user_has_project_role_at_least(project,
   'field')`, yet can UPDATE an object they own. The Storage service requires
   INSERT, SELECT and UPDATE for upsert; these policies make that possible for
   an owner who still belongs to the workspace. The app's `upsert: false` is not
   a server restriction. [Supabase access-control documentation](https://supabase.com/docs/guides/storage/security/access-control).
3. Removing the explicit project grant while retaining organization membership
   makes project access false but still permits a named DELETE of the owned
   synthetic object. Downgrades and project archive likewise do not occur in
   the Storage authorization predicate.
4. Removing organization membership makes SELECT fail closed; the named
   UPDATE/DELETE probes then affect zero rows. A cross-organization rename also
   failed RLS in the local probe. Owner-only policies therefore are not, by
   themselves, proof of a post-organization-revocation Storage API bypass.

The local probe proves policy semantics, not hosted Storage byte replacement or
an end-to-end exploit. A future acceptance harness must use actual synthetic
Storage objects and authenticated requests, never customer documents.

The drawing revision manifest detects changed/missing Storage metadata and
invalidates approval coverage. It does not preserve immutable PDF bytes. This
proposal does not reinterpret any existing PM attestation or approval.

## Aggregate compatibility census

| Observation | Count |
| --- | ---: |
| app-files objects | 2,389 |
| Organization-prefixed uploads | 1,614 |
| Retained flat `uploads/` objects | 775 |
| Retained flat objects with an organization-prefixed copy | 775 |
| Organization-prefixed objects without an existing organization | 0 |
| Organization-prefixed objects whose owner is no longer an org member | 0 |
| Known scalar project file references | 815 |
| Organization-prefixed references, all matching existing objects and project org | 651 |
| Distinct existing objects represented by those references | 191 |
| Existing mapped objects referenced from multiple projects | 0 |
| Legacy flat references in surveyed scalar columns | 0 |
| Nonempty profile-avatar or change-order attachment-text references | 0 |
| Organization-prefixed objects outside surveyed scalar project references | 1,423 |
| HTTP references, separately classified | 160 |
| Other nonempty reference formats | 4 |

The 1,423 objects are **unclassified**, not proven orphaned. JSON, older
workflows, unattached uploads, retained copies and sibling consumers require
review. Do not delete them, rewrite their paths, infer a project from their
owner, or grant them to every project in an organization. The 160 HTTP and four
other references are not evidence of missing project PDFs.

Surveyed project columns: drawings file/thumbnail; drawing_sets file;
drawing_revisions file; drawing_analyses file/storage path; drawing_signoffs
signature; submittals file; submittal_rounds file/markup; sheet-response markup;
documents/photos file; expense receipt; model_registry file/cloud; scope_items
file/storage path; mitigation proof; delivery shipping-ticket path/URL;
uploaded_files file; GC drawings file/thumbnail and GC sets file. This is not
an exhaustive census of every JSON value in the database.

## Related source defects

`supabase/functions/project-export/index.ts:listProjectStorageFiles` walks
`<project>` and `<org>/<project>`. Those roots do not include canonical
`<org>/uploads/...` objects. Its best-effort app-files manifest therefore omits
the canonical uploads even though exported database rows can contain their
references. Use authoritative object bindings for the manifest, not a wider
organization listing that could disclose another project's files.

`src/hooks/useResolvedFileUrl.js` has a module-level cache keyed only by path,
with no expiry, identity or workspace invalidation. `storage.ts` signs URLs for
3,600 seconds. The cache can reuse a previous identity's still-live URL or keep
an expired URL indefinitely. Tightening RLS cannot retract previously issued
bearer links. Supabase documents that signed URLs use a separate internal key
and remain valid until expiry; Auth key rotation does not revoke them.
[Supabase signed-URL documentation](https://supabase.com/docs/guides/storage/serving/downloads).

## Proposed contract for independent review

- Introduce a private, server-owned object binding keyed by bucket and exact
  path, recording organization, explicit scope, project where applicable,
  reserving actor, workflow and creation request ID. Clients cannot insert,
  change or forge bindings through authenticated or ordinary application
  service-role access. Reviewed operator maintenance remains a privileged
  boundary, not a capability this policy can constrain. No caller-controlled
  GUC bypass.
- New project uploads use a server-reserved path below
  `<org>/uploads/<project>/<opaque-id>.<extension>`. This retains the current
  manifest's `<org>/uploads/%.pdf` shape. Reservation and every Storage request
  require current project access and enrolled-MFA satisfaction. Drawings and
  model workflows require PM; documents, photos, imports and other attachments
  require at least field. Parent entity writes retain their stricter rules.
  New entity attachments must match the binding's project/scope. Adopting a
  generic upload as a drawing/model source must atomically raise its write-role
  floor; choosing a weaker upload workflow cannot preserve weaker mutation
  rights after adoption.
- Nonproject organization branding is an explicit scope: current organization
  members read, organization admins/owners write. User avatars are a separate
  explicit workspace scope: current members in that workspace read; only the
  avatar's subject uploads. Do not manufacture project bindings for either.
  These are proposed semantics, requiring review before enabling a new producer.
- Materialize legacy project bindings from a reviewed, exact reference map.
  Paths in application records are user-supplied data, not authorization: do
  not implement a permissive runtime join that lets a new forged file_url grant
  access to an existing object. Mapping must not rewrite captured evidence,
  rename/move objects, or alter customer approvals.
- Unclassified objects are a release decision, not an automatic backfill. Keep
  their bytes and record counts; block the policy cutover until classification
  or an explicitly reviewed treatment exists. Do not leave a permanent broad
  org-member fallback and call the project boundary fixed.
- Replacement/deletion require current org/project authority plus ownership;
  no direct replacement, rename or deletion of any object referenced by captured
  revision evidence. Existing authorized project/workspace erasure remains a
  separately reviewed retention path. No automatic cleanup of captured sources.
- Policy changes target app-files only. Keep other buckets and their policies,
  private bytes, enrolled-MFA rule and service-maintenance contracts unchanged.
- Clear signed-link cache on identity/workspace generation changes, scope cache
  entries to that identity, enforce expiry and discard late responses. Retain
  the 3,600-second server TTL initially and disclose its bounded revocation
  window; immediate revocation requires an authenticated delivery path and is
  not solved by cache clearing alone.

Implementation and acceptance steps are in
[the separate plan](../superpowers/plans/2026-10-09-app-files-project-boundary.md).
This audit establishes neither a deployed fix nor enterprise readiness.
