# Desktop Launcher — Photo Pack (Plan 1B) Production Kit

**Goal:** Produce the ~31 cinematic construction photos that back the launcher tiles, in one cohesive style, and drop them into the app.

**How it works:** Each launcher tile (`src/components/desktop/ModuleTile.jsx`) loads `photoFor(page)` → `/photos/desktop/<PageKey>.webp`. If the file is missing or fails to load, the tile gracefully falls back to the dark steel gradient. So you can add photos **incrementally** — each one lights up its tile the moment the correctly-named file exists in `public/photos/desktop/`.

---

## 1. Master art-direction (applies to EVERY image)

Use this as a style preamble/suffix on every prompt so the whole set reads as one family:

> Cinematic, photorealistic industrial construction photography. Dark and moody, cool
> desaturated color grade with subtle warm accents. Shallow depth of field, soft
> directional or overcast light, fine grain. Authentic working environment — real, not
> stock-cheesy — with accurate structural-steel detail and correct PPE (hard hats,
> hi-vis vests). Shot full-frame, 35mm, f/2.8. **Landscape 3:2.** Composition keeps the
> CENTER relatively simple and slightly darker so a centered white icon + text label
> stay legible; push visual interest toward the edges/corners. Keep important detail in
> the upper two-thirds (the bottom third gets darkened by a UI gradient). No text, no
> logos, no watermarks, no signage, no sharp-focus faces (use over-the-shoulder, backs,
> or motion blur), no distorted hands.

**Negative prompt:** `text, words, letters, logos, watermark, signage, captions, UI, deformed hands, extra fingers, cartoon, illustration, oversaturated, HDR halo, faces in sharp focus`

**Technical output:**
- Aspect ratio **3:2 landscape**, render ~**1536×1024** (or 1200×800).
- Export each as **WebP**, target **≤180 KB** each (quality ~78). Keep filenames EXACT (case-sensitive) as listed below.
- For consistency across the set: keep the same style suffix + (if your tool supports it) a fixed seed / "style reference" image, and generate in one session/batch.

---

## 2. Per-module prompts (31 tiles)

Final prompt for each = **[master style above] + [subject below]**. Filename column is the exact drop target in `public/photos/desktop/`.

### Overview
- **Dashboard** → `Dashboard.webp` — a laptop and monitor on a clean site-office desk showing colorful project KPI charts and graphs, dim room, glow from the screen.
- **Command Center** → `CommandCenter.webp` — a project control room: a wall of monitors showing schedules, dashboards and live data, a silhouetted operator from behind.
- **Portfolio Overview** → `PortfolioHub.webp` — a wide city skyline at dusk with multiple steel high-rises under construction and tower cranes against moody clouds.

### Projects
- **Projects** → `ProjectsHub.webp` — a structural-steel building frame mid-erection with a yellow tower crane, dramatic overcast sky.

### Detailing
- **Detailing Control Center** → `DrawingSubmittalHub.webp` — a detailer's monitor showing a 3D steel connection / Tekla-style model, mouse and coffee mug, dim desk, blue screen glow.

### Project management
- **Schedule** → `ScheduleHub.webp` — a desk calendar/planner with a pen resting on it, soft window light, shallow focus.
- **RFIs** → `RFIs.webp` — a hi-vis worker seen from behind at a site desk, looking at structural drawings on a tablet/laptop.
- **Action Items** → `ActionItems.webp` — a clipboard with a checklist and pen on a steel surface at a job site, a few items checked.

### Production
- **Work Packages** → `WorkPackages.webp` — two hard-hatted workers in hi-vis reviewing a tablet together at a steel-frame site, backs to camera.
- **Fab Release** → `FabRelease.webp` — a large steel I-beam rigged with chains being hoisted by a crane hook against an overcast sky.
- **Production Status** → `ProductionStatus.webp` — a welder in a fab shop throwing bright orange sparks, dark shop interior, dramatic light.
- **Procurement** → `Procurement.webp` — neatly stacked bundles of steel HSS tube and angle in a fabrication yard, cool morning light.
- **Budget Hours** → `BudgetHours.webp` — a calculator and a ballpoint pen lying on printed spreadsheets/timesheets, top-down, soft light.
- **Risk** → `RiskHub.webp` — a construction site under a dramatic dark storm sky with a single lightning bolt in the distance.
- **Resources** → `ResourceHub.webp` — a stack of white hard hats and work gloves resting on steel, warehouse light, shallow focus.
- **Deliveries** → `Deliveries.webp` — a flatbed semi-truck loaded with bundled structural steel parked at a job site, low angle, overcast.

