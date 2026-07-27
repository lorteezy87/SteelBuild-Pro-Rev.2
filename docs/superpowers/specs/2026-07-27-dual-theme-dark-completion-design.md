# Dual Theme Dark Completion — Design Spec

- **Date:** 2026-07-27
- **Status:** Approved (design) — implementation plan ready (`docs/superpowers/plans/2026-07-27-dual-theme-dark-completion.md`)
- **Branch:** `cursor/dual-theme-dark-completion-0b3b`
- **Continues:** [[2026-06-28-light-command-theme-global-rollout-design]] Phase 4 (previously deferred)
- **Supersedes (directive):** `AGENT_CLAIMS.md` owner lock “do NOT dark-theme command_ui” — replaced by dual-theme rules below

## 1. Goal

Ship a **complete dual theme** across SteelBuild Pro: light remains as shipped today; dark follows the **existing SteelBuild Dark** palette already started in `tokens.css` / `steelbuild-dark.css` / `.sbd-*`, including **Control Centers** via a command-kit dark variant. When the user has no saved preference, follow **`prefers-color-scheme`**. Exhaustively burn down hardcoded surface/text/border colors so neither theme produces light islands, invisible text, or unreadable chrome.

## 2. Context

The app currently stacks three presentation systems:

| Layer | Mechanism | Role today |
| --- | --- | --- |
| Core tokens | `src/styles/tokens.css` (`data-theme`, accent, contrast, motion) | Dual palette; dark is `:root` default |
| SteelBuild Dark overlay | `html.steelbuild-dark` + `steelbuild-dark.css` / `.sbd-*` | Frosted dark chrome for legacy / residual UI |
| Command kit | `[data-skin="command"]` + `command.css` / `cmd-*` | **Intentionally light** Control Centers (Phase 0–3 light-first) |

Related facts:

- `ThemeContext` (`src/components/shared/ThemeContext.jsx`) defaults to `"dark"` and persists `sbp-theme`, but `LayoutRoute` forces `setTheme("light")` on mount — fighting dual theme.
- Light-first rollout (`2026-06-28-light-command-theme-global-rollout-design.md`) deferred dark as **Phase 4**.
- Owner lock (`AGENT_CLAIMS.md` / `opus-command-ui-lock`) forbade painting command pages with SteelBuild Dark classes after a prior dark sweep regressed the Dashboard.
- Hardcoded hex/rgba remains widespread (~200+ files under `src/pages` + `src/components`), heaviest in drawings, schedule, DMS, dashboard legacy, financials/reports.
- `CLAUDE.md` still mentions stale “Iron Forge” rules (Safety Orange / Space Grotesk / `--color-primary`) that do **not** match shipped tokens (gold / Barlow Condensed / `--accent`). Docs must be corrected for dual-theme truth without redesigning the palette.

## 3. Locked decisions

1. **Dual theme** — light and dark both first-class; Control Centers participate in both.
2. **Unset preference → system** — if `localStorage` key `sbp-theme` is absent, resolve from `prefers-color-scheme`; once the user toggles or sets Display prefs, persist and win thereafter.
3. **Command dark maps onto SteelBuild Dark** — `[data-skin="command"][data-theme="dark"]` remaps `--cmd-*` to existing `--sbd-*` / dark `--bg-*` / status tokens. Do not invent a separate night brand.
4. **Foundation-first, then domain burn-down** — theme resolution + command dark + shared chrome first; then exhaustive hex/rgba audit by domain batch.
5. **Full-app audit is in scope** — “complete” means the burn-down is closed (or every remaining hex is allowlisted with reason), not just plumbing.
6. **Do not delete light command** — light rules stay; dark is additive overrides / token remaps.
7. **Do not paint command with raw `.sbd-*` wrappers** that bypass the kit — command stays on `--cmd-*` / `cmd-*` classes so light and dark both flow through one kit.

## 4. Architecture

### 4.1 Theme resolution

```
localStorage sbp-theme set?
  ├─ yes → use stored "dark" | "light"
  └─ no  → matchMedia("(prefers-color-scheme: dark)")
              ├─ true  → "dark"
              └─ false → "light"
```

Implementation notes:

- Update `ThemeContext` initial state: when `sbp-theme` missing, use system preference instead of hardcoded `DEFAULTS.theme` alone. Keep `DEFAULTS.theme` only as last-resort fallback if `matchMedia` is unavailable.
- Optionally listen for `change` on `prefers-color-scheme` **only while** no `sbp-theme` is stored (so OS flips follow until the user chooses).
- **Remove** the `useEffect(() => setTheme("light"), …)` in `src/boot/LayoutRoute.jsx`.
- Continue applying `data-theme` and toggling class `steelbuild-dark` on `<html>` exactly as today when `theme === "dark"`.
- Settings → Display and `ThemeToggleButton` continue to call `setTheme` / `toggleTheme` (writes `sbp-theme`).

### 4.2 Token / skin stack

```
<html data-theme="…" data-skin="command"? class="steelbuild-dark"? >
  tokens.css          → --bg-* / --text-* / --accent / status / chart
  steelbuild-dark.css → --sbd-* + .sbd-* utilities (when class present)
  command.css         → --cmd-* under [data-skin="command"]
                        + dark remap under [data-skin="command"][data-theme="dark"]
```

`useCommandSkin()` keeps setting `data-skin="command"` for Control Centers. Dark no longer requires leaving those pages as light islands.

### 4.3 Command dark mapping (canonical)

Add an additive block (exact values may alias existing vars; do not introduce a new gold):

| Command token | Dark source |
| --- | --- |
| `--cmd-bg` | `--sbd-bg-base` / `--bg-page` |
| `--cmd-surface` | `--sbd-bg-surface` / `--bg-surface` |
| `--cmd-border` | `--sbd-border` / `--border-default` |
| `--cmd-text` | `--sbd-text` / `--text-primary` |
| `--cmd-text-muted` | `--sbd-text-muted` / `--text-muted` |
| `--cmd-gold` | `--sbd-gold` / `--accent-light` |
| `--cmd-good` / `--cmd-warn` / `--cmd-danger` / `--cmd-info` | `--sbd-success` / `--sbd-warning` / `--sbd-error` / `--sbd-info` (or `--status-*`) |
| `--cmd-good-text` / `--cmd-warn-text` / `--cmd-danger-text` | AA-safe text-on-dark-chip tones (lighter than light-theme `-text` variants) |
| `--cmd-review` | `--sbd-review` / `--status-review` |

Also dark-scope or tokenize hardcoded light-only fills in `command.css` today, including:

- Chip / KPI icon backgrounds (`#e9edf2`, `#f1f4f8`, status pastels `#d6f0de`, …)
- Hero icon wash (`#fdf3da`)
- Hero photo left-edge white gradients → dark-surface gradients so titles stay readable
- Pill / primary button text colors that assume light gold fills

Light command rules remain the default under `[data-skin="command"]` without `[data-theme="dark"]`.

### 4.4 Shared chrome before domain batches

- Dashboard reference shell (`dashboardTheme.css`): theme-neutral; dark path already partially present — finish so it does not force light under `.steelbuild-dark`.
- Native `<select>` / inputs: keep the light-command contrast fix; ensure dark-command and non-command dark both remain readable (`base.css` / command select rules).
- Modals / overlays: surfaces and text via `var(--bg-*)` / `var(--cmd-*)` / design-system Modal — no fixed white or navy panels.
- Charts: prefer `RechartsThemeConfig` / CSS `--chart-*` / `--status-*`; remove hardcoded series colors at call sites where they fight the theme.
- Gantt: chrome (grid, weekend, today line) via `--sbd-gantt-*` / `GANTT_*_VAR`; categorical phase bar hex may remain if contrast-checked and centralized.

## 5. Burn-down rules

### 5.1 Must tokenize

Any color used as **page/surface background, text, border, divider, input chrome, card/panel fill, or modal scrim** in `src/pages/**` or `src/components/**` must use theme tokens:

- `var(--bg-*)`, `var(--text-*)`, `var(--border-*)`, `var(--divider)`, `var(--accent*)`, `var(--status-*)`
- `var(--sbd-*)` / `.sbd-*` for legacy residual UI
- `var(--cmd-*)` / `.cmd-*` inside command skin

### 5.2 Allowlisted hardcoded color (must document reason nearby or in allowlist note)

- Centralized semantic stage/phase/BIC maps (e.g. `src/components/design-system/tokens.js` `PHASE_HEX`, drawing stage colors) **after** a dark-contrast check
- Brand / photo / SVG artwork assets
- Fixed categorical chart/gantt mark colors that are data encodings (prefer central module, not scatter)

### 5.3 Failure modes the audit must catch

