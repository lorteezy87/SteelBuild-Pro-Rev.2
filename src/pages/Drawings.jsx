import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useProjectContext } from "../components/shared/useProjectContext";
import BulkActionBar from "../components/drawings/BulkActionBar";
import DrawingFormModal from "../components/drawings/DrawingFormModal";
import DrawingSetUploadModal from "../components/drawings/DrawingSetUploadModal";
import RevisionHistoryPanel from "../components/drawings/RevisionHistoryPanel";
import RevisionUploadModal from "../components/drawings/RevisionUploadModal";
import SetApprovalModal from "../components/drawings/SetApprovalModal";
import { toast } from "sonner";

const BADGE_STYLES = {
  "Issued for Construction": {
    bg: "rgba(0,214,143,0.11)",
    color: "#00D68F",
    border: "rgba(0,214,143,0.22)",
    label: "IFC",
  },
  "In Progress": {
    bg: "rgba(255,180,0,0.11)",
    color: "#FFB400",
    border: "rgba(255,180,0,0.22)",
    label: "IN PROGRESS",
  },
  "Not Started": {
    bg: "rgba(255,255,255,0.04)",
    color: "rgba(160,175,210,0.40)",
    border: "rgba(255,255,255,0.08)",
    label: "NOT STARTED",
  },
  Superseded: {
    bg: "rgba(255,61,61,0.08)",
    color: "rgba(255,120,120,0.55)",
    border: "rgba(255,61,61,0.15)",
    label: "SUPERSEDED",
  },
  Released: {
    bg: "rgba(0,184,217,0.11)",
    color: "#00B8D9",
    border: "rgba(0,184,217,0.22)",
    label: "RELEASED",
  },
  Void: {
    bg: "rgba(255,255,255,0.03)",
    color: "rgba(160,175,210,0.25)",
    border: "rgba(255,255,255,0.05)",
    label: "VOID",
  },
};

const StatusBadge = ({ status }) => {
  const s = BADGE_STYLES[status] || BADGE_STYLES["Not Started"];
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        fontFamily: "var(--font-mono)",
        fontSize: 7,
        letterSpacing: "0.09em",
        padding: "2px 7px",
        borderRadius: 4,
        whiteSpace: "nowrap",
        display: "inline-block",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {s.label}
    </span>
  );
};

const IFCBadge = ({ status }) => {
  if (status === "IFC" || status === "Issued for Construction") {
    return (
      <span
        style={{
          background: "rgba(0,214,143,0.11)",
          color: "#00D68F",
          border: "1px solid rgba(0,214,143,0.22)",
          fontFamily: "var(--font-mono)",
          fontSize: 7,
          letterSpacing: "0.09em",
          padding: "2px 7px",
          borderRadius: 4,
          whiteSpace: "nowrap",
        }}
      >
        ✓ IFC
      </span>
    );
  }
  return <span style={{ color: "rgba(160,175,210,0.25)" }}>—</span>;
};

