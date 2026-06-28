/**
 * RiskHub — consolidates the fabrication risk/exception surfaces under one nav
 * entry (module-consolidation). Margin Risk (dollar exposure via
 * marginRiskEngine) and Constraints (operational blockers via constraintEngine)
 * read an overlapping source set (RFIs, submittals, deliveries, schedule tasks,
 * work packages) but produce different outputs — they're naturally viewed
 * together as "what's at risk / what's blocked."
 *
 * Thin tab shell (the DrawingSubmittalHub / FieldHub / CostHub / ScheduleHub
 * pattern): each tab lazy-loads the existing page unchanged; both stay
 * independently routable. `?risk_tab=` drives the active tab.
 *
 * command_ui flag-branch:
 *   When the `command_ui` feature flag is ON, the hub shell is replaced by
 *   RiskControlCenter — a unified light-theme Command UI view that pulls from
 *   both data sources (marginRiskEngine + user Constraints) in a single page.
 *   The classic tab-shell and both sub-pages are untouched; the flag-branch
 *   simply returns early before rendering them.
 *
 *   Data fetching for the flag-branch mirrors MarginRisk.jsx:
 *   - sources come from the same 7 entity queries
 *   - calculateMarginRisk(sources).signals drives KPIs + panels + table
 *   - constraints from entities.ActionItem (category=CONSTRAINT) fill the third panel
 */
