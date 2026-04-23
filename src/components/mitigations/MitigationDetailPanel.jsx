import React, { useState, useRef } from "react";
import { base44, resolveFileUrl } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const STATUS_COLORS = {
  Open: "var(--status-warning)",
  "Pending PM Review": "#0891B2",
  Noticed: "var(--status-info)",
  "Action Taken": "var(--accent)",
  Resolved: "var(--status-success)",
  Escalated: "var(--status-error)",
};

const ROOT_CAUSE_COLORS = {
  "Design Error": "#FF5C5C",
  "Site Readiness": "#E8650A",
  "Material Delay": "#FFB400",
  "Coordination Gap": "#0EA5E9",
  "Scope Change": "#0891B2",
  "Weather/Force Majeure": "#8898A8",
  "Subcontractor": "#06B6D4",
  "Owner Decision": "#FF9F43",
  "Other": "#64748B",
};

const ACTION_TYPE_COLORS = {
  "Email Sent": "var(--status-info)",
  "RFI Submitted": "var(--accent)",
  "Meeting Held": "var(--status-warning)",
  "Drawing Revised": "var(--status-info)",
  "Schedule Updated": "var(--status-warning)",
  "Verbal Notice": "var(--text-muted)",
  "Document Uploaded": "var(--status-success)",
  Other: "var(--text-muted)",
};

const ACTION_TYPES = [
  "Email Sent", "RFI Submitted", "Meeting Held", "Drawing Revised",
  "Schedule Updated", "Verbal Notice", "Document Uploaded", "Other",
];

const labelStyle = {
  fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
  letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: 4,
};

const inputStyle = {
  width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-input)", padding: "8px 12px", color: "var(--text-primary)",
  fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box",
};

const emptyAction = {
  action_type: "Email Sent",
  action_date: new Date().toISOString().split("T")[0],
  performed_by: "",
  description: "",
  outcome: "",
  proof_url: "",
  proof_filename: "",
  follow_up_required: false,
  follow_up_date: "",
};

// ─── Utility: Days open ─────────────────────────────────────────────────────
function daysOpen(identifiedDate) {
  if (!identifiedDate) return 0;
  const start = new Date(identifiedDate + "T00:00:00");
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000));
}

// ─── Utility: Expected Value ────────────────────────────────────────────────
function expectedValue(m) {
  const exposure = Number(m.cost_exposure) || 0;
  const likelihood = m.recovery_likelihood != null ? Number(m.recovery_likelihood) : 50;
  return exposure * (likelihood / 100);
}

