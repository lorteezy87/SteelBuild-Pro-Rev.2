# Settings Personalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SteelBuild Pro's existing personal settings functional and add cross-device workflow presets, favorites, reset, and portability controls.

**Architecture:** A pure versioned preference contract sanitizes Supabase Auth metadata and owns defaults/presets. `useUserPrefs` exposes the validated values, while focused runtime consumers apply them to the theme, application shell, formatters, navigation, project switcher, and in-app alert stream. Settings retains the existing `auth.updateMe` persistence path and adds optimistic rollback for failed writes.

**Tech Stack:** React 18, TypeScript/JavaScript, TanStack Query, Supabase Auth metadata, Vitest, Testing Library, CSS custom-property tokens.

## Global Constraints

- Personal preferences must never affect RBAC, organization membership, project access, billing, or feature flags.
- Keep existing preference keys backward compatible.
- Supabase metadata is the cross-device source of truth; namespaced localStorage is only a no-flash bootstrap cache.
- Never use client-writable metadata for authorization.
- Every enabled control must have a tested runtime consumer.
- Unavailable email/push delivery must be disabled and labeled honestly.
- Use existing SteelBuild tokens; do not hardcode component surface, text, or border colors.
- Never use `<form>` or Radix Dialog.
- Write a failing test before production code for each task.

---

### Task 1: Canonical preference contract and workflow presets

**Files:**
- Create: `src/lib/userPreferences/schema.ts`
- Create: `src/lib/userPreferences/presets.ts`
- Create: `src/lib/userPreferences/portability.ts`
- Test: `src/lib/userPreferences/__tests__/schema.test.ts`
- Test: `src/lib/userPreferences/__tests__/presets.test.ts`
- Test: `src/lib/userPreferences/__tests__/portability.test.ts`

**Interfaces:**
- Produces `UserPreferences`, `DEFAULT_USER_PREFERENCES`, `sanitizeUserPreferences(input)`, `serializeUserPreferences(prefs)`, `parseUserPreferencesExport(text)`, `PERSONALIZATION_PRESETS`, and `applyPersonalizationPreset(current, presetId)`.

- [ ] **Step 1: Write failing schema tests** covering malformed arrays, unknown values, blocked identity/privilege keys, backwards-compatible defaults, and preference version `2`.
- [ ] **Step 2: Run `npm test -- src/lib/userPreferences/__tests__/schema.test.ts`** and verify failure because the module does not exist.
- [ ] **Step 3: Implement the typed schema** with explicit allowlists for appearance, formats, workspace, dashboard, and notification values.
- [ ] **Step 4: Run the schema test** and verify it passes.
- [ ] **Step 5: Write failing preset tests** asserting PM, field, fabrication, and executive preset output and that applying a preset preserves unrelated notification choices.
- [ ] **Step 6: Run the preset test** and verify the missing preset module failure.
- [ ] **Step 7: Implement immutable preset definitions and `applyPersonalizationPreset`**; set `workspace_preset` to the selected id and return only personal keys.
- [ ] **Step 8: Run the preset tests** and verify they pass.
- [ ] **Step 9: Write failing portability tests** for versioned export, invalid JSON, unsupported versions, and rejection of `role`, `email`, `org_id`, and `permissions`.
- [ ] **Step 10: Implement import/export parsing** through `sanitizeUserPreferences`; imports are all-or-nothing and return field errors without persisting.
- [ ] **Step 11: Run all Task 1 tests** and commit with `feat(settings): add canonical preference contract`.

### Task 2: Runtime preference hook and reliable persistence

**Files:**
- Modify: `src/hooks/useUserPrefs.js`
- Create: `src/hooks/useSaveUserPrefs.ts`
- Modify: `src/pages/Settings.jsx`
- Modify: `src/lib/AuthContext.tsx`
- Test: `src/hooks/__tests__/useUserPrefs.test.jsx`
- Test: `src/hooks/__tests__/useSaveUserPrefs.test.tsx`