import { useMemo, useState, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { lazyWithRetry } from "@/lib/lazyRetry";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { useFlag } from "@/hooks/useFeatureFlag";
import { useProjectId } from "@/hooks/useProjectId";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { entities } from "@/api/supabaseClient";
import { calculateMarginRisk } from "@/services/marginRiskEngine";
import { buildRiskSummary } from "./riskHub/riskControlCenter.derive";
import RiskControlCenter from "./riskHub/RiskControlCenter";

// ── Classic sub-pages (untouched) ─────────────────────────────────────────────

const MarginRiskPage = lazyWithRetry(() => import("@/pages/MarginRisk"));
const ConstraintsPage = lazyWithRetry(() => import("@/pages/Constraints"));

const TABS = [
  { key: "margin", label: "Margin Risk", Component: MarginRiskPage },
  { key: "constraints", label: "Constraints", Component: ConstraintsPage },
];

// ── Classic hub shell ─────────────────────────────────────────────────────────

function ClassicRiskHub() {
  const [params, setParams] = useSearchParams();
  const param = params.get("risk_tab");
  const activeKey = TABS.some((t) => t.key === param) ? param : "margin";
  const Active = (TABS.find((t) => t.key === activeKey) || TABS[0]).Component;
  const setTab = (key) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("risk_tab", key);
        return next;
      },
      { replace: true },
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        role="tablist"
        aria-label="Risk"
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          padding: "10px 24px 0",
          flexWrap: "wrap",
        }}
      >
        {TABS.map((tab) => {
          const isActive = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(tab.key)}
              style={{
                minHeight: 34,
                padding: "7px 14px",
                borderRadius: 9,
                border: `1px solid ${isActive ? "var(--accent)" : "var(--border-default)"}`,
                background: isActive
                  ? "color-mix(in srgb, var(--accent) 14%, var(--bg-surface-high))"
                  : "var(--bg-surface-low)",
                color: isActive ? "var(--accent)" : "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ minHeight: 0, position: "relative" }}>
        <ErrorBoundary label="Risk">
          <Suspense fallback={<LoadingSkeleton variant="page" />}>
            <Active />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}

// ── Command UI data wrapper ────────────────────────────────────────────────────

function CommandRiskHub() {
  const projectId = useProjectId();
  const { activeProject } = useProjectContext();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  // -- Data (mirrors MarginRisk.jsx queryFn exactly) --
  const { data: sources = {}, isLoading } = useQuery({
    queryKey: ["margin-risk-sources", projectId],
    queryFn: async () => {
      if (!projectId) return {};
      const read = (entity, order) =>
        order
          ? entity.filter({ project_id: projectId }, order).catch(() => [])
          : entity.filter({ project_id: projectId }).catch(() => []);
      const [rfis, submittals, workPackages, deliveries, inspections, scheduleTasks, changeOrders] = await Promise.all([
        read(entities.RFI, "-submitted_date"),
        read(entities.Submittal, "-submitted_date"),
        read(entities.WorkPackage),
        read(entities.Delivery, "-scheduled_date"),
        read(entities.Inspection, "-inspection_date"),
        read(entities.ScheduleTask, "start_date"),
        read(entities.ChangeOrder),
      ]);
      return { rfis, submittals, workPackages, deliveries, inspections, scheduleTasks, changeOrders };
    },
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  // -- Constraints (action_items with category=CONSTRAINT) --
  const { data: constraints = [] } = useQuery({
    queryKey: ["constraints", projectId],
    queryFn: () =>
      projectId
        ? entities.ActionItem.filter({ project_id: projectId, category: "CONSTRAINT" })
        : entities.ActionItem.filter({ category: "CONSTRAINT" }),
    staleTime: 30_000,
  });

  // -- Derive --
  const risk = useMemo(() => calculateMarginRisk(sources), [sources]);
  const summary = useMemo(() => buildRiskSummary(risk.signals, constraints), [risk.signals, constraints]);

  // All FlatRisk items (already built inside buildRiskSummary internals);
  // reconstruct the flat list for the table from topByScore + extras.
  // Re-derive via a direct call so the table has the full unsorted set.
  const { FlatAll } = useMemo(() => {
    // We need the full flat list for filtering. Re-derive it from the
    // summary fields that expose the full set.
    // NOTE: buildRiskSummary only exposes topByScore (6 items) and
    // needsMitigation (6 items) in its result. For the full table we
    // re-flatten the signal items + constraints directly here.
    // This is safe — same pure functions, no side effects.
    const { flattenEngine, flattenCons } = _flatHelpers();
    return { FlatAll: [...flattenEngine(risk.signals), ...flattenCons(constraints)] };
  }, [risk.signals, constraints]);

  // Client-side filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return FlatAll.filter((item) => {
      if (categoryFilter !== "All" && item.category !== categoryFilter) return false;
      if (q && !`${item.label} ${item.category} ${item.detail}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [FlatAll, search, categoryFilter]);

  const handleExport = () => {
    const rows = [
      ["Risk", "Category", "Severity", "Exposure", "Status", "Owner", "Detail"],
      ...filtered.map((r) => [r.label, r.category, r.severity, r.exposure, r.mitigationStatus ?? "Active", r.owner ?? "—", r.detail]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "risk-export.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!projectId) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
          Select a Project
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Risk analysis is project-scoped. Choose a project from the top nav.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        <LoadingSkeleton variant="page" />
      </div>
    );
  }

  const projectName = activeProject?.name || "Project";

  return (
    <RiskControlCenter
      projectName={projectName}
      signals={risk.signals}
      filtered={filtered}
      all={FlatAll}
      summary={summary}
      search={search}
      onSearch={setSearch}
      categoryFilter={categoryFilter}
      onCategoryChange={setCategoryFilter}
      onExport={handleExport}
      totalExposureFmt={risk.totalExposure > 0 ? _fmtMoney(risk.totalExposure) : null}
    />
  );
}

// ── Shared pure helpers exposed to CommandRiskHub ─────────────────────────────
// These duplicate the private fns from riskControlCenter.derive.ts so
// CommandRiskHub can reconstruct the full flat list for filtering without
// modifying the derive module's public API.

function _fmtMoney(n) {
  if (!n) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

const SIGNAL_LABEL_MAP = {
  open_rfis: "Open RFIs",
  rejected_submittals: "Rejected Submittals",
  labor_burn: "Labor Burn",
  late_procurement: "Late Procurement",
  failed_inspections: "Failed Inspections",
  schedule_slips: "Schedule Slips",
  unsigned_cos: "Unsigned Change Orders",
};

const RESOLVED_STATUSES = new Set(["Resolved", "Closed"]);

function _flatHelpers() {
  function priorityToSeverity(p) {
    if ((p || "").toLowerCase() === "critical") return "critical";
    if ((p || "").toLowerCase() === "high") return "high";
    return "medium";
  }

  function flattenEngine(signals) {
    const out = [];
    for (const sig of signals) {
      const category = SIGNAL_LABEL_MAP[sig.signal] || sig.signal;
      for (const item of sig.items) {
        out.push({
          id: `${sig.signal}:${String(item.entityId)}`,
          label: item.label,
          category,
          severity: item.severity,
          exposure: item.exposure,
          detail: item.detail,
          entityType: item.entityType,
          entityId: String(item.entityId ?? ""),
          owner: null,
          mitigationStatus: null,
          area: item.area ?? null,
        });
      }
    }
    return out;
  }

  function flattenCons(constraints) {
    return constraints
      .filter((c) => !RESOLVED_STATUSES.has(c.status ?? ""))
      .map((c) => ({
        id: c.id,
        label: c.title ?? "Untitled Constraint",
        category: c.constraint_type ?? "Constraint",
        severity: priorityToSeverity(c.priority),
        exposure: 0,
        detail: c.description ?? c.project_area ?? "",
        entityType: "Constraint",
        entityId: c.id,
        owner: c.assigned_to ?? null,
        mitigationStatus: c.status ?? null,
        area: c.project_area ?? null,
      }));
  }

  return { flattenEngine, flattenCons };
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function RiskHub() {
  const commandUi = useFlag("command_ui");

  if (commandUi) {
    return <CommandRiskHub />;
  }

  return <ClassicRiskHub />;
}
