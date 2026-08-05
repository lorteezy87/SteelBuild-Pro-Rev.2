# strictNullChecks Ratchet (#8 Phase 2) — Design

Date: 2026-06-22 · Branch target: `main` · Owner session: opus-strict-ratchet

## Goal

Lock a **strictNullChecks** floor into CI so that new code and all currently-clean
`.ts/.tsx` files are enforced, without blocking on the legacy backlog. Burn down the
backlog aggressively in the same pass: fix every offender **except** the two monster
schedule pages, which are grandfathered behind an explicit, shrinkable ignore-list.

This is `strictNullChecks` **only**. `noImplicitAny` (a separate ~334-error backlog) is
an intentional future ratchet and is out of scope here.

## Current state (measured 2026-06-22, matches the 2026-06-20 handoff exactly)

- Base `tsconfig.json`: `strict:false`, `noImplicitAny:false`, `strictNullChecks:false`,
  `allowJs:true`, `checkJs:false` (so only `.ts/.tsx` are deep-checked).
- Enabling `strictNullChecks:true` surfaces **395 errors across 26 files**.
- `typescript-strict-plugin` is NOT installed. TypeScript is `^5.8.2`.

Distribution:

| Tier | Files | Errors |
|---|---|---|
| Monsters (grandfather) | `pages/ResourceScheduling.tsx` (120), `pages/GanttChart.tsx` (71) | 191 |
| Fix this pass | the other 24 files | ~204 |

## Mechanism (Approach B — chosen)

Plain `tsc` + a diagnostic-filter script. **No third-party dependency.**

- **`tsconfig.strict.json`** — `extends: "./tsconfig.json"`, sets only
  `compilerOptions.strictNullChecks: true`. Same `include`/`exclude` as base.
- **`scripts/strict-typecheck.mjs`** — spawns `tsc -p tsconfig.strict.json --noEmit`,
  captures stdout, parses `path(line,col): error TSxxxx` lines, drops any whose
  normalized file path is in a hard-coded `STRICT_NULL_IGNORE` array (initially the 2
  monsters), prints the survivors, and exits **1** if any survive, else **0**.
  - Also prints a notice (non-fatal) if a file in the ignore-list now produces **zero**
    errors — a nudge to remove it from the list (ratchet tightening).
  - Path normalization handles both `/` and `\` and relative/absolute forms so the
    ignore-list matches on Windows and CI (Linux).
- **`package.json`**: `"typecheck:strict": "node scripts/strict-typecheck.mjs"`.
- **Unit test** for the parser/filter (`scripts/__tests__/strict-typecheck.test.mjs` or
  a vitest file): given canned `tsc` output + an ignore-list, asserts correct
  survivor set and exit semantics. Pure-function core, no real `tsc` spawn in the test.

### Why B over the alternatives

- **`typescript-strict-plugin`**: a 3rd-party dep + TS 5.8 compat risk, overkill to
  manage a 2-file grandfather set. Editor squiggles aren't needed for a CI gate.
- **Naive strict tsconfig with the offenders in `exclude`**: rejected — `exclude` only
  controls *root* files; the offenders get pulled back into the program via imports
  (pages via `routes.js` dynamic `import()`, engines imported widely) and their errors
  resurface → gate red. The filter script is the robust answer.

## Scope of fixes this pass (the 24 files)

**Behavior-preserving** strict-null fixes only. No `@ts-ignore` / `@ts-nocheck` / blanket
`!` to paper over — those defeat the ratchet and can hide real bugs. Prefer narrowing,
guards, and correct annotations that match the existing runtime contract. The
JS→TS gotchas to expect: `useState(null)` / `useState([])` narrowing, untyped
`useMutation` mutationFns, and `TS2339` from too-loose inferred types.

Order (shared/imported-elsewhere first, because their type changes ripple):

1. **Shared engines / hooks / lib (direct, sequential):**
   `services/modelElementStatus.ts` (+its test), `services/constraintEngine.ts`,
   `services/scheduleCascade.ts`, `lib/submittalActionEngine.ts`, `hooks/usePlan.ts`,
   `hooks/useProjectId.ts`, `hooks/useDrawings.ts`, `pages/drawingSubmittalHub/format.ts`.
2. **Leaf page clusters (parallel fan-out, disjoint file sets, each verified for
   behavior-preservation):**
   - submittals: `Submittals.tsx`, `submittals/components.tsx`, `submittals/SubmittalFormModal.tsx`
   - deliveries: `Deliveries.tsx`, `deliveries/components.tsx`
   - workPackages: `WorkPackages.tsx`, `workPackages/components.tsx`
   - emailInbox: `EmailInbox.tsx`, `emailInbox/components.tsx`, `emailInbox/modals.tsx`
   - `Schedule.tsx`
   - `Procurement.tsx`
   - `FabRelease.tsx`
   - `DrawingSubmittalHub.tsx`
   - `ganttChart/components.tsx`

**Escape hatch:** if any single file becomes a risky refactor (a fix that can't be made
without changing runtime behavior), grandfather it into `STRICT_NULL_IGNORE` instead and
flag it — do not force an unsafe change.

## CI wiring (the risky part — done LAST)

Add `npm run typecheck:strict` to the `ci` job in `.github/workflows/ci.yml`, alongside
the existing lint / typecheck / typecheck:js / test / build steps. **Only after** local
`typecheck:strict` is green with every fix committed — so the first push carrying the
gate is already green and never blocks a legitimate deploy. (A red push can't reach prod
anyway; this also keeps it from blocking one.)

## Verification bar

- `typecheck:strict` → 0 surviving errors (2 files ignored).
- base `typecheck` + `typecheck:js` + `lint` → green (unchanged behavior).
- `npm test` (≈1579 tests) → green.
- `vite build` → green.

Type-level changes only; result is labeled **code/build-verified**. The two monster
pages are untouched. No runtime behavior change is intended; the test suite + build are
the guard, plus a per-file adversarial behavior-preservation review on the fan-out.

## Out of scope / follow-ups

- Burning down `ResourceScheduling.tsx` (120) + `GanttChart.tsx` (71) — later passes;
  remove each from the ignore-list as it reaches zero.
- `noImplicitAny` ratchet — separate future effort.
