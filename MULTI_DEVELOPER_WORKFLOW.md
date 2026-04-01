# Multi-Developer Workflow

## Purpose

This repository currently has a large mixed working set spanning structure,
runtime fixes, page refactors, and feature behavior changes. This document
defines how to split that work so multiple developers can work without stepping
on each other or creating unreviewable commits.

## Required Working Rules

1. Keep structural cleanup separate from behavior changes.
2. Do not mix page refactors with functional bug fixes in the same commit.
3. Prefer one logical concern per commit or PR.
4. Do not reintroduce root-level runtime app files or duplicate module trees.
5. Shared UI belongs only in:
   - `src/components/ui`
   - `src/components/shared`
6. Workflow logic belongs in:
   - `src/hooks`
   - `src/services`
   - module-local component folders when not shared

## Current Commit Bundles

The current working tree should be split into the following bundles.

### Bundle 1: Structure And Bootstrap

Owns:

- `.gitignore`
- `ARCHITECTURE.md`
- `MULTI_DEVELOPER_WORKFLOW.md`
- `jsconfig.json`
- `tailwind.config.js`
- `src/App.jsx`
- `src/main.jsx`
- `src/globals.css`
- deletion of `src/index.css`
- `src/lib/app-params.js`
- `src/lib/utils.js`
- `src/lib/projectEntityApi.js`

This bundle is for:

- source-of-truth routing
- boot/runtime safety
- config normalization
- root stylesheet ownership

### Bundle 2: Shared Architecture Moves

Owns:

- `src/hooks/useAIRateLimit.jsx`
- `src/hooks/useAppSecurity.jsx`
- `src/hooks/useDestructiveAudit.jsx`
- `src/services/workflowValidation.js`
- `src/services/README.md`
- `src/entities/README.md`
- `src/components/workflow/*`
- `src/components/shared/CostCodeSelect.jsx`
- deletion of:
  - `src/components/shared/useAIRateLimit.jsx`
  - `src/components/shared/useAppSecurity.jsx`
  - `src/components/shared/useDestructiveAudit.jsx`
  - `src/components/shared/workflowValidation.jsx`
  - `src/components/shared/WorkflowBlockingModal.jsx`
  - `src/components/shared/WorkflowStepIndicator.jsx`
  - `src/components/CostCodeSelect.jsx`

This bundle is for:

- moving workflow/security/audit logic out of generic UI folders
- finalizing shared ownership boundaries

### Bundle 3: Drawings And Submittals

Owns:

- `src/pages/Drawings.jsx`
- `src/pages/Submittals.jsx`
- `src/components/drawings/*`
- `base44/functions/assignDrawingSetName/*`
- `base44/functions/bulkUpdateDrawings/*`

This bundle is for:

- drawing set assignment
- revision upload behavior
- rate-limit mitigation
- submittals refactor

### Bundle 4: PMA And Runtime Stability

Owns:

- `src/components/pma/*`
- `base44/functions/invokeLLM/entry.ts`
- `base44/functions/writeAuditLog/entry.ts`
- `base44/functions/secureNumberSequence/entry.ts`

This bundle is for:

- PMA runtime fixes
- audit suppression
- LLM invocation cleanup
- sequence/auth hardening

### Bundle 5: Page Refactors

Owns:

- `src/pages/Constraints.jsx`
- `src/components/constraints/*`
- `src/pages/RFIs.jsx`
- `src/components/rfis/*`

This bundle is for:

- page decomposition
- extracting config, sections, and hooks
- reducing oversized route files

### Bundle 6: Workflow And Module Fixes

Owns the remaining module/page behavior changes, for example:

- `src/pages/Financials.jsx`
- `src/pages/Schedule.jsx`
- `src/pages/WorkPackages.jsx`
- `src/pages/ModelViewer.jsx`
- affected module form modals and drawers

This bundle is for:

- save/delete behavior fixes
- null/loading/error-state hardening
- module runtime cleanup

## Staging Rules

When preparing work for commit:

1. Stage Bundle 1 alone when touching app bootstrap or config.
2. Stage Bundle 2 alone when moving shared logic across folders.
3. Stage Bundle 3 alone when working on drawings/submittals.
4. Stage Bundle 4 alone when working on PMA/backend runtime stability.
5. Stage Bundle 5 alone when doing route refactors.
6. Stage Bundle 6 only after the structural bundles are already separated.

Do not combine Bundle 1 or Bundle 2 with Bundles 3 through 6 unless the build
is broken without both.

## Review Guidance

Reviewers should reject commits that:

- combine refactors with unrelated behavior fixes
- move files and change behavior in unrelated modules at the same time
- place shared workflow logic back under `src/components/ui` or generic UI
  folders
- add new generic shared buckets outside `ui` and `shared`

## Current Repo State

The repository is build-clean, but not yet worktree-clean.

That means:

- `npm run lint` passes
- `npm run build` passes
- the current branch still contains a large mixed set of modified files

Treat this document as the temporary map for splitting the current branch into
reviewable slices.
