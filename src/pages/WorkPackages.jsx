import { useProjectContext } from "@/components/shared/useProjectContext";
import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import WorkPackageList from "@/components/workpackages/WorkPackageList";
import WorkPackageDetailModal from "@/components/workpackages/WorkPackageDetailModal";
import WPFormModal from "@/components/workpackages/WPFormModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import ChevronPipeline from "@/components/shared/ChevronPipeline";
import { getNextNumber } from "@/components/shared/numberSequencing";
import { batchProcess } from "@/utils/batchProcess";

const LIFECYCLE_STAGES = [
  { key: "Detailing", label: "DETAIL", color: "var(--phase-detailing)" },
  { key: "Fabrication", label: "FAB", color: "var(--phase-fab)" },
  { key: "Delivery", label: "SHIP", color: "var(--phase-delivery)" },
  { key: "Erection", label: "ERECT", color: "var(--phase-erection)" },
];

const PHASE_COLORS = {
  Detailing: "var(--phase-detailing)",
  Fabrication: "var(--phase-fab)",
  Delivery: "var(--phase-delivery)",
  Erection: "var(--phase-erection)",
};

/* Raw hex values for rgba manipulation */
const PHASE_HEX = {
  Detailing: "#C89B20",
  Fabrication: "#3B82F6",
  Delivery: "#8B5CF6",
  Erection: "#22C55E",
};

const STATUS_COLORS = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--status-warning)",
  Complete: "var(--status-success)",
  "On Hold": "var(--status-error)",
};

const PHASE_COLORS_BAR = { ...PHASE_COLORS };

/* Inline SVG phase icons */
const PhaseIcon = ({ phase, size = 14 }) => {
  const color = PHASE_COLORS[phase] || "var(--text-muted)";
  const icons = {
    Detailing: (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 14L2 2L10 2L14 6L14 14L2 14Z" stroke={color} strokeWidth="1.2" fill="none" />
        <path d="M10 2L10 6L14 6" stroke={color} strokeWidth="1.2" fill="none" />
        <line x1="5" y1="9" x2="11" y2="9" stroke={color} strokeWidth="1" />
        <line x1="5" y1="11" x2="9" y2="11" stroke={color} strokeWidth="1" />
      </svg>
    ),
    Fabrication: (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="6" width="14" height="9" rx="1" stroke={color} strokeWidth="1.2" fill="none" />
        <path d="M4 6V4C4 2.9 4.9 2 6 2H10C11.1 2 12 2.9 12 4V6" stroke={color} strokeWidth="1.2" fill="none" />
        <circle cx="8" cy="10.5" r="1.5" stroke={color} strokeWidth="1" fill="none" />
      </svg>
    ),
    Delivery: (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="4" width="9" height="8" rx="1" stroke={color} strokeWidth="1.2" fill="none" />
        <path d="M10 7H13L15 10V12H10V7Z" stroke={color} strokeWidth="1.2" fill="none" />
        <circle cx="4" cy="13" r="1.5" stroke={color} strokeWidth="1" fill={color} />
        <circle cx="12.5" cy="13" r="1.5" stroke={color} strokeWidth="1" fill={color} />
      </svg>
    ),
    Erection: (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1L8 11" stroke={color} strokeWidth="1.2" />
        <path d="M3 5L8 1L13 5" stroke={color} strokeWidth="1.2" fill="none" />
        <path d="M5 11L3 15" stroke={color} strokeWidth="1.2" />
        <path d="M11 11L13 15" stroke={color} strokeWidth="1.2" />
        <line x1="2" y1="15" x2="14" y2="15" stroke={color} strokeWidth="1.2" />
      </svg>
    ),
  };
  return icons[phase] || null;
};

const DRAWING_STAGES = [
  { id: "Not Started", label: "NOT STARTED", color: "var(--text-muted)" },
  { id: "OFA", label: "OFA", color: "var(--status-info)" },
  { id: "BFA", label: "BFA", color: "var(--status-warning)" },
  { id: "OFS", label: "OFS", color: "var(--secondary)" },
  { id: "BFS", label: "BFS", color: "var(--secondary)" },
  { id: "FFF", label: "FFF", color: "var(--tertiary)" },
  { id: "Released", label: "RELEASED", color: "var(--status-success)" },
];

