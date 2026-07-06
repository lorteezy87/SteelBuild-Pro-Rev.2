# SteelBuild Pro — To-Do

> Rebuilt 2026-06-16 from the commit log + tracked open items. Keep this current
> as the durable backlog (the previous list lived only in a chat session).
> Sizes: XS/S/M/L. Check items off as they ship. Last refreshed 2026-06-19.

## Thread A — 3D Viewer / IFC

**Recently shipped:** perf at real scale (`9be4a757`), optimistic recolor (`b6f344d7`),
multi-select bulk assign (`1b07a53d`), persist color mode + gzip upload (`b6ce5fd1`),
assign-by-live-mark / guid-drift (`7381972d`), repaint fab colors on reload (`484e8853`).

- [x] **Fab status "not saving" on Capstone — RESOLVED 2026-06-18: it was LOAD LATENCY, not data loss.** The user confirmed colors DO persist — they just appear a few seconds late on reload. Root cause = the timing hypothesis: Capstone's roster is **16,771** `model_elements` fetched in ~17 paginated 1000-row chunks, so the recolor pass runs before the full roster lands and the colors "pop in" once it finishes replaying. The read-only DB profile confirmed the data was always correct — every `element_guid` a 22-char IFC GlobalId (e.g. `0__vuloFL6HfTRhQ4e4C$I`), 13,664 with `fab_status` (13,195 erected / 469 not_started / 3,107 null) — which is exactly why guid-format / CSV-only / empty-roster were all ruled out. The earlier "STILL OPEN, root cause not found" framing was wrong: nothing was failing to save.
- [x] **Fab-color load-latency polish (Capstone surfaced it) — DONE 2026-06-18.** (a) Silenced web-ifc's wasm console flood (`SetLogLevel(LOG_LEVEL_OFF)` in `ifcEngine.js`) + removed the spent `[fab-diag]` instrument. (b) **Faster roster fetch:** `fetchAllModelElements` now takes one HEAD count then fetches every page CONCURRENTLY (`Promise.all`) instead of ~17 serial round-trips — the dominant cause of the late paint; ~2 round-trips now (5 tests rewritten, green). (c) **"Loading … colors…" chip** in `Model3DTab` while the roster query is in-flight and a roster-dependent mode (fab/sequence/status) is active, so the residual lag reads as loading not failure (threaded `isLoading` from the Hub's model-elements query). Code-verified (test+build); worth a 10-sec field check on Capstone that the chip shows then colors land fast.
- [~] CSV-sourced rosters can't color — `element_guid` is NULL on CSV imports → guid-keyed coloring skips them. **Mark-keyed fallback SHIPPED** without the feared upfront mark pass: `colorFnFor` now resolves a part's GUID→mark via the existing IFC-roster bridge (`buildMarkByGuid`) and falls back to mark-keyed maps (`buildFab/Seq/StatusByMark` + `marksByStatus` on the status summary). Strictly additive (GUID-keyed stays primary; no per-mesh `getPropertySets` cost). Now colors CSV `sequence_number` and the un-updated parts of a multi-part assembly. **Residual:** a project with ONLY CSV rows (no IFC roster) still has no geometry↔mark link, so the bridge is empty — unsolvable without an upfront mark pass; out of scope. Unit-tested; not yet field-verified against a real EPM/Tekla CSV + IFC pair.
- [x] "Academy MS Mesa" IFC extracts 0 elements — ROOT CAUSE = the `25421_3D-Model_051526.ifc` export contained **no** IfcBeam/Column/Plate/Member (`model_registry.metadata.parts=0` on both its imports; 9.75 MB file, so not empty — a reference/proxy export, members as IfcBuildingElementProxy). The user's re-export `25421_3D-Model_051226.ifc` parses fine (7,419 parts, all GUIDs). The real defect was the **silent zero**: a 0-part IFC still uploaded + saved an empty, uncolorable model with a success toast, and the viewer rendered an empty scene with no explanation. FIXED: `persistModel` now stops a 0-member import with an actionable warning (re-export with structural members) instead of saving junk; `IfcModelViewer` shows an empty-state overlay when 0 parts render. (Not done: broadening the parser to extract IfcBuildingElementProxy as members — would need the proxy file to confirm the proxies carry marks/geometry; the corrected export is the supported path.)
- [ ] Perf lever if still choppy at ~12k draw calls — merge meshes by color bucket / InstancedMesh. (L)
- [x] `scripts/check-ifc-type.mjs` — committed as a kept web-ifc element-type dev probe.
- [x] Remove the temporary `[fab-debug]` console logging — removed (`a1b096a4`). Root cause was the structural 1000-row roster cap (fixed by pagination), so the diagnostics had served their purpose.
- [ ] Deferred polish — sequence playback, spatial RFI pins, model↔sheet click-through, sectioning / hide-isolate. (L)

