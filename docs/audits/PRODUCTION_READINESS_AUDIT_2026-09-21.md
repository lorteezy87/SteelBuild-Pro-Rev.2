# SteelBuild Pro (Rev.2) — Production-Readiness Audit

**Audit date:** 2026-09-21 · **Tree audited:** `ada5426d` (`main` == `claude/epic-ritchie-0chl93`, 0 commits apart) · **Mode:** audit-only (no application code, migrations, configuration, dependencies, lockfiles or deployment settings were modified; this report is the only file added).

**Method.** Repository discovery → checklist → parallel category audits (auth/session, RLS/DB authorization, edge functions, client data layer, business-rule engines, input validation/XSS, DB schema/migrations, performance, mobile/store readiness, web/CI/observability/DR), each producing file:line evidence that was then spot-verified by a second read. The repo's own quality ladder was executed end to end (lint, five typecheck gates, hooks check, dependency audit, knip, Vitest, production build, bundle report). Live production was **not** queried with SQL and nothing was mutated; three read-only Supabase **management-plane** reads were taken for reconciliation (security + performance advisors, Edge Function inventory, migration ledger). Secrets are never reproduced; any credential-shaped string found is reported by category and location only.

**Classification vocabulary used throughout:** `CONFIRMED DEFECT` (reproducible from repository evidence), `PROBABLE CONCERN` (strong evidence, one unverified precondition), `UNVERIFIED RISK` (needs runtime, dashboard or live-DB verification), `INFORMATIONAL`, `RECOMMENDATION`.

---

## Executive verdict

**Bottom line.** The application core is well built and its tenant boundary holds: every table has RLS, the authorization chokepoints are org-aware and fail closed, no cross-tenant *read* path was found, money is integer-cents, record numbers are minted atomically, and the repo's own quality ladder is green (lint, five typecheck gates, 6,677 tests, production build, dependency audit). It is **not yet production-ready on the terms set for this audit**, for six reasons that are each fixable in days to weeks:

1. **Authorization has real gaps inside a tenant and one cross-tenant write primitive.** An org admin can delete the sole owner's membership and lock the workspace (AUTH-1); TOTP MFA is enforced only in the browser and the gate is racy, so a stolen password reaches all data (AUTH-2); every org member can read pending invitation tokens (AUTH-3); the "viewer is read-only" invariant is missing on 13 tables, including the fab-release sign-off in the repo's copy of the policy (RLS-2); two production-only RPCs let any signed-in user forge audit rows in any tenant (RLS-1).
2. **The release pipeline's gates do not bind.** Secret scanning and the migration drift check are red-badge-only, not deploy gates (CI-1); the production Cloudflare token is reachable from any branch's workflow (CI-2); `main` has no branch protection and a laptop deploy script exists (CI-3); the "no new JavaScript" gate is vacuous in CI (CI-4).
3. **There is no monitoring and no rehearsed recovery.** No uptime monitor or Sentry alert exists (OBS-1); PITR is off and no restore has ever been rehearsed (DR-1); the nightly Storage backup's activation is unverified (DR-2); and the repository cannot rebuild the production schema — 171 live functions and 48 drifted bodies, including every RLS helper, exist only in production (DB-11).
4. **Documented invariants have regressed in code.** The schedule bulk toolbar and a `Number(null)` coercion break the status/percent contract (DATA-2, DATA-3), the zone panel invents official RFI numbers when the RPC fails (LOGIC-1), the Pay Applications contract query is permanently broken by a global query default (DATA-1), and two importers write `deliveries` in a way production rejects (DATA-4).
5. **Scale cliffs sit at the sizes CLAUDE.md already reports.** The Piece Register renders ~28k rows unvirtualised from a `select *` read, the 3D tab re-pages the whole table every 30 seconds, canonical realtime has no debounce, and every entity read ships every column (PERF-1 … PERF-4).
6. **Mobile store readiness is far from the runbook's claims.** iOS: no Xcode project is committed, the four native plugins the 4.2 defence cites have zero call sites, auth e-mails redirect to `capacitor://localhost`, signed-out users see plan prices in the native shell, and downloads are dead in WKWebView (MOB-2 … MOB-5). **Android/Google Play: 0% — no platform exists** (MOB-1).

**Counts.** 0 critical · **20 high** (16 confirmed, 4 probable/unverified) · **54 medium** · ~45 low/informational, after de-duplication by root cause across ten category audits. No committed credential was found in the tree or its history (one public anon key in a deleted helper is informational).

**Objective-by-objective:**
| Objective | Status | Gate to "yes" |
|---|---|---|
| 1. Secure, stable, maintainable, production-ready | **Not yet** | P0 list in §7 (authorization gaps, CI gates, monitoring/PITR, invariant regressions, PKCE/MFA) |
| 2. Publishable to the Apple App Store | **Not yet** | §6.1 code-level list + a Mac/ASC pass; nothing native has been built or run |
| 3. Publishable to Google Play | **No** | no Android platform; §6.2 is a from-scratch list incl. a web deletion URL |
| 4. Works correctly as a web app | **Largely yes** | SPA delivery, headers, offline shell and fail-fast env are sound; fix WEB-1…WEB-4 and the DATA/LOGIC regressions |
| 5. Protects user and tenant data across roles | **Cross-tenant: yes; within-tenant: partially** | AUTH-1/2/3, RLS-1/2/4, DB-9 |
| 6. Performs efficiently under realistic load | **Not at the documented project sizes** | PERF-1 … PERF-7 |
| 7. Reliable build/test/deploy/monitor/recover | **Build/test yes; deploy gating, monitoring and recovery no** | CI-1…CI-4, OBS-1, DR-1/DR-2/DR-4, DB-11 |

**What is genuinely strong** (do not regress while fixing the above): the RLS chokepoint design and its September hardening; the entity client's explicit truncation model and error propagation; RPC-only numbering; the Stripe webhook's signature-before-write and event idempotency; the desktop hand-off cryptography; the e-mail ingest's fail-closed secret handling; the documented, correct chunk-splitting; the offline outbox's coalescing and unique-violation handling; the fail-closed retirement and drift tooling; and an unusually honest set of runbooks that state what is *not* done.

## 1. Architecture map (Phase 1)

### 1.1 What the product is
Multi-tenant SaaS for structural-steel fabricators/erectors: drawings + submittals + RFIs workflow (the "moat"), fab release gate, piece register / production tracking, schedule (Gantt), deliveries, field logs, cost/SOV/pay-apps/backcharges, document control intake, LLM-assisted revision intelligence, Stripe billing. Tenancy: `organizations` (workspace) → `projects` (`org_id NOT NULL`) → ~130 project-scoped tables. Founding customer org is S&H Steel; there is no legal hold (CLAUDE.md).

### 1.2 Stack and delivery model
| Layer | Technology | Evidence |
|---|---|---|
| Client | Vite 6.4 + React 18.3 SPA, react-router-dom 6.30, TanStack Query 5, Radix primitives, CSS-variable design system (Tailwind present as compat only) | `package.json`, `vite.config.js`, `src/globals.css` |
| Backend | **No app server.** Supabase Postgres 17 + RLS + RPC (PostgREST, `max_rows = 1000`), Supabase Auth (gotrue; email/password, TOTP MFA), Supabase Storage (`app-files`, `email-attachments`), Deno Edge Functions | `supabase/config.toml`, `ARCHITECTURE.md` |
| Edge Functions (deployed, live inventory 2026-09-21) | `llm-proxy` (v42, verify_jwt **off**, own auth), `email-ingest` (v33, off, shared-secret), `email-send` (v29, **on**), `stripe-billing` (v29, off, own auth + Stripe signature), `project-export` (v28, on), `health` (v14, off, public), `legacy-app-files-copy` (v18, off, entrypoint `source/index.ts`), `command-center-session-handoff` (v13, off), `command-center-read` (v12, off), `sheets-api` (v12, off — **not in this repo**, belongs to the abandoned Sheets prototype), `account-delete` (v3, on) | management-plane `list_edge_functions` |
| Third parties | Stripe (Checkout/Portal/webhooks), OpenAI + Anthropic (via `llm-proxy` only), Sentry (browser, masked replay; optional Deno DSN), Microsoft Graph + Resend (email-send), Power Automate → `email-ingest`, Google Fonts CDN, Open-Meteo (weather risk), Cloudflare Web Analytics (injected by the zone) | `public/_headers` CSP, `supabase/functions/*` |
| Hosting / CDN | Cloudflare Workers static-asset Worker `steelbuild-pro-rev-2` (no Worker script), custom domains `steelbuild-pro.com` + `www`, SPA fallback, `public/_headers` for security/caching headers | `wrangler.jsonc`, `public/_headers` |
| Mobile | **Capacitor 8 iOS shell only** (`capacitor.config.ts`, `@capacitor/ios`); the `ios/` Xcode project is not committed (generated on a Mac). **No Android platform at all** (no `android/`, no `@capacitor/android`). PWA manifest + offline app-shell service worker (`public/sw.js`) | `capacitor.config.ts`, `package.json`, `.gitignore`, `mobile/ios/*` |
| Observability | Sentry (`src/instrument.js`: 10% traces, 10% replay, 100% error replay, `sendDefaultPii:false`, beforeSend scrubbing), local ring buffer `window.__sbpErrorLog`, Workers Logs (`observability.enabled`), `health` function + `public/health.json`, CI post-deploy HTTP probe | `src/instrument.js`, `src/lib/telemetry.js`, `wrangler.jsonc`, `ci.yml` |
| Background jobs | `pg_cron` in-DB (alerts engine, RFI SLA escalation, stuck-extraction reconciler), nightly GitHub Actions Storage backup to an offsite rclone target (`storage-backup.yml`) | `20260101000020_baseline_seed.sql`, `.github/workflows/storage-backup.yml` |
| CI/CD | GitHub Actions `ci.yml`: lint, no-new-JS, 4 typecheck gates, Vitest (TZ=Pacific/Kiritimati), foundation Playwright, DB helper search-path test, production build; gated `deploy-cloudflare` on push to `main` (needs `CLOUDFLARE_ENABLED`); PR preview via `wrangler versions upload`; advisory `dependency-audit`; blocking `secret-scan` (gitleaks) and `supabase-drift`; opt-in post-deploy e2e; dead staging jobs (staging no longer exists) | `.github/workflows/ci.yml` |

### 1.3 Entry points and data paths
- **Boot:** `index.html` (inline anti-FOUC theme script, hashed in CSP) → `src/main.jsx` (Sentry first, date shim, manifest injection, SW registration on real deploys only, native bootstrap when `Capacitor.isNativePlatform()`) → `AppBootstrap` → `AppProviders` (theme, auth, react-query, router, project) → `Root` (public legal pages bypass auth) → `AuthenticatedApp` (auth gates: session, recovery, MFA step-up, org onboarding) → `AppRoutes` (95 registry entries, all `lazyWithRetry`) inside `LayoutRoute`.
- **Client → DB:** `@/api/supabaseClient` barrel → `src/api/client/entityClient.ts` (`LIST_ROW_CAP` 2000 vs `SERVER_MAX_ROWS` 1000, truncation telemetry, soft-delete filtering, field mapping) → PostgREST with the user's JWT → RLS. Raw `supabase.from()` outside the data layer is an ESLint **error** with an enumerated grandfather list (`eslint.config.js`).
- **Client → Edge Functions:** `src/api/client/functions.ts` / `llm.ts` → `/functions/v1/*` with bearer JWT. Functions that run with the service role re-verify the user via GoTrue `/auth/v1/user` and re-check org/project membership (see §edge findings).
- **Authentication:** Supabase Auth sessions in `localStorage` (supabase-js default), refresh handled by the SDK; global role `user_profiles.role`, org role `organization_members.role`, project role `user_projects.role`; DB helpers `user_has_project_access` (org-aware) / `user_has_project_role_at_least` are the authorization chokepoints for ~130 tables.
- **Authorization enforcement points:** (1) RLS policies + restrictive viewer-floor policies; (2) BEFORE triggers (`enforce_project_update_guard`, `org_protect_billing_columns`, `prevent_user_profile_role_change`, `enforce_org_member_guard`, activities append-only, drawing-set lock guards, fab-release gate); (3) SECURITY DEFINER RPCs that re-check membership internally; (4) Edge Functions' own checks; (5) client route gating (`AdminRoute`, `useModuleAccess`) — UI only.
- **Storage:** objects under `<org_id>/uploads/...`; `storage.objects` policies require a UUID first path segment + `user_is_org_member()`; signed URLs only (`getSignedUrl`), buckets private.
- **Realtime:** `postgres_changes` invalidation hooks (`useRealtimeInvalidation`, `useCanonicalReportingRealtime`) on selected tables in the `supabase_realtime` publication.
- **Billing:** `/Billing` → `stripe-billing` (checkout/portal) → Stripe → `/webhook` → service-role update of `organizations.plan` (trigger blocks client changes); plan limits enforced in `create_project` / `accept_invitation`.
- **Build & deploy path:** `npm run build` (Vite, `manualChunks`, hidden source maps only when `SENTRY_AUTH_TOKEN` is present, `web-ifc.wasm` copied to `public/wasm/`) → `dist/` (+ `_headers`) → `wrangler deploy` from CI → Cloudflare; rollback = `wrangler rollback <version-id>`. Migrations are applied and stamped **by hand** (CLAUDE.md); Edge Functions are deployed by hand.

### 1.4 Repository shape
`src/` (1,328 non-test source files, ~298k LOC, 627 test files), `supabase/` (120 executable migrations incl. a 423 KB baseline dump, 190 archived, 2 quarantined, 6 external, 12 function dirs), `scripts/` (CI gates, backup, drift, retirement), `docs/` (runbooks, audits, app-store), `e2e/` (Playwright, opt-in), `mobile/ios/` (privacy manifest + Info.plist snippet templates), `public/` (assets, SW, headers). Tracked non-source clutter: `.playwright-mcp/` (44 screenshot/snapshot files, up to 690 KB each), `Claude outputs/SH_Steel_PM_Tracker.xlsx`, `artifacts/submittal-control-center/`, `.superpowers/*/state/server.pid`, `.codex/environments/environment.toml`, `dev/foundation.html`.

## 2. Measured evidence (what was executed, and what it showed)

### 2.1 The repo's own quality ladder (run on this tree, Node 22.22 / npm 10.9; CI uses Node 24)
| Gate | Result | Notes |
|---|---|---|
| `npm run lint` (`eslint . --quiet`) | **pass, 0 errors** | Without `--quiet`: **1,741 warnings** in 1,911 files, of which **1,552 are `jsx-a11y/*`** (532 `label-has-for`, 381 `label-has-associated-control`, 260 `click-events-have-key-events`, 247 `no-static-element-interactions`, 50 `control-has-associated-label`, 43 `no-autofocus`, 26 `no-noninteractive-element-interactions`), 137 unused vars, 51 `react-hooks/exhaustive-deps`. CI never sees any of them. |
| `check:no-new-js` | pass | Vacuous under a shallow CI checkout (see CI-4). |
| `typecheck` (src + scripts) | pass | Base `tsconfig.json` is `strict: false`. |
| `typecheck:js` | pass | `checkJs: false` → module resolution only. |
| `typecheck:strict` | pass | 81 strictNullChecks errors ignored in 1 grandfathered file (`src/pages/ResourceScheduling.tsx`). |
| `typecheck:noimplicitany` | pass | 180 errors ignored in 9 grandfathered files. |
| `check:hooks` | pass | rules-of-hooks clean. |
| `scripts/audit-gate.mjs` (prod deps, moderate+) | pass | 2 waived react-router advisories (GHSA-wrjc-x8rr-h8h6 open-redirect-via-backslash, GHSA-337j-9hxr-rhxg SSR deserialization), review-by 2026-12-31, no 6.x fix. |
| `npm audit --audit-level=high` | pass | 5 moderate total: the 2 above + `uuid` <11.1.1 via `xcode` via `@capacitor/cli` (dev tooling). 0 high/critical. |
| `knip` | **96 unused files, 37 unused dependencies, 3 unused devDependencies, 463 unused exports, 325 unused exported types, 20 duplicate exports** | Unused deps include `@capacitor/camera`, `@capacitor/haptics`, `@capacitor/share`, `@capacitor/preferences`, `@stripe/react-stripe-js`, `@stripe/stripe-js`, `html2canvas`, `react-hook-form`, `@hookform/resolvers`, 21 `@radix-ui/*` packages, `cmdk`, `vaul`, `next-themes`, `react-day-picker`. `public/sw.js` and `src/lib/draftStorage.ts` are listed as unused files. knip is installed and configured but not run in CI. |
| `vitest run` | **696 files / 6,677 tests passed** in 219 s | CLAUDE.md's "6,470 / 678 as of 2026-09-19" is already stale (growth is fine). Suite pinned to UTC. |
| `npm run build` | pass in 50 s | Rollup warns about chunks > 500 KB. No source maps emitted locally (only when `SENTRY_AUTH_TOKEN` is set). `dist/_headers` and `dist/wasm/web-ifc.wasm` present. |
| `perf:bundle` | initial HTML assets **162.5 KB gzip** (budget 320), total **3,114 KB gzip / 12.6 MB raw** (budget 3,600) | Budgets exist in the script only; CI does not enforce them. |

### 2.2 Bundle composition (production build)
| Chunk | Raw | Gzip | Loaded when |
|---|---|---|---|
| `web-ifc-api-*.js` | 3,616 KB | 414 KB | 3D tab (lazy, behind `viewer_3d`) + 1.3 MB `web-ifc.wasm` |
| `pdf.worker.min-*.mjs` | 1,376 KB | — | pdf.js canvas mode / extraction (lazy) |
| `IfcModelViewer-*.js` | 552 KB | 141 KB | 3D tab |
| `vendor-xlsx-*.js` | 500 KB | 162 KB | imports/exports (lazy) |
| `vendor-charts-*.js` | 444 KB | 117 KB | chart routes |
| `DrawingSubmittalHub-*.js` | 423 KB | 120 KB | Detailing Control Center route (single 400 KB route chunk) |
| `jspdf.es.min-*.js` | 390 KB | 127 KB | PDF export actions |
| `vendor-pdf-*.js` | 364 KB | 107 KB | DrawingViewer |
| `index-*.js` (entry) | 293 KB | 97 KB | every page |
| `DrawingViewer-*.js` | 235 KB | 64 KB | viewer route |
| `PieceRegister-*.js` | 221 KB | 65 KB | piece register route |
| `vendor-supabase-*.js` | 208 KB | 54 KB | every page |
`index.html` preloads only the entry, the Vite runtime helper and `vendor-react`; all 95 routes are lazy (`lazyWithRetry`). Six Google font families are requested render-blocking from `fonts.googleapis.com`; `Barlow` (1 reference) and `JetBrains Mono` (3) are effectively unused in `src/`.

