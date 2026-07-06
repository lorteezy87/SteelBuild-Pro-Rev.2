# Agent Claims — concurrent-work coordination board

Multiple AI agent sessions write to `main` at the same time. This file is a
lightweight, in-repo "who's touching what right now" board so agents don't
clobber each other's files. It is a **convention, not a lock** — but a claim
that overlaps yours is your early warning to pick a different slice or
coordinate before editing.

## Protocol (every session that edits code)

1. **Before editing:** `git pull origin main`, read **Active claims** below, and
   check whether your target files/areas overlap an open claim.
   - Overlap? Pick a different slice, scope tightly around it, or wait.
2. **Claim it:** add one row to **Active claims** (date UTC · session slug ·
   area · files/globs · one-line intent), then commit *just this file*
   (`git add AGENT_CLAIMS.md`) and push. One row per active session.
3. **Work** in your claimed area; commit + push real changes as usual.
4. **Release:** when the session ends (or you leave the area), delete your row,
   commit this file, and push.

Notes:
- A merge conflict **on this file** is expected and good — it means another
  agent is active. Resolve by keeping both rows.
- Stale rows (date > 2 days old) — assume the session ended; remove them.
- This board does not replace the git-safety rules (CLAUDE.md §7): explicit
  staging, no force-push, deploy only when asked.

## Active claims

