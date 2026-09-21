# SteelBuild Pro

## Stack
Vite, React 18, TypeScript, Supabase (project: kjrwqagyeswwoxpjkcko), Tailwind. Hosted on Cloudflare Workers (see Deploy).

Data layer: import `entities`/`auth`/`integrations`/`functions`/`getSignedUrl` from `@/api/supabaseClient` — a thin re-export barrel. The implementation lives in `src/api/client/*` domain modules (entities, auth, storage, uploads, llm, functions, entityClient, fieldMapping, …), not inline in supabaseClient.ts.

## Production Control scoring
`src/utils/pccEngine.ts` is the typed deterministic boundary for Production Control scoring. It exports the raw record contracts, normalized `PCCItem`, `ScoredPCCItem`, execution-window/owner-load/briefing results, and release-gate action drafts. Preserve its formulas, stable score ordering, local-calendar-day date semantics, status mappings, and output keys. Extend the narrow source interfaces when a real producer adds a field; do not bypass them with `any` or duplicate scoring in UI code.

## Commands
- `npm run dev` — local dev server
- `npm run lint` — lint (must be clean before commit)
- `npm run test` — full test suite (6,470 tests / 678 files as of 2026-09-19)
- `npm run build` — production build
- CI gates — every PR must pass all of them: `lint`, `typecheck`, `typecheck:js`, `typecheck:strict`, `typecheck:noimplicitany`, `check:no-new-js`, `test`, `build`.
  - New source files must be `.ts`/`.tsx` (enforced by `check:no-new-js`). Editing existing `.js`/`.jsx` files is fine.
- Tests run with `TZ=UTC` (`vite.config.js`), which hides local-vs-UTC bugs.
  - A test that must prove local-day behaviour has to inject the zone, for example by stubbing the date conversion or the `Date` getters.
  - Building dates from local parts passes vacuously on the UTC runner.

## Deploy — Cloudflare Workers
- **Production:** the static-asset Worker `steelbuild-pro-rev-2`, configured in `wrangler.jsonc`.
- **Publishing:** only CI's gated "Deploy to Cloudflare Workers (production)" job publishes it, after a green `ci` run. PRs get a Cloudflare preview.
- **Custom domains:** `steelbuild-pro.com` and `www.steelbuild-pro.com`.
- **Vercel is retired.** Don't reintroduce it.
- **`wrangler.jsonc`:** keep `workers_dev` and `preview_urls` set explicitly. Adding `routes` silently turns both off, which once broke the post-deploy health check.

## Design system: SteelBuild dual theme
- Colors: CSS variables only (`var(--bg-*)`, `var(--text-*)`, `var(--accent)`, `var(--cmd-*)`, `var(--sbd-*)`). Never hardcode surface/text/border hex in components.
- Dark: SteelBuild Dark (`data-theme="dark"` + `html.steelbuild-dark`); accent gold `#C89B20` / `#E0B030`.
- Light: `[data-theme="light"]`; command Control Centers use `[data-skin="command"]` with `--cmd-*` (dark remap aliases SteelBuild Dark).
- Fonts: Barlow Condensed (display), Inter (body), IBM Plex Mono (numeric/code).
- Radius: use the shipped token/component radii for each kit; do not reintroduce a fake 2px-only rule.
- Theme preference: `sbp-theme` in localStorage, else `prefers-color-scheme`.
- Never use `<form>` tags. Never use Radix Dialog.

## Database / RLS
- All tables must have RLS enabled with explicit per-role policies. No blanket-`true` policies.
- Check `auth_rls_initplan` pattern on any new policy — wrap `auth.uid()` calls in `(select ...)`.
- SECURITY DEFINER functions must set `search_path` explicitly.
- Known-fixed classes of bugs (do not reintroduce): feature_flags privilege escalation, vendors blanket-true policies.

## Applying a migration — the file lands with the stamp, DO NOT regress
`supabase db push` **cannot run against this project**: 42 versions in the remote ledger have no local file (41 of them owned by the sibling 2026 app), and the CLI refuses rather than understanding a database two repos share. Its own suggested remedy, `migration repair --status reverted`, would mark those applied migrations as reverted and **corrupt the ledger for both apps** — never run it. MCP `apply_migration` is also out: it stamps its own apply-time version, which is how the ledger drifted from the repo in the first place.

So migrations here are applied and stamped by hand, and *that* is what makes the ordering a rule rather than a nicety:

- **Commit the file in the same change that applies the migration — file first if anything.** `Supabase drift check` reads production's ledger against the repo's `supabase/migrations/` on **every branch**, so a stamp whose file is still unmerged turns `main` red *and* every open PR red, each one a PR whose own diff is innocent. This has happened three times in two days: `20260919082758` (#441), `20260920014500` (#445), `20260921034212` (#455). Each cost several sessions a red-CI diagnosis.
- **The name must be the stamped ledger version**, not the authoring timestamp — the check matches local filenames against remote versions.
- **Verify the committed file against the ledger payload** (`supabase_migrations.schema_migrations.statements`) rather than trusting that it is what ran. Hash it.
- **Never clear a drift failure by weakening the check** — no manifest override, no exclusion, no deleting the stamp. Production holding an asset the repo can't account for is exactly the condition the check exists to catch on a shared database. Land the file.
- If a drift failure names a version another branch already carries, **port that file alone** (byte-identical, so neither branch conflicts) instead of waiting for that PR to merge.

## Number-sequence integrity — DO NOT regress
Official record numbers (RFI/CO/submittal/…) come ONLY from the atomic DB RPC `get_next_sequence_number` — never derive the next number client-side. `src/components/shared/numberSequencing.jsx` once floored the RPC with a client-side `Math.max()`, which could mint duplicate numbers under concurrency; that was removed (fixed c5612168) — `getNextFormattedNumber` now re-allocates from the RPC until it clears any existing records, and fails closed if the RPC is unavailable. Keep it RPC-only. Gated by a hook (see `.claude/hooks/`).

## Linked-RFI id spaces — two columns, same name, different types
`drawings.linked_rfi_ids` is **text**: a comma-separated list of RFI *numbers* ("RFI #001, RFI #002" — what SheetFormModal asks detailers to type). `submittals.linked_rfi_ids` is **uuid[]**: FKs to `rfis.id`. `drawing_sets` has no such column at all. Never pool them into one set. Match numbers with the canonical `normNum` + `linkedRfiNumbers` from `src/lib/fabReleaseGate.ts` — comma-only split, `toUpperCase().replace(/[^A-Z0-9]/g,"")`. Hand-rolled variants have shipped twice that split on whitespace or kept the `#`, so "RFI #001" never matched and packages reported "Fab ready" with an open RFI against them (fixed e40711b8, df1d885e).

## Absence is not evidence
A NULL optional column means *unknown*, not *false* — never render it as an affirmative negative. The downstream date columns (`fabrication_finish_date` / `final_delivery_date` / `ready_for_install_date`) are hand-keyed in SheetFormModal and NULL on most projects; treating that as "not downstream" told users a revision was caught pre-fab on steel that may already be erected, and persisted the verdict to `drawing_revision_summaries`. `computeRevisionImpact` has a distinct `"unknown"` severity for this — keep the distinction in any new derivation (fixed 3e0320de). Same rule for the model roster: it is loaded lazily, so an empty array means "not loaded", not "none imported".

## Document Control intake — DO NOT regress
`src/lib/docControl/` is the typed deterministic boundary for reading an incoming document: title block, register cross-reference, change summary, seal/approval findings, ingestion payload. Its rules below look like over-caution and are not.
- **`DocField.observed` separates unknown from blank.** `observed: true, value: null` is "we read the box and it was empty" — a finding. `observed: false` is "nobody looked". Collapsing them tells a PM the EOR shipped an empty title block when the truth is the PDF was a scan. Same rule as *Absence is not evidence* above, applied per field.
- **Machine evidence can never report a seal or signature ABSENT.** Seals are raster images and signatures are ink, so a text layer proves only `present` or `unverifiable`. Only `attestFromHuman` — somebody who looked at the sheet — may say `absent`, and only that raises a blocker. Blocking on `unverifiable` would block every document and the flag would be trained out in a week.
- **Line work is never reported as unchanged.** Geometry lives in the PDF content stream, not the text layer: a brace can move and a weld size change without one character of text moving. `buildChangeSummary` always emits a non-comparable line-work bullet; there is no `comparable: true` branch to add without real geometry comparison.
- **Capped page text is not a clean bill of health.** Page text stops at 2400 chars (`PAGE_TEXT_TRUNCATION_MARKER`, `src/lib/pageTextFormat.ts`). Two capped pages that match on what was captured say nothing about the rest — report non-comparable, never "identical".
- **A row-capped register read cannot call a sheet new.** Compare against `EFFECTIVE_LIST_CAP`, not `LIST_ROW_CAP`, and let the engine say `register-incomplete`.
- **`extracted_text` and `callouts` had no producer for a year.** Both columns were read by `drawingSetUploadHelpers` off `sheet.*` values nothing ever set, so both were empty on every row (225/225 as of 2026-09-19). `attachPageText` and `detectCallouts` are those producers now — a new upload path must populate them, and must write only when the page was actually harvested, so an unread page never records a false blank.

## Detailing Control Center — DO NOT regress
- **Model roster is lazy.** Live rosters reach ~28k rows and PostgREST caps a request at 1000, so `fetchAllModelElements` pages. Anything needing only "does a roster exist" uses `countModelElements()` (one HEAD request, zero rows). Never gate a *displayed claim* on the unloaded array.
- **Importers own their roster read.** `parseModelElementsCsv` decides create-vs-update purely from `existingElements`; a truncated or empty value silently duplicates the whole roster via `bulkCreate` (a plain insert, no upsert). Import modals must fetch and page it themselves, never take it as a prop (fixed 0d88e7b7).
- **`isClosedPackage` ≠ released.** It is terminal-*for-triage* and also fires on Void submittals and the deprecated `set_approval_status='approved'`. Use `isPackageReleasedForFab` for anything claiming the shop received work.
- **`drawings` has only `reviewer`** — no `assigned_to`, no `ball_in_court`. Those exist on `submittals` only.
- **Gate controls on the write validator**, not a hand-written weaker condition — use the `canWrite*` predicates in `format.ts`.
- **Row caps:** `LIST_ROW_CAP` (2000) is what a request *asks* for; `SERVER_MAX_ROWS` (1000) is PostgREST's `db-max-rows`. Truncation detectors must compare against `EFFECTIVE_LIST_CAP` (the min), or they can never fire.
- **Bulk edit must respect gates.** `handleBulkEdit` in `pages/drawings/useDrawingsPageController.ts` must use `validateStageTransition` and `classifyDrawingStageMutation` when updating `stage` to prevent bypassing submittal approval gates (fixed 2026-09-13).
- **Three predicates, three different questions — do not collapse them** (audit 2026-09-19).
  - `isPackageReleasedForFab` — "the shop has it". Drives the **Released KPI** and the Drawing Register's **Released column** and green row accent. Both must use it, or they contradict each other.
  - `isClosedPackage` — terminal *for triage*. Also fires on a Void-only set and on the deprecated `set_approval_status="approved"`, neither of which means the shop received anything. Use it ONLY to suppress the late flag.
  - `effectiveDetailingState` — the operational state, for display.
  The register once used `isClosedPackage` for the Released column under a comment claiming it matched the KPI. It did not.
- **`registerStatusTone` is exhaustive on purpose.** The register's Status chip used to tone via a regex whose first alternative tested `"Released for Fabrication"` and `"Approved"` — those are SUBMITTAL statuses, never returned by `effectiveDetailingState`, so they matched nothing and `"Released"` fell through to the same neutral grey as `"Not Started"`, beside a green Released column. Tone from the canonical `DETAILING_STATE_ORDER` vocabulary; a test asserts `"Not Started"` is the only state that tones neutral.
- **Every triage tally counts OPEN items.** `buildTriage`'s `overdue` / `dueSoon` / `needsAction` / `noDate` all derive from `openItems` (`!item.closed`). `atRiskCount` alone read `setItems` and so counted closed packages: a released one is harmless (its state outranks every risk milestone) but a **Void-only set derives to "Not Started"**, the bottom of the order, and reported CRITICAL schedule risk forever on work nobody will touch again.

## Schedule tasks — DO NOT regress
- **Two CHECK constraints decide what saves.** `chk_schedule_tasks_status` accepts
  only `Not Started / In Progress / Complete / On Hold / Delayed` — **`Cancelled`
  is not a status** and was offered by two dropdowns where it could never save.
  `schedule_status_pct_consistency` then ties status to `percent_complete`. A
  CHECK is evaluated against the **whole resulting row**, so an UPDATE sending
  `status` alone is validated against the percent already *stored*: → Complete
  needs 100, → Not Started needs 0, → In Progress needs < 100. Every write path
  except the bulk toolbar violated this, which made marking a task Complete and
  reopening a finished one fail with a raw Postgres constraint name. Take the
  vocabulary from `SCHEDULE_STATUSES` and let `withReconciledPercent` set the
  percent — never hand-write either (`src/lib/schedule/taskStatus.ts`).
- **Reopening clears the percent to NULL on purpose.** Complete → 100 and
  Not Started → 0 are definitional; In Progress is not. The transition says the
  task is no longer done but not how much remains, so the percent becomes
  *unknown*. Don't "fix" that by inventing 0 or 99.
- **Two percent readers, and they are not interchangeable.**
  `percentCompleteOrNull` returns null when unknown — use it for any **claim**
  (a printed figure, an average, a stalled test). `displayPct` flattens unknown
  to 0 — use it only where the number is **geometry** (a bar width, a fill
  fraction). This is the "Absence is not evidence" rule above: a reopened task
  read through `displayPct` prints "0%" and lands in the stalled filter one click
  after showing 100%.
- **One write path.** Every task update goes through `updateTaskMut` →
  `buildTaskUpdate` (`src/pages/schedule/useScheduleMutations.ts`), which is
  where actuals stamping, the status/percent reconciliation, the milestone
  columns and the assignment pair are applied. The Gantt's inline editor, the
  Task List's inline editor and the bar drag each used to inline their own
  `entities.ScheduleTask.update` and so stamped no `actual_finish_date`.
  **`ScheduleBody` must write nothing** — a component that cannot call the
  database cannot swallow its errors (a test asserts this).
- **Duration is inclusive calendar days.** Mon → Fri is 5, a same-day task is 1.
  Derive it with `durationFromDates` / `finishFromDuration`
  (`src/lib/schedule/duration.ts`); the dates are the truth and the stored column
  mirrors them via a trigger. Bulk Add was left on the old exclusive arithmetic
  when this was unified and produced a bar one day long on every row it wrote —
  never re-derive this inline.
- **Milestone is three columns, assignment is two.** `isMilestoneTask` ORs
  `task_type` / `is_milestone` / `milestone`, and `taskOwner` reads
  `resource_names || assigned_to`. Writers must set every column a reader might
  look at — use `withMilestoneFlags` and `withAssignmentPair`. Writing one half
  is how milestones stayed invisible to the calendar and reports, and how typing
  in the Task List's "Assigned To" cell saved and changed nothing visible.

## Drawings & submittals — how the team works
- **Submittals are the workflow source of truth** for a set's stage, not `drawings.stage`. Fab release requires IFC / Released.
- **One submittal per drawing set.** When a few pages need revising, the team creates a **new drawing set (new name) with a new submittal**, not new rounds on the original set.
  - Nothing in the data links the new set to the one it revises.
  - So the old pages stay live unless something explicitly marks them superseded.
  - Design drawing features around set-per-revision.

## Sibling app: SteelBuild-Pro-2026
- `lorteezy87/SteelBuild-Pro-2026` is a **reference only**. Borrow ideas, layout and logic from it, not code wholesale; Rev.2 is the product.
- Both apps share the production Supabase project, and which repo owns the schema is still undecided.
- Without the owner's say-so, don't add migrations for 2026-only tables or columns: `gc_drawings`, `drawing_transmittal_activity`, transmittal `status`/`submittal_id`, `submittals.stage_entered_at`.

## MCP server
`steelbuild-mcp-server` — 18 tools across portfolio/coordination/commercial/logistics domains. Authenticates via user JWT so RLS applies automatically. Don't bypass this with service-role calls in application code.

## Branches — PRs target `main`
`main` is the integration and GitHub default branch (verified 2026-09-11). Open PRs against `main`. Check the live default branch and `git rev-list --count origin/main..HEAD` before opening a PR; older notes naming `codex/base44-deploy-nick` are stale.

## Workflow rules
- There is no legal issue or legal hold involving S&H Steel and this app (confirmed by the owner, 2026-09-11). An earlier version of this file said otherwise; that was false. Don't reintroduce it, and don't treat billing, multi-tenant signup or marketing work as blocked. (S&H Steel is the founding customer org; references to it in the repo are ordinary domain and seed data.)
- Git safety: stage files explicitly, never force-push, and deploy only when asked.
- Before touching Stripe/webhook code: idempotency is already implemented, don't remove it.
- Playwright E2E spec for the fab-release gate must stay green — this is a P0 path.

## What NOT to put in this file
Anything procedural (audit checklists, migration steps, RFI Copilot testing flow) belongs in `.claude/skills/`, not here. If Claude already does something right without being told, delete the line.
