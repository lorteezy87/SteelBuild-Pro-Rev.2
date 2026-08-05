# Corrected-flow automated retest (Action plan ID 15)

**Ran:** 2026-07-24T19:59:07.299Z
**Result:** ✅ PASS (exit 0)
**Files:** 18 passed
**Tests:** 155 passed

Interactive staging UAT remains separate (IDs 102 / 110).

## Suites

| Area | Spec |
|---|---|
| Task persistence | `src/pages/schedule/__tests__/taskPersistence.test.ts` |
| Cost codes | `src/pages/costHub/__tests__/costCodeSave.test.ts` |
| Standard mutations | `src/lib/mutations/__tests__/standardMutation.test.ts` |
| Fab release gate | `src/lib/__tests__/fabReleaseGate.test.js` |
| Fab status | `src/lib/__tests__/fabStatus.test.js` |
| Shipping list parse | `src/lib/__tests__/importShippingList.test.js` |
| Production status import | `src/lib/__tests__/importProductionStatus.test.js` |
| Piece production hardening | `src/lib/pieceControl/__tests__/productionHardening.test.ts` |
| Piece reconciliation | `src/lib/pieceControl/__tests__/reconciliation.test.ts` |
| Model elements paging | `src/lib/ifc/__tests__/fetchAllModelElements.test.js` |
| Data exchange honesty | `src/lib/__tests__/dataExchange.test.js` |
| SharePoint sync honesty | `src/lib/dms/__tests__/sharepointSyncHonesty.test.ts` |
| Shipping list commit honesty | `src/lib/deliveries/__tests__/summarizeShippingListCommit.test.ts` |
| Submittal stage mapping | `src/lib/__tests__/submittalStageMapping.test.js` |
| Drawing upload utils | `src/lib/__tests__/drawingUploadUtils.test.js` |
| App security identity | `src/components/shared/__tests__/useAppSecurity.test.tsx` |
| PMA removal | `src/__tests__/pmaRemoval.test.ts` |
| Piece register wiring | `src/__tests__/pieceRegisterWiring.test.ts` |

## Notes

- Covers flows previously hardened in PRs #114–#120 (task persistence, cost codes, fab/shipping/piece sync, Sentry embed/CSP, auth identity, PMA removal).
- Re-run: `npm run test:corrected-flows`

