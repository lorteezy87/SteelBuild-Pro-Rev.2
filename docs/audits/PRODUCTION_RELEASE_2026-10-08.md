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
The commercial and Drawing Control migrations are recorded separately below.

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
now applied as described below. Provider settings, authenticated
viewport/business acceptance, security integration, and monetization acceptance
must remain separately evidenced.

## Release controls and staging prerequisites

On October 9, the five Drawing Control prerequisite ledger payloads were read
from staging and verified against every SHA-256 in the Drawing Control release
candidate. They are already present there and were not reapplied. Production
still has none of those five. The five local drawing-governing harnesses passed
again; this is separate from the new exact-revision manifest acceptance.

Main `a0a57f316` passed application CI, secret scan, Edge typecheck, and commercial
PostgreSQL acceptance in run `37895602676`. Its prior drift failure blocked
publishing; the six SQL changes above do not establish a fresh green drift run.

The reviewed backend workflow now names exactly the seven reviewed handlers
and also requires the commercial PostgreSQL job. Its executed verification
tests reject failed required checks, unreviewed functions, non-main production,
and missing or mismatched staging evidence. All 27 focused tests passed.

GitHub environments `staging-backend` and `production-backend` were created with
main-only branch policies; production retains the owner-review requirement
specified in the existing runbook. Both are missing the environment secret
`SUPABASE_BACKEND_ACCESS_TOKEN`. No repository-wide token was copied. The owner
has been asked to provision distinct, narrowly scoped deployment credentials.

Both public domains and the retained Cloudflare Worker origin returned 200 with
the same entry asset `index-D7mtDmja.js`. The separate Sites project currently
has no custom-domain bindings. Historical Sites migration notes must not be
treated as current domain routing or permission to repoint the domains.

## Commercial production SQL — October 9

At 07:38 UTC, production received the two additive reviewed-save RPC migrations
in one transaction after the installed staging implementation passed all 29
hosted acceptance assertions. The rollback fixture left zero synthetic users,
organizations or projects. CI run `37897927536` independently passed the 118
embedded SQL checks and 13 independent-session PostgreSQL cases, plus 8,216
unit tests in 844 files, 76 browser foundation cases, all type/lint gates,
the production build, bundle limits, secret scan and Edge typecheck.

| Version | Full ledger payload SHA-256 |
| --- | --- |
| `20261007113400` | `8a4bee23c1d23c1308ef8b92d736a55ec43ffb0fb1a3fe0c05dffccae86ae613` |
| `20261007120658` | `63c398ee01f119b747b4b6fe6b20ae721f2278d6b39e110640fe3fec4c6b46b8` |

The apply checked both original payload hashes, required the exact existing
numbered-create prerequisite, refused existing candidate stamps/functions,
took the migration advisory lock and used eight-second lock/60-second statement
limits. Embedded BEGIN/COMMIT wrappers were removed only from execution; full
original SQL is stored in the ledger. Numbered-create was not replayed.

At 07:38:27 UTC, both production function definitions matched staging exactly
(`save_change_order_reviewed`: MD5 `f97f92f0c8d38308a71e4acb4f999a8d`;
`save_sov_item_reviewed`: MD5 `15f2fff20a20119b7a23a0466d7757f9`). Both are
SECURITY INVOKER with empty search paths and authenticated-only execution;
anonymous and service-role execution are denied. No customer financial rows
were modified by this release. Hosted browser review/save remains separate.

The five Drawing Control migrations and the new exact-revision manifest still
hold the frontend release. No frontend or Edge publication has occurred.

## Atomic billing SQL — October 9, 13:09 UTC

After PR #513 merged as `00cc7a70f3bb6eb1d5864f5f3f7358d03bac0aeb`, the
exact `20261008071019_atomic_stripe_billing_events.sql` payload was applied and
stamped on staging, then production. SHA-256:
`3dfc1339eb999c33b5bad396d439958c8a6e6820071a612e33e686db9d5bbe44`.
The apply refused existing stamps and checked the full payload hash inside the
same transaction as the DDL and ledger insert. No customer entitlement changed.

The installed staging implementation passed all 20 rollback acceptance checks;
the subsequent read found zero synthetic users, workspaces or billing receipts.
Both environments have identical function-definition hashes:

- `apply_stripe_billing_event`: MD5 `6eab633a3ea6894831e03c7b199ee2a5`.
- `get_stripe_billing_snapshot`: MD5 `2f17457721ddacc9b4f211cd058c1cb0`.

