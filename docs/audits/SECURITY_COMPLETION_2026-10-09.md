# Security implementation and integration review — October 9, 2026

Continuation of the owner's request to finish the audit remediation, with the
October 9 instruction that the Desktop Command Center companion is discontinued.
The canonical finding register is [TECH_DEBT.md](../../TECH_DEBT.md). The earlier
[remediation report](SECURITY_REMEDIATION_2026-10-08.md) records crane graphics,
IFC discovery, recovery/MFA, membership, account deletion and atomic Stripe work.

This package was prepared in the isolated `codex/security-membership-revocation`
checkout, starting at `997b7f6b6bd774e1f7741702e4ee04c7de224924`.
The implementation is committed as `34fb30d8`; this report records its source
verification and separate release prerequisites. Follow-ups `bbbfbfc6`,
`41d086d0` and `ba781739` correct test fixture typing/readiness, obsolete
contracts and the exact public Sentry ingestion-key scanner allowance without
changing application behavior.
No production or staging SQL was applied, no application/function was deployed,
no hosted endpoint was deleted and no customer data or credentials were exported.
Local passing tests cannot establish those outcomes. The audit is **not closed**.

## Integration and refreshed hosted evidence

This is a **draft source review, not a merge-ready release candidate**. A final
fetch found `origin/main` at `150feedcd`, with 232 commits on main and 21 on this
branch since their shared base. A read-only merge simulation found 31 conflicted
paths. Main has active overlapping release, recovery, billing, erasure and
drawing-control claims. This continuation did not merge over those areas or
modify the shared checkout. Integration must preserve the newer fixes described
in [the reconciliation handoff](SECURITY_INTEGRATION_2026-10-09.md), followed by
fresh checks on the combined source. The test results below cover this isolated
branch, not that future integrated tree.

A metadata-only production ledger refresh at 2026-10-09 23:59 UTC found eight
selected prerequisite migrations already applied by other work, including MFA,
erasure/authorship and atomic Stripe. All eight single-statement payload hashes
match this branch's UTF-8/LF SQL. The membership candidate and all ten new SQL
candidates here remain absent. See [the exact bounded ledger inventory](SECURITY_LEDGER_REFRESH_2026-10-09.json).
This supersedes older absence statements for those eight versions; it does not
prove current function bodies, hosted API behavior or the matching Edge release.
The same-time Edge inventory still reports the two desktop endpoints active at
versions 14 and 15.

## Implemented boundaries

| Area | Concrete behavior | Evidence and release contract |
|---|---|---|
| Mail credentials and authority | Ordinary API users cannot retrieve private tokens; provider use requires an independently verified mailbox/provider/project/workspace binding. Changing metadata revokes trust. | [SQL and provider acceptance](../../supabase/tests/private-email/README.md); real handlers cover unverified/foreign/changed/revoked cases. |
| Files | New uploads carry authoritative organization/project paths. Reviewed historical object identities require explicit scope or quarantine; missing dispositions abort policy enforcement. Read and write floors differ. | [Storage inventory/cutover](../../supabase/tests/app-files/README.md); real upload callers, scoped photo links and signed-URL lifecycle tests. |
| Creation and provenance | Raw project/org insertion cannot bypass reviewed creation rules; counted writes serialize on the organization. Submittal events derive their real actor and parent project. | [Creation/provenance SQL](../../supabase/tests/creation-provenance/README.md). |
| Provider quotas | Durable service-only reservations precede mail/AI work, with operation fingerprints, replay and fail-closed ambiguous outcomes. Editable correspondence is not the quota ledger. | [Quota release contract](../../supabase/tests/edge-quotas/README.md); actual entrypoint/provider-timeout/body-limit tests. |
| PKCE | Browser and native callbacks require the initiating SDK verifier. Bearer fragments, malformed or unsolicited callback data are rejected and URL data is scrubbed. | Actual installed AuthClient tests cover success, missing/mismatched verifier, replay, expiry and recovery events; provider/device acceptance remains. |
| Shared-device state | Calculator data is scoped by owner; named mutation callbacks reject stale rollback/Undo/follow-up work. Exports pin their bearer and stop on identity changes, including native file cleanup. | Actual Schedule, Field Today, Production Notes, export transport and native sharing tests. Already-started writes or an already-open OS share sheet cannot be recalled. |
| Desktop retirement | Removed companion login, session export, cryptography and protocol callback. Old URLs show an inert notice. Two backend indices return 410; manifest classifies both deprecated. | [Retirement SQL and session caveat](../../supabase/tests/desktop-retirement/README.md). Hosted removal and existing session revocation remain pending. |
| Flags and numbering | Raw override maps are platform-admin only; ordinary users receive their effective flags. Public sequence reservation requires a writer; the approved viewer CR flow still receives an atomic number. | [Flags/sequence acceptance](../../supabase/tests/flags-sequences/README.md), including rollback and 999→1000 behavior. |
| Content and loader safety | Real CSV exporters neutralize formula-leading text. Email uses inert reconstruction and per-message remote-image consent. IFC decompression is capped and wasm is content hashed. Shell cache rejects bad responses. | Actual exporter/component tests; local desktop/mobile email browser checks; actual IFC4 geometry loaded. Hosted headers and two-build cache acceptance remain. |
| Monitoring and release | Browser Replay is disabled because masking alone does not remove URL metadata. Event payloads are restricted. Build revision/entry asset/backend probes fail closed. Publishers require dependency checks; actions and Edge dependencies are pinned. | Synthetic telemetry markers, executed release-gate tests, exact-version Deno lock; hosted environment and alert delivery still require evidence. |