- Light-only hex left on dark (white cards / dark text stuck in dark mode)
- Dark-only hex left on light (navy panels / `#fff` text stuck in light mode)
- Inherited dark text on light command surfaces (or the reverse) — command must keep explicit `color` on kit primitives
- `LayoutRoute` or other boot code forcing a theme
- Wrapping Control Centers in `.steelbuild-dark` / `.sbd-*` instead of `--cmd-*` remaps

## 6. Rollout batches

Foundation-first, then domains. Each batch: audit → fix → `lint` + CI typecheck gates + targeted vitest → commit. Do not grow strict/noImplicitAny ignore lists.

| Batch | Scope | Primary files / dirs |
| --- | --- | --- |
| 0 | Theme resolution | `ThemeContext.jsx`, `LayoutRoute.jsx`, Display tab copy if needed |
| 1 | Command dark map | `command.css`, `piece-control-command.css` as needed, `useCommandSkin.ts` only if required |
| 2 | Shell / nav / dashboard chrome | `Layout.jsx`, nav theme toggles, `dashboardTheme.css`, sidebar |
| 3 | Drawings / Detailing / Viewer | `src/components/drawings/**`, detailing CC panels, DrawingViewer chrome |
| 4 | Schedule / Gantt | `src/components/schedule/**`, `gantt/**`, `ganttTheme.js` |
| 5 | DMS / Documents | `src/components/dms/**`, documents pages |
| 6 | Submittals / RFIs residual | Modals/panels still on hex; registers already on command kit |
| 7 | Financials / reports / charts | financials components, report pages, Recharts call sites |
| 8 | Long tail | Field, admin, remaining pages; calculators verify-only (own shells) |
| 9 | Docs & claims | `AGENT_CLAIMS.md`, `AGENTS.md` / `CLAUDE.md` theme truth, close Phase 4 in light-rollout spec |

Batch order may adjust for concurrent claims, but **0 → 1 → 2** are sequential prerequisites.

## 7. Validation & success criteria

### Per batch

- `npm run lint`
- Typecheck gates used in CI (`typecheck`, `typecheck:js`, `typecheck:strict`, `typecheck:noimplicitany`) as applicable
- Targeted vitest for touched logic
- Grep: no new surface/text/border hex in touched files unless allowlisted
- Manual: toggle light↔dark on that domain’s Control Center + one residual surface; confirm light still looks correct

### Done when

1. No `sbp-theme` → UI follows `prefers-color-scheme`
2. Saved preference / toggle wins and survives reload
3. Every major Control Center renders coherently in dark (no light island, no invisible text)
4. Shell/nav/modals/charts/gantt chrome follow the active theme
5. Exhaustive hex/rgba audit closed or remaining values allowlisted with reason
6. Owner lock + contributor docs describe dual theme; light command is not deleted

## 8. Out of scope / non-goals

- Redesigning the light command kit layout or photography
- New accent brands beyond existing `data-accent` presets
- Replacing SteelBuild Dark with a third palette
- Force-fitting admin/calculator/long-tail pages into Control Center templates
- Deleting dark or SBD code paths
- Billing / marketing surface work unrelated to theme

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Regress light Control Centers again | Additive dark block only; per-batch light spot-check; keep `--cmd-*` as the kit API |
| Concurrent agents on `command.css` / `tokens.css` | Claim in `AGENT_CLAIMS.md`; batches 0–2 single-threaded |
| `!important` SBD overlay fights command dark | Command dark must set `--cmd-*` with sufficient specificity; prefer aliasing SBD vars rather than fighting overlay |
| Semantic hex fails AA on dark | Contrast check before allowlisting; bump centralized maps if needed |
| System preference flicker on first paint | Resolve theme as early as practical in `ThemeProvider` init (and optional tiny inline boot script only if flicker is proven) |

## 10. Doc / claim updates (Batch 9)

- Update `AGENT_CLAIMS.md`: retire “do NOT dark-theme command_ui”; replace with dual-theme maintenance rule.
- Annotate `2026-06-28-light-command-theme-global-rollout-design.md` Phase 4 as **un-deferred / superseded by this spec**.
- Correct `CLAUDE.md` / `AGENTS.md` theme paragraphs so agents do not reintroduce Iron Forge-only or light-only assumptions.

## 11. Approach summary

**Foundation-first, then domain burn-down** (chosen over big-bang or uncoordinated parallel tracks): unlock dual theme for all Control Centers early, then mechanically close the full-app color audit in reviewable commits.
