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
import {
  buildRiskSummary,
  buildFlatRisks,
  filterFlatRisks,
  formatRiskExposureMoney,
  buildRiskCsvRows, buildRiskCsvString,
} from "./riskHub/riskControlCenter.derive";
import { downloadTextFile } from "@/lib/exports/fabRelease";
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

  const FlatAll = useMemo(
    () => buildFlatRisks(risk.signals, constraints),
    [risk.signals, constraints],
  );

  const filtered = useMemo(
    () => filterFlatRisks(FlatAll, { search, categoryFilter }),
    [FlatAll, search, categoryFilter],
  );

  const handleExport = () => {
    const csv = buildRiskCsvString(buildRiskCsvRows(filtered));
    downloadTextFile(csv, "risk-export.csv", "text/csv;charset=utf-8");
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
      totalExposureFmt={risk.totalExposure > 0 ? formatRiskExposureMoney(risk.totalExposure) : null}
    />
  );
}

