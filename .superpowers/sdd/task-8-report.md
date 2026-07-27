# Task 8 Report: DMS / Documents burn-down

## Scope
- Tokenized hardcoded DMS/Documents chrome under:
  - `src/components/dms/**`
  - `src/pages/documents/**`
  - `src/pages/Documents.jsx`

## Inventory
Command run:

```bash
rg -n '#[0-9a-fA-F]{3,8}|rgba?\(' src/components/dms src/pages/documents src/pages/Documents.jsx --glob '!**/__tests__/**' -c | sort -t: -k2 -nr
```

Top offenders before tokenization:

```text
src/components/dms/DocumentCard.jsx:41
src/components/dms/DocumentDetailPanel.jsx:23
src/components/dms/dmsConstants.js:23
src/pages/documents/utils.js:19
src/components/dms/DocumentLeftPanel.jsx:14
src/pages/documents/BatchActionBar.jsx:8
```

Final scoped inventory:

```text
No matches.
```

## Tokenization completed
- Replaced file-type, category, linked-entity, and status badge literals with semantic `--status-*`, `--accent-*`, `--info-*`, `--warning-*`, `--danger-*`, and surface/text tokens.
- Replaced document modal scrims, dropdown shadows, selected checkboxes, destructive confirmations, and drag-drop overlays with tokenized `color-mix()`, `--shadow-*`, and `--cmd-*` values.
- Updated command-skinned Documents Control Center chrome to use `--cmd-gold` and `--cmd-text`.

## Grep gate
Command run:

```bash
rg -n "background:\s*['\"]#|color:\s*['\"]#|border(?:Color)?:\s*['\"]#" src/components/dms src/pages/documents src/pages/Documents.jsx --glob '!**/__tests__/**'
```

Result:

```text
No matches.
```

## Verification
- `git diff --check` — passed.
- `npm run lint` — passed.
- `npx vitest run src/pages/documents src/components/dms --passWithNoTests` — 1 file, 39 tests passed.
