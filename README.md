# SteelBuild Pro

A real-time project management platform purpose-built for structural steel
contractors — tracking drawings, submittals, RFIs, fabrication, deliveries,
change orders, costs, and field operations from detailing through closeout.

## Stack

- **Frontend**: Vite + React 18, Tailwind CSS, shadcn/radix UI primitives,
  TanStack Query, React Router, Recharts, react-leaflet
- **3D / 2D viewers**: `@thatopen/components` v3 (IFC/fragments) and pdf.js
- **Data**: Supabase (Postgres + RLS + Storage + Auth + Edge Functions)
- **Hosting**: Vercel (auto-deploys from `codex/base44-deploy-nick`)
- **LLM**: Anthropic Claude via the `llm-proxy` Supabase Edge Function

## Local development

Requires Node 20+.

```bash
npm install
npm run dev
```

Create `.env.local` with the two required variables:

```env
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

Optional — falls back to direct Anthropic calls if the `llm-proxy` edge
function is unavailable:

```env
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

## Scripts

| Command              | What it does                                 |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Start the Vite dev server                    |
| `npm run build`      | Production build to `dist/`                  |
| `npm run preview`    | Serve the built bundle locally               |
| `npm run lint`       | ESLint (quiet — warnings suppressed)         |
| `npm run lint:fix`   | ESLint with autofix                          |
| `npm run typecheck`  | `tsc --noEmit` against `jsconfig.json`       |
| `npm test`           | Vitest run (unit tests)                      |
| `npm run test:watch` | Vitest in watch mode                         |

## Layout

```
src/
  pages/         route-level screens
  components/    feature-scoped UI (drawings/, financials/, dms/, …)
  hooks/         TanStack Query hooks + CRUD wrappers
  api/           Supabase client + storage helpers
  lib/           shared utilities, auth context, query client
supabase/
  migrations/    ordered SQL migrations (`NNN_name.sql`)
  functions/     Supabase Edge Function source (currently: llm-proxy)
public/          static assets, wasm, pdf/fragments workers
```

## Database migrations

Migrations live in `supabase/migrations/` and are applied via the Supabase
dashboard SQL editor or the Supabase MCP/CLI. After applying a migration
that adds columns, the code calls `NOTIFY pgrst, 'reload schema'` so
PostgREST picks up the change without a restart.

## Deployment

- Feature work lands on a `claude/*` branch.
- Deploys go out via merge into `codex/base44-deploy-nick`, which Vercel
  auto-builds and publishes. `CLAUDE.md` documents the full auto-deploy
  workflow.

## AI Drawing Analysis

Upload a structural-steel PDF (IFC, shop drawings, revisions, IFA) at
**Drawings → Drawing Analysis (AI)**. The module:

1. Stores the PDF in Supabase Storage (`uploads/` bucket).
2. Inserts a `drawing_analyses` row with `status='pending'`.
3. Calls the `llm-proxy` Edge Function with the PDF as a base64 document
   block and a structured-output tool (`submit_analysis`).
4. Persists the sheet index (`drawing_sheets`) and findings
   (`drawing_findings`), and flips the row to `complete`.

**Limits** — 32 MB and ~100 pages per request (Anthropic document-block
limits). The upload zone enforces the 32 MB cap client-side.

**Tuning the analyst prompt**. The system prompt and tool schema live in
[`src/lib/analyzeDrawing.js`](src/lib/analyzeDrawing.js). To tune for a
different drawing type (cold-formed framing, steel joists, misc metals):

- Expand the focus list in `SYSTEM_PROMPT` with the specific callouts
  you want flagged (e.g. bridging spacing for joists, gauge callouts for
  cold-formed, field-bolt vs field-weld notes for misc metals).
- Add new enum values to `finding_type` in both `ANALYSIS_TOOL.input_schema`
  and the `drawing_findings.finding_type` CHECK constraint (next
  migration).
- Update `FINDING_TYPE_LABEL` in
  [`src/components/drawings/analysis/tokens.js`](src/components/drawings/analysis/tokens.js)
  so the new type renders a pill.

**Promote a finding to an RFI**. The detail drawer exposes "Create RFI"
per finding. This inserts a draft row into `rfis` with the sheet number
as `drawing_reference`, severity-mapped priority, and a back-link via
`drawing_findings.linked_rfi_id`.

**Phase roadmap**
- Phase 1 (shipped): schema, upload, analysis, sheet index, findings,
  RFI creation link.
- Phase 2 (shipped): full RFI dialog (author, assignees, due date,
  ball in court, distribution list) replacing the one-click draft —
  lives at [CreateRfiFromFindingDialog.jsx](src/components/drawings/analysis/CreateRfiFromFindingDialog.jsx).
- Phase 3 (shipped): revision-delta detection. Use the "Compare
  Revisions" button (top-right of the page) to pick a FROM and TO
  analysis — both PDFs are sent to Claude in a single message via the
  `submit_revision_diff` tool, and the structured deltas land in
  `drawing_revision_deltas`. Comparisons are project-scoped; each
  shows up as its own card in a "Revision Comparisons" section below
  the uploaded sets. The comparator logic lives at
  [compareRevisions.js](src/lib/compareRevisions.js) and the allowed
  delta_type values are the same list in both the Anthropic tool
  schema and the CHECK constraint on
  `drawing_revision_deltas.delta_type`.

## Notes on third-party viewers

- `src/pages/ModelViewer.jsx` uses `@thatopen/components` v3.4.0.
  `FragmentsManager.init()` requires a worker URL — we serve it from
  `public/thatopen/fragments-worker.mjs`. If you upgrade
  `@thatopen/fragments`, re-copy
  `node_modules/@thatopen/fragments/dist/Worker/worker.mjs` there.
- `src/pages/DrawingViewer.jsx` defaults to a browser-native `<iframe>`
  for reliability; pdf.js canvas mode is available via the toolbar
  toggle for cases that need it.