export default function Drawings() {
  const { activeProject } = useProjectContext();
  const qc = useQueryClient();

  const [view, setView] = useState("table");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [hideSuperseeded, setHideSuperseeded] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [collapsedSets, setCollapsedSets] = useState(new Set());

  const [formOpen, setFormOpen] = useState(false);
  const [uploadSetOpen, setUploadSetOpen] = useState(false);
  const [editingDrawing, setEditingDrawing] = useState(null);
  const [historyDrawing, setHistoryDrawing] = useState(null);
  const [revisionUploadOpen, setRevisionUploadOpen] = useState(false);
  const [revisionPreselectedSet, setRevisionPreselectedSet] = useState(null);
  const [approvalOpen, setApprovalOpen] = useState(null);

  // Fetch drawings
  const { data: drawings = [], isLoading } = useQuery({
    queryKey: ["drawings", activeProject?.id],
    queryFn: () =>
      activeProject?.id
        ? base44.entities.Drawing.filter({ project_id: activeProject.id })
        : [],
    enabled: !!activeProject?.id,
    initialData: [],
  });

  // Group by drawing set — resolved from drawing_set_name field only
  const groupedBySet = useMemo(() => {
    const groups = {};
    drawings.forEach((d) => {
      const setName = (d.drawing_set_name || "").trim() || "Ungrouped";
      if (!groups[setName]) groups[setName] = [];
      groups[setName].push(d);
    });

    // Apply filters
    Object.keys(groups).forEach((setName) => {
      groups[setName] = groups[setName].filter((d) => {
        const matchSearch =
          !search ||
          d.title?.toLowerCase().includes(search.toLowerCase()) ||
          d.sheet_number?.toLowerCase().includes(search.toLowerCase());
        const matchStage = stageFilter === "all" || d.stage === stageFilter;
        const matchDiscipline =
          disciplineFilter === "all" || d.discipline === disciplineFilter;
        const matchSuperseded = !hideSuperseeded || !d.is_superseded;
        return matchSearch && matchStage && matchDiscipline && matchSuperseded;
      });
    });

    // Remove empty groups
    Object.keys(groups).forEach(
      (k) => groups[k].length === 0 && delete groups[k]
    );

    return groups;
  }, [drawings, search, stageFilter, disciplineFilter, hideSuperseeded]);

  const sortedSetKeys = Object.keys(groupedBySet).sort();

  const drawingSets = useMemo(() => {
    return sortedSetKeys.map((setName) => {
      const sheets = groupedBySet[setName] || [];
      const lead = sheets[0] || {};
      return {
        id: null,
        set_name: setName,
        current_revision: lead.set_approval_revision || String(lead.revision_number || "0"),
        current_issue_date: lead.issue_date || null,
        current_issued_by: lead.issued_by || "",
        current_file_url: lead.file_url || null,
        sheet_count: sheets.filter((sheet) => !sheet.is_superseded).length,
        revision_history: lead.revision_history || "[]",
        discipline: lead.discipline || "Structural",
        notes: lead.notes || "",
      };
    });
  }, [groupedBySet, sortedSetKeys]);

  const stages = ["Not Started", "OFA", "BFA", "OFS", "BFS", "FFF", "Released"];
  const disciplines = ["Structural", "Arch", "MEP", "Civil", "Misc Metals"];

  const toggleCollapse = (setName) => {
    const newSet = new Set(collapsedSets);
    if (newSet.has(setName)) newSet.delete(setName);
    else newSet.add(setName);
    setCollapsedSets(newSet);
  };

  const toggleSelect = (drawingId) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(drawingId)) newSet.delete(drawingId);
    else newSet.add(drawingId);
    setSelectedIds(newSet);
  };

  const selectSetAll = (setName) => {
    const newSet = new Set(selectedIds);
    groupedBySet[setName].forEach((d) => newSet.add(d.id));
    setSelectedIds(newSet);
  };

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Drawing.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drawings"] });
      qc.invalidateQueries({ queryKey: ["drawingSets"] });
      setFormOpen(false);
      setEditingDrawing(null);
      toast.success("Drawing created");
    },
  });

  const [approvingSaving, setApprovingSaving] = useState(false);

  const handleApproveSet = async ({ status, revision, approvedBy, approvalDate, applyToSheets, notes }) => {
    if (!approvalOpen) return;
    setApprovingSaving(true);
    try {
      const sheets = groupedBySet[approvalOpen] || [];
      const updatePayload = {
        set_approval_status: status,
        set_approval_revision: revision,
        set_approved_date: approvalDate,
        set_approved_by: approvedBy,
      };
      if (applyToSheets) {
        await Promise.all(sheets.map((d) => base44.entities.Drawing.update(d.id, updatePayload)));
      }
      qc.invalidateQueries({ queryKey: ["drawings"] });
      toast.success(`Set "${approvalOpen}" ${status}`);
      setApprovalOpen(null);
    } catch (err) {
      toast.error("Failed to save approval");
    } finally {
      setApprovingSaving(false);
    }
  };

  const updateMut = useMutation({
    mutationFn: ({ id, data }) =>
      base44.entities.Drawing.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drawings"] });
      qc.invalidateQueries({ queryKey: ["drawingSets"] });
      setFormOpen(false);
      toast.success("Drawing updated");
    },
  });

  const handleSave = (formData) => {
    if (editingDrawing) {
      updateMut.mutate({ id: editingDrawing.id, data: formData });
    } else {
      createMut.mutate({
        project_id: activeProject.id,
        ...formData,
      });
    }
  };

  const overdueCount = useMemo(() => drawings.filter(d => d.due_date && d.stage !== "Released" && new Date(d.due_date) < new Date()).length, [drawings]);
  const dueThisWeek = useMemo(() => drawings.filter(d => { const days = d.due_date ? Math.ceil((new Date(d.due_date) - new Date()) / 86400000) : null; return days !== null && days >= 0 && days <= 7 && d.stage !== "Released"; }).length, [drawings]);

  const headerBtn = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 6,
    padding: "0 10px",
    height: 24,
    color: "rgba(160,175,210,0.55)",
    fontFamily: "var(--font-mono)",
    fontSize: 7,
    letterSpacing: "0.10em",
    cursor: "pointer",
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "var(--bg-page)",
      }}
    >
      {/* ===== PAGE HEADER ===== */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          height: 56,
          background: "var(--bg-sidebar)",
          borderBottom: "1px solid var(--divider)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 20,
              fontWeight: 800,
              color: "var(--text-primary)",
              letterSpacing: "0.06em",
            }}
          >
            DRAWINGS
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "rgba(160,175,210,0.35)",
              letterSpacing: "0.14em",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              padding: "2px 8px",
              borderRadius: 4,
            }}
          >
            {drawings.length} SHEETS
          </span>
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--text-muted)",
            }}
          >
            {activeProject?.name}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            onClick={() => {
              setEditingDrawing(null);
              setFormOpen(true);
            }}
            style={{
              background: "transparent",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              padding: "7px 14px",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.08em",
              whiteSpace: "nowrap",
            }}
          >
            + Single Drawing
          </button>

          <button
            onClick={() => setUploadSetOpen(true)}
            style={{
              background: "var(--accent)",
              border: "none",
              borderRadius: 8,
              padding: "7px 16px",
              color: "#fff",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.08em",
              whiteSpace: "nowrap",
            }}
          >
            ↑ Upload Set
          </button>
        </div>
      </div>

      {/* ===== KPI TILES ROW ===== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          borderBottom: "1px solid var(--divider)",
          flexShrink: 0,
        }}
      >
        {[
          {
            label: "TOTAL SHEETS",
            value: drawings.length,
            color: "var(--text-primary)",
            accent: null,
            onClick: () => { setStageFilter("all"); setDisciplineFilter("all"); setSearch(""); },
          },
          {
            label: "RELEASED",
            value: drawings.filter(d => d.stage === "Released").length,
            color: "var(--status-success)",
            accent: "rgba(34,197,94,0.10)",
            onClick: () => setStageFilter("Released"),
          },
          {
            label: "IN REVIEW",
            value: drawings.filter(d => ["OFA","BFA","OFS","BFS"].includes(d.stage)).length,
            color: "var(--status-info)",
            accent: "rgba(96,165,250,0.10)",
            onClick: () => setStageFilter("OFA"),
          },
          {
            label: "OVERDUE",
            value: overdueCount,
            color: overdueCount ? "var(--status-error)" : "var(--text-muted)",
            accent: overdueCount ? "rgba(239,68,68,0.10)" : null,
            onClick: () => setHideSuperseeded(false),
          },
          {
            label: "DUE THIS WEEK",
            value: dueThisWeek,
            color: dueThisWeek ? "var(--status-warning)" : "var(--text-muted)",
            accent: dueThisWeek ? "rgba(245,158,11,0.10)" : null,
            onClick: () => setStageFilter("all"),
          },
          {
            label: "SETS",
            value: drawingSets.length,
            color: "var(--accent)",
            accent: "rgba(200,155,32,0.08)",
            onClick: () => {},
          },
        ].map((tile, i) => (
          <div
            key={tile.label}
            onClick={tile.onClick}
            style={{
              padding: "10px 12px",
              borderTop: `3px solid ${tile.accent ? tile.color : "transparent"}`,
              borderRight: i < 5 ? "1px solid var(--divider)" : undefined,
              borderLeft: "none",
              borderBottom: "none",
              background: tile.accent || "var(--bg-surface)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              transition: "filter 0.1s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.12)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 7,
                letterSpacing: "0.14em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
              }}
            >
              {tile.label}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 18,
                fontWeight: 700,
                lineHeight: 1,
                color: tile.color || "var(--text-primary)",
              }}
            >
              {tile.value}
            </span>
          </div>
        ))}
      </div>

      {/* ===== FILTER TOOLBAR ===== */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          padding: "6px 24px",
          minHeight: 44,
          borderBottom: "2px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 7,
            padding: "0 10px",
            height: 30,
            flex: 1,
            maxWidth: 260,
          }}
        >
          <span style={{ fontSize: 11, color: "rgba(160,175,210,0.30)" }}>
            ⌕
          </span>
          <input
            placeholder="Search drawings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              fontSize: 11,
              width: "100%",
            }}
          />
        </div>

        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          style={{
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 7,
            padding: "0 10px",
            height: 30,
            color: "var(--text-secondary)",
            fontFamily: "var(--font-body)",
            fontSize: 11,
            cursor: "pointer",
            outline: "none",
            appearance: "none",
            paddingRight: 24,
            minWidth: 130,
          }}
        >
          <option value="all">All Stages</option>
          {stages.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={disciplineFilter}
          onChange={(e) => setDisciplineFilter(e.target.value)}
          style={{
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 7,
            padding: "0 10px",
            height: 30,
            color: "var(--text-secondary)",
            fontFamily: "var(--font-body)",
            fontSize: 11,
            cursor: "pointer",
            outline: "none",
            appearance: "none",
            paddingRight: 24,
            minWidth: 130,
          }}
        >
          <option value="all">All Disciplines</option>
          {disciplines.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <button
          onClick={() => setHideSuperseeded(!hideSuperseeded)}
          style={{
            background: hideSuperseeded
              ? "rgba(0,229,255,0.06)"
              : "rgba(255,255,255,0.04)",
            border: hideSuperseeded
              ? "1px solid rgba(0,229,255,0.06)"
              : "1px solid rgba(255,255,255,0.07)",
            borderRadius: 7,
            padding: "0 12px",
            height: 30,
            color: hideSuperseeded
              ? "var(--accent)"
              : "rgba(160,175,210,0.45)",
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            letterSpacing: "0.10em",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          HIDE SUPERSEDED
        </button>

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: "flex",
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 7,
            overflow: "hidden",
          }}
        >
          {[
            { label: "☰ TABLE", val: "table" },
            { label: "⊞ CARDS", val: "cards" },
          ].map(({ label, val }) => (
            <button
              key={val}
              onClick={() => setView(val)}
              style={{
                padding: "0 12px",
                height: 30,
                background:
                  view === val ? "rgba(0,229,255,0.06)" : "transparent",
                border: "none",
                borderRight: "1px solid rgba(255,255,255,0.06)",
                color: view === val ? "var(--accent)" : "rgba(160,175,210,0.35)",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                letterSpacing: "0.10em",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== SPACER BETWEEN TOOLBAR & TABLE ===== */}
      <div
        style={{
          height: 8,
          background: "rgba(255,255,255,0.01)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          flexShrink: 0,
        }}
      />

      {/* ===== COLUMN HEADERS (table only) ===== */}
      {view === "table" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "28px 96px 1fr 90px 40px 110px 80px 70px 60px 90px 70px",
            alignItems: "center",
            padding: "0 20px",
            height: 28,
            background: "rgba(255,255,255,0.025)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          {["", "#", "TITLE", "DISC", "REV", "STAGE", "IFC", "APPV", "DUE", "DAYS", ""].map(
            (col, i) => (
              <div
                key={i}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 7,
                  color: "rgba(160,175,210,0.30)",
                  letterSpacing: "0.14em",
                  userSelect: "none",
                }}
              >
                {col}
              </div>
            )
          )}
        </div>
      )}

      {/* ===== SCROLLABLE CONTENT ===== */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          paddingBottom: 24,
        }}
      >
        {isLoading ? (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              color: "rgba(160,175,210,0.60)",
            }}
          >
            Loading drawings...
          </div>
        ) : sortedSetKeys.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              color: "rgba(160,175,210,0.60)",
            }}
          >
            No drawings found
          </div>
        ) : view === "cards" ? (
          /* ===== CARDS / THUMBNAIL VIEW ===== */
          <div style={{ padding: "16px 20px" }}>
            {sortedSetKeys.map((setName) => {
              const sheets = groupedBySet[setName];
              const isCollapsed = collapsedSets.has(setName);
              return (
                <div key={setName} style={{ marginBottom: 28 }}>
                  {/* Set header */}
                  <div
                    onClick={() => toggleCollapse(setName)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "6px 12px", marginBottom: 12, cursor: "pointer",
                      borderLeft: "3px solid var(--accent)",
                      background: "rgba(200,155,32,0.05)",
                      borderRadius: "0 4px 4px 0",
                      userSelect: "none",
                    }}
                  >
                    <span style={{ color: "var(--accent)", fontSize: 10, transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▾</span>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{setName}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", padding: "1px 7px", borderRadius: 3 }}>
                      {sheets.length} SHEETS
                    </span>
                  </div>
                  {!isCollapsed && (
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                      gap: 10,
                    }}>
                      {sheets.map((drawing) => {
                        const s = BADGE_STYLES[drawing.stage] || BADGE_STYLES["Not Started"];
                        return (
                          <div
                            key={drawing.id}
                            onClick={() => { setEditingDrawing(drawing); setFormOpen(true); }}
                            style={{
                              background: "var(--bg-surface)",
                              border: `1px solid ${selectedIds.has(drawing.id) ? "var(--accent)" : "var(--border-default)"}`,
                              borderRadius: 4,
                              overflow: "hidden",
                              cursor: "pointer",
                              transition: "border-color 0.15s",
                            }}
                          >
                            {/* PDF thumbnail area */}
                            <div style={{
                              height: 130, background: "#0D0D0D",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              position: "relative", overflow: "hidden",
                              borderBottom: "1px solid var(--border-default)",
                            }}>
                              {drawing.file_url ? (
                                <iframe
                                  src={`${drawing.file_url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                                  style={{ width: "100%", height: "200%", border: "none", pointerEvents: "none", marginTop: "-50%" }}
                                  title={drawing.sheet_number}
                                />
                              ) : (
                                <div style={{ textAlign: "center" }}>
                                  <div style={{ fontSize: 28, opacity: 0.12 }}>📐</div>
                                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "rgba(160,175,210,0.20)", letterSpacing: "0.1em", marginTop: 4 }}>NO FILE</div>
                                </div>
                              )}
                              {/* Sheet number overlay */}
                              <div style={{
                                position: "absolute", top: 6, left: 6,
                                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                                color: "#fff", background: "rgba(0,0,0,0.65)",
                                padding: "2px 6px", borderRadius: 3, letterSpacing: "0.06em",
                              }}>
                                {drawing.sheet_number || "—"}
                              </div>
                              {/* Selection checkbox */}
                              <div
                                onClick={(e) => { e.stopPropagation(); toggleSelect(drawing.id); }}
                                style={{
                                  position: "absolute", top: 6, right: 6, width: 16, height: 16,
                                  background: selectedIds.has(drawing.id) ? "var(--accent)" : "rgba(0,0,0,0.5)",
                                  border: `1px solid ${selectedIds.has(drawing.id) ? "var(--accent)" : "rgba(255,255,255,0.25)"}`,
                                  borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center",
                                  cursor: "pointer",
                                }}
                              >
                                {selectedIds.has(drawing.id) && <span style={{ color: "#fff", fontSize: 9, lineHeight: 1 }}>✓</span>}
                              </div>
                            </div>
                            {/* Card body */}
                            <div style={{ padding: "8px 10px" }}>
                              <div style={{
                                fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 500,
                                color: "var(--text-primary)", marginBottom: 4,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }} title={drawing.title}>
                                {drawing.title || "Untitled"}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                                <span style={{
                                  fontFamily: "var(--font-mono)", fontSize: 7,
                                  color: "var(--text-muted)", letterSpacing: "0.08em",
                                }}>
                                  {drawing.discipline?.slice(0, 4).toUpperCase()} · Rev {drawing.revision_number ?? "0"}
                                </span>
                                <span style={{
                                  background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                                  fontFamily: "var(--font-mono)", fontSize: 6, letterSpacing: "0.08em",
                                  padding: "1px 5px", borderRadius: 3, whiteSpace: "nowrap",
                                }}>
                                  {s.label}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          sortedSetKeys.map((setName) => {
            const sheets = groupedBySet[setName];
            const isCollapsed = collapsedSets.has(setName);
            const currentRevision = sheets[0]?.set_approval_revision;
            const currentIssueDate = sheets[0]?.issue_date;
            const setApprovalStatus = sheets[0]?.set_approval_status;

            return (
              <div key={setName} style={{ marginTop: 16 }}>
                {/* GROUP SEPARATOR LINE */}
                <div
                  style={{
                    height: 1,
                    background:
                      "linear-gradient(90deg, rgba(0,229,255,0.06) 0%, rgba(0,229,255,0.06) 60%, transparent 100%)",
                    marginBottom: 0,
                  }}
                />

                {/* GROUP HEADER */}
                <div
                  onClick={() => toggleCollapse(setName)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 20px",
                    height: 40,
                    background: "var(--accent-glow)",
                    borderBottom: "1px solid rgba(0,229,255,0.06)",
                    borderLeft: "3px solid var(--accent)",
                    borderRight: "1px solid rgba(0,229,255,0.06)",
                    borderRadius: "0 8px 0 0",
                    cursor: "pointer",
                    userSelect: "none",
                    position: "sticky",
                    top: 36,
                    zIndex: 9,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        color: "var(--accent)",
                        fontSize: 11,
                        flexShrink: 0,
                        opacity: 0.8,
                        transform: isCollapsed
                          ? "rotate(-90deg)"
                          : "rotate(0deg)",
                        transition: "transform 0.15s",
                      }}
                    >
                      ▾
                    </span>

                    <span
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {setName}
                    </span>

                    <span
                      style={{
                        color: "rgba(255,255,255,0.12)",
                        fontSize: 16,
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                    >
                      ·
                    </span>

                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        color: "rgba(0,229,255,0.06)",
                        letterSpacing: "0.12em",
                        background: "rgba(0,229,255,0.06)",
                        border: "1px solid rgba(0,229,255,0.06)",
                        padding: "2px 8px",
                        borderRadius: 4,
                        flexShrink: 0,
                      }}
                    >
                      {sheets.length} SHEETS
                    </span>

                    {currentRevision && (
                      <>
                        <span
                          style={{
                            color: "rgba(255,255,255,0.10)",
                            fontSize: 14,
                            flexShrink: 0,
                          }}
                        >
                          ·
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 8,
                            color: "rgba(160,175,210,0.45)",
                            letterSpacing: "0.08em",
                            flexShrink: 0,
                          }}
                        >
                          REV {currentRevision}
                        </span>
                      </>
                    )}

                    {currentIssueDate && (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 8,
                          color: "rgba(160,175,210,0.30)",
                          letterSpacing: "0.06em",
                          flexShrink: 0,
                        }}
                      >
                        {new Date(currentIssueDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    )}

                    {setApprovalStatus === "approved" && (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 7,
                          letterSpacing: "0.10em",
                          padding: "2px 7px",
                          borderRadius: 4,
                          background: "rgba(0,214,143,0.10)",
                          border: "1px solid rgba(0,214,143,0.22)",
                          color: "#00D68F",
                          flexShrink: 0,
                        }}
                      >
                        ✓ APPROVED
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexShrink: 0,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {sheets.some((s) => s.set_approval_revision) && (
                      <button
                        onClick={() => setHistoryDrawing(sheets[0])}
                        style={headerBtn}
                      >
                        ↺ {sheets.filter((s) => s.set_approval_revision).length + 1} REVS
                      </button>
                    )}

                    <button
                      onClick={() => selectSetAll(setName)}
                      style={headerBtn}
                    >
                      ☐ SELECT
                    </button>

                    <button
                      onClick={() => {
                        const lead = sheets[0];
                        setRevisionPreselectedSet({
                          id: lead?.drawing_set_id || null,
                          set_name: setName,
                          current_revision: lead?.set_approval_revision || String(lead?.revision_number || "0"),
                          current_issue_date: lead?.issue_date || null,
                          current_issued_by: lead?.issued_by || "",
                          current_file_url: lead?.file_url || null,
                          sheet_count: sheets.filter((sheet) => !sheet.is_superseded).length,
                          revision_history: lead?.revision_history || "[]",
                          discipline: lead?.discipline || "Structural",
                          notes: lead?.notes || "",
                        });
                        setRevisionUploadOpen(true);
                      }}
                      style={{
                        ...headerBtn,
                        background: "rgba(0,229,255,0.06)",
                        borderColor: "rgba(0,229,255,0.06)",
                        color: "var(--status-warning)",
                      }}
                    >
                      ↑ NEW REV
                    </button>

                    {setApprovalStatus !== "approved" ? (
                      <button
                        onClick={() => setApprovalOpen(setName)}
                        style={{
                          ...headerBtn,
                          background: "rgba(0,229,255,0.06)",
                          borderColor: "rgba(0,229,255,0.06)",
                          color: "var(--accent)",
                          fontWeight: 600,
                        }}
                      >
                        ✓ APPROVE SET
                      </button>
                    ) : (
                      <button
                        onClick={() => setApprovalOpen(setName)}
                        style={{
                          ...headerBtn,
                          background: "rgba(0,214,143,0.08)",
                          borderColor: "rgba(0,214,143,0.20)",
                          color: "#00D68F",
                        }}
                      >
                        ✓ APPROVED
                      </button>
                    )}
                  </div>
                </div>

                {/* DRAWING ROWS */}
                {!isCollapsed &&
                  sheets.map((drawing, idx) => (
                    <div
                      key={drawing.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "28px 96px 1fr 90px 40px 110px 80px 70px 60px 90px 70px",
                        alignItems: "center",
                        height: 32,
                        padding: "0 20px",
                        borderBottom: idx === sheets.length - 1 ? "1px solid rgba(0,229,255,0.06)" : "1px solid rgba(255,255,255,0.038)",
                        background: selectedIds.has(drawing.id)
                          ? "rgba(0,229,255,0.06)"
                          : "transparent",
                        transition: "background 0.1s",
                      }}
                      className="drawing-row"
                      onMouseEnter={(e) => {
                        if (!selectedIds.has(drawing.id))
                          e.currentTarget.style.background =
                            "rgba(255,255,255,0.02)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = selectedIds.has(
                          drawing.id
                        )
                          ? "rgba(0,229,255,0.06)"
                          : "transparent";
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "100%",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(drawing.id)}
                          onChange={() => toggleSelect(drawing.id)}
                          style={{
                            width: 13,
                            height: 13,
                            cursor: "pointer",
                            accentColor: "var(--accent)",
                          }}
                        />
                      </div>

                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          fontWeight: 600,
                          color: "var(--status-warning)",
                          letterSpacing: "0.03em",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          paddingRight: 12,
                        }}
                      >
                        {drawing.sheet_number}
                      </span>

                      <span
                        style={{
                          fontFamily: "var(--font-body)",
                          fontSize: 12,
                          fontWeight: 400,
                          color: "var(--text-secondary)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          paddingRight: 16,
                        }}
                      >
                        {drawing.title}
                      </span>

                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 8,
                          color: "rgba(160,175,210,0.42)",
                          letterSpacing: "0.08em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {drawing.discipline?.toUpperCase().slice(0, 6)}
                      </span>

                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          color: "rgba(160,175,210,0.52)",
                          textAlign: "center",
                        }}
                      >
                        {drawing.revision_number || "—"}
                      </span>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          height: "100%",
                          padding: 0,
                        }}
                      >
                        <StatusBadge status={drawing.stage} />
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          height: "100%",
                          padding: 0,
                        }}
                      >
                        <IFCBadge status={drawing.ifc_status} />
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          height: "100%",
                          padding: 0,
                        }}
                      >
                        {drawing.set_approved_date ? (
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 7,
                              letterSpacing: "0.08em",
                              color: "#00D68F",
                              background: "rgba(0,214,143,0.10)",
                              border: "1px solid rgba(0,214,143,0.20)",
                              borderRadius: 4,
                              padding: "2px 6px",
                            }}
                          >
                            ✓ APPV
                          </span>
                        ) : (
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 9,
                              color: "rgba(160,175,210,0.20)",
                            }}
                          >
                            —
                          </span>
                        )}
                      </div>

                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          color:
                            drawing.due_date &&
                            new Date(drawing.due_date) < new Date()
                              ? "#FF7A7A"
                              : "rgba(160,175,210,0.38)",
                        }}
                      >
                        {drawing.due_date
                          ? new Date(drawing.due_date).toLocaleDateString(
                              "en-US",
                              {
                                month: "numeric",
                                day: "numeric",
                              }
                            )
                          : "—"}
                      </span>

                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          color: (() => {
                            if (!drawing.due_date || drawing.stage === "Released") return "rgba(160,175,210,0.25)";
                            const days = Math.ceil((new Date(drawing.due_date) - new Date()) / 86400000);
                            return days < 0 ? "#FF7A7A" : days <= 7 ? "#FFB400" : "rgba(160,175,210,0.38)";
                          })(),
                        }}
                      >
                        {drawing.due_date && drawing.stage !== "Released"
                          ? (() => {
                              const days = Math.ceil((new Date(drawing.due_date) - new Date()) / 86400000);
                              return days < 0 ? `${Math.abs(days)}d late` : `${days}d`;
                            })()
                          : "—"}
                      </span>

                      <div
                        className="row-actions"
                        style={{
                          display: "flex",
                          gap: 4,
                          opacity: 0,
                          transition: "opacity 0.1s",
                        }}
                      >
                        {[
                          { icon: "👁", title: "View" },
                          { icon: "✏", title: "Edit" },
                          { icon: "✕", title: "Delete" },
                        ].map(({ icon, title }) => (
                          <button
                            key={title}
                            title={title}
                            onClick={() => {
                              if (title === "Edit") {
                                setEditingDrawing(drawing);
                                setFormOpen(true);
                              }
                            }}
                            style={{
                              background: "rgba(255,255,255,0.05)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              borderRadius: 4,
                              width: 20,
                              height: 20,
                              cursor: "pointer",
                              fontSize: 10,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "rgba(160,175,210,0.55)",
                              padding: 0,
                              flexShrink: 0,
                            }}
                          >
                            {icon}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            );
          })
        )}
      </div>

      {/* Modals */}
      {formOpen && (
        <DrawingFormModal
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditingDrawing(null);
          }}
          onSave={handleSave}
          drawing={editingDrawing}
          drawingSets={drawingSets}
        />
      )}

      {uploadSetOpen && (
        <DrawingSetUploadModal
          open={uploadSetOpen}
          onClose={() => setUploadSetOpen(false)}
          onComplete={() => {
            qc.invalidateQueries({ queryKey: ["drawings"] });
            setUploadSetOpen(false);
          }}
          activeProject={activeProject}
          onNewRevision={() => {
            setUploadSetOpen(false);
            setRevisionPreselectedSet(null);
            setRevisionUploadOpen(true);
          }}
        />
      )}

      {historyDrawing && (
        <RevisionHistoryPanel
          drawing={historyDrawing}
          onClose={() => setHistoryDrawing(null)}
        />
      )}

      {revisionUploadOpen && (
        <RevisionUploadModal
          open={revisionUploadOpen}
          onClose={() => {
            setRevisionUploadOpen(false);
            setRevisionPreselectedSet(null);
          }}
          onComplete={() => {
            qc.invalidateQueries({ queryKey: ["drawings"] });
            setRevisionUploadOpen(false);
            setRevisionPreselectedSet(null);
          }}
          activeProject={activeProject}
          preSelectedSet={revisionPreselectedSet}
          drawingSets={drawingSets}
        />
      )}

      {approvalOpen && (
        <SetApprovalModal
          open={!!approvalOpen}
          setName={approvalOpen}
          sheetCount={(groupedBySet[approvalOpen] || []).length}
          existingRevision={(groupedBySet[approvalOpen]?.[0])?.set_approval_revision || ""}
          onClose={() => setApprovalOpen(null)}
          onConfirm={handleApproveSet}
          saving={approvingSaving}
        />
      )}

      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      )}

      <style>{`
        .drawing-row:hover .row-actions {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
}
