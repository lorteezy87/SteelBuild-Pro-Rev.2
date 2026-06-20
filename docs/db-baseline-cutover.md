# DB baseline cutover — squash to a replayable schema (P0 #2)

**Goal:** make `supabase/migrations/` bootstrap a database **from zero** again, so
fresh Supabase branches, `supabase db reset`, and migration CI all work. Today they
don't.

**Status (2026-06-20):** scaffolding authored (this doc + `supabase/baseline/*`);
the schema dump, the prod reconciliation, and the branch verification are **gated on
the owner** (DB password, branch cost, a prod bookkeeping write). NOT yet executed.

---

## Why it's broken (verified)

- `supabase/migrations/` has **190 files** (97 legacy numbered `001`–`086` incl. the
  CLI-skipped `025b`/`025c`, + 93 timestamped).
- The repo filenames and the remote `schema_migrations` versions are **almost
  entirely disjoint**: legacy `001`–`086` are local-only; ~89 remote rows (earliest
  `20260406135316` = "003") are remote-only with apply-time version strings and no
  matching repo file; only the `20260516001543`–`20260516072725` block aligns.
- **Root cause:** migrations are applied to prod via MCP `apply_migration` / the SQL
  editor, which stamp their **own apply-time version** into `schema_migrations`
  instead of the on-disk filename timestamp. So `db push` would try to re-apply ~180
  "missing" migrations, and `db reset`/branch replay fail (the numbered files are
  incremental `ADD COLUMN IF NOT EXISTS` patches assuming prior state).
- Extra replay blockers, all handled by the baseline scaffolding:
  - extensions live in the `extensions` schema the dump excludes → `supabase/baseline/20260101000000_baseline_extensions.sql`;
  - the `app-files` storage bucket was created by hand (in no migration) → seeded in `supabase/baseline/20260101000020_baseline_seed.sql`;
  - `storage.buckets` rows + pg_cron jobs are data the schema dump omits → same seed file;
  - no `supabase/config.toml` exists yet → STEP 4.

---

## The squashed baseline (3 ordered migrations, timestamped before everything)

All three sort **before** the earliest remote version (`20260406135316`), so they
become the replay floor:

| Order | File | Who authors | State |
|---|---|---|---|
| 1/3 extensions | `20260101000000_baseline_extensions.sql` | engineer | ✅ authored (`supabase/baseline/`) |
| 2/3 schema | `20260101000010_baseline_schema.sql` | **owner** (dump) | ⬜ STEP 1 |
| 3/3 seed (buckets + cron) | `20260101000020_baseline_seed.sql` | engineer | ✅ authored (`supabase/baseline/`) |

---

## ⚠️ The one rule

**NEVER run `supabase db reset` (or point any reset/branch tooling) at prod
`kjrwqagyeswwoxpjkcko`.** `db reset` DROPS AND REBUILDS the database — it would
destroy production data. The from-zero replay is verified on a **disposable branch
only** (STEP 5). `migration repair` (STEP 6) only rewrites the `schema_migrations`
bookkeeping table, never data.

---

## Pre-flight — migration FREEZE (owner-coordinated)

~10 agent sessions apply migrations to this shared checkout continuously. If new
migrations land mid-cutover the baseline is stale the moment it's built. Before
STEP 1:

1. Owner pauses other agent migration work for the cutover window.
2. Add a freeze row to `AGENT_CLAIMS.md` (area: `supabase/migrations/**`, intent:
   "MIGRATION FREEZE — baseline cutover, do not apply migrations"), commit + push it
   so concurrent sessions see it.
3. Lift the freeze only after STEP 6 verifies `migration list --linked` is clean.

---

## STEP 1 — dump the live schema (OWNER; read-only; needs DB password)