**Interfaces:**
- Consumes `sanitizeUserPreferences` from Task 1.
- Produces `useUserPrefs(): UserPreferences` and `useSaveUserPrefs()` returning `{ savePatch, saveAll, resetKeys, isSaving, lastError, syncState }`.

- [ ] **Step 1: Write failing `useUserPrefs` tests** proving defaults and sanitization are applied to AuthContext metadata.
- [ ] **Step 2: Run the focused hook test** and verify the old hook returns the wrong/incomplete shape.
- [ ] **Step 3: Refactor `useUserPrefs`** to use the canonical schema while retaining `DASHBOARD_KPI_IDS` compatibility exports.
- [ ] **Step 4: Run the focused test** and verify it passes.
- [ ] **Step 5: Write failing persistence tests** for optimistic cache update, successful `auth.updateMe`, rollback on rejection, and coalescing rapid single-key edits.
- [ ] **Step 6: Run the persistence test** and verify the hook is missing.
- [ ] **Step 7: Implement `useSaveUserPrefs`** using TanStack Query cache key `['user-settings', userId]`, `auth.updateMe`, and a last-known-good snapshot.
- [ ] **Step 8: Update Settings** to use the persistence hook instead of a page-local mutation and duplicate toast timers.
- [ ] **Step 9: Ensure AuthContext handles Supabase `USER_UPDATED` events** so metadata changes are reflected without a reload.
- [ ] **Step 10: Run Task 2 tests** and commit with `feat(settings): centralize preference persistence`.

### Task 3: Appearance, system theme, density, hints, and shell behavior

**Files:**
- Modify: `src/lib/themeResolution.ts`
- Modify: `src/components/shared/ThemeContext.jsx`
- Modify: `src/components/settings/DisplayTab.jsx`
- Create: `src/components/settings/AppearancePreview.tsx`
- Modify: `src/Layout.jsx`
- Modify: `src/components/nav/useDensityRestore.js`
- Modify: `src/components/nav/SidebarNav.jsx`
- Modify: `src/styles/tokens.css`
- Test: `src/lib/__tests__/themeResolution.test.ts`
- Test: `src/components/settings/__tests__/AppearancePreview.test.tsx`
- Test: `src/components/nav/__tests__/preferenceShell.test.tsx`

**Interfaces:**
- Consumes appearance/workspace preferences from Task 2.
- Root attributes: `data-density`, `data-tooltips`, `data-keyboard-hints`, `data-auto-drawers`; sidebar consumes `sidebar_mode` and `show_recent_pages`.

- [ ] **Step 1: Extend failing theme tests** for stored `system`, OS changes while selected, and no accidental overwrite with resolved `dark`/`light`.
- [ ] **Step 2: Run the theme test** and verify it fails under the current dark/light-only contract.
- [ ] **Step 3: Implement system-theme selection** while keeping the resolved `theme` value available to existing consumers.
- [ ] **Step 4: Write failing shell tests** for density, tooltip, keyboard-hint, drawer, rail/expanded, and recent-page preferences.
- [ ] **Step 5: Run shell tests** and verify missing attributes/consumers.
- [ ] **Step 6: Apply validated preferences in Layout and SidebarNav**; localStorage mirrors the server choice only for early boot.
- [ ] **Step 7: Replace DisplayTab's inactive density/default-view/additional labels** with active controls and add the system theme option.
- [ ] **Step 8: Build `AppearancePreview`** using drawing number, piece mark, due date, tonnage, currency, selected row, and status examples.
- [ ] **Step 9: Run Task 3 tests** and commit with `feat(settings): activate appearance and shell preferences`.

### Task 4: Personal workspace presets, navigation favorites, and favorite projects

