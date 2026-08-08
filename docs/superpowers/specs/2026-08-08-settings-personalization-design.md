# Settings Personalization Design

## Summary

SteelBuild Pro already saves a useful set of personal preferences, but the experience is fragmented: some choices are active, some are marked "not yet active," and some shell behavior is stored only in browser-local keys. This change makes Settings the single personal workspace control center. Existing choices become functional where the app has a real consumer, new role-oriented presets provide a fast starting point, and personal navigation/project choices follow the signed-in user across devices.

The implementation keeps the current React, TanStack Query, Supabase Auth metadata, CSS-token, and Command Control Center architecture. It does not add a new database table or change RLS because preferences are non-authoritative user-owned presentation data and the existing `auth.updateMe` path is already scoped to the signed-in user.

## Goals

- Make personalization changes visible immediately and persist them across sessions/devices.
- Replace scattered local-only preference behavior with one validated preference contract.
- Activate the currently exposed appearance, density, sidebar, hint, default-view, and formatting controls on shared application surfaces.
- Add role-oriented presets without locking users into a role or overwriting later manual choices.
- Add personal navigation favorites and favorite projects.
- Provide safe reset, preview, export, and import controls.
- Preserve the existing SteelBuild dual-theme design, dense desktop workflow, mobile behavior, RBAC, and module feature gates.

## Non-goals

- Preferences do not change project data, permissions, role membership, organization settings, or feature flags.
- This work does not create an email/push delivery service. Notification controls only affect the in-app alert experience that actually exists. Unavailable delivery channels are shown as unavailable rather than as working toggles.
- This work does not redesign every product page or replace domain-specific table/view controls.
- Unit conversion never mutates stored project quantities. It changes supported read-side display only.

## Approaches Considered

### 1. Activate existing settings only

Lowest risk, but it leaves navigation, favorite-project, preset, and portability needs unresolved.

### 2. Add new personalization surfaces only

Visually impressive but compounds the existing split between active and inert settings.

### 3. Unified personalization system (selected)

Create one preference contract, migrate existing consumers onto it, then add presets and personal workspace controls. This costs more implementation effort but produces a coherent result and avoids another layer of one-off storage.

## Information Architecture

The personal portion of Settings will contain these sections:

1. **Profile & Security** — identity, password, MFA, account deletion (existing behavior retained).
2. **Appearance** — system/light/dark theme, accent, font scale, contrast, reduced motion, global density, and live preview.
3. **Workspace** — workflow preset, default landing page, default/favorite projects, navigation favorites, sidebar behavior, default view, tooltips, project-number visibility, keyboard hints, and automatic drawer behavior.
4. **Dashboard** — pinned modules, KPI visibility/order, auto-refresh, density, and welcome panel (existing behavior retained; navigation favorites use the same canonical module list).
5. **Formats** — date, time, week start, measurement units, currency, and number format with live examples.
6. **Notifications** — in-app alert categories, thresholds, and quiet hours. Email/digest controls are disabled with an honest availability label until a dispatcher exists.
7. **Shortcuts** — existing reference plus the saved keyboard-hint preference.
8. **Reset & Portability** — reset one section or all personal preferences; export/import a versioned JSON preference file.

Admin-only workspace settings remain separate and unchanged.

## Preference Contract

A new pure preference module owns defaults, validation, sanitization, preset application, import/export, and compatibility aliases. Existing metadata keys remain stable so current users retain their choices.

Key groups:

- Appearance: `theme`, `accent_color`, `font_scale`, `contrast_mode`, `motion_mode`, `table_density`.
- Formats: `date_format`, `time_format`, `week_start`, `measurement_units`, `currency_format`, `number_format`.
- Workspace: `workspace_preset`, `default_landing`, `default_project_id`, `favorite_project_ids`, `pinned_modules`, `sidebar_mode`, `show_recent_pages`, `default_view`, `show_tooltips`, `show_project_numbers`, `show_keyboard_hints`, `auto_open_drawers`.
- Dashboard: `auto_refresh_secs`, `visible_kpis`, `kpi_order`, `dashboard_density`, `show_welcome`.
- In-app alerts: existing `notify_*`, threshold, and quiet-hour keys.
- Portability: `preferences_version` included in exported data and saved metadata.