### 2.3 Live Supabase advisors (management-plane read, no SQL executed)
**Security (4 lint groups):**
- `authenticated_security_definer_function_executable` — **153 SECURITY DEFINER functions executable by `authenticated`** via `/rest/v1/rpc/*`. 63 are trigger-style `enforce_*_guards()` / `*_touch_updated_at()` functions with no parameters (harmless to call but pointless to expose); ~90 are real RPCs (`accept_invitation`, `create_project`, `create_organization`, `hard_delete_organization`, `hard_delete_project`, `hard_delete_records`, `reset_org_data`, `erasure_toggle_user_triggers`, `hard_delete_toggle_triggers`, `set_runtime_config`, `prune_client_events`, `generate_project_alerts`, `get_next_sequence_number`, piece-control RPCs, note-folder RPCs, `user_*` helpers, …). Each must carry its own internal authorization check; see §RLS findings for which ones were verified.
- `rls_enabled_no_policy` (INFO) — 7 tables: `private.desktop_session_handoffs`, `private.maintenance_jobs`, `public.billing_config`, `public.planner_offline_operation_receipts` (intentional deny-all, service-role only) and `public.sheets_config`, `public.sheets_doc`, `public.sheets_doc_backup` (abandoned Sheets prototype, slated for drop).
- `extension_in_public` (WARN) — `pg_net` in `public`.
- `auth_leaked_password_protection` (WARN) — **HaveIBeenPwned leaked-password protection is disabled** (dashboard toggle).

**Performance (7 lint groups):** 73 unindexed foreign keys (mostly `created_by`/`*_by` audit columns, but also `pieces.work_package_fk`, `piece_import_rows.piece_fk`, `sov_items.work_package_id`, `photos.work_package_id`, `punchlist_items.work_package_id`, `expenses.vendor_id`, `change_orders.change_request_id`); **267 unused indexes** (write amplification); 6 duplicate index pairs (`task_dependencies` ×3, `backcharge_events`, `pay_applications`, `piece_events`); 2 tables without a primary key (`public.piece_events`, `public.sheets_doc_backup`); table bloat on `piece_import_rows`; 2 tables with multiple permissive SELECT policies (`note_folder_job_links`, `runtime_config`); Auth server pinned to an absolute 10 DB connections. **No `auth_rls_initplan` lints remain** (the CLAUDE.md `(select auth.uid())` rule is being followed).

### 2.4 Migration ledger vs repository (management-plane read of `supabase_migrations.schema_migrations`)
| Set | Count | Meaning |
|---|---|---|
| Ledger versions | 127 | what production says was applied |
| Repo `supabase/migrations/*.sql` | 120 | what this repo can replay |
| **In repo, not in ledger** | **35** | every one is classified in `supabase/production-ownership-manifest.json` as `intentionally-frozen` = "applied out of band, current, ledger holds no row" (e.g. `20260905130000_work_package_control_center.sql`, `20260908*_schedule_*.sql`, `20260915120000_adopt_2026_fab_release_gate.sql`, `20260919120000_gc_document_register.sql`); 2 more were applied under **different** stamps (`20260813120000` → ledger `20260817072554`, `20260817020000` → `20260817083550`). |
| **In ledger, no repo file** | **42** | 41 owned by the sibling `SteelBuild-Pro-2026` app (`20260909*_m1…m30`, `20260910*`) plus 2 shared-production versions whose SQL is archived under `supabase/migrations_external/`. |
The CI `supabase-drift` job passes because the manifest classifies every mismatch; it compares **version stamps only**, never SQL bodies. Consequence for recovery: `supabase/migrations/` alone cannot rebuild production (TECH_DEBT: 219 of 351 production functions have no definition in this repo; the sibling app owns core tables such as `gc_drawings`).

### 2.5 Deployed Edge Functions vs repository
Live (11): `llm-proxy`, `email-ingest`, `email-send`, `stripe-billing`, `project-export`, `health`, `legacy-app-files-copy`, `command-center-session-handoff`, `command-center-read`, `sheets-api`, `account-delete`. Repo (11 dirs): the same minus `sheets-api`, plus `staging-e2e-bootstrap` (not deployed — correct). The six functions the manifest marks `deprecated` (`sharepoint-proxy`, `bluebeam-proxy`, `stripe-setup`, `stripe-webhook`, `stripe-worker`, `schedule-assistant`) are **no longer deployed** — `ARCHITECTURE.md`, `AGENTS.md` and `README.md` still say they are. `sheets-api` (abandoned prototype, service-role writer, passcode gate) is **still ACTIVE** although TECH_DEBT (2026-09-19) says it should be deleted. `legacy-app-files-copy` is deployed from `index.ts` (the real maintenance code), not the `disabled.ts` 410 stub; its only backstop is the `private.maintenance_jobs.completed_at` row.

### 2.6 Secrets and credential-shaped material
- Working tree: no credential-shaped strings other than the public Sentry DSN (write-only ingest key, documented) and the Supabase project ref (public subdomain). `sk_live_` / `sk_test_` occurrences are placeholders in `docs/stripe-go-live.md`.
- Git history: one Supabase **anon** JWT (decoded claims: `iss=supabase`, `role=anon`; public by design — it ships in every browser bundle) inside a since-deleted Python helper `exports/app/build_app_shell.py` (commit `df88736`, 2026-07-12). No service-role key, Stripe key, webhook secret, private key or `sbp_`/`sb_secret_` token was found in any commit. A deleted `docs/PHASE_0_EDGE_FUNCTION_SECRET_MATRIX.md` listed secret **names** only.
- No `.env*`, keystore, `.p12`, `.mobileprovision` or `.pem` file was ever tracked. `.gitleaks.toml` narrowly allow-lists the DSN, the project ref and the CSP hash; the gitleaks job runs on every push but is not a deploy gate (CI-1).

## 3. Audit coverage checklist (Phase 2)

| # | Category | Status | How it was covered |
|---|---|---|---|
| A | Functional logic & correctness | Completed | Engines audit (fab gate, submittals, schedule, PCC, docControl, money/dates) + client data-layer audit; probes executed for concrete input→output |
| B | Business-rule integrity | Completed | CLAUDE.md invariant table (§5), client-vs-DB vocabulary and transition-graph comparison |
| C | Data flow & routing | Completed | entity client → PostgREST → RLS; edge-function paths; storage; realtime; caches; offline outbox |
| D | Auth / authz / session | Completed | AuthContext, boot gates, MFA, recovery, invites, org membership, desktop handoff, logout |
| E | RLS & DB authorization | Completed | static effective-policy replay of all 120 migrations (412 policies / 135 tables) + live advisors + RPC surface review; **role-based live probes not run** (no production access authorised) |
| F | Input validation & app security | Completed | XSS sinks, redirects, storage paths, PostgREST filter construction, deserialization, secrets, localStorage inventory, dependency CVEs |
| G | Database design & migrations | Completed | schema inventory, constraints, indexes, migration safety, ledger/manifest reconciliation |
| H | API & integration reliability | Completed | all 12 edge-function dirs + Stripe/LLM/email integrations |
| I | Performance & efficiency | Completed | production build + bundle report, static query/render/subscription analysis; **no runtime profile** |
| J | Mobile readiness | Completed | Capacitor config, native bootstrap, plist/privacy templates, SUBMISSION.md claims verified |
| K | Apple App Store readiness | Completed (code-level); App Store Connect items listed as owner tasks | see §4.9 |
| L | Google Play readiness | Completed — **not applicable today: no Android platform exists** | see §4.9 |
| M | Web production readiness | Completed | SPA fallback, headers/CSP, SW, caching, env, Sentry |
| N | CI/CD & release | Completed | ci.yml gate matrix, secrets scoping, drift/secret scans, deploy/rollback path |
| O | Observability & monitoring | Completed | Sentry config, health endpoint, alerting absence, logging PII |
| P | Backup, recovery, DR | Completed | storage-backup workflow/scripts, PITR status, rollback runbooks, migration recoverability |
| Q | Dependencies & supply chain | Completed | npm audit, outdated, knip, lockfile, action pinning, floating Deno imports |
| R | Tests & quality gates | Completed | full suite run, lint warning census, ratchet lists, E2E status |
| S | Accessibility | Completed (static) | jsx-a11y census (1,552 suppressed warnings), prior-audit items re-checked |
| T | Compliance & privacy | Completed (repo evidence only) | legal pages still DRAFT, subprocessor list stale, consent, data deletion paths |
| U | Documentation accuracy | Completed | README/ARCHITECTURE/TECH_DEBT/SUBMISSION claims verified against code |

Not audited (out of scope or impossible from the repo): the sibling `SteelBuild-Pro-2026` repository that co-owns the production schema; the Supabase, Cloudflare, GitHub and Stripe dashboards; the generated iOS Xcode project (never committed); runtime behaviour on real devices.

## 4. Findings register

Each finding: **classification · severity** · evidence (`file:line`) · failure scenario · remediation. Findings sharing a root cause are merged and cross-referenced. Severity reflects production impact for a multi-tenant construction platform, not exploit elegance.

### 4.1 Authentication, authorization and session (category D)

**AUTH-1 · An org admin can delete the sole owner's membership row.** CONFIRMED DEFECT · **High**
Evidence: `supabase/migrations/20260101000010_baseline_schema.sql:9329` — `CREATE POLICY "org_members_delete" ON organization_members FOR DELETE USING (user_org_role_at_least(org_id,'admin') OR user_id = auth.uid())`, with no `role <> 'owner'` clause (the INSERT/UPDATE policies at `:9333`/`:9341` have one). The guard trigger is `BEFORE INSERT OR UPDATE` only (`:7382`) and its last-owner check lives in the UPDATE branch. The client check is UI-only (`src/pages/OrgMembers.jsx:180`; `src/lib/org/repository.ts:124-127` is a plain `.delete()`).
Scenario: an `admin` issues `DELETE /rest/v1/organization_members?id=eq.<owner row>` (or the last owner self-deletes). The workspace has no owner; owner-only actions (workspace deletion, owner-role invites, billing erasure) become impossible — a tenant lockout.
Remediation: extend `enforce_org_member_guard` to `BEFORE DELETE` raising on the last owner; add `(role <> 'owner' OR user_org_role_at_least(org_id,'owner'))` to the DELETE policy while keeping self-leave.

**AUTH-2 · TOTP MFA is enforced only in the client, and the gate is racy.** CONFIRMED DEFECT · **High** (for accounts that rely on MFA)
Evidence: `src/lib/AuthContext.tsx:190-196` sets `isAuthenticated=true` and then fires `void refreshMfaRequired()`; `isLoadingAuth` clears in `finally` (`:230-232`), so `src/boot/AuthenticatedApp.jsx:107-113` (`if (mfaRequired) return <MfaChallenge/>`) evaluates `false` while the AAL lookup is in flight and `AppRoutes` mounts. No migration references `aal`/`aal2`; `docs/runbooks/owner-checklist.md:94` itself calls the gate "client-side (UX)". `src/pages/DesktopConnect.tsx:190-207` exports whatever session `getSession()` returns, including the refresh token.
Scenario: an aal1 token is fully valid at PostgREST, Storage and every Edge Function, so a stolen password reaches all tenant data regardless of TOTP; on `/DesktopConnect` the aal1 session is handed to the desktop app before the challenge renders.
Remediation: await `refreshMfaRequired()` before clearing the loader (explicit `mfaChecked` flag); server-side, add an `mfa_satisfied()` helper (`(auth.jwt()->>'aal') = 'aal2' OR no verified factor`) and require it inside `user_has_project_role_at_least` / the RLS chokepoints.

**AUTH-3 · Invitation tokens are readable by every org member; acceptance logic is not in this repo.** PROBABLE CONCERN · **High** (Medium if `accept_invitation` matches the invitee e-mail)
Evidence: `baseline_schema.sql:9321` `org_invites_select … USING (user_is_org_member(org_id))`; the bearer credential is the row's `token uuid` (`:4210`); `src/lib/org/repository.ts:90,133` `select("*")` returns it; `accept_invitation(uuid)` / `get_invitation(uuid)` bodies exist neither in `supabase/migrations/` nor in `supabase/_capture/` (only grants in `20260715235514:58-71`); the e-mail-mismatch check is client-only (`src/pages/OrgOnboarding.jsx`). The live advisor lists both as SECURITY DEFINER executable by `authenticated`.
Scenario: a `member` reads a pending admin/owner invite through PostgREST and redeems the token from a second account, or forwards the live link.
Remediation: restrict SELECT on `organization_invitations` (or revoke column `token`) to org admins; land `accept_invitation` in this repo with `lower(auth.email()) = lower(inv.email)`, `status='pending'`, `expires_at > now()` and an atomic accept.

**AUTH-4 · A password-recovery session reaches the full app without a new password.** CONFIRMED DEFECT · Medium
Evidence: `src/lib/AuthContext.tsx:245-250` sets `isPasswordRecovery` only on the `PASSWORD_RECOVERY` event; nothing persists it. `src/pages/UpdatePassword.jsx:54,91` "Cancel" does `window.location.href = "/"`; after reload `getSession()` returns the persisted recovery session and `AuthenticatedApp` renders the app. `UpdatePassword.jsx:11-12` claims the session is "recovery-scoped"; Supabase does not scope it.
Remediation: persist the recovery flag (sessionStorage) until `updatePassword` succeeds; make Cancel call `logout()`; move to PKCE (`type=recovery` query) so the page can re-derive state after reload.

**AUTH-5 · Implicit auth flow permits session injection through the URL fragment (login CSRF).** PROBABLE CONCERN · Medium
Evidence: `src/lib/supabase.ts:13-17` sets `detectSessionInUrl: true` and no `flowType`; installed `@supabase/auth-js` 2.105.4 defaults to `implicit`, whose `_getSessionFromURL` accepts `#access_token=…&refresh_token=…` from `location.hash`. Also the reason `#access_token` transiently appears in the URL (Sentry scrubs only `?query`, `src/instrument.js:64-68`).
Scenario: a crafted `https://steelbuild-pro.com/#access_token=<attacker>&refresh_token=<attacker>&expires_in=3600&token_type=bearer` silently signs the victim in as the attacker; anything they then upload lands in the attacker's workspace.
Remediation: `flowType: 'pkce'` (recovery/confirmation links carry a one-time `code` bound to a local verifier); update the redirect allowlist.

**AUTH-6 · Logout is incomplete on failure and leaves tenant data behind.** CONFIRMED DEFECT · Medium (shared field devices)
Evidence: `src/lib/AuthContext.tsx:438-448` ignores the `{ error }` from `supabase.auth.signOut()`; auth-js keeps the local session on any error other than 401/403/404, so an offline "Sign out" reverts on next launch. `clearTenantClientState` (`:14-29`) clears only the query cache, `sbp:field:outbox:*` and IndexedDB blobs; `sbp_projects_cache` (full project rows, `src/components/shared/ProjectContext.jsx:53`), `activeProjectId` (`:239`), `sbp:current-org`, `sbp-sidebar-recents`, `__steelbuild_recent_searches`, `sbp_audit_log` (with `userEmail`/`userId`, `src/components/shared/useDestructiveAudit.jsx:29-45`) and `sbp-tools-notes` ink survive; `ProjectContext.jsx:76-83` seeds the next user's UI from that cache.
Remediation: on sign-out error fall back to `signOut({ scope: 'local' })` and still clear; enumerate all `sbp*`/`__steelbuild*` keys (or namespace them by user id); never seed from another user's cache.

**AUTH-7 · Desktop session hand-off runs on page load with no user consent.** PROBABLE CONCERN · Medium
Evidence: `src/pages/DesktopConnect.tsx:178-239` — a `useEffect` parses `state`/`challenge`/`publicKey` from the URL, encrypts the current session (including `refreshToken`, `:203-207`) to that key and calls `createHandoff` automatically; the server accepts any values (`supabase/functions/command-center-session-handoff/index.ts:49-54`). Redemption still needs the 256-bit code delivered to the local `desktop-command-center://` handler.
Scenario: a phishing link makes a signed-in user's browser encrypt their refresh token to an attacker-supplied key and store it server-side (2 min unconsumed / ~5 min after). Combined with AUTH-2 it exports aal1 sessions.
Remediation: require an explicit "Connect this desktop" click showing the key fingerprint; pre-register `state/challenge/publicKey` from the desktop (device-code style); hand off a short-lived access token only; delete rows on consumption.

**AUTH-8 · Sensitive account actions require no re-authentication.** PROBABLE CONCERN · Medium
Evidence: password change without current password (`src/components/settings/UserSettingsTab.jsx:34-41` → `supabase.auth.updateUser({ password })`, `AuthContext.tsx:371`); MFA unenroll without a code (`src/components/settings/MfaSection.jsx:68`); account/workspace deletion after a typed e-mail only (`DeleteAccountZone.jsx:29-38`, `supabase/functions/account-delete/index.ts:240` verifies the JWT and nothing else).
Remediation: require a fresh `signInWithPassword`/`reauthenticate()` nonce (and aal2 when a factor exists) immediately before these three actions; enable "Secure password change" in the Supabase dashboard.

**AUTH-9 · Clickwrap acceptance is client-minted and client-rewritable.** INFORMATIONAL · Low
Evidence: `AuthContext.tsx:298-314` stores `terms_accepted_at`/`terms_version` in `user_metadata`; no server table/trigger records it; `src/api/client/auth.ts:16-20` `BLOCKED_FIELDS` does not include the terms keys. A direct `auth.signUp` call bypasses `assertTermsAccepted`.
Remediation: have `handle_new_user` copy acceptance from `raw_user_meta_data` into a server-owned `terms_acceptances` row and gate onboarding on it.

**AUTH-10 · Invite acceptance is only reachable for users with no workspace.** INFORMATIONAL (functional)
Evidence: `AuthenticatedApp.jsx:41-47` renders `OrgOnboarding` only when `!hasOrg`; `?invite=` is read only there (`OrgOnboarding.jsx:43`). An existing member of one org cannot accept an invite to a second org through the UI.

**AUTH-11 · Role/permission caches lag after revocation (UI only).** INFORMATIONAL
`useProjectRole` / `permissions` `staleTime` 5 min, org context 60 s; RLS re-evaluates per request so data access is revoked immediately, only chrome is stale. Invalidate `["project-role"]`, `["user-permissions"]`, `["my-orgs"]` after membership mutations.

Done well (D): `user_profiles.role` is server-controlled (column-level grants `baseline:11291-11303` + `prevent_user_profile_role_change` on INSERT/UPDATE, `20260702035058:44-60`); project/org RBAC helpers are SECURITY DEFINER with pinned `search_path` and `(select auth.uid())` (`20260819001000:82-158`); the org-invite UPDATE policy was tightened against owner escalation (`20260914010000:142-149`); the desktop hand-off cryptography is sound (ECDH P-256 + HKDF + AES-GCM, SHA-256 code, single-use SQL consume with 2-min TTL CHECK, `private` schema, service-role-only RPCs); no open redirects (the `Landing` page is rendered in place, `?redirect=` is written and never read); `signOut` is global scope; MFA status lookup fails closed.

### 4.2 Edge Functions and integrations (category H)

**EDGE-1 · `llm-proxy` output-token ceiling is bypassed by a string value.** CONFIRMED DEFECT · Medium
Evidence: `supabase/functions/llm-proxy/index.ts:352` clamps only `if (typeof body?.maxTokens === "number" && …)`; both providers then coerce `max_tokens: Number(maxTokens) || 1000` (`providers/anthropic.ts:43`, `providers/openai.ts:148`).
Scenario: `{"maxTokens":"64000"}` skips the 16,000 ceiling; per-call spend rises ~4× and the daily quota only reacts after the fact.
Remediation: coerce first, reject non-finite/non-positive, then clamp (same for `temperature`).

