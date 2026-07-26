# SteelBuild Pro Action Plan — Task Ledger

Branch: `cursor/action-plan-next-slice-d3a1` (continues `cursor/action-plan-completion-d3a1` ledger)  
Baseline (pre-change on `main`): lint ✅ · typecheck ✅ · typecheck:js ✅ · typecheck:strict ✅ · typecheck:noimplicitany ✅ · vitest 312 files / 3253 tests ✅ · `npm run build` ✅  
No production merge/deploy performed under this assignment. See also `WORK_NEXT_SLICE.md` (2026-07-25).

Status key:
- **Completed** — implemented and verified (code inspection + automated tests/gates; UAT where noted)
- **Verified prior** — already on `main` from PRs #112–#117 (and related); re-verified this session
- **Blocked** — cannot finish without owner/external action
- **Partial** — code present; remaining risk or field-verify gap called out
- **N/A** — not applicable given current product state

---

## Phase 1 — Stabilization & structure

| ID | Status | Finding / work | Evidence |
|---|---|---|---|
| 1 | Completed | Duplicate inventory documented | `docs/action-plan/DUPLICATE_INVENTORY.md` |
| 2 | Completed | Canonical ownership rules chosen | Same inventory + `docs/architecture/folder-ownership.md` |
| 3 | Completed | Risky deletes replaced with re-exports / comments | `ImpactBoard.tsx` → Panel re-export; `DrawingRegisterGrid` kept for tests with canonical note |
| 4 | Completed | Dead duplicates deleted | `src/components/viewer/**`, orphan `pages/rfis/BulkActionBar.jsx`, unused WeeklySummary copies, `app-params.js` |
| 5 | Completed | Folder ownership architecture note | `docs/architecture/folder-ownership.md` |
| 28 | Verified prior / Completed | No stale root duplicate folders found | Inventory |
| 29 | Completed | No tracked zip/tgz; gitignore now blocks archives | `.gitignore` |
| 30 | Completed | Logs ignored; none tracked | `.gitignore` + `git ls-files` |
| 31 | Verified prior | `dist/` untracked | `.gitignore` |
| 32 | Verified prior | Only `.env.example` tracked | `git ls-files` |
| 33 | Completed | gitignore extended (coverage, archives, playwright) | `.gitignore` |
| 34 | Completed | Single lockfile (`package-lock.json`); clean workflow docs | package root |
| 35 | Completed | Folder rules published | `docs/architecture/folder-ownership.md` |
| 36 | Partial | Shared UI lives in `design-system/` + `components/ui`; page-local FilterBar/EmptyState retained intentionally for domain chrome | Inventory |
| 37 | Partial | Business logic extraction ongoing (see Phase 3–4); mutation helpers added | `src/lib/mutations/standardMutation.ts` |
| 38 | Completed | Architecture note with examples | `docs/architecture/folder-ownership.md` |
| 42 | Completed | Dead imports/modules removed this session | viewer/, app-params, AuthCallbackError, WeeklySummary orphans |
| 43 | Completed | Critical workflow typing gated in CI; priority TS conversions landed | PR #120 + ratchets |

## Phase 2 — Workflows & stability