**Files:**
- Create: `src/components/settings/WorkspaceTab.tsx`
- Create: `src/components/settings/PresetChangeSummary.tsx`
- Modify: `src/pages/Settings.jsx`
- Modify: `src/components/settings/DashboardTab.jsx`
- Modify: `src/components/nav/SidebarNav.jsx`
- Modify: `src/components/nav/ProjectPillDropdown.jsx`
- Test: `src/components/settings/__tests__/WorkspaceTab.test.tsx`
- Test: `src/components/nav/__tests__/sidebarFavorites.test.tsx`
- Test: `src/components/nav/__tests__/projectFavorites.test.tsx`

**Interfaces:**
- Consumes `PERSONALIZATION_PRESETS`, `applyPersonalizationPreset`, `favorite_project_ids`, and `pinned_modules`.
- Produces a Workspace tab that calls `onSave(patch)` only after preset confirmation.

- [ ] **Step 1: Write failing WorkspaceTab tests** for preset preview/confirm, manual edit switching to Custom, navigation selection, default project, and favorite projects.
- [ ] **Step 2: Run the focused test** and verify the tab is missing.
- [ ] **Step 3: Implement WorkspaceTab and PresetChangeSummary** with accessible buttons and exact changed-field labels.
- [ ] **Step 4: Register the Workspace tab** and move workspace-only choices out of Display without duplicating keys.
- [ ] **Step 5: Write failing sidebar tests** proving the server-backed `pinned_modules` list is authoritative and local legacy favorites are merged once, deduplicated, then migrated.
- [ ] **Step 6: Implement sidebar favorite migration** and honor `sidebar_mode`/`show_recent_pages`.
- [ ] **Step 7: Write failing project-picker tests** proving favorites sort above Active/Closeout groups and inaccessible ids disappear.
- [ ] **Step 8: Implement favorite project ordering and star toggles** in ProjectPillDropdown, persisting through `useSaveUserPrefs`.
- [ ] **Step 9: Run Task 4 tests** and commit with `feat(settings): add personal workspace presets and favorites`.

### Task 5: Active date, time, number, currency, and measurement formatting

**Files:**
- Create: `src/lib/userPreferences/runtime.ts`
- Create: `src/lib/userPreferences/formatters.ts`
- Modify: `src/utils/dates.js`
- Modify: `src/components/shared/formatters.jsx`
- Modify: `src/lib/money.ts`
- Modify: `src/components/settings/DisplayTab.jsx`
- Test: `src/lib/userPreferences/__tests__/formatters.test.ts`
- Test: `src/utils/__tests__/dates.test.js`
- Test: `src/lib/__tests__/money.test.ts`

**Interfaces:**
- Produces synchronous `getRuntimeUserPreferences`, `setRuntimeUserPreferences`, `formatUserDate`, `formatUserTime`, `formatUserNumber`, `formatUserCurrency`, and `formatUserMeasurement`.

- [ ] **Step 1: Write failing formatter tests** for all supported date formats, 12/24-hour time, US/metric measurements, USD/CAD/EUR currencies, and comma/space/decimal number styles.
- [ ] **Step 2: Run formatter tests** and verify missing module failure.
- [ ] **Step 3: Implement the runtime snapshot and pure Intl-based formatters** while preserving timezone-safe date-only parsing.
- [ ] **Step 4: Route shared date, money, and generic formatter utilities through the runtime formatter** without changing their public signatures.
- [ ] **Step 5: Add live format examples to Appearance/Formats UI** and remove the inactive labels.
- [ ] **Step 6: Run formatter, date, money, and Settings tests** and commit with `feat(settings): activate personalized formatting`.

### Task 6: Functional in-app alert preferences and honest delivery controls

**Files:**
- Create: `src/lib/userPreferences/alerts.ts`
- Modify: `src/components/settings/NotificationsTab.jsx`
- Modify: `src/components/nav/useLayoutNavData.js`
- Modify: `src/hooks/useAlerts.ts`
- Test: `src/lib/userPreferences/__tests__/alerts.test.ts`
- Test: `src/components/settings/__tests__/NotificationsTab.test.tsx`

