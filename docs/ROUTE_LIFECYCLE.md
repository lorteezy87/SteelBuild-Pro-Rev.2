# Route lifecycle contract

The route layer now distinguishes route intent so lifecycle, visibility, and navigation integrity are explicit and testable.

## active
- Customer-facing, supported application workflows.
- These pages are mounted as normal registry entries in `ROUTE_REGISTRY` and render through `PAGES`.
- `DataExchange`, `UsersManagement`, `ProjectMembers`, and `FeatureFlagsAdmin` are explicitly not active in this category.

## internal
- Privileged/operational routes that should remain supported but are not part of the primary customer workflow navigation.
- Current internal pages: `DataExchange`, `UsersManagement`, `ProjectMembers`, `FeatureFlagsAdmin`.
- Internal routes are still registered with full runtime support and access via direct route.

## legacy
- Compatibility redirects kept to preserve historic deep links.
- Legacy compatibility paths in `STATIC_ROUTE_METADATA`:
  - `/GanttChart` → `/Schedule`
  - `/RFIHub` → `/RFIs`
  - `/Financials` → `/CostHub`
  - `/CostDashboard` → `/CostHub`
  - `/ProjectDetail` → `/Projects`
  - `/ResourceManagement` → `/ResourceHub`
- `/AIInsights` → `/PortfolioHub`
- Legacy entries remain in route inventory and are validated as redirects with mounted targets.
- PortfolioHub remains the canonical Portfolio Overview route entry.
- Executive View remains supported as a separate workflow in ExecutiveView.

CostHub is the canonical Budget Control surface. `/Financials` and
`/CostDashboard` now resolve to `/CostHub` through compatibility redirects.

- Resources are canonicalized in `ResourceHub`:
  - `/ResourceManagement` is a compatibility redirect to `/ResourceHub`.
  - `ResourceHub` owns the supported Resource Register workflow via
    `ResourcesControlCenter`.
  - Crew Scheduling remains a distinct supported workflow in
    `ResourceScheduling` and continues to be a separate registered page.

## retired
- Retired implementations are deleted from the registry and routing entry points.
- Examples already retired in prior batches:
  - `src/pages/AgentMemory.jsx`
  - `src/pages/ProjectDetail.jsx`
- Retired server/PDF report execution paths in Job Status report were removed in Batch 10.

## placeholder policy
- Placeholder pages and placeholder-only screens must not be registered in `ROUTE_REGISTRY`.
- If a new workflow is added, it must include a real page implementation and a meaningful registration label/lifecycle.

## operational rules
- All new internal tooling routes must set explicit `lifecycle` metadata in their registry entry.
- Route metadata validation runs in `validateRoutes()` and enforces:
  - registered page labels exist,
  - each registered page lifecycle is `active` or `internal`,
  - static compatibility entries are mounted in `ALL_ROUTE_PATHS`,
  - legacy redirect targets are present in `ALL_ROUTE_PATHS`.



