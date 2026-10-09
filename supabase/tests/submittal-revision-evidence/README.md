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

`node hosted-rollback.ts` prints JSON containing a SHA-256 and reviewable SQL.
It does not connect or read credentials. The SQL runs the exact candidate plus
synthetic fixtures and 31 assertions in a transaction ending in ROLLBACK, then
checks that the candidate, ledger stamp and fixtures are absent. Only the explicit
staging branch may be selected by its caller. This rehearsal passed against the
actual hosted trigger graph, Auth/MFA, Storage RLS, authorship cleanup, archive
and erasure functions on 2026-10-09; see the candidate audit for exact hash.

Storage source snapshots record object identity/version/metadata and invalidate
coverage when replaced; PDF bytes are not an immutable archive. CI concurrency
includes shared-object-lock ordering and replacement after capture. Actual
Drawing Control/Fab Release/Piece/Work Package UI agreement and production legacy
coverage inventory remain separate acceptance work. There is no automatic
backfill. The quarantined revision-upload migration remains frozen.
# Installed staging verification

After the exact migration is installed, `node installed-rollback.ts` emits a
separate acceptance query. Run it only against staging `ndyfjffsulfbwpmwdmic`.
It checks the ledger against the committed Git blob and reuses the 31 hosted
assertions without reinstalling the candidate. The legacy pre-migration fixture
temporarily disables only `aaa_submittal_round_workflow` on `submittals` inside
the rollback transaction; the transactional DDL lock prevents other sessions
from seeing that interval, and the guard is re-enabled before assertions.
All other policies/triggers remain enabled. Always verify fixture cleanup and
the enabled guard independently afterward. No actual PDF bytes are uploaded or
deleted. Production application and browser acceptance are separate steps.
