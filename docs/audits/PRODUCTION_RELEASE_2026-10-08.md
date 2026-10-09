# Production release — October 8, 2026

## Current release boundary

The owner requested production be brought fully current, followed by security,
logic, data-routing, and monetization hardening. Source main at the start of
this release was `a0a57f316` (the merge of PR #499). Publishing remains gated
by application CI, secret scan, database drift, Edge typecheck, and commercial
PostgreSQL acceptance. Source merge alone is not a hosted release.

## Shared backend SQL applied

At 2026-10-09 06:58 UTC (October 8 in America/Phoenix), the following six
reviewed migrations were applied to production `kjrwqagyeswwoxpjkcko` and
ledger-stamped in one transaction. Each full original SQL payload was checked
against its committed SHA-256 before execution and stored unchanged in
`supabase_migrations.schema_migrations.statements[1]`. The embedded transaction
wrapper in `20261005100745` was omitted only from execution; its original blob
was retained in the ledger. A single transaction kept the authorship correction
and both erasure forward fixes from exposing an intermediate implementation.

| Version | SQL SHA-256 |
| --- | --- |
| `20260922015713` | `5e91c05e0d37e2775f11f5d734df7d5cc955b471f1bd2bbed9c84c43f94f1b80` |
| `20260927150000` | `34500dcf125e3b10432dcfb44c3d10705b77a491263dcd95f155e3c1160550c5` |
| `20260927160000` | `e67a55a414277691c20599003cedcafc79bad51ccc447b47930ff06d3602215c` |
| `20261005100745` | `e05b215cc397e96d41bf10d037d491ff1b2078db62fd60762c13b1fdcdd9839d` |
| `20261007084117` | `870c0bd5e93e6fc042971a49f1814fa0753d41fc0aa836ac92906fa34e3f8c3f` |
| `20261007090057` | `6f26bbec42ca29e33accb246f38a3fa9ecbf34d1f0b10ec51eda9152015aeb2d` |

Fresh preflight confirmed all six absent in production, all six exact hashes
present in staging, no null/duplicate piece-event IDs, all 27 targeted Auth
foreign keys present, all 16 SET NULL columns nullable, and no transaction
older than 60 seconds active. Existing function definitions, ACLs, Auth foreign
key definitions and piece-event indexes were retained in local release
evidence before changes. This schema-contract snapshot is not a database/data
backup or a restore rehearsal.

The transaction used an eight-second lock acquisition limit, a 60-second
statement limit, a nonblocking migration advisory lock, and a schema reload
notification. Follow-up verification found all six ledger hashes exact,
zero targeted blocking Auth foreign keys, 16 SET NULL foreign keys, and no
remaining Auth FK on the 11 audit/sign-off columns (their UUID values remain).
The sole usable piece-history index and ID primary key remain present.
The erasure and retry RPCs deny anonymous execution; erasure has an empty
search path and scoped 60-second timeout, and revision retry is SECURITY INVOKER.
No account erasure was invoked and no customer rows were deleted by this release.

The MFA and numbered-create migrations already in production were not replayed.
Seven commercial/Drawing Control migrations remain separate release work.

## Frontend and function hold

The public Cloudflare Worker still serves its prior bundle. Seven prior Edge
Function bundles and their JWT settings have been captured before replacement.
No Edge Function or frontend publication is recorded by the SQL work above.

Drawing Control requires exact submittal-round revision evidence before full
production rollout: the current gate can otherwise accept an older approved
submittal after a new sheet revision. The owner already approved an immutable
manifest, atomic workflow commands, fail-closed legacy approvals, and explicit
PM attestation or resubmission. Implementation and authenticated concurrent
acceptance are release work, not a reason to weaken the drift gate.

The two commercial migrations and numbered-create staging prerequisite are
being reviewed and rehearsed on staging. Provider settings, authenticated
viewport/business acceptance, security integration, and monetization acceptance
must remain separately evidenced.