| Claimed (UTC) | Session | Area | Files / globs | Intent |
|---|---|---|---|---|
| 2026-06-28T10:47:45Z | dash-theme-cont-5pages | Dashboard reference continuation — field/quality pages | src/pages/Drawings.jsx, src/pages/Inspections.jsx, src/pages/Photos.jsx, src/pages/Punchlist.jsx, src/pages/QualityControl.jsx, src/pages/Safety.jsx | Add dashboard shell class to page roots to inherit reference chrome spacing/theme. |
| 2026-06-28T11:14:21Z | dash-theme-cont-5pages-2 | Dashboard reference continuation — field hub pages | src/pages/FieldHub.jsx, src/pages/Inspections.jsx, src/pages/Photos.jsx, src/pages/Punchlist.jsx, src/pages/QualityControl.jsx, src/pages/Safety.jsx | Continue adding reference page wrapper to additional non-excluded field surfaces. |
| 2026-06-28T04:33:06Z | dash-theme-rollout | Dashboard theme rollout | src/Layout.jsx src/pages/Dashboard.jsx src/pages/dashboard/DashboardHeader.jsx src/components/nav/SidebarNav.jsx src/boot/LayoutRoute.jsx | Expand dashboard chrome to additional non-excluded routes and align dashboard header/route targeting. |
| 2026-06-28T09:53:40Z | dash-theme-5pages | Dashboard reference UX polish | src/pages/Settings.jsx src/pages/RFIs.jsx src/pages/Documents.jsx src/pages/ActionItems.jsx src/pages/ChangeRequests.jsx src/pages/ProjectMembers.jsx src/components/nav/ProjectPillDropdown.jsx src/components/nav/TopBarSearchButton.jsx | Apply reference dashboard page shell styling to 5+ pages while keeping current routing/navigation changes. |
| 2026-06-28T17:42:00Z | dark-theme-full-app | Full app dark theme (parallel agents) | src/components/ui/**/* src/components/design-system/**/* src/components/shared/**/* src/components/drawings/**/* src/components/submittals/**/* src/components/schedule/**/* src/components/gantt/**/* src/components/financials/**/* src/components/viewer/**/* src/pages/!(Dashboard|RFIs|Documents|Settings|ActionItems|ChangeRequests|ProjectMembers)/* (all other domains + viewers + base UI; coordinate around active dash claims) | Complete consistent SteelBuild dark (steelbuild-dark + tokens + sbd- classes) across entire app with parallel agents. Fix light color leaks, ensure full dark mode compliance and token usage. |
| 2026-06-29T06:30:00Z | opus-command-ui-lock | ⚠ OWNER LOCK: command_ui LIGHT Control Centers — do NOT dark-theme | src/pages/dashboardCC/**/* · src/pages/commandCenter/**/* · src/pages/rfis/RfiControlCenter.tsx · src/pages/rfis/rfiControlCenter.derive.ts · src/pages/costHub/CostControlCenter.tsx · src/pages/costHub/costControlCenter.derive.ts · src/components/command/**/* · src/styles/command.css | **Owner directive — these are the INTENTIONALLY-LIGHT `command_ui` direction** (the photographic-tile Dashboard + RFI / Command / Cost Control Centers), a separate track from the dark rollout. The dark sweep already regressed the Dashboard (stripped the photo tiles → restored) and broke native-`<select>` option contrast on light surfaces (`base.css`, now fixed). Do NOT apply `steelbuild-dark` / dark tokens / `sbd-*` to these files or wrap them in dark chrome. If a command_ui page looks "too light," that's intended — coordinate with the owner before changing. |
| 2026-06-29T18:45:00Z | opus-lazychunk-cache | Lazy-chunk 404 prod incident — cache headers | vercel.json | Immutable Cache-Control on /assets/* so deploy-storm chunk rotation stops 404ing active users' lazy-loaded PDF viewer + revision-upload modal (PDF won't open / can't upload revision). |
| 2026-06-30T00:00:00Z | opus-detailing-panel-light | Detailing CC panels → kit light palette (owner-directed) | src/styles/command.css (ADDITIVE `.detailing-cc` block only — does NOT alter existing rules) | Make the shipped command_ui Detailing panels read light to match the shell: scoped token-alias + `desk-*`/`sbd-*` re-declaration under `[data-skin="command"] .detailing-cc`. **Light-aligned with `opus-command-ui-lock`** (keeps command_ui light, never dark-themes it); owner-directed (Nick, 2026-06-30). |
| 2026-07-01T00:00:00Z | enterprise-readiness | Enterprise-readiness audit remediation (base = fresh origin/main worktree). **Respecting** opus-command-ui-lock + detailing-panel-light (NOT touching `src/components/command/**` or `src/styles/command.css`) and opus-lazychunk-cache (NOT touching `vercel.json`) — those items deferred to owner checklist. | docs (README/ARCHITECTURE/TECH_DEBT/AGENTS), .gitignore, public/.well-known/**, docs/runbooks/**, supabase/migrations/**, supabase/functions/**, .github/workflows/ci.yml, package.json, src/lib/query-client.ts, src/instrument.js, src/lib/AuthContext.tsx, src/services/auditLogger.ts, src/styles/base.css (ADDITIVE focus-ring only), src/components/design-system/**, src/components/shared/**, src/pages/{Privacy,Terms,Security,Landing}.jsx + non-command form modals | 133-finding audit remediation: RLS role-floor, edge-fn hardening, a11y (excl. command_ui palette), CI/CD, docs, compliance. |
| 2026-07-05T00:00:00Z | opus-detailing-cc-2c | Detailing CC native re-skin — Slice 2c (Doc Control). **Respecting** opus-detailing-panel-light (NOT touching `src/styles/command.css` — reuse existing `cmd-*` + `.detailing-cc`). Presentation-only, flag-gated `command_ui`, no query/mutation/cache-key changes. | src/components/drawings/register/DocControlPanel.tsx, src/components/drawings/register/DrawingRegisterGrid.tsx, src/components/drawings/register/ReviewQueue.tsx, src/components/drawings/register/ImpactBoard.tsx, src/components/drawings/register/TransmittalLog.tsx, + NEW: src/components/drawings/register/docControl.derive.ts, src/components/drawings/register/*Panel.tsx (on-skin views) + __tests__ | Re-skin the Doc Control sub-nav + 4 child views (Register/Reviews/Impacts/Transmittals) onto the command_ui kit, `commandUi ? <Panel/> : <Legacy/>` per view so flag-off is byte-identical; pure per-view derivations → tested docControl.derive.ts. |

## Recently released
- 2026-06-22 · opus-gtm-batch · GTM readiness batch SHIPPED + field-verified — security headers (HSTS + Permissions-Policy + CSP Report-Only in `vercel.json`), public legal pages (`Privacy/Terms/Security.jsx` + `App.jsx` short-circuit), demo form → `public.demo_requests` (migration `20260623032908`, anon insert / admin select; Landing wired), `package.json` engines. Storage backfill = WRITTEN ONLY (`scripts/storage-backfill-legacy-uploads.mjs`, dry-run) — see runbook `docs/HANDOFF-2026-06-22-gtm-batch.md`. Owner follow-ups: demo email-notify, flip CSP→enforcing, legal counsel review, E2E enable, Sentry alerts, a11y pass.

<!-- Move finished claims here briefly, or just delete the row. -->
- 2026-06-22 · opus-noimplicitany · noImplicitAny CI ratchet SHIPPED — `npm run typecheck:noimplicitany` now blocks the `ci` job (sibling of typecheck:strict, shares `scripts/lib/tscDiagnostics.mjs`). Core `services/workflowEngine.ts` + tests + small pages cleaned; 13 heavy schedule/gantt/procurement/submittal/work-package pages grandfathered in `NOIMPLICITANY_IGNORE` — SHRINK that list, never grow it.
- 2026-06-22 · opus-strict-ratchet · strictNullChecks CI ratchet SHIPPED — `npm run typecheck:strict` (filter script, not naive exclude) now blocks the `ci` job; all 395 strict-null errors resolved except ResourceScheduling.tsx + GanttChart.tsx (grandfathered in `scripts/strict-typecheck.mjs` STRICT_NULL_IGNORE — SHRINK that list, never grow it). Both type-safety gates share the filter. Design: `docs/superpowers/specs/2026-06-22-strictnullchecks-ratchet-design.md`.
- 2026-06-20 · opus-db-baseline · MIGRATION FREEZE lifted — baseline squash cutover DONE (3 baseline files in supabase/migrations/, 190 archived, prod schema_migrations reconciled, db push clean). New migrations OK again; follow the ARCHITECTURE.md → Migrations lockstep rule.