Both functions are SECURITY DEFINER with empty search paths and service-role-only
execution. The private synchronization table has RLS and no direct SELECT grants
for anonymous, authenticated or service roles. Exact source CI run `37933404737`
passed application, secret, Edge and commercial PostgreSQL gates. Drift remains
blocked by other pending required SQL; the Tailwind build dependency advisory is
separate. The matching billing handler has not been deployed. Durable checkout
and real Stripe test-mode acceptance remain open; this SQL alone does not prevent
duplicate subscription charges.

### Temporary frontend publication hold

On October 9, the repository variable `CLOUDFLARE_ENABLED` was changed from
`true` to `false` while the combined source and database release is integrated.
This preserves the current live Worker and prevents an intervening green main
push from publishing before its reviewed Edge dependencies and staging browser
acceptance are ready. Staging remains enabled. Restore this exact variable to
`true` after those checks, then publish the tested main commit through the normal
five-gate workflow; leaving the hold set is not a completed production update.

## Installed staging membership and revision evidence — October 9

Staging received the exact reviewed membership and final round-manifest SQL
in one transaction. The apply checked the five existing Drawing Control ledger
hashes, refused duplicate stamps and verified each original source payload.

| Version | Staging ledger SHA-256 |
| --- | --- |
| `20261008032524` | `281a52c5d64136f81cf30e37240990f575eb2cea920398511d7e08b524984dbf` |
| `20261009070300` | `b4b77581e51a0c61ee63d47fa34d1010a123bb1759bee6889e0ca0ec719b0ea7` |

The installed membership suite passed 53 checks, including actual archive and
hard-erasure RPCs. The installed revision suite passed 31 checks covering source
capture, replay, PM/MFA/workspace guards, legacy reconciliation, stale/replaced
Storage sources, corrective transitions and erasure. Its pre-migration legacy
fixture is constructed inside the rollback transaction with only the new
submittal workflow guard temporarily disabled under its transactional DDL lock;
the guard is restored before any assertion. Storage edits are scoped to the
synthetic app-files object and evidence comparisons to the synthetic project.

A separate verification found the guard enabled, matching ledger payloads,
14 recorded function definitions/grant sets and zero synthetic users, workspaces,
projects, project grants, Storage objects, workflow receipts or erasure receipts.
No PDF bytes or customer rows were changed. These two migrations are still
pending production application, as are the five Drawing Control prerequisites.
Authenticated browser acceptance remains separate.

## Installed staging checkout and project capacity — October 9, 13:41–13:43 UTC

Both exact reviewed candidates were manually applied and stamped on staging
`ndyfjffsulfbwpmwdmic`; neither is installed in production. Checkout source
`2907a5a47` and capacity source `33c205f8b` passed their application, secret,
Edge and commercial PostgreSQL jobs. The combined integration remains subject
to its own complete checks and browser acceptance.

| Version | Staging ledger SHA-256 | Installed rollback checks |
| --- | --- | --- |
| `20261009125901` | `ba0d72e62e8df02777f53d653593d7d9f41811798e0cfb0d551e367ce034eebb` | 20 |
| `20261009140000` | `b22297e7d1c6fd1f3e2f5ae1af080695a28404cf450c563085a73754743f0311` | 18 |

Each apply refused existing candidates, verified its prerequisite payload and
source hash, and stamped the full original SQL in the same bounded transaction.
The capacity apply also required the observed original `create_project`
definition (MD5 `b933684ffdb42e8d4e28a3c013897556`) before replacing it.
Separate verification found zero synthetic users, organizations, projects,
project grants, checkout intents, billing receipts or erasure receipts.

The four checkout RPCs remain service-only with empty search paths; the private
intent table has RLS and no direct SELECT grants for anon, authenticated or
service roles. The capacity trigger is enabled. `create_project` remains
authenticated-only; the trigger helper has no caller EXECUTE grants. Installed
definition hashes are retained with the local release evidence. The capacity
rule preserves current Free/Pro/Business/Enterprise limits and ordinary edits
after downgrade; it adds no new paid-module restrictions. Provider test-mode
delivery, historical subscription reconciliation and Edge deployment remain open.

### Legacy submittal type and browser fixture limits

Read-only staging inspection found that the original STG-0001 erection submittal
has a NULL type, no current round and no revision roster. The canonical governing
submittal predicate and installed SQL require exact `Shop Drawing`; the legacy
record cannot authorize fabrication release. It must not be silently retyped or
treated as verified approval. Client defaults and acceptance fixtures are being
aligned to this strict contract. A separately identified synthetic Draft can
test missing-evidence behavior, but does not establish verified or stale PDF
acceptance. Existing customer and legacy fixture rows remain unchanged.
