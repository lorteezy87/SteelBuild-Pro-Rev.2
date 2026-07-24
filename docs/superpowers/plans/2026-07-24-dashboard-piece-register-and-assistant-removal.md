# Dashboard Piece Register and Assistant Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore canonical piece reporting to the light Command dashboard and remove every active Project Management Assistant application path.

**Architecture:** `Dashboard.jsx` injects canonical piece reporting into an optional slot owned by `DashboardControlCenter`, keeping the widget inside the existing Command skin. `CanonicalPieceDashboard` retains all query/rollup logic but adopts Command UI markup. PMA removal deletes its frontend and Edge Function leaves, then removes route, registry, entity, export, telemetry, gateway, and active-documentation references.

**Tech Stack:** React 18, TypeScript/JSX, TanStack Query, Vitest/Testing Library, Supabase Edge Functions, Vite.

## Global Constraints

- Do not change canonical piece-control repository or rollup semantics.
- Do not modify `src/components/command/**` or `src/styles/command.css`.
- Keep the intentionally light `data-skin="command"` dashboard direction.
- Do not rewrite archived migrations or destructively delete retained database data.
- Use tests first and keep lint, all typecheck gates, Vitest, and production build green.

---

### Task 1: Add regression guards

**Files:**
- Create: `src/components/dashboard/__tests__/CanonicalPieceDashboard.test.tsx`
- Create: `src/__tests__/pmaRemoval.test.ts`

**Interfaces:**
- Consumes: `CanonicalPieceDashboard({ project, onOpenRegister })`.
- Produces: a UI regression contract and a repository retirement contract.

- [ ] **Step 1: Write the failing dashboard component test**

Render `CanonicalPieceDashboard` through a `QueryClientProvider`, mock `fetchCanonicalDashboardSnapshot`, and assert:

```tsx
expect(screen.getByRole("heading", { name: "Piece Register" })).toBeInTheDocument();
expect(container.querySelector(".cmd-panel")).not.toBeNull();
expect(container.querySelector(".cmd-kpi-strip")).not.toBeNull();
expect(container.querySelector(".cmd-table")).not.toBeNull();
fireEvent.click(screen.getByRole("button", { name: "View all" }));
expect(onOpenRegister).toHaveBeenCalledOnce();
expect(screen.queryByText("Canonical Piece Control")).not.toBeInTheDocument();
```

- [ ] **Step 2: Write the failing repository-removal test**

Assert the retired component/function/page paths do not exist and scan active runtime/config files for forbidden identifiers:

```ts
const forbiddenPaths = [
  "src/components/ai-assistant",
  "supabase/functions/schedule-assistant",
  "src/pages/DecisionLog.jsx",
];
for (const path of forbiddenPaths) expect(existsSync(resolve(root, path))).toBe(false);
```

Scan `Layout.jsx`, routes, module registry, entity registry, soft-delete registry, gateway router/test, exports, and instrumentation for `AiAssistant`, `schedule-assistant`, `schedule-assist`, `PmaDecision`, `PmaAssumption`, `PmaAuditLog`, and the three `pma_*` table names.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npx vitest run src/components/dashboard/__tests__/CanonicalPieceDashboard.test.tsx src/__tests__/pmaRemoval.test.ts
```

Expected: both tests fail against the legacy dashboard markup and existing PMA paths.

- [ ] **Step 4: Commit the failing tests**

```bash
git add src/components/dashboard/__tests__/CanonicalPieceDashboard.test.tsx src/__tests__/pmaRemoval.test.ts
git commit -m "test: guard piece dashboard UI and PMA removal"
```

### Task 2: Restore the dashboard Piece Register presentation

**Files:**
- Modify: `src/pages/Dashboard.jsx`
- Modify: `src/pages/dashboardCC/DashboardControlCenter.tsx`
- Modify: `src/components/dashboard/CanonicalPieceDashboard.tsx`

**Interfaces:**
- Produces: `DashboardControlCenterProps.pieceRegister?: ReactNode`.
- Produces: `CanonicalPieceDashboardProps.onOpenRegister?: () => void`.

- [ ] **Step 1: Add the control-center slot**

Add `pieceRegister?: ReactNode` to `DashboardControlCenterProps`, destructure it, and render it directly after `<KpiStrip cells={kpiCells} />`.

- [ ] **Step 2: Move the canonical widget inside the slot**

Replace the sibling render in `Dashboard.jsx` with:

```jsx
<DashboardControlCenter
  pieceRegister={(
    <CanonicalPieceDashboard
      project={activeProject}
      onOpenRegister={() => onNavigateDash("piece-register")}
    />
  )}
  {...dashboardProps}
/>
```

Add `"piece-register": "/PieceRegister"` to the dashboard navigation map.

- [ ] **Step 3: Replace legacy presentation with Command UI markup**

Keep the existing query and derivation code. Render a `DecisionPanel` titled `Piece Register`, a four-cell `.cmd-kpi-strip`, `.cmd-panels` for lifecycle/backlog and ships/shadow comparison, and a `.cmd-table` for work packages. Use only Command variables/classes and inline layout values; remove slate/teal legacy utility styling.

- [ ] **Step 4: Run the component test and verify GREEN**

```bash
npx vitest run src/components/dashboard/__tests__/CanonicalPieceDashboard.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit the dashboard fix**

