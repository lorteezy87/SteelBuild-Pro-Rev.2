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
| 2026-06-22 · opus-strict-ratchet · TypeScript strictNullChecks CI gate | `tsconfig.strict.json`, `scripts/strict-typecheck.mjs`, `package.json`, `.github/workflows/ci.yml`, the 24 strict-null offender `.ts/.tsx` (schedule/gantt/deliveries/submittals/workpackages/emailinbox pages + shared engines/hooks + `drawingSubmittalHub/format.ts`) | #8 Phase 2: add `typecheck:strict` ratchet gate + burn ~204 errors; grandfather ResourceScheduling.tsx + GanttChart.tsx |

## Recently released

<!-- Move finished claims here briefly, or just delete the row. -->
- 2026-06-20 · opus-db-baseline · MIGRATION FREEZE lifted — baseline squash cutover DONE (3 baseline files in supabase/migrations/, 190 archived, prod schema_migrations reconciled, db push clean). New migrations OK again; follow the ARCHITECTURE.md → Migrations lockstep rule.
