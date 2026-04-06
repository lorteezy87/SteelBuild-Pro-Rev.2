import { useProjectContext } from "@/components/shared/useProjectContext";
import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import WorkPackageList from "@/components/workpackages/WorkPackageList";
import WorkPackageDetailModal from "@/components/workpackages/WorkPackageDetailModal";
import WPFormModal from "@/components/workpackages/WPFormModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { getNextNumber } from "@/components/shared/numberSequencing";

const PHASE_COLORS = {
  Detailing: "var(--status-info)",
  Fabrication: "var(--status-warning)",
  Delivery: "var(--accent)",
  Erection: "var(--status-success)",
};

const STATUS_COLORS = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--status-warning)",
  Complete: "var(--status-success)",
  "On Hold": "var(--status-error)",
};

const PHASE_COLORS_BAR = { ...PHASE_COLORS };

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
  { id: "list", label: "≡ List" },
  { id: "board", label: "⊞ Board" },
  { id: "drawings", label: "⊟ Drawings" },
];

const formatDate = (d) =>
  d
    ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export default function WorkPackages() {
  const [searchParams] = useSearchParams();
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

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: async () => {
      if (projectId) {
        return base44.entities.WorkPackage.filter({ project_id: projectId });
      }
      const all = await base44.entities.WorkPackage.list();
      return all.sort((a, b) => (a.project_name || "").localeCompare(b.project_name || ""));
    },
    initialData: [],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => (projectId ? base44.entities.Drawing.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    initialData: [],
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

  const filtered = useMemo(() => {
    return workPackages.filter((wp) => {
      const statusMatch = filterStatus === "all" || wp.status === filterStatus;
      const phaseMatch = filterPhase === "all" || wp.phase === filterPhase;
      const q = search.toLowerCase();
      const searchMatch =
        !q ||
        (wp.name || "").toLowerCase().includes(q) ||
        (wp.wp_number || "").toLowerCase().includes(q) ||
        (wp.crew || "").toLowerCase().includes(q);
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
      color: PHASE_COLORS_BAR[phase],
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

  const drawingTotal = drawings.length || 1;
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

  const handleWPCreate = () => {
    const nextNum = getNextNumber(workPackages, "wp_number", "WP-");
    setEditingWP({ wp_number: nextNum, project_id: projectId });
    setWPModalOpen(true);
  };

  const pill = (active, label, onClick, color) => (
    <button
      onClick={onClick}
      style={{
        padding: "6px 10px",
        border: "none",
        borderRadius: "var(--radius-btn)",
        background: active ? color : "var(--bg-surface-low)",
        color: active ? "var(--accent-text)" : "var(--text-secondary)",
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.08em",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  const renderKPI = (label, value, color) => (
    <div
      style={{
        background: "var(--bg-surface)",
        borderRadius: "var(--radius-card)",
        borderTop: `2px solid ${color}`,
        padding: 12,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 22,
          fontWeight: 600,
          color,
          marginBottom: 4,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 8,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );

  const renderTonnageBar = () => {
    const total = Math.max(phaseTons.reduce((s, p) => s + p.tons, 0), 1);
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: 12,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.1em",
            marginBottom: 8,
          }}
        >
          TONNAGE PIPELINE
        </div>
        <div style={{ display: "flex", height: 10, overflow: "hidden", borderRadius: 4, marginBottom: 8 }}>
          {phaseTons.map((p) => {
            const width = Math.max(4, (p.tons / total) * 100);
            return <div key={p.phase} style={{ width: `${width}%`, background: p.color, transition: "width 0.2s" }} />;
          })}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {phaseTons.map((p) => (
            <div
              key={p.phase}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--text-secondary)",
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 6, background: p.color, display: "inline-block" }} />
              {p.phase}: {(Number(p.tons) || 0).toFixed(1)}T
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderBoard = () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, alignItems: "start" }}>
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
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>
                      {wp.wp_number}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 7,
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: "var(--radius-badge)",
                        background: `${phaseColor}22`,
                        color: phaseColor,
                        letterSpacing: "0.08em",
                      }}
                    >
                      {wp.phase}
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                    {wp.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <div style={{ flex: 1, height: 4, background: "var(--bg-surface-high)", borderRadius: 2 }}>
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, Number(wp.percent_complete) || 0))}%`,
                          height: "100%",
                          background: phaseColor,
                          borderRadius: 2,
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
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)" }}>
                      Crew: {wp.crew || "—"}
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
                        ✕
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
              const pct = ((count / drawingTotal) * 100).toFixed(1);
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
              Total: {drawings.length} · Released: {drawingsByStage["Released"] || 0} (
              {(((drawingsByStage["Released"] || 0) / drawingTotal) * 100).toFixed(1)}%)
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
                ⚠ {overdueDrawings.length} DRAWINGS OVERDUE — SUBMITTAL DEADLINE PASSED
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
                  .includes(d.id)
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
                    {d.sheet_number || "—"}
                  </div>
                  <div style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {d.title || "—"}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                    {(d.discipline || "—").toUpperCase().slice(0, 6)}
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
                    {d.due_date ? formatDate(d.due_date).replace(", 2026", "") : "—"}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", fontWeight: 700 }}>
                    {linkedWP ? linkedWP.wp_number : "—"}
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, height: "calc(100vh - 92px)", overflow: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              fontFamily: "var(--font-body)",
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
            {projectId ? projects.find((p) => p.id === projectId)?.name || "Project" : "All Projects"} · {workPackages.length} packages ·{" "}
            {stats.totalTons.toFixed(1)}T
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative", maxWidth: 260, width: "100%" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--text-muted)" }}>
              🔍
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search packages..."
              style={{
                width: "100%",
                padding: "8px 12px 8px 30px",
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

          <div style={{ display: "flex", gap: 6 }}>
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
                }}
              >
                {v.label}
              </button>
            ))}
          </div>

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
            }}
          >
            + NEW WP
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
        {renderKPI("TOTAL WPS", stats.total, "var(--accent)")}
        {renderKPI("NOT STARTED", stats.notStarted, "var(--text-muted)")}
        {renderKPI("IN PROGRESS", stats.inProgress, "var(--status-warning)")}
        {renderKPI("COMPLETE", stats.complete, "var(--status-success)")}
        {renderKPI("ON HOLD", stats.onHold, "var(--status-error)")}
        {renderKPI("TOTAL TONNAGE", `${stats.totalTons.toFixed(1)}T`, "var(--status-info)")}
        {renderKPI("AVG PROGRESS", `${stats.avgProgress}%`, "var(--accent)")}
      </div>

      {renderTonnageBar()}

      {/* Filters */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {pill(filterPhase === "all", "ALL PHASES", () => setFilterPhase("all"), "var(--accent)")}
          {["Detailing", "Fabrication", "Delivery", "Erection"].map((p) =>
            pill(filterPhase === p, p, () => setFilterPhase(p), "var(--accent)")
          )}
          <span style={{ width: 8 }} />
          {pill(filterStatus === "all", "ALL STATUS", () => setFilterStatus("all"), "var(--accent)")}
          {STATUS_COLUMNS.map((s) => pill(filterStatus === s, s.toUpperCase(), () => setFilterStatus(s), "var(--accent)"))}
        </div>
      </div>

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
          nextNumber={getNextNumber(workPackages, "wp_number", "WP-")}
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