```bash
git add src/pages/Dashboard.jsx src/pages/dashboardCC/DashboardControlCenter.tsx src/components/dashboard/CanonicalPieceDashboard.tsx src/components/dashboard/__tests__/CanonicalPieceDashboard.test.tsx
git commit -m "fix(dashboard): restore Piece Register command UI"
```

### Task 3: Remove PMA frontend and navigation

**Files:**
- Delete: `src/components/ai-assistant/**`
- Delete: `src/pages/DecisionLog.jsx`
- Modify: `src/Layout.jsx`
- Modify: `src/config/routes.js`
- Modify: `src/config/moduleRegistry.js`
- Modify: `src/api/client/entities.ts`
- Modify: `src/api/client/softDelete.ts`

**Interfaces:**
- Removes: launcher/drawer/hook/components, Decision Log route, `PmaDecision`, `PmaAssumption`, and `PmaAuditLog` entity clients.

- [ ] **Step 1: Remove shell wiring and deleted files**

Delete the assistant component directory and remove both the lazy import and overlay render from `Layout.jsx`.

- [ ] **Step 2: Remove Decision Log registration**

Delete `DecisionLog.jsx`, remove its route entry, and remove it from the REPORTS primary-tab page list.

- [ ] **Step 3: Remove PMA entity registrations**

Delete the three entity clients and remove their table names from `PROJECT_SCOPED_TABLES`.

- [ ] **Step 4: Run route/type focused checks**

```bash
npm run typecheck
npm run typecheck:js
```

Expected: pass with no stale imports or route references.

- [ ] **Step 5: Commit frontend retirement**

```bash
git add -A src/components/ai-assistant src/pages/DecisionLog.jsx src/Layout.jsx src/config/routes.js src/config/moduleRegistry.js src/api/client/entities.ts src/api/client/softDelete.ts
git commit -m "refactor: remove Project Management Assistant frontend"
```

### Task 4: Remove PMA backend and integration contracts

**Files:**
- Delete: `supabase/functions/schedule-assistant/**`
- Modify: `supabase/functions/llm-proxy/router.ts`
- Modify: `supabase/functions/project-export/index.ts`
- Modify: `src/__tests__/llmGateway.test.ts`
- Modify: `src/instrument.js`
- Modify: `src/lib/workspaceExport.ts`
- Modify: `supabase/scripts/probe_anon_access.sql`

**Interfaces:**
- Removes: the `schedule-assist` LLM route and PMA table exports/probes.

- [ ] **Step 1: Delete the Edge Function**

Remove the complete `supabase/functions/schedule-assistant` directory.

- [ ] **Step 2: Remove gateway and export registrations**

Delete `schedule-assist` from `ROUTING_TABLE`, remove its tests/required-key entry, remove `pma_assumptions` and `pma_decisions` from project exports, and remove PMA table probes.

- [ ] **Step 3: Remove stale runtime comments**

Make instrumentation and workspace-export comments generic without referring to the deleted function/hook.

- [ ] **Step 4: Run focused tests**

```bash
npx vitest run src/__tests__/llmGateway.test.ts src/__tests__/pmaRemoval.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit backend retirement**

```bash
git add -A supabase/functions/schedule-assistant supabase/functions/llm-proxy/router.ts supabase/functions/project-export/index.ts src/__tests__/llmGateway.test.ts src/instrument.js src/lib/workspaceExport.ts supabase/scripts/probe_anon_access.sql
git commit -m "refactor: remove Project Management Assistant backend"
```

### Task 5: Scrub active documentation and verify the repository

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `TECH_DEBT.md`
- Modify: `docs/TODO.md`
- Modify: `docs/runbooks/backup-dr.md`
- Modify: `docs/PHASE_0_FINAL.md`
- Modify: `ENTERPRISE_READINESS_AUDIT.md`
- Modify or remove stale PMA sections from current workflow plans/audits where referenced.

- [ ] **Step 1: Remove current-product references**

Update function inventories, architecture diagrams, deployment commands, debt/TODO items, and runbooks so they describe the remaining app only. Historical archived SQL remains unchanged.

- [ ] **Step 2: Run the complete verification suite**

```bash
npm run lint
npm run typecheck
npm run typecheck:js
npm run typecheck:strict
npm run typecheck:noimplicitany
npm test
npm run build
```

Expected: every command exits 0.

- [ ] **Step 3: Search for stale active references**

```bash
git grep -n -E 'AiAssistant|schedule-assistant|schedule-assist|PmaDecision|PmaAssumption|PmaAuditLog|pma_(decisions|assumptions|audit_logs)' -- ':!supabase/migrations_archive/**' ':!supabase/migrations/**' ':!src/types/supabase.ts' ':!docs/superpowers/specs/**' ':!docs/superpowers/plans/**'
```

Expected: no output.

- [ ] **Step 4: Commit documentation cleanup**

```bash
git add AGENTS.md README.md ARCHITECTURE.md TECH_DEBT.md docs ENTERPRISE_READINESS_AUDIT.md src/__tests__/pmaRemoval.test.ts
git commit -m "docs: remove retired assistant references"
```

- [ ] **Step 5: Release the claim**

Remove `claude-piece-dashboard-pma-removal` from `AGENT_CLAIMS.md` and commit:

```bash
git add AGENT_CLAIMS.md
git commit -m "chore: release dashboard and PMA claim"
```
