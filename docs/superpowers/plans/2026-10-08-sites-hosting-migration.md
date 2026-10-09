# SteelBuild Pro Sites Hosting Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Cloudflare-hosted SteelBuild Pro frontend with a Sites-hosted build while preserving the existing Vite/React product and production Supabase backend.

**Architecture:** Treat the current repository as an existing portable Vite project and publish its `dist` output as a static Sites application. Sites owns frontend delivery and custom-domain routing; Supabase remains the unchanged data, authentication, authorization, storage, Edge Function, and billing boundary.

**Tech Stack:** Vite 6, React 18, TypeScript/JavaScript, Vitest, Supabase, Sites static hosting

**Spec:** `docs/superpowers/specs/2026-10-08-sites-hosting-migration-design.md`

## Global Constraints

- Preserve the current Vite/React application architecture and production build.
- Keep the existing production Supabase project and its data unchanged.
- Do not change database schema, migrations, RLS, Storage policies, Edge Functions, or Stripe logic.
- Do not introduce service-role keys or other privileged credentials into tracked files or the browser bundle.
- Restrict changes to Sites identity, hosting verification, and the smallest required compatibility fixes.
- Preserve the current Cloudflare deployment and configuration until the Sites release and domain routing are confirmed.
- Respect all active entries in `AGENT_CLAIMS.md`; stage files explicitly and never absorb unrelated working-tree changes.
- New source code must be TypeScript; do not add `src/**/*.js(x)` files.
- Do not use `supabase db push` or any automatic migration application.

## Review Focus

- A missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` must stop the release rather than produce a frontend pointed at an unintended backend; Task 2 verifies required production build inputs.
- A deep SPA route such as `/ResetPassword` must return the application shell instead of a host-level 404; Task 2 verifies static SPA packaging and route fallback behavior.
- Hashed assets and `web-ifc.wasm` must be present in the packaged artifact; Task 2 verifies both output classes after the production build.
- A private Sites release must not be mistaken for the public cutover; Task 3 verifies deployment status and records the returned live URL before Task 4 changes domains.
- Apex and `www` can validate independently; Task 4 checks and refreshes both domain records and leaves Cloudflare available if either one fails.

---

### Task 1: Register the Existing Application and Pin Its Hosting Contract

**Files:**
- Create: `.openai/hosting.json`
- Create: `scripts/__tests__/sitesHosting.test.ts`
- Modify: `AGENT_CLAIMS.md` only when releasing the migration claim after completion

**Interfaces:**
- Consumes: the Sites `create_site` result containing the opaque project ID and source-repository credential
- Produces: `.openai/hosting.json` with the exact `project_id` returned by Sites and `static.directory` set to `dist`

- [ ] **Step 1: Write the failing manifest contract test**

Create `scripts/__tests__/sitesHosting.test.ts` with a test named `pins the Sites project to the Vite dist artifact`. Assert that `.openai/hosting.json` exists, parses as JSON, contains a non-empty string `project_id`, contains exactly `static.directory === "dist"`, and does not contain keys named `env`, `secrets`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` at any depth.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run scripts/__tests__/sitesHosting.test.ts`

Expected: FAIL because `.openai/hosting.json` does not exist.

- [ ] **Step 3: Register exactly one Sites project**

Call `mcp__codex_apps__sites_create_site` once with the SteelBuild Pro title and description, without enabling workspace plugins. Retain the exact returned project ID and source-repository credential in session memory; never place the credential in a file or shell argument.

- [ ] **Step 4: Persist the returned identity**

Run `node C:\Users\nlort\.codex\plugins\cache\openai-curated-remote\sites\0.1.75\scripts\set-project-id.mjs --project-id <exact-returned-id>` from the repository root. Update `.openai/hosting.json` through the supported helper or an atomic patch so its only non-identity hosting field is:

```json
{
  "static": {
    "directory": "dist"
  }
}
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run: `npx vitest run scripts/__tests__/sitesHosting.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit only the hosting contract**

```bash
git add .openai/hosting.json scripts/__tests__/sitesHosting.test.ts
git commit -m "feat: register SteelBuild Pro with Sites"
```

### Task 2: Verify the Production Artifact and Repository Gates

**Files:**
- Modify only if a verified incompatibility requires it: Sites-owned hosting/configuration files not covered by another active claim
- Test: `scripts/__tests__/sitesHosting.test.ts`

**Interfaces:**
- Consumes: Task 1's `.openai/hosting.json` contract and the existing `npm run build` output
- Produces: a verified `dist` artifact containing the SPA shell, hashed assets, public metadata, service worker, and matching `web-ifc.wasm`

- [ ] **Step 1: Verify required public production inputs without printing their values**

Check that `.env.local` or the current process supplies non-empty `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and verify that the URL host matches the production Supabase project documented by the repository. Report only presence and the matched project identifier; do not print keys.

- [ ] **Step 2: Run the repository's fast static gates**

Run, in order:

```bash
npm run lint
npm run typecheck
npm run typecheck:js
npm run typecheck:strict
npm run typecheck:noimplicitany
npm run check:no-new-js
```

Expected: each command exits 0. If a failure is in an actively claimed or unrelated file, record it as pre-existing and do not edit that area.

- [ ] **Step 3: Run the test suite**

Run: `npm test`

