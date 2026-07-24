# SteelBuild Pro Action Plan — Task Ledger

**Authoritative status as of 2026-07-24** (post merges **#119**, **#120**, and production deploy).

Companion workbook: [`steelbuild_action_plan_tracker_2026-07-24.xlsx`](./steelbuild_action_plan_tracker_2026-07-24.xlsx)  
Snapshot narrative: [`COMPLETION_2026-07-24.md`](./COMPLETION_2026-07-24.md)

| Metric | Count |
|---|---|
| Tracker tasks (IDs 1–105) | 105 |
| **Done** | **62** |
| **In Progress** | **42** |
| **Blocked** | **1** (ID 102 — full interactive UAT) |
| Not Started | 0 |

Status key (spreadsheet + this ledger):
- **Done** — implemented and verified (code + automated gates; UAT where noted)
- **In Progress** — meaningful progress; remaining work or field-verify gap called out
- **Blocked** — cannot finish without owner/external action

Production: https://www.steelbuild-pro.com — deployed 2026-07-24 from `main` (`1d192eb1`, includes #119).

---

## Phase 1 — Stabilization & structure

| ID | Status | Finding / work | Evidence |
|---|---|---|---|
| 1 | Done | Duplicate inventory documented | `DUPLICATE_INVENTORY.md` |
| 2 | Done | Canonical ownership rules chosen | inventory + `folder-ownership.md` |
| 3 | Done | Risky deletes replaced with re-exports / comments | `ImpactBoard.tsx` → Panel re-export |
| 4 | Done | Dead duplicates deleted | `viewer/**`, WeeklySummary orphans, `app-params.js`, AuthCallbackError, BulkActionBar |
| 5 | Done | Folder ownership architecture note | `docs/architecture/folder-ownership.md` |
| 28 | Done | No stale root duplicate folders | inventory |
| 29 | Done | No tracked zip/tgz; gitignore blocks archives | `.gitignore` |
| 30 | Done | Logs ignored; none tracked | `.gitignore` |
| 31 | Done | `dist/` untracked | `.gitignore` |
| 32 | Done | Only `.env.example` tracked | `git ls-files` |
| 33 | Done | gitignore extended (coverage, archives, playwright, `/exports/`) | `.gitignore` |
| 34 | Done | Single lockfile (`package-lock.json`) | package root |
| 35 | Done | Folder rules published | `folder-ownership.md` |
| 36 | In Progress | Shared UI in `design-system/` + `ui/`; some page-local chrome retained | inventory |
| 37 | In Progress | Business logic extraction ongoing | `standardMutation.ts`, ResourceScheduling helpers |
| 38 | Done | Architecture notes published | `folder-ownership.md`, `typescript-standard.md` (#120) |
| 42 | Done | Dead imports/modules removed | #119 |
| 43 | In Progress | Critical typing gated; priority modules → TS | #120 `check:no-new-js` |

## Phase 2 — Workflows & stability

| ID | Status | Finding / work | Evidence |
|---|---|---|---|
| 6 | Done | Task persistence sanitize + tests | `taskPersistence.test.ts` |
| 7 | Done | Cost-code save + soft-delete + unique | `costCodeSave.ts` + `20260724140000` |
| 8 | Done | Contract management + project update sync | ContractManagement |
| 9 | Done | CO edit payload whitelist | `changeOrderPayload.ts` |
| 10 | Done | CO archive/soft-delete | CoControlCenter |
| 11 | Done | Checklist closeout mapping | `closeoutPayload.ts` |
| 12 | Done | PMA removed from runtime | `pmaRemoval.test.ts`; on prod |
| 13 | Done | Drawing workflow failures documented + PDF race fixed | PR #96 note in workbook |
| 14 | Done | App sync paths hardened (piece/shipping); SharePoint still unavailable | #116 + honest Sync Now |
| 15 | In Progress | Automated suite green; interactive staging UAT open | see ID 102 |
| 16 | Done | No early-return-before-hooks in sampled large pages | #119 audit |
| 17 | Done | Top Sentry CSP/timeout/embed issues fixed + deployed | #119; prod CSP includes open-meteo/wasm |
| 18 | In Progress | Loading/empty on critical modules; not universal | control centers |
| 19 | In Progress | Null project guards + `assertProjectId`; broaden adoption | `useAppSecurity.ts` |
| 20 | In Progress | Modal project-switch safety varies | needs UAT |

## Phase 3 — Major page refactors

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 21 | In Progress | Submittals TS + helpers; shell still large | `Submittals.tsx` |
| 22 | In Progress | Constraints split under `pages/constraints/` | ~403 LOC shell |
| 23 | In Progress | RFIs split under `pages/rfis/` | ~596 LOC |
| 24 | Done | ResourceScheduling helpers extracted + 27 tests | `resourceSchedulingHelpers.ts` |
| 25 | In Progress | Layout shell ~429 | `Layout.jsx` |
| 26 | In Progress | Deliveries already split | `pages/deliveries/` |
| 27 | In Progress | Drawings still large; hub is canonical | Drawings + DrawingSubmittalHub |

## Phase 4 — Mutations & shared logic

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 47 | Done | Standard mutation helpers | `standardMutation.ts` |
| 48 | In Progress | Toast + `toUserErrorMessage`; not universal | same |
| 49 | Done | `invalidateAfterMutation` | same + cacheRegistry |
| 50 | In Progress | Ad hoc mutations remain | TECH_DEBT |
| 51 | In Progress | Optimistic paths reviewed in places | prior PRs |
| 52 | In Progress | Scoped selects + invalidation; concurrent-edit E2E open | — |
| 53 | In Progress | Many KPI derives extracted | derive modules |
| 54 | In Progress | Payload helpers for CO/cost/closeout/schedule | domain helpers |
| 55 | Done | `assertProjectId` shared | useAppSecurity + standardMutation |
| 56 | In Progress | Status enums in domain libs | inventory |
| 57 | In Progress | Control-center pattern widely used | — |

## Phase 5 — Security & backend

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 58 | Done | base44Client gone; AuthCallbackError deleted | #119 |
| 59 | Done | app-params deleted; `env.ts` validated | #119 |
| 60 | Done | No manual URL token parsers | `supabase.ts` |
| 61 | Done | Removed LS identity auth fallback | useAppSecurity.ts (#120) |
| 62 | Done | No `requiresAuth: false` | grep |
| 63 | Done | AuthenticatedApp gates app | App.jsx |
| 64 | In Progress | RLS + PROJECT_SCOPED; broaden assertProjectId | — |
| 65 | Done | Approved auth/config pattern documented | runbooks (prior) |
| 66 | Done | stripe/email/llm JWT gates | edge functions |
| 67 | Done | service_role server-only | edge functions |
| 68 | In Progress | Org/project checks; broaden assertProjectId | — |
| 69 | Done | Stripe webhook signature + idempotency | stripe-billing |
| 70 | In Progress | Staging env historically mis-set — owner verify | Sentry Y |

## Phase 6 — UX trust & continuity

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 71 | Done | Coming-soon inventory | `COMING_SOON_INVENTORY.md` |
| 72 | Done | Coming-soon gated in Integrations UI | Integrations.jsx |
| 73 | Done | Honest messaging for incomplete connectors | catalog + DMS |
| 74 | Done | Sync Now labeled unavailable | DocumentStorageSettings |
| 75 | In Progress | Flagship paths honest; catalog lists future items | — |
| 76 | Done | Drawing/submittal/fab controls | #115 + prod |
| 77 | In Progress | RFI hardened; field UAT open | — |
| 78 | Done | Piece/production hardening | #116 + prod |
| 79 | Done | Shipping bridge + quantity rules | #116 + prod |
| 80 | In Progress | Schedule/look-ahead; field-verify open | — |
| 81 | In Progress | Cost/SOV/budget; KPI tests partial | — |
| 82 | Done | PMA removal complete (audit usefulness N/A) | pmaRemoval.test.ts |
| 83 | In Progress | Nav dead-ends fixed (#117); more handoffs remain | — |

## Phase 7 — Project boundaries

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 84 | In Progress | PROJECT_SCOPED_PAGES + RLS | routes tests |
| 85 | Done | Explicit FK project scope (Sentry) | softDelete / entityClient |
| 86 | Done | Portfolio vs project modes | Dashboard.jsx |
| 87 | In Progress | Truncation notices; confirm all KPIs scoped | — |
| 88 | In Progress | Interactive project-switch UAT open | ID 102 |

## Phase 8 — Customer-facing (ledger IDs 106–109; not in 1–105 workbook)

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 106 | In Progress | Alerts honest refresh; escalation not fully built | useAlerts |
| 107 | In Progress | Integration catalog honesty; Sync Now unavailable | catalog + DMS |
| 108 | In Progress | RLS/matrix docs; continuous verification | runbooks |
| 109 | Done | Landing pricing/module claims corrected | Landing + plansHonesty.test.ts |

## Phase 9 — Automated testing

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 89 | In Progress | Domain CRUD tests for key records | suite |
| 90 | Done | Task persistence tests | `taskPersistence.test.ts` |
| 91 | Done | Project-context tests | #107 (prior workbook note) |
| 92 | In Progress | Stage/transition tests | submittal/drawing |
| 93 | In Progress | Assignment coverage uneven | — |
| 94 | In Progress | KPI/calc tests in domains | — |
| 95 | In Progress | Import/piece sync tests | production hardening |
| 96 | Done | Drawing revision tests | #96/#101 |
| 97 | In Progress | Major form save tests partial | costCodeSave etc. |
| 98 | Done | Permission-sensitive regression coverage | prior |

## Phase 10 — Production-readiness review

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 99 | In Progress | Re-audit via this ledger + Sentry triage | 2026-07-24 |
| 100 | Done | Lint clean locally / in gates | CI + local |
| 101 | Done | Expanded typecheck gates pass | strict + noImplicitAny |
| 102 | **Blocked** | Full interactive UAT | staging credentials + GH Actions billing |
| 103 | In Progress | Security continuous | #119 LS-auth removal |
| 104 | In Progress | Boundaries continuous | FK embeds |
| 105 | In Progress | UX trust continuous | honest Sync Now |

## Phase 11 — Release gate

| ID | Status | Finding | Evidence |
|---|---|---|---|
| 110 | Blocked / Partial | Code+prod deploy done; Go/No-Go for *full* launch still needs staging UAT | Prod deploy 2026-07-24; UAT still open |

---

## Shipped on production (2026-07-24)

- Merges: **#114–#117**, **#119**, **#120** (and #118 closed as superseded by #119)
- Hosted migrations including `20260724120000` / `130000` / `140000` / `150000`
- Vercel prod: `steelbuildpro-og` → https://www.steelbuild-pro.com

## Remaining blockers

1. GitHub Actions billing/spending limit blocks CI runners  
2. Staging Vercel `VITE_SUPABASE_*` must be valid for authenticated UAT  
3. Manual multi-step UAT requires authenticated staging session  
4. Owner: delete deprecated edge functions (`sharepoint-proxy`, `bluebeam-proxy`, orphan stripe sync)  
5. Continue large-page thinning + `assertProjectId` adoption without mass risk  
