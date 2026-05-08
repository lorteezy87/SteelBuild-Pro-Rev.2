import React, { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { toast } from "sonner";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import SetApprovalModal from "@/components/drawings/SetApprovalModal";
import { syncDrawingScheduleTasks } from "@/utils/syncDrawingScheduleTasks";

// ─── Config ───────────────────────────────────────────────────────────────────

const STAGES = [
  { key: "Not Started", label: "NOT STARTED", color: "#6B7280", bg: "rgba(107,114,128,0.15)" },
  { key: "OFA",         label: "OFA",         color: "#3B82F6", bg: "rgba(59,130,246,0.15)" },
  { key: "BFA",         label: "BFA",         color: "#06B6D4", bg: "rgba(6,182,212,0.15)" },
  { key: "OFS",         label: "OFS",         color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
  { key: "BFS",         label: "BFS",         color: "#8B5CF6", bg: "rgba(139,92,246,0.15)" },
  { key: "FFF",         label: "FFF",         color: "#EC4899", bg: "rgba(236,72,153,0.15)" },
  { key: "Released",    label: "IFC",         color: "#10B981", bg: "rgba(16,185,129,0.15)" },
];
const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));
const STAGE_ORDER = STAGES.map(s => s.key);

const DISCIPLINES = ["Structural", "Misc Metals", "Connections", "Anchor Bolts", "Erection", "MEP", "Civil", "Architectural"];

const EMPTY_FORM = {
  sheet_number: "", title: "", discipline: "Structural",
  revision_number: "0", stage: "Not Started",
  submitted_date: "", return_date: "", due_date: "",
  reviewer: "", spec_section: "", notes: "",
  linked_rfi_ids: "", priority_flag: false,
};

const mono = { fontFamily: "var(--font-mono)" };
const surface = { background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 2 };

// ─── Sub-components ───────────────────────────────────────────────────────────

function StageChip({ stage, size = "sm" }) {
  const cfg = STAGE_MAP[stage] || STAGE_MAP["Not Started"];
  const pad = size === "sm" ? "2px 7px" : "4px 10px";
  const fs = size === "sm" ? 9 : 10;
  return (
    <span style={{
      ...mono, padding: pad, borderRadius: 2, fontSize: fs, fontWeight: 700,
      letterSpacing: "0.1em", color: cfg.color, background: cfg.bg,
      border: `1px solid ${cfg.color}44`, whiteSpace: "nowrap",
    }}>{cfg.label}</span>
  );
}

function PriorityDot({ active }) {
  if (!active) return null;
  return <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "var(--status-error)", flexShrink: 0 }} />;
}