### Field
- **Field Today** → `FieldToday.webp` — a foreman in hard hat and hi-vis holding a tablet on an active steel-erection site, golden-hour backlight.
- **Field Hub** → `FieldHub.webp` — a site supervisor with a laptop at a steel frame, several workers blurred in the background.

### Cost
- **Budget Control** → `CostHub.webp` — financial spreadsheets and a cost ledger with a pen, a calculator edge in frame, moody desk light.
- **Change Orders** → `ChangeOrders.webp` — a contract document with a pen, dollar figures visible as blurred numbers (no readable text), shallow focus.
- **Schedule of Values** → `SOV.webp` — a printed financial schedule / billing breakdown spreadsheet on a desk, soft raking light.
- **Pay Application** → `PayApplications.webp` — an invoice/billing document on a laptop screen on a desk, dim office, screen glow.
- **Backcharge Defense** → `Backcharges.webp` — a stack of documentation and a folder with a pen on a steel desk, a sense of an evidence file, low key.
- **Expenses** → `Expenses.webp` — a few crumpled receipts and an expense report on a desk, shallow focus, warm lamp light.

### Documents & reports
- **Documents** → `Documents.webp` — neatly stacked binders and document folders on a shelf/desk in a site office, shallow focus.
- **Reports** → `ReportsHub.webp` — a laptop showing analytics charts and a pie graph on a desk with printed reports beside it, dim room.

### Administration
- **Team** → `OrgMembers.webp` — a small group of construction workers in hi-vis and hard hats standing together at a steel site, seen from behind.
- **Billing** → `Billing.webp` — a laptop showing an invoice with a credit card beside it on a desk, soft light.
- **Vendors** → `Vendors.webp` — two people in hi-vis/business attire shaking hands at a fabrication facility, warm industrial light.
- **Settings** → `Settings.webp` — an extreme close-up of structural bolts, nuts and a wrench / gear on steel, cool light, shallow focus.

### Tools
- **Calculators** → `CalculatorsHub.webp` — an engineering calculator resting on rolled steel blueprints with a pencil, soft desk light.

---

## 3. Integration (code — handled in this plan)

- `ModuleTile` renders the photo as an `<img>` with an `onError` → gradient fallback, so missing files degrade gracefully (interim 404s in the network tab are harmless and disappear as files are added).
- `PHOTO_ASSETS` in `src/config/launcherConfig.js` is pre-filled with all 31 `/photos/desktop/<PageKey>.webp` paths.
- Drop folder: `public/photos/desktop/` (served at `/photos/desktop/...`).

**Optimizer:** `scripts/optimize-desktop-photos.mjs` turns raw generated images
into finished tiles. Drop images (any size/format — png/jpg/webp/avif) into
`public/photos/desktop/_raw/`, named by PageKey **or** human label
(`FabRelease.png`, `fab release.jpg`, `schedule of values.png` all work), then run:

```powershell
node scripts/optimize-desktop-photos.mjs
```

It center-crops to 3:2, resizes to 1536×1024, encodes WebP under ~180 KB, writes
`public/photos/desktop/<PageKey>.webp`, and prints what it placed + which of the 31
are still missing. (`sharp` self-installs once into the gitignored `scripts/.imgtools/`;
`_raw/` is gitignored, the optimized `.webp` outputs are committed.)

**Your loop:** generate images → drop them in `_raw/` → run the script → reload the
launcher; the tiles light up. No per-photo code changes needed.

## 4. Acceptance
- All 31 tiles show distinct, cohesive photos with legible white icon + label.
- Each WebP ≤ ~180 KB; launcher remains smooth (tiles lazy-load).
- Re-run the validation ladder; field-verify the launcher in the running app.
