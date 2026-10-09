# Commercial staging release validation

Scope: exact committed numbered-create, reviewed change-order, and reviewed SOV SQL. Production application remains a separate step coordinated by the release owner. These additive APIs preserve existing sibling RPC signatures.

| Version | SHA-256 |
| --- | --- |
| `20261007112918` | `29e8db4bd72c6f036aa8acc8437a73b4ef0defdad83787e6b809e50ba7a76eb6` |
| `20261007113400` | `8a4bee23c1d23c1308ef8b92d736a55ec43ffb0fb1a3fe0c05dffccae86ae613` |
| `20261007120658` | `63c398ee01f119b747b4b6fe6b20ae721f2278d6b39e110640fe3fec4c6b46b8` |

Read-only production verification confirmed that `20261007112918` is already stamped with the same SQL payload hash. It must not be replayed in production. Staging `ndyfjffsulfbwpmwdmic` had none of these versions or new APIs at preflight; its PostgreSQL version was 17.6.

## Completed verification

- Local pinned PGlite: 52 numbered-create cases, one full account-erasure integration case, 36 reviewed CO cases, and 29 reviewed SOV cases passed.
- Hosted staging rollback rehearsal: all three exact candidate bodies were installed in one transaction, then `supabase/tests/commercial-lifecycle/staging-acceptance.sql` passed 29 assertions with actual staging RLS, constraints, MFA, financial guards, audit and timestamp triggers enabled. The rehearsal ended with `ROLLBACK`.
- A separate catalog/fixture check confirmed zero synthetic users, organizations or projects, zero candidate ledger rows, and absent candidate APIs/receipt table after rollback.
- The hosted harness checks PM approval, exact SOV/project aggregate agreement, stale-editor rejection, invalid-deduct atomic rollback, frozen approved amounts, immutable SOV provenance, a real foreign-project cost reference, authenticated execution grants, field/viewer/foreign-user denial, enrolled AAL1 denial, removed-workspace denial, receipt idempotency/privacy and actual audit output.

The fixture intentionally uses synthetic enterprise workspaces for the four-role matrix. Its project seeding uses authorized synthetic actors because real setup triggers allocate Action Item numbers. Initial fixture attempts were correctly rejected by the free-workspace seat cap, authorization/last-owner guards and a manually seeded SOV number collision; those attempts rolled back. No policy, trigger or production SQL was weakened to make the fixture pass.

The rollback harness is a single-session hosted integration test, not proof of independent-session contention. The existing `commercial-postgres` CI job must pass on this branch for real PostgreSQL multi-session acceptance. Hosted frontend review/save acceptance remains a separate release check.

## Release state

Staging manual application and exact ledger stamping are pending the fresh commercial PostgreSQL CI result. No production database mutation or Edge Function deployment was performed by this validation branch.

After staging application, repeat the rollback harness against the installed functions, verify all ledger payload hashes, confirm authenticated-only RPC execution and private receipt grants, and verify zero residual synthetic rows. Never use `db push`, `apply_migration`, ledger repair or a manifest exemption.
