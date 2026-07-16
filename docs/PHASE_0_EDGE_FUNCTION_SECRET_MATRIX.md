# Phase 0 Edge Function Secret Matrix

Status: Batch 43B read-only planning evidence for Supabase staging ref `abbeavtbifuddtrifvae`. No Edge Function was deployed or invoked during this review.

## Common platform defaults

Supabase owner evidence reports no custom secrets. The platform-provided names visible in staging are:

- `SUPABASE_URL`
- `SUPABASE_DB_URL`
- `SUPABASE_PUBLISHABLE_KEYS`
- `SUPABASE_SECRET_KEYS`
- `SUPABASE_ANON_KEY` (deprecated legacy default)
- `SUPABASE_SERVICE_ROLE_KEY` (deprecated legacy default)
- `SUPABASE_JWKS`
- `SB_REGION`
- `SB_EXECUTION_ID`
- `DENO_DEPLOYMENT_ID`

The deprecated legacy defaults must not be copied into browser configuration. Frontend configuration uses only the owner-confirmed staging Vercel variables.

## Function matrix

### `_shared`

- Built-in secrets only: Yes. This is shared source, not a standalone function.
- Required custom secret names: None.
- Optional custom secret names: `ALLOWED_ORIGINS` when consumed by a CORS helper.
- Safe absence behavior: Consumer-specific default CORS behavior applies; `llm-proxy` remains permissive unless its allowlist is configured.
- Missing-secret gate: No standalone deployment; deploy only as part of a reviewed consuming function.
- Staging value category: Comma-separated staging origin allowlist when used.
- Non-destructive smoke request: None; exercise the consuming function's `OPTIONS` response.
- Deployment order: 0, bundled dependency.
- Rollback revision: N/A; roll back the consuming function revision.

### `account-delete`

- Built-in secrets only: Yes.
- Required custom secret names: None.
- Optional custom secret names: None.
- Safe absence behavior: Platform defaults are required; no custom fallback exists.
- Missing-secret gate: Already deployed at staging version 1, but it must not be invoked or redeployed in Batch 43B.
- Staging value category: Platform-managed project defaults only.
- Non-destructive smoke request: None. Do not invoke this function.
- Deployment order: Hold; current deployment is outside the new rollout sequence.
- Rollback revision: Staging version 1, digest `2f6997f895dc34426a8a13040fe76eb1715056eac54d9bb96b80d85f1b77a1d5`.

### `health`

- Built-in secrets only: Yes.
- Required custom secret names: None.
- Optional custom secret names: None.
- Safe absence behavior: No custom-secret branch; built-in Supabase URL and service/anon key path is required.
- Missing-secret gate: No, provided platform defaults are healthy.
- Staging value category: Platform-managed project defaults.
- Non-destructive smoke request: `GET /functions/v1/health`.
- Deployment order: 1.
- Rollback revision: None; no staging revision exists yet.

### `project-export`

- Built-in secrets only: Yes.
- Required custom secret names: None.
- Optional custom secret names: None.
- Safe absence behavior: Missing platform defaults prevent an authorized export; no custom fallback exists.
- Missing-secret gate: Yes if built-in defaults are unavailable; otherwise no custom-secret gate.
- Staging value category: Project-scoped Supabase URL, anon key, and service-role runtime defaults.
- Non-destructive smoke request: Unauthenticated `GET /functions/v1/project-export`, expecting authorization failure without starting an export.
- Deployment order: 2.
- Rollback revision: None; no staging revision exists yet.

### `schedule-assistant`

- Built-in secrets only: Yes.
- Required custom secret names: None.
- Optional custom secret names: None.
- Safe absence behavior: Missing platform defaults prevent the request; no custom fallback exists.
- Missing-secret gate: Yes if built-in defaults are unavailable; otherwise no custom-secret gate.
- Staging value category: Project-scoped Supabase URL and anon key runtime defaults.
- Non-destructive smoke request: `OPTIONS /functions/v1/schedule-assistant`, followed only by an unauthenticated request that must not write schedule data.
- Deployment order: 3.
- Rollback revision: None; no staging revision exists yet.

### `email-ingest`