## Required release order

1. Reconcile the draft branch with current main and its active owners before
   treating these candidates as deployable. Preserve newer recovery, checkout,
   project-limit, drawing-link and release behavior; do not apply conflicting
   older candidates merely because their isolated checks pass. Review the exact
   integrated candidate SQL. Confirm shared application
   ownership and current deployed definitions, not merely migration filenames.
   Preserve a recovery point and the existing deployed artifacts.
2. Follow `CLAUDE.md`: manual reviewed SQL application and matching ledger payload
   only; never `supabase db push`, MCP `apply_migration`, ledger repair or a
   permissive drift exception. Every candidate remains `required` and visible
   as missing until actually applied/stamped. Pending drift is intentional.
3. Apply prerequisites in isolated staging and execute each package's real
   positive/negative workflow matrix. PGlite uses PostgreSQL SQL/roles/RLS, but
   does not prove multi-connection races, full-schema fidelity or hosted
   PostgREST/Storage/Realtime behavior. Run the independent PostgreSQL acceptance
   for contention-sensitive changes.
4. Reconcile all existing app-files objects before enforcement. Review and load
   mailbox bindings with provider evidence; no automatic trust migration is
   included. Set matching provider connection generations and approved nonzero
   LLM cost/count limits. Fresh clients and dependent SQL/handlers must cut over
   together; old file paths and raw flag reads deliberately fail closed.
5. Apply handoff RPC revocation, remove the discontinued desktop slugs and
   publish the inert retirement notice through the reviewed frontend release.
   Review previously transferred sessions and the sign-out impact separately.
   Removing a URL cannot revoke an already-issued browser refresh credential.
   The October 9 [read-only Edge inventory](SECURITY_EDGE_SNAPSHOT_2026-10-09.json)
   still observes `command-center-read` version 14 and
   `command-center-session-handoff` version 15 active. This package does not
   represent either hosted function as removed.
6. Configure effective GitHub environments, separate publishing credentials and
   required checks. The October 8 [metadata snapshot](SECURITY_CONTROL_SNAPSHOT_2026-10-08.json)
   confirms main requires a PR and one strict CI context, with zero required
   approvals; it does not prove the new intended environment/check policy.
7. Supply reviewed fresh release fixtures under the
   [fixture-freshness contract](../runbooks/release-fixture-freshness.md).
   Existing canonical release E2E consumes work packages. Reusing seed IDs is
   not repeatable acceptance. Exact SHA/run/attempt attestation and live
   freshness checks now block stale fixtures; automatic provisioning/teardown
   of the complete workflow remains unfinished.
8. Resolve the unpatched Braces build-tool finding or approve a narrowly justified,
   expiring exception through review. This change adds **no exception**. The
   required dependency gate intentionally blocks publication while it is open.
9. After explicit deployment authorization, release the exact reviewed artifacts,
   record SQL payload hashes, run staging/production checks and verify hosted
   retirement, headers, provider delivery, alert routing and rollback evidence.

## Remaining audit work

These are separate requirements, not passing source-test claims:

- AUTH-8/SBSEC-11: authoritative recent-authentication policy for sensitive
  changes, effective provider password/abuse settings and actual MFA enrollment.
- AUTH-9/DB-10: immutable acceptance/membership audit provenance and an approved
  retention/legal-hold schedule. A private quota purge RPC is not a scheduled
  retention policy.
- RLS-6/9 and DB-7/8/11: residual helper exposure, actual creator-role defaults,
  Realtime revocation, full shared-schema replay and exact deployed payloads.
  The read-only executor is `postgres` and lacks `supabase_admin` membership;
  provider-owned defaults need supported operator coordination.
- RLS-10: use the flags/sequences README for the exact archived-write matrix;
  the candidate guards 23 canonical command implementations, with 68 isolated
  SQL checks and latest-definition comparison across all migrations. Both
  latest model linkers retain their batching/timeouts; the UUID page cursor is
  corrected and archive/release lock order is aligned. Multi-connection races,
  wider direct writes and full-schema release/model/erasure acceptance remain.
- CI-2/3/6/10 and OBS-1: effective hosted publisher restrictions, fresh full
  workflow fixtures, external publisher inventory and delivered monitoring alerts.
