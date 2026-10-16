# Exact drawing cutover package acceptance

`supabase/drawing-cutover-package.json` orders four promoted migration payloads,
their identical reviewed candidates, dependencies and SHA-256 values. The offline
validator `node scripts/drawing-cutover-package.ts` checks mandatory payloads,
candidate equality, dependency ordering, prerequisite file hashes and the exact
embedded manual installer. It has no network, database or apply mode. Missing
files and byte/hash drift fail; no candidate is optional.

```powershell
npm ci --prefix supabase/tests/drawing-set-revision-transaction --ignore-scripts
npm test --prefix supabase/tests/drawing-set-revision-transaction
```

Required `ci` executes these PGlite behavior checks. Required `commercial-postgres`
executes actual PostgreSQL 17 checks in the separately created empty loopback
`steelbuild_drawing_upload_test` database. The dedicated drawing workflow remains
useful but is not the only release blocker. Actual PostgreSQL execution requires
`DRAWING_UPLOAD_POSTGRES_TEST=1` and `DRAWING_UPLOAD_POSTGRES_URL` with the exact
loopback database path and no query. The initial empty-database census precedes
any fixture setup. Never point the harness at an application database.

Separate databases still share PostgreSQL cluster roles. The PGlite entrypoint
deliberately precreates `service_role` without RLS bypass, like the earlier
commercial fixture in required CI, and verifies its attributes and memberships
remain unchanged. Privileged Storage replacement uses only the dedicated
`drawing_fixture_storage_admin` test role: NOLOGIN, NOSUPERUSER, BYPASSRLS,
no memberships, and explicit Storage schema USAGE/object SELECT and UPDATE.
Unexpected preexisting attributes or memberships abort fixture initialization;
the harness never normalizes a shared API role. The privileged test verifies
its actual role, exactly one updated object and the persisted changed version
before requiring SOURCE_CHANGED with complete rejected-command snapshot equality.
This fixture role is never part of the candidate, migration or manual package.

The harness installs the complete checked-in manual SQL, using exact promoted
bytes in dependency order. Its deliberately failing fourth ledger stamp proves
all four components and stamps roll back together. Each successful ledger row
contains one text-array element equal to the entire unmodified payload; SQL is
never split on semicolons. Effective inherited mutation EXECUTE exposure aborts
installation. Direct authenticated create/revise calls are denied without writes
before any clearly marked TEST-ONLY positive grants. The fixture hashes and
synthetic classification are never approval for a hosted database.

## Manual process boundary

No hosted installation or activation is authorized by this package. Four CLI
versions were issued by discovered Supabase CLI 2.120.0. Previously stamped
migrations remain untouched. The four uninstalled candidates were explicitly
amended to remove their top-level transaction controls before exact promotion.

Before any install, an authorized operator must separately verify the connection
target and freshly review the full preflight, callers (including the sibling),
ownership, dependency closure, grants, guard bindings and source package. Missing
classifications remain a stop. Bare SHA strings do not replace that evidence.
The manifest's saved production/staging observations are historical evidence,
not live validation or approved defaults. The eight fixed direct auth/workflow
prerequisites are additional install preconditions, not a substitute for the
full captured guard/helper and privileged-writer review.

`supabase/drawing-cutover/install-manual.sql` requires externally supplied literal
session settings `drawing_cutover.project_ref`, `reviewed_source_commit`,
`reviewed_classification_sha256` and `expected_prerequisites` (each name prefixed
by `drawing_cutover.`). The prerequisite JSON array must contain exactly the
manifest's required identity roster, each with its separately reviewed SHA-256;
empty, missing, extra, duplicate or changed entries refuse installation. The
project-ref setting is an operator assertion, not proof of database origin.
No tool populates these inputs from the observed state.

One outer transaction executes each SHA-validated full payload and stamps that
same text. It commits only with both new mutation entrypoints effectively denied
to anon/authenticated/service_role and an empty package_review. Read receipts,
source evidence, metadata/workflows and adopted-source guards remain available.

After this disabled installation commits, `activation-capture.sql` exports the
operator-only full catalog snapshot and disabled fingerprint, temporarily grants
only the two mutations, exports the prospective fingerprint, and rolls back.
It creates no objects or review row. Capture output includes complete function
definitions and must stay in private review artifacts. Its snapshot is the SAME
query used by the runtime fingerprint, including all non-system schemas,
functions, tables/views/rewrite rules, columns/defaults, constraints/indexes,
triggers/policies, roles/memberships, default privileges and role settings. This
supplements the older preflight collector's narrower view/rewrite inventory;
both actual dependency/privilege closure and exact snapshot require review.

Physical OIDs/ACLs make fingerprints installation-specific. Never copy hashes
from rollback-created objects, staging to production, or a previous install.
The only prospective capture is a grant-only rollback against the SAME committed
object instances. Any subsequent catalog change invalidates the reviewed hashes.

Only after separate review may `activate-manual.sql` use externally supplied
`drawing_cutover.expected_disabled_sha256` and `expected_enabled_sha256`, plus
the reviewed source/classification/target bindings. It checks the disabled hash,
grants only two entrypoints, checks the prospective enabled hash, and records
approval in one transaction. Missing/mismatched inputs abort and roll back grants.
No capture auto-approves itself. Capabilities are readiness/display, not the
direct-RPC authorization stop; EXECUTE revocation provides that stop.

## Evidence limits

Fixtures extract actual committed drawing tables/constraints and reviewed
workflow/erasure helpers, with synthetic membership/MFA predicates and data.
They preserve unknown SQL NULL versus observed JSON null and legacy JSON keys;
maximum observation/export and concurrency tests remain intact. These are not
hosted RLS/Auth parity, physical PDF/page readback or production deadline proof.
Actual PG17/Deno verification requires exact-SHA CI when unavailable locally.
Pending production migration versions must remain visible to production drift;
no ownership-manifest override or weakened release gate is permitted.