Unknown, malformed, privilege-bearing, or obsolete keys are rejected by the preference sanitizer. Import never accepts identity, role, organization, project membership, billing, or feature-flag fields.

## Presets

Presets are starting points, not permanent modes:

- **Project Manager** — Dashboard landing, drawings/RFIs/submittals/schedule favorites, normal density, operational KPIs.
- **Field** — Field Today landing, field/deliveries/punchlist/safety favorites, comfortable touch density, reduced dashboard clutter.
- **Fabrication** — Piece Register landing, piece/fabrication/deliveries favorites, compact density, production KPIs.
- **Executive** — Portfolio/Dashboard landing, projects/financials/reports favorites, comfortable density, commercial and risk KPIs.
- **Custom** — automatically shown after the user changes a preset-owned field.

Applying a preset displays an exact change summary and requires one confirmation click. It only writes personal preferences and never changes permissions.

## Runtime and Data Flow

1. AuthContext hydrates the signed-in user's metadata.
2. `useUserPrefs` sanitizes metadata through the canonical contract and returns a stable preference object.
3. Settings edits optimistically update local state and the runtime preference cache, then persist through `auth.updateMe`.
4. A failed save rolls the edited value back and shows a specific error.
5. Theme and shell preferences are mirrored to namespaced localStorage keys only for pre-React/no-flash bootstrapping. Supabase metadata remains the cross-device source of truth.
6. Root data attributes drive global density, tooltip visibility, font scale, contrast, and motion.
7. Shared formatters read the current validated runtime preference snapshot. High-traffic shared date, money, and number utilities route through these formatters.
8. Sidebar and project-picker components consume the same preferences for favorites, recents, rail/expanded behavior, and project ordering.
9. In-app alert queries apply category and quiet-hours filtering before badge counts and dropdown rows are derived.

## UI Behavior

- Settings navigation uses accessible buttons with icons, section descriptions, and a dirty/saving/saved/error state.
- Most simple choices save immediately. Multi-field operations (preset, import, reset) show a review/confirmation panel and save once.
- Appearance and format controls include a live preview card using representative SteelBuild data: drawing number, piece mark, due date, tonnage, currency, and status.
- A personalization summary shows selected preset, theme, density, favorite count, default project, and sync status.
- Mobile settings use a horizontally scrollable section selector and one-column controls.
- Disabled delivery channels are visually distinct and explain what backend capability is missing.

## Error Handling

- Invalid preference values fall back to defaults without crashing the app.
- Save failures restore the previous value and retain the user's attempted value in the control long enough to retry.
- Imports are parsed and validated before any save. Invalid files produce field-level errors and do not partially apply.
- Deleted or inaccessible favorite projects/modules are automatically filtered from display but preserved only when still valid.
- System-theme mode follows OS changes and does not overwrite the stored `system` selection with the resolved light/dark value.

## Testing

- Pure tests for defaults, sanitization, presets, import/export, and formatting.
- Hook/component tests for optimistic saves, rollback, preset confirmation, reset, favorite ordering, and disabled notification delivery channels.
- Shell tests for theme-system resolution, density attributes, sidebar mode, favorites, tooltips, and alert filtering/quiet hours.
- Existing Settings, theme, dashboard, navigation, auth, and formatting tests remain green.
- Full lint, TypeScript/JavaScript typechecks, strict ratchets, Vitest, production build, and a focused browser pass at desktop and mobile widths.

## Completion Criteria

- No interactive Settings control is labeled saved-but-inert.
- Every enabled personal setting has a tested runtime consumer.
- Personal choices persist through the existing signed-in-user metadata path and restore on another session.
- Presets, favorites, reset, export, and import work without changing authorization or project data.
- Existing app navigation, project access, dashboard behavior, and CI gates remain functional.
