# Storage Backup Reliability Packet Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile, harden, validate, and publish the repository-side offsite Storage backup packet without activating or mutating production.

**Architecture:** A pure planning and verification module defines mandatory coverage for `app-files` and `email-attachments`, an executable Node runner invokes rclone with temporary server-only configuration, and a scheduled GitHub Actions workflow installs a checksum-verified rclone binary. Timestamped immutable snapshots, a current mirror, exact path/size checks, aggregate object/byte checks, and retained manifests provide the backup evidence contract; owner-managed credentials and restore rehearsal remain separate activation steps.

**Tech Stack:** Node.js 22 ESM, Vitest, GitHub Actions, rclone 1.74.4, Supabase Storage S3 compatibility, Markdown runbooks.

## Global Constraints

- Repository, CI, and staging work may proceed automatically.
- Stop for explicit approval before every production migration, deployment, settings change, destructive operation, or broad feature enablement.
- Do not use a student account or the production Supabase project as the offsite destination.
- Keep `OFFSITE_RCLONE_CONFIG_B64` and Supabase S3 access keys server-side; never log or commit them.
- Mandatory bucket coverage is exactly `app-files` and `email-attachments`.
- Preserve object keys so database file references and signed URLs can be recovered.
- H25 remains code-ready or owner-blocked until a green production-source manifest and staging restore rehearsal are recorded.
- Preserve unrelated working-tree changes and do not force-push.
- This plan does not implement the Detailing transmittal workflow; that is the next independent Workflow packet.

## File Responsibility Map

- `.github/workflows/storage-backup.yml` — nightly/manual job, pinned rclone download checksum, secret wiring, manifest artifact retention.
- `scripts/lib/storageBackup.mjs` — validation, bucket planning, rclone operation planning, statistics comparison, verified manifest construction, and sanitized child environment.
- `scripts/storage-backup.mjs` — temporary config lifecycle, child-process execution, local manifest writing, offsite manifest upload, and operator-safe logs.
- `scripts/__tests__/storageBackup.test.mjs` — planner, configuration, secret hygiene, operation, and manifest tests.
- `scripts/__tests__/storageBackupWorkflow.test.mjs` — workflow schedule, checksum, and required-secret contract tests.
- `scripts/__tests__/storageBackupDocumentation.test.mjs` — recovery-evidence language guardrails.
- `docs/runbooks/storage-backup-setup.md` — owner setup, first-run acceptance, restore rehearsal, and recurring-operation procedure.
- `docs/runbooks/backup-dr.md` — DR coverage, restore procedure, rehearsal record, and evidence requirements.
- `docs/runbooks/assurance-pack.md` — accurate control status for external assurance discussions.
- `docs/runbooks/owner-checklist.md` — H25 owner activation and restore-verification task.
- `package.json` — local `backup:storage` command.

---

### Task 1: Preserve the recovered packet and reconcile current `origin/main`

