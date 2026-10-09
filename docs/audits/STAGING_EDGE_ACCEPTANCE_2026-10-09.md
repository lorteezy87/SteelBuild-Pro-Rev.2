# Staging Edge deployment and acceptance evidence — 2026-10-09

Seven reviewed Edge functions are deployed to staging with source and gateway
JWT settings verified. Hosted acceptance remains incomplete. Production Edge
functions and the production frontend were not changed by this deployment.

## Latest checkpoint: `32cf2c50`, hosted acceptance still failing

All seven functions were refreshed from exact merged main
`32cf2c50a6eb603bc213868de4ffc54c7f196601` after its completed push
[CI run 37954465036](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/37954465036).
App `113901328976`, commercial PostgreSQL `113901328952`, Edge typecheck
`113901328959`, and secret scan `113901329307` passed together. Production
drift remained failed; publishing remained held. None of these gates was waived.

The final staging versions are `project-export` **37**, `llm-proxy` **48**,
`email-send` **34**, `command-center-read` **17**,
`command-center-session-handoff` **18**, `stripe-billing` **34**, and
`account-delete` **7**. Every function was immediately read back as ACTIVE,
with its prior JWT mode and every local source file byte-identical to the Git
payload. The seven source closures and eleven prerequisite SQL payloads are
unchanged from the earlier checkpoint below. Fresh complete inventories also
verified that `email-ingest` **35** and `health` **16** kept their bundle hashes,
versions and JWT settings.

The owner's local `Documents/Codex/release-evidence` directory retains:

- `2026-10-09-32cf2c50-staging-edge-before.json`, prior source archive SHA-256
  `46de614c64de78c18cb66f0f4f7e6cd4c8a04664fc4d994c30b9ca544a87f535`.
- `2026-10-09-32cf2c50-staging-edge-deployed.json`, complete source/CI/SQL,
  before/after inventories and readback record SHA-256
  `cfb9b03674f10ff5531b007c5122d2fe5f11d5e351d54534f8f688142aeb7c22`.

### Drawing browser result

[Run 37956107847](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/37956107847)
passed source verification, build and authenticated browser setup. The previous
setup failure is resolved for this run. **All four drawing cases still failed**;
the sanitized report has zero global errors and eight retained screenshots.
The typed Draft detail correctly renders missing source coverage, and the legacy
unclassified detail states that it has no drawing authority. These partial
observations do not establish a passing end-to-end workflow.

Independent inspection found a stale test expectation for the heading
`Detailing Control Center`; the actual intended page is `Drawing Control`.
The remaining case failures require diagnosis before another hosted attempt.
The legacy detail also visibly offers a misleading `Release for Fabrication`
action despite its exclusion notice; this needs a separately tested UI correction
while preserving server enforcement. The synthetic two-PDF workflow remains
undispatched until the read-only cases pass.

### Bounded backend result

[Run 37956141828](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/37956141828)
reports **FAIL at the audit stage**. Fresh authentication and exact synthetic
parent verification passed. Method rejection and anonymous/safe-invalid request
checks passed where configuration allowed them. Command Center read and billing
remain explicitly INCOMPLETE because required configuration is unavailable.

The synthetic project export returned HTTP 200 with its validated v2 shape:
96 tables, 155 rows, one file reference, one Storage inventory entry and zero
mailbox rows. Credential-exclusion shape checks passed, but nonempty mailbox
redaction remains untested. The subsequent audit verification correctly failed:
a read-only database inspection found the new export activity, with matching
counts, but its actor is NULL. The installed activity trigger replaces the
supplied actor with `auth.uid()`; the handler's service-role write therefore
loses the verified caller. A forward correction must use the caller's existing
RLS-scoped INSERT/SELECT permission and verify the returned actor before allowing
export success. No trigger, permission or historical audit row was changed, and
the export was not retried. No passing backend release is implied.
The sanitized summary and original ZIP are retained
locally as `backend-acceptance-37956141828-summary.json` and
`backend-acceptance-37956141828.zip`.

These checks did not test AAL2 step-up, erasure, provider delivery/payment,
cross-tenant/revoked-session cases, Storage bytes or restoration. Production
functions and frontend remain unchanged.

## Earlier deployment: `04285069`

- Target: `ndyfjffsulfbwpmwdmic` (staging).
- Main commit: `04285069c26c8e57c59b491cd202be6100a01b79`.
- Completed push CI: [37948706537](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/37948706537).
- Required staging jobs succeeded together: app `113881597643`, commercial
  PostgreSQL `113881597789`, secret scan `113881597872`, Edge typecheck
  `113881597938`. Production drift did not pass; no check was suppressed.
- Execution used the existing authenticated Supabase connector under the
  [staging-only procedure](STAGING_OAUTH_EDGE_RELEASE_2026-10-09.md). No PAT was
  created, exported or stored, and no GitHub environment credential was changed.

