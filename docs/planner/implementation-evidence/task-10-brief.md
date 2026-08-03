### Task 10: Add deployment configuration, runbook, browser tests, and full core validation

**Files:**
- Create: `vercel.planner.json`
- Create: `docs/runbooks/planner-pwa.md`
- Create: `e2e/planner-core.spec.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: reproducible staging/production build, owner checklist, and end-to-end verification.

- [ ] **Step 1: Write the failing Planner E2E contract**

Cover authenticated fixtures for sign-in boundary, Task Register load, New Task, date confirmation, 48-Hour Gate, filters, bulk completion, archive, and logout cache clearing. Use mocked/local Supabase responses unless a dedicated authenticated staging account is explicitly provided.

- [ ] **Step 2: Add Vercel configuration**

Set build command `npm run build:planner`, output `dist-planner`, immutable hashed-asset headers, security headers matching the main app, and SPA rewrites that exclude assets and service-worker files.

- [ ] **Step 3: Write the runbook**

Document local commands, required browser-safe env values, Supabase redirect URL owner steps, Vercel project setup, staging/production PWA checks, service-worker cache-version rules, migration order, rollback, and the explicit prohibition on service-role keys.

- [ ] **Step 4: Run the complete core gate**

Run in order:

```text
npm run test:planner
npm run typecheck:planner
npm run lint
npm run typecheck
npm run typecheck:js
npm run typecheck:strict
npm run typecheck:noimplicitany
npm test
npm run build
npm run build:planner
```

Expected: every command passes. If a full-repository failure is pre-existing, capture the exact command/output and prove all Planner-focused checks pass; do not claim the full gate passed.

- [ ] **Step 5: Run browser/PWA verification**

Verify the accepted desktop viewport first, then tablet and mobile. Verify install manifest, service-worker registration on a built preview, offline shell load, cached snapshot labeling, core click paths, keyboard navigation, and no console errors.

- [ ] **Step 6: Perform visual fidelity review**

Compare the accepted reference and final browser screenshot with `view_image`. Record at least five comparison points: shell geometry, navigation density, toolbar copy/order, table columns/row density, palette/risk tints, typography, and responsive behavior. Fix every material mismatch before handoff.

- [ ] **Step 7: Record final validation and stop before commit/deploy**

Summarize files changed, validations, remaining limitations, migration/deployment owner steps, and unrelated repository state. Do not stage, commit, push, apply remote migrations, or deploy without explicit user authorization.
