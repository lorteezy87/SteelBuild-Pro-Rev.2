## 2026-07-27 final review fix pass

- Replaced all `var(--text-on-accent...)` usages under `src` with the defined `var(--on-accent)` token.
- Updated the 2026-06-28 light rollout spec so historical light-first context remains, while dark mode is marked complete via the 2026-07-27 dual-theme spec/plan.
- Verification:
  - `rg -n 'text-on-accent' src` -> zero matches.
  - `npm run lint` -> passed.
  - `npx vitest run src/components/dms src/pages/documents --passWithNoTests` -> 1 file passed, 39 tests passed.
