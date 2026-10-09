# Drawing acceptance follow-up — 2026-10-09

## Evidence and boundary

Hosted read-only run [37956107847](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/37956107847), candidate `32cf2c50a6eb603bc213868de4ffc54c7f196601`, completed authentication and exact staging project selection. Its four cases failed later. All eight retained screenshots were inspected: typed Draft evidence correctly remained unverified with a missing PDF revision; the legacy NULL-type record was explicitly excluded from drawing approval; the matrix rendered that legacy set without a governing submittal. This is partial evidence, not passed acceptance.

Two local production-build reproductions used synthetic intercepted API responses and synthetic local authentication, with no hosted calls or credentials:

- The typed test failed waiting for the retired `Detailing Control Center` heading. The shipped heading is `Drawing Control`. The acceptance contract now checks that actual heading and retains the canonical route, project read, fixture identity and Sets & revisions assertions.
- The legacy case passed with immediate responses, but delaying its comments read by two seconds reproduced a request-cancellation failure after the test navigated to the matrix. It now waits for owned pending reads and checks their health before leaving the detail. Hosted screenshots showing `Loading comments…` match this mechanism, but the original sanitized artifact does not conclusively establish its sole failure cause.

No abort, console error, runtime error, failed request, forbidden route, redirect or write is exempted. Dedicated browser contracts verify that waiting permits a delayed read to finish and that an aborted read still fails. Closed per-case scenario/stage/category annotations now distinguish future failures without retaining raw errors, URLs, payloads, identity or auth artifacts. Existing setup diagnostics and network policy remain intact.

## Local validation

- 70 real Chromium acceptance contracts passed across desktop and mobile, including the new delayed-read and abort cases.
- 25 source-gate and reporter tests passed; raw-error and tainted-annotation privacy checks remain enforced.
- Actual `tsc -p tsconfig.scripts.json` passed.
- Both drawing scenarios passed locally with the two-second comments delay after the correction. Local intercepted data is not hosted authentication/RLS acceptance.

No hosted rerun, fixture mutation, deployment or release-gate change was performed in this follow-up. Root must integrate the reviewed commit and rerun the protected workflow after the exact main SHA passes all four staging source gates.
