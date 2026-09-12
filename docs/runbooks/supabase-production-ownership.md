# Shared Supabase production ownership

SteelBuild-Pro-Rev.2, SteelBuild-Pro-2026, and steelbuild-sheets-web share the
production Supabase project `kjrwqagyeswwoxpjkcko`. Repository presence is not
therefore the same as production ownership.

The reviewed inventory contract is
[`supabase/production-ownership-manifest.json`](../../supabase/production-ownership-manifest.json).
Rev.2 migrations and functions are classified from their active source
directories using the manifest's local defaults and function overrides.
Production-only assets are listed individually with an owning repository,
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

1. Identify the authoritative source repository and exact source path or commit
   object. Do not infer ownership from a similar table or function name.
2. Add or update the entry with evidence and the narrowest accurate lifecycle.
3. Keep active Rev.2 assets in `supabase/migrations/` or
   `supabase/functions/<slug>/`; do not duplicate them in the external lists.
4. Run `npx vitest run scripts/__tests__/supabaseDrift.test.mjs`, lint, and the
   no-new-JavaScript gate.
5. Review production only through the read-only Management API check. Never
   repair migration history or deploy/delete functions merely to make inventory
   green.

## Current reconciliation blockers

The manifest intentionally remains red for these source/lineage gaps:

- `20260802090000` (`planner_action_control`): exact Rev.2 SQL survives as git
  object `8e3aab6595bcc97575c2667e0dd8e3c045e9f2ef`, but is absent from active
  replay migrations.
- `20260802090500` (`planner_offline_idempotency`): exact Rev.2 SQL survives as
  git object `26216f3247b0cc63dc0ff03e7f756b0f64c9b762`, but is absent from active
  replay migrations.
- `20260906040515` (`fix_alerts_superseded_status`): exact SQL and authoritative
  owner are unresolved.
- `20260910034739` (`hard_delete_records`): ledger order places it in the
  SteelBuild-Pro-2026 sequence, but exact source is absent.
- `20260910044641` (`m30_scope_items`): ledger order places it in the
  SteelBuild-Pro-2026 sequence, but exact source is absent.

The two Rev.2 apply-time restamps `20260817072554` and `20260817083550` are
explicitly frozen and point to their active canonical migration sources in the
manifest. They are not templates for creating future restamps.
