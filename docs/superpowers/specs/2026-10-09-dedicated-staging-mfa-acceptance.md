# Dedicated staging MFA acceptance design

Status: **source-only design; implementation and hosted execution remain unapproved**. This document creates no identities, factors, credentials, provider configuration, workflow, or cleanup authority. It supplements the bounded backend acceptance runner without widening that runner's transport or treating its shared account as a disposable fixture.

## Purpose and evidence boundary

Prove that each of the seven reviewed user-facing Edge handlers denies a freshly authenticated, currently enrolled user at AAL1 and lets the same verified identity at AAL2 reach a deliberately safe branch. A complete 14-case guard matrix proves MFA routing, not successful billing, email delivery, AI inference, session handoff, account erasure, backup restoration, or enterprise readiness.

Freeze the exact main commit, seven-handler relative-import closure hashes, JWT gateway settings and required SQL prerequisite hashes before execution. Require the four staging source jobs (`ci`, `secret-scan`, `edge-typecheck`, `commercial-postgres`) successful together for that exact push SHA. Keep any future workflow manual, main-only and bound to the protected staging environment and exact staging project `ndyfjffsulfbwpmwdmic`. Production publication still requires its separate five-job gate and release review.

## Prerequisites that are not yet satisfied

| Requirement | Current evidence and required action |
| --- | --- |
| New fixture provisioning | Existing runner wiring exposes only the shared staging E2E username/password and public Supabase URL/anon key. No dedicated fixture Admin transport or two new identities have been approved. Source wiring does not prove which other hosted secrets exist. |
| Temporary credential delivery | Choose a reviewed, protected method for the run-specific credentials and authoritative fixture manifest. Never extract existing GitHub secrets, put credentials in Git, or fall back to a personal/repository token. |
| Billing guard reachability | `stripe-billing` checks explicit provider mode/key readiness before authentication/MFA. It requires an explicit `livemode=false` configuration and an owner-approved real `STRIPE_SK_TEST`. The retained October 9 staging release snapshot had zero `billing_config` rows and no custom Stripe key, so mode/key readiness is absent in that snapshot and not confirmed current by this source-only design. Missing mode is not equivalent to explicit false. No configuration mutation is authorized here. |
| Command Center base URL | Confirm the approved canonical staging `STEELBUILD_BASE_URL`: `https://steelbuild-pro-staging.n-lortz1987.workers.dev`. Missing or different configuration is an explicit incomplete result. |
| Cleanup authority | Approve the exact-run Admin cleanup procedure and journal-retention behavior before creating fixtures. An executable cleanup method is not supplied or authorized here. |

Unknown-action billing guard checks do not require a price map or webhook signing secret, but neither prove monetization. AI/email provider keys are unnecessary for the invalid safe profiles below. Do not insert dummy keys, copy production secrets, weaken readiness checks, or reorder application guards for acceptance.

## Smallest isolated fixture

Use two new identities, one new empty workspace and one new empty project per run. Identity A is the workspace owner and identity B is an admin who is never an owner. Both identities have unique run-specific addresses, random passwords and authoritative `app_metadata` purpose/run identifiers. Do not adopt or mutate existing users.

The preferred first execution uses separately owner-provisioned fixtures plus a reviewed manifest, avoiding a new privileged public provisioning endpoint. Provisioning must use an approved server-side Auth Admin channel with `email_confirm: true`, not signup, invitation or magic-link flows. Do not directly insert Auth users, factors or sessions to forge authentication.

Before exercising a handler, an authoritative privileged census must confirm exactly these two run-owned users, this workspace/project, A's owner membership and B's admin membership, and no other memberships, Stripe bindings or stored objects. The browser's user metadata or an unprivileged read is not sufficient evidence of disposable ownership. Record only bounded run identifiers and aggregate results in retained reports; keep operational IDs in the protected fixture manifest.

## Fresh authentication proof

1. Sign in B by password and verify the returned user through Auth, binding subject, issuer, role and expiry to the expected fixture.
2. Enroll exactly one TOTP factor on B. Bind the returned factor ID to this run; never modify A, the shared E2E account, or arbitrary existing factors. No phone/SMS factor is permitted.
3. Challenge and verify B's factor with at most two bounded TOTP windows. Keep the password, seed/QR, challenge contents and session tokens in runner process memory only.
4. Verify the accepted AAL2 token through fresh Auth user retrieval and require the current verified factor, exact identity and valid expiry. Decoding an unverified token or trusting a cached factor list is insufficient.
5. Perform a fresh password sign-in after enrollment to obtain AAL1. Retrieve the user again and require the current verified factor before each guard phase. This fresh enrolled AAL1 session is the required negative proof.
6. Optionally test the pre-enrollment session separately. Factor verification can revoke other sessions; a stale token's 401 is a revoked-session result, never evidence of the required 403 `mfa_required` response.
7. Recheck current Auth identity/factor and authoritative fixture ownership after the matrix. Any change or uncertainty makes the affected phase incomplete or failed.