Expected: exit 0. If unrelated concurrent work causes failures, rerun `npx vitest run scripts/__tests__/sitesHosting.test.ts` and the directly affected deployment/configuration suites, then document the unrelated failures with exact test names.

- [ ] **Step 4: Build the production SPA**

Run: `npm run build`

Expected: exit 0 and produce `dist/index.html`, `dist/assets/`, `dist/sw.js`, `dist/manifest.json`, and `dist/wasm/web-ifc.wasm`.

- [ ] **Step 5: Verify the artifact contract**

Confirm that `dist/index.html` references only packaged local assets, the service worker is present, no `.env.local` or privileged key name appears in `dist`, and the Sites packaging workflow recognizes `.openai/hosting.json` as a static `dist` deployment with SPA fallback.

- [ ] **Step 6: Commit only a required compatibility correction, if one was proven**

If Steps 2–5 pass without a source change, do not manufacture a commit. If a Sites-owned compatibility file required correction, add a focused failing assertion to `scripts/__tests__/sitesHosting.test.ts`, make the minimum change, rerun the focused test and build, then commit only those paths with `fix: make Vite artifact Sites-compatible`.

### Task 3: Configure Sites Runtime Values and Publish

**Files:**
- No tracked source changes expected
- Generated outside Git: Sites workflow archive under a workspace-owned temporary/output path

**Interfaces:**
- Consumes: Task 1's exact Sites project ID and retained source credential; Task 2's verified source state and build command
- Produces: one saved Sites version, one deployment ID, and a successful Sites URL

- [ ] **Step 1: Inspect existing Sites runtime values**

Call `mcp__codex_apps__sites_get_environment_variables` with the exact project ID. Preserve unrelated values and never echo secret values.

- [ ] **Step 2: Set the public frontend runtime/build values**

Call `mcp__codex_apps__sites_update_environment_variables` to set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the existing production frontend configuration. Add `VITE_SENTRY_DSN` only when it is already configured for the production frontend. Do not set `SUPABASE_SERVICE_ROLE_KEY`, Stripe secrets, or Edge Function secrets in Sites.

- [ ] **Step 3: Push and package the exact source state**

Run the bundled workflow in a TTY:

```text
node C:\Users\nlort\.codex\plugins\cache\openai-curated-remote\sites\0.1.75\scripts\site-workflow.mjs --project-id <exact-project-id>
```

When prompted, send one newline-terminated JSON object containing the retained credential, `commands` with `npm run build`, and an absolute archive path. The workflow result must return the same project ID, a verified `commit_sha`, and an archive built from that source state.

- [ ] **Step 4: Save and deploy the verified version**

Use `mcp__codex_apps__sites_save_version_and_deploy_private` when available for the initial owner-private release; otherwise call `mcp__codex_apps__sites_save_site_version` followed by `mcp__codex_apps__sites_deploy_private_site_version`. Pass the exact project ID, workflow `commit_sha`, and unchanged archive.

- [ ] **Step 5: Verify deployment completion**

If the deployment is non-terminal, poll `mcp__codex_apps__sites_get_deployment_status` with the same deployment ID until it succeeds or fails. Success requires `status === "succeeded"` and a returned URL. On failure, query recent Sites worker logs and leave the Cloudflare frontend unchanged.

### Task 4: Attach the Production Domains and Close the Migration

**Files:**
- Modify: `AGENT_CLAIMS.md` to release `codex-sites-migration` after all verification succeeds
- Preserve unchanged: `wrangler.jsonc`, Cloudflare deployment workflows, and rollback configuration

**Interfaces:**
- Consumes: Task 3's successful Sites project ID, version, deployment ID, and URL
- Produces: active Sites custom domains for `steelbuild-pro.com` and `www.steelbuild-pro.com`, or exact DNS/account instructions if automated activation is unavailable

- [ ] **Step 1: Attach both custom hostnames**

Call `mcp__codex_apps__sites_add_custom_domain` separately for `steelbuild-pro.com` and `www.steelbuild-pro.com`, using the exact Sites project ID.

- [ ] **Step 2: Apply required DNS changes when authorized controls are available**

Use the returned apex targets, CNAME target, and validation records exactly. Do not delete the existing Cloudflare route or deployment configuration before both Sites domain records are accepted. If DNS cannot be changed through available authorized tooling, stop only this step and report each required record precisely.

- [ ] **Step 3: Verify apex and `www` independently**

Call `mcp__codex_apps__sites_refresh_custom_domain_status` and `mcp__codex_apps__sites_list_custom_domains`. Expected: both records report `status === "active"` with healthy SSL state. A pending or failed hostname does not count as a completed cutover.

- [ ] **Step 4: Recheck the live Sites deployment**

Call `mcp__codex_apps__sites_get_deployment_status` with Task 3's deployment ID and confirm it remains successful after domain attachment. Use Sites worker logs only if the deployment or routed requests report errors.

- [ ] **Step 5: Release the collaboration claim and commit the release note**

Change only the `codex-sites-migration` row in `AGENT_CLAIMS.md` to a released entry describing the Sites project URL and domain status. Stage that hunk alone and commit with:

```bash
git commit -m "chore: release Sites migration claim"
```

- [ ] **Step 6: Handoff**

Open the successful Sites URL in Codex when available. Report the Sites URL, custom-domain status, checks run, any pre-existing failures, and the retained Cloudflare rollback posture. Do not suggest a recurring automation because this is an application deployment, not scheduled content.