function OverdueBadge() {
  return (
    <span style={{ ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", color: "var(--status-error)", background: "var(--danger-muted)", border: "1px solid var(--danger-border, rgba(239,68,68,0.3))", borderRadius: 2, padding: "1px 5px" }}>
      OVERDUE
    </span>
  );
}

function isOverdue(drawing) {
  if (!drawing.due_date) return false;
  if (drawing.stage === "Released") return false;
  return new Date(drawing.due_date) < new Date();
}

// ─── Stage Pipeline ───────────────────────────────────────────────────────────

function StagePipeline({ drawings }) {
  const total = drawings.length || 1;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {STAGES.slice(1).map(s => {
        const count = drawings.filter(d => d.stage === s.key).length;
        const pct = Math.round((count / total) * 100);
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 90 }}>
            <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: s.color, letterSpacing: "0.08em", width: 34 }}>{s.label}</span>
            <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", minWidth: 50 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: s.color, borderRadius: 3, transition: "width 0.4s ease" }} />
            </div>
            <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", width: 22, textAlign: "right" }}>{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sheet Form Modal ─────────────────────────────────────────────────────────

function SheetFormModal({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const labelStyle = { ...mono, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--text-muted)", display: "block", marginBottom: 5 };
  const inputStyle = { width: "100%", padding: "8px 10px", background: "var(--bg-page)", border: "1px solid var(--border-default)", borderRadius: 2, color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 13, boxSizing: "border-box" };
  const selectStyle = { ...inputStyle };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...surface, width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span style={{ ...mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--accent)" }}>
            {initial?.id ? "EDIT SHEET" : "ADD SHEET"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>Sheet Number *</label>
            <input style={inputStyle} value={form.sheet_number} onChange={e => set("sheet_number", e.target.value)} placeholder="S1-001" />
          </div>
          <div>
            <label style={labelStyle}>Revision</label>
            <input style={inputStyle} value={form.revision_number} onChange={e => set("revision_number", e.target.value)} placeholder="0" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Title *</label>
            <input style={inputStyle} value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Foundation Plan" />
          </div>
          <div>
            <label style={labelStyle}>Discipline</label>
            <select style={selectStyle} value={form.discipline} onChange={e => set("discipline", e.target.value)}>
              {DISCIPLINES.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Stage</label>
            <select style={selectStyle} value={form.stage} onChange={e => set("stage", e.target.value)}>
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Submitted Date</label>
            <input type="date" style={inputStyle} value={form.submitted_date || ""} onChange={e => set("submitted_date", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Due Date</label>
            <input type="date" style={inputStyle} value={form.due_date || ""} onChange={e => set("due_date", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Return Date</label>
            <input type="date" style={inputStyle} value={form.return_date || ""} onChange={e => set("return_date", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Reviewer</label>
            <input style={inputStyle} value={form.reviewer || ""} onChange={e => set("reviewer", e.target.value)} placeholder="Reviewer name" />
          </div>
          <div>
            <label style={labelStyle}>Spec Section</label>
            <input style={inputStyle} value={form.spec_section || ""} onChange={e => set("spec_section", e.target.value)} placeholder="05 12 00" />
          </div>
          <div>
            <label style={labelStyle}>Linked RFI Numbers</label>
            <input style={inputStyle} value={form.linked_rfi_ids || ""} onChange={e => set("linked_rfi_ids", e.target.value)} placeholder="RFI #001, RFI #002" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>PDF Attachment</label>
            {form.file_url && !uploadFile && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ ...mono, fontSize: 10, color: "#10B981" }}>FILE ATTACHED</span>
                <button onClick={() => set("file_url", "")} style={{ background: "none", border: "none", color: "var(--status-error)", fontSize: 10, cursor: "pointer", ...mono }}>REMOVE</button>
              </div>
            )}
            <input
              type="file"
              accept=".pdf,.dwg,.dxf"
              onChange={e => { if (e.target.files?.[0]) setUploadFile(e.target.files[0]); }}
              style={{ ...inputStyle, padding: "6px 10px", fontSize: 11 }}
            />
            {uploadFile && <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>{uploadFile.name} ({(uploadFile.size / 1024).toFixed(0)} KB)</div>}
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, height: 72, resize: "vertical" }} value={form.notes || ""} onChange={e => set("notes", e.target.value)} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" id="pflag" checked={!!form.priority_flag} onChange={e => set("priority_flag", e.target.checked)} />
            <label htmlFor="pflag" style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", cursor: "pointer" }}>
              Priority Flag — mark as critical path
            </label>
          </div>
        </div>

        <div style={{ marginTop: 24, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 20px", background: "none", border: "1px solid var(--border-default)", borderRadius: 2, color: "var(--text-muted)", ...mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer" }}>
            CANCEL
          </button>
          <button onClick={async () => {
              let fileUrl = form.file_url || "";
              if (uploadFile) {
                setUploading(true);
                try {
                  const { file_url } = await base44.integrations.Core.UploadFile({ file: uploadFile });
                  fileUrl = file_url;
                } catch (err) {
                  toast.error("File upload failed: " + (err?.message || "Unknown error"));
                  setUploading(false);
                  return;
                }
                setUploading(false);
              }
              onSave({ ...form, file_url: fileUrl });
            }} disabled={saving || uploading || !form.sheet_number || !form.title}
            style={{ padding: "8px 24px", background: "var(--accent)", border: "none", borderRadius: 2, color: "#000", ...mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", cursor: (saving || uploading) ? "not-allowed" : "pointer", opacity: (saving || uploading) ? 0.7 : 1 }}>
            {uploading ? "UPLOADING..." : saving ? "SAVING..." : "SAVE SHEET"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Transmittal Export ───────────────────────────────────────────────────────

function exportTransmittal(drawings, projectName) {
  const headers = ["Sheet Number", "Title", "Discipline", "Revision", "Stage", "Submitted Date", "Due Date", "Return Date", "Reviewer", "Priority", "Linked RFIs", "Notes"];
  const rows = drawings.map(d => [
    d.sheet_number, d.title, d.discipline, d.revision_number, d.stage,
    d.submitted_date || "", d.due_date || "", d.return_date || "",
    d.reviewer || "", d.priority_flag ? "YES" : "", d.linked_rfi_ids || "", d.notes || "",
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName || "project"}_transmittal_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Drawings() {
  const { activeProject } = useProjectContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const projectId = activeProject?.id;

  const [view, setView] = useState("list");          // "list" | "grid"
  const [search, setSearch] = useState("");
  const [discipline, setDiscipline] = useState("ALL");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [selected, setSelected] = useState(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [bulkStage, setBulkStage] = useState("");
  const [contextMenu, setContextMenu] = useState(null); // { x, y, drawing }
  const [showStageMenu, setShowStageMenu] = useState(false);
  const [approvalSet, setApprovalSet] = useState(null);   // { setName, sheets }
  const [savingApproval, setSavingApproval] = useState(false);
  const contextRef = useRef(null);
  const syncSignatureRef = useRef("");

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: drawings = [], isLoading } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => projectId ? base44.entities.Drawing.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 30000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidate = () => qc.invalidateQueries({ queryKey: ["drawings", projectId] });

  const syncScheduleFromDrawings = async (drawingsToSync, options = {}) => {
    if (!projectId) return;
    const result = await syncDrawingScheduleTasks({
      projectId,
      projectName: activeProject?.name || "",
      drawings: drawingsToSync,
    });
    if (result.created || result.updated || result.deleted) {
      qc.invalidateQueries({ queryKey: ["schedule-tasks"] });
      if (options.toastOnChange) {
        toast.success("Schedule updated from drawing sets");
      }
    }
  };

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Drawing.create({ ...data, project_id: projectId, project_name: activeProject?.name }),
    onSuccess: async (created) => {
      invalidate();
      toast.success("Sheet added");
      setShowModal(false);
      try {
        await syncScheduleFromDrawings([...drawings, created], { toastOnChange: true });
      } catch (err) {
        console.warn("Drawing schedule sync failed:", err);
      }

      // Auto-create a ScheduleTask so drawing dates appear on the schedule
      if (false && created && (created.due_date || created.submitted_date)) {
        try {
          const startDate = created.submitted_date || created.due_date;
          const endDate = created.due_date || created.submitted_date;
          await base44.entities.ScheduleTask.create({
            project_id: projectId,
            project_name: activeProject?.name || "",
            task_name: `${created.sheet_number || "DWG"} — ${created.title || "Drawing Review"}`,
            task_type: "Submittal",
            phase: "Detailing",
            start_date: startDate,
            end_date: endDate,
            status: "Not Started",
            priority: created.priority_flag ? "High" : "Normal",
            percent_complete: 0,
            notes: [
              created.discipline ? `Discipline: ${created.discipline}` : "",
              created.reviewer ? `Reviewer: ${created.reviewer}` : "",
              created.spec_section ? `Spec: ${created.spec_section}` : "",
            ].filter(Boolean).join(" | "),
          });
          qc.invalidateQueries({ queryKey: ["schedule-tasks"] });
          toast.success("Schedule task auto-created");
        } catch (err) {
          // Non-blocking — drawing was already created successfully
          console.warn("Auto-schedule failed:", err);
        }
      }
    },
    onError: (e) => toast.error("Failed to add: " + (e?.message || "unknown")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => base44.entities.Drawing.update(id, data),
    onSuccess: async () => {
      invalidate();
      try {
        const refreshedDrawings = await base44.entities.Drawing.filter({ project_id: projectId });
        await syncScheduleFromDrawings(refreshedDrawings, { toastOnChange: false });
      } catch (err) {
        console.warn("Drawing schedule sync failed:", err);
      }
      toast.success("Sheet updated");
      setEditing(null);
    },
    onError: (e) => toast.error("Failed to update: " + (e?.message || "unknown")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Drawing.delete(id),
    onSuccess: async () => {
      invalidate();
      try {
        const refreshedDrawings = await base44.entities.Drawing.filter({ project_id: projectId });
        await syncScheduleFromDrawings(refreshedDrawings, { toastOnChange: false });
      } catch (err) {
        console.warn("Drawing schedule sync failed:", err);
      }
      toast.success("Sheet deleted");
      setSelected(new Set());
    },
    onError: (e) => toast.error("Failed to delete: " + (e?.message || "unknown")),
  });

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = [...drawings];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.sheet_number?.toLowerCase().includes(q) ||
        d.title?.toLowerCase().includes(q) ||
        d.reviewer?.toLowerCase().includes(q) ||
        d.spec_section?.toLowerCase().includes(q)
      );
    }
    if (discipline !== "ALL") list = list.filter(d => d.discipline === discipline);
    if (stageFilter !== "ALL") list = list.filter(d => d.stage === stageFilter);
    return list;
  }, [drawings, search, discipline, stageFilter]);

  const disciplineCounts = useMemo(() => {
    const counts = { ALL: drawings.length };
    DISCIPLINES.forEach(d => { counts[d] = drawings.filter(x => x.discipline === d).length; });
    return counts;
  }, [drawings]);

  const stats = useMemo(() => ({
    total: drawings.length,
    released: drawings.filter(d => d.stage === "Released").length,
    inReview: drawings.filter(d => ["OFA", "BFA", "OFS", "BFS"].includes(d.stage)).length,
    overdue: drawings.filter(d => isOverdue(d)).length,
    priority: drawings.filter(d => d.priority_flag).length,
  }), [drawings]);

  // ── Drawing set grouping (for set approval) ────────────────────────────────

  const drawingSets = useMemo(() => {
    const map = {};
    drawings.forEach(d => {
      const name = d.drawing_set_name?.trim();
      if (!name) return;
      if (!map[name]) map[name] = [];
      map[name].push(d);
    });
    return map; // { "Set A": [drawing, ...], ... }
  }, [drawings]);

  useEffect(() => {
    if (!projectId || !drawings.length) return;
    const signature = drawings
      .filter((drawing) => !drawing.is_superseded)
      .map((drawing) => [
        drawing.id,
        drawing.drawing_set_name || "",
        drawing.sheet_number || "",
        drawing.submitted_date || "",
        drawing.due_date || "",
        drawing.stage || "",
      ].join(":"))
      .sort()
      .join("|");

    if (!signature || syncSignatureRef.current === signature) return;
    syncSignatureRef.current = signature;

    syncScheduleFromDrawings(drawings).catch((err) => {
      console.warn("Initial drawing schedule sync failed:", err);
    });
  }, [drawings, projectId]);

  // ── Save handlers ──────────────────────────────────────────────────────────

  const handleSave = async (form) => {
    setSaving(true);
    try {
      if (editing?.id) {
        await updateMut.mutateAsync({ id: editing.id, ...form });
      } else {
        await createMut.mutateAsync(form);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    if (!confirm("Delete this sheet? This cannot be undone.")) return;
    deleteMut.mutate(id);
    setContextMenu(null);
  };

  const handleAdvanceStage = (drawing) => {
    const idx = STAGE_ORDER.indexOf(drawing.stage);
    if (idx < STAGE_ORDER.length - 1) {
      updateMut.mutate({ id: drawing.id, stage: STAGE_ORDER[idx + 1] });
    }
    setContextMenu(null);
  };

  const handleBulkStageApply = () => {
    if (!bulkStage || selected.size === 0) return;
    Promise.all([...selected].map(id => base44.entities.Drawing.update(id, { stage: bulkStage })))
      .then(() => { invalidate(); setSelected(new Set()); setBulkStage(""); toast.success(`Updated ${selected.size} sheets`); })
      .catch(err => { invalidate(); toast.error("Bulk update failed: " + (err?.message || "Unknown error")); });
  };

  const handleSetApproval = async ({ status, revision, approvedBy, approvalDate, applyToSheets, notes }) => {
    if (!approvalSet) return;
    setSavingApproval(true);
    try {
      const sheetsToUpdate = applyToSheets ? approvalSet.sheets : [approvalSet.sheets[0]];
      await Promise.all(
        sheetsToUpdate.map(s =>
          base44.entities.Drawing.update(s.id, {
            set_approval_status: status,
            set_approved_date: approvalDate || new Date().toISOString().split("T")[0],
            ...(revision ? { revision_number: revision } : {}),
            ...(notes ? { notes: (s.notes ? s.notes + "\n" : "") + `[${status.toUpperCase()}] ${notes}` } : {}),
          })
        )
      );
      invalidate();
      toast.success(`Set "${approvalSet.setName}" marked as ${status}`);
      setApprovalSet(null);
    } catch (err) {
      toast.error("Approval update failed: " + (err?.message || "Unknown error"));
    } finally {
      setSavingApproval(false);
    }
  };

  // Determine the set name for the current selection (for bulk set approval)
  const selectedSetName = useMemo(() => {
    if (selected.size === 0) return null;
    const names = new Set();
    for (const id of selected) {
      const d = drawings.find(x => x.id === id);
      if (d?.drawing_set_name?.trim()) names.add(d.drawing_set_name.trim());
    }
    // Only offer set approval when all selected drawings share the same set name
    return names.size === 1 ? [...names][0] : null;
  }, [selected, drawings]);

  const openSetApproval = (setName) => {
    const sheets = drawingSets[setName] || [];
    if (!sheets.length) return;
    setApprovalSet({ setName, sheets });
  };

  const toggleSelect = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(d => d.id)));
  };

  // ── Styles ─────────────────────────────────────────────────────────────────

  const btnBase = { ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", borderRadius: 2, cursor: "pointer", border: "none", padding: "6px 14px", textTransform: "uppercase" };
  const btnPrimary = { ...btnBase, background: "var(--accent)", color: "#000" };
  const btnGhost = { ...btnBase, background: "none", border: "1px solid var(--border-default)", color: "var(--text-muted)" };

  if (!projectId) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <p style={{ ...mono, fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.15em" }}>SELECT A PROJECT TO VIEW DRAWINGS</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: "var(--bg-page)" }}
      onClick={() => { setContextMenu(null); setShowStageMenu(false); }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ ...mono, fontSize: 10, color: "var(--accent)", letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: 4 }}>
            DRAWINGS & SUBMITTALS
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            {activeProject?.name}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btnGhost} onClick={() => exportTransmittal(filtered, activeProject?.name)}>
            ↓ TRANSMITTAL
          </button>
          <button style={btnPrimary} onClick={() => { setEditing(null); setShowModal(true); }}>
            + ADD SHEET
          </button>
        </div>
      </div>

      {/* ── Stats Bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "TOTAL SHEETS", value: stats.total, color: "var(--text-primary)" },
          { label: "IFC / RELEASED", value: stats.released, color: "#10B981" },
          { label: "IN REVIEW", value: stats.inReview, color: "#3B82F6" },
          { label: "OVERDUE", value: stats.overdue, color: "var(--status-error)" },
          { label: "PRIORITY", value: stats.priority, color: "var(--accent)" },
        ].map(s => (
          <div key={s.label} style={{ ...surface, padding: "12px 16px" }}>
            <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", color: "var(--text-muted)", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1, ...mono }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Stage Pipeline ─────────────────────────────────────────────────── */}
      <ErrorBoundary label="Stage Pipeline">
        <div style={{ ...surface, padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", color: "var(--text-muted)", marginBottom: 10 }}>SUBMITTAL STAGE PIPELINE</div>
          <StagePipeline drawings={drawings} />
        </div>
      </ErrorBoundary>

      {/* ── Discipline Chips ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {["ALL", ...DISCIPLINES].map(d => {
          const count = disciplineCounts[d] || 0;
          const active = discipline === d;
          return (
            <button key={d} onClick={() => setDiscipline(d)} style={{
              ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", padding: "4px 10px",
              borderRadius: 2, cursor: "pointer", border: `1px solid ${active ? "var(--accent)" : "var(--border-default)"}`,
              background: active ? "rgba(200,155,32,0.15)" : "none",
              color: active ? "var(--accent)" : "var(--text-muted)",
            }}>
              {d} <span style={{ opacity: 0.7 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        {/* Search */}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search sheets, titles, reviewers…"
          style={{ flex: 1, minWidth: 200, padding: "7px 12px", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 2, color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 13 }} />

        {/* Stage filter */}
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
          style={{ padding: "7px 10px", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 2, color: "var(--text-primary)", ...mono, fontSize: 10 }}>
          <option value="ALL">ALL STAGES</option>
          {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        {/* View toggle */}
        <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 2, overflow: "hidden" }}>
          {["list", "grid"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              ...mono, fontSize: 10, fontWeight: 700, padding: "6px 12px", border: "none", cursor: "pointer",
              background: view === v ? "rgba(200,155,32,0.2)" : "none",
              color: view === v ? "var(--accent)" : "var(--text-muted)",
            }}>
              {v === "list" ? "☰ LIST" : "⊞ GRID"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bulk Actions Bar ───────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div style={{ ...surface, padding: "10px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 12, background: "rgba(200,155,32,0.08)", borderColor: "rgba(200,155,32,0.3)" }}>
          <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>{selected.size} SELECTED</span>
          <select value={bulkStage} onChange={e => setBulkStage(e.target.value)}
            style={{ padding: "5px 10px", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 2, color: "var(--text-primary)", ...mono, fontSize: 10 }}>
            <option value="">— SET STAGE —</option>
            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button style={btnPrimary} onClick={handleBulkStageApply} disabled={!bulkStage}>APPLY</button>
          {selectedSetName && (
            <button style={{ ...btnBase, background: "rgba(0,230,118,0.15)", border: "1px solid rgba(0,230,118,0.3)", color: "#00E676" }}
              onClick={() => openSetApproval(selectedSetName)}>
              SET APPROVAL
            </button>
          )}
          <button style={btnGhost} onClick={() => {
            if (!confirm(`Delete ${selected.size} sheets? This cannot be undone.`)) return;
            Promise.all([...selected].map(id => base44.entities.Drawing.delete(id)))
              .then(() => { invalidate(); setSelected(new Set()); toast.success("Sheets deleted"); })
              .catch(err => { invalidate(); toast.error("Some deletions failed: " + (err?.message || "Unknown error")); });
          }}>DELETE</button>
          <button style={btnGhost} onClick={() => setSelected(new Set())}>CLEAR</button>
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <ErrorBoundary label="Drawings Content">
        {isLoading ? (
          <div style={{ padding: 48, textAlign: "center", ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.2em" }}>LOADING SHEETS…</div>
        ) : filtered.length === 0 ? (
          <div style={{ ...surface, padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>▦</div>
            <p style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.2em", margin: 0 }}>
              {drawings.length === 0 ? "NO SHEETS YET — ADD YOUR FIRST DRAWING" : "NO SHEETS MATCH FILTERS"}
            </p>
          </div>
        ) : view === "list" ? (
          <ListView drawings={filtered} selected={selected} onToggleSelect={toggleSelect}
            onToggleAll={toggleSelectAll} onEdit={d => { setEditing(d); setShowModal(true); }}
            onDelete={handleDelete} onAdvance={handleAdvanceStage}
            onView={d => navigate(`/DrawingViewer?id=${d.id}`)}
            setContextMenu={setContextMenu}
            onSetApproval={openSetApproval} />
        ) : (
          <GridView drawings={filtered} selected={selected} onToggleSelect={toggleSelect}
            onEdit={d => { setEditing(d); setShowModal(true); }}
            onDelete={handleDelete} onAdvance={handleAdvanceStage}
            onView={d => navigate(`/DrawingViewer?id=${d.id}`)}
            onSetApproval={openSetApproval} />
        )}
      </ErrorBoundary>

      {/* ── Context Menu ───────────────────────────────────────────────────── */}
      {contextMenu && (
        <div ref={contextRef} style={{
          position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: 999,
          ...surface, padding: "6px 0", minWidth: 180, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }} onClick={e => e.stopPropagation()}>
          {[
            { label: "View PDF", action: () => { navigate(`/DrawingViewer?id=${contextMenu.drawing.id}`); setContextMenu(null); } },
            { label: "Edit Sheet", action: () => { setEditing(contextMenu.drawing); setShowModal(true); setContextMenu(null); } },
            { label: "Advance Stage →", action: () => handleAdvanceStage(contextMenu.drawing) },
            ...(contextMenu.drawing.drawing_set_name?.trim() ? [{
              label: "Set Approval ✓",
              action: () => { openSetApproval(contextMenu.drawing.drawing_set_name.trim()); setContextMenu(null); }
            }] : []),
            { label: "Delete Sheet", action: () => handleDelete(contextMenu.drawing.id), danger: true },
          ].map(item => (
            <button key={item.label} onClick={item.action} style={{
              display: "block", width: "100%", textAlign: "left", padding: "8px 16px",
              background: "none", border: "none", cursor: "pointer", ...mono, fontSize: 10,
              fontWeight: 700, letterSpacing: "0.08em", color: item.danger ? "var(--status-error)" : "var(--text-primary)",
              ":hover": { background: "var(--hover-bg)" },
            }}>{item.label}</button>
          ))}
        </div>
      )}

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {showModal && (
        <SheetFormModal
          initial={editing || EMPTY_FORM}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
          saving={saving}
        />
      )}

      {/* ── Set Approval Modal ────────────────────────────────────────────── */}
      <SetApprovalModal
        open={!!approvalSet}
        onClose={() => setApprovalSet(null)}
        setName={approvalSet?.setName || ""}
        sheetCount={approvalSet?.sheets?.length || 0}
        existingRevision={approvalSet?.sheets?.[0]?.revision_number || ""}
        onConfirm={handleSetApproval}
        saving={savingApproval}
      />
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({ drawings, selected, onToggleSelect, onToggleAll, onEdit, onDelete, onAdvance, onView, setContextMenu, onSetApproval }) {
  const allSelected = selected.size === drawings.length && drawings.length > 0;
  const thStyle = { ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", color: "var(--text-muted)", textTransform: "uppercase", padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap", background: "var(--bg-surface)" };
  const tdStyle = { padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)", verticalAlign: "middle" };

  return (
    <div style={{ ...surface, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 36 }}>
              <input type="checkbox" checked={allSelected} onChange={onToggleAll} style={{ cursor: "pointer" }} />
            </th>
            <th style={thStyle}>SHEET #</th>
            <th style={thStyle}>TITLE</th>
            <th style={thStyle}>DISCIPLINE</th>
            <th style={thStyle}>REV</th>
            <th style={thStyle}>STAGE</th>
            <th style={thStyle}>SUBMITTED</th>
            <th style={thStyle}>DUE DATE</th>
            <th style={thStyle}>REVIEWER</th>
            <th style={thStyle}>APPROVAL</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {drawings.map(d => {
            const overdue = isOverdue(d);
            const isSel = selected.has(d.id);
            return (
              <tr key={d.id}
                onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, drawing: d }); }}
                style={{ background: isSel ? "rgba(200,155,32,0.06)" : "none", cursor: "default" }}>
                <td style={tdStyle}>
                  <input type="checkbox" checked={isSel} onChange={() => onToggleSelect(d.id)} style={{ cursor: "pointer" }} />
                </td>
                <td style={{ ...tdStyle, ...mono, fontSize: 12, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <PriorityDot active={d.priority_flag} />
                    {d.sheet_number}
                  </div>
                </td>
                <td style={{ ...tdStyle, maxWidth: 260 }}>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</div>
                  {d.linked_rfi_ids && <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{d.linked_rfi_ids}</div>}
                </td>
                <td style={{ ...tdStyle, ...mono, fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{d.discipline}</td>
                <td style={{ ...tdStyle, ...mono, fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textAlign: "center" }}>R{d.revision_number ?? "0"}</td>
                <td style={{ ...tdStyle }}><StageChip stage={d.stage} /></td>
                <td style={{ ...tdStyle, ...mono, fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{d.submitted_date || "—"}</td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ ...mono, fontSize: 10, color: overdue ? "var(--status-error)" : "var(--text-muted)" }}>{d.due_date || "—"}</span>
                    {overdue && <OverdueBadge />}
                  </div>
                </td>
                <td style={{ ...tdStyle, ...mono, fontSize: 10, color: "var(--text-muted)" }}>{d.reviewer || "—"}</td>
                <td style={{ ...tdStyle }}>
                  {d.set_approval_status ? (
                    <span style={{
                      ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 2,
                      color: d.set_approval_status === "approved" ? "#10B981" : d.set_approval_status === "rejected" ? "var(--status-error)" : "var(--text-muted)",
                      background: d.set_approval_status === "approved" ? "rgba(16,185,129,0.12)" : d.set_approval_status === "rejected" ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${d.set_approval_status === "approved" ? "rgba(16,185,129,0.25)" : d.set_approval_status === "rejected" ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.1)"}`,
                      textTransform: "uppercase",
                    }}>
                      {d.set_approval_status}
                    </span>
                  ) : d.drawing_set_name?.trim() ? (
                    <button onClick={() => onSetApproval(d.drawing_set_name.trim())} style={{
                      ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 2,
                      background: "none", border: "1px dashed rgba(255,255,255,0.15)", color: "var(--text-muted)", cursor: "pointer",
                    }}>
                      REVIEW
                    </button>
                  ) : (
                    <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>—</span>
                  )}
                </td>
                <td style={{ ...tdStyle }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <ActionBtn label="View" onClick={() => onView(d)} />
                    <ActionBtn label="Edit" onClick={() => onEdit(d)} />
                    <ActionBtn label="→" title="Advance stage" onClick={() => onAdvance(d)} disabled={d.stage === "Released"} />
                    <ActionBtn label="✕" onClick={() => onDelete(d.id)} danger />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ActionBtn({ label, onClick, danger, disabled, title }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ ...mono, fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: 2, border: `1px solid ${danger ? "rgba(239,68,68,0.3)" : "var(--border-default)"}`, background: "none", color: danger ? "var(--status-error)" : "var(--text-muted)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.3 : 1, whiteSpace: "nowrap" }}>
      {label}
    </button>
  );
}

// ─── Grid View ────────────────────────────────────────────────────────────────

function GridView({ drawings, selected, onToggleSelect, onEdit, onDelete, onAdvance, onView, onSetApproval }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
      {drawings.map(d => {
        const overdue = isOverdue(d);
        const isSel = selected.has(d.id);
        const stage = STAGE_MAP[d.stage] || STAGE_MAP["Not Started"];
        return (
          <div key={d.id} onClick={() => onToggleSelect(d.id)}
            style={{ background: "var(--bg-surface)", border: `1px solid ${isSel ? "var(--accent)" : "var(--border-default)"}`, borderRadius: 2, overflow: "hidden", cursor: "pointer", position: "relative", transition: "border-color 0.15s" }}>
            {/* Stage color strip */}
            <div style={{ height: 3, background: stage.color }} />

            {/* Priority indicator */}
            {d.priority_flag && <div style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", background: "var(--status-error)" }} />}

            <div style={{ padding: "12px 14px" }}>
              {/* Sheet number */}
              <div style={{ ...mono, fontSize: 15, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {d.sheet_number}
              </div>

              {/* Title */}
              <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginBottom: 10, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.4 }}>
                {d.title}
              </div>

              {/* Stage + Rev */}
              <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                <StageChip stage={d.stage} />
                <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>R{d.revision_number ?? "0"}</span>
                {overdue && <OverdueBadge />}
              </div>

              {/* Due date */}
              {d.due_date && (
                <div style={{ ...mono, fontSize: 9, color: overdue ? "var(--status-error)" : "var(--text-muted)" }}>
                  DUE {d.due_date}
                </div>
              )}

              {/* Discipline */}
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4, opacity: 0.6 }}>{d.discipline}</div>

              {/* Set approval status */}
              {d.set_approval_status && (
                <div style={{ marginTop: 6 }}>
                  <span style={{
                    ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 6px", borderRadius: 2,
                    color: d.set_approval_status === "approved" ? "#10B981" : d.set_approval_status === "rejected" ? "var(--status-error)" : "var(--text-muted)",
                    background: d.set_approval_status === "approved" ? "rgba(16,185,129,0.12)" : d.set_approval_status === "rejected" ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)",
                    border: `1px solid ${d.set_approval_status === "approved" ? "rgba(16,185,129,0.25)" : d.set_approval_status === "rejected" ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.1)"}`,
                    textTransform: "uppercase",
                  }}>{d.set_approval_status}</span>
                </div>
              )}
            </div>

            {/* Actions footer */}
            <div style={{ borderTop: "1px solid var(--border-default)", padding: "7px 10px", display: "flex", gap: 5, justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
              <ActionBtn label="View" onClick={() => onView(d)} />
              <ActionBtn label="Edit" onClick={() => onEdit(d)} />
              {d.drawing_set_name?.trim() && !d.set_approval_status && (
                <ActionBtn label="Approve" onClick={() => onSetApproval(d.drawing_set_name.trim())} />
              )}
              <ActionBtn label="→" title="Advance stage" onClick={() => onAdvance(d)} disabled={d.stage === "Released"} />
              <ActionBtn label="✕" onClick={() => onDelete(d.id)} danger />
            </div>
          </div>
        );
      })}
    </div>
  );
}
