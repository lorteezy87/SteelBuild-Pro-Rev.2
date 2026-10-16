# Production database release — October 11, 2026

## Outcome

Nine reviewed migrations were applied and ledger-stamped atomically on production
Supabase project `kjrwqagyeswwoxpjkcko` at approximately 2026-10-12 00:08 UTC
(October 11 in America/Phoenix). The source was unchanged main commit
`5ea484d70f6e05c6c879a93e3d0d685d3a489a2c`.

No Edge Function, frontend bundle, provider configuration, credential, customer
record, account, or project was changed by this release. The apply used direct
reviewed SQL through `execute_sql`; it did not use `supabase db push`,
`migration repair`, a branch merge, or MCP `apply_migration`.

## Exact installed payloads

Each committed file was compared byte-for-byte with the already-installed
persistent-staging ledger payload. The production transaction recomputed every
source SHA-256 before executing SQL and stored the complete unmodified file as
the single `statements[1]` value for its existing version. The two embedded
`BEGIN`/`COMMIT` wrappers were omitted only from execution inside the outer
transaction.

| Order | Version | Bytes | SHA-256 |
| ---: | --- | ---: | --- |
| 1 | `20261008013546` | 10,821 | `c4f4a86dda10c0965fd099e48d2b4c2af64c04fbf2b99392105103d3e1a1476a` |
| 2 | `20261008021100` | 3,448 | `70e55b0f4075f872df66d8a9016c3fa1cb7444d12b1987185e45134d1751b140` |
| 3 | `20261008022100` | 10,187 | `4494ece435afe5b65c823faf3ff7ac75dcee113a342c74cbde64d64e8ac45a50` |
| 4 | `20261008023000` | 9,001 | `55672c0e4bb545fcdb7643f16bb7e1a3002ed429328819cb8641bed22b831198` |
| 5 | `20261008032524` | 3,738 | `281a52c5d64136f81cf30e37240990f575eb2cea920398511d7e08b524984dbf` |
| 6 | `20261008041759` | 9,096 | `3c6f690ddde03e55618752456144dd04cbc1b3eca9254784bd9e030f505f5182` |
| 7 | `20261009070300` | 49,588 | `b4b77581e51a0c61ee63d47fa34d1010a123bb1759bee6889e0ca0ec719b0ea7` |
| 8 | `20261009125901` | 10,717 | `ba0d72e62e8df02777f53d653593d7d9f41811798e0cfb0d551e367ce034eebb` |
| 9 | `20261009140000` | 7,399 | `b22297e7d1c6fd1f3e2f5ae1af080695a28404cf450c563085a73754743f0311` |

## Transaction controls and preflight

The transaction used an eight-second lock timeout, a 60-second statement
timeout, and a nonblocking transaction advisory lock. It failed closed unless:

- all nine candidate stamps and additive objects were absent;
- the exact MFA, numbered-create, and atomic-billing prerequisite payloads were
  present;
- the reviewed `create_project`, package evaluator, and underlying lot-split
  definitions matched the October 9 production snapshot;
- there were no transactions older than 60 seconds, idle transactions, or lock
  waiters; and
- all 113,995 source bytes matched their reviewed hashes.

The first execution attempt deliberately rolled back because the post-apply
assertion used the obsolete audit label `gc_issuance_shop_set_links` instead
of the committed table name `gc_issuance_shop_sets`. Readback confirmed zero
candidate stamps and zero candidate objects after that failure. The corrected
assertion then committed the same nine unchanged payloads in one transaction.

Production was PostgreSQL 17.6 during the release. `pgcrypto` 1.3 and
`btree_gist` 1.7 are installed. Supabase's September 25 PostgreSQL 17.11
notice therefore remains a future upgrade review item; this release did not
upgrade PostgreSQL or alter those extensions.

## Post-commit verification

- All nine production ledger rows contain one full payload with the exact byte
  count and SHA-256 above.
- All 32 affected production function definitions, security modes, search-path
  settings, and ACLs match persistent staging with zero mismatches.
- RLS is enabled on both GC impact tables, immutable round evidence, both
  internal workflow tables, and the private checkout-intent table.
- The GC no-impact guard, evidence immutability guard, both submittal workflow
  guards, captured-revision guard, and project-capacity trigger are enabled.
- Authenticated users have read-only access to the three intended public
  evidence tables. Internal workflow and checkout-intent tables have no direct
  authenticated or service-role table grants; their reviewed RPCs remain the
  boundary.
- All six new state tables were empty after commit. No synthetic or customer row
  was created by verification.
- No old transaction, idle transaction, or lock waiter remained.
- The post-DDL Supabase advisor reported the expected no-policy informational
  notices for private/internal service-only tables and existing platform
  warnings. It did not identify a new table with RLS disabled.

GitHub Actions run
[`38051867420`](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/38051867420)
was rerun only for the Supabase drift job. Attempt 2 job
[`114611447309`](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/38051867420/job/114611447309)
passed after the release.

Fresh focused local checks also passed:

- all five Drawing Control governing/link/split/GC/release scripts;
- 36 membership-revocation and 8 export-attribution checks;
- 38 immutable revision-evidence checks;
- 22 atomic billing and 28 durable checkout checks; and
- 19 project-capacity checks.

The exact main SHA had already passed application CI, secret scan, Edge
typecheck, and commercial PostgreSQL acceptance before the transaction.

## Remaining holds

This database release does not authorize frontend or Edge publication.
`CLOUDFLARE_ENABLED=false` remains the publication hold. Preexisting approved
or released Shop Drawing packages without exact immutable round evidence now
fail closed and require named PM review; no package was bulk-attested or
silently retyped. Durable checkout SQL is installed, but the matching reviewed
billing handler and real Stripe test-mode provider acceptance remain separate.

The advisory dependency job also remains red for the unpatched, development-only
Tailwind 3/Braces chain. Production dependency audit remains at zero known
vulnerabilities. Do not trade away the repository's Safari 15 support merely to
clear that advisory; resolve it through a separately reviewed browser-support
decision or an upstream patch.
