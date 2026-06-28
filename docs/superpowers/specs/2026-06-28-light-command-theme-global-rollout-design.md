# Light Command Theme — Global Rollout (light-first)

- **Date:** 2026-06-28
- **Status:** Approved (design) — executing
- **Branch:** `claude/command-ui-rfi` · worktree `.claude/worktrees/command-ui`
- **Flag:** `command_ui` (currently `enabled=false` globally, owner override on)
- **Continues:** [[command-ui-redesign-2026-06-27]] — 22 module Control Centers already shipped on the light kit.

## 1. Goal

Make the **light** theme the global default across the whole app (zero dark anywhere), with the 22 main modules on the new Control Center look and the remaining ~60 pages on a **clean, audited light fallback** (the app's existing `[data-theme="light"]` theme). Get **light mode to a consistent, readable 100%**, then progressively convert more modules to the new look. **Dark mode is explicitly deferred.**

## 2. Context (the real inventory)

The app has **82 registered route-level pages** (`src/config/routes.js`), not the 31 from the mockup set. **22 have a `command_ui` branch** (the new Control Center look). The other **60** break down as:
- **Calculators (6)** — already redesigned separately (own light device-shell); leave as-is.
- **Admin/system (~8)** — FeatureFlagsAdmin, UsersManagement, ProjectMembers, Onboarding, Tutorial, DataExchange, AgentMemory.
- **Deprioritized (~12)** — Inspections, QualityControl, Safety, EmailInbox, Integrations, Warranty, Punchlist, Photos, DailyLogs, Contacts, LEMs.
- **Moat / Detailing (4)** — DrawingSubmittalHub, Drawings, Submittals, DrawingViewer (on the older desktop kit).
- **Main modules not yet converted (~20)** — Dashboard, Reports, Field/FieldHub/FieldToday, Billing, Settings, Resources*, Financials/CostDashboard/ContractManagement/MarginRisk, AlertsCenter, Activity, ChangeRequests, LookAheadSchedule, etc.

## 3. The failure mode "make light 100%" must catch

The app already has a complete light theme via `[data-theme="light"]` tokens in `tokens.css` (sidebar `#FFFFFF`, etc.) + `steelbuild-light.css`. Pages that consume **theme tokens** (`var(--bg-*)`, `var(--text-*)`, `.sbd-*` classes) flip to light automatically. The break risk is pages/components that **hardcode dark colors** — inline `style` hex, CSS hex, or `rgba()` darks instead of tokens — which stay dark or go unreadable (dark-on-dark, light-on-light) when the theme flips. The audit finds and fixes those.

## 4. Decisions (locked)

1. **Light-first; dark deferred.** Do not delete dark-theme code — it becomes the basis of dark mode later.
2. **Flip global after a CODE-LEVEL light audit** (not blocking on a perfect pre-flip visual verify the agent cannot do). True 100% is reached iteratively: audit → flip → owner field-verify → fix.
3. **Progressive conversion** of main modules to the new look after the flip.
4. Long tail (calculators, admin, deprioritized, viewers, forms) stays on the clean light fallback — NOT force-fit into the dense Control Center template.

## 5. Plan (phases)

### Phase 1 — Light-mode audit + fix (the "100%" gate)
- Grep/scan all `src/pages` + `src/components` for the failure pattern: hardcoded dark hex (`#0…`/`#1…` backgrounds, dark `rgba`), `color:#fff`-on-light, `steelbuild-dark`-only styling, non-token inline colors.
- Fix offenders to use theme tokens (`var(--bg-surface)`, `var(--text-primary)`, …) or light-safe values, so they render correctly under `[data-theme="light"]`.
- Clean up the 22 new pages' known caveats (a few assumed CSS vars like `--cmd-meta`/`--cmd-page-px`, MISSING-field display).
- Parallel agents per page-batch; coordinator validates + commits + deploys each batch.

### Phase 2 — Flip global
- `update feature_flags set enabled=true where flag_key='command_ui'` (Supabase). Whole app → light; 22 new-look + 60 audited fallback.
- Deploy is already live (code shipped); the flip is a DB change (takes effect ~30–60s, no redeploy).
- Owner field-verifies across pages; iterate on anything that slipped.

### Phase 3 — Progressive conversion
- Convert remaining main modules to the new Control Center look in parallel batches (Dashboard, Reports, Field, Settings, Billing, Resources, Financials…), behavior-preserving, deploy each.

### Phase 4 — Dark mode (DEFERRED)
- Add the command kit's dark variant scoped under `[data-skin="command"][data-theme="dark"]`; reconcile with the existing dark theme.

## 6. Validation & rollout

- Per batch: lint + `typecheck:strict` + `typecheck:noimplicitany` + `typecheck:js` + targeted vitest + `vite build`; FF-safe push of a verified SHA to `main` (CI runs the full suite + deploys). Continue-on-deploy authorized (owner standing order).
- The global flip (Phase 2) is the one production-visible-to-all step — owner-gated decision, executed via the flag once light is audited.

## 7. Out of scope / non-goals

- Deleting the dark theme (needed for dark mode).
- Redesigning calculators (already done) or force-fitting admin/deprioritized/viewer/form pages into the Control Center template.
- Dark mode (Phase 4, deferred).
- The full new sidebar shell rebuild (the existing sidebar reskins light via the theme; sufficient for now).

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Agent cannot field-verify 60 light-fallback pages | Code-level audit catches hardcoded-dark; owner field-verifies post-flip; iterate. |
| Flip exposes the 22 new pages to all users unverified-by-agent | Owner has used them under override; tested + built + CI-green. |
| A hardcoded-dark page slips the grep | Owner field-verify pass after flip; fix forward. |
| Concurrent agents on `main` | Isolated worktree; FF-safe verified-SHA pushes, rebase on reject. |
