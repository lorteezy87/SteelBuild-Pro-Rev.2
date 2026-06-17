# SteelBuild Pro — To-Do

> Rebuilt 2026-06-16 from the commit log + tracked open items. Keep this current
> as the durable backlog (the previous list lived only in a chat session).
> Sizes: XS/S/M/L. Check items off as they ship.

## Thread A — 3D Viewer / IFC

**Recently shipped:** perf at real scale (`9be4a757`), optimistic recolor (`b6f344d7`),
multi-select bulk assign (`1b07a53d`), persist color mode + gzip upload (`b6ce5fd1`),
assign-by-live-mark / guid-drift (`7381972d`), repaint fab colors on reload (`484e8853`).

- [~] **Fab status "not saving" — STILL OPEN on Capstone Tucson; root cause NOT found.** The 1000-row roster cap was real + fixed (pagination `18f6294b`), but the user reports colors still don't persist on Capstone *after* that fix — so the cap was not the whole story. Live data is correct (7,117 guid rows tagged "erected"; guids well-formed 22-char; `extractIfcRoster` and `loadIfcGeometry` read GlobalId identically; roster fully loaded). The remaining unknown is **runtime**: do the rendered GlobalIds actually match the roster at paint time, or is the model rendering its structural members at all? A sharper `[fab-diag]` instrument (recolor coverage + sample-guid membership) is re-added + deployed (`b314416c`), **awaiting the user's console line** (Capstone → 3D Model → Fab). Do NOT declare fixed until that evidence localizes it.
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

- [ ] **Brand: apple-touch-icon is 3:2, not square.** The regenerated `public/steelbuild-pro-logo.png` is 320×213; iOS "Add to Home Screen" may letterbox/crop it. Add a square variant (180×180 + 512×512) and an explicit `apple-touch-icon` link. Desktop favicon, loading splash, and og:image are verified correct. (XS)
- [ ] **Invites → Stripe billing** — the main gap to "sellable." BLOCKED: needs a Stripe account. (L)
- [~] E2E test harness — **in-process suite deepened** (vitest/jsdom; +DrawingRegisterTable integration — rows / submittal-aware status / toolbar perm-gating / search; full suite 1333 green). **Real-browser Playwright still pending**: needs a provisioned verified test account (email+password as a secret) + a target URL (prod / preview / local). Not installed yet. (M)
- [x] Commit `vercel.json` preview-build skip — done (cost control: non-production deploys no longer build).
- [x] app-files cross-tenant READ residual — **CLOSED** (`2258e902`, live-verified 2026-06-16). Grandfathered the ~774 legacy flat `uploads/` files to the founding org (S&H) + org-prefixed new uploads (`<org_id>/uploads/...`); `auth_read` now scopes path → org membership. No object churn / ref backfill needed.
- [x] Function `search_path` hardening — pinned `search_path=''` on 5 advisor-flagged public fns (backcharge/payapp/piece_production touch triggers + plan-limit lookups); migration `20260616010000`, applied live 2026-06-16.
- [x] Definer-function anon lockdown — revoked anon `EXECUTE` on 8 internal `SECURITY DEFINER` fns (advisor 0028): 2 triggers locked from all client roles, 4 RLS helpers + `create_organization`/`accept_invitation` kept `authenticated`-only, `get_invitation` left anon (invite preview). Migration `20260616020000`, applied live + privilege-verified 2026-06-16.

## Thread C — Revision Intelligence — COMPLETE

**Shipped:** per-sheet diff (`559cfd18`) → package report (`1ae4e148`) → RFI-from-delta (`01564d8e`)
→ backcharge escalation (`d5e87b2b`); partial-revision data-loss fix + restore (`03731be4`); docs refresh (`9ed862e1`).