- Built-in secrets only: No.
- Required custom secret names: `EMAIL_WEBHOOK_SECRET`.
- Optional custom secret names: `OPENAI_API_KEY`, `EMAIL_CLASSIFY_DISABLED`.
- Safe absence behavior: Without `OPENAI_API_KEY`, classification falls back to the regex path. Setting `EMAIL_CLASSIFY_DISABLED` truthy forces the regex path. Missing `EMAIL_WEBHOOK_SECRET` must reject the webhook.
- Missing-secret gate: Yes when `EMAIL_WEBHOOK_SECRET` is absent; no when only the optional classifier key is absent.
- Staging value category: High-entropy webhook shared secret; optional provider API key; optional boolean kill switch.
- Non-destructive smoke request: `OPTIONS /functions/v1/email-ingest`, then an invalid-secret webhook request expecting rejection before ingestion.
- Deployment order: 4.
- Rollback revision: None; no staging revision exists yet.

### `email-send`

- Built-in secrets only: No.
- Required custom secret names: One provider set: `RESEND_API_KEY`, or all of `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`, and `MS_GRAPH_TENANT_ID`.
- Optional custom secret names: The inactive provider set.
- Safe absence behavior: If no provider is configured, the function returns a provider-configuration failure and sends no email. An inactive provider set may remain absent.
- Missing-secret gate: Yes when neither provider set is complete.
- Staging value category: Resend API credential, or Microsoft Graph application credentials.
- Non-destructive smoke request: `OPTIONS /functions/v1/email-send`, followed only by an unauthenticated or invalid-payload request; no send operation.
- Deployment order: 5.
- Rollback revision: None; no staging revision exists yet.

### `llm-proxy`

- Built-in secrets only: No.
- Required custom secret names: At least one of `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`.
- Optional custom secret names: `ALLOWED_ORIGINS`, `LLM_KILL_SWITCH`.
- Safe absence behavior: Without a provider key, no model call can be made and the function must fail closed. Without `ALLOWED_ORIGINS`, source defaults are permissive. Without `LLM_KILL_SWITCH`, calls remain available when a provider is configured; a truthy value disables calls.
- Missing-secret gate: Yes when both provider keys are absent. `ALLOWED_ORIGINS` is a security-hardening requirement before accepting staging traffic, not a startup minimum. `LLM_KILL_SWITCH` is a break-glass control.
- Staging value category: Provider API key; comma-separated preview-origin allowlist; optional boolean kill switch.
- Non-destructive smoke request: `OPTIONS /functions/v1/llm-proxy`; do not issue a model request during this phase.
- Deployment order: 6.
- Rollback revision: None; no staging revision exists yet.

### `stripe-billing`

- Built-in secrets only: No.
- Required custom secret names for isolated staging: `STRIPE_SK_TEST`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`, and `STRIPE_WEBHOOK_SECRET`.
- Optional custom secret names: `STRIPE_SECRET_KEY` is live-mode only and must not be configured for this staging gate.
- Safe absence behavior: In test mode, absence of `STRIPE_SECRET_KEY` is safe. Missing test key, price IDs, webhook secret, or explicit `billing_config.livemode=false` must prevent billing readiness. Source supports database fallbacks, but staging `billing_config` is currently empty.
- Missing-secret gate: Yes. Keep disabled until test-mode configuration and all required test credentials are verified.
- Staging value category: Stripe test API credential; test price identifiers; webhook signing secret; database test-mode boolean.
- Non-destructive smoke request: `OPTIONS /functions/v1/stripe-billing`, then only an invalid-signature webhook request expecting rejection. Do not create checkout sessions or charges.
- Deployment order: 7, last.
- Rollback revision: None; no staging revision exists yet.

## Minimum custom secret set

For the full eight-function manifest to be deployable, the minimum custom set is conditional:

- `EMAIL_WEBHOOK_SECRET`
- `RESEND_API_KEY`, or the complete Microsoft Graph trio: `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`, `MS_GRAPH_TENANT_ID`
- `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY`
- `STRIPE_SK_TEST`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_BUSINESS`
- `STRIPE_WEBHOOK_SECRET`

`ALLOWED_ORIGINS` should be configured to the staging preview origins before accepting `llm-proxy` traffic. `EMAIL_CLASSIFY_DISABLED` and `LLM_KILL_SWITCH` are optional controls.

