# Drawing Control release candidate — 2026-10-07

## Scope and user outcome

The project drawing workflow is organized into four work areas: Action Queue,
Shop Drawings, GC Issuances, and Approvals. Existing specialist views and URLs
remain available from More tools. The selected shop sheet shows revision and
approval evidence separately from fabrication release. The intake handoff
requires a reviewed source choice and explicit save, with ambiguous sheet
matches left for a human to resolve. These changes serve steel fabricators and
erectors who must identify a current sheet, the party holding approval, and the
next permitted action without treating a distributed revision as shop release.

The frontend can be reviewed independently. It does not depend on applying the
SQL below merely to render, but it must not claim the backend fabrication gate
is aligned until the migration is actually applied and validated.

## Exact staging database candidate

| Asset | SHA-256 | Intended change |
| --- | --- | --- |
| `supabase/migrations/20261008013546_align_drawing_set_governing_submittal.sql` | `c4f4a86dda10c0965fd099e48d2b4c2af64c04fbf2b99392105103d3e1a1476a` | Replace `public.evaluate_fab_release_set(uuid, uuid)` so its governing submittal selection and approval-stage mapping agree with the client selector; block missing/current-undistributed revisions, pending-review sets, and absent or mismatched current-revision signoffs when the project opts in. |
| `supabase/migrations/20261008021100_inherit_drawing_set_links_on_lot_split.sql` | `70e55b0f4075f872df66d8a9016c3fa1cb7444d12b1987185e45134d1751b140` | Replace only the `split_piece_lot(uuid, uuid, jsonb)` wrapper so new actionable children inherit the parent's exact drawing-set links in the same transaction. |
| `supabase/migrations/20261008022100_serialize_piece_drawing_set_links.sql` | `4494ece435afe5b65c823faf3ff7ac75dcee113a342c74cbde64d64e8ac45a50` | Lock the target piece in the link and unlink RPCs before validation, refuse explicit containers even without active children, and add atomic `replace_piece_drawing_set` for an exclusive assignment. |
| `supabase/migrations/20261008023000_gc_issuance_shop_set_impact_links.sql` | `55672c0e4bb545fcdb7643f16bb7e1a3002ed429328819cb8641bed22b831198` | Add an exact GC issuance-to-shop drawing-set impact relation with project-locked foreign keys, project-scoped RLS, audited PM-only replacement, and a guard against contradictory no-impact dispositions. |
| `supabase/migrations/20261008041759_enforce_complete_fab_release_set_gate.sql` | `3c6f690ddde03e55618752456144dd04cbc1b3eca9254784bd9e030f505f5182` | Add full drawing-set blockers to package preflight, make piece approval honor the set's `ok` result, and re-evaluate complete active sibling membership and rejected-sheet status inside the `fab_release_log` insert trigger; preserve explicit audited PM override. |

The function still rejects a caller without project access, refuses a set
outside that project, checks active sheet holds and open RFIs, and blocks missing
or superseded PDFs. It now considers only live **Shop Drawing** submittals
explicitly linked by `drawing_set_ids`, prefers submitted rounds over an unsent
draft, and keeps an unknown ball-in-court at BFA rather than inferring IFC.
Product Data, Sample, and legacy NULL-type records cannot authorize a shop
set; they need review and classification. Timestamp-deleted sets and sheets,
cross-project sheet references, and blank PDF paths are excluded or blocked.
Name-only historical matches remain visible in the UI for cleanup but have no
approval authority. Its `drawing-shop-v2` marker lets the new sheet panel refuse
an older, clear-looking gate response before the migration is deployed.
New current revisions at `received` or another undistributed state and a set
marked `pending_review` now block an older IFC/Released submittal. Missing
active current revisions also block, as do missing or cross-sheet
fabrication signoffs when `require_fab_signoffs` is enabled for the project. This is a
defense-in-depth rule, not exact revision provenance: if a revision is later
distributed and the pending marker cleared, the previous submittal can still
govern. Production rollout of the revised release gate requires an immutable
round-to-current-revision manifest and a reviewed legacy reconciliation path.
The shared `submittal_derived_stage` helper remains unchanged.
The lot-split wrapper preserves the existing underlying command, its return
shape, authorization, failure journal, and grants. A malformed child result or
stale cross-project parent link rolls the split back. Existing child lots are
not automatically relinked: their relationships may have been deliberately
changed, so an operator must review those through Piece Register.
The relationship RPCs serialize with the split by locking the same piece row.
If a link wins the lock, the split copies it to the returned children; if the
split wins, a later link or replacement rejects the now-container parent.
Unlinking the historical parent after a split leaves child links independent.
An explicit `is_container` parent remains ineligible after its children are
archived; otherwise a new parent-only link would be invisible to actionable
leaf-lot rollups.
The new replacement RPC validates the target and all existing link projects,
then adds the target, removes other links, and records each change in one
transaction. This replaces **drawing-set links only**: historical
`piece_drawings` sheet links remain independent and may still affect legacy
release decisions. Direct service-role table writes do not share this RPC lock.
The fourth migration keeps GC-issued documents in their own namespace. A
matching sheet number never links a GC issuance to a shop set. The new mapping
is advisory impact context only; it cannot approve a submittal or authorize
fabrication. Composite project foreign keys reject cross-project links, RLS
permits project-scoped reads, and authenticated browser users have no direct
table-write grant. Only a PM-authorized RPC can replace the exact selected set
IDs and records the before/after selection. An existing GC issuance cannot be
marked `none` while affected shop sets remain linked. New composite unique
indexes on the parent tables take brief write-blocking locks during the
transactional migration; rehearse their duration on staging.
The fifth migration closes the independent package/log route that previously
read only `governing_stage` or the browser's filtered drawing IDs. Its public
package evaluator now returns whole-set blockers; a normal log insert must
include all active sheets from the selected sets and rechecks each set in the
insert transaction. A PM's nonblank audited override may deliberately release
a subset or blocked set, but it cannot include missing or foreign-project IDs.
The insert retains the original rejected/revise-and-resubmit sheet-status
guard over all active siblings. It stores blocking set-level RFI numbers even for an override. The
transactional recheck closes the client preflight-to-insert gap, but local
single-session tests do not establish serializable behavior against a writer
changing a hold, RFI, submittal, or revision concurrently; staging must test
that race before a hosted release claim.