export default function MitigationDetailPanel({
  mitigation,
  onClose,
  onEdit,
  onDelete,
  onCreateCO,
}) {
  const qc = useQueryClient();
  const [showActionForm, setShowActionForm] = useState(false);
  const [actionForm, setActionForm] = useState({ ...emptyAction });
  const [notesValue, setNotesValue] = useState(mitigation?.internal_notes || "");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const { data: actions = [], isLoading: actionsLoading } = useQuery({
    queryKey: ["mitigation-actions", mitigation?.id],
    queryFn: async () => {
      try {
        return await base44.entities.MitigationAction.filter({ mitigation_id: mitigation.id });
      } catch {
        return [];
      }
    },
    enabled: !!mitigation?.id,
    retry: false,
  });

  const createActionMut = useMutation({
    mutationFn: (data) =>
      base44.entities.MitigationAction.create({
        ...data,
        mitigation_id: mitigation.id,
        project_id: mitigation.project_id,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mitigation-actions", mitigation.id] });
      setShowActionForm(false);
      setActionForm({ ...emptyAction });
      toast.success("Action recorded");
    },
    onError: (err) => toast.error("Failed to add action: " + err.message),
  });

  const updateNotesMut = useMutation({
    mutationFn: (notes) =>
      base44.entities.MitigationLog.update(mitigation.id, { internal_notes: notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mitigations"] });
      toast.success("Saved");
    },
    onError: () => toast.error("Failed to save notes"),
  });

  const handleNotesBlur = () => {
    if (notesValue !== (mitigation?.internal_notes || "")) {
      updateNotesMut.mutate(notesValue);
    }
  };

  const setActionField = (key, value) =>
    setActionForm((prev) => ({ ...prev, [key]: value }));

  const handleSaveAction = () => {
    if (!actionForm.description?.trim()) return;
    createActionMut.mutate({
      ...actionForm,
      follow_up_required: !!actionForm.follow_up_required,
      follow_up_date: actionForm.follow_up_required ? actionForm.follow_up_date : null,
    });
  };

  if (!mitigation) return null;

  const statusColor = STATUS_COLORS[mitigation.status] || "var(--text-muted)";
  const rootCauseColor = ROOT_CAUSE_COLORS[mitigation.root_cause_category] || "var(--text-muted)";
  const sortedActions = [...actions].sort(
    (a, b) => new Date(b.action_date || 0) - new Date(a.action_date || 0)
  );
  const days = daysOpen(mitigation.identified_date);
  const ev = expectedValue(mitigation);
  const exposure = Number(mitigation.cost_exposure) || 0;
  const likelihood = mitigation.recovery_likelihood != null ? Number(mitigation.recovery_likelihood) : 50;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 899,
          background: "rgba(0,0,0,0.40)",
          backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
        }}
      />
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: 540,
          background: "var(--glass-bg, rgba(20,23,28,0.94))",
          borderLeft: "1px solid var(--glass-border, rgba(255,255,255,0.06))",
          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          zIndex: 900,
          display: "flex", flexDirection: "column",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.5), -4px 0 12px rgba(0,0,0,0.25)",
          overflow: "hidden",
          animation: "slideInRight 0.25s ease-out",
        }}
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--divider)", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700,
                color: "var(--accent)", letterSpacing: "0.08em", marginBottom: 4,
              }}>
                {mitigation.mitigation_number || "\u2014"}
              </div>
              <div style={{
                fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 700,
                color: "var(--text-primary)", lineHeight: 1.3, marginBottom: 8,
              }}>
                {mitigation.title}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {/* Status badge */}
                <span style={{
                  display: "inline-flex", alignItems: "center", padding: "3px 10px",
                  background: `${statusColor}18`, borderRadius: "var(--radius-badge, 6px)",
                }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                    color: statusColor, textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>
                    {mitigation.status}
                  </span>
                </span>

                {/* Root Cause badge */}
                {mitigation.root_cause_category && (
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.04em",
                    color: rootCauseColor,
                    background: `${rootCauseColor}15`, border: `1px solid ${rootCauseColor}30`,
                    borderRadius: 4, padding: "2px 7px", textTransform: "uppercase",
                  }}>
                    {mitigation.root_cause_category}
                  </span>
                )}

                {/* Impact Type badges */}
                {(mitigation.impact_types || "").split(",").filter(Boolean).map(tag => {
                  const t = tag.trim();
                  const colors = { Schedule: "#0EA5E9", Cost: "#FFB400", Safety: "#FF5C5C" };
                  const color = colors[t] || "var(--text-muted)";
                  return (
                    <span key={t} style={{
                      fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                      color, background: `${color}18`, borderRadius: 4, padding: "2px 7px",
                      letterSpacing: "0.06em", textTransform: "uppercase",
                    }}>
                      {t === "Schedule" ? "\u23F1" : t === "Cost" ? "$" : "\u26A0"} {t}
                    </span>
                  );
                })}

                {/* Days Open badge */}
                {mitigation.status !== "Resolved" && (
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                    color: days > 30 ? "var(--status-error)" : days > 14 ? "var(--status-warning)" : "var(--text-muted)",
                    background: days > 14 ? "rgba(255,122,122,0.08)" : "var(--hover-bg)",
                    border: days > 14 ? "1px solid rgba(255,122,122,0.20)" : "1px solid var(--divider)",
                    borderRadius: 4, padding: "2px 7px",
                  }}>
                    {days}d open
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", color: "var(--text-muted)",
                fontSize: 18, cursor: "pointer", padding: "4px 8px", lineHeight: 1,
              }}
            >
              &times;
            </button>
          </div>
        </div>

        {/* ── Scrollable body ─────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

          {/* ── Financial Exposure Strip ──────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
            <div style={{
              background: "var(--bg-surface-low)", borderRadius: "var(--radius-card)",
              padding: "10px 12px", borderTop: "2px solid var(--status-warning)",
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: exposure >= 50000 ? "var(--status-error)" : "var(--text-primary)" }}>
                ${exposure.toLocaleString()}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginTop: 2 }}>
                Exposure
              </div>
            </div>
            <div style={{
              background: "var(--bg-surface-low)", borderRadius: "var(--radius-card)",
              padding: "10px 12px", borderTop: "2px solid #0EA5E9",
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "#0EA5E9" }}>
                ${Math.round(ev).toLocaleString()}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginTop: 2 }}>
                Expected ({likelihood}%)
              </div>
            </div>
            <div style={{
              background: "var(--bg-surface-low)", borderRadius: "var(--radius-card)",
              padding: "10px 12px", borderTop: "2px solid var(--status-info)",
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                {mitigation.schedule_exposure_days || 0}d
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginTop: 2 }}>
                Schedule
              </div>
            </div>
            <div style={{
              background: "var(--bg-surface-low)", borderRadius: "var(--radius-card)",
              padding: "10px 12px",
              borderTop: `2px solid ${mitigation.is_co_candidate ? "var(--accent)" : "var(--border-default)"}`,
              cursor: mitigation.is_co_candidate && onCreateCO ? "pointer" : "default",
            }}
              onClick={() => mitigation.is_co_candidate && onCreateCO?.(mitigation)}
              title={mitigation.is_co_candidate ? "Click to create draft Change Order" : undefined}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: mitigation.is_co_candidate ? "var(--accent)" : "var(--text-muted)" }}>
                {mitigation.is_co_candidate ? "YES" : "\u2014"}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginTop: 2 }}>
                CO Candidate
              </div>
            </div>
          </div>

          {/* ── Recovery Likelihood Slider (visual only) ──────── */}
          {exposure > 0 && (
            <div style={{ marginBottom: 16, padding: "8px 12px", background: "var(--bg-surface-low)", borderRadius: "var(--radius-card)", border: "1px solid var(--divider)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                Recovery Likelihood
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, height: 6, background: "var(--hover-bg)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 3,
                    width: `${likelihood}%`,
                    background: likelihood >= 70 ? "var(--status-success)" : likelihood >= 40 ? "var(--accent)" : "var(--status-error)",
                    transition: "width 0.3s ease",
                  }} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", minWidth: 40, textAlign: "right" }}>
                  {likelihood}%
                </span>
              </div>
            </div>
          )}

          {/* ── Classification Row ───────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            {/* Source */}
            <div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Source:{" "}
              </span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)" }}>
                {mitigation.issue_source || "\u2014"}
                {mitigation.source_entity_ref ? ` \u00B7 ${mitigation.source_entity_ref}` : ""}
              </span>
            </div>
            {/* Responsible Party */}
            <div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Responsible:{" "}
              </span>
              <span style={{
                fontFamily: "var(--font-body)", fontSize: 12,
                color: mitigation.responsible_party ? "var(--text-secondary)" : "rgba(255,100,100,0.55)",
              }}>
                {mitigation.responsible_party || "Unassigned"}
              </span>
            </div>
          </div>

          {/* ── Identified ────────────────────────────────────── */}
          <div style={{ marginBottom: 16, display: "flex", gap: 16 }}>
            <div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Identified:{" "}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>
                {mitigation.identified_date
                  ? new Date(mitigation.identified_date + "T00:00:00").toLocaleDateString()
                  : "\u2014"}
              </span>
            </div>
            {mitigation.identified_by && (
              <div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  By:{" "}
                </span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)" }}>
                  {mitigation.identified_by}
                </span>
              </div>
            )}
            {mitigation.approved_by && (
              <div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Approved:{" "}
                </span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--status-success)" }}>
                  {mitigation.approved_by}
                  {mitigation.approval_date ? ` (${new Date(mitigation.approval_date + "T00:00:00").toLocaleDateString()})` : ""}
                </span>
              </div>
            )}
          </div>

          {/* ── Notice Sent ───────────────────────────────────── */}
          {mitigation.notice_sent_date && (
            <div style={{
              padding: "10px 12px", background: "var(--bg-surface-low)",
              borderRadius: "var(--radius-card)", borderLeft: "3px solid var(--status-info)",
              marginBottom: 16,
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-info)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>
                Notice Sent
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>
                {new Date(mitigation.notice_sent_date + "T00:00:00").toLocaleDateString()}
                {mitigation.notice_sent_to ? ` \u2014 ${mitigation.notice_sent_to}` : ""}
              </div>
              {mitigation.notice_method && (
                <span style={{
                  display: "inline-block", fontFamily: "var(--font-mono)", fontSize: 8,
                  color: "var(--text-muted)", background: "var(--bg-surface-high)",
                  borderRadius: "var(--radius-badge, 6px)", padding: "2px 6px",
                  letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 4,
                }}>
                  {mitigation.notice_method}
                </span>
              )}
            </div>
          )}

          {/* ── Actions & Proof Trail ─────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
              color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase",
              marginBottom: 12, borderBottom: "1px solid var(--divider)", paddingBottom: 6,
            }}>
              Actions &amp; Proof Trail
              {sortedActions.length > 0 && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", fontWeight: 400, marginLeft: 8 }}>
                  ({sortedActions.length})
                </span>
              )}
            </div>

            {actionsLoading && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", padding: "8px 0" }}>
                Loading actions...
              </div>
            )}

            {!actionsLoading && sortedActions.length === 0 && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", padding: "8px 0" }}>
                No actions recorded yet.
              </div>
            )}

            {/* Timeline */}
            {sortedActions.map((action, idx) => {
              const typeColor = ACTION_TYPE_COLORS[action.action_type] || "var(--text-muted)";
              return (
                <div key={action.id} style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 16, flexShrink: 0 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: typeColor, flexShrink: 0, marginTop: 3 }} />
                    {idx < sortedActions.length - 1 && (
                      <div style={{ width: 1, flex: 1, background: "var(--divider)", marginTop: 4 }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                        {action.action_date
                          ? new Date(action.action_date + "T00:00:00").toLocaleDateString()
                          : "\u2014"}
                      </span>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                        color: typeColor, background: `${typeColor}18`,
                        borderRadius: "var(--radius-badge, 6px)", padding: "2px 6px",
                        textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>
                        {action.action_type}
                      </span>
                      {action.performed_by && (
                        <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-muted)" }}>
                          {action.performed_by}
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {action.description}
                    </div>
                    {action.outcome && (
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", marginTop: 4, paddingLeft: 8 }}>
                        {action.outcome}
                      </div>
                    )}
                    {action.proof_url && (
                      <span
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const url = await resolveFileUrl(action.proof_url);
                            window.open(url, "_blank");
                          } catch {
                            window.open(action.proof_url, "_blank");
                          }
                        }}
                        style={{
                          display: "inline-block", fontFamily: "var(--font-mono)", fontSize: 9,
                          color: "var(--status-info)", textDecoration: "none", marginTop: 4,
                          letterSpacing: "0.06em", cursor: "pointer",
                        }}
                      >
                        {action.proof_filename || "View Proof"} &rarr;
                      </span>
                    )}
                    {action.follow_up_required && (
                      <div style={{
                        display: "inline-flex", alignItems: "center",
                        fontFamily: "var(--font-mono)", fontSize: 8,
                        color: "var(--status-warning)", background: "rgba(255,180,0,0.10)",
                        border: "1px solid rgba(255,180,0,0.22)",
                        borderRadius: "var(--radius-badge, 6px)", padding: "2px 6px",
                        letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 4,
                      }}>
                        Follow-up: {action.follow_up_date
                          ? new Date(action.follow_up_date + "T00:00:00").toLocaleDateString()
                          : "TBD"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add Action */}
            {!showActionForm ? (
              <button
                onClick={() => setShowActionForm(true)}
                style={{
                  background: "transparent", border: "1px dashed var(--border-default)",
                  borderRadius: "var(--radius-btn)", padding: "8px 16px",
                  color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9,
                  fontWeight: 700, cursor: "pointer", textTransform: "uppercase",
                  letterSpacing: "0.08em", width: "100%", marginTop: 4,
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                + Add Action
              </button>
            ) : (
              <div style={{
                background: "var(--bg-surface-low)", borderRadius: "var(--radius-card)",
                padding: 14, marginTop: 4, display: "flex", flexDirection: "column", gap: 10,
                border: "1px solid var(--border-default)",
              }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={labelStyle}>Action Type</label>
                    <select value={actionForm.action_type} onChange={(e) => setActionField("action_type", e.target.value)} style={inputStyle}>
                      {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Date</label>
                    <input type="date" value={actionForm.action_date} onChange={(e) => setActionField("action_date", e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Performed By</label>
                  <input type="text" value={actionForm.performed_by} onChange={(e) => setActionField("performed_by", e.target.value)} placeholder="Name" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Description *</label>
                  <textarea value={actionForm.description} onChange={(e) => setActionField("description", e.target.value)} placeholder="What action was taken?" style={{ ...inputStyle, minHeight: 50, resize: "vertical" }} />
                </div>
                <div>
                  <label style={labelStyle}>Outcome</label>
                  <input type="text" value={actionForm.outcome} onChange={(e) => setActionField("outcome", e.target.value)} placeholder="Result of this action (optional)" style={inputStyle} />
                </div>
                {/* Proof Upload */}
                <div>
                  <label style={labelStyle}>Proof Document</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: "none" }}
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv,.txt"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        setUploading(true);
                        const result = await base44.integrations.Core.UploadFile({ file });
                        setActionField("proof_url", result.path);
                        setActionField("proof_filename", file.name);
                        toast.success(`Uploaded: ${file.name}`);
                      } catch (err) {
                        toast.error("Upload failed: " + err.message);
                      } finally {
                        setUploading(false);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      style={{
                        background: "var(--bg-surface)", border: "1px dashed var(--border-default)",
                        borderRadius: "var(--radius-btn)", padding: "6px 14px",
                        color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9,
                        fontWeight: 700, cursor: uploading ? "wait" : "pointer",
                        textTransform: "uppercase", letterSpacing: "0.06em",
                        transition: "border-color 0.15s, color 0.15s",
                      }}
                      onMouseEnter={(e) => { if (!uploading) { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                    >
                      {uploading ? "Uploading..." : "\u2191 Upload Proof"}
                    </button>
                    {actionForm.proof_filename && (
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-success)",
                        display: "flex", alignItems: "center", gap: 4,
                      }}>
                        <span style={{ fontSize: 12 }}>{"\u2713"}</span> {actionForm.proof_filename}
                      </span>
                    )}
                    {!actionForm.proof_filename && (
                      <input
                        type="text"
                        value={actionForm.proof_url}
                        onChange={(e) => setActionField("proof_url", e.target.value)}
                        placeholder="or paste URL..."
                        style={{ ...inputStyle, flex: 1 }}
                      />
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={actionForm.follow_up_required} onChange={(e) => setActionField("follow_up_required", e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      Follow-up required
                    </span>
                  </label>
                  {actionForm.follow_up_required && (
                    <input type="date" value={actionForm.follow_up_date} onChange={(e) => setActionField("follow_up_date", e.target.value)} style={{ ...inputStyle, width: 140 }} />
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => { setShowActionForm(false); setActionForm({ ...emptyAction }); }}
                    style={{
                      background: "var(--bg-surface)", border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-btn)", padding: "6px 12px",
                      color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 9,
                      fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveAction}
                    disabled={!actionForm.description?.trim() || createActionMut.isPending}
                    style={{
                      background: "var(--accent)", color: "#07090E", border: "none",
                      borderRadius: "var(--radius-btn)", padding: "6px 12px",
                      fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800,
                      cursor: !actionForm.description?.trim() || createActionMut.isPending ? "not-allowed" : "pointer",
                      textTransform: "uppercase", letterSpacing: "0.08em",
                      opacity: !actionForm.description?.trim() || createActionMut.isPending ? 0.5 : 1,
                    }}
                  >
                    {createActionMut.isPending ? "Saving..." : "Save Action"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Internal Notes ────────────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
              color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase",
              marginBottom: 8, borderBottom: "1px solid var(--divider)", paddingBottom: 6,
            }}>
              Internal Notes
            </div>
            <textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder="Internal tracking notes..."
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
            />
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────── */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid var(--divider)",
          display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0,
        }}>
          {mitigation.is_co_candidate && onCreateCO && (
            <button
              onClick={() => onCreateCO(mitigation)}
              style={{
                background: "rgba(200,155,32,0.10)", border: "1px solid rgba(200,155,32,0.30)",
                borderRadius: "var(--radius-btn)", padding: "8px 14px",
                color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 10,
                fontWeight: 700, cursor: "pointer", textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Create CO Draft
            </button>
          )}
          <button
            onClick={() => onEdit(mitigation)}
            style={{
              background: "var(--bg-surface)", border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-btn)", padding: "8px 16px",
              color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 10,
              fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em",
            }}
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(mitigation)}
            style={{
              background: "var(--danger-muted)", border: "1px solid var(--status-error)",
              borderRadius: "var(--radius-btn)", padding: "8px 16px",
              color: "var(--status-error)", fontFamily: "var(--font-mono)", fontSize: 10,
              fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </>
  );
}