**Interfaces:**
- Produces `isAlertEnabled(alert, prefs)`, `isQuietHoursActive(now, prefs)`, and `filterAlertsForUser(alerts, prefs, now)`.

- [ ] **Step 1: Write failing alert tests** for type mapping, category toggles, overnight quiet hours, urgent override, and unknown alert types.
- [ ] **Step 2: Run the alert test** and verify missing module failure.
- [ ] **Step 3: Implement deterministic filtering helpers**; unknown alert types remain visible by default.
- [ ] **Step 4: Filter bell counts/dropdown rows and Alerts Center data** through the same helper.
- [ ] **Step 5: Write failing NotificationsTab tests** proving in-app toggles are enabled and email/digest controls are disabled with `Delivery service not configured` copy.
- [ ] **Step 6: Replace the saved-but-inert banner** with an active in-app status summary and disabled external-delivery row.
- [ ] **Step 7: Run Task 6 tests** and commit with `feat(settings): honor in-app alert preferences`.

### Task 7: Reset, export, and import controls

**Files:**
- Create: `src/components/settings/PreferencesDataTab.tsx`
- Create: `src/components/settings/PreferenceResetPanel.tsx`
- Modify: `src/pages/Settings.jsx`
- Test: `src/components/settings/__tests__/PreferencesDataTab.test.tsx`

**Interfaces:**
- Consumes portability functions from Task 1 and persistence functions from Task 2.

- [ ] **Step 1: Write failing component tests** for export download payload, valid import review/apply, invalid import no-op, section reset, and full reset confirmation.
- [ ] **Step 2: Run the focused test** and verify the components are missing.
- [ ] **Step 3: Implement PreferencesDataTab** using a hidden file input, parsed review summary, version label, and one final `saveAll` call.
- [ ] **Step 4: Implement PreferenceResetPanel** with section allowlists and full reset confirmation text `RESET MY SETTINGS`.
- [ ] **Step 5: Register Reset & Portability** under My Settings.
- [ ] **Step 6: Run Task 7 tests** and commit with `feat(settings): add preference reset and portability`.

### Task 8: Settings control-center polish and end-to-end verification

**Files:**
- Modify: `src/pages/settings/SettingsControlCenter.tsx`
- Modify: `src/pages/settings/settingsControlCenter.derive.ts`
- Modify: `src/pages/settings/__tests__/settingsControlCenter.derive.test.ts`
- Modify: `src/pages/Settings.jsx`
- Modify: `src/hooks/useUserPrefs.js` comments
- Modify: `README.md`

**Interfaces:**
- Personalization KPI strip includes preset, resolved theme, density, favorite counts, default project, and sync state only when backed by real values.

- [ ] **Step 1: Write failing derive tests** for preset/theme/density/favorites/sync summary values.
- [ ] **Step 2: Run the derive test** and verify the missing fields.
- [ ] **Step 3: Update the Settings hero/KPI strip and tab navigation** with consistent icons, responsive labels, and save-state feedback.
- [ ] **Step 4: Update README Settings/product-surface documentation** and remove stale comments claiming preferences are inactive.
- [ ] **Step 5: Run focused Settings tests:** `npm test -- src/lib/userPreferences src/components/settings src/pages/settings src/components/nav/__tests__`.
- [ ] **Step 6: Run quality gates:** `npm run lint`, `npm run typecheck`, `npm run typecheck:js`, `npm run typecheck:strict`, `npm run typecheck:noimplicitany`, `npm test -- --run`, `npm run build`.
- [ ] **Step 7: Start the app and verify desktop/mobile Settings paths**: appearance preview, preset apply, favorites, project ordering, format preview, alert filtering, reset, export, import, reload persistence, and save-error rollback.
- [ ] **Step 8: Inspect `git diff --check` and `git status --short`**, then commit with `feat(settings): complete personalized settings control center`.

