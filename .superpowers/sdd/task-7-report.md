# Task 7: Schedule / Gantt burn-down report

## Status
- Complete.

## Inventory
- Initial gate: raw color matches in 18 files, led by `ScheduleGantt.jsx:35`, `rivetBriefStyles.js:24`, and `ganttTheme.js:22`.
- Final gate: `src/lib/ganttTheme.js:16`.
- Remaining matches are only `GANTT_PHASE_HEX` and `GANTT_GRADIENT` categorical phase encodings, per the brief allowlist.

## Changes
- Added `GANTT_*_VAR` chrome exports in `src/lib/ganttTheme.js`.
- Replaced schedule/Gantt panel, grid, row, today, dependency, modal, drawer, toolbar, and context-menu chrome with CSS vars or token-based `color-mix()`.
- Converted status/today theme exports to token-backed values after removing schedule-only hex-alpha suffix composition.

## Verification
- `npm run lint`
- `npx vitest run src/components/schedule src/components/gantt src/lib --passWithNoTests`
- `npm run build`
- `rg -n '#[0-9a-fA-F]{3,8}|rgba?\(' src/components/schedule src/components/gantt src/lib/ganttTheme.js --glob '!**/__tests__/**' -c | sort -t: -k2 -nr`
- `git diff --check`

## Concerns
- No functional concerns found.
- Status color constants keep the historical `GANTT_STATUS_HEX` export name for compatibility, but now resolve to token vars.

## Review fix addendum — 2026-07-27
- Added light-theme `--sbd-gantt-*` counterparts in both `[data-theme="light"]` and `.steelbuild-light`.
- Replaced `ScheduleGantt.jsx` delivery/critical chrome `GANTT_PHASE_HEX` usage with `GANTT_PHASE_VAR` + `color-mix()`.
- Replaced `color-mix(... black ...)` in `rivetBriefStyles.js` and `scheduleGanttBars.jsx` with theme-token mixes.
- Added `ganttThemeReviewFixes.test.ts` to guard the review findings.
- Verification: `npx vitest run src/components/schedule/__tests__/ganttThemeReviewFixes.test.ts`; `npx vitest run src/components/schedule/__tests__/ganttThemeReviewFixes.test.ts src/components/schedule/__tests__/scheduleGanttHelpers.test.js src/components/schedule/__tests__/rivetBriefHelpers.test.js src/components/schedule/__tests__/rivetBriefEngine.test.js src/lib/__tests__/detailingSchedule.test.js`; `npm run lint`.