These five exact migrations have **not been applied or stamped** to staging or
production. Prior approvals for other backend candidates do not cover these
bytes. Under `docs/runbooks/reviewed-backend-release.md`, approval is required
for named database changes before application. The safe path is to review the
committed file, pass CI for its exact commit, rehearse the SQL and authenticated
steel scenarios on staging, then apply and stamp the exact filename and payload
in one transaction as described in `CLAUDE.md`. Do not use `supabase db push`,
MCP `apply_migration`, or a migration-repair command.

The separate `supabase/migrations_quarantine/20261008032840_transactional_reviewed_shop_drawing_revision.sql`
is **intentionally frozen**, unapplied and unwired. It is outside the executable
migration directory so a branch runner cannot replay it. Its exact candidate and
prerequisites are recorded in
`docs/audits/DRAWING_REVISION_ATOMIC_CANDIDATE_2026-10-08.md`. It is outside
this five-migration staging candidate.

Read-only preflight on the persistent staging branch `ndyfjffsulfbwpmwdmic`
found the required drawing and GC tables/columns and none of the original four
versions in its migration ledger. The branch preview reported
`ACTIVE_HEALTHY`, while its migration runner reported `MIGRATIONS_FAILED`;
that runner status must be diagnosed before a hosted acceptance claim. No
staging SQL was changed during this preflight. The fifth version was added
after that read-only preflight and likewise has not been applied or stamped.

This persistent branch belongs to the existing shared Supabase lineage. It can
rehearse compatibility and authenticated behavior for this candidate, but it is
not the separate database now scoped for the rebuilt application. A green
rehearsal here would not replace a reviewed bootstrap, schema parity, and
release acceptance on that new target. Do not connect automatic Git migration
replay to the manually recovered staging branch.

## Acceptance and evidence

- The local PGlite function-body regression is reproducible with `npm ci && npm
  test` under `supabase/tests/drawing-governing`. It exercises actual SQL return
  values for draft versus submitted, received current revision, pending review,
  hold/clear, RFI/answered, unknown BIC,
  missing exact link, non-shop and untyped linked approvals, missing/blank PDF,
  timestamp deletion, a cross-project sheet reference, and foreign-project
  denial. A second runtime check covers two-set inheritance onto child lots,
  independent unlinking after split, malformed inputs, atomic failure, no
  historical backfill, and a stale cross-project link. A third runtime check
  covers link, unlink, exclusive replacement, idempotence, cross-project
  refusal, audit events, and rollback when audit insertion fails. A fourth
  check covers GC-to-shop impact mapping, direct DML refusal, authenticated
  project read isolation, cross-project denial, audit events, and the
  no-impact guard. A fifth check covers complete sibling membership, the
  package RPC, direct release-log inserts, holds, newly received revisions,
  opt-in signoffs, set-level RFIs, and the explicit override path. PGlite is
  single-session and uses stubs for the underlying split command and linked-RFI
  helper; it does not establish hosted RLS or two-session concurrency behavior.
- Focused Vitest checks cover work-area navigation, old deep links, a
  project-scoped GC issuance read beyond 1,000 rows, reviewed intake handoff,
  explicit set-link approval, and client drawing health/release semantics.
- Repository-wide lint, TypeScript, both strict type ratchets, the no-new-JS
  and React hooks gates, and production build passed on the candidate tree.
  The full Vitest run passed **8,149 tests across 838 files**. The five
  PGlite drawing-governing scripts and the quarantined revision harness also
  passed locally. This is source and single-session SQL evidence, not hosted
  authorization or concurrency acceptance.
- Hosted acceptance remains required: with real authenticated project roles,
  revise a linked S-sheet, place a hold, open an RFI, and confirm the gate and
  every drawing/piece/work-package surface show the blocker and next action.
  Clear the hold and answer the RFI; confirm the same surfaces agree again.
  Validate Product Data and NULL-type refusal, foreign-project denial, a
  two-session split/link race, two sets with the same sheet number, a
  >1,000-sheet register, narrow layouts, and an interrupted PDF intake. For
  the GC mapping, confirm PM-only replacement, project-scoped reads, the
  no-impact guard, and the parent-index lock duration on staging.

Local Chromium snapshots of the public landing page at desktop and narrow
width confirm the restored badge remains legible and uncropped. A separate
in-app browser tab also loaded the authenticated Drawing Control workbench
for a real project in read-only desktop review: the four work areas, selected
sheet, contextual evidence panel, and fail-closed unavailable server gate
rendered. The local browser showed a generic data-load toast whose source
has not yet been isolated. No project records were changed during this review;
field-sized layout and the hosted blocker/clearance scenarios remain unverified.

## Boundaries

Approval, revision distribution, and fabrication release remain distinct
records. The selected sheet's server gate describes its **drawing set**; it
does not authorize a work package or prove all material, schedule, QA, or
field conditions are met. This candidate is a drawing-workflow slice, not a
claim that the entire SteelBuild Pro application is production-ready. The
previously proposed voice, document, scheduling, and visual AI extensions are
separate workstreams and require their own human review and release evidence.
