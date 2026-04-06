
import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import DeleteDialog from "@/components/shared/DeleteDialog";
import RFIFormModal from "@/components/rfis/RFIFormModal";
import { getNextFormattedNumber } from "@/components/shared/numberSequencing";
import { parseUTCDate } from "@/components/shared/formatters";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  invalidateCrudQueries,
  toastCrudError,
} from "@/components/shared/crudFeedback";

const mono = { fontFamily: "var(--font-mono)" };
const BIC_COLORS = {
  Contractor: { bg: "rgba(0,229,255,0.15)", text: "var(--accent)" },
  GC: { bg: "rgba(68,226,205,0.18)", text: "var(--secondary)" },
  Engineer: { bg: "rgba(255,185,95,0.15)", text: "var(--status-warning)" },
  Architect: { bg: "rgba(168,240,203,0.18)", text: "var(--status-success)" },
  Owner: { bg: "rgba(255,180,171,0.18)", text: "var(--status-error)" },
};
const PRIORITY_CFG = {
  Critical: { color: "var(--status-error)", bg: "var(--danger-muted)" },
  High: { color: "var(--status-warning)", bg: "var(--warning-muted)" },
  Medium: { color: "var(--accent)", bg: "var(--accent-muted)" },
  Low: { color: "var(--text-muted)", bg: "var(--hover-bg)" },
};
const STATUS_CFG = {
  Open: { color: "var(--status-warning)", bg: "var(--warning-muted)" },
  "Under Review": { color: "var(--status-info)", bg: "var(--info-muted)" },
  Answered: { color: "var(--status-success)", bg: "var(--success-muted)" },
  Closed: { color: "var(--text-muted)", bg: "var(--hover-bg)" },
};
const statusColumns = ["Open", "Under Review", "Answered", "Closed"];
const RFI_NUMBER_PATTERN = /^RFI #(\d+)$/i;

const extractRfiSequence = (value) => {
  if (!value) return null;
  const match = String(value).trim().match(RFI_NUMBER_PATTERN);
  return match ? Number(match[1]) : null;
};

const sortRfisForRepair = (a, b) => {
  const numericDiff = (extractRfiSequence(a.rfi_number) ?? Number.MAX_SAFE_INTEGER) - (extractRfiSequence(b.rfi_number) ?? Number.MAX_SAFE_INTEGER);
  if (numericDiff !== 0) return numericDiff;

  const dateA = new Date(a.submitted_date || a.created_date || 0).getTime();
  const dateB = new Date(b.submitted_date || b.created_date || 0).getTime();
  if (dateA !== dateB) return dateA - dateB;

  return String(a.id).localeCompare(String(b.id));
};

const buildRfiNumberRepairs = (records) => {
  const groups = records.reduce((acc, record) => {
    const key = record.project_id || "__missing_project__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(record);
    return acc;
  }, {});

  const repairs = [];
  let skippedWithoutProject = 0;

  Object.entries(groups).forEach(([projectKey, group]) => {
    if (projectKey === "__missing_project__") {
      skippedWithoutProject += group.length;
      return;
    }

    const sorted = [...group].sort(sortRfisForRepair);
    const reserved = new Set();
    let nextNumber = 0;
    const candidates = [];

    sorted.forEach((record) => {
      const numeric = extractRfiSequence(record.rfi_number);
      if (numeric && !reserved.has(numeric)) {
        reserved.add(numeric);
        nextNumber = Math.max(nextNumber, numeric);
        return;
      }

      candidates.push(record);
    });

    candidates.forEach((record) => {
      nextNumber += 1;
      repairs.push({
        id: record.id,
        project_id: record.project_id,
        project_name: record.project_name || "",
        previous_number: record.rfi_number || "",
        next_number: `RFI #${String(nextNumber).padStart(3, "0")}`,
      });
    });
  });

  return { repairs, skippedWithoutProject };
};

const daysOpen = (r) => {
  if (!r.submitted_date) return 0;
  const start = new Date(r.submitted_date);
  const end = r.date_answered && ["Answered", "Closed"].includes(r.status) ? new Date(r.date_answered) : new Date();
  return Math.max(0, Math.floor((end - start) / 86400000));
};
const isClosed = (r) => ["Answered", "Closed"].includes(r.status);
const isOverdue = (r) => !isClosed(r) && r.date_required && parseUTCDate(r.date_required) < new Date();

const Pill = ({ label, color, bg }) => (
  <span
    style={{
      ...mono,
      fontSize: 8,
      fontWeight: 700,
      padding: "2px 8px",
      borderRadius: 2,
      background: bg,
      color,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      display: "inline-block",
    }}
  >
    {label}
  </span>
);

