# Sites v18 GitHub Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GitHub `main` contain the production-specific source delta used by live Sites version 18 without replacing newer application, security, or database work.

**Architecture:** Treat Sites commit `9a1cf8d9a22647e4d6cb8ca1dd505aff6f60ea68` as deployment provenance, not as a mergeable branch, because its snapshot history is unrelated to GitHub `main`. Port only the hosting contract and current hero presentation onto current `main`, then prove the resulting build contains the same hero bytes served by production.

**Tech Stack:** Vite, React 18, TypeScript, Vitest, Sites static hosting

**Spec:** `docs/superpowers/specs/2026-10-08-sites-hosting-migration-design.md`

## Global Constraints

- Preserve the production Supabase backend, runtime environment variables, RLS, Storage, RPCs, Edge Functions, and Stripe workflows.
- Do not merge or copy the unrelated Sites snapshot tree wholesale.
- Keep privileged values and runtime credentials out of tracked files.
- Preserve the live Sites project ID `appgprj_6a586bd122e48191baf2041322b2325d` and static output directory `dist`.
- Preserve the exact enhanced hero bytes from Sites v18 with SHA-256 `120F1B961692A77EF2F02454F62CCAA4E61F3F69F9496BE47E1AD8659C719BE9`.
- Do not change database migrations or production infrastructure.

## Review Focus

- Hosting manifest accidentally includes environment values or secrets; it must contain only project identity and `static.directory`.
- GitHub build references an image not tracked by Git, producing a broken landing hero.
- The copied image differs from the live production artifact despite the same filename.
- Responsive desktop or mobile crop reintroduces the blurry/off-center presentation.
- Broad snapshot reconciliation rolls back newer `main` functionality; the final diff must remain limited to the declared files.

---

### Task 1: Track the Sites hosting contract

**Files:**
- Create: `.openai/hosting.json`
- Create: `scripts/__tests__/sitesHosting.test.ts`

**Interfaces:**
- Consumes: Vite production output at `dist`.
- Produces: A source-controlled mapping from this repository to the existing Sites project.

- [ ] **Step 1: Write the failing hosting contract test**

Assert that `.openai/hosting.json` exists, contains the exact project ID, declares `{ "directory": "dist" }`, and contains no environment or credential keys.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/__tests__/sitesHosting.test.ts`

Expected: FAIL because `.openai/hosting.json` does not exist.

- [ ] **Step 3: Add the minimal hosting manifest**

Create `.openai/hosting.json` with only `project_id` and `static.directory`.

- [ ] **Step 4: Run the focused test**

Run: `npx vitest run scripts/__tests__/sitesHosting.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat: track SteelBuild Sites hosting contract`

### Task 2: Port the exact Sites v18 hero presentation

**Files:**
- Create: `public/marketing/photos/steelbuild-hero-user-enhanced.png`
- Modify: `src/components/landing/MarketingLanding.tsx`
- Modify: `src/styles/marketing-landing.css`
- Create: `src/components/landing/__tests__/MarketingLandingHero.test.tsx`

**Interfaces:**
- Consumes: Exact enhanced hero bytes from Sites v18.
- Produces: A tracked landing-page image reference and centered desktop/mobile crop.

- [ ] **Step 1: Write the failing hero provenance test**

Assert that `MarketingLanding.tsx` references `/marketing/photos/steelbuild-hero-user-enhanced.png`, the file hash equals the production SHA-256, the alt text identifies an active construction site, and both responsive crop declarations use `object-position:center center`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/landing/__tests__/MarketingLandingHero.test.tsx`

Expected: FAIL because current GitHub `main` still references the previous WebP hero and the enhanced file is absent.

- [ ] **Step 3: Port the minimum production delta**

Copy the exact binary asset from Sites v18, update the hero `<img>` source/dimensions/alt text, and center the desktop and mobile crop declarations.

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run scripts/__tests__/sitesHosting.test.ts src/components/landing/__tests__/MarketingLandingHero.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run repository gates**

Run: `npm run lint && npm run typecheck && npm run typecheck:strict && npm run typecheck:noimplicitany && npm run check:no-new-js && npm run build`

Expected: PASS. Run `npm test` separately and distinguish the known untouched baseline `noCompanyLiteral` failure from reconciliation regressions.

- [ ] **Step 6: Commit**

Commit: `ui: reconcile live Sites hero with GitHub`

### Task 3: Verify scope and prepare GitHub integration

**Files:**
- Modify: `AGENT_CLAIMS.md` only to release this session's claim after integration is prepared.

**Interfaces:**
- Consumes: Tasks 1 and 2 commits plus current `origin/main`.
- Produces: A reviewable GitHub branch whose application delta matches Sites v18 without snapshot regressions.

- [ ] **Step 1: Rebase or merge current `origin/main` without force-pushing**

Expected: branch retains only reconciliation-owned changes after resolving any concurrent updates.

- [ ] **Step 2: Verify the diff allowlist and production artifact hash**

Run: `git diff --name-only origin/main...HEAD` and hash the tracked hero.

Expected: only claim/spec/plan, hosting contract/test, hero asset/test, JSX, and landing CSS appear; hero hash matches production.

- [ ] **Step 3: Run final focused tests and build after integration**

Run the Task 2 focused tests and `npm run build`.

Expected: PASS.

- [ ] **Step 4: Release the claim, commit, and push**

Commit: `chore: release Sites v18 reconciliation claim`

- [ ] **Step 5: Open a pull request against `main`**

The PR must state the production Sites version/commit, the intentionally narrow port, the known pre-existing baseline test failure, and the verification evidence.