**EDGE-2 · `llm-proxy` trusts caller-supplied `useCase` and `project_id` for two controls.** CONFIRMED DEFECT · Low
Evidence: `useCase` is free text (`index.ts:308-310`) that selects fail-open vs fail-closed (`:98-105`, `:362`) and is written to telemetry; `project_id` is UUID-validated but never membership-checked (`:396-398`); `email-ingest/index.ts:629` caps paid classification per project by counting `llm_telemetry` rows with `use_case=email-classify`.
Scenario: any authenticated user can tag cheap calls with another org's `project_id` and push it over `EMAIL_CLASSIFY_DAILY_LIMIT` (silent downgrade to regex classification), or mislabel document-heavy calls so they fail open.
Remediation: restrict `useCase` to routing-table keys, decide fail-closed from content, verify membership before recording `project_id`.

**EDGE-3 · `project-export` audit row records a self-asserted display name, not the actor id.** CONFIRMED DEFECT · Medium
Evidence: `supabase/functions/project-export/index.ts:259-263` derives `displayName` from `user.user_metadata.full_name` (self-editable); `buildExportAuditRecord` writes only `performed_by: args.performedBy` (`:225`) into `activities.performed_by` (`text`, `baseline:2317`); `user.id` reaches only the console log (`:541`).
Scenario: a member sets `full_name` to a colleague's name and exports the whole project; the audit row names the colleague.
Remediation: write `user.id`/e-mail into `metadata` (or a uuid column); keep the display name decorative.

**EDGE-4 · `stripe-billing` accepts an empty webhook secret.** PROBABLE CONCERN · Medium (High if the secret is ever unset)
Evidence: `supabase/functions/stripe-billing/index.ts:64` resolves `webhookSecret` to `""` when neither `billing_config` nor `STRIPE_WEBHOOK_SECRET` is set; `:146` calls `constructEventAsync(raw, sig ?? "", cfg.webhookSecret)` with no non-empty guard.
Scenario: HMAC with an empty key is forgeable; a fake `checkout.session.completed` with `metadata.org_id` sets any org to `plan: "business"` through the service-role update (`:80`).
Remediation: return 503 "webhook not configured" when the secret is empty; same for an empty Stripe key (`:37-40`).

**EDGE-5 · Self-service account deletion fails for any sole owner with a live project, non-transactionally, and returns raw DB text.** CONFIRMED DEFECT · Medium (App Store 5.1.1(v) dependency)
Evidence: `supabase/functions/account-delete/index.ts:110` calls `hard_delete_organization` per solely-owned org; the RPC raises `ARCHIVE_FIRST: % project(s) are still active` when any project is live (`20260912062606_hard_delete_organization_cursor_and_note_folders.sql:70-71`); the loop returns 400 after earlier orgs are already gone (`:178-188`); `:139/:183/:194` return `detail: <Postgres message>`; no top-level `try/catch` around `Deno.serve` (`:209-247`); env reads use `!`.
Scenario: `DeleteAccountZone.jsx` promises every user can delete their account; a sole owner with one active project gets `account_deletion_failed` with constraint text and nothing deleted; with two orgs, the first is erased and the second refused, leaving the account alive.
Remediation: archive/soft-delete live projects first (or bypass the guard for self-deletion), make the multi-org path all-or-nothing or resumable, map RPC errors to stable codes, wrap the handler, use `_shared/cors.ts` + `reportError`.

**EDGE-6 · Workspace erasure deletes other people's auth identities with no step-up.** PROBABLE CONCERN · Low-Medium
Evidence: `deleteOrphanedUsers` (`account-delete/index.ts:79-93`, called at `:142`, `:198`) deletes the Supabase identity of every co-member left in no workspace; the only confirmation is a client-typed e-mail. See AUTH-8.

**EDGE-7 · Two functions hardcode `Access-Control-Allow-Origin: *`.** CONFIRMED DEFECT · Low
Evidence: `account-delete/index.ts:35-39` and `email-ingest/index.ts:71-75`, contradicting `_shared/cors.ts:6-23` (fixed allowlist). Not exploitable for CSRF today (bearer tokens, no credentials), but the destructive endpoint is the one that opted out.

**EDGE-8 · The "disabled" maintenance functions are not what gets deployed.** PROBABLE CONCERN · Low
Evidence: `supabase/config.toml` declares no `[functions.legacy-app-files-copy]` entrypoint; a plain `supabase functions deploy` ships `index.ts` (live maintenance logic), and the live inventory shows `legacy-app-files-copy` v18 with entrypoint `source/index.ts`. The only backstop is the DB `completed_at → 410` rule in `_shared/maintenance-auth.ts:83-85`.
Remediation: set `entrypoint = "./functions/<slug>/disabled.ts"` in `config.toml`, or delete the function.

**EDGE-9 · Quota and rate limits are check-then-act.** PROBABLE CONCERN · Low
`llm-proxy/quota.ts:106-149` reads the 24 h aggregate before the call and inserts after (`index.ts:406`); same shape in `email-send/index.ts:157-210` vs `:805`. Bursts overshoot caps by up to N−1 calls. Acceptable for coarse caps; reserve atomically if tightened.

**EDGE-10 · No timeouts or idempotency on outbound provider calls.** RECOMMENDATION · Low
No `AbortSignal` on provider fetches (`providers/anthropic.ts:64`, `providers/openai.ts:160`, `email-send/index.ts:315,349,412`, `email-ingest/index.ts:687`); `stripe.customers.create` (`stripe-billing/index.ts:218-220`) has no idempotency key, so concurrent admins create duplicate Stripe customers.

**EDGE-11 · `email-ingest` "flag" mode still classifies and stores untrusted mail.** PROBABLE CONCERN · Low
`email-ingest/index.ts:911-924` does not return in flag mode; the message is AI-classified (`:941`) and attachments uploaded (`:993-1066`) before being marked rejected. Default is `reject`, so exposure is configuration-dependent.

**EDGE-12 · Caller-controlled `Content-Type` is persisted on stored e-mail attachments.** UNVERIFIED RISK · Low
`email-ingest/index.ts:365,478,1026`, `email-send/index.ts:467,481`; the `email-attachments` bucket has no MIME allowlist. An HTML payload named `drawing.pdf` would be served as `text/html` from the storage origin via a signed URL; impact depends on how signed URLs are opened (not verified).

**EDGE-13 · Request bodies are buffered without a size guard** in `email-ingest`, `email-send`, `account-delete`, `project-export`, `stripe-billing` (only `llm-proxy/index.ts:279-289` checks `Content-Length` first). PROBABLE CONCERN · Low

**EDGE-14 · Internal error text and upstream bodies are returned to callers.** PROBABLE CONCERN · Low
`email-ingest/index.ts:982,1092`, `email-send/index.ts:836`, `project-export/index.ts:555`, `llm-proxy/index.ts:463,481`, `stripe-billing/index.ts:128`. Return a generic message plus correlation id; keep detail in `reportError`.

**EDGE-15 · `health` runs a DB query per hit with the service-role key on a public, unauthenticated endpoint** (`health/index.ts:37,40`; any method, no cache/rate limit). PROBABLE CONCERN · Low-Medium (load amplification; minimal leak).

**EDGE-16 · Minor items.** INFORMATIONAL
Floating dependency versions across functions (`esm.sh/@supabase/supabase-js@2`, `npm:@supabase/supabase-js@^2.47`, `^2.101.1`, pinned `2.105.4`, unpinned `npm:@sentry/deno`); prototype-key registry lookups (`PROVIDER_REGISTRY[provider]`, telemetry noise only); PII in logs contradicting stated policy (`email-ingest:914-916`, `email-send:817`, `quota.ts:140`); `command-center-read/normalize.ts:1` imports `../../../src/lib/recordLinks.ts` from outside the function directory (bundle deployability unverified); `command-center-read/index.ts:43-47` maps every non-`HttpError` to a 400 without `reportError`; `email-send/index.ts:110` uses the service-role key as GoTrue `apikey`; caller-supplied `from_name` / `in_reply_to_external_id` reach mail headers unsanitised (`:727,748,758,763-764`); `project-export` bundles `email_accounts.access_token`/`refresh_token` (`baseline:3591-3592`) into the downloadable export; `webhookLogic.ts:76` defaults an unresolvable checkout price to `"pro"`; tests exercise dead helpers (`scopeRowsToVisibleProjects`, `validateRedeemAttempt`) rather than the live handlers; 9 of 11 handlers have no tests.

Done well (H): CORS helper is a fixed allowlist with `Vary: Origin` and tests; `email-ingest` uses a header-only secret with constant-time compare, fails closed when unset, validates UUID paths, caps attachments, denylists extensions, has a kill switch and per-project AI cap; `llm-proxy` ties the model allowlist to the rate card, pre-checks `Content-Length`, computes quota with a service-role-only SECURITY DEFINER aggregate; `stripe-billing` verifies the signature before any write, dedups on `UNIQUE (stripe_event_id)`, re-fetches live state on out-of-order events, allowlists redirect origins, and `billing_config` is service-role only; `command-center-*` use exact-key schemas, a `private` schema, and atomic single-use consumption; `project-export` is RLS-scoped, pages with abort-on-partial-failure and aborts when the audit write fails.

### 4.3 Client data layer and data flow (categories A, C)

**DATA-1 · Pay Applications' contract query is poisoned by the global `['projects']` query default.** CONFIRMED DEFECT · **High** (page-level)
Evidence: `src/lib/query-client.ts:292-297` `setQueryDefaults(['projects'], { select: sortProjectsByName })` where `sortProjectsByName = (data) => [...(data ?? [])].sort(...)`; `src/pages/PayApplications.jsx:95` `useQuery({ queryKey: ["projects", projectId, "payapp-contract"], … })` whose `queryFn` (`src/lib/payapp/repository.ts:27-31`) returns a single object. TanStack v5 applies query defaults by key prefix; spreading a plain object throws `not iterable`, so the query is permanently in error.
Scenario: `contractQuery.isSuccess` can never be true; the G702 contract sum resolves from `undefined`. The page test builds a fresh `QueryClient` without the defaults, so it cannot catch this.
Remediation: rename the key (`["payapp-contract", projectId]`) or override `select`; add a test that mounts with `queryClientInstance`.

**DATA-2 · The schedule bulk toolbar cannot reopen a finished task (CHECK violation), and "one write path" holds only for single edits.** CONFIRMED DEFECT · **High** (regresses a documented invariant; same root cause reported by the engines audit)
Evidence: `src/pages/schedule/useScheduleMutations.ts:333-340` hand-writes `percent_complete: status === "Complete" ? 100 : status === "Not Started" ? 0 : undefined`; `cleanRecord` (`src/api/client/fieldMapping.ts`) drops the `undefined` key, so "In Progress" sends `{status}` alone and `schedule_status_pct_consistency` (`baseline:4823`) rejects it against the stored 100. `withReconciledPercent` (`src/lib/schedule/taskStatus.ts:231-244`) would have produced `null`. `bulkDateMut`, `bulkDurationMut`, `bulkResourceMut` (`:403-493`) and the field progress paths (`src/lib/field/OutboxContext.jsx:47`, `src/pages/FieldToday.jsx:101`) also call `entities.ScheduleTask.update` directly, so field completion stamps no `actual_finish_date`.
Remediation: route every bulk/field patch through `buildTaskUpdate` / `withReconciledPercent`; add a bulk-reopen test.

**DATA-3 · Reopening a task writes `percent_complete = 0`, not NULL.** CONFIRMED DEFECT · Medium (regresses CLAUDE.md "Reopening clears the percent to NULL")
Evidence: `taskStatus.ts:200-206` returns `null`; `src/api/client/entities.ts:262-265` then does `Number(out.percent_complete)` — `Number(null) === 0` is finite, so the NULL becomes `0` before the UPDATE. No entity test covers a null percent.
Remediation: pass `null` through in `normalizeFields`; add the test.

**DATA-4 · Shipping-ticket and shipping-list imports insert `deliveries` directly, which production rejects.** CONFIRMED DEFECT · Medium (against the 2026-09-15 production capture)
Evidence: `src/lib/importShippingTicket.js:287,312` and `src/components/deliveries/ShippingListImportModal.jsx:131,148` use `supabase.from("deliveries").insert/delete`; production `enforce_delivery_guards()` (`supabase/_capture/production-public-functions-2026-09-15.sql:1518`) raises `'Deliveries are created through create_delivery(); numbers are minted there'` and forbids hard deletes; `entities.Delivery.create` (`entities.ts:371-384`) already routes through the RPC.
Remediation: route both importers through `entities.Delivery.create({ …, items })`.

**DATA-5 · Change-order CSV import discards the source CO number, so its dedup never matches.** CONFIRMED DEFECT · Medium
Evidence: `src/components/changeorders/ChangeOrderImportModal.jsx:153-176` passes `co_number`, which `atomicCreateClient` strips as a derived key (`entities.ts:153-160, :66`) before the RPC mints a fresh number; the re-run dedup (`:133-139`) compares CSV numbers to stored sequence values and ignores `error`.
Scenario: "CO-014" from Sage imports as "CO-003"; re-importing the same file creates a duplicate set.
Remediation: accept a supplied number for imports or dedup on a stored source key; check `error`.

**DATA-6 · An editable Project picker in the RFI form mints a number from one project's sequence and saves in another.** PROBABLE CONCERN · Medium
Evidence: `src/components/rfis/RFIFormModal.jsx:322-329` always renders the picker; `src/pages/rfis/useRfiPageMutations.ts:295-306` mints from `data.project_id || projectId`, then `withProjectId` (`src/lib/mutations/standardMutation.ts`) silently forces the page's project with a `console.warn`.
Remediation: disable the picker when a project is active, or make `withProjectId` throw on mismatch.

**DATA-7 · Global search silently truncates at 1,000 rows per entity.** CONFIRMED DEFECT · Medium-Low
`src/components/search/GlobalSearchModal.jsx:75-110` lists RFIs/Drawings/WorkPackages/ChangeOrders/Contacts portfolio-wide (`created_at desc`) against PostgREST `max_rows = 1000` with no `ListTruncationNotice`; older records are unsearchable with no signal. Use server-side `ilike` search or `listAll` + notice.

**DATA-8 · Constraint and Risk engines turn read failures into "no risks".** CONFIRMED DEFECT · Medium-Low ("absence is not evidence")
`src/pages/Constraints.jsx:145-146`, `src/pages/RiskHub.jsx:31-32`: `entity.filter({ project_id }).catch(() => [])` for every source; an RLS or network failure renders a clean board and the global `QueryCache.onError` never fires.

**DATA-9 · Success toasts over failed set operations.** CONFIRMED DEFECT · Low
`src/hooks/useDrawings.ts:349-374` `supersedeSetMut` toasts "0 sheets superseded" when every row fails; `rejectSetMut` (`:337-340`) toasts success with `results.failed` non-empty (the approve path warns correctly).

**DATA-10 · UTC-day stamps on date-only columns.** CONFIRMED DEFECT · Low
`src/hooks/useDrawings.ts:280` `set_approved_date: new Date().toISOString().split("T")[0]` records tomorrow after 17:00 Arizona; `todayLocalISO` exists (`src/lib/dateOnly.js:35`). 104 similar `toISOString().slice(0,10)` sites repo-wide (many legitimate UTC round-trips); tests run under `TZ=UTC` and cannot see this.

**DATA-11 · Supabase `error` is ignored on 14 raw reads, several of which gate a decision.** PROBABLE CONCERN · Medium-Low
`src/lib/drawingHub/revisions.js:252-257,349-354` (revision clash check), `src/lib/importRfiLog.js:232-240` (dedup set), `src/lib/revisionSnapshotDiff.js:234-240,287-296` ("no deltas"/"no comparison yet" on failure), `ChangeOrderImportModal.jsx:133`, `AuthContext.tsx:134`, `permissions.ts:140`, `numberSequencing.jsx:227-234` (preview). supabase-js never throws; add `if (error) throw` wherever a read gates a write or a claim.

**DATA-12 · Offline photo replay orphans storage objects on non-duplicate failures.** PROBABLE CONCERN · Low
`src/lib/field/photoSync.js:271-282`: upload succeeds, `createPhoto` fails with a non-23505 error (e.g. RLS) → the op stays queued and each reconnect uploads a new `Date.now()`-named object (`uploads.ts:286`).

**DATA-13 · `bulkUpdate` silently drops RLS-skipped rows and callers never compare counts** (`supabaseTypes.ts:157-165`; `SOV.jsx:149,159`, `ActionItems.jsx:193`, `EmailInbox.tsx:127`, `useCostCodes.js:96`, `ScopeExclusions.jsx:114`, `DrawingSubmittalHub.tsx:722`). PROBABLE CONCERN · Low

**DATA-14 · Non-atomic "carried" second write after RPC creates** (`entities.ts:44-50,82-84,520-529`): a failed follow-up `update` reports "create failed" while the numbered row exists; a retry mints a second number. PROBABLE CONCERN · Low

**DATA-15 · Realtime DELETE propagation.** UNVERIFIED RISK
`useRealtimeInvalidation.ts:43,66` filters `project_id=eq.<id>` on `event:"*"`; Supabase matches non-PK filters on DELETE only with `REPLICA IDENTITY FULL`, which no migration sets; publication membership of ~20 subscribed tables is not in the repo (only `model_elements`, `20260731003000:83`).

**DATA-16 · Informational.** Two role resolvers disagree on failure (`auth.ts:39-53` → `viewer`, `AuthContext.tsx:132-141` → `user`); `cleanRecord` turns every `''` into `null` and silently drops camelCase/`_`-prefixed keys; `STATUS_VALUES` still lists `'Cancelled'` in a dead branch; `auditLogger.ts:145` `performed_by` is client free text (server stamps `performed_by_user_id`); `uploads.ts:269` derives the extension with `split('.').pop()` while validation uses `fileExtension`, `contentType` trusts `file.type`, and `svg` is allowed in the `documents` profile; raw `drawings` reads without `is_deleted` in `drawingHub/proposals.js:197-201`, `drawingHub/dependencies.js:232-235` (lookup only); `cacheRegistry` has 91 unscoped key families (safe over-invalidation); `useCanonicalReportingRealtime.ts:59-78` has no debounce.

Done well (A/C): record numbering is RPC-only with fail-closed retry (`numberSequencing.jsx:119-147,201-218`, `functions.ts:392-419`); the entity client propagates every `error` as `SupabaseOperationError`, applies `EFFECTIVE_LIST_CAP` truncation telemetry and pages with an `id` tiebreaker; `pagedQuery.fetchAllRows` throws on partial data; global `QueryCache`/`MutationCache` error surfacing; optimistic updates snapshot and roll back; `batchProcess` reports partial success; transient retry wraps only the storage upload and treats a duplicate as success; the offline outbox coalesces, fail-stops FIFO and treats unique violations as applied; uploads use fail-closed allowlists, a dangerous-extension denylist and an org-prefixed path that refuses to write without an org; signed URLs (1 h) only, no `getPublicUrl` anywhere; privilege keys are stripped from metadata; project archive is one admin-gated RPC; the ESLint rule that bans raw `supabase.from()` outside the data layer; no `console.log` in `src/`.

### 4.4 Business-rule correctness (categories A, B)

