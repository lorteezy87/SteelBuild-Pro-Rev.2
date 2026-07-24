# TypeScript conversion standard (SteelBuild Pro)

**Goal:** one development standard that moves the most important code toward TypeScript **with real types** — not “rename every file to `.tsx`.”

A `.tsx` file filled with `any` is not meaningfully safer than `.jsx`.

## New code (mandatory)

| Kind | Extension |
|---|---|
| React component / page | `.tsx` |
| Hook | `.ts` (or `.tsx` if it returns JSX) |
| Service / API / database logic | `.ts` |
| Utility / calculation / lifecycle | `.ts` |
| Shared type definitions | `.ts` |
| Tests | `.test.ts` / `.test.tsx` |

**No new `.js` / `.jsx` files** without a documented reason in the PR (exception: generated/vendored assets, Vite config plugins already in JS, or a temporary shim that re-exports a converted module for one release).

## Typing rules

- Prefer generated Supabase types (`src/types/supabase.ts`) + **domain interfaces** in the same module or `src/types/`.
- Keep **DB payload types** separate from **UI view models**.
- Avoid `any`. Prefer `unknown` + narrowing, or explicit domain shapes.
- Validate imported external data (spreadsheets, IFC, CSV) at runtime at the parser boundary; typed outputs after validation.
- Do not bury business logic inside large page components — extract pure `.ts` helpers first, then type them.

## When to convert an existing file

Convert when the file is **actively refactored**, **frequently changed**, **bug-prone**, **passes complex data**, **handles mutations**, or **owns calculations / lifecycle transitions**.

### Convert first (priority)

- Piece Register / piece-control domain
- Drawing + submittal lifecycle
- Fabrication releases
- Work packages
- Production + shipping
- Change orders + financial calculations
- Permissions + project-scoping
- Import + reconciliation services

### Convert later

- Static landing sections
- Simple presentational UI
- Icons / decorative components
- Pages scheduled for removal
- Stable UI with little business logic

## Phased rollout

1. **Stop adding new `.js` / `.jsx`** (enforced by `scripts/check-no-new-js.mjs` on CI / pre-push).
2. **Convert shared types, status definitions, DB helpers, mutation helpers.**
3. **Convert each major workflow when it is already being repaired.**
4. **Increase strictness gradually** (`typecheck:strict` / `typecheck:noimplicitany` ratchets — shrink ignore lists, never grow them).
5. **Convert remaining low-risk UI only when beneficial.**

## Enforcement

- `npm run check:no-new-js` — fails if tracked `.js`/`.jsx` under `src/` were **added** vs `main` without an allowlist entry.
- Existing JS remains until converted intentionally; do not mass-rename.

## Related

- Folder ownership: `docs/architecture/folder-ownership.md`
- CI type gates: `npm run typecheck`, `typecheck:strict`, `typecheck:noimplicitany`
