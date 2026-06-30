# Detailing Control Center — Panel Light-Palette Port

- **Date:** 2026-06-30
- **Status:** Implemented (CSS) — pending owner field-verify, then merge/deploy
- **Branch:** `claude/command-ui-detailing` (worktree off `origin/main`)
- **Supersedes:** `2026-06-30-detailing-control-center-reskin-design.md` + its SP1 plan, which were drafted against a **stale local checkout** that lacked the shipped command shell. Those are obsolete — see "Course correction" below.

---

## Course correction (why this replaces the earlier plan)

The earlier spec/plan assumed the Detailing hub was **not** on the command_ui kit and set out to build a `DrawingSubmittalControlCenter` shell (foundation + KPI + tab nav). That was wrong: it was drafted against a local checkout ~15 commits behind `origin/main`. On the **real base**, the shell is already shipped:

- `1b25876d feat(command-ui): Detailing Control Center shell re-skin behind command_ui (tabs/panels/modals/escalation preserved)`
- `src/pages/drawingSubmittalHub/DetailingCommandShell.tsx` — `useCommandSkin()` + `PageHero` + `KpiStrip` + command-styled tab strip, gated at `DrawingSubmittalHub.tsx` `if (commandUi)`.

So the foundation/shell already exists. Building it would have duplicated shipped code. The **real** remaining gap is the panels *inside* the shell.

## The actual gap

The shell re-skin "preserved" the existing tab panels — it dropped them, unchanged, into `<div className="detailing-cc">`. Those panels are built on the **desktop kit**: `SectionCard`→`desk-section-card`, `StatusPill`→`desk-status-pill` (12 tones), `desk-table`, `desk-btn-*`, `desk-state`, `desk-skeleton` — all defined **only under `[data-skin="desktop"]`** (`src/styles/desktop.css`). Plus inline `var(--theme)` tokens.

The hub runs under `[data-skin="command"]`, **not** `"desktop"`. Consequences:
1. Every `desk-*` rule fails to match → cards, status pills, tables, buttons, empty/loading states render **unstyled** (no surface, border, or chip color).
2. Inline `var(--text-*)`/`var(--bg-*)` tokens resolve to the **global** dark/light theme → on the light command island, text is dark-on-light (light theme) or invisible light-on-light (dark theme).

Net: the polished light shell sits over chrome-less, mis-colored panels. That is the "unfinished" look.

## The fix (this change)

A single, self-contained, **CSS-only** addition to `src/styles/command.css`, scoped to `.detailing-cc`:

1. **(a) Token alias** — every theme var the panels consume (`--text-*`, `--bg-*`, `--border-*`, `--accent`, `--status-*` + legacy `--success/--warning/...`-muted/-border) → the kit's light palette (`--cmd-*`). Forces light regardless of `data-theme` (the kit is always-light by design).
2. **(b) `desk-*`/`sbd-*` chrome re-declaration** for the command scope — `desk-section-card` (+head/body), `desk-status-pill` (12 tones → 4 kit semantic chips), `desk-table`, `desk-btn-*`, `desk-state`, `desk-skeleton`, `sbd-card`/`sbd-card-strong` inset shadows, `sbd-badge-info`, `sbd-btn-*`. Layout mirrors `desktop.css`; colors are kit-light.

Everything is scoped to `[data-skin="command"] .detailing-cc`, so it never affects the sidebar/topbar chrome or any other Control Center, and it is fully revertable (one CSS block). No component/logic edits → no conflict with the in-flight `components.tsx` work; behavior-preserving.

## Covered / deferred

**Covered:** all panel cards, status/severity pills, tables, buttons, empty + loading states, badges, and all inline-token-styled content (TriageBoard metric tiles, inline editors, Sequence Readiness, Revision Impact, Model Mapping) across the Control Board, Drawing Register, Approval Matrix, Revision Impact, Process Board, and Doc Control tabs.

**Deferred (follow-ups, flagged for the owner):**
- **Modals** (Escalate, Lead Times, Revision Compare, Revision Summary, RFI form, Model import) — they portal to `document.body`, **outside** `.detailing-cc`, so this alias doesn't reach them. They need a separate `cmd-dialog`-scoped pass. (Owner's directive was "make panels match the kit"; modals are the next slice.)
- **Inline health/severity hexes** (`#2EA043`/`#F85149`/`#D29922`/`#F0883E` in `components.tsx`) — saturated hues that read fine on light; left as-is. A light-palette health map in `format.ts` is a nicety, not required.
- **Hard-white loading spinner** (`components.tsx` ~1388/1395, `#fff`) — invisible on light during a transient loading state; a 2-line component fix (`currentColor`/token) deferred to avoid touching the concurrently-edited `components.tsx`.
- **Typography** — the panels' dense mono-uppercase labels are kept (a deliberate industrial choice). Refining them toward the kit's cleaner type is a separate judgment call for the owner.

## Validation

- **Build:** `vite build` green (CSS-only; appended valid CSS).
- **Field-verify (REQUIRED — moat, CLAUDE.md §32):** owner runs `npm run dev` in this worktree, opens the Detailing Control Center with `command_ui` on, and checks **all tabs** in **both** dark and light global theme:
  - Cards have a white surface + light border + subtle shadow (not chrome-less).
  - Status/severity pills are filled light chips (not bare text); tones read correctly (overdue=red, at-risk=amber, in-review=blue, fab-ready=green).
  - Register/Matrix tables have light headers, dividers, hover.
  - Triage metric tiles, inline owner/due editors, Sequence Readiness bars, Revision Impact rows, Model Mapping — all dark-text-on-light, legible.
  - Empty + loading states legible. Buttons gold-primary / light-secondary.
  - The KPI strip + hero + tab strip (already shipped) are unchanged.
  - **Known-deferred:** modals still themed/dark; that's expected (next slice).

Until the owner confirms, this is **code-verified, NOT field-verified**.