- [ ] Field-verify on a real Rev 2 (code-verified, not field-verified; now safe — partial upload won't wipe the set).
- [x] PDF export — shipped (`f0cfde73`): shareable Revision Impact Report PDF (severity rollup + per-sheet deltas + downstream rework exposure) via `src/lib/exports/revisionImpactPDF.js`, button in the report's summary strip.
- [x] **AI Revision Summary** — SHIPPED (engine `39642352` · persistence `c587ead3` · surface `42ed2220`): deterministic digest auto-built on revision upload (sheets changed / high-risk / affected WPs / likely-RFI / impact level + note), persisted snapshot (`drawing_revision_summaries`, project-membership RLS), post-upload card + "revised · N" set badge, on-demand AI deep-dive. **Code-verified, NOT field-verified.**
- [ ] **Field-verify the Revision Summary trigger end-to-end** — top unverified risk. (a) Assumes a revision upload keeps the same `drawings` rows (adds a `drawing_revisions` row) so the current package stays valid — NOT confirmed against `RevisionUploadModal`'s apply logic; if it makes new drawing rows, severity can be understated/missed. (b) `onComplete` timing vs DB commit unconfirmed (early fire → stale refetch → empty digest). (c) `saveRevisionSummary` is wrapped in `.catch(()=>{})`, so an RLS `insert ≥ field` rejection fails **silently** (card shows, badge never persists). Verify by uploading a real Rev 2 in the Hub. (S)
- [ ] Revision Summary follow-ups — trigger from the standalone Drawings editor's NEW REVISION too (only the Hub path fires today); a direct Create-RFI on the card; PM-tune the likely-RFI + impact-level heuristics (currently a deterministic best-guess). (S)
- [ ] Optional follow-ups — per-sheet rail "Log backcharge", auto-generate report on upload. (S)

## Thread D — Reliability & process (the meta-gap)

- [ ] **"Done" = field-verified, not build-green** (now codified in CLAUDE.md §32). Recurring failure mode: features ship "validated + deployed" on unit-tests + build alone, then don't work in-product — the fab bug is the proof (declared fixed, diagnostics removed, still broken). Backfill field-verification on this session's unverified surface: the Revision Summary trigger, the health-score column on a live project, the Revision Impact board's WP/RFI/fab-blocked joins, the lock reason-gated unlock. (M)
- [ ] **CI gate / branch protection on `main`** — `main` auto-deploys to steelbuild-pro.com on every push, and a parallel session already shipped a red `tsc` to prod (`format.test.ts`, fixed in `d7e37e9a`). Require typecheck + lint + tests green before a deploy can land. (M)
- [ ] **Coordinate the concurrent agents** — multiple sessions write `main` at once on overlapping files. Observed this session: a duplicate Hub lock slice (`4c34cd1e`), `DrawingRegisterTable` reshaped underneath in-flight edits, `MEMORY.md` rewritten mid-session, and a broken-`main` window. Serialize or scope agents by area; no single agent — or single report — sees the merged whole. (M)

## Thread E — RFI Workflow

**Recently shipped:** preflight override-with-reason (`e3ea2f61`), structural dedup (`a40dd96e`),
impact fields → metadata (`1e643aa5`), operational "apply downstream" panel (`cb8d12d8`).

- [~] **"Apply downstream" panel — 3 of 5 actions are navigation-only (verified).** Only `ChangeOrders.jsx` reads `?fromRfi=` (finds the RFI + prefills the CO form, so **Create CO works fully**). `Drawings`/`WorkPackages`/`Constraints` have **no** `fromRfi` consumer, so "Update linked drawing" / "Open work package" / "Log constraint" just land on the page with a dangling, unread param (harmless — no error, but no focus/prefill). Fix: either make those 3 pages honor `fromRfi` (focus the linked drawing/WP, prefill a CONSTRAINT action item) OR relabel the buttons "Open …" so they don't over-promise. (M)
- [ ] **"Notify field" alert reach unverified.** `notify_field` creates an `alerts` row (`alert_type:"RFI_Field_Action"`, mirrors the overdue-alert shape). `BellDropdown` buckets alert types tolerantly so it should register as a count, but it's NOT verified that it (a) surfaces to **field-role** users under `alerts` RLS or (b) labels sensibly — and the create was never run against the live DB. Decide whether "notify field" should do more than post a project alert. (S)
- [ ] **Live UI test of the downstream panel.** The pure helper (`rfiDownstream.ts`) is unit-tested (7) + build green, but the rendered panel was never clicked in a browser (Icon names resolve, buttons fire, mobile layout). Exercise it on a real answered RFI. (XS)
- [ ] **Dedup threshold/weights untuned on real data.** Threshold `0.4` + structural weights in `rfiDedup.ts` are heuristic; the unit tests prove the mechanism, not precision/recall on real RFI history. Tune against actual dup / non-dup pairs. (S)
- [ ] **Preflight "impact assessed" soft check is stale.** `buildRfiPreflight`'s impact check still only looks at `cost_impact`/`schedule_impact`, not the slice-3 flags (fab/erection/drawing-rev/CO-likely). Broaden so qualitative impact also satisfies it. (XS)

## Thread F — Submittal Workflow

**Recently shipped (2026-06-17 roadmap, gate→templates→resubmittal→forecasting, all no-migration):**
Ready-for-Fab gate (`c83504f6`), approval-chain templates + fab sign-off policy (`2e2f5e7d`),
resubmittal carry-forward (`7dc294eb`), round-over-round response matrix (`e2516577`),
review-return forecasting (`5e6283c5`).

- [ ] **The per-round response capture has zero live data — so 3 of these 4 features have nothing real to act on.** Live DB (2026-06-17): `submittal_rounds` is **empty** (0 rows, all projects), **0** Revise-and-Resubmit/Rejected submittals, **0** `submittal_sheet_responses` — *despite* the app being run daily across multiple live projects. So resubmittal carry-forward, the response matrix, and forecasting all render against essentially no data. This is a **product** question, not a code bug: reviewers' dispositions are landing somewhere other than the per-round sheet-response grid (status field? notes? outside the app entirely?). Decide whether to (a) drive adoption — make "log this return" one tap from the verb CTA and push reviewers through the sheet-response grid — or (b) re-fit the features to whatever capture the team actually does. Until one happens, these three are unvalidated *by use* (Thread D: "done = field-verified"). (M)
- [ ] **Forecasting renders 2-sample estimates with full visual authority.** `submittalForecast` shows a hard "Expected back May 12 / Worst May 17" off `based on 2 past reviews` (live state — rounds empty, only 5–9 submittal-level cycle samples total). Add a confidence floor keyed on the `basisCount` the card already carries: below ~`MIN_BUCKET_SAMPLES` overall samples, show "rough estimate — not enough history yet" (or suppress the precise dates / widen the worst-case band) instead of authoritative dates. A confident-looking wrong ETA is worse than an honest "unknown." (S)
- [ ] **Resolve the round-model ambiguity before real rounds accrue.** `addSubmittalRound` logs a `submittal_rounds` row + increments `total_rounds` on **every** status move (verb CTA / advance), so `total_rounds` ≈ event count — while the manual `NewRoundModal`/`createRoundMut` path treats a "round" as a resubmission cycle. The two coexist. `pickCarryForwardResponses` + `buildResponseMatrix` defensively skip bare event-rounds, but once real rounds exist the matrix column numbering and the "Start Resubmittal — Round N+1" label can disagree with the user's mental model of a round. Pick one canonical definition (event-log vs cycle) and make both write paths agree. (M)
- [ ] **Server-enforce the rest of the fab-release gate (moat).** Only the open-RFI check is server-authoritative (`fab_release_log` BEFORE-INSERT trigger). The new gate dimensions — rejected/R&R sheets, superseded-revision conflict, missing fab sign-offs — are **client-only** (`computeFabReleaseGate`), so a determined client can still flip a submittal to "Released for Fabrication" past them. Extend the trigger to evaluate the released sets' full sheet membership (not just the submittal's RFIs) so the gate can't be bypassed. (M)
- [ ] **Submittal detail panel froze CDP screenshot capture (low confidence it's user-facing).** During live verification, opening any submittal detail reliably timed out `Page.captureScreenshot` (30s) while the DOM a11y tree + console stayed instantly responsive and error-free — so most likely a capture/GPU artifact, not a real freeze. But the detail mounts `SubmittalReviewStrip` + the forecast/matrix `useMemo`s on selection; profile a detail-open on a data-heavy submittal and defer/memoize the strip if there's real main-thread cost. (S)

## Other (shipped last night)
Submittal "Released for Fab" open-tally (`4d144c2c`), WP form project pre-select (`e19ddd23`),
Gantt scroll position (`b37d7654`), denser/crisper sidebar (`0b734d55`/`84838b2d`).
