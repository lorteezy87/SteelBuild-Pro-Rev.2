import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { differenceInDays } from "date-fns";
import { Plus, RefreshCw, Search, CheckCircle2, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { toast } from "sonner";
import { parseUTCDate, formatDate } from "@/components/shared/formatters";
import { getNextFormattedNumber, previewNextFormattedNumber } from "@/components/shared/numberSequencing";

const mono = { fontFamily: "var(--font-mono)" };

// ── BIC config ──
const BIC = {
  Contractor: { color: "var(--accent)", bg: "var(--accent-muted)" },
  GC:         { color: "var(--accent)",        bg: "var(--accent-muted)" },
  Engineer:   { color: "var(--status-warning)", bg: "var(--warning-muted)" },
  Architect:  { color: "var(--status-success)", bg: "var(--success-muted)" },
  Owner:      { color: "var(--status-error)",   bg: "var(--danger-muted)" },
};

// ── Priority config ──
const PRIO = {
  Critical: { color: "var(--status-error)",   bg: "var(--danger-muted)",  order: 0 },
  High:     { color: "var(--status-warning)",  bg: "var(--warning-muted)", order: 1 },
  Medium:   { color: "var(--accent)",          bg: "var(--accent-muted)",  order: 2 },
  Low:      { color: "var(--text-muted)",       bg: "var(--hover-bg)",      order: 3 },
};

function isOpenStatus(status) {
  return status === "Open" || status === "Under Review";
}

function isClosedStatus(status) {
  return status === "Answered" || status === "Closed";
}

// ── Status Badge ──
function StatusBadge({ status }) {
  const map = {
    Open:         { label: "OPEN",       color: "var(--accent)",          bg: "var(--accent-muted)" },
    "Under Review":{ label: "IN REVIEW", color: "var(--status-warning)",  bg: "var(--warning-muted)" },
    Answered:     { label: "ANSWERED",   color: "var(--status-success)",  bg: "var(--success-muted)" },
    Closed:       { label: "CLOSED",     color: "var(--text-muted)",       bg: "var(--hover-bg)" },
  };
  const cfg = map[status] || map.Open;
  return (
    <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: "2px 7px", borderRadius: 2, textTransform: "uppercase", letterSpacing: "0.08em" }}>
      {cfg.label}
    </span>
  );
}

// ── Urgency Badge ──
function UrgencyBadge({ daysLeft, status }) {
  if (isClosedStatus(status) || daysLeft === null) return null;
  let color, label;
  if (daysLeft < 0) { color = "var(--status-error)"; label = `${Math.abs(daysLeft)}D OVERDUE`; }
  else if (daysLeft === 0) { color = "var(--status-error)"; label = "DUE TODAY"; }
  else if (daysLeft <= 3) { color = "var(--status-warning)"; label = `DUE IN ${daysLeft}D`; }
  else return null;
  return (
    <span style={{ ...mono, fontSize: 8, fontWeight: 700, color, background: color + "18", padding: "2px 7px", borderRadius: 2, textTransform: "uppercase", letterSpacing: "0.08em" }}>
      ⚠ {label}
    </span>
  );
}

