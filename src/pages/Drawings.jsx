import React, { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { toast } from "sonner";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import ChevronPipeline from "@/components/shared/ChevronPipeline";
import SetApprovalModal from "@/components/drawings/SetApprovalModal";
import { batchProcess } from "@/utils/batchProcess";

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

// ─── Alert Banner ─────────────────────────────────────────────────────────────

function AlertBanner({ alert, onDismiss, onFilter }) {
  const [dismissed, setDismissed] = React.useState(false);
  if (dismissed) return null;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "10px 14px", borderRadius: 2,
      background: alert.bg,
      border: `1px solid ${alert.border}`,
      marginBottom: 8,
    }}>
      <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{alert.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: alert.color, letterSpacing: "0.04em", marginBottom: 2 }}>
          {alert.title}
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
          {alert.detail}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {onFilter && (
          <button onClick={() => onFilter(alert.sheets)} style={{
            ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.1em",
            padding: "4px 10px", borderRadius: 2, cursor: "pointer",
            background: "none", border: `1px solid ${alert.border}`,
            color: alert.color, whiteSpace: "nowrap",
          }}>SHOW</button>
        )}
        <button onClick={() => setDismissed(true)} style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--text-muted)", fontSize: 14, lineHeight: 1, padding: "2px 4px",
        }}>×</button>
      </div>
    </div>
  );
}

// ─── RFI Link Badge ───────────────────────────────────────────────────────────

function RFILinkBadge({ linkedIds, rfiMap }) {
  const navigate = useNavigate();
  if (!linkedIds) return null;
  const nums = linkedIds.split(",").map(s => s.trim()).filter(Boolean);
  if (nums.length === 0) return null;

  const openCount = nums.filter(n => {
    const rfi = rfiMap[n];
    return rfi && rfi.status !== "Closed" && rfi.status !== "Answered";
  }).length;
  const closedCount = nums.length - openCount;

  const goToRFI = (e, num) => {
    e.preventDefault();
    e.stopPropagation();
    const rfi = rfiMap[num];
    if (rfi?.id) navigate(`/RFIs?id=${rfi.id}`);
    else navigate(`/RFIs?search=${encodeURIComponent(num)}`);
  };

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
      <span style={{
        ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.06em",
        padding: "1px 6px", borderRadius: 2,
        background: openCount > 0 ? "rgba(245,158,11,0.12)" : "rgba(16,185,129,0.12)",
        border: `1px solid ${openCount > 0 ? "rgba(245,158,11,0.25)" : "rgba(16,185,129,0.25)"}`,
        color: openCount > 0 ? "var(--status-warning)" : "var(--status-success)",
      }}>
        {openCount > 0 ? `${openCount} OPEN RFI${openCount !== 1 ? "S" : ""}` : `${closedCount} RFI${closedCount !== 1 ? "S" : ""} RESOLVED`}
      </span>
      {nums.map(n => {
        const rfi = rfiMap[n];
        const isOpen = rfi && rfi.status !== "Closed" && rfi.status !== "Answered";
        return (
          <a
            key={n}
            href={rfi?.id ? `/RFIs?id=${rfi.id}` : `/RFIs?search=${encodeURIComponent(n)}`}
            onClick={(e) => goToRFI(e, n)}
            style={{
              ...mono, fontSize: 8, fontWeight: 700,
              color: isOpen ? "var(--status-warning)" : "var(--text-muted)",
              textDecoration: "underline",
              textDecorationStyle: "dotted",
              cursor: "pointer",
            }}
            title={`Open ${n} in RFIs`}
          >
            {n}
          </a>
        );
      })}
    </div>
  );
}

// ─── Superseded Badge ─────────────────────────────────────────────────────────

function SupersededBadge() {
  return (
    <span style={{
      ...mono, fontSize: 7, fontWeight: 700, letterSpacing: "0.1em",
      color: "var(--status-error)", background: "rgba(239,68,68,0.10)",
      border: "1px solid rgba(239,68,68,0.25)", borderRadius: 2,
      padding: "1px 5px", whiteSpace: "nowrap",
    }}>SUPERSEDED</span>
  );
}

// ─── Stage Pipeline ───────────────────────────────────────────────────────────

