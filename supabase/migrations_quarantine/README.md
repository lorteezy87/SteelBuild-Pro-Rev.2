# Quarantined migrations — never run these

Every `.sql` file in this directory is a migration that **must not be applied to
any database**, including a Supabase staging branch or a local `db reset`.

They are here rather than in `supabase/migrations/` because that directory is an
executable surface, not a document store. The Supabase CLI and the branching
runner apply everything in it that matches `<14-digit>_*.sql`, in version order,
with no reference to this repo's ownership manifest. A file whose SQL would
regress production is therefore unsafe to leave there no matter how it is
annotated: `local.migrationOverrides` silences the drift report, and a `-- DO NOT
APPLY` comment persuades a human, but neither is read by the runner.

This mirrors `supabase/migrations_external/`, which holds recovered
already-applied SQL outside the runner's path for the same structural reason.

## Contract

The drift checker (`scripts/supabase-drift-check.mjs`) enforces all of this:

1. A quarantined version is **absent** from `localInventory().migrations`, so it
   is never reported as a missing migration — there is no action that could
   apply it, which is the definition of unfixable drift noise.
2. Every quarantined version **must** carry a `local.migrationOverrides` entry.
   Quarantining without a record is how a dangerous file becomes a mystery file.
3. That entry's lifecycle must be `intentionally-frozen` or `unresolved`:
   - `required` is unsatisfiable by construction — no runner can reach the file.
   - `staging-only` and `deprecated` are assertions about the remote ledger that
     quarantine has nothing to say about.
4. The entry still classifies the version, so if it ever appears in the remote
   ledger the report names it instead of calling it unknown — and an
   `unresolved` entry keeps failing drift. **Quarantine does not silence an open
   question.** `20260727232000` still fails the drift check today, deliberately.

## Contents

### `20260913084700_expense_atomic_creation.sql` — `intentionally-frozen`

Superseded, not pending. Its `create_expense()` half is already live. The rest of
it drops **every trigger** on `public.expenses` and installs a create-only guard
(`enforce_expense_rpc_create`) that production does not have. Production carries
`trg_a_enforce_expense_guards -> enforce_expense_guards`, which is strictly
stronger: the same RPC-only insert rule plus `project_id`/`expense_number`
immutability, status and stamp routing through `move_expense()`, an
approved-expense freeze, a field-edit restriction, delete restrictions and
transition validation. Applying this file tears all of that out.

### `20260727232000_piece_drawing_sets.sql` — `unresolved`

**P0 path; owner decision required. Do not stamp and do not apply.** Most of the
file is live and byte-exact, but the fab-release gate has diverged and the
divergence is bidirectional:

- Live `evaluate_release_gate` (md5 `c4d43eb9…`, 10622 B) is not this file's
  (`d146c39a…`, 11524 B), and no repo migration redefines it — so this file is
  the tracked head and the live body is undocumented drift.
- The live gate delegates to `work_package_drawing_set_reports(uuid)`, defined in
  no migration, which calls `evaluate_fab_release_set(uuid,uuid)`, which appears
  nowhere under `supabase/`. Two layers of untracked drift.
- Applying this file would **delete live blockers** from the fab-release gate
  (`open_rfis`, `active_holds`, superseded sheets, `no_file`) and change output
  keys that `release_work_package_canonical_impl` and
  `piece_control_pilot_readiness` consume.

So neither stamping nor applying is safe, and the file stays `unresolved` until
an owner restores the lineage.

## Releasing a file from quarantine

Do not move a file back to make a report green. Establish the lineage, then
write a **new forward migration** that reaches the intended end state from
production's actual current state. The quarantined file stays here as the record
of what was diverged and why.
