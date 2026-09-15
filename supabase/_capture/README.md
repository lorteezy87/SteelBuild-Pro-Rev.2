# `supabase/_capture/` — reference dumps of live production objects

## What lives here

Verbatim captures of database objects that exist in the production Supabase
project (`kjrwqagyeswwoxpjkcko`) but are **defined by no migration in this
repository**. They are here so the definitions are readable, diffable and
reviewable in git — not so they can be replayed.

## What these files are NOT

- **Not migrations.** Nothing in this directory runs. `supabase db reset`
  ignores it, and CI does not execute it.
- **Not a proven-replayable schema.** The statements are ordered by `pg_proc.oid`
  (roughly creation order), which is *usually* dependency order but has not been
  proven by replaying it against an empty Postgres. Several definitions reference
  tables and other functions; a genuine rebuild would need dependency ordering
  worked out, and would need the tables to exist first.
- **Not a backup.** No data, no RLS policies, no grants, no triggers — function
  bodies only. Supabase's own PITR is the backup.

## The two files here, and why they are different

- `production-public-functions-2026-09-15.sql` — **171** functions that **no
  migration defines by name**. Captured byte-exact.
- `DRIFTED-FUNCTIONS-2026-09-15.md` — **49** functions a migration *does* define,
  where production runs a different body. An inventory only; **not captured yet**.

The second is the more dangerous set, because nothing looks missing. Together
they are why the repo reproduces 131 of 351 live function bodies.

## Why the capture exists

`supabase/migrations/` cannot reproduce production. Two independently checked
facts, as of 2026-09-15:

1. **171 of the 351 live `public` functions** (extension-owned functions
   excluded) are defined by no migration anywhere in the repo. 86 of the 171 are
   `SECURITY DEFINER`; 65 are wired to a live trigger. A further **49** are
   defined by a migration but have drifted in production — see
   `DRIFTED-FUNCTIONS-2026-09-15.md`.
2. At least two migrations `ALTER` a function they never `CREATE`, so a reset
   from scratch fails outright rather than merely drifting:
   - `20260911062832_pin_workflow_helper_search_paths.sql` → `submittal_derived_stage`
   - `20260914020000_revoke_internal_helper_execute_from_authenticated.sql` → `erase_my_account`

The practical risk is not that production breaks — production is fine. It is that
a staging or preview environment built from migrations is silently missing the
RFI workflow, the fab-release gate helpers, piece control and the rest, and that
nobody can review a change to a function whose current text lives only in the
database.

## How the capture was taken, and how to check it

Pulled through the Supabase MCP connector with `pg_get_functiondef(oid)`, in 12
batches, each decoded from base64 and verified against `md5()` computed by the
database itself. The assembled file matches the database's md5 of the same 171
definitions joined identically, so a truncated or mistyped batch could not slip
through.

To re-verify a capture against live production at any time:

```sql
-- must equal the md5 recorded in the file's header
select md5(string_agg(pg_get_functiondef(p.oid), E'\n\n' order by p.oid))
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and not exists (
     select 1 from pg_depend d
      where d.objid = p.oid
        and d.classid = 'pg_proc'::regclass
        and d.deptype = 'e'
   );
```

That query covers **all** live `public` functions, so it will not match a capture
that holds only the migration-less subset. Use it to detect that production has
changed; use the per-file header md5 to confirm a file is intact.

**Comparing repo SQL against production needs line endings normalised.**
Production stores some bodies with CRLF while this repo's `* text=auto` rewrites
the checked-in copy to LF, so a raw md5 reports drift where the SQL is identical.
Compare `md5(replace(prosrc, chr(13), ''))` against a CR-stripped repo body.

## Retiring a capture

A captured function stops belonging here the moment a migration defines it.
Promote in small, reviewable batches — helpers with no dependencies first, then
the functions that call them — and delete each promoted definition from the
capture in the same PR, so the file always answers "what is still unreproducible".