**LOGIC-1 · The zone panel invents an official RFI number when the RPC fails.** CONFIRMED DEFECT · **High** (violates the RPC-only numbering invariant)
Evidence: `src/components/drawings/viewer/ZonePanel.jsx:587-597` — `catch (err) { … rfiNumber = \`RFI #${String(Date.now()).slice(-6)}\`; }` then `entities.RFI.create`. `numberSequencing.jsx` itself fails closed; the guard hook (`.claude/hooks/numbersequencing-guard.sh:19`) only inspects files named `numberSequencing*`, so this caller escapes it.
Remediation: rethrow (fail closed); widen the hook to grep callers for `RFI #` fallbacks.

**LOGIC-2 · Client and SQL choose the governing submittal by different keys and derive readiness differently on the P0 fab-release gate.** PROBABLE CONCERN · Medium
Evidence: client `pickMostRecentSubmittal` (`src/lib/submittalStageMapping.ts:229-245`) orders by `submitted_date desc` (undated last), `updated_at`, `round_number`; SQL `evaluate_fab_release_set` (`20260915120000:386-388`) orders by `created_at desc` (Void excluded). Client `isApprovedForFab` (`src/lib/exports/fabRelease.ts:166-196`, `pieceControl/drawingReleaseReady.ts:88-137`) also accepts `drawings.stage` IFC/Released and a fab sign-off; SQL `piece_control_drawing_is_approved` (`20260915120000:486-497`) accepts only the governing submittal's stage and emits `no_submittal` otherwise. `submittal_bic_class(null) = 'detailer'` (SQL) vs OFA/BFA (client) for a null ball-in-court.
Scenario: a later-created Draft round (no `submitted_date`) makes the client preview say "ready" while the server preflight says `not_ifc_ready`, or the reverse; legacy sheets with `stage='Released'` and no submittal pass the client gate and fail the server. The DB is stricter (fails closed), but the UI preview and the server contradict each other.
Remediation: one shared selection rule (e.g. SQL adopts `submitted_date desc nulls last, updated_at desc, round_number desc` as the 20260725194500 version did), and either add the stage/sign-off fallbacks to SQL or remove them from the client.

**LOGIC-3 · The skip-OFS / IFC release gate exists only on the client.** PROBABLE CONCERN · Medium
Evidence: `src/lib/ofsCompletionGate.ts:155-179` blocks Approved/AAN → Released unless IFC (or an audited override); the DB transition graph (`20260725190000_ofs_mandatory_scrub_and_transitions.sql:61-65`) allows `Approved → Released for Fabrication` directly, and `enforce_submittal_fab_release_gate` (`20260724120000:219-276`) checks only RFIs/rejected/superseded. Any PostgREST, MCP or bulk write (`useSubmittalsPageMutations.ts:103` runs no client gates) can release from BFA/OFS.
Remediation: mirror `evaluateSkipOfsReleaseGate` in `enforce_submittal_status_transition` (require derived stage IFC or an override reason).

**LOGIC-4 · `isPackageReleasedForFab` ("the shop has it") fires on a sheet-stage plurality and disagrees with piece control on Void-latest sets.** PROBABLE CONCERN · Medium
Evidence: `detailingPackageState.js:76-78` → `derivedSetStage` (`submittalStageMapping.ts:263-284`) falls back to `dominantStage(sheets)` without a submittal; probe: sheets `[Released, Released, IFA]`, no submittal → `true` (the Released KPI and register column claim the shop has a package with an IFA sheet), whereas `isClosedPackage` (`format.ts:377-379`) explicitly guards "Released is terminal only when a submittal drove it". `pieceControl/drawingReleaseReady.ts:75-86` filters deleted but not Void rounds and `:128-134` returns `stage:null` when the latest is Void, so piece control reports not-ready while the KPI reports released.
Remediation: require a governing submittal (or `detailing_state` release states) in `isPackageReleasedForFab`; filter Void rounds in `linkedSubmittals`.

**LOGIC-5 · The margin-risk engine counts Void RFIs (and Rejected COs) as open exposure.** CONFIRMED DEFECT · Medium
`src/services/marginRiskEngine.ts:70` skips only `["closed","answered","draft"]` while `chk_rfis_status` (`baseline:4709`) includes `Void`; probe: a Void RFI 40 days old → $20,000 exposure, severity high. `:279` likewise keeps `Rejected` change orders as unsigned exposure. Use `isRfiOpen` from `entityPredicates.ts` and the CO terminal set.

**LOGIC-6 · A cleared working-day lead (`null`/`""`) stamps `required_date = today`.** CONFIRMED DEFECT · Medium
`src/lib/submittalWorkdayDue.ts:53-57` `readLead`: `Number(null) === 0` passes `isFinite && >= 0`; probe: `{detailing_lead_days:{approval:null}}` → lead 0 → same-day due instead of the 10-working-day fallback. Return `null` for `null`/`""` before `Number()`.

**LOGIC-7 · The primary "Log Return (BFA)" action records an "Approved as Noted" verdict by construction.** PROBABLE CONCERN · Medium
`src/lib/submittalActionEngine.ts:165-168` → `stageToSubmittalStatus("BFA")` = `{status:"Approved as Noted", ball_in_court:"EOR"}`; `SubmittalDetail.tsx:305-318` advances on one click with no disposition prompt. A return that was Approved / R&R / Rejected is logged as AAN unless the user uses the status dropdown instead.

**LOGIC-8 · Production Control drops mid-flow Approved/AAN submittals as "terminal".** PROBABLE CONCERN · Medium-Low
`src/utils/pccEngine.ts:798-801` `SUB_TERMINAL` and `submittalReviewEngine` `TERMINAL` include Approved/AAN, which per `submittalStageMapping.ts:113-127` still have OFS → IFC → Released ahead; a package stuck in OFS for weeks never reaches the feed.

**LOGIC-9 · PCC engine drops `Date` inputs its type advertises, and two absence-is-not-evidence slips.** CONFIRMED DEFECT · Low-Medium
`pccEngine.ts:430-434` `String(date).slice(0,10)` on a `Date` → Invalid Date → null (probe: due 10 days ago as `Date` → `overdueDays: 0`); `:441` `Math.ceil` is +1 across a DST fall-back day; `:1249` falls back to the UTC day; `:881` `percent_complete || 0` scores a NULL percent as "low progress" (`:644`).

**LOGIC-10 · Two `workingDaysBetween` functions with different semantics; weekend due dates read "Due today".** PROBABLE CONCERN · Low
`src/lib/workingDays.ts:101-121` is exclusive-start (Mon→Fri = 4); `src/lib/schedule/workingCalendar.ts:174-194` is inclusive (= 5); `addWorkingDays(x, 0)` returns a weekend unchanged, so a Saturday due date on Friday yields tier `critical` / "Due today" (`submittalRiskAging.ts:81-86,157`).

**LOGIC-11 · Smaller items.** CONFIRMED/PROBABLE · Low
`submittalRevision.ts:29-36` `bumpRevision("AA") → "AA1"` (letters stop advancing after Z); `detailingReadiness.js:126-143` reports a fully superseded package as `fabricationReady`; `fab_release_log`'s trigger enforces only RFI/rejected/superseded on the inserted `drawing_ids` while the IFC/Released check lives in the client-invoked `evaluate_fab_release_package` (skipped when an override reason is supplied) — `releaseStatus.ts`'s "enforced server-side" claim is true for three of five dimensions; `installDateOnlyShim` (`main.jsx:13`) is not active under Vitest, so `new Date("YYYY-MM-DD")` differs between prod and tests for any code relying on it; `src/pages/rfis/utils.js:47-92` still exports a `Math.max` number-repair helper (no caller).

**LOGIC-12 · `get_next_sequence_number`'s `ON CONFLICT` target does not match the new case-insensitive unique index.** UNVERIFIED RISK · Medium
`baseline:838` `ON CONFLICT (project_id, record_type)`; `20260920014500_ball_in_court_vocabulary.sql:94-95` adds `uq_number_sequences_project_record_ci ON (project_id, upper(record_type))` and notes production holds lowercase `submittal` rows from the sibling app. On such a project, inserting `Submittal` raises 23505 (not caught by `ON CONFLICT`) → three retries → allocation fails closed and the submittal cannot be created. Normalize `record_type` inside the RPC and make the CI index the conflict target.

Done well (A/B): `money.ts` integer-cents arithmetic and `payapp/g702.ts` reconcile to the cent; `docControl/*` is an exemplary "unknown ≠ blank" boundary and only `attestFromHuman` can yield `absent`; `taskStatus.ts`, `duration.ts` (+ DB trigger), `actuals.ts` and the milestone/assignment helpers are consistent and tested; `scheduleCascade.ts` handles cycles idempotently; `ballInCourt.ts` is the single BIC vocabulary and matches all three CHECK constraints; the R&R-resubmit evidence gate is mirrored server-side; `normNum` is shared with SQL and `evaluate_fab_release_set` adds hold/no-file/direct-link blockers the client never had; `csv.ts` neutralises formula injection; the transition graph in `submittalTransitions.ts` matches `enforce_submittal_status_transition`; no UI-offered status/stage/role value rejected by a CHECK was found.

### 4.5 Row-level security and database authorization (category E)

Method: all 120 executable migrations were replayed statically (last definition wins) into an effective policy set (135 tables, 412 policies), verified against the SQL, and reconciled with the live security advisor and the 2026-09-15 capture of production function bodies. **Standing caveat:** `supabase/_capture/DRIFTED-FUNCTIONS-2026-09-15.md:80-108` lists 48 functions whose production body matches no repo version, and they include every RLS helper (`user_has_project_access`, `user_has_project_role_at_least`, `user_is_system_admin`, `user_org_role_at_least`, `get_my_project_role`, `user_is_org_member`, …), the org-member guard, the project-update guard and the fab-release gate. Findings marked (drift) describe the repo's contract; production may already be stronger or weaker.

