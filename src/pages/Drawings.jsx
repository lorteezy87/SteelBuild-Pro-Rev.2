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

  // Group by drawing set
  const groupedBySet = useMemo(() => {
    const groups = {};
    drawings.forEach((d) => {
      const setName = d.drawing_set_name || "Ungrouped";
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
        id: lead.drawing_set_id || null,
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
      setFormOpen(false);
      setEditingDrawing(null);
      toast.success("Drawing created");
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) =>
      base44.entities.Drawing.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drawings"] });
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
          borderBottom: "1px solid rgba(255,255,255,0.06)",
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
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "0.04em",
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
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 8,
              padding: "7px 14px",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
            }}
          >
            + Single Drawing
          </button>

          <button
            onClick={() => setUploadSetOpen(true)}
            style={{
              background: "linear-gradient(135deg, var(--accent), var(--status-warning))",
              border: "none",
              borderRadius: 8,
              padding: "7px 16px",
              color: "white",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
              boxShadow: "0 2px 12px rgba(59,130,246,0.25)",
            }}
          >
            ↑ Upload Set
          </button>
        </div>
      </div>

      {/* ===== FILTER TOOLBAR ===== */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 24px",
          height: 44,
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
              ? "rgba(59,130,246,0.15)"
              : "rgba(255,255,255,0.04)",
            border: hideSuperseeded
              ? "1px solid rgba(59,130,246,0.30)"
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
                  view === val ? "rgba(59,130,246,0.15)" : "transparent",
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

      {/* ===== COLUMN HEADERS ===== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "40px 108px 1fr 100px 56px 130px 100px 80px 72px",
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
        {["", "#", "TITLE", "DISC", "REV", "STATUS", "IFC", "APPV", ""].map(
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
                      "linear-gradient(90deg, rgba(59,130,246,0.35) 0%, rgba(59,130,246,0.08) 60%, transparent 100%)",
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
                    borderBottom: "1px solid rgba(59,130,246,0.12)",
                    borderLeft: "3px solid var(--accent)",
                    borderRight: "1px solid rgba(59,130,246,0.08)",
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
                        color: "rgba(59,130,246,0.70)",
                        letterSpacing: "0.12em",
                        background: "rgba(59,130,246,0.10)",
                        border: "1px solid rgba(59,130,246,0.18)",
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
                        background: "rgba(59,130,246,0.10)",
                        borderColor: "rgba(59,130,246,0.22)",
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
                          background: "rgba(59,130,246,0.14)",
                          borderColor: "rgba(59,130,246,0.30)",
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
                          "40px 108px 1fr 100px 56px 130px 100px 80px 72px",
                        alignItems: "center",
                        height: 32,
                        padding: "0 20px",
                        borderBottom: idx === sheets.length - 1 ? "1px solid rgba(59,130,246,0.10)" : "1px solid rgba(255,255,255,0.038)",
                        background: selectedIds.has(drawing.id)
                          ? "rgba(59,130,246,0.05)"
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
                          ? "rgba(59,130,246,0.05)"
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
          setName={approvalOpen}
          onClose={() => setApprovalOpen(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["drawings"] });
            setApprovalOpen(null);
          }}
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
