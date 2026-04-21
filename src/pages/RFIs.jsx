
import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useProjectContext } from "../components/shared/useProjectContext";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import DeleteDialog from "@/components/shared/DeleteDialog";
import RFIFormModal from "@/components/rfis/RFIFormModal";
import RfiLogImportModal from "@/components/rfis/RfiLogImportModal";
import { getNextFormattedNumber } from "@/components/shared/numberSequencing";
import { parseUTCDate } from "@/components/shared/formatters";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  invalidateCrudQueries,
  toastCrudError,
} from "@/components/shared/crudFeedback";
import { batchProcess } from "@/utils/batchProcess";

// Feature-folder extraction — RFIs.jsx carve-up (src/pages/rfis/).
// The page shell now only owns React-Query wiring, filtering/derived
// data, and composition. Every chunk of UI is in its own file.
import { mono, statusColumns } from "./rfis/constants";
import {
  extractRfiSequence,
  buildRfiNumberRepairs,
  daysOpen,
  isClosed,
  isOverdue,
  exportRFIsToCSV,
} from "./rfis/utils";
import KpiStrip from "./rfis/KpiStrip";
import OverdueBar from "./rfis/OverdueBar";
import FilterBar from "./rfis/FilterBar";
import BulkActionBar from "./rfis/BulkActionBar";
import BulkImportModal from "./rfis/BulkImportModal";
import LeftSidebar from "./rfis/LeftSidebar";
import BoardView from "./rfis/BoardView";
import ListView from "./rfis/ListView";
import DetailPanel from "./rfis/DetailPanel";

