---
name: strict-null-cluster-fixes
description: Behavior-preserving patterns for resolving strictNullChecks TS errors in .tsx page clusters (the .strict-work ratchet)
metadata:
  type: feedback
---

The strictNullChecks ratchet feeds per-cluster error lists from `.strict-work/<cluster>.txt`. Resolve ONLY listed errors, minimally and behavior-preservingly. Patterns that worked and passed review (cluster: workpackages, 2026-06-22):

**Why:** correctness is paramount — these screens drive real schedules/deliveries/fab. Fixes must be type-only; the only acceptable runtime delta is a previously-throwing null path becoming a guarded no-op (the prescribed TS2721/null-call guard).

**How to apply:**
- "Enriched" rows (e.g. WorkPackage after `buildWorkPackageMetrics` attaches `_signals`): the base type keeps the field OPTIONAL (raw stubs assigned elsewhere, e.g. `editingWP`), but views/cards only ever get enriched rows. Add a sibling `interface EnrichedX extends X { _signals: ... }` in `types.ts`, switch the metrics arrays (`enriched`, `highRisk`, …) + the view/card props to `EnrichedX[]`. Resolves every `_signals is possibly undefined` without per-access guards. Safe because callers pass `any`/subtype.
- Untyped `.jsx` components consumed from `.tsx` whose destructured `= []` prop defaults make TS infer `never[]` props (TS2322 "...[] not assignable to never[]"): cast at import with the file's existing boundary pattern — `const Foo = FooRaw as unknown as ComponentType<AnyProps>` (`AnyProps = PropsWithChildren<Record<string, unknown>>`). NOT `as any`. Removable once those components are typed.
- Nullable handler props called directly (TS2721 "invoke possibly null"): use optional chaining `onEdit?.(wp)`. The button still renders (wrapper arrow is truthy); null handler click becomes a no-op instead of throwing.
- `let x = null` later assigned numbers (TS2322): annotate `let x: number | null = null`; downstream `let y = x` inherits the union and narrows correctly inside `if (y != null)` guards (even inside a `.map` closure block).
- `string | null` into a `string | undefined` field: `?? undefined`.
- Dialog `onConfirm={() => mut.mutate(target.id)}` where `target` is `X | null` and `.id` is `string | undefined`: wrap `if (target?.id) mut.mutate(target.id)`.

FORBIDDEN (review rejects): `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`, `as any`, `as <T>` to assert away null, bare `!` on a genuinely-nullable value, and any change to defaults/comparisons/arithmetic/dates/sort/control-flow.
