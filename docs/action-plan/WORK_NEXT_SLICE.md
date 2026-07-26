# Action-plan next slice — Inspections + ProductionNotes fetch/create

**Branch / PR:** `cursor/action-plan-field-loading-d3a1`  
**Dates:** 2026-07-26  
**Prior prod:** #133–#137 deployed (`dpl_3HLTVWMirhvfe7rASEc6XPBmpKyL`)  
**Open siblings:** #139 · #140 · #141

## Code (IDs 18 / 50)

| File | Change |
|---|---|
| `Inspections.jsx` | INLINE `LoadingSkeleton` + error/retry + existing empty (Safety twin) |
| `ProductionNotes.jsx` | `ProductionNote.create(withProjectId(data, data.project_id))` + skeleton/error gate |

## Still open

- Merge #139 / #140 / #141
- ActionItems ControlCenter loading prop plumbing
- Large page thins 21 / 23 / 27
- Concurrent-edit E2E (52)
- **Blocked:** 102

## Validation

```bash
npx vitest run src/lib/mutations/__tests__/standardMutation.test.ts
npx eslint src/pages/Inspections.jsx src/pages/ProductionNotes.jsx --quiet
```