Auth/session updates, the one B factor and the normal project-export audit are explicit bounded side effects. No artifacts may contain sessions, factors/seeds, passwords, raw errors, response bodies, exports, request headers, screenshots or QR images.

## Closed seven-handler matrix

For each profile, the fresh enrolled AAL1 result must be HTTP 403 with `code: mfa_required`. Generic 401, a workspace authorization 403, or missing-provider 503 must not count as this proof. AAL2 must reach the specific safe branch below. All IDs are bound to the verified fixture manifest; no arbitrary request body, URL, action or caller-selected actor is allowed.

| Handler | Fixed safe request | Expected AAL2 proof and side-effect boundary |
| --- | --- | --- |
| `llm-proxy` | Unknown provider and model | Exact unknown-provider 400 after MFA. If the independently verified kill switch intercepts after MFA, report that distinct branch and leave the provider-validation case incomplete. No inference. |
| `email-send` | Empty object | Exact missing-`project_id` 400 after MFA. No email. |
| `command-center-session-handoff` | `action: create`, empty state/challenge and null encrypted session | Exact `Invalid handoff request` 400 after MFA. No handoff creation or redemption. |
| `command-center-read` | Schema v1, only `project`, exact fixture project, limit one | HTTP 200 with exactly the owned project and canonical staging link. No unrelated rows. |
| `project-export` | Exact fixture `project_id` | HTTP 200, v2 shape, credential exclusion and project ownership checked in memory. Validate its normal activity record's actor/project/action/entity/count metadata; do not suppress the audit or create an extra record. |
| `stripe-billing` | Unknown acceptance action and exact fixture `org_id` | Exact unknown-action 400 after membership/MFA. No customer/session, checkout, portal or provider request. Requires valid explicit test-mode configuration first. |
| `account-delete` | Exact fixture `org_id`, using B | Exact owner-only `forbidden` 403 after MFA. A remains owner and B remains admin. Never pass `mode: account`; never invoke an erasure RPC. |

The account-delete distinction is deliberate: AAL1 must be rejected by MFA, while AAL2 reaches the independent owner check. A status code alone cannot distinguish these branches. This design does not test authorized erasure.

## Transport and implementation inventory

A future harness should have a dedicated closed policy and runner rather than widening `scripts/staging-backend-acceptance/acceptance.ts`. Reuse that runner's pure proof, byte/count budget, redirect-denial and redacted-report patterns only where their contracts remain valid. Its shared fixture IDs and general safe-case expectations are not suitable replacements for this manifest.

The design inventory is: a run manifest validator, a phase-bound Auth/TOTP transport, seven fixed handler profiles, fresh Auth proof, in-memory export verifier, authoritative before/after census adapter, cleanup result verifier and a summary-only reporter. Any future workflow remains separately reviewed. Auth Admin operations and user-token operations must be separate capabilities; ordinary profiles must have no Admin credential or arbitrary URL path.

Future regression tests must prove wrong subject/factor/org/project/role rejection, verified AAL proof rather than token claims alone, exact request budgets, redirects and oversized-response rejection, no provider/erasure/handoff route, expiry/factor-change races, secret-free reporting and non-green cleanup failures. Use local mocked or loopback transports in general CI. The existing `_shared/mfaEntrypoints.test.ts` loader can help exercise real entrypoints locally, but its generic test body includes unsafe actions and must never be reused as a hosted request template.

## Cleanup and failure policy

Approve cleanup before provisioning, using exact run-owned IDs with authoritative app metadata and ownership checks. Do not turn this guard test into account erasure or reuse its account-delete handler for cleanup. Do not delete arbitrary users discovered through a broad list or untrusted metadata. Do not silently delete immutable journals to make counters zero.

A privileged operator must verify removal of run-owned transient users, factors/sessions, memberships, workspace/project and unexpected object scope according to the reviewed cleanup contract, while documenting any records legitimately retained by audit/financial retention. If cleanup fails or authority is uncertain, stop new fixture attempts, quarantine this exact run for owner recovery and report incomplete cleanup. No all-green result is permitted.

The retired `staging-e2e-bootstrap` is not a provisioning fallback: it hardcodes the old staging project `abbeavtbifuddtrifvae`, uses a private one-time maintenance marker and has different fixture assumptions. Never repoint it, clear its completion marker, reactivate its broad cleanup, or reuse historical sessions/seeds. The October 7 synthetic identities were cleaned up; their prior success is not current MFA evidence.

## Review references

- Existing bounded runner: `docs/audits/STAGING_BACKEND_ACCEPTANCE_RUNNER_2026-10-09.md` (PR #529; source `ec203806aa469196b54ae0e30fb8d960093f103b`).
- [Supabase Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser): server-side creation and confirmed-email option.
- [Supabase MFA enrollment](https://supabase.com/docs/reference/javascript/auth-mfa-enroll): unverified enrollment, verification upgrade and session implications.
- [Supabase challenge and verify](https://supabase.com/docs/reference/javascript/auth-mfa-challengeandverify): TOTP challenge/verification operation.

These references support the design, not evidence of a deployed or executed harness. No provider delivery, real charge, MFA fixture creation or cleanup has been performed by this change.