export default function RFIs() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const qc = useQueryClient();

  const [view, setView] = useState("LIST");
  const [showForm, setShowForm] = useState(false);
  const [showLogImport, setShowLogImport] = useState(false);
  const [editingRFI, setEditingRFI] = useState(null);
  const [selectedRFI, setSelectedRFI] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterBIC, setFilterBIC] = useState("all");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [sortField, setSortField] = useState("rfi_number");
  const [sortDir, setSortDir] = useState("asc");
  const [overdueFirst, setOverdueFirst] = useState(false);
  const [selectedRFIs, setSelectedRFIs] = useState(new Set());
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkImportText, setBulkImportText] = useState("");
  const [showVoided, setShowVoided] = useState(false);
  const [agingFilter, setAgingFilter] = useState(null);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const projectMap = useMemo(() => {
    const map = {};
    for (const p of projects) map[p.id] = p.name || p.project_name || "";
    return map;
  }, [projects]);

  const { data: rfis = [], isLoading: rfisLoading } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () => base44.entities.RFI.filter({ project_id: projectId }, "-submitted_date"),
    enabled: !!projectId,
  });
  const rfiQueryKeys = [["rfis", projectId], ["rfis"]];

  // Honor ?id= and ?search= query params (e.g. when navigating from a Drawing's RFI badge)
  const urlRfiId = searchParams.get("id");
  const urlSearch = searchParams.get("search");
  useEffect(() => {
    if (urlSearch) setSearch(urlSearch);
  }, [urlSearch]);
  useEffect(() => {
    if (!urlRfiId || !rfis.length) return;
    const found = rfis.find((r) => r.id === urlRfiId);
    if (found) setSelectedRFI(found);
  }, [urlRfiId, rfis]);

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.RFI.create(data),
    onSuccess: async (created) => {
      appendRecordToCaches(qc, rfiQueryKeys, created, (record, key) => !key[1] || record.project_id === key[1]);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI created");
    },
    onError: (e) => toastCrudError(e, "Failed to create RFI"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RFI.update(id, data),
    onSuccess: async (updated) => {
      replaceRecordInCaches(qc, rfiQueryKeys, updated);
      if (selectedRFI?.id === updated.id) setSelectedRFI(updated);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI updated");
    },
    onError: (e) => toastCrudError(e, "Failed to update RFI"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.RFI.delete(id),
    onSuccess: async (_, deletedId) => {
      removeRecordFromCaches(qc, rfiQueryKeys, deletedId);
      if (selectedRFI?.id === deleteTarget?.id) setSelectedRFI(null);
      setDeleteTarget(null);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI deleted");
    },
    onError: (e) => toastCrudError(e, "Failed to delete RFI"),
  });
  const repairPlan = useMemo(() => buildRfiNumberRepairs(rfis), [rfis]);

  const repairNumbersMut = useMutation({
    mutationFn: async () => {
      const { repairs, skippedWithoutProject } = buildRfiNumberRepairs(rfis);
      if (!repairs.length) {
        return { repaired: 0, updates: [], skippedWithoutProject };
      }

      const projectNameById = new Map(projects.map((project) => [project.id, project.name || ""]));
      const updates = [];

      for (const repair of repairs) {
        const updated = await base44.entities.RFI.update(repair.id, {
          rfi_number: repair.next_number,
          project_name: repair.project_name || projectNameById.get(repair.project_id) || "",
        });
        updates.push(updated);
      }

      return { repaired: updates.length, updates, skippedWithoutProject };
    },
    onSuccess: async ({ repaired, updates, skippedWithoutProject }) => {
      updates.forEach((updated) => replaceRecordInCaches(qc, rfiQueryKeys, updated));
      await invalidateCrudQueries(qc, rfiQueryKeys);

      if (repaired > 0) {
        toast.success(`Repaired ${repaired} RFI number${repaired === 1 ? "" : "s"}`);
      } else {
        toast.success("RFI numbering is already clean");
      }

      if (skippedWithoutProject > 0) {
        toast.warning(`Skipped ${skippedWithoutProject} RFIs without a project`);
      }
    },
    onError: (e) => toastCrudError(e, "Failed to repair RFI numbering"),
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, data }) => {
      const results = await batchProcess(ids, (id) => base44.entities.RFI.update(id, data));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      setSelectedRFIs(new Set());
      await invalidateCrudQueries(qc, rfiQueryKeys);
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} updated, ${results.failed.length} failed`);
      } else {
        toast.success("RFIs updated");
      }
    },
    onError: (e) => toastCrudError(e, "Bulk update failed"),
  });

  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const bulkDeleteMut = useMutation({
    mutationFn: async (ids) => {
      const results = await batchProcess(ids, (id) => base44.entities.RFI.delete(id));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} deletes failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      const count = results.succeeded.length;
      setSelectedRFIs(new Set());
      setShowBulkDelete(false);
      if (selectedRFI && [...selectedRFIs].includes(selectedRFI.id)) setSelectedRFI(null);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      if (results.failed.length > 0) {
        toast.warning(`${count} deleted, ${results.failed.length} failed`);
      } else {
        toast.success(`${count} RFI${count === 1 ? "" : "s"} deleted`);
      }
    },
    onError: (e) => toastCrudError(e, "Bulk delete failed"),
  });

  const bulkImportMut = useMutation({
    mutationFn: async (rows) => {
      // Determine the next RFI number based on active records only.
      // Deleted RFI numbers are reusable (partial unique index excludes them).
      const existingNumbers = rfis
        .map((r) => extractRfiSequence(r.rfi_number))
        .filter((n) => n != null);
      let nextNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;

      const results = [];
      const projectName = projects.find((p) => p.id === projectId)?.name || "";
      const todayStr = new Date().toISOString().split("T")[0];

      for (const row of rows) {
        nextNum += 1;
        const created = await base44.entities.RFI.create({
          project_id: projectId,
          project_name: projectName,
          rfi_number: `RFI #${String(nextNum).padStart(3, "0")}`,
          title: row.title,
          description: row.description || "",
          priority: row.priority || "Medium",
          ball_in_court: row.ball_in_court || "GC",
          date_required: row.date_required || null,
          submitted_by: row.submitted_by || "",
          drawing_reference: row.drawing_reference || "",
          status: "Open",
          submitted_date: todayStr,
        });
        results.push(created);
      }
      return results;
    },
    onSuccess: async (created) => {
      await invalidateCrudQueries(qc, rfiQueryKeys);
      setShowBulkImport(false);
      setBulkImportText("");
      toast.success(`${created.length} RFIs imported`);
    },
    onError: (e) => toastCrudError(e, "Bulk import failed"),
  });

  const parseBulkImport = () => {
    const lines = bulkImportText.trim().split("\n").filter(Boolean);
    return lines.map((line) => {
      // Support: "Subject | Priority | BIC | Due Date | Drawing Ref"
      const parts = line.split("|").map((s) => s.trim());
      return {
        title: parts[0] || line,
        priority: ["Critical", "High", "Medium", "Low"].includes(parts[1]) ? parts[1] : "Medium",
        ball_in_court: ["Contractor", "GC", "Engineer", "Architect", "Owner"].includes(parts[2]) ? parts[2] : "GC",
        date_required: parts[3] || null,
        drawing_reference: parts[4] || "",
      };
    });
  };

  const toggleSelectRFI = (id) =>
    setSelectedRFIs((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleSelectAll = () =>
    setSelectedRFIs(selectedRFIs.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id)));

  const toggleStatus = (r) => {
    const order = statusColumns;
    const idx = order.indexOf(r.status || "Open");
    const next = order[Math.min(idx + 1, order.length - 1)];
    const extra = ["Answered", "Closed"].includes(next) ? { date_answered: new Date().toISOString().split("T")[0] } : {};
    updateMut.mutate({ id: r.id, data: { status: next, ...extra } });
  };
  const filtered = useMemo(() => {
    return rfis
      .filter((r) => showVoided || r.status !== "Void")
      .filter((r) => (filterStatus === "all" ? true : r.status === filterStatus))
      .filter((r) => (filterPriority === "all" ? true : r.priority === filterPriority))
      .filter((r) => (filterBIC === "all" ? true : r.ball_in_court === filterBIC))
      .filter((r) => {
        if (!agingFilter) return true;
        if (!["Open", "Under Review"].includes(r.status)) return false;
        const d = daysOpen(r);
        if (agingFilter === "fresh") return d < 7;
        if (agingFilter === "aging") return d >= 7 && d < 15;
        if (agingFilter === "stale") return d >= 15 && d < 31;
        if (agingFilter === "critical") return d >= 31;
        return true;
      })
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
        if (sortField === "priority")
          return (
            (["Critical", "High", "Medium", "Low"].indexOf(a.priority) - ["Critical", "High", "Medium", "Low"].indexOf(b.priority)) *
            dir
          );
        if (sortField === "days") return (daysOpen(a) - daysOpen(b)) * dir;
        if (sortField === "date_required") {
          const da = a.date_required ? new Date(a.date_required + "T00:00:00") : new Date("2100-01-01");
          const db = b.date_required ? new Date(b.date_required + "T00:00:00") : new Date("2100-01-01");
          return (da - db) * dir;
        }
        return 0;
      });
  }, [rfis, filterStatus, filterPriority, filterBIC, search, sortField, sortDir, overdueFirst, showVoided, agingFilter]);

  const kpis = useMemo(() => {
    const open = rfis.filter((r) => r.status === "Open").length;
    const underReview = rfis.filter((r) => r.status === "Under Review").length;
    const answered = rfis.filter((r) => r.status === "Answered").length;
    const closed = rfis.filter((r) => r.status === "Closed").length;
    const critical = rfis.filter((r) => r.priority === "Critical").length;
    const overdue = rfis.filter((r) => isOverdue(r)).length;
    const dueThisWeek = rfis.filter((r) => {
      if (isClosed(r) || !r.date_required) return false;
      const d = parseUTCDate(r.date_required);
      const today = new Date();
      const in7 = new Date();
      in7.setDate(today.getDate() + 7);
      return d >= today && d <= in7;
    }).length;
    const durations = rfis
      .filter((r) => r.status === "Answered" && r.submitted_date && r.date_answered)
      .map((r) => {
        const a = new Date(r.submitted_date + "T00:00:00");
        const b = new Date(r.date_answered + "T00:00:00");
        return Math.max(0, Math.floor((b - a) / 86400000));
      });
    const avgResponse = durations.length ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length) : null;
    const costExposure = rfis
      .filter((r) => r.cost_impact && r.cost_impact_amount && !["Answered", "Closed"].includes(r.status))
      .reduce((s, r) => s + (Number(r.cost_impact_amount) || 0), 0);
    const scheduleDays = rfis
      .filter((r) => r.schedule_impact && r.schedule_impact_days && !["Answered", "Closed"].includes(r.status))
      .reduce((s, r) => s + (Number(r.schedule_impact_days) || 0), 0);
    return { open, underReview, answered, closed, critical, overdue, dueThisWeek, avgResponse, costExposure, scheduleDays };
  }, [rfis]);
  const bicCounts = useMemo(() => {
    const openR = rfis.filter((r) => ["Open", "Under Review"].includes(r.status));
    return ["Contractor", "GC", "Engineer", "Architect", "Owner"].map((p) => ({
      party: p,
      count: openR.filter((r) => r.ball_in_court === p).length,
    }));
  }, [rfis]);
  const numberingIssues = repairPlan.repairs.length;

  const alertsCreatedRef = useRef(new Set());

  useEffect(() => {
    if (!rfis.length) return;
    const createRFIAlerts = async () => {
      try {
        const existing = await base44.entities.Alert.filter({ alert_type: "RFI_Overdue" });
        // related_record_id may not exist yet — fall back to title-based dedup
        const existingIds = new Set(
          existing.map((a) => a.related_record_id).filter(Boolean)
        );
        const existingTitles = new Set(existing.map((a) => a.title));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const in3 = new Date(today.getTime() + 3 * 86400000);
        for (const r of rfis) {
          if (["Answered", "Closed"].includes(r.status)) continue;
          if (!r.date_required) continue;
          if (alertsCreatedRef.current.has(r.id)) continue;
          const due = new Date(r.date_required + "T00:00:00");
          const isOD = due < today;
          const soon = !isOD && due <= in3;
          if (!isOD && !soon) continue;
          if (existingIds.has(r.id)) continue;
          const daysLate = isOD ? Math.floor((today - due) / 86400000) : 0;
          const liveProjectName = projectMap[r.project_id] || "";
          const alertTitle = isOD ? `${r.rfi_number} OVERDUE — ${daysLate}d` : `${r.rfi_number} due in ≤3 days`;
          if (existingTitles.has(alertTitle)) continue;
          await base44.entities.Alert.create({
            alert_type: "RFI_Overdue",
            severity: r.priority === "Critical" || daysLate >= 7 ? "Critical" : daysLate >= 3 || r.priority === "High" ? "High" : "Medium",
            title: alertTitle,
            description: `${r.rfi_number}: "${(r.title || "").slice(0, 60)}" · BIC: ${r.ball_in_court || "Contractor"} · Priority: ${r.priority} · Project: ${liveProjectName || "—"}`,
            project_id: r.project_id,
            project_name: liveProjectName,
          });
          alertsCreatedRef.current.add(r.id);
        }
      } catch (e) {
        console.warn("RFI alert:", e);
      }
    };
    const t = setTimeout(createRFIAlerts, 2500);
    return () => clearTimeout(t);
  }, [rfis, projectMap]);

  const overdueList = filtered.filter((r) => isOverdue(r)).slice(0, 3);
  const groupedByProject = useMemo(() => {
    if (projectId) return { [projectId]: filtered };
    const grouped = filtered.reduce((acc, r) => {
      const key = r.project_name || "Unknown Project";
      acc[key] = acc[key] ? [...acc[key], r] : [r];
      return acc;
    }, {});
    return Object.keys(grouped)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        acc[key] = grouped[key];
        return acc;
      }, {});
  }, [filtered, projectId]);

  const resolveProjectName = (targetProjectId) =>
    projects.find((project) => project.id === targetProjectId)?.name || "";

  const agingBuckets = useMemo(() => {
    const open = rfis.filter((r) => ["Open", "Under Review"].includes(r.status));
    const result = { fresh: 0, aging: 0, stale: 0, critical: 0 };
    open.forEach((r) => {
      const d = daysOpen(r);
      if (d < 7) result.fresh += 1;
      else if (d < 15) result.aging += 1;
      else if (d < 31) result.stale += 1;
      else result.critical += 1;
    });
    return result;
  }, [rfis]);

  if (rfisLoading) {
    return (
      <div style={{ padding: 24, background: "var(--bg-page)", height: "calc(100vh - 92px)" }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 92px)", background: "var(--bg-page)", overflow: "hidden" }}>
      {/* Command bar */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg-sidebar)", borderBottom: "1px solid var(--divider)", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "Space Grotesk, var(--font-display)", fontSize: 20, fontWeight: 800, textTransform: "uppercase", letterSpacing: "-0.01em", color: "var(--text-primary)" }}>RFI Hub</div>
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em" }}>
            {(projects.find((p) => p.id === projectId)?.name) || "All Projects"} · {rfis.length} RFIs · {kpis.open} open
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => qc.invalidateQueries({ queryKey: ["rfis"] })} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-primary)", cursor: "pointer" }}>
            ?
          </button>
          <button
            type="button"
            onClick={() => repairNumbersMut.mutate()}
            disabled={repairNumbersMut.isPending || numberingIssues === 0}
            style={{
              background: numberingIssues > 0 ? "var(--warning-muted)" : "var(--bg-surface-low)",
              color: numberingIssues > 0 ? "var(--status-warning)" : "var(--text-muted)",
              border: `1px solid ${numberingIssues > 0 ? "var(--warning-border)" : "var(--border-default)"}`,
              borderRadius: "var(--radius-btn)",
              padding: "8px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: repairNumbersMut.isPending || numberingIssues === 0 ? "not-allowed" : "pointer",
              opacity: repairNumbersMut.isPending || numberingIssues === 0 ? 0.7 : 1,
            }}
          >
            {repairNumbersMut.isPending
              ? "Repairing..."
              : numberingIssues > 0
                ? `Repair Numbers (${numberingIssues})`
                : "Numbers Clean"}
          </button>
          <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
            {["LIST", "BOARD"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: "6px 12px",
                  background: view === v ? "var(--accent)" : "transparent",
                  color: view === v ? "var(--accent-text)" : "var(--text-secondary)",
                  border: "none",
                  ...mono,
                  fontSize: 9,
                  fontWeight: 700,
                  cursor: "pointer",
                  letterSpacing: "0.08em",
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowBulkImport(true)}
            style={{ background: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            ↑ Bulk Add
          </button>
          <button
            onClick={() => setShowLogImport(true)}
            title="Import an RFI log PDF — AI extracts every row and inserts into this project (dedupes by RFI number)"
            style={{
              background: "transparent",
              color: "var(--ai-accent, #22D3EE)",
              border: "1px solid var(--ai-accent, #22D3EE)",
              borderRadius: "var(--radius-btn)",
              padding: "8px 12px",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.08em", cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            ↗ Import Log (PDF)
          </button>
          <button
            onClick={() => {
              setEditingRFI(null);
              setShowForm(true);
            }}
            style={{
              background: "var(--accent)",
              color: "var(--accent-text)",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "10px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: "pointer",
            }}
          >
            + New RFI
          </button>
        </div>
      </div>
      <KpiStrip kpis={kpis} setFilterStatus={setFilterStatus} setFilterPriority={setFilterPriority} />
      <OverdueBar overdueList={overdueList} overdueCount={kpis.overdue} onSelect={setSelectedRFI} />

      <FilterBar
        search={search} setSearch={setSearch}
        filterStatus={filterStatus} setFilterStatus={setFilterStatus}
        filterPriority={filterPriority} setFilterPriority={setFilterPriority}
        filterBIC={filterBIC} setFilterBIC={setFilterBIC}
        sortField={sortField} setSortField={setSortField}
        sortDir={sortDir} setSortDir={setSortDir}
        overdueFirst={overdueFirst} setOverdueFirst={setOverdueFirst}
        showVoided={showVoided} setShowVoided={setShowVoided}
        onExport={() => exportRFIsToCSV(filtered)}
      />

      <BulkActionBar
        selectedCount={selectedRFIs.size}
        onSetStatus={(s) => bulkUpdateMut.mutate({
          ids: [...selectedRFIs],
          data: { status: s, ...((s === "Answered" || s === "Closed") ? { date_answered: new Date().toISOString().split("T")[0] } : {}) },
        })}
        onSetPriority={(p) => bulkUpdateMut.mutate({ ids: [...selectedRFIs], data: { priority: p } })}
        onExportSelected={() => exportRFIsToCSV(filtered.filter((r) => selectedRFIs.has(r.id)))}
        onRequestDelete={() => setShowBulkDelete(true)}
        onClear={() => setSelectedRFIs(new Set())}
      />

      <BulkImportModal
        open={showBulkImport}
        text={bulkImportText}
        setText={setBulkImportText}
        onClose={() => setShowBulkImport(false)}
        onImport={() => bulkImportMut.mutate(parseBulkImport())}
        isImporting={bulkImportMut.isPending}
        projectId={projectId}
      />

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {view === "LIST" && (
          <LeftSidebar
            bicCounts={bicCounts}
            agingBuckets={agingBuckets}
            agingFilter={agingFilter}
            setAgingFilter={setAgingFilter}
            setFilterBIC={setFilterBIC}
            setSelectedRFI={setSelectedRFI}
            filtered={filtered}
            kpis={kpis}
          />
        )}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {view === "BOARD" ? (
            <BoardView filtered={filtered} onSelect={setSelectedRFI} />
          ) : (
            <ListView
              filtered={filtered}
              groupedByProject={groupedByProject}
              projectId={projectId}
              selectedRFI={selectedRFI}
              selectedRFIs={selectedRFIs}
              onSelect={setSelectedRFI}
              onToggleSelect={toggleSelectRFI}
              onToggleAll={toggleSelectAll}
              onToggleStatus={toggleStatus}
              onEdit={(r) => { setEditingRFI(r); setShowForm(true); }}
              onDelete={setDeleteTarget}
              onCreateMitigation={(r) => {
                localStorage.setItem("sbp-new-mitigation", JSON.stringify({
                  issue_source: "RFI",
                  source_entity_ref: r.rfi_number,
                  source_entity_id: r.id,
                  title: "RFI Overdue: " + r.title,
                  identified_date: new Date().toISOString().split("T")[0],
                  status: "Open",
                }));
                navigate("/Mitigations");
              }}
            />
          )}

          <DetailPanel
            rfi={selectedRFI}
            projectName={selectedRFI ? projectMap[selectedRFI.project_id] : ""}
            onClose={() => setSelectedRFI(null)}
            onUpdate={(data) => updateMut.mutate({ id: selectedRFI.id, data })}
            onEdit={() => { setEditingRFI(selectedRFI); setShowForm(true); }}
            onDelete={() => setDeleteTarget(selectedRFI)}
          />
        </div>
      </div>

      <RfiLogImportModal
        open={showLogImport}
        projectId={projectId}
        projectName={resolveProjectName(projectId)}
        projects={projects}
        onClose={() => setShowLogImport(false)}
      />

      {showForm && (
        <RFIFormModal
          open={showForm}
          onClose={() => {
            setShowForm(false);
            setEditingRFI(null);
          }}
          onSave={async (data) => {
            if (editingRFI) {
              updateMut.mutate({
                id: editingRFI.id,
                data: {
                  ...data,
                  project_name: resolveProjectName(data.project_id || projectId) || data.project_name || editingRFI.project_name || "",
                },
              });
            } else {
              const num =
                data.rfi_number ||
                (await getNextFormattedNumber({
                  projectId: data.project_id || projectId,
                  recordType: "RFI",
                  entityName: "RFI",
                  fieldName: "rfi_number",
                  prefix: "RFI #",
                }));
              createMut.mutate({
                ...data,
                rfi_number: num,
                project_name: resolveProjectName(data.project_id || projectId) || data.project_name || "",
              });
            }
            setShowForm(false);
            setEditingRFI(null);
          }}
          saving={createMut.isPending || updateMut.isPending}
          rfi={editingRFI}
          projectId={projectId}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete RFI"
        description={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
      />
      <DeleteDialog
        open={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={() => bulkDeleteMut.mutate([...selectedRFIs])}
        title={`Delete ${selectedRFIs.size} RFIs`}
        description={`Permanently delete ${selectedRFIs.size} selected RFI${selectedRFIs.size === 1 ? "" : "s"}? This cannot be undone.`}
      />
    </div>
  );
}