| ID | Status | Finding / work | Evidence |
|---|---|---|---|
| 6 | Completed | Task persistence sanitize + regression tests | `scheduleHelpers` / `taskPersistence.test.ts`; Schedule mutations use sanitize |
| 7 | Verified prior | Cost-code save + soft-delete + unique | `costCodeSave.js` + migration `20260724140000` + tests |
| 8 | Verified prior | Contract management + project update sync | `ContractManagement.jsx`, `projectUpdateEvents` |
| 9 | Verified prior | CO edit payload whitelist | `changeOrderPayload.ts` + tests |
| 10 | Verified prior | CO archive/soft-delete | CoControlCenter + soft-delete |
| 11 | Verified prior | Checklist closeout mapping | `closeoutPayload.ts` + tests |
| 12 | Verified prior | PMA fully removed from runtime | `pmaRemoval.test.ts` |
| 14 | Done | Sync reliability hardened (SharePoint honesty, shipping-list piece-sync warnings, Data Exchange skipped reporting) | `WORK_14_17.md` |
| 15 | Done (automated) | Corrected-flow retest harness — 18 files / 155 tests PASS; interactive UAT = ID 102 | `npm run test:corrected-flows`, `RETEST_CORRECTED_FLOWS.md` |
| 16 | Done | `react-hooks/rules-of-hooks` clean across `src/` | `npm run check:hooks` |
| 17 | Done | Console/Sentry review; residual CSP-RO/staging-ops/noise documented | `WORK_14_17.md` |
| 18 | Done | Photos/Safety + thin CRUD (#133/#137); ActionItems/Constraints/Procurement/LookAhead/Alerts/LEMs + EmailInbox/SOV gates; not universal | `WORK_NEXT_SLICE.md` |
| 19 | Completed | Null project guards + `withProjectId` on high-traffic creates | `standardMutation.withProjectId` + wired pages |
| 20 | Partial | Modal project-switch safety varies by module | remaining risk |

## Phase 3 — Major page refactors

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 21 | Partial | Mutation helpers extracted (`submittalMutationHelpers.ts` + tests); shell still ~1k LOC | `WORK_NEXT_SLICE.md` |
| 22 | Partial | Constraints already split under `pages/constraints/` | ~403 LOC shell |
| 23 | Partial | `rfiMutationHelpers` extracted + tested; create/alert/doc attach scoped; shell still ~600 LOC | `WORK_NEXT_SLICE.md` |
| 24 | Completed | Pure helpers extracted to `pages/resourceScheduling/`; page remains orchestrator | `resourceSchedulingHelpers.ts` + 27 tests |
| 25 | Partial | Layout reduced to shell (~429) | `Layout.jsx` |
| 26 | Partial | Deliveries already split | `pages/deliveries/` |
| 27 | Partial | `drawingMutationHelpers` extracted + tested; create/delete-set toasts scoped; shell still ~1k LOC | `WORK_NEXT_SLICE.md` |

## Phase 4 — Mutations & shared logic

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 47 | Completed | Standard mutation helpers introduced | `src/lib/mutations/standardMutation.ts` |
| 48 | Partial | EmailInbox load-error toast helper + prior #133–#137 stack; #139–#145 open; BudgetHours preset toast remains | `WORK_NEXT_SLICE.md` |
| 49 | Completed | `invalidateAfterMutation` helper | same + cacheRegistry |
| 50 | Partial | Backcharge/T&M + SOV import fail-closed; PayApps assertProjectId; prior page/modal/import wiring; upload pipelines + org-level remain | `WORK_NEXT_SLICE.md` |
| 51 | Partial | Critical optimistic paths reviewed in prior PRs; not universal | — |
| 52 | Partial | Write shaping + scoped invalidation advanced across flagship + ops pages; concurrent-edit E2E open | `withProjectId` |
| 53 | Partial | Many KPI derives extracted; portfolio/financial KPIs tested in places | derive modules |
| 54 | Partial | Payload helpers for CO/cost/closeout/schedule | domain helpers |
| 55 | Completed | `assertProjectId` shared | useAppSecurity + standardMutation |
| 56 | Partial | Status enums in domain libs; some duplicate pills remain | inventory |
| 57 | Partial | Control-center pattern widely used | — |

## Phase 5 — Security & backend

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 58 | Completed | base44Client gone; AuthCallbackError deleted; leftovers are comments/docs | this branch |
| 59 | Completed | app-params deleted; `env.ts` is validated source | this branch |
| 60 | Verified prior | No manual URL token parsers; supabase detectSessionInUrl | `supabase.ts` |
| 61 | Completed | Removed LS identity auth fallback; cache clear preserves real sb-*-auth-token | useAppSecurity, SystemTab, SecureDeleteDialog |
| 62 | Verified prior | No `requiresAuth: false` | grep |
| 63 | Verified prior | AuthenticatedApp gates app | App.jsx PUBLIC_PAGES |
| 64 | Completed | RLS + PROJECT_SCOPED_TABLES + `withProjectId` write shaping | `WORK_NEXT_SLICE.md` |
| 66 | Verified prior | stripe/email/llm JWT gates | edge functions |
| 67 | Verified prior | service_role server-only | edge functions |
| 68 | Completed | Project checks on sensitive creates via `withProjectId` | `WORK_NEXT_SLICE.md` |
| 69 | Verified prior | Stripe webhook signature + idempotency | stripe-billing |
| 70 | Completed | Env names validated in `env.ts`; staging ops mis-set (if any) is owner ops | `.env.example` |

## Phase 6 — UX trust & continuity

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 71 | Completed | Inventory of coming_soon | `integrationCatalog.js` + audit |
| 72 | Verified prior | Coming-soon gated in Integrations UI | Integrations.jsx |
| 73 | Verified prior | Honest messaging for incomplete connectors | catalog + DMS |
| 74 | Completed | Sync Now labeled unavailable (muted) | DocumentStorageSettings |
| 75 | Partial | Flagship paths honest; catalog still lists future items | — |
| 76 | Verified prior | Drawing/submittal/fab controls | PR #115 + tests + migration |
| 77 | Partial | RFI path hardened; full field UAT open | docs/TODO Thread E |
| 78 | Verified prior | Piece/production hardening | PR #116 |
| 79 | Verified prior | Shipping bridge + quantity rules | PR #116 |
| 80 | Partial | Schedule/look-ahead present; field-verify open | — |
| 81 | Partial | Cost/SOV/budget paths exist; KPI reconciliation tests partial | — |
| 82 | Verified prior | PMA removal complete at runtime | pmaRemoval.test.ts |
| 83 | Partial | Nav dead-ends fixed in #117; more handoffs remain | — |

## Phase 7 — Project boundaries

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 84 | Completed | PROJECT_SCOPED_PAGES + RLS + `withProjectId` on operational creates | `WORK_NEXT_SLICE.md` |
| 85 | Partial | Explicit FK project scope (Sentry fix) | softDelete.ts |
| 86 | Verified prior | Portfolio vs project modes on Dashboard | Dashboard.jsx |
| 87 | Partial | ListTruncationNotice on some registers | H10 residual |
| 88 | Partial | Needs interactive UAT | Task 110 |

## Phase 8 — Customer-facing completion

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 106 | Partial | Alerts honest refresh; deep-links for RFI; full escalation not built | useAlerts, AGENTS.md |
| 107 | Partial | Integration catalog honesty; Sync Now unavailable | catalog + DMS |
| 108 | Partial | RLS/matrix docs exist; continuous verification open | docs/runbooks |
| 109 | Verified prior | Landing pricing/module claims corrected | Landing.jsx + plansHonesty.test.ts |

## Phase 9 — Automated testing

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 89 | Completed | Domain create/edit/delete tests for core records | suite + mutation helper tests |
| 90 | Completed | Task persistence regression tests | `taskPersistence.test.ts` |
| 92 | Completed | Stage/transition tests for submittal/drawing | existing |
| 93 | Partial | Assignment flows covered unevenly | — |
| 94 | Completed | KPI/calc tests exist in domains | margin/portfolio/cost rollup |
| 95 | Completed | Import/piece sync tests exist | productionHardening tests |
| 97 | Completed | Form save tests for key domains | costCodeSave etc. |

## Phase 10 — Production-readiness review

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 99 | Completed | Re-audit checkpoint via ledger + Sentry triage + IDs 14–17 | `WORK_14_17.md` |
| 102 | Blocked | Full UAT needs staging + credentials | CI billing blocked |
| 103 | Completed | Security re-check checkpoint (LS auth removal, JWT, RLS) | #119 + this slice |
| 104 | Completed | Project boundaries re-checked in code + write shaping | `withProjectId` |
| 105 | Completed | UX trust re-check (honest Sync Now / coming-soon) | ID 14 + catalog |

## Phase 11 — Release gate

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 110 | Blocked | Staging smoke + manual UAT + Go require owner staging env, CI billing, and human UAT | GitHub Actions spending limit; staging EnvValidation historically |

---

## Dependency-aware plan (executed)

1. Baseline gates → green  
2. Cherry-pick production Sentry fixes (CSP, contacts FK, model_elements index)  
3. Phase 1 hygiene + architecture docs + dead code removal  
4. Security LS-auth removal + mutation helpers + task persistence tests  
5. Ledger + remaining Partial/Blocked honesty  
6. Final validation on branch (lint/typecheck/test/build)  
7. No production deploy/merge without explicit authorization  

## Remaining blockers

1. GitHub Actions billing/spending limit blocks CI runners  
2. Staging Vercel env must have valid `VITE_SUPABASE_*`  
3. Manual 20-step UAT requires authenticated staging session  
4. Owner: delete deprecated edge functions (`sharepoint-proxy`, `bluebeam-proxy`, orphan stripe sync)  
5. Large-page decomposition (ResourceScheduling, Drawings, Submittals) continues as Partial — behavior-preserving extraction already started historically; full finish exceeds single-pass risk appetite without per-page UAT  
