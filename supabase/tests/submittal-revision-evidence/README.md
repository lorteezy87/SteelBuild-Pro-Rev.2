# Submitted shop-drawing revision evidence

Run `npm ci --ignore-scripts` and `npm test` here. Node 24 runs the typed harness
directly. It uses real baseline table definitions and read-only captured live
workflow guards, with synthetic Auth/project/Storage fixtures. No test reads
application credentials or contacts a hosted project.

`npm run test:postgres` additionally requires:

```
ROUND_EVIDENCE_POSTGRES_TEST=1
ROUND_EVIDENCE_POSTGRES_URL=postgresql://postgres:fixture-only@127.0.0.1:5432/steelbuild_round_evidence_test
```

The database must exist and be empty. Only the exact loopback database name is
accepted; URL query overrides are rejected. The CI commercial-postgres job
creates it alongside the existing commercial fixture on PostgreSQL 17, then
runs the same behavioral suite and independent-session concurrency checks.

Coverage includes atomic full multi-set capture, source path/page, PM/project/MFA
denial, direct table and forged-GUC denial, stable request replay/collision,
parent and revision staleness, real OFS/comment guards, legacy fail-closed
attestation, subsequent revision invalidation, historical persistence and
archived publish denial. Concurrent sessions cover identical/different request
keys, incoming sheets, revision swaps, post-capture insert blocking and removals.

The reduced fixture does not claim full hosted acceptance. Staging must verify
the complete existing trigger graph, real Auth/MFA and Storage RLS, account
authorship cleanup, catalog grants, legacy coverage inventory, and actual
Drawing Control/Fab Release/Piece/Work Package UI agreement. The candidate's
new private request tables and immutable evidence are not automatically
backfilled. The quarantined revision-upload migration remains frozen.
