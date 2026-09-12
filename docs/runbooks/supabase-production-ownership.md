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

## Current reconciliation blockers

The two evidence-backed Rev.2 Planner migrations are restored in active
inventory as `20260802090000_planner_action_control.sql` and
`20260802090500_planner_offline_idempotency.sql`. Their contents remain
byte-identical to git objects `8e3aab6595bcc97575c2667e0dd8e3c045e9f2ef` and
`26216f3247b0cc63dc0ff03e7f756b0f64c9b762`, respectively.

The manifest intentionally remains red for these three source/lineage gaps:

- `20260906040515` (`fix_alerts_superseded_status`): production
  `generate_operational_alerts` is byte-identical to active Rev.2
  `20260819002000` (SHA-256
  `d6da4d5d559bfca074cbcd0228e484d2155e0c7b26682f8e7fc7a551b40d8280`),
  so the stamp has no surviving distinct function-body effect and is an
  overwritten/orphan candidate. Exact SQL and authoritative ownership remain
  unresolved, so migration-history repair is not safe.
- `20260910034739` (`hard_delete_records`): ledger order places it in the
  SteelBuild-Pro-2026 sequence. Its isolated live footprint is six
  `hard_delete_*` functions plus `data_erasure_log` record metadata changes,
  none present in the 38 accessible sibling migrations; exact source is absent.
- `20260910044641` (`m30_scope_items`): ledger order places it in the
  SteelBuild-Pro-2026 sequence. Its isolated live footprint is six
  `scope_items` columns, four functions, two foreign keys, two checks, three
  indexes, two triggers, and replacement field/access RLS, none present in the
  Rev.2 baseline or 38 accessible sibling migrations; exact source is absent.

The two Rev.2 apply-time restamps `20260817072554` and `20260817083550` are
explicitly frozen and point to their active canonical migration sources in the
manifest. They are not templates for creating future restamps.
