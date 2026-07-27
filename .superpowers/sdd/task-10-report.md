### Task 10 Report: Financials / reports / charts

**Status:** Complete.

**Scope completed**
- Added resilient fallback token support to `getChartTheme()` so missing `--chart-*` variables no longer produce empty Recharts/SVG colors.
- Updated financial/report/cost chart call sites to use `getChartTheme()` for series, palette, axes, grid strokes, and tooltip surfaces.
- Tokenized report/financial runtime color leaks across KPI cards, status matrices, chart panels, score badges, print styles, and calculated financial fields.
- Preserved the command-ui `costHub` light surface intent; only chart colors/tooltip/axis values were updated there.
- Added `src/components/shared/__tests__/RechartsThemeConfig.test.ts` for the chart fallback behavior.

**Inventory**
- Initial brief inventory found hardcoded hexes in:
  - `src/pages/reports/PortfolioOverview.jsx`
  - `src/pages/costHub/CostChartRow.tsx`
  - `src/components/financials/CostCodeFormModal.jsx`
  - `src/pages/reports/ProjectStatusMatrix.jsx`
  - `src/pages/reports/RevenueDashboard.jsx`
  - `src/pages/reports/Profit.jsx`
  - `src/pages/reports/ExecutiveSummary.jsx`
  - `src/pages/reports/RichEmptyState.jsx`
  - `src/pages/reports/ReportShell.jsx`
  - `src/pages/reports/ProjectStatusGantt.jsx`
  - `src/pages/reports/ProjectDetails.jsx`
  - `src/pages/reports/KPICard.jsx`
- Final inventory command returned no output for non-test target paths:
  `rg -n '#[0-9a-fA-F]{3,8}' src/components/financials src/pages/reports src/pages/Reports.jsx src/pages/costHub --glob '!**/__tests__/**' -c | sort -t: -k2 -nr`

**Verification**
- RED: `npx vitest run src/components/shared/__tests__/RechartsThemeConfig.test.ts` failed before implementation because `chart1` was `""` instead of `var(--accent)`.
- GREEN: `npx vitest run src/components/shared/__tests__/RechartsThemeConfig.test.ts` passed.
- `npm run lint` passed.
- `npm run check:no-new-js` passed.
- `npm run build` passed; Vite emitted the existing large chunk warning.
- `npm test` ran 3,505 tests: 3,504 passed, 1 failed in `src/__tests__/components/ConstraintsExpenses.test.jsx` because `Constraints` remained on its loading skeleton and did not render `Constraint Log`. The same file fails when run alone and is outside the Task 10 diff.

**Concerns**
- Full Vitest suite is not green due to the deterministic, unrelated `ConstraintsExpenses.test.jsx` failure described above.

**Review fix (pie category colors)**
- Restored stable per-category pie coloring in `CostChartRow` via `getCategoryPieColor()` (`costChartColors.ts`): known categories map to `chartTheme.colors.*` / `text.muted` tokens; unknown names fall back to palette index.
- Tests: `npx vitest run src/pages/costHub/__tests__/costChartColors.test.ts src/components/shared/__tests__/RechartsThemeConfig.test.ts` — 3 passed; `npm run lint` — clean.
- Commit: `fix: restore cost hub pie category color mapping with theme tokens`
