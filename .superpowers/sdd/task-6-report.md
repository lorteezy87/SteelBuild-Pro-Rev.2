# Task 6 Report: Drawings / Detailing / DrawingViewer burn-down

## Scope
- Audited and tokenized hardcoded surface/text/border colors under:
  - `src/components/drawings/**`
  - `src/pages/drawingViewer/**`
  - `src/pages/drawingSubmittalHub/**`
  - `src/components/design-system/tokens.js` for centralized stage/BIC allowlist comments

## Inventory
Command run:

```bash
rg -n '#[0-9a-fA-F]{3,8}|rgba?\(' src/components/drawings src/pages/drawingViewer src/pages/drawingSubmittalHub --glob '!**/__tests__/**' -c | sort -t: -k2 -nr | head -40
```

Top offenders before tokenization:

```text
src/components/drawings/DrawingsTable.jsx:38
src/pages/drawingViewer/drawingViewerStyles.js:31
src/components/drawings/viewer/ProposalPanel.jsx:30
src/components/drawings/viewer/ZoneLayer.jsx:26
src/components/drawings/viewer/AnnotationLayer.jsx:26
src/components/drawings/RevisionUploadModal.jsx:21
src/pages/drawingViewer/ZonesFloatingToolbar.jsx:19
src/components/drawings/viewer/zonePanel/zonePanelConstants.js:19
src/pages/drawingSubmittalHub/format.ts:15
src/components/drawings/RevisionCompareModal.jsx:14
```

## Tokenization completed
- Centralized drawing stage tokens in `src/components/design-system/tokens.js`; `drawingsConfig.js` now derives `STAGES` and `RR_STAGE` from that map.
- Added contrast-check allowlist comments for centralized BIC and drawing-stage maps in `tokens.js`.
- Routed Detailing Command Hub aliases in `drawingSubmittalHub/format.ts` to `--cmd-*` tokens.
- Replaced command hub locked/severity/expanded-row chrome with `--cmd-*`.
- Replaced non-command accent button foreground literals with `--on-accent`.
- Tokenized DrawingViewer chrome custom props and export button surface/border literals while preserving canvas/PDF work-surface colors.
- Tokenized obvious status/info/warn/success literals in drawing toolbar, revision upload/review, revision compare, and revision impact surfaces.

## Grep gate
Command run:

```bash
rg -n "background:\s*['\"]#|color:\s*['\"]#|border(?:Color)?:\s*['\"]#" src/components/drawings src/pages/drawingViewer src/pages/drawingSubmittalHub --glob '!**/__tests__/**' | head -200
```

Final scoped counts:

```text
src/pages/drawingSubmittalHub: No matches
src/pages/drawingViewer/ZonesFloatingToolbar.jsx:2
src/components/drawings/RevisionCompareModal.jsx:3
src/components/drawings/SignoffStampPanel.jsx:7
src/components/drawings/viewer/ZonePanel.jsx:1
src/components/drawings/viewer/zonePanel/AiSuggestModal.jsx:4
src/components/drawings/viewer/ZoneLayer.jsx:11
src/components/drawings/viewer/ViewerHeader.jsx:3
src/components/drawings/viewer/ProposalPanel.jsx:9
src/components/drawings/viewer/AnnotationLayer.jsx:6
src/components/drawings/DrawingsTable.jsx:9
```

## Remaining allowlisted hits
- `ZonesFloatingToolbar.jsx`: proposal count cyan badge on the drawing canvas overlay.
- `SignoffStampPanel.jsx`: signoff disposition semantic status map.
- `ProposalPanel.jsx`: proposal lifecycle semantic map and modal action status colors.
- `AnnotationLayer.jsx`: stamp/annotation ink colors and in-canvas annotation label ink.
- `RevisionCompareModal.jsx`: revision comparison work-surface plus PDF/canvas paper `#fff`.
- `AiSuggestModal.jsx`: AI suggestion cyan accent/selection affordance.
- `DrawingsTable.jsx`: AI extraction, locked/revision, and stage/status semantic badge colors.
- `ZonePanel.jsx`: AI suggestion semantic accent.
- `ZoneLayer.jsx`: zone overlay fill/border and proposal overlay ink.
- `ViewerHeader.jsx`: approval/locked workflow semantic text colors.

## Verification
- `git diff --check` — clean.
- `npm run lint` — passed.
- `npx vitest run src/components/drawings src/pages/drawingViewer --passWithNoTests` — 20 files, 184 tests passed.

## Review fix pass — 2026-07-27
- Replaced semantic `--on-accent` misuse on zone AI suggestion/apply buttons with tinted outlined status-color controls, preserving cyan/green/amber encodings without white text on light fills.
- Tokenized remaining `DrawingsTable.jsx` badge/link/row chrome surface, text, and border literals to status/accent/text CSS variables.
- Tokenized the `ZonesFloatingToolbar.jsx` pending proposal count badge surface/text to accent tokens while leaving canvas/tool ink unchanged.
- Added explicit `// semantic ... — allowlisted` comments for local signoff/proposal/zone mark palettes and centralized `OverviewTab.jsx` status color lookup on the allowlisted zone constants.
- Re-ran `git diff 4575aea11530222e23678d9004f57e0100df8b9a..HEAD -- '*.tsx' '*.jsx' | rg 'sbd-' || true` — no Task 6 JSX/TSX `sbd-*` additions found; pre-existing classes were left intact.
- `npm run lint` — passed.
- `npx vitest run src/components/drawings src/pages/drawingViewer --passWithNoTests` — 20 files, 184 tests passed.
