# RFI Control Center Redesign — Design Spec

- **Date:** 2026-06-27
- **Status:** Approved (design) — pending spec review, then implementation plan
- **Author:** AI engineering agent (with owner)
- **Branch:** `claude/command-ui-rfi`
- **Sub-project of:** the "Industrial Command System" app-wide redesign (owner-provided 31-module mockup set, light theme, 2026-06-27)

---

## 1. Context

The owner provided a complete, high-fidelity mockup set covering all **31 modules** of SteelBuild Pro in a single, consistent **light-theme "Control Center"** visual language, and confirmed: *"this is the way we need to go with the design."* These mockups are the canonical visual source of truth for the redesign.

This effort is **too large for one spec**. It decomposes into:

- **A — Foundation:** a light-default design-system kit (the "Command UI" primitives) + theming strategy.
- **B — Shell:** the refined left sidebar + top bar (supersedes the dock).
- **C — Control Centers:** each of the 31 module pages re-skinned onto the template, on its *real* data, behavior-preserving — one spec → plan → build each.

**This spec covers the first vertical slice: the RFI Control Center page** (module #3), built on enough of the Foundation (A) primitives to stand it up. The slice intentionally proves the shell + light theme + page template together in one clickable, field-verifiable page, from which the remaining 30 pages replicate.

### Decisions locked in brainstorming (2026-06-27)

| Decision | Choice |
| --- | --- |
| Shell direction | **Sidebar wins, dock retired.** The refined left-sidebar + per-page photographic hero is canonical. The dock/full-screen-launcher `desktop_shell` (deployed `4550f781`) stays dormant behind its flag — not deleted, not expanded. |
| Theme | **Light becomes the default.** New pages are born light-default. Dark becomes a secondary, scoped override (deferred — see §8). The global default theme is only flipped once enough pages exist. |
| Build sequence | **Vertical slice first: RFI Control Center.** Build one full page end-to-end, extract shared primitives, then replicate. |
| Rollout | **Flag-gated** behind a new flag `command_ui` (owner-override ON first; classic app unchanged for everyone else). |

---

## 2. Goal & Non-Goals

### Goal

Re-skin the existing RFI page into the new **RFI Control Center** workbench matching the owner's mockup — **behavior-preserving** (identical data, mutations, helpers, exports, and row actions; only presentation changes) — and in doing so, establish the reusable **Command UI** primitives and the **light-default theming** pattern that the other 30 pages will reuse.

### Non-Goals (explicit — do NOT do in this slice)

- **No schema changes.** Verified: every KPI/column in the mockup is already real or trivially derived from the live `rfis` table (§4). No migrations.
- **No new full sidebar shell.** The slice renders inside the *existing* app shell. The refined sidebar/top-bar is Sub-project B, a follow-on.
- **No dark theme for the new kit yet.** Light-only for the slice; dark-secondary is a sequenced follow-on (§8).
- **No global theme flip.** The classic app stays dark-default for users until many pages are migrated.
- **No mutation/workflow changes.** RFI create/update/delete, CSV export, nudge, downstream-apply all stay exactly as they are.
- **No changes to the other 30 pages.**

---

## 3. The Command UI kit v2 (Foundation, light-first)

New namespace: **`src/components/command/`**. All components typed `.tsx` (per the repo's TS-conversion direction and the kit-typing lesson from the dock kit). Styling lives in a new scoped stylesheet **`src/styles/command.css`**, with every rule scoped under **`[data-skin="command"]`** so it cannot leak into the classic app. Tokens are **light-default**; a `[data-skin="command"][data-theme="dark"]` override block is stubbed but deferred (§8).

The slice ships these primitives (each later page reuses them):

| Component | Purpose | Key interface (props) |
| --- | --- | --- |
| `PageHero` | Darkened jobsite-photo band: page icon, title, one-line purpose, project name + context chip row; slot for the launch-tile grid. | `icon`, `title`, `subtitle`, `projectName`, `chips: {label}[]`, `photoSrc`, `children` (tiles) |
| `LaunchTileGrid` / `LaunchTile` | The top-right 8-tile quick-nav grid. Reuses the existing `pageIcons` + route registry from the dock work. | grid: `pages: PageKey[]`; tile: `pageKey`, `label`, `onNavigate` |
| `KpiStrip` / `KpiCell` | Metric row; optional group-divider; color-coded value + sublabel. | strip: `groups: KpiCell[][]`; cell: `label`, `value`, `sublabel?`, `tone?` (`neutral`/`good`/`warn`/`danger`/`info`) |
| `DecisionPanel` | Titled card with optional "View all"; the slice uses 3 (Work Queue · Ball-in-Court · Highest-Risk). | `title`, `viewAll?: () => void`, `children` |
| `Pill` | Light-themed status/priority/semantic chip. | `tone`, `children` (maps RFI status/priority → tone) |
| `FilterBar` | Search + filter slots + "More Filters" + Export + gold primary action. | `search`, `onSearch`, `filters` (slot), `onExport`, `primaryAction: {label,onClick}` |
| `DataTable` | Dense light table: pills, red overdue text, progress, row kebab, pagination + page-size. | `columns`, `rows`, `pageSize`, `page`, `onPage`, `renderRow?` |

**Reuse note:** `pageIcons.jsx`, `launcherConfig.js`, and the photo assets under `public/photos/` from the dock work carry over. The hero *band* photo is a wide darkened jobsite image (initially one shared asset; per-page art is a later polish), distinct from the square launch tiles.

---

## 4. The RFI Control Center page (B, the slice)

### 4.1 Data mapping — verified against the live `rfis` schema (no schema changes)

The existing RFI Control Center already exists: `src/pages/rfis/RfiCommandCenter.jsx`, `RfiInsightsStrip.jsx`, `RfiRow.jsx`, fed by `src/pages/RFIs.jsx` (720 lines, the data/mutation owner), with pure helpers in `src/pages/rfis/utils.js`, `src/lib/commandCenter/urgencyEngine.js`, `rfiAgenda.js`, and `src/pages/dashboard/projectMetrics.js`.

| Mockup element | Backing (live field / existing helper) | Verdict |
| --- | --- | --- |
| **Need Action** | count `status ∈ {Open, Under Review, Incomplete Response}` | REAL |
| **Overdue** | `isOverdue()` = `date_required < now && status ∉ {Answered, Closed}` (`utils.js`) | REAL |
| **Incomplete** | `status === "Incomplete Response"` | REAL |
| **Critical** | `priority === "Critical" && status ∉ {Closed}` | REAL |
| **Response Rate %** | `(Answered + Closed) / total` | REAL |
| **Cost Exposure $** | Σ `cost_impact_amount` where `cost_impact && open` | REAL |
| **Schedule Impact d** | Σ `schedule_impact_days` where `schedule_impact && open` | REAL |
| **RFI Work Queue** | open RFIs ranked by urgency/`riskScore` (`urgencyEngine`, `RfiCommandCenter` `riskScore`) | REAL (UI grouping) |
| **Ball-in-Court** | `ball_in_court` grouped by company → count + oldest RFI# + avg age | DERIVABLE → new pure helper `ballInCourtSummary` (+ tests) |
| **Highest-Risk RFIs** | top 5 by existing `riskScore(rfi)` | REAL |
| Table: RFI#, Subject, Discipline, Status, Priority, BIC, Age, Response Due, Impact, Cost Exposure | `rfi_number`, `title`, `discipline`, `status`, `priority`, `ball_in_court`, `daysOpen()`, `date_required`/`isOverdue()`, `cost_impact_amount`+`schedule_impact_days` | REAL / DERIVABLE |

Confirmed live columns include: `rfi_number, title, question, answer, status, priority, ball_in_court, submitted_date, date_required, date_answered, discipline, drawing_reference, drawing_set_id, cost_impact, cost_impact_amount, schedule_impact, schedule_impact_days, assigned_to, work_package_id, area_sequence, metadata`. (`date_required` is the canonical due date used by helpers; `due_date`/`responded_date`/`response_text`/`description` are legacy aliases — do not introduce new dependence on them.)

### 4.2 Layout (matches the mockup, top to bottom)

1. `PageHero` — `?` icon, "RFI Control Center", purpose line, project name + chips (`13 Buildings · 156 Drawings · 123 RFIs Open` from real project rollups), 8 launch tiles top-right.
2. `KpiStrip` — group 1 (counts): `Need Action · Overdue · Incomplete · Critical`; divider; group 2 (performance): `Response Rate · Cost Exposure · Schedule Impact`.
3. Three `DecisionPanel`s — **RFI Work Queue** (by urgency) · **Ball-in-Court** (by company: count, oldest, avg age) · **Highest-Risk RFIs** (`riskScore` + status/mitigation chip). Each "View all" routes into the existing list/filtered view.
4. `FilterBar` — search + Status + Priority + Discipline + Ball in Court + Impact + More Filters + Export (existing `exportRFIsToCSV`) + **New RFI** (existing create).
5. `DataTable` — columns per §4.1; status/priority `Pill`s; red overdue text; row kebab with the existing actions; pagination + page-size.

### 4.3 Wiring (behavior-preserving)

`RFIs.jsx` remains the single owner of RFI data fetching, mutations, URL/filter state, bulk selection, and attachment upload. We add a flag branch:

- **`command_ui` ON** → render `<RfiControlCenter>` (new component, new kit) fed by the **same** data, handlers, derived values, and helpers `RFIs.jsx` already computes.
- **`command_ui` OFF** → render today's RFI page unchanged.

The new `RfiControlCenter` is **presentation only** — it receives RFIs + callbacks as props and calls the same mutation handlers. No new queries, no new mutations, no new cache keys. Existing RFI tests stay valid because the data layer is untouched.

---

## 5. New code (file-by-file)

**New:**
- `src/components/command/` — `PageHero.tsx`, `LaunchTileGrid.tsx`, `KpiStrip.tsx`, `DecisionPanel.tsx`, `Pill.tsx`, `FilterBar.tsx`, `DataTable.tsx`, `index.ts` (barrel).
- `src/styles/command.css` — light-default tokens + component styles, all scoped under `[data-skin="command"]`.
- `src/pages/rfis/RfiControlCenter.tsx` — the new page composition (presentation).
- `src/pages/rfis/rfiControlCenter.derive.ts` — `ballInCourtSummary` + any new KPI derivations, **pure + unit-tested** (new `.ts`, not folded into the legacy `utils.js`, so it is independently typed/tested).
- `src/pages/rfis/__tests__/rfiControlCenter.derive.test.ts` — tests for the new pure helpers.

**Modified (minimal):**
- `src/pages/RFIs.jsx` — add the `command_ui` flag branch; pass existing data/handlers into `<RfiControlCenter>`. No data/mutation changes.

**Flag seed (not a code change):** insert one `feature_flags` row via Supabase MCP, mirroring `desktop_shell`: `flag_key='command_ui'`, `enabled=false`, `user_overrides={"nickl@shsteelaz.com": true}`. Done at deploy time, not committed code.

**Untouched:** `urgencyEngine.js`, `rfiAgenda.js`, `projectMetrics.js`, `utils.js` (riskScore/daysOpen/isOverdue/exportRFIsToCSV reused as-is), all mutations, the classic RFI components.

---

## 6. Theming strategy (light-default, scoped)

- New kit styles live under `[data-skin="command"]` — the new page sets `data-skin="command"` on its root, so the kit's light tokens apply **only** inside the redesigned surface. The classic app's dark `.sbd-*` system is untouched.
- Light is the **default** value set. A `[data-skin="command"][data-theme="dark"]` override block is included but left as a deferred follow-on (§8) — the slice ships light-only.
- Tokens follow the mockup: white/near-white surfaces, subtle gray borders, **gold brand accent** (`#D7A928`-family) for active-nav/primary/focus, semantic status colors (green ok / amber warn / red overdue / blue info), de-terminalized type.

---

## 7. Rollout & validation

- **Flag:** `command_ui` — `enabled=false` globally, `user_overrides: { "nickl@shsteelaz.com": true }`. Classic RFI page for everyone else.
- **Validation ladder (pre-deploy):** `lint`, `typecheck`, `typecheck:js`, `typecheck:strict`, `typecheck:noimplicitany`, `vitest run --maxWorkers=2` (full), `vite build`. New pure helpers unit-tested; existing RFI tests must stay green (proves behavior preserved).
- **Field-verify (required, per CLAUDE.md §32):** owner signs in as `nickl@shsteelaz.com` with `command_ui` on, opens RFI Control Center, confirms KPIs/panels/table render against real project data, mutations still work (create/edit/export), responsive + readable. The agent cannot auth into the live app, so this step is owner-driven and the slice is labeled **code-verified, NOT field-verified** until the owner confirms.
- **Deploy:** CI-gated `main` (push a verified SHA; never `HEAD:main`), watch `gh run`.

---

## 8. Out of scope / explicit follow-ons

1. **Dark-secondary theme** for the Command UI kit (`[data-skin="command"][data-theme="dark"]`).
2. **Sub-project B — the refined sidebar + top-bar shell** (supersedes the dock).
3. **The other 30 Control Center pages** — each its own spec → plan → build, reusing this kit.
4. **Global default-theme flip** to light, once enough pages are migrated.
5. Per-page hero art; removing the dormant dock kit.
6. Update CLAUDE.md §25 (dark-primary rule) once light is genuinely the default — a docs change deferred until the flip.

---

## 9. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| New kit primitives don't fit later pages | Vertical-slice-first exposes misfits early on a real page; primitives are extracted *from* a real page, not speculated. |
| Scoped CSS leaks into classic app | Every rule scoped under `[data-skin="command"]`; verified by building with flag off and confirming classic RFI page unchanged. |
| Behavior regression in RFI mutations | Data/mutation layer in `RFIs.jsx` untouched; new component is presentation-only; existing RFI tests must stay green. |
| "Looks done" but not field-verified | Owner field-verify gate is mandatory before calling the slice done (§7). |
| Concurrent-agent / shared-checkout churn | Work isolated in the `command-ui` worktree on `claude/command-ui-rfi`; deploy pushes a verified SHA. |

---

## 10. Definition of done (this slice)

- RFI Control Center renders the mockup layout on real `rfis` data behind `command_ui`, light-default.
- All KPIs/panels/columns map to real/derived fields (no fiction, no schema change).
- Mutations/export/row actions behave identically to the classic page.
- New pure helpers unit-tested; full validation ladder green; build green.
- Owner has **field-verified** the page in the running app (or it is explicitly labeled code-verified-only with a field-verify TODO).
- Reusable Command UI primitives exist and are documented well enough for the next page to reuse without rework.