const STAGE_STYLES = {
  "Not Started": { bg: "rgba(144,144,149,0.12)", color: "var(--text-muted)" },
  OFA: { bg: "rgba(0,229,255,0.12)", color: "var(--status-info)" },
  BFA: { bg: "rgba(255,185,95,0.12)", color: "var(--status-warning)" },
  OFS: { bg: "rgba(68,226,205,0.12)", color: "var(--secondary)" },
  BFS: { bg: "rgba(68,226,205,0.12)", color: "var(--secondary)" },
  FFF: { bg: "rgba(255,185,95,0.15)", color: "var(--tertiary)" },
  Released: { bg: "rgba(168,240,203,0.12)", color: "var(--status-success)" },
};

const STATUS_COLUMNS = ["Not Started", "In Progress", "Complete", "On Hold"];

const VIEW_OPTIONS = [
  { id: "list", label: "List" },
  { id: "board", label: "Board" },
  { id: "drawings", label: "Drawings" },
];

const formatDate = (d) =>
  d
    ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "\u2014";

export default function WorkPackages() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const qc = useQueryClient();

  const [view, setView] = useState("list");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPhase, setFilterPhase] = useState("all");
  const [search, setSearch] = useState("");
  const [editingWP, setEditingWP] = useState(null);
  const [wpModalOpen, setWPModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [expandedWP, setExpandedWP] = useState(null);
  const [drawingStageFilter, setDrawingStageFilter] = useState("all");
  const [selectedBoardWP, setSelectedBoardWP] = useState(null);
  const [compact, setCompact] = useState(false);
  const [selectedWPs, setSelectedWPs] = useState(new Set());

  const { data: workPackages = [], isLoading: wpLoading } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: async () => {
      if (projectId) {
        return base44.entities.WorkPackage.filter({ project_id: projectId });
      }
      const all = await base44.entities.WorkPackage.list();
      return all.sort((a, b) => (a.project_name || "").localeCompare(b.project_name || ""));
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => (projectId ? base44.entities.Drawing.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
  });

  const updateWPMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WorkPackage.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      setWPModalOpen(false);
      setEditingWP(null);
      toast.success("Work package updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const createWPMut = useMutation({
    mutationFn: (data) => base44.entities.WorkPackage.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      setWPModalOpen(false);
      setEditingWP(null);
      toast.success("Work package created");
    },
    onError: (err) => toast.error(err.message),
  });

  const quickCompleteMut = useMutation({
    mutationFn: (id) =>
      base44.entities.WorkPackage.update(id, {
        status: "Complete",
        percent_complete: 100,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      toast.success("Work package marked complete");
    },
    onError: () => toast.error("Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.WorkPackage.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      setDeleteTarget(null);
      toast.success("Work package deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const bulkStatusMut = useMutation({
    mutationFn: async ({ ids, status }) => {
      const results = await batchProcess(ids, (id) => base44.entities.WorkPackage.update(id, { status }));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return results;
    },
    onSuccess: (results) => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      setSelectedWPs(new Set());
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} updated, ${results.failed.length} failed`);
      } else {
        toast.success("Status updated");
      }
    },
    onError: () => toast.error("Bulk update failed"),
  });

  const exportCSV = () => {
    const toExport = selectedWPs.size > 0 ? filtered.filter((w) => selectedWPs.has(w.id)) : filtered;
    const headers = ["WP #", "Name", "Phase", "Status", "Tonnage", "% Complete", "Crew", "Shop Hrs Budget", "Shop Hrs Actual", "Notes"];
    const rows = toExport.map((w) =>
      [w.wp_number, w.name, w.phase, w.status, (Number(w.tonnage) || 0).toFixed(1),
       `${Number(w.percent_complete) || 0}%`, w.crew || "",
       w.shop_hours_budget || 0, w.shop_hours_actual || 0, w.notes || ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `work-packages-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelectWP = (id) =>
    setSelectedWPs((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleSelectAll = () =>
    setSelectedWPs(selectedWPs.size === filtered.length ? new Set() : new Set(filtered.map((w) => w.id)));

  const filtered = useMemo(() => {
    return workPackages.filter((wp) => {
      const statusMatch = filterStatus === "all" || wp.status === filterStatus;
      const phaseMatch = filterPhase === "all" || wp.phase === filterPhase;
      const q = search.toLowerCase();
      const searchMatch =
        !q ||
        (wp.name || "").toLowerCase().includes(q) ||
        (wp.wp_number || "").toLowerCase().includes(q) ||
        (wp.crew || "").toLowerCase().includes(q) ||
        (wp.area || "").toLowerCase().includes(q) ||
        (wp.sequence || "").toLowerCase().includes(q) ||
        (wp.linked_drawing_ids || "").toLowerCase().includes(q);
      return statusMatch && phaseMatch && searchMatch;
    });
  }, [workPackages, filterStatus, filterPhase, search]);

  const stats = useMemo(() => {
    const totalTons = workPackages.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
    return {
      total: workPackages.length,
      notStarted: workPackages.filter((w) => w.status === "Not Started").length,
      inProgress: workPackages.filter((w) => w.status === "In Progress").length,
      complete: workPackages.filter((w) => w.status === "Complete").length,
      onHold: workPackages.filter((w) => w.status === "On Hold").length,
      totalTons,
      fabTons: workPackages
        .filter((w) => w.phase === "Fabrication")
        .reduce((s, w) => s + (Number(w.tonnage) || 0), 0),
      erectedTons: workPackages
        .filter((w) => w.phase === "Erection" && w.status === "Complete")
        .reduce((s, w) => s + (Number(w.tonnage) || 0), 0),
      avgProgress:
        workPackages.length > 0
          ? Math.round(
              workPackages.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / workPackages.length
            )
          : 0,
    };
  }, [workPackages]);

  const phaseTons = useMemo(() => {
    return ["Detailing", "Fabrication", "Delivery", "Erection"].map((phase) => ({
      phase,
      tons: workPackages.filter((w) => w.phase === phase).reduce((s, w) => s + (Number(w.tonnage) || 0), 0),
      completeTons: workPackages.filter((w) => w.phase === phase && w.status === "Complete").reduce((s, w) => s + (Number(w.tonnage) || 0), 0),
      color: PHASE_COLORS_BAR[phase],
      hex: PHASE_HEX[phase],
    }));
  }, [workPackages]);

  const drawingsByStage = useMemo(() => {
    const m = {};
    DRAWING_STAGES.forEach((s) => (m[s.id] = 0));
    drawings.forEach((d) => {
      if (m.hasOwnProperty(d.stage)) m[d.stage] += 1;
    });
    return m;
  }, [drawings]);

  const drawingTotal = drawings.length;
  const hasDrawings = drawings.length > 0;
  const overdueDrawings = drawings.filter(
    (d) => d.due_date && new Date(`${d.due_date}T00:00:00Z`) < new Date() && d.stage !== "Released"
  );

  const handleWPEdit = (wp) => {
    if (wp?._quickComplete) {
      quickCompleteMut.mutate(wp.id);
      return;
    }
    setEditingWP(wp);
    setWPModalOpen(true);
  };

  const handleWPCreate = async () => {
    let wpNumber = "";
    try {
      if (projectId) {
        const nextNum = await getNextNumber(projectId, "wp_number");
        wpNumber = `WP-${String(nextNum).padStart(3, "0")}`;
      }
    } catch (err) {
      console.warn("[WorkPackages] Failed to allocate WP number:", err?.message);
      // Fallback: compute from existing work packages
      const maxNum = workPackages
        .map(wp => parseInt((wp.wp_number || "").replace(/\D/g, ""), 10))
        .filter(n => !isNaN(n))
        .reduce((max, n) => Math.max(max, n), 0);
      wpNumber = `WP-${String(maxNum + 1).padStart(3, "0")}`;
    }
    setEditingWP({ wp_number: wpNumber, project_id: projectId });
    setWPModalOpen(true);
  };

  /* KPI tile — clickable for status filters */
  const renderKPI = (label, value, color, statusKey) => {
    const isClickable = !!statusKey;
    const isActive = statusKey && filterStatus === statusKey;
    return (
      <div
        onClick={isClickable ? () => setFilterStatus(filterStatus === statusKey ? "all" : statusKey) : undefined}
        style={{
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-card)",
          borderTop: `2px solid ${color}`,
          padding: "14px 12px 12px",
          cursor: isClickable ? "pointer" : "default",
          border: isActive
            ? `1px solid ${color}`
            : "1px solid var(--border-default)",
          borderTopWidth: 2,
          borderTopColor: color,
          boxShadow: isActive
            ? `0 0 16px ${color}33, 0 0 32px ${color}11`
            : "var(--shadow-card)",
          transition: "border-color 0.2s, box-shadow 0.2s",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Phase icon for tonnage/progress tiles */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 22,
                fontWeight: 600,
                color,
                marginBottom: 4,
                lineHeight: 1,
              }}
            >
              {value}
            </div>
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 10,
                fontWeight: 700,
                color: isActive ? color : "var(--text-muted)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {label}
            </div>
          </div>
          {isActive && (
            <div style={{
              width: 6, height: 6, borderRadius: 3,
              background: color,
              boxShadow: `0 0 6px ${color}`,
              marginTop: 2,
              flexShrink: 0,
            }} />
          )}
        </div>
      </div>
    );
  };

  const renderTonnageBar = () => {
    const total = Math.max(phaseTons.reduce((s, p) => s + p.tons, 0), 1);
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.12em",
              fontWeight: 700,
            }}
          >
            TONNAGE PIPELINE
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, color: "var(--accent)" }}>
            {total.toFixed(1)}T
          </div>
        </div>
        {/* Segmented bar with phase-specific colors and glow */}
        <div style={{ display: "flex", height: 28, overflow: "hidden", borderRadius: "var(--radius-badge)", marginBottom: 12, background: "var(--hover-bg)" }}>
          {phaseTons.map((p) => {
            const pct = (p.tons / total) * 100;
            const width = Math.max(pct > 0 ? 8 : 0, pct);
            return (
              <div
                key={p.phase}
                style={{
                  width: `${width}%`,
                  background: p.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "width 0.6s ease",
                  overflow: "hidden",
                  boxShadow: p.tons > 0 ? `inset 0 0 12px ${p.hex}44, 0 0 8px ${p.hex}22` : "none",
                }}
                title={`${p.phase}: ${(Number(p.tons) || 0).toFixed(1)}T (${Math.round(pct)}%)`}
              >
                {pct > 12 && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                    {(Number(p.tons) || 0).toFixed(1)}T
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {/* Phase KPI breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {phaseTons.map((p) => {
            const pct = p.tons > 0 ? Math.round((p.completeTons / p.tons) * 100) : 0;
            return (
              <div
                key={p.phase}
                style={{
                  background: "var(--bg-surface-low)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-badge)",
                  padding: "8px 10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <PhaseIcon phase={p.phase} size={13} />
                  <span style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 10,
                    fontWeight: 700,
                    color: p.color,
                  }}>
                    {p.phase}
                  </span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                  {p.completeTons.toFixed(1)}T / {p.tons.toFixed(1)}T
                  <span style={{ fontSize: 9, fontWeight: 600, color: p.color, marginLeft: 4 }}>({pct}%)</span>
                </div>
                {/* Mini progress bar */}
                <div style={{ height: 3, background: "var(--bg-surface-high)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: p.color,
                    borderRadius: 2,
                    transition: "width 0.5s ease",
                    boxShadow: pct > 0 ? `0 0 6px ${p.hex}44` : "none",
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderBoard = () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "start" }}>
      {STATUS_COLUMNS.map((col) => {
        const items = filtered.filter((w) => w.status === col);
        const color = STATUS_COLORS[col];
        return (
          <div
            key={col}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-card)",
              padding: 10,
              borderTop: `3px solid ${color}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color,
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              <span>{col.toUpperCase()}</span>
              <span
                style={{
                  background: "var(--bg-surface-low)",
                  border: "1px solid var(--divider)",
                  borderRadius: "var(--radius-badge)",
                  padding: "2px 8px",
                  fontSize: 9,
                }}
              >
                {items.length}
              </span>
            </div>

            {items.map((wp) => {
              const phaseColor = PHASE_COLORS[wp.phase] || "var(--text-muted)";
              /* Health indicators: blocked by RFI or awaiting material */
              const hasRFIBlock = (wp.notes || "").toLowerCase().includes("rfi") || wp.rfi_blocked;
              const hasMaterialPending = (wp.notes || "").toLowerCase().includes("material") || wp.material_pending;
              return (
                <div
                  key={wp.id}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-card)",
                    padding: 12,
                    marginBottom: 8,
                    borderLeft: `3px solid ${phaseColor}`,
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onClick={() => setSelectedBoardWP(wp)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-mid)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-surface)")}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>
                        {wp.wp_number}
                      </span>
                      {/* Health indicator dots */}
                      {hasRFIBlock && (
                        <span title="Blocked by RFI" style={{
                          width: 7, height: 7, borderRadius: "50%",
                          background: "var(--status-error)",
                          boxShadow: "0 0 6px rgba(239,68,68,0.5)",
                          display: "inline-block", flexShrink: 0,
                        }} />
                      )}
                      {hasMaterialPending && (
                        <span title="Material pending" style={{
                          width: 7, height: 7, borderRadius: "50%",
                          background: "var(--status-warning)",
                          boxShadow: "0 0 6px rgba(245,158,11,0.5)",
                          display: "inline-block", flexShrink: 0,
                        }} />
                      )}
                    </div>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: "var(--radius-badge)",
                        background: `${phaseColor}22`,
                        color: phaseColor,
                        letterSpacing: "0.08em",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <PhaseIcon phase={wp.phase} size={9} />
                      {wp.phase}
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                    {wp.name}
                  </div>
                  {/* Lifecycle chevron */}
                  <div style={{ marginBottom: 6 }}>
                    <ChevronPipeline
                      stages={LIFECYCLE_STAGES}
                      currentStage={wp.phase}
                      completedStages={LIFECYCLE_STAGES.slice(0, LIFECYCLE_STAGES.findIndex(s => s.key === wp.phase)).map(s => s.key)}
                      height={22}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <div style={{ flex: 1, height: 4, background: "var(--bg-surface-high)", borderRadius: 2 }}>
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, Number(wp.percent_complete) || 0))}%`,
                          height: "100%",
                          background: phaseColor,
                          borderRadius: 2,
                          transition: "width 0.5s ease",
                        }}
                      />
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: phaseColor }}>
                      {Math.min(100, Math.max(0, Number(wp.percent_complete) || 0))}%
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                      {(Number(wp.tonnage) || 0).toFixed(1)}T
                    </span>
                  </div>
                  {/* Health badges row */}
                  {(hasRFIBlock || hasMaterialPending) && (
                    <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
                      {hasRFIBlock && (
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                          padding: "2px 7px", borderRadius: "var(--radius-badge)",
                          background: "rgba(239,68,68,0.12)", color: "var(--status-error)",
                          border: "1px solid rgba(239,68,68,0.25)",
                          letterSpacing: "0.06em", textTransform: "uppercase",
                        }}>
                          RFI BLOCKED
                        </span>
                      )}
                      {hasMaterialPending && (
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                          padding: "2px 7px", borderRadius: "var(--radius-badge)",
                          background: "rgba(245,158,11,0.12)", color: "var(--status-warning)",
                          border: "1px solid rgba(245,158,11,0.25)",
                          letterSpacing: "0.06em", textTransform: "uppercase",
                        }}>
                          MTL PENDING
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)" }}>
                      Crew: {wp.crew || "\u2014"}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleWPEdit(wp);
                        }}
                        style={{
                          padding: "3px 8px",
                          borderRadius: "var(--radius-btn)",
                          border: "1px solid var(--border-default)",
                          background: "var(--bg-surface-high)",
                          color: "var(--text-secondary)",
                          fontFamily: "var(--font-mono)",
                          fontSize: 8,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        EDIT
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(wp);
                        }}
                        style={{
                          padding: "3px 8px",
                          borderRadius: "var(--radius-btn)",
                          border: "1px solid var(--danger-border)",
                          background: "rgba(255,61,61,0.08)",
                          color: "var(--status-error)",
                          fontFamily: "var(--font-mono)",
                          fontSize: 8,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        \u2715
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {items.length === 0 && (
              <div
                style={{
                  padding: 16,
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                  textAlign: "center",
                }}
              >
                No packages
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderDrawingTracker = () => {
    if (!projectId) {
      return (
        <div style={{ padding: 32, textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          Select a project to view drawing tracker
        </div>
      );
    }

    const filteredDrawings =
      drawingStageFilter === "all" ? drawings : drawings.filter((d) => d.stage === drawingStageFilter);

    const sortedDrawings = [...filteredDrawings].sort((a, b) => {
      if (a.stage === "Released" && b.stage !== "Released") return 1;
      if (b.stage === "Released" && a.stage !== "Released") return -1;
      const da = a.due_date ? new Date(`${a.due_date}T00:00:00Z`) : new Date("2100-01-01");
      const db = b.due_date ? new Date(`${b.due_date}T00:00:00Z`) : new Date("2100-01-01");
      return da - db;
    });

    const stageBar = DRAWING_STAGES.map((s) => ({
      ...s,
      count: drawingsByStage[s.id] || 0,
    }));

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, marginTop: 12 }}>
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-card)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid var(--divider)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-secondary)",
              letterSpacing: "0.08em",
            }}
          >
            DRAWING PIPELINE
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>STAGE</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>COUNT</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>COVERAGE</span>
            </div>
            {DRAWING_STAGES.map((stage) => {
              const count = drawingsByStage[stage.id] || 0;
              const pct = hasDrawings ? ((count / drawingTotal) * 100).toFixed(1) : "0.0";
              return (
                <div
                  key={stage.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "110px 40px 1fr",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 0",
                    cursor: "pointer",
                  }}
                  onClick={() => setDrawingStageFilter(drawingStageFilter === stage.id ? "all" : stage.id)}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: stage.color,
                      letterSpacing: "0.08em",
                    }}
                  >
                    {stage.label}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)" }}>{count}</span>
                  <div style={{ height: 6, background: "var(--bg-surface-high)", borderRadius: 2 }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: stage.color,
                        borderRadius: 2,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>
              {hasDrawings
                ? <>Total: {drawings.length} {"\u00B7"} Released: {drawingsByStage["Released"] || 0} ({(((drawingsByStage["Released"] || 0) / drawingTotal) * 100).toFixed(1)}%)</>
                : "No drawings linked"}
            </div>
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-card)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid var(--divider)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", letterSpacing: "0.08em" }}>
              DRAWING LOG
            </div>
            {drawingStageFilter !== "all" && (
              <div
                style={{
                  padding: "2px 8px",
                  borderRadius: "var(--radius-badge)",
                  border: "1px solid var(--border-default)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-secondary)",
                }}
              >
                Filter: {drawingStageFilter}
              </div>
            )}
          </div>

          <div style={{ padding: 12 }}>
            <div style={{ display: "flex", height: 8, overflow: "hidden", borderRadius: 4, marginBottom: 10 }}>
              {stageBar.map((s) => {
                const width = drawingTotal ? (s.count / drawingTotal) * 100 : 0;
                return <div key={s.id} style={{ width: `${width}%`, background: s.color }} />;
              })}
            </div>

            {overdueDrawings.length > 0 && (
              <div
                style={{
                  background: "var(--danger-muted)",
                  border: "1px solid var(--danger-border)",
                  borderLeft: "4px solid var(--status-error)",
                  borderRadius: "var(--radius-card)",
                  padding: "8px 10px",
                  marginBottom: 10,
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--status-error)",
                  letterSpacing: "0.08em",
                }}
              >
                {overdueDrawings.length} DRAWINGS OVERDUE \u2014 SUBMITTAL DEADLINE PASSED
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 80px 70px 90px 80px 80px",
                gap: 8,
                padding: "6px 0",
                borderBottom: "1px solid var(--divider)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--text-muted)",
                letterSpacing: "0.08em",
              }}
            >
              <span>SHEET</span>
              <span>TITLE</span>
              <span>DISC</span>
              <span>REV</span>
              <span>STAGE</span>
              <span>DUE</span>
              <span>WP</span>
            </div>

            {sortedDrawings.map((d) => {
              const style = STAGE_STYLES[d.stage] || STAGE_STYLES["Not Started"];
              const overdue = d.due_date && new Date(`${d.due_date}T00:00:00Z`) < new Date() && d.stage !== "Released";
              const linkedWP = workPackages.find((wp) =>
                (wp.linked_drawing_ids || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .includes(String(d.id))
              );

              return (
                <div
                  key={d.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "80px 1fr 80px 70px 90px 80px 80px",
                    gap: 8,
                    padding: "10px 0",
                    borderBottom: "1px solid var(--divider)",
                    alignItems: "center",
                    fontSize: 11,
                  }}
                >
                  <div style={{ fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 700, fontSize: 10 }}>
                    {d.sheet_number || "\u2014"}
                  </div>
                  <div style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {d.title || "\u2014"}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                    {(d.discipline || "\u2014").toUpperCase().slice(0, 6)}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
                    {d.revision_number || "0"}
                  </div>
                  <div
                    style={{
                      background: style.bg,
                      color: style.color,
                      padding: "2px 7px",
                      borderRadius: "var(--radius-badge)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    {d.stage || "Not Started"}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: overdue ? "var(--status-error)" : "var(--text-muted)",
                      fontWeight: overdue ? 700 : 500,
                    }}
                  >
                    {d.due_date ? formatDate(d.due_date).replace(", 2026", "") : "\u2014"}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", fontWeight: 700 }}>
                    {linkedWP ? linkedWP.wp_number : "\u2014"}
                  </div>
                </div>
              );
            })}

            {sortedDrawings.length === 0 && (
              <div style={{ padding: 16, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                No drawings match this filter.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* Active filter count for badge display */
  const activeFilterCount = (filterStatus !== "all" ? 1 : 0) + (filterPhase !== "all" ? 1 : 0);

  if (wpLoading) {
    return (
      <div style={{ padding: 24, height: "calc(100vh - 92px)" }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, height: "calc(100vh - 92px)", overflow: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--text-primary)",
            }}
          >
            WORK PACKAGES
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {projectId ? projects.find((p) => p.id === projectId)?.name || "Project" : "All Projects"} \u00B7 {workPackages.length} packages \u00B7{" "}
            {stats.totalTons.toFixed(1)}T
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {VIEW_OPTIONS.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                style={{
                  padding: "7px 12px",
                  borderRadius: "var(--radius-btn)",
                  border: "none",
                  background: view === v.id ? "var(--accent)" : "var(--bg-surface-low)",
                  color: view === v.id ? "var(--accent-text)" : "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                {v.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCompact((v) => !v)}
            title={compact ? "Normal view" : "Compact view \u2014 more rows visible"}
            style={{
              padding: "7px 12px", borderRadius: "var(--radius-btn)",
              border: "1px solid var(--border-default)",
              background: compact ? "var(--bg-surface-high)" : "var(--bg-surface-low)",
              color: compact ? "var(--accent)" : "var(--text-secondary)",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.08em", cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            COMPACT
          </button>

          <button
            onClick={exportCSV}
            title="Export filtered work packages as CSV"
            style={{
              padding: "7px 12px", borderRadius: "var(--radius-btn)",
              border: "1px solid var(--border-default)",
              background: "var(--bg-surface-low)", color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.08em", cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            CSV
          </button>

          <button
            onClick={handleWPCreate}
            style={{
              background: "var(--accent)",
              color: "var(--accent-text)",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "8px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              cursor: "pointer",
              letterSpacing: "0.06em",
            }}
          >
            + NEW WP
          </button>
        </div>
      </div>

      {/* KPI strip — click to filter by status */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {renderKPI("TOTAL WPS", stats.total, "var(--accent)", null)}
        {renderKPI("NOT STARTED", stats.notStarted, "var(--text-muted)", "Not Started")}
        {renderKPI("IN PROGRESS", stats.inProgress, "var(--status-warning)", "In Progress")}
        {renderKPI("COMPLETE", stats.complete, "var(--status-success)", "Complete")}
        {renderKPI("ON HOLD", stats.onHold, "var(--status-error)", "On Hold")}
        {renderKPI("TOTAL TONNAGE", `${stats.totalTons.toFixed(1)}T`, "var(--status-info)", null)}
        {renderKPI("AVG PROGRESS", `${stats.avgProgress}%`, "var(--accent)", null)}
      </div>

      {renderTonnageBar()}

      {/* Consolidated Filter Bar */}
      <div
        className="filter-bar-responsive"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          flexWrap: "wrap",
        }}
      >
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200, maxWidth: 360 }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
            <circle cx="7" cy="7" r="5.5" stroke="var(--text-muted)" strokeWidth="1.5" />
            <line x1="11" y1="11" x2="14.5" y2="14.5" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by drawing #, sequence, or area..."
            style={{
              width: "100%",
              padding: "7px 12px 7px 30px",
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-input)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              outline: "none",
            }}
          />
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: "var(--divider)", flexShrink: 0 }} />

        {/* Phase pills */}
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.1em", marginRight: 2 }}>PHASE</span>
          {[{ key: "all", label: "ALL" }, ...["Detailing", "Fabrication", "Delivery", "Erection"].map(p => ({ key: p, label: p.toUpperCase().slice(0, 5) }))].map(({ key, label }) => {
            const active = filterPhase === key;
            const phColor = key !== "all" ? PHASE_COLORS[key] : "var(--accent)";
            return (
              <button
                key={key}
                onClick={() => setFilterPhase(key)}
                style={{
                  padding: "4px 8px",
                  border: active ? `1px solid ${phColor}` : "1px solid transparent",
                  borderRadius: "var(--radius-btn)",
                  background: active ? `${PHASE_HEX[key] || "rgba(200,155,32,1)"}18` : "var(--bg-surface-low)",
                  color: active ? phColor : "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {key !== "all" && <PhaseIcon phase={key} size={9} />}
                {label}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: "var(--divider)", flexShrink: 0 }} />

        {/* Status pills */}
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.1em", marginRight: 2 }}>STATUS</span>
          {[{ key: "all", label: "ALL" }, ...STATUS_COLUMNS.map(s => ({ key: s, label: s.toUpperCase() }))].map(({ key, label }) => {
            const active = filterStatus === key;
            const stColor = key !== "all" ? STATUS_COLORS[key] : "var(--accent)";
            return (
              <button
                key={key}
                onClick={() => setFilterStatus(key)}
                style={{
                  padding: "4px 8px",
                  border: active ? `1px solid ${stColor}` : "1px solid transparent",
                  borderRadius: "var(--radius-btn)",
                  background: active ? `${stColor}18` : "var(--bg-surface-low)",
                  color: active ? stColor : "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Active filter count + clear */}
        {activeFilterCount > 0 && (
          <>
            <div style={{ width: 1, height: 24, background: "var(--divider)", flexShrink: 0 }} />
            <button
              onClick={() => { setFilterStatus("all"); setFilterPhase("all"); setSearch(""); }}
              style={{
                padding: "4px 10px",
                borderRadius: "var(--radius-btn)",
                border: "1px solid var(--accent-border)",
                background: "var(--accent-muted)",
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: "0.06em",
              }}
            >
              CLEAR ({activeFilterCount})
            </button>
          </>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedWPs.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
          background: "rgba(99,102,241,0.10)", border: "1px solid var(--accent)",
          borderRadius: "var(--radius-card)", flexWrap: "wrap",
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>
            {selectedWPs.size} selected
          </span>
          <span style={{ color: "var(--divider)" }}>|</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>SET STATUS</span>
          {STATUS_COLUMNS.map((s) => (
            <button key={s} disabled={bulkStatusMut.isPending}
              onClick={() => bulkStatusMut.mutate({ ids: [...selectedWPs], status: s })}
              style={{
                padding: "4px 10px", borderRadius: "var(--radius-btn)",
                border: `1px solid ${STATUS_COLORS[s]}`,
                background: `${STATUS_COLORS[s]}18`,
                color: STATUS_COLORS[s],
                fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                cursor: "pointer", textTransform: "uppercase",
              }}
            >
              {s}
            </button>
          ))}
          <button onClick={exportCSV}
            style={{ padding: "4px 10px", borderRadius: "var(--radius-btn)", border: "1px solid var(--border-default)", background: "var(--bg-surface-low)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, cursor: "pointer" }}>
            Export {selectedWPs.size}
          </button>
          <button onClick={() => setSelectedWPs(new Set())}
            style={{ padding: "4px 10px", borderRadius: "var(--radius-btn)", border: "1px solid var(--border-default)", background: "transparent", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, cursor: "pointer", marginLeft: "auto" }}>
            Clear
          </button>
        </div>
      )}

      {/* Views */}
      {view === "list" && (
        <WorkPackageList
          workPackages={filtered}
          drawings={drawings}
          expandedWP={expandedWP}
          onExpand={(wp) => setExpandedWP(expandedWP?.id === wp.id ? null : wp)}
          onEdit={handleWPEdit}
          onDelete={setDeleteTarget}
          showProject={!projectId}
          compact={compact}
          selected={selectedWPs}
          onToggleSelect={toggleSelectWP}
          onSelectAll={toggleSelectAll}
          onCreateWP={handleWPCreate}
        />
      )}

      {view === "board" && renderBoard()}

      {view === "drawings" && renderDrawingTracker()}

      {(wpModalOpen || editingWP) && (
        <WPFormModal
          open={wpModalOpen || !!editingWP}
          onClose={() => {
            setWPModalOpen(false);
            setEditingWP(null);
          }}
          onSave={(data) => {
            if (editingWP?.id) {
              updateWPMut.mutate({ id: editingWP.id, data });
            } else {
              createWPMut.mutate(data);
            }
          }}
          wp={editingWP}
          projects={projects}
          nextNumber={editingWP?.wp_number || ""}
          allDrawings={drawings}
        />
      )}

      {selectedBoardWP && (
        <WorkPackageDetailModal
          wp={selectedBoardWP}
          drawings={drawings}
          onClose={() => setSelectedBoardWP(null)}
          onEdit={(wp) => {
            setSelectedBoardWP(null);
            handleWPEdit(wp);
          }}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete Work Package"
        description={`Delete "${deleteTarget?.name}" (${deleteTarget?.wp_number})? This cannot be undone.`}
      />
    </div>
  );
}