Baseline facts (all verified): every one of the 135 tables has RLS enabled; no table is `FORCE`d; no write policy is literally `true`; the NULL-`project_id` escape hatch was removed (`20260805030000`); helpers are SECURITY DEFINER + STABLE with pinned `search_path` and `(select auth.uid())`; the live advisor reports **no** `function_search_path_mutable`, `security_definer_view`, `rls_disabled_in_public` or `auth_rls_initplan` lints (the 58 "missing search_path" rows in the heuristic matrix were false positives from the baseline's quoted `SET "search_path"`). `user_has_project_access` (`20260819001000:48-77`) grants visibility to **every org member** when `organizations.member_default_project_role` is set (default `'viewer'`); an explicit `user_projects` row can lower the role but not remove visibility.

**RLS-1 · Two production-only SECURITY DEFINER RPCs write audit rows cross-tenant with no authorization.** CONFIRMED DEFECT (production body) · Medium
Evidence: `supabase/_capture/production-public-functions-2026-09-15.sql` — `log_backcharge_event(p_backcharge_id, …)` (`SECURITY DEFINER SET search_path ''`) selects the project from the caller-supplied backcharge id, sets `steelbuild.bc_rpc = on` (disarming `enforce_backcharge_event_guards`) and inserts into `backcharge_events` with no membership/role check; `log_transmittal_event(p_project_id, p_transmittal_id, …)` inserts into `drawing_transmittal_activity` with caller-supplied project and transmittal ids and no check. Both are in the live `authenticated_security_definer_function_executable` list.
Scenario: any signed-in user posts `/rest/v1/rpc/log_backcharge_event` with another org's backcharge id and fabricates a status-transition event, or floods any project's transmittal audit trail.
Remediation (in production first, then port the file): require `user_has_project_role_at_least(v_project,'pm')`, derive the project from the transmittal row and reject mismatches; revoke EXECUTE if only definer callers exist.

**RLS-2 · The viewer write floor is missing on 13 tables, including the fab-release sign-off INSERT.** CONFIRMED DEFECT (repo; drift for `drawing_signoffs`) · Medium
Evidence: the repo's invariant is "viewer is read-only" (`20260702034009:1-12`), enforced by restrictive floors on 34 tables. Never covered and membership-only: `drawing_analyses`, `drawing_findings`, `drawing_revision_deltas`, `external_linked_folders` (`project_member_access … TO authenticated USING/WITH CHECK user_has_project_access`, `baseline:9844,9848,9860,9880`); `email_accounts`, `email_messages`, `email_attachments` (`FOR ALL … user_has_project_access`, `20260630131332:8-23`); `drawing_zones`, `drawing_links`, `drawing_zone_dependencies` (viewer-writable whenever the set is unlocked — and `20260725203000` unlocked every set); `drawing_signoffs` INSERT `WITH CHECK (user_has_project_access(project_id))` with `stamped_by_id` unpinned (`baseline:9069`) — `20260914010000:94-99` records that **production's** policy is "pm AND stamped_by_id = auth.uid()", so a replay of the repo would regress the P0 stamp to viewer level; `activities`/`pma_audit_logs` INSERT are membership-only (audit noise).
Scenario: with the org default role `viewer`, every org member can insert or alter e-mail messages and mail-account rows (including OAuth tokens, see DB-9), zones/links, revision deltas, and (per the repo) insert a fab-release sign-off attributed to a PM.
Remediation: restrictive `field` floors on the ten project tables; `drawing_signoffs_insert` = `pm AND stamped_by_id = (select auth.uid())` (verify against the live payload first, per CLAUDE.md drift rules).

**RLS-3 · Plan limits are enforced only inside RPCs; a direct INSERT bypasses them.** CONFIRMED DEFECT · Low-Medium
`project_insert` (`baseline:9776`) is `WITH CHECK (user_is_org_member(org_id))`; `plan_project_limit` runs only inside `create_project`; no BEFORE INSERT trigger on `projects`. `organizations_insert` accepts any `plan`/`stripe_*` values because `org_protect_billing_columns` is `BEFORE UPDATE` only (the row is orphaned, so no escalation). A free-plan member can `POST /rest/v1/projects` past the cap. Add a BEFORE INSERT plan-limit trigger and bind the billing guard to INSERT.

**RLS-4 · Official-number counters are writable below the RPC.** PROBABLE CONCERN · Medium
`get_next_sequence_number` gates on `user_has_project_access` only (`baseline:833`), so any viewer/org-default member can burn numbers; `number_sequences` has permissive member `project_insert/update/delete` policies (`baseline:9557,9748,10156`) narrowed only to `field` by the restrictive floor (`20260702034009:27`), so a field user can `UPDATE number_sequences SET next_value = 1` and the RPC then mints duplicates; the client re-allocation loop is the only guard. Drop the authenticated write policies (the RPC is DEFINER and needs none) and raise the RPC gate to `field`.

**RLS-5 · `app-files` storage is org-scoped only: no project scope and no role floor on upload.** PROBABLE CONCERN · Low-Medium
`auth_read`/`auth_upload` (`20260721031606:215-228`) require a UUID first folder + `user_is_org_member(...)`: any org member, including a viewer, can list/download every object under `<org_id>/…` regardless of `user_projects` and can upload; `auth_update`/`auth_delete` (`20260101000020:53-71`) rely on the deprecated `owner` column with bare `auth.uid()`. `email-attachments` is project-scoped (good). Put the project id in the second path segment and require `user_has_project_access` on it; add a `field` floor to upload.

**RLS-6 · Definer read oracles callable by any authenticated user without a project check.** PROBABLE CONCERN · Low
`evaluate_fab_release_package` (`20260725200000:5-40`; the rejected/superseded/not-IFC branches query `drawings WHERE id = ANY(p_drawing_ids)` unfiltered), `work_package_drawing_set_reports` (`20260915120000:438-470`, returns set names/submittal numbers/stage for any work-package id), `set_for_drawing_is_locked`, `set_for_zone_is_locked`, `piece_control_drawing_is_approved`, `users_share_org` (membership oracle), `founding_org_id`. Exploitation needs UUID knowledge. Prepend an access check or revoke where only definer callers exist.

**RLS-7 · `feature_flags_select USING (true)` exposes per-user override e-mails cross-tenant.** CONFIRMED DEFECT · Low
`baseline:9243`; `user_overrides jsonb` is written by the production `set_feature_flag_override(p_flag_key, p_email, …)` (capture `:4525`), so every authenticated user in every org can read every override e-mail. Expose a `security_invoker` view without `user_overrides` (or an RPC returning the caller's effective value).

**RLS-8 · `org_members_update` does not pin `user_id`/`org_id`.** PROBABLE CONCERN · Low
`baseline:9341`; an org admin can re-point an existing non-owner row to another auth user, adding a member without an invitation and without the INSERT-time member-limit check. Pin both columns in `enforce_org_member_guard`'s UPDATE branch. (AUTH-1 covers the missing DELETE guard on the same table.)

**RLS-9 · Default privileges still grant EXECUTE on every new function to `authenticated` and `service_role`.** RECOMMENDATION
`baseline:11337-11340`; `20260702032954:13-14` revoked only the `anon` default; `20260914020000:3-16` documents that 14 of 17 earlier `REVOKE … FROM PUBLIC` statements were ineffective for this reason. This is the root cause of the 153-function advisor warning. Revoke the default and grant explicitly (policy helpers must keep `authenticated` EXECUTE).

**RLS-10 · Informational.** Archived projects are invisible but still writable by id (`user_has_project_role_at_least`/`get_my_project_role` lack the `is_deleted` gate that `user_has_project_access` has). Org-wide (not project-scoped) SELECT is intentional on `user_profiles` (spans every org the viewer shares), `organization_members`, `organization_invitations` (**including the `token` column**, AUTH-3), `vendors` (org-wide read/write/delete by any member), and the global `feature_flags`/`default_cost_codes`. Viewers can invoke write-side RPCs gated on access only (`generate_project_alerts`, `log_submittal_event`, `refresh_project_change_total`, `get_next_sequence_number`). `note_folder_job_links_write FOR ALL USING (false)` counts as a second permissive SELECT policy (live `multiple_permissive_policies`); make it restrictive. The 95 callable SECURITY DEFINER RPCs all pin `search_path`; every EXECUTE revoke in `20260715235514`, `20260805030100`, `20260912023827`, `20260914020000`, `20260914122050`, `20260915100000` took effect (none of those names appear in the live list). The erasure helpers (`erasure_toggle_user_triggers`, `hard_delete_toggle_triggers`, `hard_delete_release_dependents`) are callable but self-gate on a transaction-local GUC a PostgREST client cannot set; `set_runtime_config`/`prune_client_events` require `user_is_system_admin()` (verified in the capture) — revoke them anyway for hygiene.

Per-table coverage matrix (compact; legend — v: any project member incl. viewer · f: field · pm · adm: project admin · sys: global admin · org:m/a/o: org member/admin/owner · self · (R): via restrictive floor · RPC: writes only through DEFINER RPC/service role · none: policy `false` · `*`: viewer while the set is unlocked):

| table(s) | S | I | U | D | note |
|---|---|---|---|---|---|
| action_items, contacts, daily_logs, deliveries, delivery_items, inspections, model_elements, photos, punchlist_items, rfis, risks, safety_incidents, schedule_tasks, task_dependencies, work_packages, submittal_activity/components/sheet_responses/comment_dispositions, drawing_sheets, expenses (prod: RPC-only) | v | f | f | f | |
| alerts, document_folders/import_queue/documents, drawing_activity, drawing_reviews, drawing_revision_comparisons, drawing_zone_activity/proposals, email_intake_queue, external_file_refs/linked_folders, look_ahead, meetings, mitigation_actions/logs, model_element_links, model_registry, pma_assumptions/decisions, project_handoff_items, quality_control_records, resources, scope_items, uploaded_files, warranties, number_sequences | v | f(R) | f(R) | f(R) | number_sequences: RLS-4 |
| backcharges, backcharge_tm_tickets, change_orders, cost_codes, pay_applications, sov_items, fab_releases | v | pm | pm | adm | |
| budget_hour_items, drawing_callout_links, pay_application_lines, project_calendars, schedule_baselines, gc_drawing_sets/gc_drawings (D via soft-delete UPDATE) | v | pm | pm | pm/RPC | |
| change_requests, drawing_impacts, drawing_transmittals/items, email_integration_settings, project_closeout | v | pm(R) | pm(R) | pm(R) | |
| drawings | v | f | f | pm | lock triggers |
| drawing_sets | v | f | f | adm | |
| drawing_revisions | v | pm | pm | RPC | |
| drawing_revision_summaries | v | f | RPC | pm | |
| drawing_markups, comments (`TO public`) | v | f own | f own / pm | f own / pm | |
| drawing_holds | v | f | f | RPC | |
| drawing_watchers | v | self | self | self | |
| **drawing_analyses, drawing_findings, drawing_revision_deltas, external_linked_folders, email_accounts, email_messages, email_attachments** | v | **v** | **v** | **v** | RLS-2 |
| **drawing_zones, drawing_links, drawing_zone_dependencies** | v | v* | v* | v* | RLS-2 |
| **drawing_signoffs** | v | **v** (prod: pm+self) | pm (+void rule) | adm | RLS-2 (drift) |
| activities, ai_audit_log, pma_audit_logs | v | v (actor stamped) | RPC | RPC | append-only |
| backcharge_events | v | pm+self | RPC | RPC | bypassed by RLS-1 |
| fab_release_log, fab_release_overrides | v | pm+self / f+self | RPC | RPC | gate trigger BEFORE INSERT |
| submittals, submittal_rounds | v | f (pm if Released)(R) | f (pm if Released)(R) | f | fab-gate triggers |
| pieces, piece_* (10 tables), planner_action_events, material_requirements, material_receipt_events | v | RPC | RPC | RPC | table grants revoked; guard triggers |
| piece_production (`TO public`) | v | f | f | pm | |
| piece_control_command_failures | adm | RPC | RPC | RPC | |
| note_folders, note_folder_job_links | folder | none | none | none | RPC-only |
| note_folder_audit_events/migrations | org:a | RPC | RPC | RPC | |
| note_folder_mutation_receipts | none | RPC | RPC | RPC | |
| production_notes | v∧folder(R) | f∧folder(R) | f∧folder(R) | f∧folder(R) | |
| projects | v ∨ sys (not archived) | **org:m** (RLS-3) | pm (+guard: org_id immutable, is_deleted admin, contract pm) | RPC (`soft_delete_project`, admin) | |
| organizations | org:m | any authenticated (created_by=self) | org:a (billing cols trigger-locked on UPDATE) | org:o | RLS-3 |
| organization_members | org:m | org:a (no owner) | org:a (no owner rows; last-owner guard) | **org:a ∨ self** | AUTH-1, RLS-8 |
| organization_invitations | org:m (**token visible**) | org:a (+invited_by=self; owner invite needs owner) | org:a | org:a | AUTH-3 |
| user_profiles | self ∨ org-mates | self (role trigger-locked) | self (role trigger-locked) | RPC | |
| user_projects | self ∨ adm ∨ sys | adm (role ∈ list) | adm (identity pinned) | adm | |
| vendors | org:m | org:m | org:m | org:m | any member may delete |
| feature_flags | true (RLS-7) | sys | sys | sys | |
| default_cost_codes | true | sys | sys | sys | global reference |
| demo_requests | sys | anon/auth (length-checked, throttled) | RPC | RPC | |
| llm_telemetry, account_deletions, member_activity | sys (member_activity: sys ∨ v) | RPC / adm | RPC | RPC | |
| billing_config, billing_events (repo), planner_offline_operation_receipts, private.* | — | — | — | — | deny-all, intentional; `billing_events` has policies in production (2026 app) that the repo lacks |

Client writes vs. policy coverage: every client write path lands on a covered command (`Project.delete` → `soft_delete_project`, `GcDrawing*.delete` → soft-delete UPDATE, feature flags → sysadmin policies). UPDATE policies do not pin `project_id` (a row can only move between projects where the caller already holds the floor); `org_id`, `user_profiles.role`, `organizations` billing columns (UPDATE only) and `user_projects` identity are pinned by triggers.

Done well (E): the chokepoint design is sound and org-aware; sensitive columns are trigger-locked; owner-minting through invite UPDATE, forgeable pay-app RPCs, a cross-tenant row-count census and `link_unlinked_model_elements_for_piece` were all closed in September with `has_function_privilege` assertions; piece-control and erasure RPCs gate on role + project mode + `ARCHIVE_FIRST` + typed confirmation; the anon `demo_requests` path is column-granted, length-checked and throttled; buckets are private with a MIME allowlist; trigger functions are revoked from API roles and the ineffective `REVOKE FROM PUBLIC` pattern was diagnosed and corrected.

### 4.6 Input validation and client-side security (category F)

No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function` or string `setTimeout` exists in `src/`; `react-markdown` runs without `rehype-raw`; the only `dangerouslySetInnerHTML` is a `<style>` in an unused shadcn chart primitive. No PostgREST filter is built from a search box (all `.or(` sites are digit-guarded job-number lookups; `drawingHub/dependencies.js:205` interpolates a DB zone id without a UUID regex). Every sampled `JSON.parse` of stored values is try/catch-wrapped. XML imports use browser `DOMParser` (no XXE). CSRF does not apply (bearer header, no cookies).

**SEC-1 · Four CSV exporters do not neutralise formula-leading cells.** CONFIRMED DEFECT · Medium-Low
`src/components/drawings/drawingsUtils.js:155` (transmittal export: title, reviewer, notes), `src/pages/rfis/utils.js:182-186` (RFI log: question/answer), `src/lib/exports/fabRelease.ts:276` (fab-release manifest), `src/pages/rfis/AgendaPanel.jsx:19-22` only quote-double; `src/lib/csv.ts:28` already has `FORMULA_LEAD = /^[=+\-@\t\r]/` but only `exportToCSV` callers benefit. A drawing title or RFI question starting with `=`, `+`, `-`, `@` is evaluated when a PM opens the export in Excel (DDE/`HYPERLINK` exfiltration after the usual prompts). Route all exporters through `escapeCell`; add a test that feeds `=1+1` through each.

**SEC-2 · Stored `file_url` values are bound straight to `href` with no scheme validation.** PROBABLE CONCERN · Low-Medium (insider, app origin)
`src/components/scope/ScopeItemList.jsx:354`, `ScopeItemFormModal.jsx:396`, `src/components/drawings/DrawingsTableRows.tsx:326,603` (`driveUrl = parent.file_url`), `PunchlistList.jsx:233-237`, `DailyLogsList.jsx:363-367` (`photos[].url` from JSONB). These bypass `resolveFileUrl` (trusted-host gate, `src/api/client/storage.ts:51-63`) and `isAllowedFileReference` (`useRfiPdfAttachments.ts:38-44`). React 18 still renders `javascript:` hrefs. RLS is row-scoped, not column-scoped, so any member can PATCH `scope_items.file_url` / `drawing_sets.file_url` / `punchlist_items.photos` to a `javascript:` URL; a colleague clicking the link executes script in the app origin with access to `localStorage["sb-…-auth-token"]`. Stored values are normally storage paths (so these links are also functionally broken today). Resolve through `resolveFileUrl` or gate on `isAllowedFileReference`; add an ESLint rule forbidding `href={…file_url…}`.

**SEC-3 · Inbound e-mail HTML is rendered with remote content and no in-frame CSP.** PROBABLE CONCERN · Low
`src/pages/emailInbox/components.tsx:569-591` renders `body_html` in `<iframe sandbox="allow-same-origin" srcDoc>` (no `allow-scripts` — correct pairing); ingest stores `body_html` verbatim (`email-ingest/index.ts:953`); DOMPurify 3.4.15 is installed (transitively) but unused. Tracking pixels/remote images load on open (read receipt + IP), `<meta http-equiv=refresh>` can navigate the frame, and any future `allow-scripts` becomes same-origin XSS from inbound mail. Sanitise with DOMPurify, inject a `default-src 'none'` meta CSP into the srcdoc, add a "load remote images" toggle, and test that the sandbox never gains `allow-scripts`.

**SEC-4 · Sender-supplied `Content-Type` and permissive bucket MIME lists.** PROBABLE CONCERN / UNVERIFIED · Low (Supabase origin, not app origin)
`email-ingest/index.ts:1015-1027` stores attachments with the sender's content type into `email-attachments`, which has no MIME allowlist; the extension denylist (`_shared/attachments.ts:15-24`) blocks `html/js` but not `svg`. `app-files` allows `image/svg+xml`, `text/xml`, `application/xml`, `application/octet-stream` (`20260101000020:24-33`), `uploadValidation.ts:81` lists `svg` as an image, and files are opened with `window.open(signedUrl)` (`DrawingViewer.jsx:386,762`, `DrawingsGrid.jsx:501`, `useRfiPdfAttachments.ts:93`). A `drawing.pdf` with `Content-Type: text/html` or an SVG with inline script runs on `<ref>.supabase.co` (phishing/spoofing on a trusted domain; the app token is not reachable). Whether Supabase adds `Content-Security-Policy: sandbox`/`Content-Disposition` to object downloads was not verifiable offline. Derive content type server-side from an allowlist, set `allowed_mime_types` on the bucket, use `download: true` for anything that is not PDF/raster.

**SEC-5 · Smaller items.** INFORMATIONAL
Dead `src/components/shared/pdfHandling.jsx:9-10` pins a **CDN** pdf.js worker at 4.0.379 (no importers; would violate CSP `script-src 'self'`) — delete it; `Math.random()` is used for `client_op_id` (`offlineQueue.js:57`) and upload-name suffixes (`uploads.ts:63`), never for tokens — prefer `crypto.randomUUID()` for idempotency keys; `src/lib/ifc/gzip.js:16-18` inflates without a size cap (a same-org member's 50 MB gzip can inflate to GBs and OOM the viewer tab); `stripe-billing` `PRICE[plan]` is a plain-object lookup (`"toString"` passes the truthy check and reaches Stripe, which rejects it); `DocumentDetailPanel.jsx:85-90` copies a 1-hour signed URL as a "share link" (TTL stated). The browser-storage inventory (26 keys) shows no storage key used for an authorization decision; see AUTH-6 for what survives logout.

Done well (F): one upload chokepoint with an org-UUID-validated object key and no user-controlled path segment, fail-closed workflow allowlists, a dangerous-extension denylist, size caps and `sanitizeFilename`; `resolveFileUrl`'s trusted-host gate; no open redirect; Stripe/LLM allowlists; versioned, key-allowlisted preferences import; no secrets in `src/`/`public/`; dependencies at patched versions (`pdfjs-dist` 4.10.38 > 4.2.67, `@e965/xlsx` 0.20.3 ≥ 0.20.2, `dompurify` 3.4.15 present, `react-markdown` 9.1.0).

### 4.7 Database design and migrations (category G)

Inventory (parser over every `CREATE TABLE` body and function header): 135 tables (102 baseline + 33 later; 2 in `private`), 1 view (`drawing_register_view`, `security_invoker=true`), 236 function headers (186 SECURITY DEFINER, **0 without `SET search_path`**), 149 + 54 triggers, 321 + 116 policies, ~405 indexes (0 `CONCURRENTLY`, correct inside transactions), 209 + ~55 FKs, 146 + 31 CHECK constraints, **0 enum types** (text + CHECK throughout), **0 `timestamp without time zone`**, money columns all `numeric`, no destructive DDL (`DROP TABLE/COLUMN/FUNCTION`, `TRUNCATE`) in the active set. 50+ vocabulary CHECK constraints match the client vocabularies (§5).

**DB-1 · `piece_events` has no primary key.** CONFIRMED DEFECT · Medium (live advisor confirms `no_primary_key`)
`20260718000000_piece_control_slice0.sql` declares `id uuid … NOT NULL` with no PK/UNIQUE; the app subscribes to this table in six realtime call sites. Without a replica identity `postgres_changes` cannot emit UPDATE/DELETE and Supabase realtime requires a PK; PostgREST row targeting by `id` is unenforced. Add `PRIMARY KEY (id)` after a duplicate check. (`sheets_doc_backup` is the other PK-less table, owned by the abandoned Sheets prototype.)

**DB-2 · Nullable `is_deleted` on six tables is mis-read by the archive path.** PROBABLE CONCERN · Medium
`submittals`, `comments`, `risks`, `budget_hour_items`, `model_registry`, `fab_releases` declare `is_deleted boolean DEFAULT false` (nullable; e.g. `baseline:5011`) and are never tightened; `soft_delete_project` updates children `where … is_deleted = false` (`20260727012111`, adopted verbatim `20260914120000:25`); baseline indexes on `submittals` disagree (`WHERE is_deleted = false` vs `WHERE is_deleted IS NOT TRUE`). A row with `is_deleted = NULL` survives project archive and flips between predicates. Backfill and `SET NOT NULL`.

**DB-3 · Never-validated `NOT VALID` check on `drawings` above a SET NULL FK.** PROBABLE CONCERN · Medium
`baseline:5428` `drawings_drawing_set_id_required_chk CHECK (drawing_set_id IS NOT NULL) NOT VALID` — no `VALIDATE CONSTRAINT` anywhere; `20260912055243` notes the FK is `ON DELETE SET NULL` beneath it, so deleting a set with live drawings raises 23514. `NOT VALID` checks are still enforced on UPDATE, so any legacy drawing with a NULL set cannot be edited at all. Backfill/soft-delete, `VALIDATE`, change the FK to `RESTRICT` (deletion already goes through `delete_drawing_set`).

**DB-4 · Loose tenancy columns.** PROBABLE CONCERN · Low-Medium
`fab_releases.project_id` nullable with an FK that has no `ON DELETE` and a nullable `is_deleted`; `number_sequences.project_id` NOT NULL but **no FK** to `projects`; `llm_telemetry.project_id` nullable, no FK. The P0 fab-release record can exist with no project, and number counters can outlive their project via any delete path other than `hard_delete_project`.

**DB-5 · One-shot production data operations live in the permanent replay set.** PROBABLE CONCERN · Medium
`20260725203000_unlock_all_drawing_sets.sql` (`DISABLE TRIGGER` + `UPDATE … SET is_locked = false`), `20260817020000` (hardcoded production row UUIDs; the manifest itself says "PURE DATA REPAIR … MUST NOT BE STAMPED"), `20260819001000:40` (`UPDATE organizations SET member_default_project_role = 'viewer' WHERE … IS NULL` — widens visibility for every org on replay), `20260725190000:15` (forces a feature flag ON), plus backfills in `20260813120000`, `20260908140000`, `20260904120000`, `20260908120000/160000`, `20260724130000`, `20260727192742`, `20260920014500`. All are guarded/idempotent, but product decisions are re-asserted on every fresh environment and a paste-replay on production would re-run the unlock. Move one-shot repairs to `supabase/scripts/` with ledger-only stamps, or guard on an environment setting.

**DB-6 · Migration mechanics that bite the documented by-hand path.** CONFIRMED / UNVERIFIED · Low-Medium
(a) Non-idempotent `CREATE POLICY`/`CREATE TRIGGER`/`ADD CONSTRAINT` without `IF EXISTS`/drop guards in ~15 files (`20260620231716`, `20260623032908`, `20260630000310`, the seven `piece_control_slice*` files, `20260725193000`, `20260908045525`, `20260704000005`, `20260802090000`) — the ledger stops the CLI, but a second paste in the SQL editor fails with 42710 part-way. (b) 14 files carry their own `BEGIN;/COMMIT;` inside a runner that already wraps each file — exactly the shape that produces a committed ledger row for a rolled-back body (the README documents one such "lying ledger" on 2026-09-14; cause unproven). (c) `NOTIFY pgrst, 'reload schema'` is missing in 47 API-affecting files (hosted Supabase reloads via event trigger; local/branch stacks do not). (d) `lock_timeout` appears only in the five most recent files; earlier `ADD CONSTRAINT … CHECK` without `NOT VALID` scans the table (all tables are small today).

**DB-7 · Residual `anon` grants and storage initplan.** PROBABLE CONCERN · Low
Ten baseline `GRANT ALL ON FUNCTION … TO anon` survive (8 trigger functions uncallable via RPC, plus `plan_member_limit(text)` / `plan_project_limit(text)` pure lookups); the storage `auth_update`/`auth_delete` policies use bare `auth.uid()` (`20260101000020:56,62`), the "only remaining violations" per `20260912023827` §7.

**DB-8 · Realtime publication membership is unreproducible and inconsistent with app subscriptions.** UNVERIFIED RISK · Medium
The active set adds only `model_elements` to `supabase_realtime` (`20260731003000:83`); the 16-table add exists only in `migrations_archive/20260611140000` (never replayed). The app subscribes to 18 tables; `drawing_impacts`, `piece_events`, `drawings`, `projects`, `documents`, `submittals`, `piece_production`, `drawing_findings`, `contacts`, `comments` appear in no publication statement anywhere. On a fresh environment those invalidations are dead; in production their state is unknown. RLS applies to `postgres_changes`, so exposure is not the concern — silent staleness is. One idempotent migration adding every subscribed table, plus a test diffing `table:` literals in `src/` against it.

**DB-9 · Plaintext credential columns readable by ordinary members.** INFORMATIONAL · Low-Medium
`email_accounts.access_token`/`refresh_token text` are readable **and writable** by any project member (`email_accounts_project_access FOR ALL`, `20260630131332`; RLS-2) and are bundled into `project-export` (EDGE-16); `billing_config.stripe_webhook_secret text` is fail-closed (RLS on, zero policies, service-role grant only). Move mail tokens to Vault or a service-role-only side table.

**DB-10 · Hygiene.** RECOMMENDATION · Low
35 tables carry two `updated_at` triggers (`trg_updated_at` + `trg_<table>_updated_at`, both → `update_updated_at()`); 7 tables with the column have none (`billing_config`, `default_cost_codes`, `drawing_signoffs`, `email_accounts`, `email_messages`, `note_folders`, `piece_station_configurations` — the alerts engine keys "stalled" on `updated_at`); 13 unindexed FKs in later migrations (`note_folders.parent_folder_id` matters for `hard_delete_organization`'s 12-pass loop) and 73 live; 6 duplicate index pairs live; 267 unused indexes live; `uq_change_orders_project_number` ignores `is_deleted` unlike the RFI/submittal/pay-app number indexes; authorization-relevant jsonb (`feature_flags.user_overrides`, `submittals.metadata.ofs_checklist`, `projects.metadata` purpose/lead days) has no shape CHECK (zero e-mail tokens exist in any seed — the "no e-mails in overrides" rule holds but is enforced by nothing); `demo_requests` stores anonymous PII with no purge job; the seed's `do $$ … exception when others` guards would leave a branch with buckets but no storage policies on partial failure; `rls_auto_enable()` exists but its event trigger is not in the dump.

**DB-11 · Ledger, drift and recoverability (root cause).** CONFIRMED · **High for DR, Medium for process**
Migrations are applied by hand and stamped by hand (CLAUDE.md); ~29 ledger rows were written as repair rows with no `statements` payload (`supabase/scripts/apply-20260819-migrations.sql`, `docs/runbooks/supabase-ledger-reconciliation-2026-09-14.md`), so CLAUDE.md's "hash the file against the ledger payload" rule is unsatisfiable for them; the CI drift check compares 14-digit stamps only. The active set **replays** from zero (runbook 2026-09-13; the two "ALTER without CREATE" cases TECH_DEBT cites are guarded, so its "a reset fails" claim is stale), but the result **is not production**: 171 live functions have no migration (86 SECURITY DEFINER, 65 trigger-wired), 48 bodies have drifted (including every RLS helper and the fab-release gate), ~11 tables are untracked, and 41 sibling-app migrations own core tables. Consequences: Supabase PITR/backups are the only full-fidelity recovery (and PITR is off, DR-1); a staging environment built from this repo silently diverges from production in its RLS helpers; the `_capture` directory holds bodies only (no tables, policies, grants, triggers; oid-ordered, unproven).

Done well (G): every repo SECURITY DEFINER function pins `search_path` and eight pure helpers are pinned behind a SHA-256 body guard with a PGlite test; consistent typing (`numeric` money, `timestamptz`/`date`, uuid PKs, text + CHECK vocabularies, `NOT VALID → VALIDATE` on the newest constraints, `to_regclass`/`to_regprocedure` guards); atomic RPC number sequencing with a case-insensitive uniqueness guard; erasure RPCs rebuilt on evidence with text-level tests pinning each fix; quarantine/external/archive separation enforced by the drift checker and Vitest; recent files set `lock_timeout` and document what they deliberately do not touch; no PII or org names in seeds.

### 4.8 Performance and efficiency (category I)

Measured baseline (§2.2): entry ≈ 97 KB gzip JS + 22 KB CSS, all routes lazy, budgets met (162.5 KB initial / 3.1 MB total gzip). The problems are data-volume and render-shape, not bundle size.

**PERF-1 · The Piece Register renders every piece row into the DOM from a `select *` full-table read.** CONFIRMED DEFECT · **High**
`src/pages/pieceRegister/PieceRegisterRegisterView.tsx:428` `filteredRows.map((piece) => …` with no virtualizer; data from `src/lib/pieceControl/repository.ts:70-92` `fetchAllProjectRows("pieces")` → `.select("*")`, offset `.range()` 1000/page, tombstones filtered client-side; filter state lives at page level (`PieceRegister.tsx:268,562`) so every keystroke re-renders every row. The repo already has `src/components/command/DataTable.tsx:118` (`useVirtualizer`) at 25 call sites. CLAUDE.md puts live rosters at ~28k rows → ~300k DOM nodes, tens of MB of JSON, 29 requests. Render through `DataTable`, filter `is_deleted` server-side, project columns, `useDeferredValue` on filters.

**PERF-2 · The 3D tab re-pages the whole `pieces` table every 30 s and on every window focus.** CONFIRMED DEFECT · **High**
`src/components/viewer3d/Model3DTab.jsx:143-159`: `refetchInterval: 30_000`, `refetchOnWindowFocus: true`, `refetchOnReconnect: true` on `fetchAllProjectRowsPaged(supabase, "pieces", …)`; the same key is already invalidated by realtime. 28k rows → ~58 requests/min per open viewer. Remove the interval (or ≥ 5 min as a dropped-channel fallback), keep focus refetch off.

**PERF-3 · Canonical-reporting realtime has no debounce and invalidates seven keys, three of which are full paged reads.** CONFIRMED DEFECT · **High during imports / bulk station advances**
`src/hooks/useCanonicalReportingRealtime.ts:59-81` (7 tables, `event: "*"`, → `invalidateCanonicalPieceCaches`) vs the 300 ms coalescing in `useRealtimeInvalidation.ts:50-60`. An import of N pieces fires N callbacks; each completed refetch is immediately re-invalidated, so every viewer of the project refetches the whole roster repeatedly for the length of the import. Add the same trailing debounce and narrow the events.

**PERF-4 · Every entity read is `select *`, so drawings lists ship `extracted_text`, `callouts`, `markup`, `hyperlinks`, `metadata`.** CONFIRMED DEFECT · High → Medium (grows as `attachPageText` populates rows)
`src/api/client/softDelete.ts:97-100` `projectScopedSelect` returns `*` (or `*, projects!…!inner(id)`) for every `list/listAll/filter/filterAll/get` in `entityClient.ts`; no projection exists in `entities.ts`. Readers: `useDrawings.ts:62` (2000-row hub list, 60 s stale), `Dashboard.jsx:142-147`, `GlobalSearchModal.jsx:89` (tenant-wide). With the 2,400-char/page text cap and the new producers, a 1,000-sheet register moves toward ≥ 2.4 MB of text plus markup arrays per read. Add a `columns` option to `createEntityClient` and a default list projection for `Drawing` that excludes the five wide columns.

**PERF-5 · Portfolio pages page whole tenant tables to the browser, five times over under different keys.** CONFIRMED DEFECT · Medium-High
`listAll()` (offset paging) on `Projects.jsx:52-57` (4 tables), `RFIs.jsx:89-129` portfolio mode (4), `PortfolioHub.jsx:45-93` (9), `ExecutiveView.jsx:69-75` (7); `Dashboard.jsx:84-137` uses capped `list()` for 8. `schedule_tasks` alone lives under five keys; `["projects"]` is backed by `Project.list()` in one page and `Project.listAll()` in two others (one key, two caps — and the global `select` default that broke DATA-1). Financial reports (`reports/PortfolioOverview.jsx:81-114`, `FinancialKPIs.jsx:131-147`, `ProjectDetails.jsx:108-149`) sum the **first 1,000 rows** with only a Sentry warning on truncation. One `usePortfolioDataset()` with canonical keys; move KPI rollups to SQL.

**PERF-6 · `drawing_revisions` is paged to completeness by four hooks on the same screen.** CONFIRMED DEFECT · Medium
`DrawingSubmittalHub.tsx:313-314`, `useTransmittals.ts:117-136`, `useDrawingReviews.ts:27-37`, `useDrawingImpacts.ts:32-42` each call `entities.DrawingRevision.filterAll({project_id})`; 4× ceil(N/1000) requests and four copies in memory per hub visit.

**PERF-7 · Offset paging under per-row SECURITY DEFINER RLS.** PROBABLE CONCERN · Medium (becomes timeouts at scale)
`entityClient.ts:141,204`, `pieceControl/pagedSelect.ts:78`, `repository.ts:81` and six more use `.range(offset, …)`; the repo's own measurement (`src/lib/ifc/fetchAllModelElements.js:9-41`) records 57014 statement timeouts at 28 offset pages and fixed only `model_elements` with keyset paging. Also: the default `order('created_at' desc) limit 2000` on every list has no `(project_id, created_at)` index on `drawings`/`rfis`/`submittals`/`schedule_tasks`/`deliveries`/`work_packages` (in-memory sort per read; `drawing_activity (project_id, created_at DESC)` is the pattern to copy). A shared keyset helper plus the composite indexes.

**PERF-8 · Render churn from unmemoized context values.** PROBABLE CONCERN · Medium
`AuthContext.tsx:488-514` (25 fields, 28 consumers), `ProjectContext.jsx:328-340` (47 consumers), `ThemeContext.jsx:198` build a new `value` object every render (`OrgContext.jsx:61-75` does it right); `React.memo` in 3 files, `useDeferredValue`/`startTransition` in 2; page-level filter state on the big pages re-renders the whole page per keystroke (bounded where tables virtualise, unbounded on the Piece Register). Every auth state change re-renders `Layout`/`SidebarNav` (1,184 lines).

**PERF-9 · IFC viewer renders continuously at display refresh while idle.** PROBABLE CONCERN · Medium on tablets
`IfcModelViewer.jsx:190-202` `tick → controls.update(); renderer.render(); requestAnimationFrame(tick)` unconditionally, no dirty flag or `document.hidden` gate (disposal is correct). Render on demand.

**PERF-10 · Static assets on the critical path.** PROBABLE CONCERN · Low-Medium (field networks)
Unreferenced `public/steelbuild-pro-hero-industrial.png` (1.87 MB) and `public/logo.png` (153 KB) are shipped; `public/photos/steelbuildpro-hero.svg` (371 KB, almost certainly an embedded raster) is the default hero on ~20 Control Centers (`PageHero.tsx:9`); `steelbuild-pro-logo.jpg` (129 KB) is the boot splash on every cold load (`index.html:89`); six font families / 28 weights load through one render-blocking cross-origin stylesheet, `Barlow` and `JetBrains Mono` effectively unused. Delete dead assets, re-export the hero as WebP/AVIF, use a few-KB SVG splash, trim and self-host the fonts.

**PERF-11 · Smaller items.** PROBABLE / INFORMATIONAL
Same-topic realtime channels (`rt:<table>:<project>`, `canonical-reporting:<project>`) are shared by co-mounted hooks and torn down by whichever unmounts first (`work_packages`: `WorkPackages.tsx:204` + `FabRelease.tsx:176`; `change_orders`; three canonical mounts) — needs a runtime check; the offline outbox has no backoff, stops at the first failure whatever the cause, and grows creates unbounded in localStorage (`offlineQueue.js:187-210`, `useFieldOutbox.js:60-68`); the signed-URL cache never expires (`useResolvedFileUrl.js:4`, 1-hour URLs; tabs open > 1 h start 400ing on thumbnails; `createSignedUrls` unused); `useDrawingRegister.ts:44-66` reads a view with no bound then fans out N/100 lookups for `drawing_set_id`; global search loads six tenant-wide tables on open (DATA-7); `KpiTile.jsx:73` starts a 30 s interval per tile with `updatedAt` (100 usages); one blob URL is never revoked (`Activity.jsx:105-109`; 28/29 sites revoke); sequential per-row mutations where `bulkUpdate` exists (`useDrawings.ts:198,241`, `useSubmittalBulkMutations.ts:23,58`, `Punchlist.jsx:170`, `Expenses.jsx:159,180`); `Dashboard.jsx:172` passes a limit `list()` ignores; `tailwind.config.js:4` scans only `.js/.jsx` so utilities used only in `.tsx` are not generated; `perf:bundle` (with budgets) and `perf:trace` exist but neither runs in CI.

Done well (I): keyset-paged, projection-aware roster loader with a HEAD-count probe; the explicit truncation model (`LIST_ROW_CAP`/`SERVER_MAX_ROWS`/`EFFECTIVE_LIST_CAP`, `ListTruncationNotice`, Sentry warning); `useRealtimeInvalidation` coalescing and teardown; realtime replacing 60 s polls in Alerts/Deliveries; virtualization on the drawings register, RFIs, submittals, revision impact and every `DataTable`; Gantt windowing; `refetchOnWindowFocus: false` globally; lazy routes, shell chrome, viewer and modals with hover-only prefetch; well-reasoned `manualChunks` (the clsx bridge and preload-helper pin are documented and correct); three.js/pdf.js disposal and the thumbnail document LRU; SW never caches API responses.

### 4.9 Mobile, Apple App Store and Google Play (categories J, K, L)

Platform state: **no `ios/` and no `android/` directory exist**; only `capacitor.config.ts`, `src/lib/native/*`, `mobile/ios/PrivacyInfo.xcprivacy` and `mobile/ios/Info.plist.snippet.xml` are committed. `.gitignore:82-95` ignores only generated iOS artefacts, so a generated Xcode project could be committed; it never has been.

**MOB-1 · Google Play readiness is 0%: there is no Android platform.** CONFIRMED · **Blocker for objective 3**
Evidence: no `android/`, no `@capacitor/android` in `package.json`, no `build.gradle`/`AndroidManifest.xml`/`assetlinks.json` outside `node_modules`, no `App.addListener('backButton')` (only `keyboardWillShow/Hide` and `appUrlOpen` in `src/lib/native/capacitor.ts:47-71`). Everything in the Play checklist (§7) is outstanding, including Play's requirement for a **web-reachable account-deletion URL** (deletion exists only in-app).

**MOB-2 · The native plugins the submission runbook cites as the "not just a website" defense have zero call sites.** CONFIRMED DEFECT · **High** (Guideline 4.2 / 2.3 truthfulness)
Evidence: `package.json` lists `@capacitor/camera`, `haptics`, `share`, `preferences`; `grep -rn "@capacitor/" src` finds only `core`, `app`, `keyboard`, `splash-screen`, `status-bar`; knip lists all four as unused dependencies. `docs/app-store/SUBMISSION.md:125` claims "Handled: native camera capture, haptics, share sheet". Photos are captured only through `<input type="file" accept="image/*">` (`src/components/shared/PhotoStripUploader.jsx:205-211`).
Remediation: implement (Camera.getPhoto on native, Share.share for exports, Haptics on capture) or drop the deps and rewrite §5 of the runbook truthfully.

**MOB-3 · Auth e-mail redirects target `capacitor://localhost`; the native app cannot receive them.** CONFIRMED DEFECT · **High**
Evidence: `src/lib/AuthContext.tsx:320` `emailRedirectTo: window.location.origin`; `:352-354` `redirectTo = \`${window.location.origin}/update-password\``. On iOS the origin is `capacitor://localhost`, which is not an allowlisted redirect, so Supabase falls back to the Site URL; `public/.well-known/` holds only `security.txt` (no `apple-app-site-association`), no Associated Domains entitlement is documented, `extractInAppPath` rejects custom schemes, and the implicit flow puts tokens in a hash fragment.
Scenario: sign-up confirmation and "Forgot password" started in the app complete in Safari on the web app; the app never receives the `PASSWORD_RECOVERY` session. A reviewer testing reset watches the app bounce to Safari.
Remediation: pass an explicit allowlisted `https://steelbuild-pro.com/...` redirect on native; then ship Universal Links (AASA + `applinks:` entitlement) with PKCE (`exchangeCodeForSession` from the `appUrlOpen` handler), or document web completion in the review notes.

**MOB-4 · Signed-out native users see the marketing page with plan prices and a "buy on the web" pointer.** PROBABLE CONCERN · **High** (Guideline 3.1.1 / 3.1.3(b) outside the US storefront)
Evidence: `src/boot/AuthenticatedApp.jsx:119-143` renders `<Landing>` whenever `!isAuthenticated`; `src/pages/Landing.jsx:644-656` renders `PLANS` with `$${p.priceMonthly}` "/workspace · mo" and "Start free"; `:633` "Upgrade to Pro or Business from Billing"; the file has no `isNativePlatform` gate. `src/pages/Billing.jsx:136-140` native copy: "Sign in at steelbuild-pro.com to view plans or change your subscription."
Remediation: render a compact sign-in screen natively; make the Billing note neutral ("plan changes are handled by your workspace administrator") without a domain.

**MOB-5 · Every blob/anchor download is dead inside WKWebView.** PROBABLE CONCERN · Medium (Guideline 2.1 completeness)
Evidence: 44 source files use `URL.createObjectURL` + `a.download` (e.g. `src/components/drawings/drawingsUtils.js:158-161`, `expenses/ExpenseImportModal.jsx:80-83`, `dms/DocumentDetailPanel.jsx:71`, `settings/PreferencesDataTab.tsx:32-35`) plus jsPDF/xlsx exports; `@capacitor/ios` implements no `WKDownloadDelegate`. Export CSV/JSON/PDF/XLSX buttons do nothing natively.
Remediation: on native route exports through `@capacitor/filesystem` + `Share.share({ files })` (which is also the share sheet MOB-2 promises).

**MOB-6 · No version / build-number strategy; Sentry cannot tell native from web.** CONFIRMED DEFECT · Medium
`package.json:4` `2.1.1`; `src/main.jsx:19` hand-edited `__SBP_BUILD__ = '2026-06-29-launcher-labels'` (stale); the Capacitor Xcode template ships `MARKETING_VERSION = 1.0`, `CURRENT_PROJECT_VERSION = 1`; no script syncs them; `VITE_APP_VERSION` is set only in the CI deploy job (`ci.yml`), so a Mac `npm run cap:sync` build has no Sentry release and `environment` is `production` for both platforms.
Remediation: drive `MARKETING_VERSION` from `package.json` and `CURRENT_PROJECT_VERSION` from a run number; set `VITE_APP_VERSION` in the native build script; tag Sentry with `platform`.

**MOB-7 · The privacy manifest declares no collected data while the app collects several types.** CONFIRMED DEFECT · Medium
`mobile/ios/PrivacyInfo.xcprivacy:32-33` `NSPrivacyCollectedDataTypes` is empty; the app collects e-mail/name at sign-up (`AuthContext.tsx:316-322`), a user id sent to Sentry (`:177`), photos/documents (User Content) and replay/log diagnostics (`instrument.js:38-41,58`). Declare EmailAddress, Name, UserID, Photos/Videos, OtherUserContent, CrashData, PerformanceData, OtherDiagnosticData (linked, not tracking) and mirror them in App Store Connect.

**MOB-8 · `limitsNavigationsToAppBoundDomains: true` is mis-described and unprovisioned.** PROBABLE CONCERN · Medium
`capacitor.config.ts:29-31` says it makes http(s) links open in the system browser; Capacitor's declaration says it "blocks navigation outside the domains in the `WKAppBoundDomains` list" and that `localhost` must be listed. No `WKAppBoundDomains` exists in the plist snippet, so the flag is inert today; adding domains later without `localhost` would kill the Capacitor bridge (white screen). External links already open in Safari through Capacitor's `WebViewDelegationHandler`.
Remediation: set it to `false` and fix the comment, or deliberately add `WKAppBoundDomains = [localhost, steelbuild-pro.com, www.steelbuild-pro.com]` and test on device.

**MOB-9 · The Info.plist snippet is incomplete.** CONFIRMED DEFECT · Low-Medium
Only the three camera/photo strings; missing `ITSAppUsesNonExemptEncryption` (prose only, `SUBMISSION.md:64`), `CFBundleDisplayName` (template ships "My App"), an orientation decision (`manifest.json` says `any`), and the `WKAppBoundDomains` decision. `NSPhotoLibraryAddUsageDescription` is declared but nothing writes to the photo library.

**MOB-10 · Smaller native items.** PROBABLE/INFORMATIONAL
Light-theme status bar strip is dark with dark glyphs (`capacitor.config.ts:24` fixed `#0B0E11` + `overlay:false`, `capacitor.ts:26-28`) — verify on device; `keyboard-open` class is toggled (`capacitor.ts:47-52`) but unused; session tokens live in WKWebView `localStorage` (`@capacitor/preferences` unused; a Keychain-backed `auth.storage` adapter would be more robust); crash reporting covers JS only (no sentry-cocoa); offline cold starts on native fall back to system fonts because six families load from Google Fonts CDN; iPad is in scope by default (`TARGETED_DEVICE_FAMILY = "1,2"`) so 13" screenshots are required unless set to iPhone-only; no icon/splash source art is committed (`/assets/` is gitignored); `capacitor.config.ts:4` still says "The web deploy on Vercel"; `SUBMISSION.md:9-11` repeats a legal note that `CLAUDE.md` says is false; PWA manifest is sound but lacks a 192×192 PNG and any `beforeinstallprompt` handling.

Runbook claims verified: plugins installed TRUE / used FALSE; native bootstrap TRUE; PWA hardening TRUE; privacy manifest EXISTS but incomplete; 4.2 "camera/haptics/share" FALSE; 5.1.1(v) in-app deletion for every role with no feature flag **TRUE** (`Settings.jsx:69,239-243`, `UserSettingsTab.jsx:157`, `DeleteAccountZone.jsx:25`, `account-delete/index.ts:161-193`) — but see EDGE-5 for when it fails; 3.1.1 hiding PARTIAL (Billing page and nav are gated with tests, Landing is not); Sign in with Apple not applicable in code (password auth only); legal pages public TRUE; Universal-Link routing TRUE but inert; iOS 15 target matches the template.

### 4.10 Web production, CI/CD, observability, backup and recovery (categories M, N, O, P)

**CI-1 · Secret scanning and Supabase drift are not deploy gates.** CONFIRMED DEFECT · **High**
`ci.yml:342-343` `deploy-cloudflare: needs: ci` only; `secret-scan` (`:239-242`, "BLOCKING") and `supabase-drift` (`:277-316`) are separate jobs. A pushed credential or a ledger drift paints the run red *while the same run publishes to steelbuild-pro.com*. With no branch protection (CI-3), a red badge blocks nothing.
Remediation: `needs: [ci, secret-scan, supabase-drift]` on both `deploy-cloudflare` and `preview-cloudflare`.

**CI-2 · Production deploy secrets are repo-scoped and reachable from any branch's workflow.** CONFIRMED DEFECT · **High**
No `environment:` on `deploy-cloudflare`/`preview-cloudflare` (`ci.yml:342-355,487-505`), unlike `storage-backup.yml:21`; `push` triggers on `claude/**` (`:63-68`); the `if: github.ref == 'refs/heads/main'` guard lives in the file a branch can edit. Anyone (or any agent session — `AGENTS.md` describes multiple agents pushing) who can push a branch can edit `ci.yml` there and run `wrangler deploy` against production with `CLOUDFLARE_API_TOKEN`.
Remediation: move `CLOUDFLARE_*` and `SENTRY_AUTH_TOKEN` into a `production` GitHub Environment with a deployment-branch policy of `main` (+ required reviewer); give previews a separate `versions upload`-scoped token.

**CI-3 · No branch protection; `main` is the live deploy branch; a laptop deploy script exists.** CONFIRMED · **High** (governance)
`ci.yml:55-58` admits "none of these gates bind until branch protection on main requires them"; `TECH_DEBT.md:59-61` (API 403 — repo plan); `package.json:14` `"deploy": "wrangler deploy"` publishes from a laptop with no `VITE_APP_VERSION`, no maps and a local `.env`. Enable rulesets (plan upgrade) or at minimum CI-2's environment gate; delete or guard the `deploy` script.

**CI-4 · `check:no-new-js` is vacuous in CI.** CONFIRMED DEFECT · Medium
`scripts/check-no-new-js.mjs:19-24` wraps `git diff … origin/main...HEAD` in `try { } catch { return []; }` ("Shallow clones / first commit — fall back to empty"); the `ci` job checks out with default `fetch-depth: 1` (only the gitleaks job uses `fetch-depth: 0`), so `origin/main` is absent and the gate always prints "no new src/**/*.js(x)". The TypeScript Phase-1 standard is enforced by convention only.
Remediation: `fetch-depth: 0` (or `git fetch origin main`) for `ci`; exit non-zero when the base ref is missing.

**CI-5 · The post-deploy health check cannot detect an app that is down.** PROBABLE CONCERN · Medium
`ci.yml:453-472` curls `https://steelbuild-pro.com` for HTTP 200; the SPA fallback returns 200 + static `index.html` for every path (`wrangler.jsonc:85-88`), and the version is already promoted when it runs. A bundle that throws on boot, a bad `VITE_*` value that passed the placeholder check, or a Supabase outage all pass; there is no automatic rollback.
Remediation: assert the deployed `github.sha` marker in the served HTML and call the DB-aware `health` function; consider upload → smoke → `wrangler versions deploy` with `wrangler rollback` on failure.

**CI-6 · The P0 fab-release-gate E2E cannot run anywhere.** CONFIRMED · Medium
`e2e/fab-release-gate.spec.ts:40-48` skips unless `E2E_MUTATIONS_ENABLED=true`; `e2e/environment.ts:69-71` "Mutation E2E is staging-only"; staging Supabase and Vercel are gone (`ci.yml:35-43`); the production `e2e-smoke` job sets no mutation vars (`:722-742`) and every E2E job is variable-gated. CLAUDE.md calls this spec "P0 … must stay green"; the server-side gate has no automated verification and the `staging-e2e-*` jobs are dead.
Remediation: rebuild staging (`docs/runbooks/staging-setup.md`) or run the mutation specs against a dedicated disposable org with an explicit allow-list; mark the staging jobs clearly.

**CI-7 · Supply-chain and toolchain drift.** PROBABLE CONCERN · Medium
All actions are tag-pinned (`actions/checkout@v7`, `setup-node@v7`, `upload-artifact@v7`, `gitleaks/gitleaks-action@v2`); `storage-backup.yml` uses `@v4` + Node 22 while `ci.yml` uses Node 24, `engines` says `>=20`, there is no `.nvmrc`, and `TECH_DEBT.md:66` still says "CI Node 20"; `supabase-retire-deprecated.ts:156` runs `npx --yes supabase@2.117.0` (version, not integrity, pinned). The committed `package-lock.json` has **0** `"libc"` fields while `.claude/hooks/session-start.sh:19-29` pins `npm@11.19.1` specifically to preserve them — the lockfile downgrade the hook warns about is already committed (last lockfile change `52e237b`, 2026-09-14), so the pinned npm now produces an additive diff every session.
Remediation: SHA-pin actions (Dependabot for `github-actions`), add `.nvmrc = 24`, align the backup workflow, regenerate the lockfile once with npm 11.19.1 and commit it, fix the TECH_DEBT note.

**CI-8 · Edge Functions have no typecheck or lint gate.** CONFIRMED · Medium
No `deno check`/`deno lint` step in `ci.yml` or `package.json`; `tsconfig.json` includes `src/` only, `tsconfig.scripts.json` `scripts/` only; `eslint.config.js` has no block for `supabase/**`. `stripe-billing`, `email-ingest`, `llm-proxy` and `account-delete` can ship type errors that surface only at deploy.

**CI-9 · The drift check verifies stamps, not SQL.** INFORMATIONAL
`scripts/supabase-drift-check.mjs:3-7` states it "verifies version/slug inventory only"; comparison is by 14-digit filename (`:50-56`); it fails closed on a missing token/ref. A re-authored body under the same version passes; CLAUDE.md asks for a hand hash check. Store `sha256(statements)` per version in the manifest and compare.

**CI-10 · Other CI observations.** INFORMATIONAL
The foundation Playwright job runs `vite dev` on `dev/foundation.html` with placeholder env (shell primitives, theme, lazy state, one-shot reload, env recovery) — solid but never the production build, SW, real routes or auth. A push to a `claude/**` branch with an open PR runs `ci` + drift + gitleaks + audit twice. `supabase/tests/function-search-path` replays one migration against PGlite and proves 8 helpers pin `search_path` (good, narrow). Cloudflare Workers Builds, if still connected, is an ungated publisher (`docs/runbooks/cloudflare-migration.md:89-97`) — unverifiable from the repo.

**WEB-1 · The service worker caches any navigation response as the offline shell.** CONFIRMED DEFECT · Medium
`public/sw.js:78-86` `fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE_VERSION).then(c => c.put(SHELL_URL, copy)) … })` with no `res.ok`/content-type check (the asset branch at `:99` does check). A Cloudflare 5xx/challenge page, `/health.json`, `/manifest.json` or an image opened in a tab becomes the cached app shell; the next offline cold boot shows it until the next successful online navigation. The precached `/index.html` (`:32,40`) may be a redirected response under Cloudflare's trailing-slash handling, which Chromium refuses to serve to a navigation, and `:86`'s `|| caches.match("/")` is never reached because the entry is truthy.
Remediation: `put` only when `res.ok && res.type === "basic"` and content-type is `text/html`; precache `/` only (or strip `redirected`).

**WEB-2 · The service worker serves the unhashed `web-ifc.wasm` cache-first.** PROBABLE CONCERN · Medium
`sw.js:56-61` treats `/wasm/*.wasm` as immutable while `vite.config.js:10-13` documents that a JS/wasm version mismatch "silently renders zero geometry"; after a `web-ifc` bump the new hashed JS loads against the old cached wasm on the first visit (self-heals on the second). Hash the wasm (`?url` import) or make `/wasm/` network-first.

**WEB-3 · Stale-chunk detection misses Firefox's error text.** PROBABLE CONCERN · Medium
`src/lib/lazyRetry.ts:46-51` matches Chromium/Safari/webpack messages but not Firefox's `error loading dynamically imported module`; `ErrorBoundary.jsx:33,55-57` then offers a "Retry" that only resets state, and a rejected `React.lazy` import stays rejected. Add the pattern; extend `foundation.spec.ts` with a Firefox project.

**WEB-4 · CSP is Report-Only and, as written, would break the PDF viewer if enforced.** PROBABLE CONCERN · Medium
`public/_headers:51` `frame-src 'self' https://js.stripe.com https://checkout.stripe.com`; `src/pages/DrawingViewer.jsx:735-741` embeds a Supabase signed URL in an `<iframe>`; no `media-src`; no `Cross-Origin-Opener-Policy`/`Cross-Origin-Resource-Policy`; HSTS without `preload`. No Stripe JS is loaded in-app (`@stripe/*` deps unused), so the Stripe entries are inert. While Report-Only, any XSS can read the localStorage token and `connect-src https://*.supabase.co` permits exfiltration to any Supabase project. Add `https://*.supabase.co` (ideally the project host) to `frame-src`/`media-src`, add COOP, then enforce.

**WEB-5 · Cache and routing details.** INFORMATIONAL / Low
No explicit `Cache-Control` for `/` or `/index.html` (relies on the platform default `max-age=0, must-revalidate`; `public` permits shared caches) — add `no-cache` explicitly and assert it in `deployHeaders.test.ts`. Every unknown path (including `/robots.txt` and missing `/assets/*` chunks) returns 200 + HTML, the latter with an `immutable` cache header; add a real `robots.txt` and consider `assets.run_worker_first` for `/assets/*`. Preview builds stamp `VITE_APP_VERSION=github.sha` and report into the production Sentry environment (`MODE === "production"`) without source maps; pass a `VITE_SENTRY_ENVIRONMENT`. Third-party origins on every load: Google Fonts (render-blocking CSS, 6 families), Open-Meteo (job-site coordinates), Cloudflare Web Analytics beacon, Sentry replay — disclose and self-host the fonts. `src/lib/PageNotFound.jsx:29` still tells admins to "Ask Claude to build it in the chat" (Base44-era copy); `env.ts:51`, `instrument.js:8`, `index.html:13` still say "Vercel".

**OBS-1 · No alerting or uptime monitoring exists.** CONFIRMED (absence) · **High**
`docs/runbooks/owner-checklist.md:217-227` — Sentry alert rules (H7) and an uptime monitor (H27) are both unchecked; `incident-response.md:20-21` assumes them; the only automated liveness signal is the deploy-time curl (CI-5). Nothing in the repo configures either.

**OBS-2 · Sentry PII scrubbing gaps.** PROBABLE CONCERN · Low-Medium
`src/instrument.js:64-68` strips `?query` only, not the `#fragment` that carries implicit-flow tokens (AUTH-5); `beforeBreadcrumb` scrubs fetch/xhr but not navigation breadcrumbs; `telemetry.js:73` `console.error("[telemetry]", entry)` feeds Sentry console breadcrumbs with context that is only key-scrubbed. Good: `sendDefaultPii:false`, opaque user id, masked replay, restricted `tracePropagationTargets`, 10%/10%/100% sampling. `reportError` is used by 5 of 11 Edge Functions (not `account-delete`, `command-center-*`, `health`) and depends on an `EDGE_SENTRY_DSN` secret that cannot be verified. Whether the script-less asset Worker produces Workers Logs at all is unverified.

**DR-1 · PITR is off and a restore has never been rehearsed; no down-migrations exist.** CONFIRMED (docs) · **High**
`docs/runbooks/backup-dr.md:19` "PITR to be enabled", `:38` RPO up to ~24 h, `:96-100` rehearsal log empty; `owner-checklist.md:67-70` unchecked; 120 migrations with no rollback files (`rollback.md:48-61` correctly says forward-fix or backup restore). A bad hand-applied migration (the documented process) or a mass write can only be undone from a daily backup, and the repo cannot rebuild the schema from zero (§2.4).

**DR-2 · Storage backup: code ready, activation unverified.** UNVERIFIED RISK · **High**
`backup-dr.md:26` "Until then there is no verified offsite backup"; `owner-checklist.md:73` `[~]`; `scripts/__tests__/storageBackupDocumentation.test.mjs:19-22` pins the docs to keep saying so. Requires the `storage-backup-production` environment secrets. Drawing PDFs are the business; if the nightly job is not actually running, they have no copy.

**DR-3 · Backup budget and egress will bite.** PROBABLE CONCERN · Medium
`scripts/lib/b2Backup.mjs:3` `BUDGET_BYTES = 9_000_000_000` hardcoded, lifecycle rules refused (`:81-83`), job pauses permanently when retained + new + reserve exceeds it (`:128,160`); measured source is 6.4 GB (`storage-backup-setup.md:36`) and `storage-backup.mjs:90-99` re-stages the full source every run (~192 GB/month egress). Make the budget an environment variable with an alert threshold; stage incrementally.

**DR-4 · Rollback runbooks still prescribe Vercel.** CONFIRMED · Medium
`docs/runbooks/rollback.md:26-29` and `incident-response.md:44-49` describe Vercel promotion/`vercel rollback`; the real path (`npx wrangler deployments list && npx wrangler rollback <version-id>`) exists only in `cloudflare-migration.md:262-265`, which says to port it "at cutover" (not done). No CI rollback job; rollback needs a laptop with the Cloudflare token (CI-3).

Done well (M/N/O/P): deploy refuses placeholder Supabase values and a missing `_headers`/wasm (`ci.yml:369-388,411-419`); wrangler is pinned from devDependencies; `workers_dev`/`preview_urls` are explicit with the outage documented; `deployHeaders.test.ts` is the header contract and recomputes the inline-script CSP hash; least-privilege `GITHUB_TOKEN` with per-job escalation; `audit-gate.mjs` allow-list with reasons, review dates and stale-waiver failure; the storage backup uses a SHA-256-pinned rclone, strips the environment before spawning, disables B2 hard-delete, runs synthetic restore probes and uploads immutable manifests; `supabase-retire-deprecated.ts` is fail-closed with an offline test suite; the retired functions are in fact gone; env validation fails fast behind a mounted boundary; one-shot chunk-reload marker with a browser test proving exactly one reload; SW registration is gated off localhost, native and preview hosts.

### 4.11 Repository hygiene, documentation, tests, accessibility, compliance (categories Q, R, S, T, U)

**HYG-1 · Tracked scratch/agent artefacts and a customer workbook.** PROBABLE CONCERN · Medium
`git ls-files`: `.playwright-mcp/` (37 screenshots/DOM snapshots, up to 690 KB each), `.superpowers/…/server.pid` and `server-instance-id` (tracked despite `.gitignore` `.superpowers/`), `.codex/environments/environment.toml`, `Claude outputs/SH_Steel_PM_Tracker.xlsx` (the `.gitignore` bans `/exports/` and `*.xlsm` as "operational/customer exports"), `artifacts/submittal-control-center/{index.html,seed-sample-data.json}`, a top-level `tests/` with 3 Vitest files outside `src/`. Screenshots and the workbook may carry real project data. `git rm --cached` and ignore.

**HYG-2 · Documentation contradicts code in ways that would mislead an operator.** CONFIRMED · Low-Medium
`README.md:19-21` lists "react-leaflet" (absent) and "**NOT Tailwind**" while `src/globals.css:33-35` has `@tailwind` directives and 53 files use utility classes; `ARCHITECTURE.md` cites "~1,740" and "~1,250" tests (actual 6,677), says "Cloudflare is not yet serving the domain" (it is), and with `AGENTS.md` says the deprecated Edge Functions are "still deployed" (they are gone); `TECH_DEBT.md:66` "CI Node 20"; Vercel remains in `env.ts`, `instrument.js`, `index.html`, `capacitor.config.ts`, `backup-dr.md`, `incident-response.md`, `rollback.md`; `supabase/README.md` still calls `sheets-files` a bucket; `SUBMISSION.md` repeats the retracted legal note; CLAUDE.md's test count is stale.

**DEP-1 · Dependency debt.** INFORMATIONAL
37 unused production dependencies (knip), including the four unused Capacitor plugins, both `@stripe/*` packages, `html2canvas` (still bundled as a 202 KB chunk), `react-hook-form` + resolver, and 21 Radix packages; `.npmrc` `legacy-peer-deps=true` masks peer conflicts; `date-fns` 3 → 4, `react-router-dom` 6 → 7 (clears the two waived advisories), `@sentry/react` 10.54 → 10.75, `@supabase/supabase-js` 2.105 → 2.116 are behind; installed `pdfjs-dist` 4.10.38 is past the CVE-2024-4367 fix, `dompurify` 3.4.15 is present, `xlsx` is the maintained `@e965/xlsx` 0.20.3 fork.

**TEST-1 · The lint gate hides every warning; accessibility rules are warn-only.** PROBABLE CONCERN · Medium (for store and enterprise readiness)
`package.json:15` `eslint . --quiet`; `eslint.config.js:9-24` forces every `jsx-a11y` recommended rule to `warn` ("~180 pre-existing" — the actual census is **1,552**), `react-hooks/exhaustive-deps` (51) and unused vars (137) are also invisible. `src/components/ui/**`, `THEME_DEVELOPER_GUIDE.jsx` and `src/vite-plugins/**` are exempt from lint and every tsconfig; `e2e/**` is unlinted. Add `--max-warnings <current>` as a ratchet and promote a11y rules one at a time.

**TEST-2 · Coverage gaps that matter.** INFORMATIONAL
No RLS/tenant-isolation regression tests run anywhere (`supabase/scripts/verify_rls_isolation.sql` and `probe_anon_access.sql` exist for manual use); 9 of 11 Edge Function handlers are untested; the bulk-reopen, Void-RFI and null-lead cases (DATA-2, LOGIC-5, LOGIC-6) have no tests; several timezone tests cannot fail on the UTC runner (`src/lib/__tests__/workingDays.test.ts:15-20`, `src/utils/__tests__/pccEngine.test.js:21-32`) while `todayLocal.test.js`, `approvalMatrix.derive.localday.test.ts` and `scheduleCascadeDateMath.test.ts` show the right pattern; base `tsconfig` is `strict: false` with two ratchets (1 and 9 grandfathered files) and `typecheck:js` is resolution-only.

**A11Y-1 · Accessibility remains a systemic gap.** CONFIRMED · Medium (static evidence)
1,552 suppressed `jsx-a11y` findings: 913 unlabeled form controls (`label-has-for` / `label-has-associated-control`), 507 mouse-only interactive elements (`click-events-have-key-events` / `no-static-element-interactions`), 50 unnamed controls, 43 `autoFocus`, 26 non-interactive element handlers; worst files `DeliveryFormModal.jsx` (55), `SheetFormModal.jsx` (42), `DisplayTab.jsx` (42). No axe tests, no VPAT/accessibility statement; 8–9 px labels on workflow chips. The prior enterprise audit's H15–H17/M24–M28 remain open.

**COMP-1 · All four legal pages are still marked DRAFT in production; the subprocessor list is stale.** CONFIRMED · Medium
`src/pages/Privacy.jsx:1`, `Terms.jsx:1`, `Security.jsx:1`, `Subprocessors.jsx:1` each begin `// DRAFT — standard boilerplate. MUST be reviewed by legal counsel before production reliance.`; `Subprocessors.jsx` still lists Vercel and omits Cloudflare (hosting, global network — the "all-US" claim in `ARCHITECTURE.md:566-575` needs restating), Open-Meteo, Microsoft Graph and Resend. Signup clickwrap exists but is client-minted (AUTH-9). Consent: Sentry replay and Google Fonts load pre-consent. Erasure and export paths exist (`account-delete`, `project-export`) but `project-export` bundles mail-account tokens (EDGE-16) and self-deletion fails for sole owners with live projects (EDGE-5). `auth_leaked_password_protection` is disabled (live advisor).

## 5. CLAUDE.md invariants — verification table

| Invariant (CLAUDE.md) | Verdict | Evidence |
|---|---|---|
| Production Control scoring: formulas, stable ordering, local-calendar-day dates, output keys preserved | **Partially true** | formulas/keys intact; `Date` inputs dropped, `Math.ceil` DST edge, UTC fallback in drafts, NULL percent scored as low progress (LOGIC-9) |
| Number-sequence integrity: RPC-only, fails closed | **Violated by one caller** | `numberSequencing.jsx` compliant; `ZonePanel.jsx:596` invents `RFI #<Date.now()>` (LOGIC-1); hook only guards `numberSequencing*`; CI-index mismatch risk (LOGIC-12) |
| Linked-RFI id spaces: text CSV numbers vs `uuid[]`; canonical `normNum`/`linkedRfiNumbers` | **Verified true** | `fabReleaseGate.ts:122-132`, `detailingReadiness.js:46-72`, SQL `fab_release_blocking_rfis`/`submittal_blocking_rfis` share the rule |
| Absence is not evidence (`computeRevisionImpact` "unknown", lazy roster) | **Partially true** | `detailingRevisionImpact.js:57-62` correct; violated by LOGIC-6 (null lead → 0), LOGIC-9, DATA-3 (NULL percent → 0), DATA-8 (read failure → "no risks") |
| Document Control intake rules (observed vs blank, no machine "absent", line work never comparable, truncation, `EFFECTIVE_LIST_CAP`, producers) | **Verified true (engine)** | `docControl/titleBlock.ts`, `attestations.ts:52-113`, `findings.ts:90-100`, `changeSummary.ts:146-163,229-235`, `mdr.ts:71-78`; `attachPageText`/`detectCallouts` exist |
| Detailing Control Center: three predicates distinct; `registerStatusTone` exhaustive; open-only tallies; `drawings` has only `reviewer`; `canWrite*`; caps; bulk-edit gates | **Mostly true** | all verified in `format.ts`, `useDrawingsPageController.ts:430-434`, `entityClient.ts:64`; but `isPackageReleasedForFab` fires on a sheet-stage plurality (LOGIC-4) |
| Schedule tasks: vocabulary = CHECK, no Cancelled, reconciliation, reopen → NULL, two percent readers, one write path, `ScheduleBody` writes nothing, inclusive duration, milestone/assignment pairs | **Partially true** | vocabulary, readers, duration, helpers verified; **violated** by the bulk toolbar (DATA-2) and by `Number(null)` coercion (DATA-3); field progress paths bypass `buildTaskUpdate` |
| Submittals are the workflow source of truth; fab release requires IFC/Released | **Partially true** | DB gate is submittal-only; client gate and Released KPI fall back to `drawings.stage`/sign-offs (LOGIC-2, LOGIC-4); skip-OFS gate not mirrored in DB (LOGIC-3) |
| Apply-a-migration rule: file lands with the stamp, name = ledger version | **Not holding** | 35 repo files have no ledger row, 2 were stamped under different versions (§2.4); CI passes via manifest classification |
| Database/RLS: RLS everywhere, no blanket-true, initplan pattern, definer `search_path` | **Mostly true** | 135/135 tables RLS-enabled; 2 literal-true SELECT policies are intentional catalog reads (`feature_flags`, `default_cost_codes`); no live `auth_rls_initplan` lints; definer `search_path` pinned live (advisor has no `function_search_path_mutable` lint) though 58 baseline bodies lack it textually — see §4.5 |
| Never use `<form>` tags / Radix Dialog | Not audited for compliance (design rule) | — |

## 6. Store readiness checklists (code-level vs. console tasks)

### 6.1 Apple App Store
**Code-level blockers (this repo):**
1. MOB-4 — native-gate the Landing pricing/marketing copy; neutral Billing note (3.1.1).
2. MOB-3 — explicit `https://` redirects on native; Universal Links (AASA + `applinks:` entitlement) with PKCE, or documented web completion.
3. MOB-2 — implement Camera/Share/Haptics on native or remove the dependencies and the 4.2 claim.
4. MOB-5 — native export path (`@capacitor/filesystem` + `Share`).
5. EDGE-5 — make self-service account deletion succeed for sole owners with live projects (5.1.1(v) depends on it).
6. MOB-6 — `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` pipeline; `VITE_APP_VERSION` and a platform tag for Sentry.
7. MOB-7 + MOB-9 — fill `NSPrivacyCollectedDataTypes`; add `ITSAppUsesNonExemptEncryption=NO`, `CFBundleDisplayName`, an orientation decision, the `WKAppBoundDomains` decision (MOB-8).
8. Commit the 1024² icon and splash source art (`/assets/` is gitignored) and the generated sets.
9. AUTH-2 / AUTH-4 / AUTH-5 — MFA gate, recovery-session handling and PKCE also affect the native sign-in flow.
10. Optional: light-theme status bar (MOB-10), self-hosted fonts for offline cold starts, remove the dead `keyboard-open` class.

**App Store Connect / Mac tasks (cannot be verified in the repo):** generate `ios/` (`npm run cap:add:ios`), copy the privacy manifest and plist keys, bundle id `com.steelbuildpro.app`, team + automatic signing, deployment target 15.0; app record, SKU, category, age rating, support URL, privacy policy URL (`/privacy`); nutrition labels consistent with MOB-7; export-compliance answer; a demo account with seeded data and an active plan plus review notes (subscriptions and password reset happen on the web until MOB-3/MOB-4 land); screenshots for 6.9" and 6.5" iPhone and 13" iPad unless the target is set to iPhone-only; Associated Domains capability if Universal Links are adopted; a TestFlight pass on a real device covering password reset, photo attach, exports, external PDF links, light-theme status bar and keyboard in modals.

### 6.2 Google Play
**Code-level (everything is outstanding):** `npm i @capacitor/android && npx cap add android`; `applicationId com.steelbuildpro.app`; `targetSdk` at the current Play requirement (API 35+) and `minSdk` per Capacitor 8; upload key + Play App Signing; AAB output; manifest permissions only for capabilities actually used (CAMERA/READ_MEDIA_IMAGES if MOB-2 ships, `POST_NOTIFICATIONS` only if push ships); `MainActivity` `exported="true"` with launcher + `autoVerify` https intent filter; `network_security_config` with no cleartext in release; backup rules excluding WebView storage (tokens live in localStorage); `.well-known/assetlinks.json`; a `backButton` listener (close modals/drawers, `history.back()`, exit at root; predictive back); edge-to-edge insets for `html.capacitor-android`; adaptive icons + Android 12 splash; keyboard `adjustResize`; large-screen/foldable resizability; the same MOB-3/MOB-4/MOB-5 fixes.
**Play Console tasks:** developer account (new personal accounts need the closed-testing gate), content questionnaires, Data Safety form mirroring MOB-7, target audience, ads declaration, privacy policy URL, **a web-reachable account-deletion URL (Play requires one in addition to in-app deletion; none exists today)**, store listing screenshots for phone / 7" / 10" tablet, feature graphic, internal → closed → production tracks.

## 7. Prioritised remediation plan

Ordered by risk reduction per unit of effort. IDs refer to §4. Items marked **(owner)** need a dashboard, account or purchase and cannot be done from the repo.

### P0 — before the next production deploy (days)
1. **Close the tenant-lockout and cross-tenant write paths:** AUTH-1 (DELETE guard + policy on `organization_members`), RLS-1 (authorise `log_backcharge_event` / `log_transmittal_event` in production, then port), RLS-2 (`drawing_signoffs_insert` = pm + self; restrictive `field` floors on the 10 project tables), AUTH-3 (hide the invite `token` column; land `accept_invitation` in the repo with the e-mail check). One reviewed migration, applied and stamped per CLAUDE.md, file first.
2. **Make the CI gates bind:** CI-1 (`needs: [ci, secret-scan, supabase-drift]` on deploy and preview), CI-2 (production GitHub Environment with branch policy `main` holding the Cloudflare/Sentry secrets), CI-4 (`fetch-depth: 0` so `check:no-new-js` is real). **(owner)** CI-3 branch protection/rulesets; disconnect Cloudflare Workers Builds if still connected.
3. **Recovery basics (owner):** DR-1 enable PITR and run one restore-to-new rehearsal; DR-2 confirm the nightly Storage backup is actually running and its manifest artifact exists; OBS-1 uptime monitor on `/` + the `health` function and Sentry new-issue/spike alerts; enable leaked-password protection.
4. **Fix the invariant regressions that corrupt records:** DATA-2 (bulk toolbar through `withReconciledPercent`), DATA-3 (`null` percent pass-through), LOGIC-1 (fail closed in ZonePanel; widen the numbering hook), DATA-1 (rename the pay-app contract key), DATA-4 (route delivery importers through `create_delivery`), DATA-5 (CO import dedup), LOGIC-5/LOGIC-6.
5. **Session hardening:** AUTH-5 `flowType: 'pkce'`, AUTH-4 recovery-session flag + Cancel = logout, AUTH-2 await the MFA check before mounting routes (server-side `mfa_satisfied()` can follow in P1), AUTH-6 full `clearTenantClientState` + local sign-out fallback.
6. **Billing safety:** EDGE-4 refuse an empty webhook secret; EDGE-1 coerce `maxTokens`.

### P1 — before the App Store submission and before onboarding another tenant (weeks)
1. App Store code-level list §6.1 in full (MOB-2 … MOB-9, EDGE-5).
2. Authorization depth: RLS-3 (plan-limit trigger on INSERT), RLS-4 (drop client write policies on `number_sequences`, raise the RPC gate), RLS-5 (project scope + field floor on `app-files`), RLS-7 (hide `user_overrides`), RLS-8 (pin `user_id` in the member guard), RLS-9 (default-privilege revoke), AUTH-8 (re-auth before password change / MFA unenroll / deletion), AUTH-7 (consent step for the desktop hand-off), EDGE-3 (actor id in the export audit row), EDGE-7 (shared CORS), DB-9 (move mail tokens out of member-readable rows; strip them from exports).
3. Gate parity: LOGIC-2 (one governing-submittal rule shared by client and SQL), LOGIC-3 (mirror the skip-OFS gate in `enforce_submittal_status_transition`), LOGIC-4 (require a governing submittal for "Released"), LOGIC-12 (normalise `record_type` in the RPC and make the CI index the conflict target), CI-6 (a disposable org for the P0 fab-gate E2E, or rebuild staging).
4. Web hardening: WEB-1/WEB-2 (service worker), WEB-3 (Firefox pattern), WEB-4 (enforce CSP after adding the Supabase frame/media sources), SEC-1 (CSV escaping), SEC-2 (`resolveFileUrl` for stored links), SEC-3 (DOMPurify + in-frame CSP), SEC-4 (server-derived content types + bucket MIME lists), CI-8 (Deno check/lint gate), CI-5 (assert the deployed SHA and call `health` post-deploy), DR-4 (rewrite the rollback runbook for Wrangler and add a `workflow_dispatch` rollback job).
5. Data integrity: DB-1 (PK on `piece_events`), DB-2 (`is_deleted NOT NULL`), DB-3 (validate the drawings check), DB-4 (FKs on `number_sequences`/`fab_releases`), DB-8 (one idempotent realtime-publication migration + test), DB-11 (record `sha256(statements)` per version in the manifest; start landing the 48 drifted bodies and the 171 production-only functions as reviewed migrations — CLAUDE.md's "219 of 351" remains the DR gap).
6. Compliance: COMP-1 (legal review of the four DRAFT pages; update the subprocessor list for Cloudflare, Open-Meteo, Microsoft Graph, Resend; restate residency), AUTH-9 (server-side terms record), EDGE-16 export scope.

### P2 — before the first 25k-piece / 1,000-sheet project (weeks to a month)
PERF-1 (virtualise the Piece Register, server-side `is_deleted`, projections), PERF-2 (drop the 30 s poll), PERF-3 (debounce canonical realtime), PERF-4 (list projections for `drawings`), PERF-5/PERF-6 (one portfolio dataset, one revisions query, SQL rollups for reports), PERF-7 (keyset helper + `(project_id, created_at)` indexes), PERF-8 (memoise context values, `useDeferredValue` on filters), PERF-9 (render-on-demand), PERF-10 (assets/fonts), DATA-7/DATA-8/DATA-11 (search truncation, failure-as-empty, ignored `error`s), EDGE-9/10/13/14/15, DR-3 (backup budget/incremental staging), TEST-1 (`--max-warnings` ratchet; promote a11y rules), A11Y-1 (labels and keyboard access on the top 10 offending forms first), run `perf:bundle` in CI.

### P3 — hygiene (ongoing)
HYG-1 (untrack scratch artefacts and the customer workbook), HYG-2 (docs), DEP-1 (drop 37 unused dependencies; react-router 7 to clear the waived advisories), CI-7 (SHA-pin actions, `.nvmrc`, lockfile regeneration), DB-5/DB-6/DB-7/DB-10, PERF-11, SEC-5, EDGE-8/EDGE-11/EDGE-12/EDGE-16, LOGIC-7 … LOGIC-11, DATA-9/10/12/13/14, TEST-2 (RLS regression tests, Edge Function handler tests, the missing bulk-reopen/Void-RFI/null-lead cases, timezone tests that can fail).

## 8. What this audit could not verify (owner / dashboard items)
- Supabase dashboard: PITR and backup retention, daily-backup restore rehearsal, leaked-password protection, "Secure password change", OTP/JWT expiry and rate limits, redirect-URL allowlist, enabled auth providers, e-mail confirmation setting, Auth connection pool; the production bodies of the 48 drifted functions and the 171 production-only functions (only a 2026-09-15 capture exists); `supabase_realtime` publication membership; `storage.objects.owner` population; the `sheets-*` cleanup; Edge Function secrets (`ALLOWED_ORIGINS`, `STRIPE_WEBHOOK_SECRET`/`billing_config`, `EMAIL_WEBHOOK_SECRET`, `LLM_*` caps, `EDGE_SENTRY_DSN`, `EMAIL_INGEST_UNTRUSTED_ACTION`); Storage response headers for signed objects.
- GitHub: branch rulesets/plan, presence of `CLOUDFLARE_ENABLED`, `E2E_ENABLED`, `SUPABASE_ACCESS_TOKEN`, `SENTRY_AUTH_TOKEN` and the `storage-backup-production` environment secrets, recent run history of the nightly backup.
- Cloudflare: whether Workers Builds and the old Netlify site are disconnected, Cloudflare Access on `workers.dev`, DNS, Web Analytics, whether the script-less asset Worker produces logs.
- Stripe: endpoint configuration and subscribed event types, Stripe Tax status.
- Sentry: alert rules, release/source-map state, CSP report volume.
- Apple/Google: everything in §6 marked as a console task; on-device behaviour (app-bound domains, status bar, keyboard, downloads, camera sheet, offline fonts).
- The sibling `SteelBuild-Pro-2026` repository, which co-owns the production schema and may add policies or triggers this repo cannot see.
- Role-based live RLS probes (anonymous / owner / non-owner / same-tenant / other-tenant / suspended / service role) were **not** executed against production; `supabase/scripts/verify_rls_isolation.sql` and `probe_anon_access.sql` exist for an owner-run session against a branch or a restore.

## 9. Appendix — authenticated-callable SECURITY DEFINER RPCs (live advisor, 2026-09-21)
95 callable functions (58 further trigger-return functions are listed by the advisor but cannot be invoked via RPC): accept_invitation, advance_piece_station, advance_piece_stations, apply_piece_import_batch, apply_planner_offline_operation, apply_project_template, approve_piece_import_batch, archive_note_folder, archive_piece_lots, assign_pieces_to_work_package, billing_plans_available, build_pay_application_lines, bulk_update_piece_attributes, bulk_update_piece_attributes_impl, create_material_requirement, create_note_folder, create_organization, create_project, delete_drawing_set, deliver_piece_lots, erasure_toggle_user_triggers, erect_piece_lots, evaluate_fab_release_package, evaluate_release_gate, fab_release_blocking_rfis, founding_org_id, generate_project_alerts, get_invitation, get_my_project_role, get_next_sequence_number, hard_delete_organization, hard_delete_project, hard_delete_record, hard_delete_records, hard_delete_release_dependents, hard_delete_toggle_triggers, link_model_elements_to_pieces, link_model_elements_to_pieces_page, link_piece_drawing, link_piece_drawing_set, list_drawing_impact_assignees, list_visible_note_folders, log_backcharge_event, log_submittal_event, log_transmittal_event, map_material_requirement_to_pieces, move_note_folder, org_plan_usage, piece_control_drawing_is_approved, piece_control_pilot_readiness, place_drawing_hold, project_row_counts, prune_client_events, publish_drawing_revision, refresh_cost_code_actual, refresh_pay_application_totals, refresh_project_change_total, release_drawing_hold, release_work_package_canonical, rename_note_folder, reset_org_data, restore_note_folder, set_for_drawing_is_locked, set_for_zone_is_locked, set_material_requirement_receipt_state, set_note_folder_links, set_piece_control_mode, set_piece_hold, set_piece_hold_impl, set_project_station_configuration, set_runtime_config, ship_piece_lots, soft_delete_project, split_piece_lot, stage_piece_import_batch, submittal_blocking_rfis, sync_production_stages_to_pieces, unassign_pieces_from_work_package, unlink_piece_drawing, unlink_piece_drawing_set, user_can_access_note_folder, user_can_edit_note_folder, user_can_manage_note_folder_links, user_has_project_access, user_has_project_role, user_has_project_role_at_least, user_is_org_admin, user_is_org_member, user_is_project_admin, user_org_role_at_least, users_share_org, work_package_drawing_set_reports (plus `actor_display_name`, `ops_snapshot`, `compute_*` helpers). Each was classified in §4.5; the actionable subset is RLS-1, RLS-4, RLS-6 and the `*_impl`/erasure helpers (hygiene revokes).

Artefacts produced during the audit (kept outside the repo, in the session scratchpad): the static RLS matrix (`rls_matrix.md/json`), the parsed live advisor inventory (`live-advisors.md`), the ESLint warning census (`eslint-full.json`), all gate logs (`gates/*.log`) and the ten category reports.

