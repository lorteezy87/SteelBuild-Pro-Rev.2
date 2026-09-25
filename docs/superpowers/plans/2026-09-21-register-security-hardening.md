# Register and Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make selected-piece evidence usable in the Register and ship an enforcing CSP contract while preserving existing source permissions.

**Architecture:** The Piece Digital Thread gains an accessible inline-panel contract and command-skin CSS owned by the Piece Register. The static-assets header remains the sole production header definition; its parsed output is tested rather than source-grepped. Live controls remain separately verified operations.

**Tech Stack:** React 18, TypeScript, Vitest, Cloudflare Workers static-assets `_headers`.

**Spec:** `docs/superpowers/specs/2026-09-21-register-security-hardening-design.md`

## Global Constraints

- Do not deploy `email-ingest`; the owner performs that release.
- Do not delete a function, mutate Auth, mutate GitHub rules, or apply a database migration without current target evidence.
- Keep the CSP allowlist unchanged while changing only its enforcement mode.
- All command-skin styles stay scoped to `[data-skin="command"]` and use `--cmd-*` tokens.

## Review Focus

- A selected piece must remain understandable to keyboard and assistive-technology users; Task 1 adds a named detail-panel test.
- Long values must not force the Register to become an unbounded vertical document; Task 1 adds bounded, scrollable panel layout.
- An inline bootstrap script hash must remain valid under enforcing CSP; Task 2 recalculates it from `index.html`.
- Stripe, Supabase REST/realtime, weather, Sentry, analytics, and web-ifc must retain their reviewed sources; Task 2 preserves the exact policy value.
- A future live-control action must not be executed against an inferred target; Task 3 requires target-specific preflight evidence.

### Task 1: Bound the selected-piece Digital Thread

**Files:**
- Modify: `src/pages/pieceRegister/PieceDigitalThread.tsx`
- Modify: `src/styles/piece-control-command.css`
- Test: `src/pages/pieceRegister/__tests__/PieceDigitalThread.test.tsx`

- [ ] Write a failing component test that opens a `PieceDigitalThread` for `B12 · L2` and expects `getByRole("dialog", { name: "Piece digital thread: B12 · L2" })` with `aria-modal="false"`.
- [ ] Run `npx vitest run src/pages/pieceRegister/__tests__/PieceDigitalThread.test.tsx` and confirm it fails because the prior `<aside>` is only a complementary region.
- [ ] Add `role="dialog"`, `aria-modal="false"`, and an identity-bearing accessible name to the selected-piece `<aside>`.
- [ ] Add command-scoped panel, header, fact-grid, scroll, and wrapping rules to `piece-control-command.css`.
- [ ] Re-run `npx vitest run src/pages/pieceRegister/__tests__/PieceDigitalThread.test.tsx` and confirm every test passes.

### Task 2: Make the reviewed CSP enforceable

**Files:**
- Modify: `public/_headers`
- Modify: `scripts/__tests__/deployHeaders.test.ts`

- [ ] Change the header-contract test to require `Content-Security-Policy` and reject `Content-Security-Policy-Report-Only`; retain assertions for every current reviewed source and the recomputed inline-script hashes.
- [ ] Run `npx vitest run scripts/__tests__/deployHeaders.test.ts` and confirm it fails because the artifact remains Report-Only.
- [ ] Rename only the catch-all header in `public/_headers` to `Content-Security-Policy`; do not change directives or source origins.
- [ ] Re-run `npx vitest run scripts/__tests__/deployHeaders.test.ts` and confirm every test passes.

### Task 3: Preflight live-control hardening

**Files:**
- Verify: GitHub ruleset for `main` and `staging`
- Verify: Supabase Auth configuration for `kjrwqagyeswwoxpjkcko` and `ndyfjffsulfbwpmwdmic`
- Verify: staging Edge Function inventory for `ndyfjffsulfbwpmwdmic`
- Verify: PostgreSQL catalog and duplicate preflight for the requested FK/index/PK work

- [ ] Record the ruleset names, protected branches, pull-request/review requirement, and exact required status checks before changing a GitHub ruleset.
- [ ] Record leaked-password protection status and password policy from each Supabase Auth target before enabling it; verify a known-breached test password is rejected only in staging.
- [ ] Download and retain the staging function inventory before deleting `sheets-api` or any legacy function; verify each slug is deprecated and has no configured invocation/dependency.
- [ ] Capture `pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_serial_sequence`, and duplicate-count queries for every proposed `piece_events` or foreign-key change; author a migration only after the catalog and preflight results are captured.

## Verification

- `npx vitest run src/pages/pieceRegister/__tests__/PieceDigitalThread.test.tsx`
- `npx vitest run scripts/__tests__/deployHeaders.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