**Files:**
- Create: `.github/workflows/storage-backup.yml`
- Create: `docs/runbooks/storage-backup-setup.md`
- Create: `scripts/lib/storageBackup.mjs`
- Create: `scripts/storage-backup.mjs`
- Create: `scripts/__tests__/storageBackup.test.mjs`
- Create: `scripts/__tests__/storageBackupWorkflow.test.mjs`
- Modify: `docs/runbooks/assurance-pack.md`
- Modify: `docs/runbooks/backup-dr.md`
- Modify: `docs/runbooks/owner-checklist.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: the approved design and plan commits already replayed onto current `origin/main` by controller pre-flight, plus the restored uncommitted Storage packet.
- Produces: a committed Storage baseline on current `origin/main`, with no production state change.

- [ ] **Step 1: Confirm only the known Storage files are uncommitted**

Run:

```powershell
git status --short
git diff --check
git log -3 --oneline --decorate
```

Expected: the design and plan are separate commits above current `origin/main`; the ten Storage packet files listed above are the only uncommitted changes. Stop if any additional path appears.

- [ ] **Step 2: Re-run the focused baseline tests before preserving the packet**

Run:

```powershell
npx vitest run scripts/__tests__/storageBackup.test.mjs scripts/__tests__/storageBackupWorkflow.test.mjs
```

Expected: 2 test files and 16 tests pass.

- [ ] **Step 3: Validate syntax, YAML structure, and fail-closed startup**

Run:

```powershell
node --check scripts/storage-backup.mjs
node --check scripts/lib/storageBackup.mjs
node -e 'const fs=require("node:fs"); const YAML=require("yaml"); const doc=YAML.parse(fs.readFileSync(".github/workflows/storage-backup.yml","utf8")); if(!doc.on || !doc.jobs?.backup) throw new Error("workflow structure invalid"); console.log("workflow YAML parsed")'
npm run backup:storage
```

Expected: both syntax checks and YAML parsing pass. `npm run backup:storage` exits nonzero and names all six missing settings without invoking rclone.

- [ ] **Step 4: Commit only the recovered Storage packet**

Run:

```powershell
git add -- .github/workflows/storage-backup.yml docs/runbooks/assurance-pack.md docs/runbooks/backup-dr.md docs/runbooks/owner-checklist.md docs/runbooks/storage-backup-setup.md package.json scripts/__tests__/storageBackup.test.mjs scripts/__tests__/storageBackupWorkflow.test.mjs scripts/lib/storageBackup.mjs scripts/storage-backup.mjs
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: automate verified offsite storage backups"
```

Expected: exactly the ten listed files are committed; the approved design and this plan remain separate documentation commits.

- [ ] **Step 5: Confirm the committed packet remains green**

Run:

```powershell
npx vitest run scripts/__tests__/storageBackup.test.mjs scripts/__tests__/storageBackupWorkflow.test.mjs
```

Expected: 2 test files and 16 tests pass on current `origin/main`; working tree is clean.

---

### Task 2: Make child-process secret sanitization an explicit tested interface

**Files:**
- Modify: `scripts/lib/storageBackup.mjs`
- Modify: `scripts/storage-backup.mjs`
- Modify: `scripts/__tests__/storageBackup.test.mjs`

**Interfaces:**
- Consumes: `createRcloneSourceEnvironment(environment)` from `scripts/lib/storageBackup.mjs`.
- Produces: `createRcloneChildEnvironment(environment): Record<string, string | undefined>`, which retains unrelated process settings, removes all six raw backup configuration keys, and adds only rclone-compatible Supabase source settings.

- [ ] **Step 1: Add the failing secret-sanitization test**

Add `createRcloneChildEnvironment` to the import list and append this test inside the existing `Storage backup execution` describe block:

```javascript
it("removes raw backup settings from the rclone child environment", () => {
  const childEnvironment = createRcloneChildEnvironment({
    PATH: "C:\\tools",
    OFFSITE_RCLONE_CONFIG_B64: "destination-secret",
    OFFSITE_ROOT: "offsite:steelbuild-pro-storage",
    SUPABASE_S3_ACCESS_KEY_ID: "source-key",
    SUPABASE_S3_ENDPOINT: "https://example.storage.supabase.co/storage/v1/s3",
    SUPABASE_S3_REGION: "us-east-1",
    SUPABASE_S3_SECRET_ACCESS_KEY: "source-secret",
  });

  expect(childEnvironment.PATH).toBe("C:\\tools");
  expect(childEnvironment.OFFSITE_RCLONE_CONFIG_B64).toBeUndefined();
  expect(childEnvironment.OFFSITE_ROOT).toBeUndefined();
  expect(childEnvironment.SUPABASE_S3_ACCESS_KEY_ID).toBeUndefined();
  expect(childEnvironment.SUPABASE_S3_ENDPOINT).toBeUndefined();
  expect(childEnvironment.SUPABASE_S3_REGION).toBeUndefined();
  expect(childEnvironment.SUPABASE_S3_SECRET_ACCESS_KEY).toBeUndefined();
  expect(childEnvironment.RCLONE_CONFIG_SUPABASE_ACCESS_KEY_ID).toBe("source-key");
  expect(childEnvironment.RCLONE_CONFIG_SUPABASE_SECRET_ACCESS_KEY).toBe("source-secret");
});
```

- [ ] **Step 2: Run the test to prove the interface is missing**

Run:

```powershell
npx vitest run scripts/__tests__/storageBackup.test.mjs
```

Expected: one test fails because `createRcloneChildEnvironment` is not exported.

- [ ] **Step 3: Implement the sanitized environment builder**

Add this function after `createRcloneSourceEnvironment` in `scripts/lib/storageBackup.mjs`:

```javascript
export function createRcloneChildEnvironment(environment) {
  const childEnvironment = { ...environment };
  for (const key of REQUIRED_ENV_KEYS) {
    delete childEnvironment[key];
  }
  return Object.assign(childEnvironment, createRcloneSourceEnvironment(environment));
}
```

- [ ] **Step 4: Route the runner through the tested helper**

Add `createRcloneChildEnvironment` to the imports in `scripts/storage-backup.mjs`, then replace the manual environment block with:

```javascript
const childEnvironment = createRcloneChildEnvironment(process.env);
```

- [ ] **Step 5: Run focused tests and syntax checks**

Run:

```powershell
npx vitest run scripts/__tests__/storageBackup.test.mjs scripts/__tests__/storageBackupWorkflow.test.mjs
node --check scripts/storage-backup.mjs
node --check scripts/lib/storageBackup.mjs
```

Expected: 2 test files and 17 tests pass; both syntax checks pass.

- [ ] **Step 6: Commit the security refinement**

Run:

```powershell
git add -- scripts/lib/storageBackup.mjs scripts/storage-backup.mjs scripts/__tests__/storageBackup.test.mjs
git diff --cached --check
git commit -m "test: enforce storage backup secret isolation"
```

Expected: one focused commit containing the tested child-environment boundary.

---

### Task 3: Guard honest recovery-status documentation

**Files:**
- Create: `scripts/__tests__/storageBackupDocumentation.test.mjs`
- Read: `docs/runbooks/assurance-pack.md`
- Read: `docs/runbooks/backup-dr.md`
- Read: `docs/runbooks/owner-checklist.md`
- Read: `docs/runbooks/storage-backup-setup.md`

**Interfaces:**
- Consumes: the four runbooks that describe Storage readiness.
- Produces: a Vitest contract that prevents the repository from describing unactivated automation as an operating or recovery-tested control.

- [ ] **Step 1: Add the documentation regression test**

Create `scripts/__tests__/storageBackupDocumentation.test.mjs` with:

```javascript
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const repoRoot = new URL("../../", import.meta.url);

