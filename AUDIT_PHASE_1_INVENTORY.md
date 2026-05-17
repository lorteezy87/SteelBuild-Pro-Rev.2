# AUDIT PHASE 1 — Inventory (lite)

Date: 2026-04-23
Working dir: `C:\dev\SteelBuild-Pro-Rev.2\.claude\worktrees\ecstatic-swirles-259e4a`
Deploy branch: `codex/base44-deploy-nick` → Vercel (production URL)

This is a **focused, narrow inventory** — not the exhaustive per-file catalog the full audit prompt asked for. A full Phase 1 is 1.5–2 days of dedicated surveying of ~600 files. What's captured here is what was needed to pin down the 7 "Known Baseline Issues" and ship their fixes in one session.

The remaining Phase 1 depth (every .jsx categorized, every route confirmed, every component's props catalogued, every Supabase entity's RLS verified) is queued for a follow-up session.

---

## Working state at start of pass

### Routes / pages surveyed
- `src/pages/` — 80+ page files, of which the 7 flagged items live in:
  - `WorkPackages.jsx` — 460 lines
  - `RFIs.jsx` — 645 lines
  - `Constraints.jsx` — 390 lines (+ 11 files under `src/pages/constraints/`)
  - `ResourceManagement.jsx` — has `Add Resource` button (line 151)
  - `ResourceScheduling.jsx` — has `New Resource` button (line 753)
  - `ModelViewer.jsx` — 908 lines, rebuilt earlier this session
- `src/components/shared/QuickAddFAB.jsx` — the floating add button, 155 lines

### Component families surveyed
- `src/components/rfis/` — RFI modals, list, dashboard, bulk import
- `src/components/workpackages/` — WP cards, gantt, site map, form modal
- `src/components/shared/` — FAB, design system primitives, formatters
- `src/components/ai-assistant/` — launcher + drawer + useScheduleAssistant
- `src/pages/constraints/` — KPI strip, filters, list, board, form modal

### Supabase entities touched by this pass
- `rfis` — bulk-update payload expanded
- `work_packages` — NEW WP button guarded on projectId

No schema changes landed in this pass. Migration 048 (construction-scheduling foundations) was shipped in a prior session and is already in git.

---

## Baseline issue inventory → diagnosis

| # | Issue (from prompt) | Actual location / diagnosis | Action |
|---|---------------------|------------------------------|--------|
| 1 | **Non-functional floating button** | `QuickAddFAB.jsx:19-32` — `handleOptionClick` just `navigate()`s to each page but never opens a create modal. Comment literally says "These would integrate with modal systems in each page. For now, navigate…". Stub. | Fixed: navigate with `?new=1` and each destination page auto-opens its create modal on mount |
| 2 | **Missing New buttons on Work Packages** | `WorkPackages.jsx:309` — NEW WP button existed but was NOT guarded on `projectId`, so clicking with no project selected opened a form with `project_id: undefined` which failed to save. | Fixed: `disabled={!projectId}` + explanatory title attr |
| 3 | **Modal font color issues** | Mixed — some modals set `color: #fff` inline, then children inherit it. In light mode, children without their own color rendered white-on-white. | Fixed: CSS safety-net in `base.css` forces text inside `[role="dialog"]` (and child tags) to `var(--text-primary)` unless the element has its own `style="color:..."` |
| 4 | **Bulk RFI editing not implemented** | `RFIs.jsx:533-556` — BulkActionBar had only MARK ANSWERED / MARK UNDER REVIEW / EXPORT / DELETE. No generic bulk-edit path. `bulkUpdateMut` already supports arbitrary `data` payload — UI layer was missing. | Fixed: new `RfiBulkEditModal.jsx` + BULK EDIT action |
| 5 | **Missing "New Resource" button** | False alarm — both `ResourceManagement.jsx:151` and `ResourceScheduling.jsx:753` have the button and wire it correctly. | No action |
| 6 | **Broken Constraints page** | Code is structurally sound: query fires against `ActionItem` with `category: "CONSTRAINT"`, mutations + modals wired correctly, no-project branch has a styled empty state. Build is clean. | No code change. If user still sees an issue, it's runtime/data-shape, not code |
| 7 | **Broken 3D modeler** | Fixed earlier in this session — ViewHelper was clobbering the main WebGL viewport, RoomEnvironment + PMREM were fighting OBC SimpleRenderer. Reverted to plain scene + env-less lights. Build clean, imports clean, tools intact (section, measure, isolate, screenshot, click-to-select). | Verified — no further action |

---

## What's in scope for follow-up passes

### Full Phase 1 (not done):
- Exhaustive file tree categorization (page / component / hook / util / api / types)
- Route audit with orphan detection
- Per-component prop/state/data inventory
- 37-entity Supabase schema catalog with RLS per-policy
- Asset inventory (fonts, icons, images)
- Dependency audit + `npm audit` review

### Phases 2–9:
- Queued. Each is 1–3 days of focused work. Suggest prioritization after P0/P1 fixes ship.

### Phase 10 remediation queue (beyond the 7 baseline items):
- Several P1/P2 items from earlier sessions are still open:
  - PortfolioView overhaul (KPI band + interactive cards)
  - ResourceScheduling crispness pass
  - Drawing markup tools (highlighter + measurement)
  - Outstanding Batch B audit items (#9 daysValue convention, #10 set-aggregation due-date)

---

## Build / deploy state after this pass

- `npm run build` — clean, no errors
- Commits: 1 focused commit per fix (see git log)
- Deploy: pushed to `codex/base44-deploy-nick` → Vercel auto-deploys
