# Drawing acceptance network boundaries — 2026-10-09

Status: source and local loopback verification only. No hosted acceptance,
provider calls, token creation, database mutation or customer data was used.

The former page-only observer allowed non-Supabase HTTP requests, first popup
requests, redirects and WebSocket traffic. Real desktop/mobile browser tests
reproduced eight failures: each denied loopback endpoint was reached once.
The two positive local asset reads passed before and after the correction.

The dedicated drawing runner now installs a shared context guard before page
creation and blocks service workers. Only the local reviewed app, font GETs,
staging table GET/HEAD reads, three explicitly reviewed read RPCs, authenticated
user lookup and token refresh are permitted. Edge Functions, Storage, providers,
table writes, unknown RPCs and sign-out are denied. Allowed HTTP requests are
fetched one hop and fulfilled; redirects never reach their next destination.
Every WebSocket is closed without a server connection, including Realtime.
Explicit HTTP reads establish convergence in these cases.

Dedicated global setup verifies the protected manual main workflow, exact
staging origin, known project and organization, active project state and a
public key. Its separate Node transport permits password sign-in and two fixed
parent reads, with bounded request counts, timeout and redirect rejection.
It uses a separate auth-state file; the general global setup is unchanged.
The shared contract suite also proves a 307 sign-in redirect cannot forward a
POST body, using only loopback servers and synthetic values.

The existing workflow still requires all four source checks on the same exact
main-ancestor commit and protects credentials with the staging environment.
Only screenshots and the sanitized status summary may be uploaded. Traces,
video, auth state, request/response bodies and arbitrary error details are
excluded. Setup failures retain only environment/identity/project/browser stage.

Verification: 12 loopback browser contracts pass across desktop/mobile; focused
policy, transport, source-gate and reporter tests pass. Scoped lint and standalone
strict TypeScript are required before source handoff. Hosted source CI and the
four authenticated staging cases remain separate release evidence.