## Thread B — Multi-tenant SaaS / Monetization

**Recently shipped:** org-boundary isolation (`c83c7ab7`), app-files tenant isolation (`2258e902`),
landing redesign (`93a503a9`), billing plan-limit enforcement (`fea77911`),
self-serve signup + email verify (`25ac9c9a`), upload org-resolution hardening (`cc534b30`/`366616fc`),
logo refresh across splash/favicon/social + sign-in modal (`c90d836b`).

- [x] **Brand: square apple-touch-icon — DONE 2026-06-19.** Generated `steelbuild-pro-icon-180.png` + `-512.png` (the 3:2 wordmark centered on a square dark field sampled from the logo bg, so iOS can't letterbox/crop) and pointed explicit `apple-touch-icon` links at them in index.html. Verified the 180 render. Favicon/splash/og unchanged (already correct).
- [~] **Invites → Stripe billing** — note was STALE ("needs a Stripe account"): billing is LIVE (sk_live; checkout/portal/webhook; `organizations.plan` anchor) and invite→accept→checkout→entitlement work end-to-end (`organization_invitations` + `accept_invitation` member-limit gate + `Billing.jsx` + `plan_member_limit`). **Server-side invite-creation gate SHIPPED 2026-06-18** (`20260618000000_org_invite_limit_gate`, applied live): `createInvitation` previously had NO server limit (a free/pro org could mint unlimited pending invites, blocked only at accept) — a BEFORE-INSERT trigger now rejects a new invite once members+pending ≥ plan limit, failing OPEN on unlimited plans (verified: only org = S&H on enterprise, unaffected; trigger attached). **Seat-capacity meter SHIPPED 2026-06-19 (`1afbf7b7`)** on the Team page (X/Y seats + member/pending breakdown, amber at ≥80% / red at limit, "Unlimited" for Business/Enterprise; pure tested `seatCapacity()`). **Remaining (smaller):** auto-revoke excess pending invites on plan downgrade (webhook — lower urgency: `accept_invitation` already caps *members*, so over-capacity invites just become un-acceptable, not a breach); optional invite-accepted email. (M)
- [~] E2E test harness — **real-browser Playwright smoke harness SHIPPED 2026-06-19 (`ed68e8f7`).** `playwright.config.ts` + `e2e/` specs assert the daily-driver registers (drawings → submittals → RFIs) render under a real session with no uncaught page error (read-only — never mutates data). `e2e/global-setup.ts` mints a session via the Supabase API and seeds it into the app-origin localStorage (default `sb-<ref>-auth-token`, matching `src/lib/supabase.ts`), so it's robust to login-UI changes. Parameterized by env; `playwright test --list` works with no secrets; `e2e/**` excluded from Vitest + ESLint; `@playwright/test` added. The in-process vitest/jsdom suite (1498 green) complements it. **Remaining (owner step):** provision a **dedicated test account** (email+password as a secret) and flip on the CI job — a ready-to-paste snippet kept SEPARATE from the deploy gate is in `e2e/README.md`. Until then a green push that passes unit tests but breaks the real workflow can still deploy. (S)
- [~] **Getting Started workflow checklist — SHIPPED (`370eed5d`), code-verified, NOT field-verified.** Dismissible Dashboard card walking drawings → submittals → RFIs → fab release; pure `computeGettingStartedSteps` (7 tests) + `useGettingStarted` (5 head-count signals) + presentational component (7 jsdom tests). CTA routes verified resolvable (`createPageUrl` key → `/Key`, `AppRoutes` mounts `path={key}`). Open / unverified: (1) **never rendered in a browser** — layout wrap on iPad-width column + SteelBuild-Dark contrast on the status markers unchecked; (2) **non-linear "current" UX** — a done step keeps its ✓ even if an earlier step is open (e.g. fab released but no RFI → step 4 ✓, step 3 highlighted); confirm that reads right vs gating later steps; (3) **5 head-count queries per dashboard load** (until dismissed/complete) — chose self-contained over reusing the Dashboard's already-loaded drawings/submittals/rfis (1 query); (4) **dismiss + RFI-skip are per-device localStorage** — reappear on another device, no un-dismiss UI; (5) **fab step under RLS** — a role that can't read `fab_release_log` gets count 0 (the "Released for Fabrication" submittal fallback covers the common case). Spec: `docs/superpowers/specs/2026-06-17-getting-started-checklist-design.md`. (S)
- [x] Commit `vercel.json` preview-build skip — done (cost control: non-production deploys no longer build).
- [x] app-files cross-tenant READ residual — **CLOSED** (`2258e902`, live-verified 2026-06-16). Grandfathered the ~774 legacy flat `uploads/` files to the founding org (S&H) + org-prefixed new uploads (`<org_id>/uploads/...`); `auth_read` now scopes path → org membership. No object churn / ref backfill needed.
- [x] Function `search_path` hardening — pinned `search_path=''` on 5 advisor-flagged public fns (backcharge/payapp/piece_production touch triggers + plan-limit lookups); migration `20260616010000`, applied live 2026-06-16.
- [x] Definer-function anon lockdown — revoked anon `EXECUTE` on 8 internal `SECURITY DEFINER` fns (advisor 0028): 2 triggers locked from all client roles, 4 RLS helpers + `create_organization`/`accept_invitation` kept `authenticated`-only, `get_invitation` left anon (invite preview). Migration `20260616020000`, applied live + privilege-verified 2026-06-16.

- [x] **Onboarding wizard → team invites hand-off (Epic 4) — SHIPPED 2026-06-19.** The setup
  wizard (`Onboarding.jsx`) collected a roster into `project.metadata.onboarding.team_plan` but
  never sent invites (orphaned data) and had no finish hand-off. Now: a post-create
  "Invite your team →" CTA carries the roster to the Team page via nav state; `OrgMembers.jsx`
  stages it (`prepareOnboardingInvites`: map project→org role, validate, dedupe vs
  members/pending) into a review panel with per-row role/remove + seat-aware **batch send**
  (per-row-failure tolerant). The misleading "Invite users ✓" checklist step relabeled
  "Plan team roles". Adversarial review caught a **privilege-escalation** (a non-owner admin
  could mint an `owner` invite via the staged value) → fixed at BOTH layers: client
  `clampOrgRole` (owner→admin for non-owners) AND a DB guard tightening `org_invites_insert`
  so only an owner can create an owner invite (migration `20260619010000`, applied live +
  verified). Pure helpers (10 tests); full suite 1542 green. **Code-verified, NOT field-verified**
  — run create-project → Invite your team → Send in the app. Deferred: auto-add invitees to the
  wizard's project with their intended project role on accept (needs accept_invitation extension);
  invite-accepted email. (M)

## Thread C — Revision Intelligence — COMPLETE

**Shipped:** per-sheet diff (`559cfd18`) → package report (`1ae4e148`) → RFI-from-delta (`01564d8e`)
→ backcharge escalation (`d5e87b2b`); partial-revision data-loss fix + restore (`03731be4`); docs refresh (`9ed862e1`).

- [ ] Field-verify on a real Rev 2 (code-verified, not field-verified; now safe — partial upload won't wipe the set).
- [x] PDF export — shipped (`f0cfde73`): shareable Revision Impact Report PDF (severity rollup + per-sheet deltas + downstream rework exposure) via `src/lib/exports/revisionImpactPDF.js`, button in the report's summary strip.
- [x] **AI Revision Summary** — SHIPPED (engine `39642352` · persistence `c587ead3` · surface `42ed2220`): deterministic digest auto-built on revision upload (sheets changed / high-risk / affected WPs / likely-RFI / impact level + note), persisted snapshot (`drawing_revision_summaries`, project-membership RLS), post-upload card + "revised · N" set badge, on-demand AI deep-dive. **Code-verified, NOT field-verified.**
- [~] **Revision Summary trigger — code-verified 2026-06-18; (c) FIXED.** (a) NOT a bug: `RevisionUploadModal` apply UPDATES existing `drawings` rows in place + adds a `drawing_revisions` audit row per revised sheet (new sheets are additive), and the summary reads `drawing_revisions` + the current package — so its assumption holds. (b) NOT a bug: `handleRevisionUploaded` does an explicit `await qc.fetchQuery(['drawing-revisions',…])` after invalidating, not a stale closure. (c) FIXED: the silent `.catch(()=>{})` now logs + `toast.warning`s on persist failure (insert RLS floor confirmed `≥field`) so a missing "revised · N" badge isn't a silent mystery. **Still open:** upload a real Rev 2 in the Hub to confirm the card + badge render end-to-end (the only remaining field-verify). (XS)
- [~] Revision Summary follow-ups — **direct Create-RFI on the card SHIPPED** (`e0615695`: `buildRfiPrefillFromSummary` + card affordance gated `can("create","rfi")`, adversarially reviewed, 0 confirmed issues). Remaining: trigger from the standalone `Drawings.jsx` NEW REVISION (deferred to Epic 3 page-consolidation — that page is slated for demotion, so wire-or-remove there); PM-tune the likely-RFI + impact-level heuristics (deterministic best-guess). (S)
- [ ] Optional follow-ups — per-sheet rail "Log backcharge", auto-generate report on upload. (S)

## Thread D — Reliability & process (the meta-gap)

- [x] **RBAC read-scope fix (`3118505b` / migration `20260616040000`)** — `user_has_project_access` checked org membership ONLY, so any org member could read EVERY project in the org (the project list via `projects.project_select` + ~70 project-scoped tables); `user_projects` had no effect on reads. Now org owners/admins see all; members are scoped to their grants. Applied live + **field-verified** via the SteelBuild MCP server's dedicated user (8→1 projects / 275→69 RFIs); surfaced reviewing that server's blast radius — the field-verify principle catching a real issue. Advisors: no regression. ⚠ New org members now see no projects until granted (Project Members).
- [ ] **"Done" = field-verified, not build-green** (now codified in CLAUDE.md §32). Recurring failure mode: features ship "validated + deployed" on unit-tests + build alone, then don't work in-product — the fab bug is the proof (declared fixed, diagnostics removed, still broken). Backfill field-verification on the unverified surface. **2026-06-19 progress:** the portfolio **health-score is now field-verified in the running app** (ASM Garage reads On Track + the PSR chip live), and the CI deploy gate + fab-release gate are field-verified too. Remaining: the Revision Summary trigger (upload a real Rev 2), the Revision Impact board's WP/RFI/fab-blocked joins, the lock reason-gated unlock. (M)
- [x] **CI gate on `main` — DONE 2026-06-19, field-verified.** `main` auto-deployed to steelbuild-pro.com on every push with no gate (a red `tsc` shipped once, `d7e37e9a`). Branch protection is paywalled (private/free-plan repo), and the in-repo `ignoreCommand` approach ERRORS the Vercel deploy — **do not retry that** (`a877cb49`→ERROR, reverted `a5cbd6ff`; prod never affected). **Solution: deploy from a GitHub Action only after CI passes.** `.github/workflows/ci.yml` now has a `deploy` job (`needs: ci`, push-to-main only) shipping via `vercel pull/build/deploy --prebuilt --prod` with the `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` secrets (`2e971999`), and `vercel.json` `git.deploymentEnabled.main=false` turns off Vercel's own git auto-deploy so the Action is the SOLE path (`73d591f7`). Verified on the deploy records: the Stage-2 commit produced exactly ONE (Action) production deploy and no git auto-deploy. Net: push → CI → deploy only if lint+typecheck+test+build green; a red push can't reach prod. Minor: `actions/checkout`+`setup-node` emit a Node-20-deprecation warning (non-blocking; bump @v4→newer when convenient). (M)
- [~] **Coordinate the concurrent agents** — **claims board SHIPPED 2026-06-19 (`4085bd52`).** `AGENT_CLAIMS.md` (root): each session pulls, claims its area (date · session · files · intent) before editing, and releases when done; wired into CLAUDE.md §7 + AGENTS.md so agents read it at session start. A conflict on that file is the intended early signal that another agent is active. It's a **convention, not a hard lock** — effectiveness depends on agents honoring it; revisit (serialize / scope by area, or a real lock) if clobbering continues. Original problem: multiple sessions write `main` on overlapping files (duplicate slices, files reshaped under in-flight edits, broken-`main` windows; no single agent sees the merged whole). (M)
- [x] **Portfolio `health_status` drifts from live RFI/submittal data.** Health comes from PSR-snapshot imports (`projects.metadata.psr.latest.proposed_health_status` — note the `.latest` nesting; the earlier note's psr-root path was wrong, which the field-verify caught) that go stale vs live `rfis`/`submittals`. **Staleness badge SHIPPED 2026-06-19:** `psrHealthProvenance` (pure, 7 tests) + a "⚠ PSR · Nd old" chip on the portfolio grid health cell, shown only on `driftRisk` = snapshot older than `PSR_STALE_DAYS` (14) **AND** the project's `health_status` still equals the snapshot verdict (so it's genuinely the stale flag on display, not a refreshed one). Field-verified on live data: flags **ASM Garage** (At Risk == 24-day snapshot) but NOT ALA Buckeye / Skyport (both since refreshed to On Track despite a stale At Risk snapshot). **Auto-correct SHIPPED 2026-06-19 (the real fix):** `enrichProjectMetrics` now drops a stale snapshot verdict (driftRisk) from the `effectiveHealth` worst-of — live auto-health wins (+2 tests, 32 green). Field-verified on live data: ASM Garage's live metrics are all clean (0 open/overdue RFIs, 0 late deliveries, 0 stalled WPs) → it now displays **On Track**, not the stale At Risk; this also fixes the at-risk KPI + risk watchlist (both read effectiveHealth) and the chip reworded to "showing live; stale PSR disagreed." **Browser-field-verified in production 2026-06-19:** the live Project Health Overview grid shows ASM Garage `100 · ON TRACK` + the `⚠ PSR · 24d old` chip, and the dashboard At-Risk/Watch KPI = 1 (ALA AJ Seminary only) — auto-correct + chip both confirmed in the running app. Item complete; sort-by-column (vs effectiveHealth) left as a minor cosmetic follow-up.
- [~] **Audit-logging coverage — Tier-1 SHIPPED 2026-06-19.** Submittal (`a9de17f4` status transitions via the shared `addSubmittalRound` spine + `4ab19221` create/update/delete/bulk on the live `Submittals.tsx`), delivery (`a637b8f4` `Deliveries.tsx` transit/delete/bulk), and work-package/fab (`a637b8f4` `FabRelease.tsx` create/update/delete/complete) mutations now write to `activities` via `auditLogger`. **GOTCHA the adversarial review caught:** the "canonical" CRUD hooks (`useSubmittals`, `useDeliveries`) are DEAD for mutations — the live pages roll their own — so audit the *page* `.mutate` handlers (reachability-check FIRST) + the shared `addSubmittalRound`, NOT the hook. RLS-verified (`activities` INSERT = `user_has_project_access`). Remaining: pay-app (`payapp/repository.ts` — a repository not a React mutation → needs a `pay_application` label + audit in the domain fns), drawing-set approval status, project member/role changes. (M)

## Thread E — RFI Workflow

**Recently shipped:** preflight override-with-reason (`e3ea2f61`), structural dedup (`a40dd96e`),
impact fields → metadata (`1e643aa5`), operational "apply downstream" panel (`cb8d12d8`).

- [x] **"Apply downstream" panel — honest + more contextual, FIXED 2026-06-19.** Now **3 of 5 land for real**: Create CO (`?fromRfi` → CO form prefill), **Update linked drawing** (NEW — `/Drawings?sheet=<drawing_reference>`; Drawings already filters by `?sheet`/`?search`, so it lands on the actual sheet), and Notify field (posts an alert). The two without a param consumer were relabeled to honest navigation — "Open work packages" / "Open constraints" — and the dangling, unread `?fromRfi` dropped so they don't over-promise. `rfiDownstream.ts` labels updated; 7 tests green. **Optional later (deeper context):** make `WorkPackages` honor `?focus=<work_package_id>` (the RFI reliably carries it) and `Constraints` open a prefilled create form from the RFI. (M)
- [ ] **"Notify field" alert reach unverified.** `notify_field` creates an `alerts` row (`alert_type:"RFI_Field_Action"`, mirrors the overdue-alert shape). `BellDropdown` buckets alert types tolerantly so it should register as a count, but it's NOT verified that it (a) surfaces to **field-role** users under `alerts` RLS or (b) labels sensibly — and the create was never run against the live DB. Decide whether "notify field" should do more than post a project alert. (S)
- [ ] **Live UI test of the downstream panel.** The pure helper (`rfiDownstream.ts`) is unit-tested (7) + build green, but the rendered panel was never clicked in a browser (Icon names resolve, buttons fire, mobile layout). Exercise it on a real answered RFI. (XS)
- [ ] **Dedup threshold/weights untuned on real data.** Threshold `0.4` + structural weights in `rfiDedup.ts` are heuristic; the unit tests prove the mechanism, not precision/recall on real RFI history. Tune against actual dup / non-dup pairs. (S)
- [x] **Preflight "impact assessed" check broadened — DONE 2026-06-19.** `buildRfiPreflight`'s impact check now counts the slice-3 qualitative flags (fab/erection/drawing-rev/CO-likely), top-level while composing or in `metadata` for a saved RFI, not just `cost_impact`/`schedule_impact`. Relabeled "Impact assessed". +1 test (9 green).

## Thread F — Submittal Workflow

**Recently shipped (2026-06-17 roadmap, gate→templates→resubmittal→forecasting, all no-migration):**
Ready-for-Fab gate (`c83504f6`), approval-chain templates + fab sign-off policy (`2e2f5e7d`),
resubmittal carry-forward (`7dc294eb`), round-over-round response matrix (`e2516577`),
review-return forecasting (`5e6283c5`).

- [~] **Per-round capture — diagnosed + round history now fills from daily use (SHIPPED `1c32c7fd`).** Root cause: verdicts were recorded as inline STATUS flips (status + submitted/returned/approved dates + reviewer), which bypassed `addSubmittalRound` — so 0 round rows despite daily use (live: 38 submittals, 36 decided, 30 with a reviewer, yet 0 rounds / 0 sheet responses). Fix: a **verdict status-change now logs a round** via the audited path (`onStatusChange` → `advanceMut`), and a **reversible backfill synthesized 15 historical rounds** from existing dates (migration `20260619000000`, tagged `metadata.source`). RLS-safe (round insert is field+, matching the submittals write floor). Forecasting already worked off the submittal-level dates (unchanged). **Per the owner decision (2026-06-19):** the response matrix + resubmittal carry-forward stay built but **inert** — they need *per-sheet* reviewer dispositions the team doesn't record today (one overall verdict per submittal). Residual: if review ever goes per-sheet, drive adoption of the sheet-response grid; the round-model ambiguity below is the related cleanup. (M)
- [x] **Forecasting rendered thin-sample estimates with full visual authority — FIXED 2026-06-19.** Added a `lowConfidence` flag to `submittalForecast` (`basisCount < MIN_BUCKET_SAMPLES`); `SubmittalForecastCard` now marks the dates approximate ("~May 12", muted accent) and shows "⚠ Rough estimate — only N past reviews" — or "No review history yet — rough placeholder" with the default cycle — instead of an authoritative ETA. +3 tests (15 green). **Live-impact note:** the overall sample pool has since grown to **14** completed cycles (the "2 reviews" screenshot was an earlier state), so today's 2 under-review forecasts have enough basis and aren't flagged — the fix now protects the genuinely-thin cases (a new project/reviewer/discipline, or no history at all). Optional later: raise the floor above 3, or flag when a forecast falls back to the blended overall instead of a reviewer/discipline-specific bucket. (S)
- [~] **Round-model ambiguity RESOLVED — a round = one submit→return CYCLE (SHIPPED `abbdbc0d`; owner chose cycle, not event-log).** `addSubmittalRound` no longer inserts a row + bumps `total_rounds` on every status move; it now **find-or-updates** the latest round — a send opens/advances the open cycle, a verdict closes it in place, and a new row opens only on a real resubmit (send on a closed round). Pure `planRoundWrite()` decides update-vs-insert (unit-tested); `onStatusChange` routes sends through it too; the "ROUND N" header/row + "Start Resubmittal — Round N+1" read `total_rounds` (the cycle count; `round_number` is the vestigial legacy revision counter). The fab-release backstop reverts an in-place update / deletes a fresh insert. 28 submittal-hook tests, suite 1514 green. **Remaining: write-path field-verify** — code-verified + the `SubmittalRound.filter(…,"-round_number",1)` pattern is proven elsewhere, but flipping a real submittal through its cycle wasn't done in-app (it mutates live workflow: auto-locks + smart triggers). Confirm on the next real workflow move. (M)
- [x] **Server-enforce the fab-release gate (moat) — DONE 2026-06-18.** Extended the `fab_release_log` BEFORE-INSERT trigger (`enforce_fab_release_gate`, migration `20260618010000`) to also block **rejected / R&R sheets** and **superseded-revision** sheets, mirroring `computeFabReleaseGate` exactly — so a client that skips the UI can't release past them. The audited PM `override_reason` still short-circuits every dimension. **Field-verified** via a rolled-back synthetic insert: superseded package → `FAB_RELEASE_BLOCKED` (correct sheet in the message), override → bypass. SECURITY INVOKER, no new advisor warning. **⚠ Also found + fixed a latent moat bug:** the live `fab_release_log` was missing `drawing_count` (the enforcement migration's `create table if not exists` no-op'd over an earlier table shape), so EVERY real `recordFabRelease()` would have thrown "column does not exist" — the gated release path had never successfully run (0 rows, masking it). Added the column (migration `20260618020000`). **Still client-only:** the opt-in missing-fab-signoff dimension (needs a per-project setting lookup) — lower priority. (M)
- [ ] **Submittal detail panel froze CDP screenshot capture (low confidence it's user-facing).** During live verification, opening any submittal detail reliably timed out `Page.captureScreenshot` (30s) while the DOM a11y tree + console stayed instantly responsive and error-free — so most likely a capture/GPU artifact, not a real freeze. But the detail mounts `SubmittalReviewStrip` + the forecast/matrix `useMemo`s on selection; profile a detail-open on a data-heavy submittal and defer/memoize the strip if there's real main-thread cost. (S)

## Thread G — Detailing Control Center (Epic 3 — the centerpiece)

The Hub (`DrawingSubmittalHub`, labeled "Detailing Control Center") is already the
sole DETAILING nav entry + the DRAWINGS tab default. Epic 3 = make it the front
door without stranding the other roles.

- [x] **Role-aware default landing + Hub-selectable picker — SHIPPED 2026-06-19 (`82f5af53`).**
  At `/` (`IndexRoute`), when there's no explicit `default_landing` pref, land by
  per-project role: field → Field Today, pm/admin/owner → Detailing Control Center,
  viewer/unknown → Dashboard (pure `src/lib/landingForRole.js`, 5 tests). An explicit
  pref still wins and redirects immediately. `roleReady` waits for the per-project
  role only when a project is active/pending — a zero-project / no-pref user decides
  immediately (no spinner through ProjectContext's ~4.5s empty-list retry backoff),
  and there's no infinite loader if a default-project pref points at a deleted project.
  `DashboardTab` landing picker now offers the Hub + Field Today with friendly labels
  (the Hub wasn't selectable at all before). 7-case boot-invariant test
  (`src/boot/__tests__/IndexRoute.test.jsx`). Adversarially reviewed (correctness /
  regression / edge lenses; zero-project spinner + missing test were the real findings,
  both fixed). Full suite 1532/1532 + build green. **Code-verified, NOT field-verified**
  — exercise the role-routed first-load redirect in the running app (clear sessionStorage
  `sbp-landing-redirected`, open `/`). (M)
- [x] /Drawings "fate" decision (keep + Back-to-Hub banner) — ALREADY satisfied: the
  demotion banner exists in `Drawings.jsx` (`!embedded` → "← Back to the Hub" →
  `/DrawingSubmittalHub`). Standalone route kept, nav-orphaned by design.
- [ ] Optional: per-role NAV (hide cost/detailing tabs from field) was considered and
  deferred — deep-link breakage risk, and page-level permissions already gate access. (S)

## Thread H — AI Drawing Intake (Epic 5 — polish)

Extraction + the in-modal review screen (`DrawingSetUploadModal` → StepReview) already
work daily. Owner chose "polish the current flow" over a formal staging queue — the
staging tables (`drawing_analyses`/`drawing_sheets`) exist + are RLS-hardened (verified
live), but `importAnalyzedDrawings` is **dead** (no call sites); the live intake path is
the upload modal's `handleCreate`.

- [x] **Per-sheet review flag + audit-on-create — SHIPPED 2026-06-19.** The extractor
  returns no model confidence, so instead of a fake %, a deterministic per-sheet
  "⚠ REVIEW" chip (+ a "N to review" summary) flags sheets with a real quality problem
  (bad-source row, fallback `_note`, or missing sheet #) via the pure
  `src/components/drawings/intakeReview.js` (`sheetReviewFlags`, 7 tests). The SAME helper
  feeds `buildRecord`'s persisted `ai_extraction_status`, so the badge and the saved status
  can't disagree (it now also flags empty-sheet# rows — verified purely informational
  downstream: counts + badges only, nothing hides/blocks NeedsReview rows). And a
  fire-and-forget `logActivity("drawing","created",…)` on the live create path records the
  intake commit (sheets imported / flagged / failed) to the Activity trail — closing the
  §30 "no audit record of the intake" gap. Full suite 1549 green. **Code-verified, NOT
  field-verified** — upload a real PDF → review → create and confirm the chip + Activity row. (M)
- [ ] Deferred (not chosen): a formal staging/approval QUEUE (separate table, approver
  audit, role-gated approval). Revisit if drawing review needs explicit sign-off. (L)

## Other (shipped last night)
Submittal "Released for Fab" open-tally (`4d144c2c`), WP form project pre-select (`e19ddd23`),
Gantt scroll position (`b37d7654`), denser/crisper sidebar (`0b734d55`/`84838b2d`).

## Thread I — Enterprise Readiness (audit 2026-07-01 → remediation)

Full audit report: `ENTERPRISE_READINESS_AUDIT.md` (0C / 27H / 54M / 52L). Remediation
shipped in waves to `main` (`009fe507`→`0d932d6a`→`52dc51f0`). **Owner-only / human-credential
items live in `docs/runbooks/owner-checklist.md`** (branch protection, secrets, PITR, MFA
dashboard toggle, Stripe Tax/AZ TPT, legal/DPA/entity, pen test, orphan edge-fn deletes) — this
thread tracks only the **engineering** remainder. Every entry cites its audit finding ID.

**Shipped this wave (`52dc51f0`, code-verified — see caveats):**
- [x] **M19 · Bulk actions batched.** `bulkUpdate(ids,patch)` / `bulkDelete(ids)` on the entity
  client (one chunked `.in('id', ≤500)` op, same cleanRecord/updated_at + soft-delete semantics);
  rewired the identical-payload handlers on SOV, ScopeExclusions, CostCodes, ActionItems,
  EmailInbox, and the Hub package-due-date op. `Project.bulkDelete` overrides to the atomic
  `soft_delete_project` RPC (avoids the half-archive class). Per-row paths kept where payloads differ.
- [x] **M18 (short-term half) + H10 (telemetry half).** `ListTruncationNotice` now on Submittals,
  RFIs, and the Detailing Hub; `warnIfTruncated` reports to Sentry (`warning`) in prod, not just DEV.
- [x] **L20 · Realtime invalidation debounced** — 300ms trailing coalesce in `useRealtimeInvalidation`.
- [x] **L13 (dependency-audit slice) + L31.** Advisory `dependency-audit` CI job
  (`npm audit --omit=dev --audit-level=high`, NOT in `deploy.needs`); vitest `maxWorkers:2` on win32 +
  `test.env` placeholders so a bare `npm test` passes with no `.env.local`.

**Deferred — engineering, NOT owner-gated (needs coordinated DB-view/client rewire + field-verify):**
- [ ] **H9 · Portfolio rollups still client-side.** `CommandCenter.jsx` + `AIInsights.jsx` issue
  ~18 `listAll()` reads (uncapped to 100k rows, `select('*')`) and derive KPIs in the browser.
  Fix: `security_invoker` Postgres view/RPC per dashboard (`portfolio_project_kpis(org_id)`), query the
  aggregate; keep `listAll()` only for drill-down/export. Interim: select only needed columns. Coordinate
  with the command_ui lock (these are Control Center surfaces). (L)
- [~] **H10 (remaining server-side half).** Telemetry + moat-page notices shipped above; still open:
  SQL aggregates (or at least `listAll()`) for the ~30 report pages + ExecutiveView/ExecutiveDashboard/
  PortfolioOverview, and a **server-side GlobalSearchModal** (`.or(ilike)` per table + small limit / search
  RPC) to replace its 6 full-table fetches. Deliberately not touched this pass. (M)
- [ ] **M18 (medium-term half).** Paged read path on the entity layer (`filterPage` with
  `range`+`count:'exact'`) and `useVirtualizer` on the drawing register + submittal tables (reuse
  `DeliveriesList` as template). Only the truncation-notice short-term half shipped. (L)
- [ ] **M17 · Duplicate permissive SELECT policies on 4 hot tables** (delivery_items, drawing_sheets,
  submittal_activity, task_dependencies). Split each `_write FOR ALL` into INSERT/UPDATE/DELETE and scope
  to `authenticated` so SELECT hits one policy; apply live via MCP + commit the migration. Deferred: RLS
  surgery on live, working policies — do on a staging rehearsal first. Clears 24 advisor WARNs. (S)
- [ ] **M2 · app-files storage reads org-scoped, not project-scoped** (+ founding-org legacy path). A
  member invited to one project can read another project's PDFs in the same org by path. Durable plan
  already at `docs/app-files-tenant-isolation-plan.md`. Deferred: gated on the legacy `uploads/` backfill
  and RLS surgery on the storage policies. (L)
- [ ] **L21 · cacheRegistry broad unscoped prefixes** — one mutation invalidates every project's cached
  queries. Converge duplicate key spellings (`drawing-sets` vs `drawing_sets`) onto one scoped key, drop
  unscoped prefixes from `families()`, longer staleTime on the portfolio `-all` keys. Follow-the-registry
  refactor, testable via `cacheRegistry.test.js`. (M)

**Deferred — CI (not owner-secret-gated; deferred to avoid red/noisy jobs or a policy call):**
- [ ] **M29 · No code-coverage.** Add `@vitest/coverage-v8`, enable v8 coverage (lcov+text), start at
  observed baselines then ratchet per-glob on the crown-jewel dirs (`src/lib/payapp`, `src/services`,
  `src/lib`); upload lcov as a CI artifact. Advisory (no gate) first. (M)
- [ ] **M30 · Edge functions untested + outside every gate.** Extract pure logic of `quota.ts`,
  `providers/cost.ts`, `_shared/cors.ts`, `_shared/attachments.ts` into Vitest-tested modules (webhookLogic
  pattern); add a `deno check supabase/functions/*/index.ts` CI step so an edge fn type-parses before deploy. (M)
- [ ] **M36 · Block net-new `.js`/`.jsx` under `src`** (edits to existing allowed) so the TS conversion
  converges; prioritize typing the shared infra (ProjectContext, design-system primitives, entity surface).
  Needs an owner policy nod. (M)
- [ ] **L13 (remaining) · gitleaks / SAST.** Dependency-audit slice shipped; secret-scanning + SAST still
  need an owner tooling decision (see the ci.yml header note). (S)
- [ ] **H18/H19/M31 · E2E as a real gate.** Harness is built (`e2e/`, Playwright); enabling it is
  **owner-gated** on the `E2E_*` secrets + `E2E_ENABLED` variable + a dedicated test account — see
  owner-checklist §1. (S, owner-blocked)

**Deferred — edge-function source committed, deploy is owner-gated (CLI + field-verify):**
- [ ] **Deploy the hardened edge functions.** Source is on `main`, NOT deployed (can't field-verify
  headlessly): project-export pagination/full-table/manifest (H2/H26/M20/M47), schedule-assistant
  `SERVICE_ROLE_OVERRIDE` removal (M5), stripe-billing (L6/L10), email-send (L7). Deploy commands +
  per-function verify steps are in owner-checklist §3 / §1 (needs `SUPABASE_ACCESS_TOKEN` or interactive CLI). (M, owner-blocked)

**Accepted / won't-fix:**
- [x] **L4 · `pg_net` stays in `public`** — extension reports `does not support SET SCHEMA`; documented
  accepted deviation.

**Caveats (CLAUDE.md §32):** everything in the shipped block is code + typecheck×4 + full-suite (2454) +
build verified, but **not field-verified** — exercise a bulk status change (SOV), a package due-date set
(Hub), and confirm a Sentry truncation event before calling the runtime behavior done.