| Function | Before | After | Gateway JWT | Local source closure SHA-256 |
| --- | ---: | ---: | --- | --- |
| project-export | 35 | 36 | true | `e0d121c91868742f7889e227710f34f5a0366e123ad559ffa73d29e4f7b6d12a` |
| llm-proxy | 46 | 47 | false | `ecc83c5000dbaf2707ef2a9887ed71cc376db2c4b648388cbe293ed96d1daaa9` |
| email-send | 32 | 33 | true | `647ac2e0b693c033e4a0f85f2f850e7d7a865d0bad20d651b125c1f8c7479271` |
| command-center-read | 15 | 16 | false | `37ac4a0b4693e98fc452d554aebab7e19834ac74b45051188ff9fe0ed075f3e7` |
| command-center-session-handoff | 16 | 17 | false | `0d489e3afeab6f23df4d9b1edb058d509329afb73b4689d6c710aaa5d626defd` |
| stripe-billing | 32 | 33 | false | `4d06b92c6fc6a52399a341b55013db5260abb89a4ffdff396f506db4ee42e0e3` |
| account-delete | 5 | 6 | true | `d85127a8141a2c7dfeebb663d0d4fce41ebced1a4af97387b077733d257978de` |

Every deployed function was read back as ACTIVE at exactly its prior version
plus one. All uploaded local source file contents matched the exact Git payload
as UTF-8 bytes. The API sometimes returned paths with the common `supabase/`
prefix removed; each returned path was mapped by a unique suffix to the exact
payload path. Content was not normalized to obtain a match. Closure hashes do
not lock the versions resolved by external dependency imports.

Fresh before/after function inventories also confirmed `email-ingest` version 35
and `health` version 16 retained their versions and bundle hashes. No other
function was deployed. Fourteen prior staging/production source bundles and
metadata remain in the owner's local release evidence archive; archive SHA-256
is `ccdeeedc0d95da63a9bda8f369bc3ba4ef06241417a34cd6562d53d6febee0d7`.
This retention is not a restore rehearsal.

## Prerequisite SQL verification

Fresh staging ledger payload hashes matched the exact committed files for
`20260922015713`, `20260927150000`, `20260927160000`, `20261005100745`,
`20261007073051`, `20261007084117`, `20261007090057`, `20261007112918`,
`20261008032524`, `20261008071019`, and `20261009125901`. The comparison retained
both raw committed-file SHA-256 and ledger-payload MD5. This step was read-only;
it did not apply SQL or stamp a ledger.

The durable local record is
`Documents/Codex/release-evidence/2026-10-09-04285069-staging-edge-deployed.json`.
It retains the exact source, CI identities, eleven SQL hash pairs, prior archive
hash, seven versions/JWT/source hashes, path mappings and deployment metadata.
It contains no session credentials or provider secrets. This record supersedes
the same-prefix progress file, which recorded only the first deployment.
The original complete before/after inventories are retained separately as
`2026-10-09-04285069-staging-edge-inventories.json` in that directory; SHA-256
`1c56bbe42a8c52c3844d1dd97dcb0a163e271e38e4bf54e5825b9e09c7b39e7c`.

## Hosted drawing acceptance: failed setup, no case passed

[Run 37949854746](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/37949854746)
used exact main `04285069c26c8e57c59b491cd202be6100a01b79`. Its source verification
job passed and the production build succeeded. Protected password sign-in and
fixed active staging parent validation completed. Browser setup then failed
before any of the four acceptance cases ran.

The retained artifact reports `status=failed`, `globalErrors=1`,
`setupFailureStages=["browser"]`, and `cases=[]`. It contains no screenshots.
Neither setup authentication nor a successful build is a passing drawing case.
Read-only Supabase logs during the failure show successful Auth and application
reads with no HTTP errors; this alone does not identify the browser failure.
The failure was subsequently reproduced locally with the same production
bundle and synthetic API fixtures: blocked monitoring envelopes caused browser
console errors. The exact local discard correction passes that reproduction
while preserving the external request guard and real runtime-error detection.
See [the diagnosis and bounded correction](DRAWING_BROWSER_SETUP_2026-10-09.md).
The hosted result remains failed until a new exact-source run passes.

The synthetic two-PDF lifecycle has not been dispatched. It remains sequenced
after the read-only drawing checks pass. No existing drawing revision was
backfilled or declared approved by these checks.

## Remaining release boundaries

Fresh AAL1/AAL2, membership revocation, handoff and synthetic erasure acceptance
remain required for the seven deployed handlers. The bounded backend runner in
[this audit](STAGING_BACKEND_ACCEPTANCE_RUNNER_2026-10-09.md) can establish only
its listed read/rejection/export checks; its INCOMPLETE result cannot certify
the untested boundaries. Staging provider configuration and the read service's
public base URL also remain unresolved at this checkpoint.

Production remains on its prior Edge versions and frontend build. The temporary
`CLOUDFLARE_ENABLED=false` publication hold remains in place. Restoring it and
completing the normal five-gate publication is still required. Staging OAuth
deployment does not satisfy a successful same-SHA staging GitHub release run or
replace the required production reviewer. Reverify staging bundles and repeat
required staging acceptance for the exact final release SHA before promotion.
