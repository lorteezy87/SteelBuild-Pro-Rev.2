# Recovered shared-production migration evidence

These files are an archival record of SQL already applied to shared production
`kjrwqagyeswwoxpjkcko`. They are deliberately outside `supabase/migrations/` and
must not be added to an automatic deployment or replay glob.

On 2026-09-13, an authenticated read-only Supabase query recovered each original
payload from the `text[]` column
`supabase_migrations.schema_migrations.statements`. Each row held one statement.
The SQL preserves the original UTF-8 bytes, including the absence of a final
newline. Server-side MD5 and local MD5 agreed; SHA-256 is recorded below and in
[`provenance.json`](provenance.json), alongside the recovery query and the
read-only comparison of current function bodies and schema objects.

| Version | Bytes | SHA-256 |
|---|---:|---|
| `20260909090445` | 3466 | `ae1cc33e8a33185eba25e7d6935d4cb05e7f6f178d216cfb03e551310c1cd0bd` |
| `20260910034739` | 20682 | `c9754d64671cdfc27be6871bb326777af7ff8ca25790c81dfba0f12850fabbe9` |
| `20260910044641` | 12309 | `942871f2a0f9c04659c54d25d418eac57f4cb639505865c9779c4830d8eb29c5` |

The comments contain Unicode, so PostgreSQL character counts for the latter
two payloads (20653 and 12301) differ from their UTF-8 byte counts.

## Established lineage

- `20260909090445_m19_reset_org_data.sql` equals the sibling repository's
  `20260909090000_m19_reset_org_data.sql` minus its final LF. The sibling file's
  SHA-256 is `8227eefce9c9a1ac86fcf433b08619b9a87f7d7095c692bb52143869b83f47f6`.
  Its historical alias is frozen. Later Rev.2 fixes supersede this function;
  production's current body matches
  `20260912052502_reset_org_data_suppress_triggers_in_org_tail.sql`.
- `20260910034739_hard_delete_records.sql` defines six functions whose bodies
  match production exactly. Its three `data_erasure_log` metadata columns,
  nullable reason, two checks and record index also match production.
- `20260910044641_m30_scope_items.sql` defines four functions whose bodies
  match production exactly. Its six columns, two foreign keys, two NOT VALID
  checks, three indexes, two enabled triggers, three policies, RLS setting and
  table grants match production.

For the latter two files the exact applied SQL is recovered, but an original
author, originating repository and git commit have not been established.
`shared-production/kjrwqagyeswwoxpjkcko` in the ownership manifest identifies
the verified shared database provenance; it does not assert repository authorship.
Their `required` classification requires these already-applied ledger versions
to remain present.

## Limits

This archival restoration performs no production DDL, data changes or ledger
repair. Replaying the old reset function would regress later fixes. M30 also
contains historical row normalization, official-number backfill and sequence
upserts. Later migrations may have hardened function privileges beyond the
original grants; the archived SQL must not overwrite that hardening.

Body and catalog equivalence does not prove full clean replay or runtime
correctness. Historical backfill effects were not reconstructed and no
destructive RPC was invoked. Any bookkeeping repair still requires the
disposable replay, review and maintenance process in the
[production ownership runbook](../../docs/runbooks/supabase-production-ownership.md).