// ── RFI Row ──
function RFIRow({ rfi, onSelect, selected }) {
  const prioCfg = PRIO[rfi.priority] || PRIO.Medium;
  const bicCfg = BIC[rfi.ball_in_court] || { color: "var(--text-muted)", bg: "var(--hover-bg)" };
  const due = rfi.date_required ? parseUTCDate(rfi.date_required) : null;
  const daysLeft = due ? differenceInDays(due, new Date()) : null;
  const isOverdue = daysLeft !== null && daysLeft < 0 && !isClosedStatus(rfi.status);

  return (
    <div
      onClick={() => onSelect(rfi)}
      style={{
        display: "grid",
        gridTemplateColumns: "100px 1fr 90px 100px 100px 110px",
        gap: 12,
        padding: "10px 16px",
        alignItems: "center",
        borderBottom: "1px solid var(--divider)",
        borderLeft: `3px solid ${isOverdue ? "var(--status-error)" : selected ? "var(--accent)" : prioCfg.color + "60"}`,
        background: selected ? "rgba(173,198,255,0.06)" : isOverdue ? "rgba(255,180,171,0.03)" : "transparent",
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--bg-row-hover)"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = isOverdue ? "rgba(255,180,171,0.03)" : "transparent"; }}
    >
      {/* RFI # */}
      <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--accent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {rfi.rfi_number || "—"}
      </div>

      {/* Title + project */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: isClosedStatus(rfi.status) ? "var(--text-muted)" : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 1 }}>
          {rfi.title}
        </div>
        {rfi.project_name && (
          <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)" }}>{rfi.project_name}</div>
        )}
      </div>

      {/* Priority */}
      <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: prioCfg.color, background: prioCfg.bg, padding: "2px 7px", borderRadius: 2, textTransform: "uppercase" }}>
        {rfi.priority}
      </span>

      {/* Status */}
      <StatusBadge status={rfi.status} />

      {/* Due */}
      <div>
        <UrgencyBadge daysLeft={daysLeft} status={rfi.status} />
        {daysLeft !== null && daysLeft > 3 && !isClosedStatus(rfi.status) && (
          <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>{formatDate(rfi.date_required)}</span>
        )}
        {daysLeft === null && <span style={{ ...mono, fontSize: 9, color: "var(--text-faint, var(--text-muted))" }}>—</span>}
      </div>

      {/* BIC */}
      {rfi.ball_in_court ? (
        <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: bicCfg.color, background: bicCfg.bg, padding: "2px 7px", borderRadius: 2, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", maxWidth: 100 }}>
          {rfi.ball_in_court}
        </span>
      ) : (
        <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>—</span>
      )}
    </div>
  );
}