export default function RFIs() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project") || null;
  const qc = useQueryClient();

  const [view, setView] = useState("LIST");
  const [showForm, setShowForm] = useState(false);
  const [editingRFI, setEditingRFI] = useState(null);
  const [selectedRFI, setSelectedRFI] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterBIC, setFilterBIC] = useState("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("date_required");
  const [sortDir, setSortDir] = useState("asc");
  const [overdueFirst, setOverdueFirst] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () => base44.entities.RFI.filter({ project_id: projectId }, "-submitted_date"),
    enabled: !!projectId,
    initialData: [],
  });
  const rfiQueryKeys = [["rfis", projectId], ["rfis"]];

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

  const toggleStatus = (r) => {
    const order = statusColumns;
    const idx = order.indexOf(r.status || "Open");
    const next = order[Math.min(idx + 1, order.length - 1)];
    const extra = ["Answered", "Closed"].includes(next) ? { date_answered: new Date().toISOString().split("T")[0] } : {};
    updateMut.mutate({ id: r.id, data: { status: next, ...extra } });
  };
  const filtered = useMemo(() => {
    return rfis
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
        if (sortField === "priority")
          return (
            (["Critical", "High", "Medium", "Low"].indexOf(a.priority) - ["Critical", "High", "Medium", "Low"].indexOf(b.priority)) *
            dir
          );
        if (sortField === "days") return (daysOpen(a) - daysOpen(b)) * dir;
        if (sortField === "date_required") {
          const da = a.date_required ? new Date(a.date_required) : new Date("2100-01-01");
          const db = b.date_required ? new Date(b.date_required) : new Date("2100-01-01");
          return (da - db) * dir;
        }
        return 0;
      });
  }, [rfis, filterStatus, filterPriority, filterBIC, search, sortField, sortDir, overdueFirst]);

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
        const a = new Date(r.submitted_date);
        const b = new Date(r.date_answered);
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

  useEffect(() => {
    if (!rfis.length) return;
    const createRFIAlerts = async () => {
      try {
        const existing = await base44.entities.Alert.filter({ alert_type: "RFI_Overdue" });
        const existingIds = new Set(existing.map((a) => a.related_record_id));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const in3 = new Date(today.getTime() + 3 * 86400000);
        for (const r of rfis) {
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
            title: isOD ? `${r.rfi_number} OVERDUE — ${daysLate}d` : `${r.rfi_number} due in =3 days`,
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
  }, [rfis.length]);

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

  const KPI_ACCENT_MAP = {
    "var(--status-success)": "rgba(34,197,94,0.10)",
    "var(--status-warning)": "rgba(245,158,11,0.10)",
    "var(--status-error)":   "rgba(239,68,68,0.10)",
    "var(--status-info)":    "rgba(96,165,250,0.10)",
    "var(--accent)":         "rgba(232,101,10,0.08)",
  };
  const renderKPI = (label, value, color, onClick, extraStyle = {}) => {
    const accent = KPI_ACCENT_MAP[color];
    return (
      <div
        onClick={onClick}
        style={{
          padding: "12px 20px",
          borderTop: accent ? `3px solid ${color}` : "3px solid transparent",
          borderRight: "1px solid var(--divider)",
          borderLeft: "none",
          borderBottom: "none",
          cursor: onClick ? "pointer" : "default",
          background: accent || "var(--bg-surface)",
          transition: "filter 0.1s",
          ...extraStyle,
        }}
        onMouseEnter={(e) => { if (onClick) e.currentTarget.style.filter = "brightness(1.12)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
      >
        <div style={{ ...mono, fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
        <div style={{ ...mono, fontSize: 20, fontWeight: 800, color }}>{value}</div>
      </div>
    );
  };
  const exportRFIsToCSV = (rows, filename = "rfi-log.csv") => {
    const headers = [
      "RFI #",
      "Project",
      "Title",
      "Priority",
      "Status",
      "Ball in Court",
      "Submitted By",
      "Submitted Date",
      "Date Required",
      "Date Answered",
      "Answered By",
      "Drawing Ref",
      "Spec Section",
      "Assigned To",
      "Days Open",
      "Cost Impact",
      "Cost Amount",
      "Schedule Impact",
      "Schedule Days",
      "Question",
      "Answer",
    ];
    const data = rows.map((r) => {
      const days = r.submitted_date ? Math.floor((new Date() - new Date(r.submitted_date)) / 86400000) : "";
      return [
        r.rfi_number || "",
        r.project_name || "",
        r.title || "",
        r.priority || "",
        r.status || "",
        r.ball_in_court || "",
        r.submitted_by || "",
        r.submitted_date || "",
        r.date_required || "",
        r.date_answered || "",
        r.answered_by || "",
        r.drawing_reference || "",
        r.spec_section || "",
        r.assigned_to || "",
        days,
        r.cost_impact ? "Yes" : "No",
        r.cost_impact_amount || "",
        r.schedule_impact ? "Yes" : "No",
        r.schedule_impact_days || "",
        (r.question || "").replace(/,/g, ";"),
        (r.answer || "").replace(/,/g, ";"),
      ];
    });
    const csv = [headers, ...data]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

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
      {/* KPI strip */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--divider)", flexShrink: 0 }}>
        {renderKPI("Open", kpis.open, "var(--status-warning)", () => setFilterStatus("Open"))}
        {renderKPI("Under Review", kpis.underReview, "var(--status-info)", () => setFilterStatus("Under Review"))}
        {renderKPI("Answered", kpis.answered, "var(--status-success)")}
        {renderKPI("Closed", kpis.closed, "var(--text-muted)")}
        {renderKPI("Critical", kpis.critical, "var(--status-error)", () => setFilterPriority("Critical"))}
        {renderKPI("Overdue", kpis.overdue, kpis.overdue > 0 ? "var(--status-error)" : "var(--text-secondary)", () => setFilterStatus("Open"), kpis.overdue > 0 ? { borderTop: "2px solid var(--status-error)" } : {})}
        {renderKPI("Due This Week", kpis.dueThisWeek, kpis.dueThisWeek > 0 ? "var(--status-warning)" : "var(--text-secondary)")}
        {renderKPI(
          "Avg Response",
          kpis.avgResponse != null ? `${kpis.avgResponse}d` : "—",
          kpis.avgResponse == null ? "var(--text-muted)" : kpis.avgResponse > 14 ? "var(--status-error)" : kpis.avgResponse > 7 ? "var(--status-warning)" : "var(--status-success)"
        )}
        {renderKPI("Cost Exposure", kpis.costExposure ? `$${kpis.costExposure.toLocaleString()}` : "$0", kpis.costExposure > 0 ? "var(--status-warning)" : "var(--text-muted)")}
        {renderKPI("Sched Exposure", kpis.scheduleDays ? `${kpis.scheduleDays}d` : "0d", kpis.scheduleDays > 0 ? "var(--status-error)" : "var(--text-muted)")}
      </div>

      {overdueList.length > 0 && (
        <div style={{ background: "var(--danger-muted)", borderBottom: "1px solid var(--danger-border)", padding: "8px 16px", display: "flex", gap: 8, overflowX: "auto" }}>
          {overdueList.map((r) => (
            <div
              key={r.id}
              onClick={() => setSelectedRFI(r)}
              style={{
                background: "rgba(255,61,61,0.12)",
                border: "1px solid rgba(255,61,61,0.25)",
                borderRadius: 3,
                padding: "4px 8px",
                ...mono,
                fontSize: 9,
                color: "var(--status-error)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {r.rfi_number} · {r.title}
            </div>
          ))}
        </div>
      )}
      {/* Filters */}
      <div style={{ height: 40, flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface)", overflowX: "auto" }}>
        <input
          placeholder="Search RFIs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, maxWidth: 280, background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 6, padding: "7px 10px", color: "var(--text-primary)" }}
        />
        {["all", "Open", "Under Review", "Answered", "Closed"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            style={{
              background: filterStatus === s ? "var(--accent)" : "var(--bg-surface-low)",
              color: filterStatus === s ? "var(--accent-text)" : "var(--text-secondary)",
              border: "none",
              borderRadius: 6,
              padding: "6px 10px",
              ...mono,
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: "pointer",
            }}
          >
            {s === "all" ? "All" : s}
          </button>
        ))}
        {["all", "Critical", "High", "Medium", "Low"].map((p) => (
          <button
            key={p}
            onClick={() => setFilterPriority(p)}
            style={{
              background: filterPriority === p ? "var(--accent)" : "var(--bg-surface-low)",
              color: filterPriority === p ? "var(--accent-text)" : "var(--text-secondary)",
              border: "none",
              borderRadius: 6,
              padding: "6px 10px",
              ...mono,
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: "pointer",
            }}
          >
            {p === "all" ? "All Priority" : p}
          </button>
        ))}
        <select
          value={filterBIC}
          onChange={(e) => setFilterBIC(e.target.value)}
          style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 6, padding: "6px 8px", color: "var(--text-primary)", ...mono, fontSize: 9 }}
        >
          <option value="all">All BIC</option>
          {["Contractor", "GC", "Engineer", "Architect", "Owner"].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={sortField}
          onChange={(e) => setSortField(e.target.value)}
          style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 6, padding: "6px 8px", color: "var(--text-primary)", ...mono, fontSize: 9 }}
        >
          <option value="date_required">Due Date</option>
          <option value="rfi_number">RFI #</option>
          <option value="project_name">Project</option>
          <option value="priority">Priority</option>
          <option value="days">Days Open</option>
        </select>
        <button
          onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
          style={{ background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: 6, padding: "6px 8px", ...mono, fontSize: 9, color: "var(--text-primary)", cursor: "pointer" }}
        >
          {sortDir === "asc" ? "?" : "?"}
        </button>
        <button
          onClick={() => setOverdueFirst((v) => !v)}
          style={{
            background: overdueFirst ? "var(--accent)" : "var(--bg-surface-low)",
            color: overdueFirst ? "var(--accent-text)" : "var(--text-secondary)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            padding: "6px 10px",
            ...mono,
            fontSize: 8,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Overdue First
        </button>
        <button
          onClick={() => exportRFIsToCSV(filtered)}
          style={{ background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: 6, padding: "6px 10px", ...mono, fontSize: 9, color: "var(--text-primary)", cursor: "pointer" }}
        >
          Export
        </button>
      </div>
      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {view === "LIST" && (
          <div style={{ width: 270, flexShrink: 0, borderRight: "1px solid var(--divider)", background: "var(--bg-sidebar)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--divider)", ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em" }}>RFI Tracker</div>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--divider)" }}>
              <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Ball in Court</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {bicCounts.map(({ party, count }) => {
                  const cfg = BIC_COLORS[party] || BIC_COLORS.Contractor;
                  return (
                    <div key={party} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={() => setFilterBIC(party)}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{party}</div>
                        <div style={{ width: "100%", height: 6, background: "var(--bg-surface-low)", borderRadius: 999, overflow: "hidden" }}>
                          <div style={{ width: `${count === 0 ? 0 : Math.min(100, (count / Math.max(1, kpis.open)) * 100)}%`, height: "100%", background: cfg.text }} />
                        </div>
                      </div>
                      <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: cfg.text }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--divider)" }}>
              <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Aging Analysis</div>
              {[
                { label: "< 7 days", key: "fresh", color: "var(--status-success)" },
                { label: "7–14 days", key: "aging", color: "var(--status-warning)" },
                { label: "15–30 days", key: "stale", color: "var(--status-error)" },
                { label: "> 30 days", key: "critical", color: "var(--status-error)" },
              ].map((b) => (
                <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)", minWidth: 80 }}>{b.label}</div>
                  <div style={{ flex: 1, height: 6, background: "var(--bg-surface-low)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, (agingBuckets[b.key] / Math.max(1, kpis.open)) * 100)}%`, height: "100%", background: b.color }} />
                  </div>
                  <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: b.color }}>{agingBuckets[b.key]}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--divider)", flex: 1, overflowY: "auto" }}>
              <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
                Due within 7 days ({kpis.dueThisWeek})
              </div>
              {filtered
                .filter((r) => !isClosed(r) && r.date_required)
                .filter((r) => {
                  const d = parseUTCDate(r.date_required);
                  const today = new Date();
                  const in7 = new Date();
                  in7.setDate(today.getDate() + 7);
                  return d >= today && d <= in7;
                })
                .sort((a, b) => new Date(a.date_required) - new Date(b.date_required))
                .map((r) => {
                  const cfg = BIC_COLORS[r.ball_in_court || "Contractor"] || BIC_COLORS.Contractor;
                  const due = parseUTCDate(r.date_required);
                  const diff = Math.ceil((due - new Date()) / 86400000);
                  const badgeColor = diff <= 3 ? "var(--status-error)" : "var(--status-warning)";
                  return (
                    <div key={r.id} onClick={() => setSelectedRFI(r)} style={{ border: "1px solid var(--border-default)", borderRadius: 6, padding: "8px 10px", marginBottom: 6, cursor: "pointer", background: "var(--bg-surface)" }}>
                      <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>{r.rfi_number}</div>
                      <div style={{ fontSize: 10, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                        <span style={{ ...mono, fontSize: 8, background: cfg.bg, color: cfg.text, padding: "2px 6px", borderRadius: 4 }}>{r.ball_in_court || "Contractor"}</span>
                        <span style={{ ...mono, fontSize: 8, color: badgeColor, fontWeight: 700 }}>{diff <= 0 ? "TODAY" : `${diff}d`}</span>
                      </div>
                    </div>
                  );
                })}
              {kpis.dueThisWeek === 0 && <div style={{ ...mono, fontSize: 9, color: "var(--status-success)" }}>? No RFIs due this week</div>}
            </div>
            <div style={{ padding: "10px 14px" }}>
              <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Open Impact</div>
              {kpis.costExposure > 0 && (
                <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: "var(--status-warning)", marginBottom: 4 }}>?? COST · ${kpis.costExposure.toLocaleString()}</div>
              )}
              {kpis.scheduleDays > 0 && (
                <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: "var(--status-error)" }}>?? SCHEDULE · {kpis.scheduleDays}d exposure</div>
              )}
              {kpis.costExposure === 0 && kpis.scheduleDays === 0 && <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>No impact flagged</div>}
            </div>
          </div>
        )}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {view === "BOARD" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, padding: 12, width: "100%", overflow: "auto" }}>
              {statusColumns.map((st) => {
                const col = filtered.filter((r) => r.status === st);
                return (
                  <div key={st} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 4, display: "flex", flexDirection: "column", maxHeight: "100%", overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--divider)", ...mono, fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
                      {st} · {col.length}
                    </div>
                    <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
                      {col.map((r) => {
                        const pr = PRIORITY_CFG[r.priority] || PRIORITY_CFG.Medium;
                        const bic = BIC_COLORS[r.ball_in_court || "Contractor"] || BIC_COLORS.Contractor;
                        const overdue = isOverdue(r);
                        return (
                          <div
                            key={r.id}
                            onClick={() => setSelectedRFI(r)}
                            style={{
                              background: "var(--bg-surface)",
                              border: "1px solid var(--border-default)",
                              borderLeft: overdue ? "3px solid var(--status-error)" : r.priority === "Critical" ? "3px solid var(--status-warning)" : "3px solid transparent",
                              borderRadius: 4,
                              padding: "10px 12px",
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                              <div style={{ ...mono, fontSize: 10, fontWeight: 800, color: "var(--accent)" }}>{r.rfi_number}</div>
                              <Pill label={r.priority} color={pr.color} bg={pr.bg} />
                            </div>
                            <div style={{ fontFamily: "var(--font-body)", fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.3, marginBottom: 4, maxHeight: 38, overflow: "hidden" }}>
                              {r.title}
                            </div>
                            {r.drawing_reference && <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)" }}>{r.drawing_reference}</div>}
                            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
                              <Pill label={r.ball_in_court || "Contractor"} color={bic.text} bg={bic.bg} />
                              <span style={{ ...mono, fontSize: 8, color: overdue ? "var(--status-error)" : "var(--text-muted)", fontWeight: overdue ? 700 : 500 }}>
                                {r.date_required ? new Date(r.date_required).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                              </span>
                              <span style={{ ...mono, fontSize: 8, color: "var(--text-secondary)" }}>{daysOpen(r)}d</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
              <div style={{ position: "sticky", top: 0, zIndex: 5, display: "grid", gridTemplateColumns: "28px 80px 2fr 90px 100px 110px 72px 52px 90px", background: "var(--bg-sidebar)", borderBottom: "1px solid var(--divider)", padding: "10px 12px", ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
                <div>?</div>
                <div>RFI #</div>
                <div>Subject</div>
                <div>Priority</div>
                <div>Status</div>
                <div>Ball in Court</div>
                <div>Due</div>
                <div>Days</div>
                <div>Actions</div>
              </div>
              {Object.entries(groupedByProject).map(([proj, rows]) => (
                <div key={proj} style={{ borderBottom: "1px solid var(--divider)" }}>
                  {!projectId && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--bg-surface)", borderBottom: "1px solid var(--divider)" }}>
                      <div style={{ width: 4, height: 20, background: "var(--accent)" }} />
                      <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-primary)" }}>{proj}</div>
                      <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)" }}>{rows.length} RFIs</div>
                      <div style={{ ...mono, fontSize: 8, color: "var(--status-error)", marginLeft: 6 }}>{rows.filter((r) => isOverdue(r)).length} overdue</div>
                    </div>
                  )}
                  {rows.map((r) => {
                    const overdue = isOverdue(r);
                    const pr = PRIORITY_CFG[r.priority] || PRIORITY_CFG.Medium;
                    const st = STATUS_CFG[r.status] || STATUS_CFG.Open;
                    const bic = BIC_COLORS[r.ball_in_court || "Contractor"] || BIC_COLORS.Contractor;
                    const due = r.date_required ? new Date(r.date_required) : null;
                    const diff = due ? Math.ceil((due - new Date()) / 86400000) : null;
                    const rowBg = overdue ? "rgba(255,61,61,0.12)" : "transparent";
                    const leftBorder = overdue && r.priority === "Critical" ? "3px solid var(--status-error)" : overdue ? "3px solid rgba(255,61,61,0.7)" : r.priority === "Critical" ? "3px solid var(--status-warning)" : "3px solid transparent";
                    return (
                      <div
                        key={r.id}
                        onClick={() => setSelectedRFI(r)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "28px 80px 2fr 90px 100px 110px 72px 52px 90px",
                          padding: "10px 12px",
                          alignItems: "center",
                          borderBottom: "1px solid var(--divider)",
                          cursor: "pointer",
                          background: selectedRFI?.id === r.id ? "var(--accent-muted)" : rowBg,
                          borderLeft: leftBorder,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = selectedRFI?.id === r.id ? "var(--accent-muted)" : "var(--hover-bg)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = selectedRFI?.id === r.id ? "var(--accent-muted)" : rowBg)}
                      >
                        <div>
                          <input type="checkbox" />
                        </div>
                        <div style={{ ...mono, fontSize: 11, fontWeight: 800, color: "var(--accent)" }}>
                          {r.priority === "Critical" && <span style={{ color: "var(--status-error)", marginRight: 4 }}>?</span>}
                          {r.rfi_number}
                        </div>
                        <div>
                          <div style={{ fontFamily: "var(--font-body)", fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", textDecoration: r.status === "Closed" ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.drawing_reference || "—"}
                            {r.spec_section ? ` · ${r.spec_section}` : ""}
                          </div>
                        </div>
                        <div>
                          <Pill label={r.priority} color={pr.color} bg={pr.bg} />
                        </div>
                        <div>
                          <Pill label={r.status} color={st.color} bg={st.bg} />
                          <div style={{ ...mono, fontSize: 8, color: "var(--status-error)" }}>{r.cost_impact ? "??" : ""}</div>
                          <div style={{ ...mono, fontSize: 8, color: "var(--status-warning)" }}>{r.schedule_impact ? "??" : ""}</div>
                        </div>
                        <div>
                          <Pill label={r.ball_in_court || "Contractor"} color={bic.text} bg={bic.bg} />
                        </div>
                        <div style={{ ...mono, fontSize: 9, color: overdue ? "var(--status-error)" : diff != null && diff <= 3 ? "var(--status-warning)" : "var(--text-secondary)", fontWeight: overdue || (diff != null && diff <= 3) ? 700 : 500 }}>
                          {due ? due.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                          {overdue && <div style={{ fontSize: 8, color: "var(--status-error)" }}>{Math.abs(diff)}d LATE</div>}
                        </div>
                        <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: daysOpen(r) > 30 ? "var(--status-error)" : daysOpen(r) > 14 ? "var(--status-warning)" : "var(--status-success)" }}>{daysOpen(r)}d</div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStatus(r);
                            }}
                            style={{
                              border: "1px solid var(--border-default)",
                              background: "var(--bg-surface)",
                              borderRadius: 4,
                              padding: "4px 6px",
                              ...mono,
                              fontSize: 8,
                              cursor: "pointer",
                            }}
                          >
                            {r.status === "Open" ? "? Review" : r.status === "Under Review" ? "? Answer" : "?"}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingRFI(r);
                              setShowForm(true);
                            }}
                            style={{
                              border: "1px solid var(--border-default)",
                              background: "var(--bg-surface)",
                              borderRadius: 4,
                              padding: "4px 6px",
                              ...mono,
                              fontSize: 8,
                              cursor: "pointer",
                            }}
                          >
                            ?
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(r);
                            }}
                            style={{
                              border: "1px solid rgba(255,61,61,0.25)",
                              background: "rgba(255,61,61,0.08)",
                              borderRadius: 4,
                              padding: "4px 6px",
                              ...mono,
                              fontSize: 8,
                              color: "var(--status-error)",
                              cursor: "pointer",
                            }}
                          >
                            ??
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <div style={{ width: 460, flexShrink: 0, borderLeft: "1px solid var(--divider)", display: "flex", flexDirection: "column", background: "var(--bg-surface)" }}>
            {!selectedRFI ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: "var(--text-muted)" }}>
                <div style={{ fontSize: 32 }}>?</div>
                <div style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>Select an RFI</div>
                <div style={{ fontSize: 9 }}>Click any row to view details</div>
              </div>
            ) : (
              <>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--divider)", background: "var(--bg-sidebar)", flexShrink: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...mono, fontSize: 12, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.08em" }}>{selectedRFI.rfi_number}</div>
                      <div style={{ fontFamily: "Space Grotesk, var(--font-display)", fontSize: 16, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.3, letterSpacing: "-0.01em" }}>{selectedRFI.title}</div>
                      <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>{selectedRFI.project_name || "—"}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        <Pill label={selectedRFI.status} color={(STATUS_CFG[selectedRFI.status] || STATUS_CFG.Open).color} bg={(STATUS_CFG[selectedRFI.status] || STATUS_CFG.Open).bg} />
                        <Pill label={selectedRFI.priority} color={(PRIORITY_CFG[selectedRFI.priority] || PRIORITY_CFG.Medium).color} bg={(PRIORITY_CFG[selectedRFI.priority] || PRIORITY_CFG.Medium).bg} />
                        {isOverdue(selectedRFI) && (
                          <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--status-error)" }}>
                            ? {Math.abs(Math.ceil((parseUTCDate(selectedRFI.date_required) - new Date()) / 86400000))}d overdue
                          </span>
                        )}
                        <Pill label={selectedRFI.ball_in_court || "Contractor"} color={(BIC_COLORS[selectedRFI.ball_in_court || "Contractor"] || BIC_COLORS.Contractor).text} bg={(BIC_COLORS[selectedRFI.ball_in_court || "Contractor"] || BIC_COLORS.Contractor).bg} />
                      </div>
                    </div>
                    <button onClick={() => setSelectedRFI(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, marginLeft: 10 }}>
                      ×
                    </button>
                  </div>
                  {(selectedRFI.cost_impact || selectedRFI.schedule_impact) && (
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      {selectedRFI.cost_impact && (
                        <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--status-warning)", background: "var(--warning-muted)", border: "1px solid var(--warning-border)", padding: "4px 8px", borderRadius: 4 }}>
                          ?? COST IMPACT: ${selectedRFI.cost_impact_amount || "—"}
                        </div>
                      )}
                      {selectedRFI.schedule_impact && (
                        <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--status-error)", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", padding: "4px 8px", borderRadius: 4 }}>
                          ?? SCHEDULE: {selectedRFI.schedule_impact_days || 0}d
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface)" }}>
                  <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Workflow</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
                    {statusColumns.map((s) => {
                      const active = selectedRFI.status === s;
                      const past = statusColumns.indexOf(selectedRFI.status) > statusColumns.indexOf(s);
                      const bg = active ? "var(--accent)" : past ? "var(--success-muted)" : "var(--bg-surface-low)";
                      const color = active ? "var(--accent-text)" : past ? "var(--status-success)" : "var(--text-secondary)";
                      return (
                        <button
                          key={s}
                          onClick={() =>
                            updateMut.mutate({
                              id: selectedRFI.id,
                              data: { status: s, ...(s === "Answered" || s === "Closed" ? { date_answered: new Date().toISOString().split("T")[0] } : {}) },
                            })
                          }
                          style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid var(--border-default)", background: bg, color, ...mono, fontSize: 9, fontWeight: 700, cursor: "pointer" }}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                  <Section title="Meta">
                    <Meta label="Submitted By" value={selectedRFI.submitted_by} />
                    <Meta label="Submitted Date" value={selectedRFI.submitted_date} />
                    <Meta label="Date Required" value={selectedRFI.date_required} highlight={isOverdue(selectedRFI)} />
                    <Meta label="Date Answered" value={selectedRFI.date_answered} />
                    <Meta label="Drawing Ref" value={selectedRFI.drawing_reference} />
                    <Meta label="Spec Section" value={selectedRFI.spec_section} />
                    <Meta label="Assigned To" value={selectedRFI.assigned_to} />
                    <Meta label="Answered By" value={selectedRFI.answered_by} />
                    <Meta label="Distribution" value={selectedRFI.distribution_list} span2 />
                  </Section>

                  <Section title="Question / Issue">
                    <ContentBox accent>{selectedRFI.question || <i style={{ color: "var(--text-muted)" }}>No question text recorded.</i>}</ContentBox>
                  </Section>

                  <Section title="Response">
                    {selectedRFI.answer ? (
                      <>
                        <ContentBox success>{selectedRFI.answer}</ContentBox>
                        <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
                          Answered by {selectedRFI.answered_by || "—"} on {selectedRFI.date_answered || "—"}
                        </div>
                      </>
                    ) : (
                      <div style={{ background: "var(--warning-muted)", border: "1px solid var(--warning-border)", padding: "10px 12px", borderRadius: 4, ...mono, fontSize: 9, color: "var(--status-warning)" }}>
                        ? Awaiting response
                      </div>
                    )}
                  </Section>

                  <Section title="Ball in Court">
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {["Contractor", "GC", "Engineer", "Architect", "Owner"].map((p) => {
                        const cfg = BIC_COLORS[p] || BIC_COLORS.Contractor;
                        const active = selectedRFI.ball_in_court === p;
                        return (
                          <button
                            key={p}
                            onClick={() => updateMut.mutate({ id: selectedRFI.id, data: { ball_in_court: p } })}
                            style={{
                              ...mono,
                              fontSize: 8,
                              fontWeight: 700,
                              padding: "6px 10px",
                              borderRadius: 4,
                              border: active ? `1px solid ${cfg.text}` : "1px solid var(--border-default)",
                              background: active ? cfg.bg : "var(--bg-surface)",
                              color: active ? cfg.text : "var(--text-secondary)",
                              cursor: "pointer",
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                            }}
                          >
                            {p}
                          </button>
                        );
                      })}
                    </div>
                  </Section>

                  {selectedRFI.description && (
                    <Section title="Description">
                      <ContentBox>{selectedRFI.description}</ContentBox>
                    </Section>
                  )}

                  {(selectedRFI.cost_impact || selectedRFI.schedule_impact) && (
                    <Section title="Impact Flags">
                      {selectedRFI.cost_impact && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ ...mono, fontSize: 8, background: "var(--warning-muted)", border: "1px solid var(--warning-border)", padding: "4px 8px", borderRadius: 4, color: "var(--status-warning)", fontWeight: 700 }}>?? Cost Impact</span>
                          <span style={{ ...mono, fontSize: 10, color: "var(--text-primary)" }}>${selectedRFI.cost_impact_amount || "—"}</span>
                        </div>
                      )}
                      {selectedRFI.schedule_impact && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ ...mono, fontSize: 8, background: "var(--danger-muted)", border: "1px solid var(--danger-border)", padding: "4px 8px", borderRadius: 4, color: "var(--status-error)", fontWeight: 700 }}>?? Schedule</span>
                          <span style={{ ...mono, fontSize: 10, color: "var(--text-primary)" }}>{selectedRFI.schedule_impact_days || 0} days</span>
                        </div>
                      )}
                    </Section>
                  )}
                </div>

                <div style={{ padding: "12px 20px", borderTop: "1px solid var(--divider)", background: "var(--bg-sidebar)", display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      setEditingRFI(selectedRFI);
                      setShowForm(true);
                    }}
                    style={{
                      flex: 1,
                      background: "var(--accent)",
                      color: "var(--accent-text)",
                      border: "none",
                      borderRadius: 4,
                      padding: "10px 12px",
                      ...mono,
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Edit Full RFI
                  </button>
                  <button
                    onClick={() => setDeleteTarget(selectedRFI)}
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid rgba(255,61,61,0.25)",
                      color: "var(--status-error)",
                      borderRadius: 4,
                      padding: "10px 12px",
                      ...mono,
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

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
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 8, ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{children}</div>
    </div>
  );
}

function Meta({ label, value, highlight, span2 }) {
  return (
    <div style={{ gridColumn: span2 ? "span 2" : "span 1" }}>
      <div style={{ ...mono, fontSize: 7, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500, color: highlight ? "var(--status-error)" : "var(--text-primary)" }}>{value || "—"}</div>
    </div>
  );
}

function ContentBox({ children, accent, success }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 4,
        border: "1px solid " + (accent ? "rgba(0,229,255,0.25)" : success ? "var(--success-border)" : "var(--border-default)"),
        background: accent ? "rgba(0,229,255,0.08)" : success ? "var(--success-muted)" : "var(--bg-surface-low)",
        borderLeft: "3px solid " + (accent ? "var(--accent)" : success ? "var(--status-success)" : "var(--accent)"),
        fontFamily: "var(--font-body)",
        fontSize: 13,
        color: "var(--text-primary)",
        lineHeight: 1.7,
      }}
    >
      {children}
    </div>
  );
}
