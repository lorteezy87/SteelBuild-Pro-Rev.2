/**
 * RiskHub — canonical risk triage surface.
 *
 * RiskHub combines margin-risk signals and open constraints in one triage surface
 * via RiskControlCenter. Constraints remain the detailed CRUD workflow in the
 * separate Constraints page.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { useProjectId } from "@/hooks/useProjectId";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { entities } from "@/api/supabaseClient";
import { calculateMarginRisk } from "@/services/marginRiskEngine";
import { buildRiskSummary } from "./riskHub/riskControlCenter.derive";
import RiskControlCenter from "./riskHub/RiskControlCenter";

export default function RiskHub() {
  const projectId = useProjectId();
  const { activeProject } = useProjectContext();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

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

  const { data: constraints = [] } = useQuery({
    queryKey: ["constraints", projectId],
    queryFn: () =>
      projectId
        ? entities.ActionItem.filter({ project_id: projectId, category: "CONSTRAINT" })
        : entities.ActionItem.filter({ category: "CONSTRAINT" }),
    staleTime: 30_000,
  });

  const risk = useMemo(() => calculateMarginRisk(sources), [sources]);
  const summary = useMemo(() => buildRiskSummary(risk.signals, constraints), [risk.signals, constraints]);

  const { FlatAll } = useMemo(() => {
    const { flattenEngine, flattenCons } = _flatHelpers();
    return { FlatAll: [...flattenEngine(risk.signals), ...flattenCons(constraints)] };
  }, [risk.signals, constraints]);

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
