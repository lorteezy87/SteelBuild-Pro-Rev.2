# Action plan — dependency-aware implementation plan

## Baseline
Gates green on `main` after **#119** / **#120**; production deploy 2026-07-24.
Authoritative status: [`TASK_LEDGER.md`](./TASK_LEDGER.md) + workbook [`steelbuild_action_plan_tracker_2026-07-24.xlsx`](./steelbuild_action_plan_tracker_2026-07-24.xlsx).

## Order of work (executed)

1. **Stabilize production Sentry defects** — contacts FK embed, CSP open-meteo/wasm, model_elements index/paging (landed via #119; #118 closed as superseded).
2. **Phase 1 hygiene + ownership** — duplicate inventory, delete proven-dead modules, folder rules, `.gitignore`.
3. **Phase 2/5 security identity** — remove localStorage identity auth fallbacks; delete Base44 remnant UI; `useAppSecurity.ts` (#120).
4. **Phase 4 mutation standard** — `standardMutation` helpers; cost-code save typing; schedule task persistence tests.
5. **Phase 3 extraction start** — ResourceScheduling pure helpers + 27 tests (#119).
6. **Phase 6 honesty** — coming-soon inventory; mute unavailable Sync Now.
7. **TypeScript Phase 1–3 start** — no-new-JS CI gate + priority business-rule conversions (#120).
8. **Verify prior PRs #112–#117** via tests rather than reimplementing.
9. **Merge #119 + #120 to `main` and deploy production** (2026-07-24).

## Explicit non-goals (still)
- Behavior-changing rewrite of Drawings / Submittals / RFIs shells without per-page UAT.
- Enabling incomplete integrations as live or inventing pricing.

## Follow-on recommended order
1. Owner: fix GitHub Actions billing; fix staging `VITE_SUPABASE_*`.
2. Owner: `supabase functions delete` deprecated proxies.
3. Per-page extraction PRs for Drawings → Submittals → RFIs with golden tests first.
4. Broaden `assertProjectId` / `invalidateAfterMutation` adoption across remaining page-local mutations.
5. Manual UAT checklist (Task 102 / 110) on staging → launch Go/No-Go.
