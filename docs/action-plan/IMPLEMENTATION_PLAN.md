# Action plan — dependency-aware implementation plan

## Baseline
All CI gates green on `main` before this branch’s edits (see TASK_LEDGER.md).

## Order of work (executed)

1. **Stabilize production Sentry defects** (cherry-pick) — unblocks runtime trust for contacts, CSP weather/wasm, model_elements timeouts.
2. **Phase 1 hygiene + ownership** — invent duplicates, delete proven-dead modules, publish folder rules, tighten `.gitignore`.
3. **Phase 2/5 security identity** — remove localStorage identity auth fallbacks; delete Base44 remnant UI.
4. **Phase 4 mutation standard** — introduce `standardMutation` helpers; wire into cost-code save; add schedule task persistence tests.
5. **Phase 6 honesty** — inventory coming-soon; mute unavailable Sync Now affordance.
6. **Verify prior PRs #112–#117** via tests (`pmaRemoval`, `pieceRegisterWiring`, cost/CO/closeout, fab/piece) rather than reimplementing.
7. **Ledger honesty** — Partial/Blocked for large refactors, staging UAT, CI billing.

## Explicit non-goals this pass
- Behavior-changing rewrite of ResourceScheduling / Drawings / Submittals shells without per-page UAT.
- Production deploy or `main` merge without separate authorization.
- Inventing pricing or enabling incomplete integrations as live.

## Follow-on recommended order
1. Owner: fix GitHub Actions billing; fix staging `VITE_SUPABASE_*`.
2. Owner: `supabase functions delete` deprecated proxies.
3. Per-page extraction PRs for ResourceScheduling → Drawings → Submittals with golden tests first.
4. Broaden `assertProjectId` / `invalidateAfterMutation` adoption across remaining page-local mutations.
5. Manual UAT checklist (Task 110) on staging.
