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
  const [selectedSet, setSelectedSet] = useState(null);
  const [setDetailTab, setSetDetailTab] = useState("sheets");

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
      {selectedSet === null ? (
        /* ===== SETS LIST VIEW ===== */
        <>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 56, background: "var(--bg-sidebar)", borderBottom: "1px solid var(--divider)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.06em" }}>DRAWINGS</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em" }}>DRAWING SETS</span>
              {activeProject && <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>{activeProject.name}</span>}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", cursor: "pointer" }}>
                <input type="checkbox" checked={hideSuperseeded} onChange={e => setHideSuperseeded(e.target.checked)} /> HIDE SUPERSEDED
              </label>
              <button onClick={() => setUploadSetOpen(true)} style={{ background: "var(--accent)", border: "none", borderRadius: 4, padding: "0 16px", height: 32, color: "#07090E", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, cursor: "pointer", letterSpacing: "0.08em" }}>
                + ADD DRAWING SET
              </button>
            </div>
          </div>

          {/* KPI bar */}
          <div style={{ display: "flex", gap: 0, padding: "0 24px", background: "var(--bg-surface)", borderBottom: "1px solid var(--divider)", flexShrink: 0 }}>
            {[
              { label: "TOTAL SETS", value: drawingSets.length },
              { label: "TOTAL SHEETS", value: drawings.length },
              { label: "OVERDUE", value: overdueCount, color: overdueCount > 0 ? "var(--status-error)" : "var(--text-muted)" },
              { label: "DUE THIS WEEK", value: dueThisWeek, color: dueThisWeek > 0 ? "var(--status-warning)" : "var(--text-muted)" },
            ].map((k) => (
              <div key={k.label} style={{ padding: "10px 20px", borderRight: "1px solid var(--divider)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.14em", marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800, color: k.color || "var(--text-primary)", lineHeight: 1 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Sets table */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 100px 100px 60px 80px 100px 80px", gap: 12, padding: "6px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--divider)", borderRadius: "4px 4px 0 0" }}>
              {["SET NAME", "CATEGORY", "ISSUE DATE", "SHEETS", "REVISION", "STATUS", ""].map((h) => (
                <span key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em" }}>{h}</span>
              ))}
            </div>
            {drawingSets.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 24px", background: "var(--bg-surface)", border: "1px solid var(--divider)", borderTop: "none", borderRadius: "0 0 4px 4px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.12em" }}>NO DRAWING SETS — CLICK "+ ADD DRAWING SET" TO UPLOAD</div>
              </div>
            ) : (
              drawingSets.map((ds, i) => {
                const sheets = groupedBySet[ds.set_name] || [];
                const status = sheets[0]?.set_approval_status || sheets[0]?.stage || "—";
                return (
                  <div
                    key={ds.set_name}
                    onClick={() => { setSelectedSet(ds.set_name); setSetDetailTab("sheets"); }}
                    style={{
                      display: "grid", gridTemplateColumns: "2fr 100px 100px 60px 80px 100px 80px",
                      gap: 12, padding: "12px 16px",
                      background: "var(--bg-surface)", border: "1px solid var(--divider)", borderTop: "none",
                      borderRadius: i === drawingSets.length - 1 ? "0 0 4px 4px" : 0,
                      cursor: "pointer", transition: "background 0.1s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(200,155,32,0.04)"}
                    onMouseLeave={e => e.currentTarget.style.background = "var(--bg-surface)"}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 14, color: "var(--accent)" }}>▦</span>
                      <div>
                        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>{ds.set_name}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{sheets.length} sheets · uploaded by {ds.current_issued_by || "—"}</div>
                      </div>
                    </div>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", alignSelf: "center" }}>{ds.discipline}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", alignSelf: "center" }}>
                      {ds.current_issue_date ? new Date(ds.current_issue_date).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "—"}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)", alignSelf: "center" }}>{ds.sheet_count}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", alignSelf: "center" }}>Rev {ds.current_revision}</span>
                    <div style={{ alignSelf: "center" }}><StatusBadge status={status} /></div>
                    <span style={{ color: "var(--text-muted)", alignSelf: "center", textAlign: "right", fontSize: 14 }}>›</span>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        /* ===== SET DETAIL VIEW ===== */
        <>
          {/* Header with back button */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 24px", height: 56, background: "var(--bg-sidebar)", borderBottom: "1px solid var(--divider)", flexShrink: 0 }}>
            <button onClick={() => setSelectedSet(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer", padding: "4px 8px 4px 0", lineHeight: 1 }}>←</button>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "0.04em" }}>{selectedSet}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em" }}>
                {(groupedBySet[selectedSet] || []).length} SHEETS
              </span>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  const sheets = groupedBySet[selectedSet] || [];
                  const lead = sheets[0];
                  setRevisionPreselectedSet({
                    id: lead?.drawing_set_id || null,
                    set_name: selectedSet,
                    current_revision: lead?.set_approval_revision || String(lead?.revision_number || "0"),
                    current_issue_date: lead?.issue_date || null,
                    current_issued_by: lead?.issued_by || "",
                    current_file_url: lead?.file_url || null,
                    sheet_count: sheets.filter(s => !s.is_superseded).length,
                    revision_history: lead?.revision_history || "[]",
                    discipline: lead?.discipline || "Structural",
                    notes: lead?.notes || "",
                  });
                  setRevisionUploadOpen(true);
                }}
                style={{ background: "var(--accent)", border: "none", borderRadius: 4, padding: "0 14px", height: 32, color: "#07090E", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800, cursor: "pointer", letterSpacing: "0.08em" }}
              >
                ↑ UPLOAD REVISION
              </button>
              <button
                onClick={() => setApprovalOpen(selectedSet)}
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-default)", borderRadius: 4, padding: "0 14px", height: 32, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em" }}
              >
                APPROVE SET
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", padding: "0 24px", background: "var(--bg-surface)", borderBottom: "1px solid var(--divider)", flexShrink: 0 }}>
            {["sheets", "revisions", "timeline"].map(tab => (
              <button key={tab} onClick={() => setSetDetailTab(tab)} style={{
                background: "none", border: "none", padding: "10px 16px",
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.10em",
                color: setDetailTab === tab ? "var(--accent)" : "var(--text-muted)",
                textTransform: "uppercase", cursor: "pointer",
                borderBottom: setDetailTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: -1,
              }}>{tab}</button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            {setDetailTab === "sheets" && (
              <div style={{ height: "100%", overflowY: "auto", paddingBottom: 24 }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "28px 96px 1fr 90px 40px 110px 80px 70px 60px 90px 70px",
                  alignItems: "center", padding: "0 20px", height: 28,
                  background: "rgba(255,255,255,0.025)", borderBottom: "1px solid rgba(255,255,255,0.06)",
                  position: "sticky", top: 0, zIndex: 10,
                }}>
                  {["", "#", "TITLE", "DISC", "REV", "STAGE", "IFC", "APPV", "DUE", "DAYS", ""].map((col, i) => (
                    <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "rgba(160,175,210,0.30)", letterSpacing: "0.14em", userSelect: "none" }}>{col}</div>
                  ))}
                </div>
                {(groupedBySet[selectedSet] || []).map((drawing, idx) => {
                  const setSheets = groupedBySet[selectedSet] || [];
                  return (
                    <div
                      key={drawing.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "28px 96px 1fr 90px 40px 110px 80px 70px 60px 90px 70px",
                        alignItems: "center", height: 32, padding: "0 20px",
                        borderBottom: idx === setSheets.length - 1 ? "1px solid rgba(0,229,255,0.06)" : "1px solid rgba(255,255,255,0.038)",
                        background: selectedIds.has(drawing.id) ? "rgba(0,229,255,0.06)" : "transparent",
                        transition: "background 0.1s",
                      }}
                      className="drawing-row"
                      onMouseEnter={e => { if (!selectedIds.has(drawing.id)) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = selectedIds.has(drawing.id) ? "rgba(0,229,255,0.06)" : "transparent"; }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                        <input type="checkbox" checked={selectedIds.has(drawing.id)} onChange={() => toggleSelect(drawing.id)} style={{ width: 13, height: 13, cursor: "pointer", accentColor: "var(--accent)" }} />
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--status-warning)", letterSpacing: "0.03em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 12 }}>{drawing.sheet_number}</span>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 400, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 16 }}>{drawing.title}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "rgba(160,175,210,0.42)", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{drawing.discipline?.toUpperCase().slice(0, 6)}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.52)", textAlign: "center" }}>{drawing.revision_number || "—"}</span>
                      <div style={{ display: "flex", alignItems: "center", height: "100%", padding: 0 }}><StatusBadge status={drawing.stage} /></div>
                      <div style={{ display: "flex", alignItems: "center", height: "100%", padding: 0 }}><IFCBadge status={drawing.ifc_status} /></div>
                      <div style={{ display: "flex", alignItems: "center", height: "100%", padding: 0 }}>
                        {drawing.set_approved_date ? (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.08em", color: "#00D68F", background: "rgba(0,214,143,0.10)", border: "1px solid rgba(0,214,143,0.20)", borderRadius: 4, padding: "2px 6px" }}>✓ APPV</span>
                        ) : (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.20)" }}>—</span>
                        )}
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: drawing.due_date && new Date(drawing.due_date) < new Date() ? "#FF7A7A" : "rgba(160,175,210,0.38)" }}>
                        {drawing.due_date ? new Date(drawing.due_date).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : "—"}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: (() => { if (!drawing.due_date || drawing.stage === "Released") return "rgba(160,175,210,0.25)"; const days = Math.ceil((new Date(drawing.due_date) - new Date()) / 86400000); return days < 0 ? "#FF7A7A" : days <= 7 ? "#FFB400" : "rgba(160,175,210,0.38)"; })() }}>
                        {drawing.due_date && drawing.stage !== "Released" ? (() => { const days = Math.ceil((new Date(drawing.due_date) - new Date()) / 86400000); return days < 0 ? `${Math.abs(days)}d late` : `${days}d`; })() : "—"}
                      </span>
                      <div className="row-actions" style={{ display: "flex", gap: 4, opacity: 0, transition: "opacity 0.1s" }}>
                        <button title="Edit" onClick={() => { setEditingDrawing(drawing); setFormOpen(true); }} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, width: 20, height: 20, cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(160,175,210,0.55)", padding: 0, flexShrink: 0 }}>✏</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {setDetailTab === "revisions" && (
              <div style={{ height: "100%", overflowY: "auto", padding: "20px 24px" }}>
                {(() => {
                  const sheets = groupedBySet[selectedSet] || [];
                  const revMap = {};
                  sheets.forEach(s => {
                    const rev = s.revision_number ?? "0";
                    if (!revMap[rev]) revMap[rev] = [];
                    revMap[rev].push(s);
                  });
                  const revKeys = Object.keys(revMap).sort((a, b) => Number(b) - Number(a));
                  return revKeys.length === 0 ? (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "48px 0" }}>NO REVISIONS</div>
                  ) : revKeys.map(rev => (
                    <div key={rev} style={{ marginBottom: 24 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em" }}>REV {rev}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{revMap[rev].length} SHEETS</span>
                        {revMap[rev][0]?.issue_date && (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>· {new Date(revMap[rev][0].issue_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {revMap[rev].map(s => (
                          <div key={s.id} style={{ display: "flex", gap: 16, alignItems: "center", padding: "6px 12px", background: "var(--bg-surface)", border: "1px solid var(--divider)", borderRadius: 4 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--status-warning)", minWidth: 80 }}>{s.sheet_number}</span>
                            <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", flex: 1 }}>{s.title}</span>
                            <StatusBadge status={s.stage} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}

            {setDetailTab === "timeline" && (
              <div style={{ height: "100%", overflowY: "auto", padding: "20px 24px" }}>
                {(() => {
                  const sheets = groupedBySet[selectedSet] || [];
                  const events = [];
                  sheets.forEach(s => {
                    if (s.issue_date) events.push({ date: s.issue_date, label: `Issued — ${s.sheet_number}`, detail: s.title, type: "issue" });
                    if (s.set_approved_date) events.push({ date: s.set_approved_date, label: `Approved — ${s.sheet_number}`, detail: `by ${s.set_approved_by || "—"}`, type: "approval" });
                  });
                  events.sort((a, b) => new Date(b.date) - new Date(a.date));
                  return events.length === 0 ? (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "48px 0" }}>NO TIMELINE EVENTS</div>
                  ) : (
                    <div style={{ position: "relative", paddingLeft: 32 }}>
                      <div style={{ position: "absolute", left: 12, top: 0, bottom: 0, width: 2, background: "var(--divider)" }} />
                      {events.map((ev, i) => (
                        <div key={i} style={{ position: "relative", marginBottom: 20 }}>
                          <div style={{ position: "absolute", left: -24, top: 4, width: 10, height: 10, borderRadius: "50%", background: ev.type === "approval" ? "var(--accent)" : "#60a5fa", border: "2px solid var(--bg-page)" }} />
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginBottom: 3 }}>{new Date(ev.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{ev.label}</div>
                          {ev.detail && <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{ev.detail}</div>}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </>
      )}

      {/* ===== MODALS (always rendered regardless of view) ===== */}
      {formOpen && (
        <DrawingFormModal
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditingDrawing(null); }}
          onSave={handleSave}
          drawing={editingDrawing}
          drawingSets={drawingSets}
        />
      )}

      {uploadSetOpen && (
        <DrawingSetUploadModal
          open={uploadSetOpen}
          onClose={() => setUploadSetOpen(false)}
          onComplete={() => { qc.invalidateQueries({ queryKey: ["drawings"] }); setUploadSetOpen(false); }}
          activeProject={activeProject}
          onNewRevision={() => { setUploadSetOpen(false); setRevisionPreselectedSet(null); setRevisionUploadOpen(true); }}
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
          onClose={() => { setRevisionUploadOpen(false); setRevisionPreselectedSet(null); }}
          onComplete={() => { qc.invalidateQueries({ queryKey: ["drawings"] }); setRevisionUploadOpen(false); setRevisionPreselectedSet(null); }}
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