async function readRunbook(name) {
  return readFile(new URL(`docs/runbooks/${name}`, repoRoot), "utf8");
}

describe("Storage backup recovery evidence", () => {
  it("keeps activation and restore evidence explicitly open", async () => {
    const [assurance, backupDr, ownerChecklist, setup] = await Promise.all([
      readRunbook("assurance-pack.md"),
      readRunbook("backup-dr.md"),
      readRunbook("owner-checklist.md"),
      readRunbook("storage-backup-setup.md"),
    ]);

    expect(assurance).toContain("not yet an operating control");
    expect(backupDr).toContain("code alone is not a backup");
    expect(ownerChecklist).toContain("[~] **Enable and rehearse offsite Storage backup**");
    expect(setup).toContain("Never overwrite production to test recovery");
  });
});
```

- [ ] **Step 2: Run the documentation and Storage contract tests**

Run:

```powershell
npx vitest run scripts/__tests__/storageBackup.test.mjs scripts/__tests__/storageBackupWorkflow.test.mjs scripts/__tests__/storageBackupDocumentation.test.mjs
```

Expected: 3 test files and 18 tests pass.

- [ ] **Step 3: Commit the evidence guardrail**

Run:

```powershell
git add -- scripts/__tests__/storageBackupDocumentation.test.mjs
git diff --cached --check
git commit -m "test: guard storage recovery evidence status"
```

Expected: one test-only commit; no runbook status is changed to verified.

---

### Task 4: Run the repository gates and publish a code-ready branch

**Files:**
- Verify: all Storage packet files from Tasks 1-3
- Do not modify: production database, Supabase settings, GitHub environment secrets, or offsite provider configuration

**Interfaces:**
- Consumes: the reconciled Storage implementation and documentation contracts.
- Produces: a pushed feature branch classified as code-ready, plus an exact validation record and owner activation boundary.

- [ ] **Step 1: Run lint and every type gate used by CI**

Run:

```powershell
npm run lint
npm run typecheck
npm run typecheck:js
npm run typecheck:strict
npm run typecheck:noimplicitany
```

Expected: all five commands pass. Existing grandfathered strict/noImplicitAny counts may be reported, but enforced error count must remain zero.

- [ ] **Step 2: Run the complete Vitest suite once under the CI-equivalent boundary**

Run:

```powershell
npm test -- --reporter=dot
```

Expected: the full suite exits zero. If it does not finish within the repository's 15-minute CI timeout, stop the process, record the suite as unable to verify locally, and do not report it as passed; the focused 18-test Storage contract remains the feature-level evidence.

- [ ] **Step 3: Run the production build with CI placeholders**

Run:

```powershell
$env:VITE_SUPABASE_URL='https://ci-placeholder.supabase.co'
$env:VITE_SUPABASE_ANON_KEY='ci-placeholder-anon-key'
$env:NODE_OPTIONS='--max-old-space-size=4096'
npm run build
```

Expected: Vite exits zero and produces `dist/`; existing chunk-size warnings are non-blocking.

- [ ] **Step 4: Re-run operational safety checks**

Run:

```powershell
node -e 'const fs=require("node:fs"); const YAML=require("yaml"); const doc=YAML.parse(fs.readFileSync(".github/workflows/storage-backup.yml","utf8")); if(!doc.on?.schedule || !Object.hasOwn(doc.on ?? {}, "workflow_dispatch") || !doc.jobs?.backup) throw new Error("workflow structure invalid"); console.log("workflow YAML parsed")'
npm run backup:storage
git diff --check
rg -n "source-secret|sas_url = secret" scripts docs .github
git status --short
```

Expected: YAML parsing passes; the backup command fails closed on missing settings; only fake test values match the secret scan; the working tree is clean.

- [ ] **Step 5: Push the review branch without merging it**

Run:

```powershell
git push --set-upstream origin codex/storage-backup-recovery
```

Expected: the feature branch is available for review. Do not merge to `main`, configure production secrets, run the production-source backup, or deploy anything in this task.

- [ ] **Step 6: Record the result state**

Report:

```text
Result: code-ready
Verified: focused Storage tests, lint, type gates, workflow parsing, fail-closed startup, production build, diff/secret/status checks
Not verified: production-source backup, offsite manifest retention, failure notifications, staging restore, signed-file recovery
Owner task: docs/runbooks/owner-checklist.md H25
Production approval gate: merge/activation and any live backup execution
```

Expected: H25 remains open until the owner-controlled evidence exists. The next packet is the independent Detailing transmittal workflow audit.
