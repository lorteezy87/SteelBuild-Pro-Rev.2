# PR supersede hygiene

When the user sends `prNN` / `prNN failed`, treat it as: diagnose → extract real
delta vs current `main` → re-land clean branch → open superseding PR → close original.

## Steps

1. `gh api …/pulls/N` for state, head, body; `gh run list` for CI failure class.
2. Compare branch tip files to `main` (`git show origin/branch:path` vs local main).
   - If already merged or fully on main → report only, no new PR.
   - If CI green but **behind** → cherry-pick onto current main and supersede.
3. Port **only unique product delta**. Drop merge-train noise and already-landed pieces.
4. Local verify **before** push:
   - focused Vitest
   - `npm run typecheck`
   - `npm run typecheck:strict`
   - `npm run typecheck:noimplicitany`
   - `eslint` on touched files if lint was the fail class
5. Branch name: `fix/supersede-prN-…`. Close original with comment pointing at new PR.
6. Disk: `/tmp` clones fill the 20G volume fast — `rm -rf /tmp/sbp-*` between sessions.

## Supersede chain examples (Aug 2026)

| Original | Failure | Supersede (landed or open) |
|---|---|---|
| #164 link RPC | dirty | #229 client PGRST202 fallback |
| #182 Fab colors | partial | #232 remaining Relationships/release/UX |
| #39/#223 module gates | lint `visibleGroups` | #233 |
| #154/#228 event glue | strictNull then noImplicitAny | #235 → #239 |
| #166/#230 Tier 1 | behind | #236 (merged) |
| #178/#231 opaque menus | theme test color-mix | #237 (merged) |
| #131/#226/#234 Package Board | tsc → strictNull → noImplicitAny | #238 → #240 |
| #146 SOV | clean | #227 (merged) |