function StagePipeline({ drawings, onStageClick, activeStage }) {
  const released = drawings.filter(d => d.stage === "Released").length;
  const completedStages = [];
  // Mark stages as "completed" if all drawings past that stage
  let seenCurrent = false;
  const stageData = STAGES.slice(1).map(s => {
    const count = drawings.filter(d => d.stage === s.key).length;
    if (count > 0) seenCurrent = true;
    return { key: s.key, label: s.label, color: s.color, count };
  });
  // Find the most advanced stage with drawings
  let currentStage = null;
  for (let i = stageData.length - 1; i >= 0; i--) {
    if (stageData[i].count > 0) { currentStage = stageData[i].key; break; }
  }
  // Mark earlier stages as completed if released exists
  if (released > 0) {
    for (const s of stageData) {
      if (s.key === "Released") break;
      completedStages.push(s.key);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ChevronPipeline
        stages={stageData}
        currentStage={activeStage || currentStage}
        completedStages={completedStages}
        height={36}
        onStageClick={onStageClick}
      />
      {/* Legend row with counts */}
      <div style={{ display: "flex", gap: 4, justifyContent: "space-around" }}>
        {stageData.map(s => (
          <button
            key={s.key}
            onClick={() => onStageClick?.(s.key)}
            style={{
              background: activeStage === s.key ? `${s.color}20` : "none",
              border: activeStage === s.key ? `1px solid ${s.color}40` : "1px solid transparent",
              borderRadius: "var(--radius-badge)",
              padding: "2px 8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: s.color }}>{s.label}</span>
            <span style={{ ...mono, fontSize: 10, fontWeight: 800, color: s.count > 0 ? s.color : "var(--text-disabled)" }}>{s.count}</span>
          </button>
        ))}
      </div>
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

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: drawings = [], isLoading } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => projectId ? base44.entities.Drawing.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 30000,
  });

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () => projectId ? base44.entities.RFI.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 60000,
  });

  // ── RFI lookup map (for linking) ──────────────────────────────────────────
  const rfiMap = useMemo(() => {
    const map = {};
    rfis.forEach(r => { if (r.rfi_number) map[r.rfi_number] = r; });
    return map;
  }, [rfis]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidate = () => qc.invalidateQueries({ queryKey: ["drawings", projectId] });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Drawing.create({ ...data, project_id: projectId, project_name: activeProject?.name }),
    onSuccess: async (created) => {
      invalidate();
      toast.success("Sheet added");
      setShowModal(false);

      // Auto-create a ScheduleTask so drawing dates appear on the schedule
      if (created && (created.due_date || created.submitted_date)) {
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
    // Close the modal AND clear editing on success — leaving the modal
    // open while editing was cleared caused a second save click to route
    // into the create path with the edited row's id still in form state,
    // triggering a drawings_pkey duplicate.
    onSuccess: () => {
      invalidate();
      toast.success("Sheet updated");
      setEditing(null);
      setShowModal(false);
    },
    onError: (e) => toast.error("Failed to update: " + (e?.message || "unknown")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Drawing.delete(id),
    onSuccess: () => { invalidate(); toast.success("Sheet deleted"); setSelected(new Set()); },
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
    if (stageFilter !== "ALL") {
      if (stageFilter === "_overdue") list = list.filter(d => isOverdue(d));
      else if (stageFilter === "_inReview") list = list.filter(d => ["OFA", "BFA", "OFS", "BFS", "FFF"].includes(d.stage));
      else if (stageFilter === "_priority") list = list.filter(d => d.priority_flag);
      else list = list.filter(d => d.stage === stageFilter);
    }
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

  // ── Revision & Superseded Alerts ────────────────────────────────────────────

  const revisionAlerts = useMemo(() => {
    const alerts = [];
    const today = new Date();

    // 1. Unacknowledged revisions: revised (rev > 0) but no approval status
    const unacknowledged = drawings.filter(d =>
      Number(d.revision_number || 0) > 0 &&
      !d.set_approval_status &&
      d.stage !== "Released"
    );
    if (unacknowledged.length > 0) {
      alerts.push({
        type: "warning",
        icon: "⚠",
        title: `${unacknowledged.length} Unacknowledged Revision${unacknowledged.length !== 1 ? "s" : ""}`,
        detail: `${unacknowledged.map(d => d.sheet_number).slice(0, 5).join(", ")}${unacknowledged.length > 5 ? ` +${unacknowledged.length - 5} more` : ""} — revised but not yet reviewed/approved`,
        sheets: unacknowledged,
        color: "var(--status-warning)",
        bg: "rgba(245,158,11,0.08)",
        border: "rgba(245,158,11,0.25)",
      });
    }

    // 2. Superseded drawings still referenced
    const superseded = drawings.filter(d =>
      (d.is_superseded || d.set_approval_status === "superseded") &&
      d.stage !== "Released"
    );
    if (superseded.length > 0) {
      alerts.push({
        type: "danger",
        icon: "⛔",
        title: `${superseded.length} Superseded Drawing${superseded.length !== 1 ? "s" : ""} Still Active`,
        detail: `${superseded.map(d => d.sheet_number).slice(0, 5).join(", ")}${superseded.length > 5 ? ` +${superseded.length - 5} more` : ""} — marked superseded but not at IFC stage. Remove or replace.`,
        sheets: superseded,
        color: "var(--status-error)",
        bg: "rgba(239,68,68,0.06)",
        border: "rgba(239,68,68,0.25)",
      });
    }

    // 3. Drawings with linked RFIs that are still open
    const withOpenRFIs = drawings.filter(d => {
      if (!d.linked_rfi_ids) return false;
      const rfiNums = d.linked_rfi_ids.split(",").map(s => s.trim());
      return rfiNums.some(num => {
        const rfi = rfiMap[num];
        return rfi && rfi.status !== "Closed" && rfi.status !== "Answered";
      });
    });
    if (withOpenRFIs.length > 0) {
      alerts.push({
        type: "info",
        icon: "🔗",
        title: `${withOpenRFIs.length} Drawing${withOpenRFIs.length !== 1 ? "s" : ""} Blocked by Open RFIs`,
        detail: `${withOpenRFIs.map(d => d.sheet_number).slice(0, 5).join(", ")}${withOpenRFIs.length > 5 ? ` +${withOpenRFIs.length - 5} more` : ""} — linked RFIs still unresolved`,
        sheets: withOpenRFIs,
        color: "var(--status-info)",
        bg: "rgba(59,130,246,0.06)",
        border: "rgba(59,130,246,0.25)",
      });
    }

    // 4. Rejected drawings needing resubmission
    const rejected = drawings.filter(d => d.set_approval_status === "rejected");
    if (rejected.length > 0) {
      alerts.push({
        type: "danger",
        icon: "✕",
        title: `${rejected.length} Rejected Drawing${rejected.length !== 1 ? "s" : ""} Need Resubmission`,
        detail: `${rejected.map(d => d.sheet_number).slice(0, 5).join(", ")}${rejected.length > 5 ? ` +${rejected.length - 5} more` : ""}`,
        sheets: rejected,
        color: "var(--status-error)",
        bg: "rgba(239,68,68,0.06)",
        border: "rgba(239,68,68,0.25)",
      });
    }

    return alerts;
  }, [drawings, rfiMap]);

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

  const handleBulkStageApply = async () => {
    if (!bulkStage || selected.size === 0) return;
    const ids = [...selected];
    const { succeeded, failed } = await batchProcess(
      ids,
      (id) => base44.entities.Drawing.update(id, { stage: bulkStage }),
    );
    invalidate();
    if (failed.length > 0) {
      toast.warning(`${succeeded.length} updated, ${failed.length} failed`);
    } else {
      setSelected(new Set());
      setBulkStage("");
      toast.success(`Updated ${succeeded.length} sheets`);
    }
  };

  const handleSetApproval = async ({ status, revision, approvedBy, approvalDate, applyToSheets, notes }) => {
    if (!approvalSet) return;
    setSavingApproval(true);
    try {
      const sheetsToUpdate = applyToSheets ? approvalSet.sheets : [approvalSet.sheets[0]];
      const { succeeded, failed } = await batchProcess(
        sheetsToUpdate,
        (s) => base44.entities.Drawing.update(s.id, {
          set_approval_status: status,
          set_approved_date: approvalDate || new Date().toISOString().split("T")[0],
          ...(revision ? { revision_number: revision } : {}),
          ...(notes ? { notes: (s.notes ? s.notes + "\n" : "") + `[${status.toUpperCase()}] ${notes}` } : {}),
        }),
      );
      invalidate();
      if (failed.length > 0) {
        toast.warning(`${succeeded.length} sheets updated, ${failed.length} failed`);
      } else {
        toast.success(`Set "${approvalSet.setName}" marked as ${status}`);
      }
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

      {/* ── Stats Bar (clickable filters) ─────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 20 }}>
        {[
          { label: "TOTAL SHEETS", value: stats.total, color: "var(--text-primary)", filterKey: null },
          { label: "IFC / RELEASED", value: stats.released, color: "#10B981", filterKey: "Released" },
          { label: "IN REVIEW", value: stats.inReview, color: "#3B82F6", filterKey: "_inReview" },
          { label: "OVERDUE", value: stats.overdue, color: "var(--status-error)", filterKey: "_overdue" },
          { label: "PRIORITY", value: stats.priority, color: "var(--accent)", filterKey: "_priority" },
        ].map(s => {
          const isActive = s.filterKey && stageFilter === s.filterKey;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                if (!s.filterKey) return;
                setStageFilter(prev => prev === s.filterKey ? "ALL" : s.filterKey);
              }}
              style={{
                ...surface,
                padding: "12px 16px",
                cursor: s.filterKey ? "pointer" : "default",
                textAlign: "left",
                borderColor: isActive ? `${s.color}60` : undefined,
                boxShadow: isActive ? `0 0 12px ${s.color}20` : undefined,
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
            >
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", color: isActive ? s.color : "var(--text-muted)", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1, ...mono }}>{s.value}</div>
            </button>
          );
        })}
      </div>

      {/* ── Revision Control Alerts ─────────────────────────────────────────── */}
      {revisionAlerts.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", color: "var(--text-muted)", marginBottom: 6 }}>
            REVISION CONTROL — {revisionAlerts.length} ALERT{revisionAlerts.length !== 1 ? "S" : ""}
          </div>
          {revisionAlerts.map((alert, i) => (
            <AlertBanner
              key={i}
              alert={alert}
              onFilter={(sheets) => {
                const ids = new Set(sheets.map(s => s.id));
                setSelected(ids);
              }}
            />
          ))}
        </div>
      )}

      {/* ── Stage Pipeline ─────────────────────────────────────────────────── */}
      <ErrorBoundary label="Stage Pipeline">
        <div style={{ ...surface, padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", color: "var(--text-muted)", marginBottom: 10 }}>SUBMITTAL STAGE PIPELINE</div>
          <StagePipeline
            drawings={drawings}
            activeStage={stageFilter !== "ALL" && !stageFilter.startsWith("_") ? stageFilter : null}
            onStageClick={(key) => setStageFilter(prev => prev === key ? "ALL" : key)}
          />
        </div>
      </ErrorBoundary>

      {/* ── Discipline Chips ───────────────────────────────────────────────── */}
      <div className="filter-bar-responsive" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
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
      <div className="filter-bar-responsive" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
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

        {/* IFC Only toggle */}
        <button
          onClick={() => setStageFilter(prev => prev === "Released" ? "ALL" : "Released")}
          style={{
            ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
            padding: "6px 12px", borderRadius: "var(--radius-btn)", cursor: "pointer",
            background: stageFilter === "Released" ? "rgba(16,185,129,0.15)" : "none",
            border: `1px solid ${stageFilter === "Released" ? "rgba(16,185,129,0.35)" : "var(--border-default)"}`,
            color: stageFilter === "Released" ? "#10B981" : "var(--text-muted)",
            transition: "all 0.15s",
          }}
        >
          IFC ONLY
        </button>

        {/* View toggle */}
        <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", overflow: "hidden" }}>
          {["list", "grid"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              ...mono, fontSize: 10, fontWeight: 700, padding: "6px 12px", border: "none", cursor: "pointer",
              background: view === v ? "rgba(200,155,32,0.2)" : "none",
              color: view === v ? "var(--accent)" : "var(--text-muted)",
            }}>
              {v === "list" ? "\u2630 LIST" : "\u229E GRID"}
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
          <button style={btnGhost} onClick={async () => {
            if (!confirm(`Delete ${selected.size} sheets? This cannot be undone.`)) return;
            const ids = [...selected];
            const { succeeded, failed } = await batchProcess(ids, (id) => base44.entities.Drawing.delete(id));
            invalidate();
            if (failed.length > 0) {
              toast.warning(`${succeeded.length} deleted, ${failed.length} failed`);
            } else {
              setSelected(new Set());
              toast.success("Sheets deleted");
            }
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
            onSetApproval={openSetApproval}
            rfiMap={rfiMap} />
        ) : (
          <GridView drawings={filtered} selected={selected} onToggleSelect={toggleSelect}
            onEdit={d => { setEditing(d); setShowModal(true); }}
            onDelete={handleDelete} onAdvance={handleAdvanceStage}
            onView={d => navigate(`/DrawingViewer?id=${d.id}`)}
            onSetApproval={openSetApproval}
            rfiMap={rfiMap} />
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
            <ContextMenuItem key={item.label} label={item.label} onClick={item.action} danger={item.danger} />
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

function ListView({ drawings, selected, onToggleSelect, onToggleAll, onEdit, onDelete, onAdvance, onView, setContextMenu, onSetApproval, rfiMap }) {
  const allSelected = selected.size === drawings.length && drawings.length > 0;
  const thStyle = { ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", color: "var(--text-muted)", textTransform: "uppercase", padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap", background: "var(--bg-surface)" };
  const tdStyle = { padding: "10px 12px", borderBottom: "1px solid var(--divider)", verticalAlign: "middle" };

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
            const daysLate = overdue && d.due_date ? Math.max(1, Math.floor((new Date() - new Date(d.due_date)) / 86400000)) : 0;
            const urgencyClass = daysLate >= 14 ? "urgency-critical" : daysLate >= 7 ? "urgency-danger" : daysLate > 0 ? "urgency-warn" : "";
            return (
              <tr key={d.id}
                className={urgencyClass}
                onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, drawing: d }); }}
                style={{
                  background: isSel ? "rgba(200,155,32,0.06)" : overdue ? "rgba(239,68,68,0.04)" : "none",
                  cursor: "default",
                  borderLeft: overdue ? "4px solid var(--status-error)" : "4px solid transparent",
                }}>
                <td style={tdStyle}>
                  <input type="checkbox" checked={isSel} onChange={() => onToggleSelect(d.id)} style={{ cursor: "pointer" }} />
                </td>
                <td style={{ ...tdStyle, ...mono, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <PriorityDot active={d.priority_flag} />
                    <a
                      href={`/DrawingViewer?id=${d.id}`}
                      onClick={(e) => { e.preventDefault(); onView(d); }}
                      style={{
                        color: "var(--accent)",
                        textDecoration: "none",
                        cursor: "pointer",
                        borderBottom: "1px dotted rgba(200,155,32,0.4)",
                      }}
                      title="Open in viewer"
                    >
                      {d.sheet_number}
                    </a>
                  </div>
                </td>
                <td style={{ ...tdStyle, maxWidth: 280 }}>
                  <a
                    href={`/DrawingViewer?id=${d.id}`}
                    onClick={(e) => { e.preventDefault(); onView(d); }}
                    style={{
                      fontFamily: "var(--font-body)", fontSize: 13,
                      color: "var(--text-primary)", textDecoration: "none",
                      overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap", display: "block", cursor: "pointer",
                    }}
                    title="Open in viewer"
                  >
                    {d.title}
                  </a>
                  <RFILinkBadge linkedIds={d.linked_rfi_ids} rfiMap={rfiMap} />
                  {(d.is_superseded || d.set_approval_status === "superseded") && (
                    <div style={{ marginTop: 3 }}><SupersededBadge /></div>
                  )}
                </td>
                <td style={{ ...tdStyle, ...mono, fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{d.discipline}</td>
                <td style={{ ...tdStyle, ...mono, fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textAlign: "center" }}>R{d.revision_number ?? "0"}</td>
                <td style={{ ...tdStyle }}><StageChip stage={d.stage} /></td>
                <td style={{ ...tdStyle, ...mono, fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{d.submitted_date || "—"}</td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                  {overdue && daysLate > 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ ...mono, fontSize: 11, fontWeight: 800, color: "var(--status-error)" }}>
                        {daysLate}d late
                      </span>
                      <OverdueBadge />
                    </div>
                  ) : (
                    <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>{d.due_date || "\u2014"}</span>
                  )}
                </td>
                <td style={{ ...tdStyle, ...mono, fontSize: 10, color: "var(--text-muted)" }}>{d.reviewer || "—"}</td>
                <td style={{ ...tdStyle }}>
                  {d.set_approval_status ? (
                    <span style={{
                      ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 2,
                      color: d.set_approval_status === "approved" ? "#10B981" : d.set_approval_status === "rejected" ? "var(--status-error)" : "var(--text-muted)",
                      background: d.set_approval_status === "approved" ? "rgba(16,185,129,0.12)" : d.set_approval_status === "rejected" ? "rgba(239,68,68,0.12)" : "var(--bg-surface-high)",
                      border: `1px solid ${d.set_approval_status === "approved" ? "rgba(16,185,129,0.25)" : d.set_approval_status === "rejected" ? "rgba(239,68,68,0.25)" : "var(--border-default)"}`,
                      textTransform: "uppercase",
                    }}>
                      {d.set_approval_status}
                    </span>
                  ) : d.drawing_set_name?.trim() ? (
                    <button onClick={() => onSetApproval(d.drawing_set_name.trim())} style={{
                      ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 2,
                      background: "none", border: "1px dashed var(--border-strong)", color: "var(--text-muted)", cursor: "pointer",
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

function ActionBtn({ label, onClick, danger, disabled, title, primary }) {
  const [hovered, setHovered] = React.useState(false);
  const baseColor = primary ? "var(--accent)" : danger ? "var(--status-error)" : "var(--text-muted)";
  const hoverBg = primary ? "rgba(200,155,32,0.12)" : danger ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.04)";
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        ...mono, fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: 2,
        border: `1px solid ${hovered && !disabled ? baseColor + "60" : danger ? "rgba(239,68,68,0.3)" : "var(--border-default)"}`,
        background: hovered && !disabled ? hoverBg : "none",
        color: baseColor,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.3 : 1, whiteSpace: "nowrap",
        transition: "all 0.15s",
      }}>
      {label}
    </button>
  );
}

// ─── Context Menu Item ────────────────────────────────────────────────────────

function ContextMenuItem({ label, onClick, danger }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: "block", width: "100%", textAlign: "left", padding: "8px 16px",
        background: hovered ? (danger ? "rgba(239,68,68,0.08)" : "var(--hover-bg)") : "none",
        border: "none", cursor: "pointer", ...mono, fontSize: 10,
        fontWeight: 700, letterSpacing: "0.08em",
        color: danger ? "var(--status-error)" : "var(--text-primary)",
        transition: "background 0.1s",
      }}>{label}</button>
  );
}

// ─── Grid View ────────────────────────────────────────────────────────────────

function GridView({ drawings, selected, onToggleSelect, onEdit, onDelete, onAdvance, onView, onSetApproval, rfiMap }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
      {drawings.map(d => {
        const overdue = isOverdue(d);
        const isSel = selected.has(d.id);
        const stage = STAGE_MAP[d.stage] || STAGE_MAP["Not Started"];
        return (
          <div key={d.id}
            style={{ background: "var(--bg-surface)", border: `1px solid ${isSel ? "var(--accent)" : "var(--border-default)"}`, borderRadius: 2, overflow: "hidden", cursor: "pointer", position: "relative", transition: "border-color 0.15s" }}
            onDoubleClick={() => onView(d)}>
            {/* Stage color strip */}
            <div style={{ height: 3, background: stage.color }} />

            {/* Priority indicator */}
            {d.priority_flag && <div style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", background: "var(--status-error)" }} />}

            <div style={{ padding: "12px 14px" }} onClick={() => onToggleSelect(d.id)}>
              {/* Sheet number — clickable link to viewer */}
              <a
                href={`/DrawingViewer?id=${d.id}`}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onView(d); }}
                style={{ ...mono, fontSize: 15, fontWeight: 800, color: "var(--accent)", textDecoration: "none", letterSpacing: "-0.01em", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
                title="Open in viewer"
              >
                {d.sheet_number}
              </a>

              {/* Title — clickable link to viewer */}
              <a
                href={`/DrawingViewer?id=${d.id}`}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onView(d); }}
                style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", textDecoration: "none", marginBottom: 10, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.4 }}
                title="Open in viewer"
              >
                {d.title}
              </a>

              {/* Stage + Rev + Badges */}
              <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                <StageChip stage={d.stage} />
                <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>R{d.revision_number ?? "0"}</span>
                {overdue && <OverdueBadge />}
                {(d.is_superseded || d.set_approval_status === "superseded") && <SupersededBadge />}
              </div>

              {/* RFI Links */}
              <RFILinkBadge linkedIds={d.linked_rfi_ids} rfiMap={rfiMap} />

              {/* Due date */}
              {d.due_date && (
                <div style={{ ...mono, fontSize: 9, color: overdue ? "var(--status-error)" : "var(--text-muted)", marginTop: 4 }}>
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
                    background: d.set_approval_status === "approved" ? "rgba(16,185,129,0.12)" : d.set_approval_status === "rejected" ? "rgba(239,68,68,0.12)" : "var(--bg-surface-high)",
                    border: `1px solid ${d.set_approval_status === "approved" ? "rgba(16,185,129,0.25)" : d.set_approval_status === "rejected" ? "rgba(239,68,68,0.25)" : "var(--border-default)"}`,
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
