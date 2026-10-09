# Production database release candidate — October 9, 2026

## Decision and release boundary

This is the exact database candidate required to clear the current production
drift gate for consolidated [PR #539](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/pull/539).
It targets only production Supabase project `kjrwqagyeswwoxpjkcko`. It does not
authorize or perform an Edge Function deployment, Cloudflare publication,
provider-side billing change, customer data rewrite, account erasure or project
deletion.

All nine original SQL blobs are committed before application, installed on the
persistent staging project, and byte-for-byte verified against the staging
ledger on October 9. Read-only production preflight on October 9 confirmed all
nine stamps absent. Apply only these exact files, in the order below, during a
bounded maintenance window. Store every unmodified original blob in
`supabase_migrations.schema_migrations.statements[1]` under its existing
14-digit filename version. Never use `supabase db push`, migration repair,
branch merge or MCP `apply_migration` against this shared production project.

## Exact ordered payloads

| Order | Version and committed file | SHA-256 | Production outcome |
| ---: | --- | --- | --- |
| 1 | `20261008013546_align_drawing_set_governing_submittal.sql` | `c4f4a86dda10c0965fd099e48d2b4c2af64c04fbf2b99392105103d3e1a1476a` | Align the server fabrication gate with exact Shop Drawing package selection and fail closed on missing, stale or pending revision evidence. |
| 2 | `20261008021100_inherit_drawing_set_links_on_lot_split.sql` | `70e55b0f4075f872df66d8a9016c3fa1cb7444d12b1987185e45134d1751b140` | Copy exact drawing-set links to newly split actionable piece lots in the split transaction. |
| 3 | `20261008022100_serialize_piece_drawing_set_links.sql` | `4494ece435afe5b65c823faf3ff7ac75dcee113a342c74cbde64d64e8ac45a50` | Serialize link/unlink/replace operations on the piece row and refuse containers. |
| 4 | `20261008023000_gc_issuance_shop_set_impact_links.sql` | `55672c0e4bb545fcdb7643f16bb7e1a3002ed429328819cb8641bed22b831198` | Add project-locked, audited GC-issuance impact links that never grant approval or fabrication authority. |
| 5 | `20261008032524_require_current_workspace_membership_for_project_roles.sql` | `281a52c5d64136f81cf30e37240990f575eb2cea920398511d7e08b524984dbf` | Require current workspace membership in all explicit project-role resolvers. |
| 6 | `20261008041759_enforce_complete_fab_release_set_gate.sql` | `3c6f690ddde03e55618752456144dd04cbc1b3eca9254784bd9e030f505f5182` | Re-evaluate complete active set membership, blockers and rejected sheets inside release logging; retain only explicit audited PM override. |
| 7 | `20261009070300_submittal_round_revision_evidence.sql` | `b4b77581e51a0c61ee63d47fa34d1010a123bb1759bee6889e0ca0ec719b0ea7` | Add immutable exact-revision manifests plus atomic, MFA-gated Shop Drawing round workflow commands. |
| 8 | `20261009125901_durable_workspace_checkout_intents.sql` | `ba0d72e62e8df02777f53d653593d7d9f41811798e0cfb0d551e367ce034eebb` | Add private, service-only, organization-locked Stripe checkout intent fencing. |
| 9 | `20261009140000_enforce_project_plan_limits.sql` | `b22297e7d1c6fd1f3e2f5ae1af080695a28404cf450c563085a73754743f0311` | Enforce project plan capacity for direct inserts, RPC creation, restoration and workspace reassignment. |

## Verified preflight and acceptance evidence

Read-only production inspection immediately before this candidate was written
found zero of the nine ledger versions, zero transactions older than 60 seconds,
and the required atomic-billing prerequisite `20261008071019` present. The new
GC impact table, revision-evidence table, checkout-intent table and atomic
piece/set replacement function were absent, as required. Relevant production
relations remain small: drawings 3.74 MB, pieces 2.43 MB, drawing revisions
0.65 MB, piece/set links 0.59 MB, submittals 0.46 MB, and every other inspected
target below 0.33 MB. Recheck these facts at the maintenance window; this
snapshot is not permission to ignore a new lock or drift condition.

The staging ledger returned all nine hashes above from the stored original SQL
payloads. Installed-schema rollback suites passed 53 membership checks, 31
revision-evidence checks, 20 checkout checks and 18 project-capacity checks.
The Drawing Control candidates passed their focused governing-set, link,
inheritance and release-gate suites. Independent PostgreSQL CI covers the
revision, checkout and capacity races; consolidated exact-head CI must still
finish before production application.

The production impact inventory changed slightly since the earlier audit. It
now contains 23 active Shop Drawing packages: 10 Approved as Noted, 6 Released
for Fabrication, 3 Submitted, 2 Under Review and 2 Draft. Six approved/released
packages have no current round. Because production has no immutable manifest
table yet, all 21 non-Draft packages lack the new exact-revision evidence. The
candidate intentionally fails those packages closed until a PM reviews and
attests the exact legacy round or resubmits through the new workflow. Do not
bulk-attest, silently retype, auto-approve or infer evidence from status text.

## Bounded manual application

1. Require successful application, secret-scan, Edge typecheck and commercial
   PostgreSQL jobs for the exact candidate head. Keep `CLOUDFLARE_ENABLED=false`.
2. Recheck the nine absent stamps, prerequisite stamp, unexpected candidate
   objects, table sizes, active transactions and source SHA-256 values. Abort on
   any mismatch.
3. Capture the existing replaced function definitions, grants, triggers and
   relevant constraints for forward recovery. This is evidence, not a backup.
4. Take the repository's nonblocking migration advisory lock. Use bounded lock
   and statement timeouts. Apply the nine original payloads in the table order
   and insert their nine matching ledger rows in one transaction. Where an
   original file contains `BEGIN`/`COMMIT`, omit only that wrapper from execution
   inside the outer transaction; retain the complete unmodified file as the
   ledger payload.
5. Reload the PostgREST schema cache, then commit. Any hash, prerequisite,
   duplicate object, lock timeout, DDL, grant or ledger failure rolls back the
   entire transaction.
6. Read every stored ledger blob back and verify the nine SHA-256 values. Verify
   the new tables, RLS, grants, workflow guard, project-capacity trigger and
   replaced function definitions. Re-run the production drift gate.
7. Run non-destructive authenticated smoke checks. Begin the named PM legacy
   reconciliation queue before relying on a preexisting package for fabrication
   release. Database success alone does not release the frontend or functions.

After commit, rollback is forward recovery rather than ledger deletion. Restore
captured function definitions and remove only additive candidate objects through
a separately reviewed migration. Removing the evidence or capacity gates
reopens confirmed authorization, fabrication-control and monetization defects.

## Remaining release holds

Production publication remains held after this SQL candidate until the exact
merged source is redeployed to staging, the reviewed Edge bundles match source,
read-only Drawing Control and calculator acceptance pass, hosted MFA and
workspace behavior pass, and real Stripe test-mode checkout/provider behavior
is verified. `command-center-read` and billing configuration gaps must be
reported as configuration holds; they cannot be called passing tests. Only then
may the normal five-gate main workflow restore production publication and verify
`www.steelbuild-pro.com` serves the selected release asset.
