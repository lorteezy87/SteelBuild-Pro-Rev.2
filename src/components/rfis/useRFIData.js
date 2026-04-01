import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { parseUTCDate } from "@/components/shared/formatters";
import {
  buildRfiNumberRepairs,
  daysOpen,
  isClosed,
  isOverdue,
} from "./rfiConfig";

export function useRFIData({
  projectId,
  activeProjectName,
  search,
  filterStatus,
  filterPriority,
  filterBIC,
  sortField,
  sortDir,
  overdueFirst,
}) {
  const { data: projects = [], isLoading: projectsLoading, isError: projectsError, error: projectsErrorDetails } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const { data: rfis = [], isLoading: rfisLoading, isError: rfisError, error: rfisErrorDetails } = useQuery({
    queryKey: ["rfis"],
    queryFn: () => base44.entities.RFI.list("-submitted_date"),
    initialData: [],
  });

  const loadingRfis = projectsLoading || rfisLoading;
  const hasRfisError = projectsError || rfisError;
  const rfisErrorMessage = projectsErrorDetails?.message || rfisErrorDetails?.message || "RFI data could not be loaded.";

  const projectNameById = useMemo(() => new Map(projects.map((project) => [project.id, project.name || ""])), [projects]);

  const normalizedRfis = useMemo(
    () =>
      rfis.map((rfi) => ({
        ...rfi,
        project_name: rfi.project_name || projectNameById.get(rfi.project_id) || "",
      })),
    [rfis, projectNameById]
  );

  const scopedRfis = useMemo(() => {
    if (!projectId) return [];
    return normalizedRfis.filter((rfi) => rfi.project_id === projectId);
  }, [normalizedRfis, projectId]);

  const filtered = useMemo(() => {
    return scopedRfis
      .filter((r) => (filterStatus === "all" ? true : r.status === filterStatus))
      .filter((r) => (filterPriority === "all" ? true : r.priority === filterPriority))
      .filter((r) => (filterBIC === "all" ? true : r.ball_in_court === filterBIC))
      .filter((r) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          (r.rfi_number || "").toLowerCase().includes(q) ||
          (r.title || "").toLowerCase().includes(q) ||
          (r.project_name || "").toLowerCase().includes(q) ||
          (r.submitted_by || "").toLowerCase().includes(q) ||
          (r.drawing_reference || "").toLowerCase().includes(q) ||
          (r.question || "").toLowerCase().includes(q) ||
          (r.answer || "").toLowerCase().includes(q) ||
          (r.spec_section || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const projectCmp = (a.project_name || "").localeCompare(b.project_name || "");
        if (projectCmp !== 0) return projectCmp;
        const overdueA = isOverdue(a) ? 1 : 0;
        const overdueB = isOverdue(b) ? 1 : 0;
        if (overdueFirst && overdueA !== overdueB) return overdueB - overdueA;
        const numA = parseInt((a.rfi_number || "").replace(/\D/g, "")) || 0;
        const numB = parseInt((b.rfi_number || "").replace(/\D/g, "")) || 0;
        const dir = sortDir === "asc" ? 1 : -1;
        if (sortField === "rfi_number") return (numA - numB) * dir;
        if (sortField === "project_name") return (a.project_name || "").localeCompare(b.project_name || "") * dir;
        if (sortField === "priority") {
          return (
            (["Critical", "High", "Medium", "Low"].indexOf(a.priority) - ["Critical", "High", "Medium", "Low"].indexOf(b.priority)) *
            dir
          );
        }
        if (sortField === "days") return (daysOpen(a) - daysOpen(b)) * dir;
        if (sortField === "date_required") {
          const da = a.date_required ? new Date(a.date_required) : new Date("2100-01-01");
          const db = b.date_required ? new Date(b.date_required) : new Date("2100-01-01");
          return (da - db) * dir;
        }
        return 0;
      });
  }, [scopedRfis, filterStatus, filterPriority, filterBIC, search, sortField, sortDir, overdueFirst]);

  const kpis = useMemo(() => {
    const open = scopedRfis.filter((r) => r.status === "Open").length;
    const underReview = scopedRfis.filter((r) => r.status === "Under Review").length;
    const answered = scopedRfis.filter((r) => r.status === "Answered").length;
    const closed = scopedRfis.filter((r) => r.status === "Closed").length;
    const critical = scopedRfis.filter((r) => r.priority === "Critical").length;
    const overdue = scopedRfis.filter((r) => isOverdue(r)).length;
    const dueThisWeek = scopedRfis.filter((r) => {
      if (isClosed(r) || !r.date_required) return false;
      const d = parseUTCDate(r.date_required);
      const today = new Date();
      const in7 = new Date();
      in7.setDate(today.getDate() + 7);
      return d >= today && d <= in7;
    }).length;
    const durations = scopedRfis
      .filter((r) => r.status === "Answered" && r.submitted_date && r.date_answered)
      .map((r) => {
        const a = new Date(r.submitted_date);
        const b = new Date(r.date_answered);
        return Math.max(0, Math.floor((b - a) / 86400000));
      });
    const avgResponse = durations.length ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length) : null;
    const costExposure = scopedRfis
      .filter((r) => r.cost_impact && r.cost_impact_amount && !["Answered", "Closed"].includes(r.status))
      .reduce((s, r) => s + (Number(r.cost_impact_amount) || 0), 0);
    const scheduleDays = scopedRfis
      .filter((r) => r.schedule_impact && r.schedule_impact_days && !["Answered", "Closed"].includes(r.status))
      .reduce((s, r) => s + (Number(r.schedule_impact_days) || 0), 0);
    return { open, underReview, answered, closed, critical, overdue, dueThisWeek, avgResponse, costExposure, scheduleDays };
  }, [scopedRfis]);

  const bicCounts = useMemo(() => {
    const openR = scopedRfis.filter((r) => ["Open", "Under Review"].includes(r.status));
    return ["Contractor", "GC", "Engineer", "Architect", "Owner"].map((p) => ({
      party: p,
      count: openR.filter((r) => r.ball_in_court === p).length,
    }));
  }, [scopedRfis]);

  const repairPlan = useMemo(() => buildRfiNumberRepairs(rfis), [rfis]);
  const numberingIssues = repairPlan.repairs.length;

  useEffect(() => {
    if (!normalizedRfis.length) return;
    const createRFIAlerts = async () => {
      try {
        const existing = await base44.entities.Alert.filter({ alert_type: "RFI_Overdue" });
        const existingIds = new Set(existing.map((a) => a.related_record_id));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const in3 = new Date(today.getTime() + 3 * 86400000);
        for (const r of normalizedRfis) {
          if (["Answered", "Closed"].includes(r.status)) continue;
          if (!r.date_required) continue;
          const due = new Date(r.date_required);
          due.setHours(0, 0, 0, 0);
          const isOD = due < today;
          const soon = !isOD && due <= in3;
          if (!isOD && !soon) continue;
          if (existingIds.has(r.id)) continue;
          const daysLate = isOD ? Math.floor((today - due) / 86400000) : 0;
          await base44.entities.Alert.create({
            alert_type: "RFI_Overdue",
            severity: r.priority === "Critical" || daysLate >= 7 ? "Critical" : daysLate >= 3 || r.priority === "High" ? "High" : "Medium",
            title: isOD ? `${r.rfi_number} OVERDUE - ${daysLate}d` : `${r.rfi_number} due within 3 days`,
            message: `${r.rfi_number}: "${(r.title || "").slice(0, 60)}" · BIC: ${r.ball_in_court || "Contractor"} · Priority: ${r.priority} · Project: ${r.project_name || "—"}`,
            related_entity: "RFI",
            related_record_id: r.id,
            project_id: r.project_id,
            project_name: r.project_name || "",
            is_read: false,
            is_dismissed: false,
          });
        }
      } catch (e) {
        console.warn("RFI alert:", e);
      }
    };
    const t = setTimeout(createRFIAlerts, 2500);
    return () => clearTimeout(t);
  }, [normalizedRfis]);

  const overdueList = filtered.filter((r) => isOverdue(r)).slice(0, 3);

  const groupedByProject = useMemo(() => {
    return { [projectNameById.get(projectId) || activeProjectName || "Current Project"]: filtered };
  }, [filtered, projectId, projectNameById, activeProjectName]);

  const resolveProjectName = (targetProjectId) => projectNameById.get(targetProjectId) || "";

  const agingBuckets = useMemo(() => {
    const open = scopedRfis.filter((r) => ["Open", "Under Review"].includes(r.status));
    const result = { fresh: 0, aging: 0, stale: 0, critical: 0 };
    open.forEach((r) => {
      const d = daysOpen(r);
      if (d < 7) result.fresh += 1;
      else if (d < 15) result.aging += 1;
      else if (d < 31) result.stale += 1;
      else result.critical += 1;
    });
    return result;
  }, [scopedRfis]);

  return {
    projects,
    rfis,
    normalizedRfis,
    scopedRfis,
    filtered,
    kpis,
    bicCounts,
    repairPlan,
    numberingIssues,
    overdueList,
    groupedByProject,
    agingBuckets,
    projectNameById,
    resolveProjectName,
    loadingRfis,
    hasRfisError,
    rfisErrorMessage,
  };
}
