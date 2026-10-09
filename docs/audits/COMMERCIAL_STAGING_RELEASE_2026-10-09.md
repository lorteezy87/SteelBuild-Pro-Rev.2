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

The rollback harness is a single-session hosted integration test, not proof of independent-session contention. Fresh [CI run 37897149840](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/37897149840) on `a5888df4f09aedc74b6894f346c2595a79d5a07d` passed the normal application, secret-scan, Edge typecheck and commercial PostgreSQL jobs. The commercial job passed all 118 embedded cases and 13 independent-session contention cases, including eight-way create retries, revoked membership during a lock wait, competing approvals/deducts, aggregate agreement and stale SOV reviewers waiting on CO approval. The pre-existing production drift and build-tool advisory jobs remained red. Hosted frontend review/save acceptance remains a separate release check.

## Release state

All three exact files were manually applied and stamped in staging in one transaction after those source checks passed. The transaction refused pre-existing stamps, verified each original payload SHA-256 before execution, ran the bodies without their nested BEGIN/COMMIT wrappers, and stored each complete original file in its matching ledger row. Post-application verification at `2026-10-09T07:15:50Z` confirmed the three exact SHA-256 values above.

The installed-function rollback harness passed all 29 assertions again. A separate query confirmed zero synthetic users, organizations and projects, authenticated-only execution on all three APIs, empty search paths, SECURITY INVOKER on the reviewed CO/SOV functions, and enabled RLS with no authenticated SELECT grant on the private receipts. Read-only comparison also confirmed identical staging/production definitions for all nine prerequisite lifecycle, authorization, MFA, timestamp and financial-guard functions.

The staging security advisor delta was exactly one expected warning for the authenticated SECURITY DEFINER entry point `create_numbered_record`. Its explicit MFA, workspace membership, role, payload and post-lock permission guards passed the tests above. The existing seven internal-table RLS notices, 156 other authenticated-definer notices and leaked-password-protection warning remained open. See the [Supabase definer-function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable); this is not a claim that the broader security inventory is closed.

No production database mutation or Edge Function deployment was performed by this validation branch. Production application and evidence are owned by the coordinated release. Never use `db push`, `apply_migration`, ledger repair or a manifest exemption.