- DR-1/2/3: database-plus-file restore, approved and measured RPO/RTO, capacity,
  retention and restore drills. Historical successful backup execution is not
  full recovery acceptance.
- Native device/store testing, data classification and reviewed legal/privacy
  agreements remain explicit product/operator work. Fabrication/erection-only
  capability enforcement remains a launch requirement across APIs, jobs and
  offline replay; hiding navigation is insufficient.

## Validation record

The [ten exact SQL candidates](SECURITY_CANDIDATES_2026-10-09.json) are recorded
with SHA-256 hashes over UTF-8/LF bytes matching Git's attributes. None were
applied or stamped. Earlier prerequisite candidates remain required in the
ownership manifest and prior release report.

Local source-freeze checks on October 9:

- Production build passed: 4,769 modules, 4 minutes 27 seconds. The usual
  large lazy BIM/PDF vendor-chunk advisory remains.
- Bundle checks passed: initial JS/CSS 124.3 KiB gzip; all generated JS/CSS
  3,211.6 KiB; one WASM asset 467.9 KiB; combined 3,679.5 KiB. The
  [accounting correction](../runbooks/bundle-budget-accounting.md) preserves
  the 320/3,600 KiB JS/CSS limits and explicitly adds a 500 KiB WASM limit.
  The old measurement had excluded `dist/wasm`; the new one catches every copy.
- All 11 Edge entrypoints passed frozen-lockfile Deno type checking.
- Full foundation browser suite passed all 76 cases in 4.6 minutes. Cold Vite
  readiness is isolated in a guarded, bounded setup context; all four
  command-brief presentation tests retain their original 30-second limit and
  assertions. These controlled-record browser tests do not prove auth/RLS.
- Lint, TS and JS checks passed. Strict-null and no-implicit-any gates have zero
  enforced diagnostics; their unchanged legacy baselines contain respectively
  81 diagnostics in one file and 180 in nine files. No ignore list was expanded.
- The committed-source no-new-JavaScript gate passed.
- Gitleaks 8.24.3 reproduced one public CSP-report-key false positive, then
  passed the identical commit-range scan with the exact key/file allowance.
  Seven real-scanner scope checks confirm other keys, other files, other
  same-line secrets and a synthetic Stripe credential remain detected. No
  file-wide exclusion or credential-pattern waiver was added.
- SQL packages passed for helper search paths, deletion, membership, MFA,
  commercial creates/lifecycle, Stripe, private mail, project files, creation
  provenance, operation quotas, flags/sequences/archive and desktop retirement.
  The corrected flags/sequences/archive package has 106 passing checks.
- Independent review found and corrected stale model-link definitions, the
  unguarded paged entrypoint and project/child lock inversion. The latest
  functions are inventoried across all migrations; the peer re-review found
  no further concrete regression within that scope.
- The installed Sentry SDK transport test verifies actual outgoing envelopes,
  including standalone spans, sessions, attachments, URL object paths and
  dynamic sampling headers. Thirty-three focused telemetry/callback tests
  pass. Privacy filtering deliberately reduces payload/path detail; Replay,
  session envelopes and arbitrary context are disabled.
- Local desktop/mobile content checks blocked remote email content by
  default with no horizontal overflow; a real IFC4 beam loaded geometry.
- Fresh [dependency audit snapshot](SECURITY_DEPENDENCY_SNAPSHOT_2026-10-09.json):
  zero production findings. Full dependency audit: five high findings through
  the [unpatched Braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), so the required
  publication gate remains red. No waiver or forced major upgrade was added.

The final [CI run on `ba781739`](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/38008081676)
completed the application job successfully: **8,448 tests across 850 files**, all
**76 foundation browser cases**, lint, all four type checks, no-new-JavaScript,
the required SQL packages, production build and bundle gates. The unit suite
took 247.71 seconds; CI browser checks took 1.1 minutes. The 4,769-module CI
build took 29.74 seconds, with 124.3 KiB initial JS/CSS, 3,211.8 KiB all JS/CSS,
467.9 KiB WASM and 3,679.8 KiB combined gzip output. These CI measurements are
separate from the local build above.

The same commit passed the separate secret-scan, Edge typecheck and commercial
SQL/concurrent-PostgreSQL jobs. Dependency audit remains failed for the five
tooling findings. Drift remains failed for membership plus the ten new missing
SQL candidates and the two still-hosted deprecated desktop functions. All
publication and hosted E2E jobs were skipped; no deployment is implied.

The first full CI pass identified two obsolete test contracts: legacy copy
behavior after retirement, and Field Today's former mutation spelling. The
follow-up tests execute the inert endpoint and preserve the captured local-day
assertions. The public Sentry report-key scanner false positive is also fixed
and passed in CI. The slow local full-suite run was stopped after that earlier
CI result and is **not** counted as a passing run. Focused totals overlap and
must not be summed as unique tests. These results cover the isolated branch,
not its future reconciliation with main or real provider delivery.
