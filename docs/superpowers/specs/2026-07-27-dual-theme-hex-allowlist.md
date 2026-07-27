# Dual-theme hex allowlist ledger

Task 11 inventory scope:

```bash
rg -n '#[0-9a-fA-F]{3,8}' src/pages src/components --glob '!**/__tests__/**' --glob '!**/design-system/tokens.js' -c | sort -t: -k2 -nr | head -80
rg -n "background:\s*['\"]#|color:\s*['\"]#|border(?:Color)?:\s*['\"]#" src/pages src/components --glob '!**/__tests__/**' --glob '!**/design-system/tokens.js' | wc -l
```

Closing chrome gate after Task 11: `0`.

| Path / scope | Hex | Reason |
| --- | --- | --- |
| `src/pages/Landing.jsx` | `C.*`, fixed marketing washes | Public landing page uses a deliberately light executive brand palette; remaining hex is centralized under `C` or non-chrome decorative washes. |
| `src/pages/dashboard/dashboardTheme.css` | `.dashboard-reference-shell` palette | Reference dashboard has a light palette token block plus an explicit SteelBuild Dark remap; these are local token definitions, not inline chrome leaks. |
| `src/pages/{Privacy,Terms,Security,Subprocessors}.jsx`, `src/components/nav/BrandLogo.jsx` | static legal / logo palettes | Standalone legal and brand-logo surfaces use fixed brand art direction outside app chrome. |
| `src/components/drawings/viewer/**`, `src/pages/drawingViewer/**` | annotation, zone, stamp, PDF matte hex | Drawing viewer hex encodes sheet ink, stamps, zone categories, dependency arrows, and white PDF/canvas page backgrounds. |
| `src/components/drawings/Revision*.jsx`, `src/components/drawings/Revision*.tsx` | revision severity / diff tints | Revision compare and summary colors are semantic diff encodings (removed/added/severity), not surface chrome. |
| `src/pages/drawingSubmittalHub/**`, `src/pages/emailInbox/**`, dashboard portfolio/chart helpers | status/category palettes | Remaining hex is categorical status or chart color data that must stay visually distinct from theme chrome. |
| `src/components/settings/DisplayTab.jsx` | accent swatches | User-selectable accent preview swatches intentionally display their literal choices. |
| `src/pages/dashboardCC/**`, `src/pages/*ControlCenter.tsx`, `src/components/commandcenter/**` | command_ui palettes | Owner-locked command_ui/reference light surfaces retain fixed or local command tokens with dark remaps where available. |
| `src/components/calculators/**`, `src/pages/*Calculator.jsx` | calculator shells | Verify-only per brief; no contrast regression found in the closing chrome gate. |
| `src/components/design-system/PhaseChevron.jsx`, `src/components/design-system/Button.jsx`, phase/status helpers | phase/status literals | Semantic phase chips and button contrast constants are data encodings; `tokens.js` remains excluded by inventory. |
