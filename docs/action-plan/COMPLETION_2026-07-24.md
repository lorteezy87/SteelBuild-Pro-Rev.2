# Action plan completion snapshot — 2026-07-24

This note reconciles the improved workbook
`steelbuild_action_plan_improved_2026-07-23.xlsx` with work that landed on
`main` and production through **2026-07-24**.

## Artifacts

| Artifact | Path |
|---|---|
| Updated workbook | [`steelbuild_action_plan_tracker_2026-07-24.xlsx`](./steelbuild_action_plan_tracker_2026-07-24.xlsx) |
| ID-by-ID ledger | [`TASK_LEDGER.md`](./TASK_LEDGER.md) |
| TypeScript standard (related) | [`../architecture/typescript-standard.md`](../architecture/typescript-standard.md) |

Workbook sheets: **Changelog** (this refresh), **Tracker** (IDs 1–105), **Summary** (formulas), **MSP Import** (statuses synced from Tracker).

## Headline counts (IDs 1–105)

Updated **2026-07-25** (`cursor/action-plan-next-slice-d3a1` — see `WORK_NEXT_SLICE.md`):

| Status | Count |
|---|---|
| Done | **78** |
| In Progress | **26** |
| Blocked | **1** (ID 102 — full interactive core-workflow UAT) |
| Not Started | **0** |

Prior workbook (2026-07-23) had many items still **Not Started** that were already done in code or finished in PRs #114–#120.

## What moved to Done (high-signal)

- **Stabilization / hygiene:** duplicate inventory, dead-code deletes, folder ownership, gitignore, architecture notes (#119 / #120)
- **Broken workflows:** task persistence, cost/CO/closeout/contracts, PMA removal, piece/shipping app sync, drawing audit (prior), top Sentry fixes
- **Security:** base44/app-params removal, LS identity auth removal, JWT/service-role posture re-verified
- **UX trust:** coming-soon inventory, Sync Now honesty
- **Extractions helpers:** ResourceScheduling, `standardMutation`, `assertProjectId`
- **TypeScript Phase 1–3 start:** no-new-JS gate + priority business-rule conversions (#120)

## Still In Progress (expected)

Large-page thinning (Submittals/Drawings/RFIs/…), universal mutation/toast adoption, full KPI/form test matrix, interactive project-switch UAT, office↔shop↔field handoffs.

## Blocked

| ID | Blocker |
|---|---|
| 102 (and launch Go/No-Go) | Authenticated staging UAT + GitHub Actions org billing/spending limit |

## Production

Deployed **2026-07-24** to https://www.steelbuild-pro.com from `main` including merges **#119** (action-plan + Sentry) and **#120** (TypeScript standard). PR **#118** closed as superseded by #119.

**2026-07-26:** PR **#123** (`withProjectId` write shaping + Submittals/RFIs/Drawings mutation helpers + tracker checkpoint **Done 78 / In Progress 26 / Blocked 1**) merged to `main` and deployed to production. GitHub Actions CI remains blocked by org billing/spending limit — validated locally (lint + four typecheck gates + helper tests + build) then deployed via `npx vercel --prod` (`steelbuildpro-og`).

**2026-07-26 (deploy batch):** Merged **#133–#137** to `main` and deployed to production (`dpl_3HLTVWMirhvfe7rASEc6XPBmpKyL` → https://www.steelbuild-pro.com). ID **18** Done; IDs **48**/**50** advanced. Local vitest/eslint/build green; GH Actions still billing-blocked.

**2026-07-26 (budget-field):** BudgetHours + FieldPlan + PayApplications `LoadingSkeleton` + error/retry; BudgetHours preset toast helper (`cursor/action-plan-budget-field-d3a1`). Open siblings **#139–#146**. Tracker: Done **79** · In Progress **25** · Blocked **1**.

## How to refresh next time

1. Update `TASK_LEDGER.md` statuses from PRs/deploys.  
2. Regenerate or edit `steelbuild_action_plan_tracker_YYYY-MM-DD.xlsx` Tracker column **Status** + **Notes**.  
3. Keep MSP Import Status in sync with Tracker task names.  
4. Bump Summary “As of” date.  