No custom secret is required for `_shared`, `health`, `project-export`, or `schedule-assistant`. `account-delete` uses built-in defaults but remains frozen and must not be invoked.

## Current missing-secret matrix

Owner evidence says no custom secrets are configured. Therefore the following are currently unconfirmed/missing:

| Secret name or set | Function | Blocking status |
| --- | --- | --- |
| `EMAIL_WEBHOOK_SECRET` | `email-ingest` | Blocks deployment |
| `RESEND_API_KEY` | `email-send` | Satisfies provider alternative |
| `MS_GRAPH_CLIENT_ID` + `MS_GRAPH_CLIENT_SECRET` + `MS_GRAPH_TENANT_ID` | `email-send` | Satisfies provider alternative |
| `OPENAI_API_KEY` | `llm-proxy` | Satisfies provider alternative |
| `ANTHROPIC_API_KEY` | `llm-proxy` | Satisfies provider alternative |
| `STRIPE_SK_TEST` + `STRIPE_PRICE_PRO` + `STRIPE_PRICE_BUSINESS` + `STRIPE_WEBHOOK_SECRET` | `stripe-billing` | Blocks deployment |
| `ALLOWED_ORIGINS` | `_shared` / `llm-proxy` | Required before accepting staging traffic; not startup minimum |
| `EMAIL_CLASSIFY_DISABLED` | `email-ingest` | Optional |
| `LLM_KILL_SWITCH` | `llm-proxy` | Optional break-glass control |

## Migration and environment gate

The six approved feature-flag migrations are present in candidate order and remain unapplied in staging. The staging database currently ends at `20260703191034_hard_erasure_rpcs`. The physical database backup identifier is `15 Jul 2026 05:54:28 UTC`; it does not cover Storage API objects.

The Supabase dashboard also displays a platform technical-issue notice and an outstanding-invoice warning. These are external environment conditions and are not treated as evidence that secrets are configured.

Batch 43B remains owner-blocked. Do not apply migrations, deploy functions, set flags, create fixtures, invoke `account-delete`, promote the preview, or touch production.

## Batch 43E source and scope update

- `ALLOWED_ORIGINS` is now an exact shared source policy. The owner-confirmed staging value is `https://steelbuild-pro-staging.vercel.app,https://steelbuild-pro-staging-h7gds390x-lorteezy87s-projects.vercel.app`; `*` is not permitted.
- The approved candidate deployment scope remains `health`, `project-export`, and `schedule-assistant`. Health and project-export can deploy with built-in Supabase runtime secrets; schedule-assistant can deploy without a custom secret but cannot receive a functional smoke result without an LLM provider or a proven nonpersistent path.
- `email-ingest`, `email-send`, `llm-proxy`, and `stripe-billing` remain undeployed/disabled for this staging pass. `account-delete` remains frozen at reported version 2 and must not be invoked, redeployed, or modified.
- The current read-only staging function inventory reports 30 migration records and all 13 candidate migrations present. This supersedes the earlier six-pending statement. No migration or function deployment occurred in Batch 43E.
- The current account-delete version discrepancy is insufficient evidence for executable drift because the reported hash matches the prior recorded hash; provider deployment-history evidence is still required for actor, timestamps, and rollback. Keep it as a P1 external gate.
- Project-export source drift was reported on the deployed staging revision. Redeploy only from the exact clean source candidate after explicit approval.
## Batch 44A deployment state

Staging currently has no custom Edge Function secrets. The active staging functions are `account-delete` version 2, `health` version 2, `project-export` version 2, and `schedule-assistant` version 2. Batch 44A did not redeploy any function because the approved function source/configuration was unchanged by the database ACL remediation.

Read-only status:

- `health`: invoked with GET and returned `200`.
- `project-export`: invoked without credentials and returned `401`; an authenticated project fixture is still required.
- `schedule-assistant`: not invoked because no LLM provider secret or proven nonpersistent path is configured.
- `account-delete`: frozen; not invoked, redeployed, modified, or tested.
- Email, LLM proxy, and Stripe integrations: not deployed or invoked in this staging pass.

The minimum custom-secret matrix remains unchanged. Built-in deprecated Supabase keys must not be copied into browser configuration. Deployment and functional smoke remain blocked until owner-provisioned staging fixtures and the approved protected-browser session are available.
