# Shared Supabase production ownership

SteelBuild-Pro-Rev.2, SteelBuild-Pro-2026, and steelbuild-sheets-web share the
production Supabase project `kjrwqagyeswwoxpjkcko`. Repository presence is not
therefore the same as production ownership.

The reviewed inventory contract is
[`supabase/production-ownership-manifest.json`](../../supabase/production-ownership-manifest.json).
Rev.2 migrations and functions are classified from their active source
directories using the manifest's local defaults and function overrides.
Production-only assets are listed individually with an owning repository or
explicit shared-production provenance when repository authorship is unproven,
lifecycle, and evidence. An identifier with uncertain source or lineage is
recorded as `unresolved`; it is never silently allowlisted.

## Lifecycle contract

| Lifecycle | Production behavior |
|---|---|
| `required` | Must be present. Absence fails the check. |
| `staging-only` | Must be absent from production. Presence fails the check. |
| `intentionally-frozen` | Presence or absence is accepted, but inventory green does not authorize deployment or source changes. |
| `deprecated` | Must be absent from production. Presence fails the check. |
| `unresolved` | Always fails until reviewed source and lineage are restored. |

`npm run supabase:drift` also fails on remote migration versions or function
slugs absent from both active Rev.2 inventory and the manifest. Malformed or
duplicate local, manifest, or remote entries fail closed. Missing credentials,
project-ref mismatch, HTTP failures, and malformed API responses also fail.

**A green inventory check proves only migration-version and Edge Function-slug
membership.** It does not compare SQL bodies, migration replay behavior,
deployed function source, JWT settings, secrets, or other function
configuration.

## Updating the manifest

### sheets-api retirement

