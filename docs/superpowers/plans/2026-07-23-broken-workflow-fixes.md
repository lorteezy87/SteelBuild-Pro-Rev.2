# Broken Workflow Repairs Implementation Plan

> **For SteelBuild Pro:** execute each slice with regression coverage, then validate the full CI gate before merge.

**Goal:** Restore six user-facing workflows that currently fail, close too early, overwrite data, expose no action, or are unreachable.

**Architecture:** Keep server authority in the existing React Query mutations and Supabase entity clients. Repair UI mutation lifecycles with `mutateAsync`, minimal patches, canonical cache invalidation, and ProjectContext synchronization. Reconnect the existing project assistant without colliding with global search.

**Tech stack:** React 18, TanStack Query, Supabase entity client, Vitest/jsdom.

---

## Task 1: Cost-code save lifecycle

**Files:**
- Modify: `src/pages/costHub/CostControlCenter.tsx`
- Add: `src/pages/costHub/costCodeSave.js`
- Test: `src/pages/costHub/__tests__/costCodeSave.test.ts`

1. Add regression coverage proving create/update rejections propagate to the form.
2. Change the modal callback to await `costCodeCrud.create/update.mutateAsync`.
3. Close and clear edit state only after successful resolution.
4. Preserve entered values when Supabase rejects the write.

## Task 2: Contract save synchronization

**Files:**
- Modify: `src/api/client/entityClient.ts`
- Modify: `src/components/shared/ProjectContext.jsx`
- Add: `src/services/projectUpdateEvents.ts`
- Test: `src/services/__tests__/projectUpdateEvents.test.ts`
- Test: `src/__tests__/components/ProjectContext.test.jsx`

1. Publish the updated project row only after `Project.update` succeeds.
2. Subscribe ProjectContext to successful project updates.
3. Merge the returned row into active-project state, the project collection, and local storage.
4. Verify contract values refresh across app-level project consumers without a reload.

## Task 3: Change-order edit and delete

**Files:**
- Modify: `src/pages/ChangeOrders.jsx`
- Modify: `src/pages/changeOrders/CoControlCenter.tsx`
- Modify: `src/components/changeorders/COFormModal.jsx`
- Add: `src/components/changeorders/changeOrderPayload.ts`
- Test: `src/pages/changeOrders/__tests__/CoControlCenter.test.tsx`
- Test: `src/components/changeorders/__tests__/changeOrderPayload.test.ts`

1. Add an explicit permission-gated delete action that does not trigger row edit.
2. Route single deletion through the existing confirmation dialog.
3. Invalidate the full `change_order` cache family after edit/delete so revised-contract totals refresh.
4. Lock the project selector during edit to prevent unsupported cross-project moves.
5. Whitelist editable CO fields so aliases, timestamps, and derived values cannot poison update payloads.

## Task 4: Checklist item behavior

**Files:**
- Modify: `src/components/closeout/ProjectCloseoutChecklist.jsx`
- Modify: `src/pages/ProjectCloseout.jsx`
- Test: `src/components/closeout/__tests__/ProjectCloseoutChecklist.test.jsx`

1. Test that a click emits only the changed field rather than a stale full-record snapshot.
2. Apply an optimistic cache patch with rollback on failure.
3. Disable repeat interaction while a toggle is pending.
4. Invalidate the canonical closeout key after settlement.

## Task 5: PMA reachability and interaction paths

**Files:**
- Modify: `src/Layout.jsx`
- Modify: `src/components/ai-assistant/AiAssistantLauncher.jsx`
- Modify: `src/components/ai-assistant/AiAssistantDrawer.jsx`
- Test: `src/components/ai-assistant/__tests__/AiAssistantLauncher.test.jsx`
- Test: `src/components/ai-assistant/__tests__/AiAssistantDrawer.test.jsx`

1. Restore the existing project-assistant launcher in the authenticated layout.
2. Remove the conflicting Cmd/Ctrl+K listener because global search owns that shortcut.
3. Place the launcher correctly now that Quick Add is hidden.
4. Make starter prompts execute directly rather than only populating the composer.
5. Keep project-required, sending, and backend-error states fail-closed and visible.

## Task 6: Verification and release

1. Run targeted tests for all changed workflows.
2. Run lint, TypeScript/JS checks, strict ratchets, full Vitest, and production build through GitHub Actions.
3. Review the final diff for unrelated visual/theme changes.
4. Open a draft PR with root causes, tests, and field-verification notes.
5. Release the agent claim after the branch is ready for review.