```powershell
npx supabase db dump --linked --schema public,storage -f supabase/baseline/20260101000010_baseline_schema.sql
# optional, for grants/roles review only (do NOT blindly apply role DDL on a branch):
npx supabase db dump --linked --role-only -f supabase/baseline/0000_roles.sql
```
`db dump` is read-only (it's `pg_dump --schema-only` under the hood). It needs the
remote DB password (CLI prompts, or set `$env:SUPABASE_DB_PASSWORD`). Commit the
resulting `20260101000010_baseline_schema.sql` (or hand it to the engineer).

## STEP 2 — review the dump (engineer)

- Sanity-diff the dump against the live catalog: MCP `list_tables` (verbose) +
  `get_advisors` — confirm every table, RLS policy, function, trigger, and index is
  present and no RLS got dropped.
- Confirm the dump does **not** silently include the legacy back-fill `UPDATE`s
  (schema-only should be clean DDL).
- The extensions (1/3) and buckets+cron (3/3) are already authored from live config
  (verified 2026-06-20). Adjust only if the dump diff surfaces something new.

## STEP 3 — archive the 190 legacy files + stage the baseline (engineer)

```powershell
# move (never delete) — stage explicit paths, never `git add -A`
git mv supabase/migrations/0*.sql supabase/migrations/2*.sql supabase/migrations_archive/
git mv supabase/baseline/20260101000000_baseline_extensions.sql supabase/migrations/
git mv supabase/baseline/20260101000010_baseline_schema.sql     supabase/migrations/
git mv supabase/baseline/20260101000020_baseline_seed.sql       supabase/migrations/
```
`migrations/` now contains exactly the 3 baseline files (+ any migration that genuinely
post-dates the dump and is already on prod — re-stamp those per STEP 7).

## STEP 4 — add `supabase/config.toml` (owner)

```powershell
npx supabase init        # creates supabase/config.toml (+ .gitignore/seed) if missing
# ensure it contains:  project_id = "kjrwqagyeswwoxpjkcko"
```
Required for `db reset` / branch tooling to run.

## STEP 5 — verify from-zero on a DISPOSABLE branch ONLY (owner; costs ~$0.01/hr)

Use the MCP, which applies the repo migrations from zero to a brand-new branch DB:

1. `confirm_cost` (branch) → get the cost id.
2. `create_branch` (name e.g. `baseline-verify`) with that cost id.
3. Confirm success: the branch's `schema_migrations` shows the 3 baseline versions and
   nothing else; spot-check that key tables + RLS policies exist (MCP `list_tables`,
   `execute_sql` against the branch). If pg_cron isn't enabled on the branch the seed
   logs a notice and skips the jobs (expected — see baseline 1/3 note).
4. `delete_branch` to tear it down.

A clean branch creation == the from-zero replay works. **Never** verify via `db reset`
against prod.

## STEP 6 — reconcile prod `schema_migrations` (OWNER; the one HIGH-risk prod write)

Rewrites only the bookkeeping table so prod doesn't try to re-apply or skip. Use the
purpose-built tool, NOT manual SQL:

```powershell
# tell prod the baseline is already applied (it IS — prod is the source of the dump):
npx supabase migration repair --status applied 20260101000000
npx supabase migration repair --status applied 20260101000010
npx supabase migration repair --status applied 20260101000020
# mark every legacy remote-only version as reverted so it's no longer "pending":
#   for each version in `npx supabase migration list --linked` that is NOT one of the
#   3 baseline versions and NOT a genuinely-post-dump migration:
npx supabase migration repair --status reverted <VERSION>
# repeat until:
npx supabase migration list --linked   # local == remote, baseline is the floor
```

## STEP 7 — lock the going-forward path (engineer) + lift freeze

Pick ONE and document it in `ARCHITECTURE.md`:
- **A (CLI-native):** author new migrations with `supabase migration new`, apply with
  `supabase db push` (filenames == `schema_migrations` automatically), or
- **B (keep MCP):** after every MCP `apply_migration`, immediately
  `npx supabase migration repair --status applied <returned-version>` so the on-disk
  filename and the recorded version never drift again.

Then lift the migration freeze (remove the `AGENT_CLAIMS.md` row).

---

## Rollback

- STEP 3 `git mv` is fully reversible (`git mv` back / `git checkout`).
- STEP 6 `migration repair` touches only `schema_migrations` (no data); a wrong
  version list is recoverable by repairing again to the correct state.
- There is no rollback for `db reset` against prod — which is why it is never run here.
