# SteelBuild Pro — To-Do

> Rebuilt 2026-06-16 from the commit log + tracked open items. Keep this current
> as the durable backlog (the previous list lived only in a chat session).
> Sizes: XS/S/M/L. Check items off as they ship.

## Thread A — 3D Viewer / IFC

**Recently shipped:** perf at real scale (`9be4a757`), optimistic recolor (`b6f344d7`),
multi-select bulk assign (`1b07a53d`), persist color mode + gzip upload (`b6ce5fd1`),
assign-by-live-mark / guid-drift (`7381972d`), repaint fab colors on reload (`484e8853`).

- [~] **Fab status "not saving"** — ROOT CAUSE = model_elements read capped at 1000 rows server-side; fixed by paginating the roster (`18f6294b`) + a canvas-overflow fix (side panel was unclickable). Awaiting user confirm (`[fab-debug]` `colored` should jump from 2 to the real count); then remove the temporary debug logging.
- [ ] CSV-sourced rosters can't color — `element_guid` is NULL on CSV imports → guid-keyed coloring skips them. Fix = color by `piece_mark`. (M)
- [ ] "Academy MS Mesa" IFC extracts 0 elements — investigate that export. (S)
- [ ] Perf lever if still choppy at ~12k draw calls — merge meshes by color bucket / InstancedMesh. (L)
- [x] `scripts/check-ifc-type.mjs` — committed as a kept web-ifc element-type dev probe.
- [ ] Remove the temporary `[fab-debug]` console logging once fab colors are confirmed. (XS)
- [ ] Deferred polish — sequence playback, spatial RFI pins, model↔sheet click-through, sectioning / hide-isolate. (L)

## Thread B — Multi-tenant SaaS / Monetization

**Recently shipped:** org-boundary isolation (`c83c7ab7`), app-files tenant isolation (`2258e902`),
landing redesign (`93a503a9`), billing plan-limit enforcement (`fea77911`),
self-serve signup + email verify (`25ac9c9a`), upload org-resolution hardening (`cc534b30`/`366616fc`).

- [ ] **Invites → Stripe billing** — the main gap to "sellable." BLOCKED: needs a Stripe account. (L)
- [ ] E2E test harness — now feasible (self-signup exists → a test user can be created). (M)
- [x] Commit `vercel.json` preview-build skip — done (cost control: non-production deploys no longer build).
- [ ] app-files cross-tenant READ residual — flat `uploads/<ts>` paths need a path restructure + ref backfill. (M)

## Thread C — Revision Intelligence — COMPLETE

**Shipped:** per-sheet diff (`559cfd18`) → package report (`1ae4e148`) → RFI-from-delta (`01564d8e`)
→ backcharge escalation (`d5e87b2b`); partial-revision data-loss fix + restore (`03731be4`); docs refresh (`9ed862e1`).

- [ ] Field-verify on a real Rev 2 (code-verified, not field-verified; now safe — partial upload won't wipe the set).
- [ ] Optional follow-ups — per-sheet rail "Log backcharge", auto-generate report on upload, PDF export. (M)

## Other (shipped last night)
Submittal "Released for Fab" open-tally (`4d144c2c`), WP form project pre-select (`e19ddd23`),
Gantt scroll position (`b37d7654`), denser/crisper sidebar (`0b734d55`/`84838b2d`).