// ── Detail Panel ──
function RFIDetailPanel({ rfi, onClose, onStatusChange }) {
  const qc = useQueryClient();
  const [editingAnswer, setEditingAnswer] = useState(false);
  const [answerText, setAnswerText] = useState(rfi.answer || "");

  const updateMut = useMutation({
    mutationFn: (data) => base44.entities.RFI.update(rfi.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rfis"] }); onStatusChange?.(); },
  });

  const prioCfg = PRIO[rfi.priority] || PRIO.Medium;
  const bicCfg = BIC[rfi.ball_in_court] || {};
  const due = rfi.date_required ? parseUTCDate(rfi.date_required) : null;
  const daysLeft = due ? differenceInDays(due, new Date()) : null;

  return (
    <div style={{ width: 440, borderLeft: "1px solid var(--divider)", display: "flex", flexDirection: "column", background: "var(--bg-surface)", overflow: "hidden", flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-secondary)", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
          <div>
            <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--accent)", marginBottom: 3, letterSpacing: "0.06em" }}>{rfi.rfi_number || "—"}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.3, fontFamily: "Space Grotesk, var(--font-display), sans-serif" }}>{rfi.title}</div>
            {rfi.project_name && <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 3 }}>{rfi.project_name}</div>}
          </div>
          <button onClick={onClose} style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <StatusBadge status={rfi.status} />
          <UrgencyBadge daysLeft={daysLeft} status={rfi.status} />
          <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: prioCfg.color, background: prioCfg.bg, padding: "2px 7px", borderRadius: 2, textTransform: "uppercase" }}>{rfi.priority}</span>
          {rfi.ball_in_court && <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: bicCfg.color || "var(--text-muted)", background: bicCfg.bg || "var(--hover-bg)", padding: "2px 7px", borderRadius: 2, textTransform: "uppercase" }}>⚑ {rfi.ball_in_court}</span>}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {/* Status quick-change */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>Set Status</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {["Open", "Under Review", "Answered", "Closed"].map(s => (
              <button key={s} onClick={() => {
                updateMut.mutate({ status: s, ...(s === "Answered" || s === "Closed" ? { date_answered: new Date().toISOString().split("T")[0] } : {}) });
                toast.success(`Status → ${s}`);
              }} style={{
                padding: "5px 10px", borderRadius: 2,
                border: `1px solid ${rfi.status === s ? "var(--accent)" : "var(--border-default)"}`,
                background: rfi.status === s ? "var(--accent-muted)" : "transparent",
                color: rfi.status === s ? "var(--accent)" : "var(--text-muted)",
                ...mono, fontSize: 9, fontWeight: 700, cursor: "pointer", textTransform: "uppercase",
              }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Meta grid */}
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", rowGap: 10, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--divider)" }}>
          {[
            ["RFI #", rfi.rfi_number || "—"],
            ["Date Required", rfi.date_required ? formatDate(rfi.date_required) : "—"],
            ["Submitted By", rfi.submitted_by || "—"],
            ["Submitted", rfi.submitted_date ? formatDate(rfi.submitted_date) : "—"],
            ["Drawing Ref", rfi.drawing_reference || "—"],
            ["Spec Section", rfi.spec_section || "—"],
            ["Assigned To", rfi.assigned_to || "—"],
            ["Ball in Court", rfi.ball_in_court || "—"],
          ].map(([label, value]) => (
            <React.Fragment key={label}>
              <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", paddingTop: 2 }}>{label}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{value}</div>
            </React.Fragment>
          ))}
        </div>

        {/* Description / Question */}
        {rfi.description && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 7 }}>Description</div>
            <div style={{ fontSize: 12.5, color: "var(--text-primary)", lineHeight: 1.6, background: "var(--bg-surface-low, var(--hover-bg))", padding: "10px 12px", borderRadius: 2, borderLeft: "3px solid var(--accent)" }}>
              {rfi.description}
            </div>
          </div>
        )}

        {/* Answer */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
            <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Response / Answer</div>
            {!editingAnswer && (
              <button onClick={() => setEditingAnswer(true)} style={{ ...mono, fontSize: 9, color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>
                {rfi.answer ? "Edit" : "+ Add Response"}
              </button>
            )}
          </div>
          {editingAnswer ? (
            <div>
              <textarea
                value={answerText}
                onChange={e => setAnswerText(e.target.value)}
                autoFocus
                placeholder="Enter official response..."
                style={{ width: "100%", minHeight: 90, background: "var(--bg-input)", border: "1px solid var(--accent)", borderRadius: 2, padding: "10px 12px", fontSize: 12.5, color: "var(--text-primary)", outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                <button onClick={() => {
                  updateMut.mutate({ answer: answerText });
                  setEditingAnswer(false);
                  toast.success("Response saved");
                }} style={{ background: "var(--accent)", color: "var(--accent-text)", border: "none", borderRadius: 2, padding: "6px 14px", ...mono, fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
                  Save
                </button>
                <button onClick={() => { setEditingAnswer(false); setAnswerText(rfi.answer || ""); }}
                  style={{ background: "var(--hover-bg)", color: "var(--text-muted)", border: "1px solid var(--border-default)", borderRadius: 2, padding: "6px 14px", ...mono, fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : rfi.answer ? (
            <div style={{ fontSize: 12.5, color: "var(--text-primary)", lineHeight: 1.6, background: "var(--success-muted)", padding: "10px 12px", borderRadius: 2, borderLeft: "3px solid var(--status-success)" }}>
              {rfi.answer}
            </div>
          ) : (
            <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "12px", border: "1px dashed var(--border-default)", borderRadius: 2, textAlign: "center" }}>
              NO RESPONSE YET
            </div>
          )}
        </div>

        {/* BIC quick-set */}
        <div>
          <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>Ball in Court</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {Object.keys(BIC).map(party => (
              <button key={party} onClick={() => { updateMut.mutate({ ball_in_court: party }); toast.success(`BIC → ${party}`); }}
                style={{
                  padding: "5px 10px", borderRadius: 2,
                  border: `1px solid ${rfi.ball_in_court === party ? BIC[party].color : "var(--border-default)"}`,
                  background: rfi.ball_in_court === party ? BIC[party].bg : "transparent",
                  color: rfi.ball_in_court === party ? BIC[party].color : "var(--text-muted)",
                  ...mono, fontSize: 9, fontWeight: 700, cursor: "pointer", textTransform: "uppercase",
                }}>
                {party}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      {!isClosedStatus(rfi.status) && (
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--divider)", display: "flex", gap: 8, flexShrink: 0, background: "var(--bg-surface-secondary)" }}>
          <button onClick={() => { updateMut.mutate({ status: "Answered", date_answered: new Date().toISOString().split("T")[0] }); toast.success("RFI marked Answered"); }}
            style={{ flex: 1, padding: "8px", background: "var(--success-muted)", border: "1px solid var(--success-border)", borderRadius: 2, color: "var(--status-success)", ...mono, fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <CheckCircle2 size={14} /> Mark Answered
          </button>
          <button onClick={() => { updateMut.mutate({ status: "Under Review" }); toast.success("Status → Under Review"); }}
            style={{ padding: "8px 14px", background: "var(--hover-bg)", border: "1px solid var(--border-default)", borderRadius: 2, color: "var(--text-muted)", ...mono, fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
            In Review
          </button>
        </div>
      )}
    </div>
  );
}

// ── New RFI Modal ──
function NewRFIModal({ projects, onClose, onSave, isSaving = false }) {
  const [form, setForm] = useState({ project_id: "", title: "", priority: "High", date_required: "", description: "", drawing_reference: "", ball_in_court: "GC", submitted_by: "", assigned_to: "" });
  const [numberPreview, setNumberPreview] = useState("");
  const saving = isSaving;

  React.useEffect(() => {
    let cancelled = false;

    const loadPreview = async () => {
      if (!form.project_id) {
        setNumberPreview("");
        return;
      }
      try {
        const nextNumber = await previewNextFormattedNumber({
          projectId: form.project_id,
          recordType: "RFI",
          entityName: "RFI",
          fieldName: "rfi_number",
          prefix: "RFI #",
        });
        if (!cancelled) setNumberPreview(nextNumber || "");
      } catch {
        if (!cancelled) setNumberPreview("");
      }
    };

    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [form.project_id]);

  const iStyle = { width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", color: "var(--text-primary)", borderRadius: 2, padding: "8px 12px", fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  const labelStyle = { ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", display: "block", marginBottom: 5 };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    const selectedProject = projects.find(p => p.id === form.project_id);
    await onSave?.({
      ...form,
      project_name: selectedProject?.name || "",
      status: "Open",
      submitted_date: new Date().toISOString().split("T")[0],
    });
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
      onClick={e => { if (e.target === e.currentTarget && !isSaving) onClose(); }}>
      <div style={{ width: 580, maxHeight: "90vh", overflowY: "auto", background: "var(--bg-surface)", border: "1px solid var(--border-strong)", borderRadius: 4 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "Space Grotesk, var(--font-display), sans-serif", fontSize: 15, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>NEW RFI</div>
            <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", marginTop: 2 }}>Request for Information</div>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", fontSize: 20 }}>×</button>
        </div>
        <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={labelStyle}>RFI Number</label>
            <input style={{ ...iStyle, opacity: 0.7, cursor: "not-allowed" }} value={numberPreview || "Select project to preview"} disabled readOnly />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>RFI Subject *</label>
            <input style={iStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required placeholder="e.g. Beam connection detail at Grid C-4" />
          </div>
          <div>
            <label style={labelStyle}>Project</label>
            <select style={iStyle} value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Priority</label>
            <select style={iStyle} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
              {["Critical", "High", "Medium", "Low"].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date Required</label>
            <input type="date" style={iStyle} value={form.date_required} onChange={e => setForm(f => ({ ...f, date_required: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Drawing Reference</label>
            <input style={iStyle} value={form.drawing_reference} onChange={e => setForm(f => ({ ...f, drawing_reference: e.target.value }))} placeholder="e.g. S-201, Rev 3" />
          </div>
          <div>
            <label style={labelStyle}>Ball in Court</label>
            <select style={iStyle} value={form.ball_in_court} onChange={e => setForm(f => ({ ...f, ball_in_court: e.target.value }))}>
              {Object.keys(BIC).map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Submitted By</label>
            <input style={iStyle} value={form.submitted_by} onChange={e => setForm(f => ({ ...f, submitted_by: e.target.value }))} placeholder="Name or email" />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Description / Question</label>
            <textarea style={{ ...iStyle, minHeight: 80, resize: "vertical", lineHeight: 1.6 }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the issue or question clearly..." />
          </div>
          <div style={{ gridColumn: "span 2", display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid var(--divider)" }}>
            <button type="button" onClick={onClose} disabled={isSaving} style={{ background: "var(--hover-bg)", border: "1px solid var(--border-default)", borderRadius: 2, padding: "8px 20px", color: "var(--text-muted)", ...mono, fontSize: 10, fontWeight: 700, cursor: isSaving ? "not-allowed" : "pointer", textTransform: "uppercase", opacity: isSaving ? 0.5 : 1 }}>Cancel</button>
            <button type="button" onClick={handleSubmit} disabled={isSaving || !form.title.trim()} style={{ background: "var(--accent)", color: "var(--accent-text)", border: "none", borderRadius: 2, padding: "8px 24px", ...mono, fontSize: 10, fontWeight: 700, cursor: isSaving ? "not-allowed" : "pointer", textTransform: "uppercase", letterSpacing: "0.08em", opacity: isSaving || !form.title.trim() ? 0.4 : 1 }}>
              {saving ? "CREATING…" : "CREATE RFI"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──
export default function RFIHub() {
  const qc = useQueryClient();
  const [selectedRFI, setSelectedRFI] = useState(null);
  const [showNewRFI, setShowNewRFI] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [expandedProjects, setExpandedProjects] = useState(new Set(["__all"]));
  const [statsOpen, setStatsOpen] = useState(true);

  const { data: rfis = [], isLoading, refetch } = useQuery({
    queryKey: ["rfis", "hub"],
    queryFn: () => base44.entities.RFI.list("-submitted_date", 500),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });

  const createMut = useMutation({
    mutationFn: async (data) => {
      const selectedProject = projects.find((project) => project.id === data.project_id);
      let rfiNumber;
      if (data.project_id) {
        rfiNumber = await getNextFormattedNumber({
          projectId: data.project_id,
          recordType: "RFI",
          entityName: "RFI",
          fieldName: "rfi_number",
          prefix: "RFI #",
        });
      } else {
        // No project — scan ALL RFIs to find the global max number
        const allRFIs = await base44.entities.RFI.list();
        const maxNum = (allRFIs || []).reduce((max, r) => {
          const m = String(r.rfi_number || "").match(/(\d+)(?!.*\d)/);
          return m ? Math.max(max, Number(m[1])) : max;
        }, 0);
        rfiNumber = `RFI #${String(maxNum + 1).padStart(3, "0")}`;
      }
      return base44.entities.RFI.create({
        ...data,
        project_name: selectedProject?.name || data.project_name || "",
        rfi_number: rfiNumber,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rfis"] });
      toast.success("RFI created");
    },
  });

  const now = new Date();

  // KPIs
  const kpis = useMemo(() => {
    const open = rfis.filter(r => r.status === "Open").length;
    const underReview = rfis.filter(r => r.status === "Under Review").length;
    const answered = rfis.filter(r => isClosedStatus(r.status)).length;
    const overdue = rfis.filter(r => {
      if (isClosedStatus(r.status)) return false;
      const d = r.date_required ? parseUTCDate(r.date_required) : null;
      return d && d < now;
    }).length;
    const dueToday = rfis.filter(r => {
      if (isClosedStatus(r.status)) return false;
      const d = r.date_required ? parseUTCDate(r.date_required) : null;
      return d && differenceInDays(d, now) === 0;
    }).length;
    const due3 = rfis.filter(r => {
      if (isClosedStatus(r.status)) return false;
      const d = r.date_required ? parseUTCDate(r.date_required) : null;
      if (!d) return false;
      const diff = differenceInDays(d, now);
      return diff > 0 && diff <= 3;
    }).length;
    return { total: rfis.length, open, underReview, overdue, dueToday, due3, answered };
  }, [rfis]);

  // Filtered + sorted
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rfis.filter(r => {
      if (statusFilter === "open" && isClosedStatus(r.status)) return false;
      if (statusFilter === "answered" && !isClosedStatus(r.status)) return false;
      if (statusFilter === "review" && r.status !== "Under Review") return false;
      if (priorityFilter !== "all" && r.priority !== priorityFilter) return false;
      if (projectFilter !== "all" && r.project_id !== projectFilter) return false;
      if (q && !(
        r.rfi_number?.toLowerCase().includes(q) ||
        r.title?.toLowerCase().includes(q) ||
        r.project_name?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q)
      )) return false;
      return true;
    }).sort((a, b) => {
      const aOD = a.date_required && parseUTCDate(a.date_required) < now && !isClosedStatus(a.status);
      const bOD = b.date_required && parseUTCDate(b.date_required) < now && !isClosedStatus(b.status);
      if (aOD && !bOD) return -1;
      if (!aOD && bOD) return 1;
      const po = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      const pa = po[a.priority] ?? 2, pb = po[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      if (a.date_required && b.date_required) return parseUTCDate(a.date_required) - parseUTCDate(b.date_required);
      return 0;
    });
  }, [rfis, statusFilter, priorityFilter, projectFilter, search]);

  // Group by project
  const grouped = useMemo(() => {
    const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
    const groups = {};
    filtered.forEach(r => {
      const key = r.project_id || "__none";
      if (!groups[key]) groups[key] = { project: projectMap[key] || null, rfis: [] };
      groups[key].rfis.push(r);
    });
    return Object.entries(groups).sort(([, a], [, b]) => {
      const aOD = a.rfis.filter(r => r.date_required && parseUTCDate(r.date_required) < now && !isClosedStatus(r.status)).length;
      const bOD = b.rfis.filter(r => r.date_required && parseUTCDate(r.date_required) < now && !isClosedStatus(r.status)).length;
      return bOD - aOD;
    });
  }, [filtered, projects]);

  const toggleProject = (key) => {
    setExpandedProjects(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 68px)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-secondary)", flexShrink: 0 }}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <h1 style={{ fontFamily: "Space Grotesk, var(--font-display), sans-serif", fontSize: 20, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em", margin: 0 }}>RFI HUB</h1>
            <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.14em", marginTop: 3 }}>REQUEST FOR INFORMATION · {rfis.length} TOTAL</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStatsOpen(v => !v)}
              title={statsOpen ? "Hide stats to maximise table" : "Show stats"}
              style={{ background: "var(--hover-bg)", border: "1px solid var(--border-default)", borderRadius: 2, padding: "7px 12px", color: statsOpen ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, ...mono, fontSize: 9, fontWeight: 700 }}>
              {statsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} STATS
            </button>
            <button onClick={() => refetch()} style={{ background: "var(--hover-bg)", border: "1px solid var(--border-default)", borderRadius: 2, padding: "7px 10px", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center" }}>
              <RefreshCw size={14} />
            </button>
            <button onClick={() => setShowNewRFI(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", background: "var(--accent)", color: "var(--accent-text)", border: "none", borderRadius: 2, ...mono, fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <Plus size={14} /> NEW RFI
            </button>
          </div>
        </div>

        {/* KPI strip — collapsible */}
        {statsOpen && <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "var(--divider)", border: "1px solid var(--divider)", borderRadius: 2, overflow: "hidden", marginBottom: 12 }}>
          {[
            { label: "Total",      value: kpis.total,      color: "var(--text-primary)",    filter: null },
            { label: "Open",       value: kpis.open,        color: "var(--accent)",           filter: "open" },
            { label: "In Review",  value: kpis.underReview, color: "var(--status-warning)",   filter: "review" },
            { label: "Overdue",    value: kpis.overdue,     color: kpis.overdue > 0 ? "var(--status-error)" : "var(--text-muted)",   urgent: kpis.overdue > 0, filter: "open" },
            { label: "Due Today",  value: kpis.dueToday,    color: kpis.dueToday > 0 ? "var(--status-error)" : "var(--text-muted)",  filter: "open" },
            { label: "Due ≤3 Days",value: kpis.due3,        color: kpis.due3 > 0 ? "var(--status-warning)" : "var(--text-muted)",    filter: "open" },
            { label: "Answered",   value: kpis.answered,    color: "var(--status-success)",   filter: "answered" },
          ].map((k, i) => {
            const isActive = k.filter && statusFilter === k.filter;
            return (
              <div key={i} onClick={() => k.filter && setStatusFilter(isActive ? "all" : k.filter)}
                title={k.filter ? (isActive ? "Click to clear filter" : `Filter by ${k.label}`) : undefined}
                style={{ padding: "10px 12px", background: isActive ? "var(--accent-muted)" : "var(--bg-surface)", cursor: k.filter ? "pointer" : "default", borderTop: k.urgent ? "2px solid var(--status-error)" : isActive ? "2px solid var(--accent)" : "2px solid transparent", transition: "background 0.1s" }}
                onMouseEnter={e => { if (k.filter && !isActive) e.currentTarget.style.background = "var(--hover-bg)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = isActive ? "var(--accent-muted)" : "var(--bg-surface)"; }}>
                <div style={{ ...mono, fontSize: 7, fontWeight: 700, color: isActive ? "var(--accent)" : "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 5 }}>{k.label}</div>
                <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</div>
              </div>
            );
          })}
        </div>}

        {/* Search + filters */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "var(--text-muted)" }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search RFIs..."
              style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 2, padding: "7px 12px 7px 32px", fontSize: 12, color: "var(--text-primary)", outline: "none", boxSizing: "border-box" }} />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 2, padding: "7px 10px", fontSize: 11, color: "var(--text-primary)", outline: "none", ...mono, cursor: "pointer" }}>
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="review">In Review</option>
            <option value="answered">Answered/Closed</option>
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 2, padding: "7px 10px", fontSize: 11, color: "var(--text-primary)", outline: "none", ...mono, cursor: "pointer" }}>
            <option value="all">All Priority</option>
            {["Critical", "High", "Medium", "Low"].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 2, padding: "7px 10px", fontSize: 11, color: "var(--text-primary)", outline: "none", ...mono, cursor: "pointer" }}>
            <option value="all">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {(search || statusFilter !== "all" || priorityFilter !== "all" || projectFilter !== "all") && (
            <button onClick={() => { setSearch(""); setStatusFilter("open"); setPriorityFilter("all"); setProjectFilter("all"); }}
              style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--status-warning)", background: "var(--warning-muted)", border: "1px solid var(--warning-border, var(--border-default))", borderRadius: 2, padding: "6px 12px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
              × Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 90px 100px 100px 110px", gap: 12, padding: "8px 16px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-secondary)", position: "sticky", top: 0, zIndex: 5 }}>
            {["RFI #", "Subject / Project", "Priority", "Status", "Due", "Ball in Court"].map(col => (
              <div key={col} style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{col}</div>
            ))}
          </div>

          {isLoading ? (
            <div style={{ padding: 40, textAlign: "center", ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em" }}>
              <RefreshCw size={20} style={{ display: "block", margin: "0 auto 12px", opacity: 0.4 }} /> LOADING…
            </div>
          ) : grouped.length === 0 ? (
            rfis.length === 0 && !search ? (
              /* Hero empty state — no RFIs exist yet */
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 0, padding: 40, textAlign: "center" }}>
                <FileText size={56} style={{ color: "var(--accent)", opacity: 0.25, marginBottom: 20 }} />
                <div style={{ fontFamily: "Space Grotesk, var(--font-display), sans-serif", fontSize: 18, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em", marginBottom: 10 }}>
                  No RFIs Yet
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 340, lineHeight: 1.6, marginBottom: 28 }}>
                  Track information requests, document answers, and keep the engineer on the clock. Create your first RFI to get started.
                </div>
                <button onClick={() => setShowNewRFI(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", background: "var(--accent)", color: "var(--accent-text)", border: "none", borderRadius: 3, ...mono, fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  <Plus size={15} /> Create First RFI
                </button>
              </div>
            ) : (
              /* Filter produced no results */
              <div style={{ padding: 60, textAlign: "center" }}>
                <FileText size={36} style={{ display: "block", margin: "0 auto 14px", color: "var(--text-muted)", opacity: 0.3 }} />
                <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 14 }}>
                  {search ? "NO RFIS MATCH YOUR SEARCH" : statusFilter === "open" ? "✓ ALL RFIS ANSWERED" : "NO RFIS MATCH FILTERS"}
                </div>
                <button onClick={() => { setSearch(""); setStatusFilter("all"); setPriorityFilter("all"); setProjectFilter("all"); }}
                  style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--accent)", background: "none", border: "1px solid var(--accent-border)", borderRadius: 2, padding: "5px 14px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Clear Filters
                </button>
              </div>
            )
          ) : grouped.map(([projKey, group]) => {
            const proj = group.project;
            const isExpanded = expandedProjects.has(projKey);
            const overdueCount = group.rfis.filter(r => r.date_required && parseUTCDate(r.date_required) < now && !isClosedStatus(r.status)).length;

            return (
              <div key={projKey}>
                {/* Project group header */}
                <div onClick={() => toggleProject(projKey)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface)", cursor: "pointer", position: "sticky", top: 34, zIndex: 4 }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--hover-bg)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-surface)"; }}>
                  {isExpanded ? <ChevronDown size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
                  <span style={{ fontFamily: "Space Grotesk, var(--font-display), sans-serif", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", flex: 1 }}>
                    {proj?.name || "Unassigned"}
                  </span>
                  <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>{group.rfis.length} RFIs</span>
                  {overdueCount > 0 && (
                    <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--status-error)", background: "var(--danger-muted)", padding: "2px 7px", borderRadius: 2, textTransform: "uppercase" }}>⚠ {overdueCount} OVERDUE</span>
                  )}
                </div>

                {isExpanded && group.rfis.map(rfi => (
                  <RFIRow key={rfi.id} rfi={rfi}
                    onSelect={r => setSelectedRFI(selectedRFI?.id === r.id ? null : r)}
                    selected={selectedRFI?.id === rfi.id}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selectedRFI && (
          <RFIDetailPanel
            rfi={selectedRFI}
            onClose={() => setSelectedRFI(null)}
            onStatusChange={() => qc.invalidateQueries({ queryKey: ["rfis"] })}
          />
        )}
      </div>

      {/* New RFI modal */}
      {showNewRFI && (
        <NewRFIModal
          projects={projects}
          onClose={() => setShowNewRFI(false)}
          onSave={createMut.mutateAsync}
          isSaving={createMut.isPending}
        />
      )}
    </div>
  );
}