On 2026-09-21 the owner confirmed that `sheets-api` was intentionally retired
and requested this inventory update. Read-only production inventory verified
its removal. The old `required` entry then blocked the approved titleblock
frontend release (#462) with `missingFunctions: ["sheets-api"]`.

The function is now `deprecated`: absence passes, while any reappearance fails
the same drift gate. Historical ownership remains `lorteezy87/steelbuild-sheets-web`.
This change does not deploy or delete a function, change database grants or
migration history, or exempt other shared assets from checking.

### Review procedure

1. Identify the authoritative source repository and exact source path or commit
   object. For an original recovered from the authenticated production ledger,
   preserve exact SQL and hashes outside active migrations and name shared
   production as the source when repository authorship is unproven. Do not infer
   ownership from a similar table or function name.
2. Add or update the entry with evidence and the narrowest accurate lifecycle.
3. Keep active Rev.2 assets in `supabase/migrations/` or
   `supabase/functions/<slug>/`; do not duplicate them in the external lists.
4. Run `npx vitest run scripts/__tests__/supabaseDrift.test.mjs`, lint, and the
   no-new-JavaScript gate.
5. Review production only through the read-only Management API check. Never
   repair migration history or deploy/delete functions merely to make inventory
   green.

## Reconciliation rehearsal

Save a read-only Management API inventory as JSON with `projectRef`,
`migrations` (`version` strings), and `functions` (`slug` strings), then run:

```bash
npm run supabase:reconcile:plan -- /absolute/path/to/saved-inventory.json
```

The planner performs no network requests and cannot execute migration repairs,
schema changes, function deploys, or deletes. It exits nonzero when the
inventory has blockers or proposed changes and prints only review categories:
required migrations/functions missing from the environment, prohibited
deprecated/staging-only functions, unknown remote assets, and unresolved
lineage. Use saved evidence from the intended disposable environment first.
Never feed a generated action list directly to a shell.

Use the manual
[`supabase-retire-deprecated.yml`](../../.github/workflows/supabase-retire-deprecated.yml)
workflow on `main` for the five reviewed versions: `bluebeam-proxy` 24,
`schedule-assistant` 33, `sharepoint-proxy` 27, `stripe-setup` 11, and
`stripe-worker` 11. Run its default dry run first, inspect the source-backup
artifact, then run with `apply=true`. The workflow verifies the fixed project,
current inventory, exact versions, complete downloaded local dependencies, and
backup hashes. A successful artifact upload is required before deletion. Each
delete checks that every untargeted function remains unchanged.

The legacy `supabase:delete-deprecated-fns` helper remains useful for dry-run
inventory, but its apply path is blocked while `stripe-webhook` is held.
Cached Stripe metadata lists enabled endpoints targeting that function; current
Stripe endpoint status must be verified separately. Both `stripe-webhook` and
the active `stripe-billing` are excluded from the five-function workflow.
`stripe-webhook` stays deprecated in the manifest, so its unresolved retirement
continues to fail drift rather than silently becoming acceptable.

Never invoke `stripe-setup`'s uninstall action: it drops shared Stripe schema
and secrets. Retirement deletes only the reviewed Edge Function deployments.
Backups include source and inventory metadata, not secret values or an offline
mirror of remote imports. Download the workflow artifact for durable retention
before its 30-day expiration; restoration must preserve the recorded entrypoint
and JWT configuration.

## Recovered lineage and remaining reconciliation gates

The two evidence-backed Rev.2 Planner migrations are restored in active
inventory as `20260802090000_planner_action_control.sql` and
`20260802090500_planner_offline_idempotency.sql`. Their contents remain
byte-identical to git objects `8e3aab6595bcc97575c2667e0dd8e3c045e9f2ef` and
`26216f3247b0cc63dc0ff03e7f756b0f64c9b762`, respectively.

On 2026-09-13, authenticated read-only queries recovered the original SQL for
the three previously unresolved migrations from
`supabase_migrations.schema_migrations.statements`. Exact UTF-8 bytes, SHA-256
hashes, server MD5 values and current function/schema comparisons are preserved
in [`supabase/migrations_external`](../../supabase/migrations_external/README.md),
outside the active migration directory.

- `20260909090445` is a frozen historical alias: its recovered reset SQL equals
  sibling `20260909090000_m19_reset_org_data.sql` except one final newline.
  Current production matches the later Rev.2 `20260912052502` replacement.
  Do not rerun the old reset body or rewrite either stamp.
- `20260910034739` (`hard_delete_records`) is required. All six recovered
  function bodies and its `data_erasure_log` columns, checks and index match
  production.
- `20260910044641` (`m30_scope_items`) is required. All four recovered function
  bodies and its columns, constraints, indexes, triggers, RLS and grants match
  production. Do not rerun its row backfill or number-sequence updates.

The latter two entries name shared-production provenance: their original
author, repository and commit remain unproven. This does not prevent preserving
the exact applied source. No SQL replay or ledger mutation accompanies these
classifications; disposable replay and review remain separate prerequisites for
any bookkeeping repair.

Recovered Rev.2 lineage now includes
`20260906040515_fix_alerts_superseded_status.sql`. The original
`apply_migration` payload was recovered from local Claude `tool_use` line 1775
and committed byte-identically: 4,899 bytes, SHA-256
`f1c7c1b81c6cd0a451b1e896ab9f2e9ebc120704f21699c80a5d723caaaf3358`.
Its `escalate_rfi_sla` and `notify_rfi_bic_handoff` bodies were independently
matched to production at SHA-256
`0ef63f248c1d8aaa4559c192e58b5f7aae65f4c58a6e3bc887d0604f6d36c2b0`
and `30143ad37ed0f2bbf8bc066d13ced9643b6b41c1de284d55aa2ee03578b2a959`.
Bookkeeping repair remains gated on disposable replay, second review, and a
maintenance window.

Two remote restamps are now evidence-backed and intentionally frozen:

- `20260909062016` maps to sibling
  `20260909060000_m3_7_auto_archive_empty_drawing_sets.sql`, unchanged since
  commit `a8560ab5447a0b8d564f9a7264d24b528a954076`. Its normalized
  `recount_drawing_set` body matches production at SHA-256
  `d49a40cfddda1e84f47bfd8cc3346ceae37b593b9cc9a141bdc9034da5c5a54a`.
- `20260909073500` maps to sibling
  `20260909060100_m2_1_scope_project_number_uniqueness_to_org.sql`, unchanged
  since commit `1222ad55b073fcfefeae7788fb03d230af5afb3c`. Production has the
  semantically identical unique partial index, and source commentary records
  the live MCP apply.

These classifications remove false-positive unknown drift while preserving the
repair gate: neither restamp may be rewritten until disposable replay and
two-reviewer maintenance approval succeed.

## Authenticated drift snapshot

The CI run against commit `bb5dc6c41` on 2026-09-12 authenticated successfully
and failed closed as designed. It reported:

- 42 active local migration versions absent from the production ledger;
- three remote restamps as unknown before follow-up evidence classified two as
  frozen historical aliases and retained `20260909090445` as unresolved;
- the two source-absent SteelBuild-Pro-2026 migrations above; and
- six deployed deprecated functions: `bluebeam-proxy`, `schedule-assistant`,
  `sharepoint-proxy`, `stripe-setup`, `stripe-webhook`, and `stripe-worker`.

The 42 missing ledger versions do not by themselves distinguish unapplied SQL
from already-present schema with missing bookkeeping. Resolve that distinction
through disposable replay and reviewed live-schema evidence before proposing
`migration repair` or applying SQL.

The two Rev.2 apply-time restamps `20260817072554` and `20260817083550` are
explicitly frozen and point to their active canonical migration sources in the
manifest. They are not templates for creating future restamps.
