import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const STATUS_COLORS = {
  Open: "var(--status-warning)",
  Noticed: "var(--status-info)",
  "Action Taken": "var(--accent)",
  Resolved: "var(--status-success)",
  Escalated: "var(--status-error)",
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
  "Email Sent",
  "RFI Submitted",
  "Meeting Held",
  "Drawing Revised",
  "Schedule Updated",
  "Verbal Notice",
  "Document Uploaded",
  "Other",
];

const labelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 4,
};

const inputStyle = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-input)",
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
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

export default function MitigationDetailPanel({
  mitigation,
  onClose,
  onEdit,
  onDelete,
}) {
  const qc = useQueryClient();
  const [showActionForm, setShowActionForm] = useState(false);
  const [actionForm, setActionForm] = useState({ ...emptyAction });
  const [notesValue, setNotesValue] = useState(mitigation?.internal_notes || "");
  const notesTimer = useRef(null);

  const { data: actions = [], isLoading: actionsLoading } = useQuery({
    queryKey: ["mitigation-actions", mitigation?.id],
    queryFn: () => base44.entities.MitigationAction.filter({ mitigation_id: mitigation.id }),
    enabled: !!mitigation?.id,
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
  const sortedActions = [...actions].sort(
    (a, b) => new Date(b.action_date || 0) - new Date(a.action_date || 0)
  );

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 520,
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border-default)",
        zIndex: 900,
        display: "flex",
        flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.3)",
        overflow: "hidden",
      }}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--divider)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                fontWeight: 700,
                color: "var(--accent)",
                letterSpacing: "0.08em",
                marginBottom: 4,
              }}
            >
              {mitigation.mitigation_number || "—"}
            </div>
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 14,
                fontWeight: 700,
                color: "var(--text-primary)",
                lineHeight: 1.3,
                marginBottom: 8,
              }}
            >
              {mitigation.title}
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "3px 10px",
                background: `${statusColor}18`,
                borderRadius: "var(--radius-badge)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  color: statusColor,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {mitigation.status}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: 18,
              cursor: "pointer",
              padding: "4px 8px",
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>
      </div>

      {/* ── Scrollable body ────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {/* Exposure Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              background: "var(--bg-surface-low)",
              borderRadius: "var(--radius-card)",
              padding: "10px 12px",
              borderTop: "2px solid var(--status-warning)",
            }}
          >
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
              ${(mitigation.cost_exposure || 0).toLocaleString()}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginTop: 2 }}>
              Cost Exposure
            </div>
          </div>
          <div
            style={{
              background: "var(--bg-surface-low)",
              borderRadius: "var(--radius-card)",
              padding: "10px 12px",
              borderTop: "2px solid var(--status-info)",
            }}
          >
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
              {mitigation.schedule_exposure_days || 0}d
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginTop: 2 }}>
              Schedule Impact
            </div>
          </div>
          <div
            style={{
              background: "var(--bg-surface-low)",
              borderRadius: "var(--radius-card)",
              padding: "10px 12px",
              borderTop: `2px solid ${mitigation.is_co_candidate ? "var(--accent)" : "var(--border-default)"}`,
            }}
          >
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: mitigation.is_co_candidate ? "var(--accent)" : "var(--text-muted)" }}>
              {mitigation.is_co_candidate ? "YES" : "\u2014"}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginTop: 2 }}>
              CO Candidate
            </div>
          </div>
        </div>

        {/* Source Row */}
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Source:{" "}
          </span>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)" }}>
            {mitigation.issue_source || "\u2014"}
            {mitigation.source_entity_ref ? ` \u00B7 ${mitigation.source_entity_ref}` : ""}
          </span>
        </div>

        {/* Identified */}
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
        </div>

        {/* Notice Sent */}
        {mitigation.notice_sent_date && (
          <div
            style={{
              padding: "10px 12px",
              background: "var(--bg-surface-low)",
              borderRadius: "var(--radius-card)",
              borderLeft: "3px solid var(--status-info)",
              marginBottom: 16,
            }}
          >
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-info)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>
              Notice Sent
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>
              {new Date(mitigation.notice_sent_date + "T00:00:00").toLocaleDateString()}
              {mitigation.notice_sent_to ? ` \u2014 ${mitigation.notice_sent_to}` : ""}
            </div>
            {mitigation.notice_method && (
              <span
                style={{
                  display: "inline-block",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  color: "var(--text-muted)",
                  background: "var(--bg-surface-high)",
                  borderRadius: "var(--radius-badge)",
                  padding: "2px 6px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginTop: 4,
                }}
              >
                {mitigation.notice_method}
              </span>
            )}
          </div>
        )}

        {/* ── Actions & Proof Trail ────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              marginBottom: 12,
              borderBottom: "1px solid var(--divider)",
              paddingBottom: 6,
            }}
          >
            Actions &amp; Proof Trail
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
                {/* Left: line + dot */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 16, flexShrink: 0 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: typeColor,
                      flexShrink: 0,
                      marginTop: 3,
                    }}
                  />
                  {idx < sortedActions.length - 1 && (
                    <div style={{ width: 1, flex: 1, background: "var(--divider)", marginTop: 4 }} />
                  )}
                </div>
                {/* Right: content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                      {action.action_date
                        ? new Date(action.action_date + "T00:00:00").toLocaleDateString()
                        : "\u2014"}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        fontWeight: 700,
                        color: typeColor,
                        background: `${typeColor}18`,
                        borderRadius: "var(--radius-badge)",
                        padding: "2px 6px",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
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
                    <a
                      href={action.proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-block",
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        color: "var(--status-info)",
                        textDecoration: "none",
                        marginTop: 4,
                        letterSpacing: "0.06em",
                      }}
                    >
                      {action.proof_filename || "View Proof"} &rarr;
                    </a>
                  )}
                  {action.follow_up_required && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        color: "var(--status-warning)",
                        background: "var(--status-warning)18",
                        borderRadius: "var(--radius-badge)",
                        padding: "2px 6px",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        marginTop: 4,
                      }}
                    >
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
                background: "transparent",
                border: "1px dashed var(--border-default)",
                borderRadius: "var(--radius-btn)",
                padding: "8px 16px",
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                width: "100%",
                marginTop: 4,
              }}
            >
              + Add Action
            </button>
          ) : (
            <div
              style={{
                background: "var(--bg-surface-low)",
                borderRadius: "var(--radius-card)",
                padding: 14,
                marginTop: 4,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                border: "1px solid var(--border-default)",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={labelStyle}>Action Type</label>
                  <select
                    value={actionForm.action_type}
                    onChange={(e) => setActionField("action_type", e.target.value)}
                    style={inputStyle}
                  >
                    {ACTION_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input
                    type="date"
                    value={actionForm.action_date}
                    onChange={(e) => setActionField("action_date", e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Performed By</label>
                <input
                  type="text"
                  value={actionForm.performed_by}
                  onChange={(e) => setActionField("performed_by", e.target.value)}
                  placeholder="Name"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Description *</label>
                <textarea
                  value={actionForm.description}
                  onChange={(e) => setActionField("description", e.target.value)}
                  placeholder="What action was taken?"
                  style={{ ...inputStyle, minHeight: 50, resize: "vertical" }}
                />
              </div>
              <div>
                <label style={labelStyle}>Outcome</label>
                <input
                  type="text"
                  value={actionForm.outcome}
                  onChange={(e) => setActionField("outcome", e.target.value)}
                  placeholder="Result of this action (optional)"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={labelStyle}>Proof URL (optional)</label>
                  <input
                    type="text"
                    value={actionForm.proof_url}
                    onChange={(e) => setActionField("proof_url", e.target.value)}
                    placeholder="https://..."
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Proof filename (optional)</label>
                  <input
                    type="text"
                    value={actionForm.proof_filename}
                    onChange={(e) => setActionField("proof_filename", e.target.value)}
                    placeholder="file.pdf"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={actionForm.follow_up_required}
                    onChange={(e) => setActionField("follow_up_required", e.target.checked)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    Follow-up required
                  </span>
                </label>
                {actionForm.follow_up_required && (
                  <input
                    type="date"
                    value={actionForm.follow_up_date}
                    onChange={(e) => setActionField("follow_up_date", e.target.value)}
                    style={{ ...inputStyle, width: 140 }}
                  />
                )}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setShowActionForm(false); setActionForm({ ...emptyAction }); }}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-btn)",
                    padding: "6px 12px",
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAction}
                  disabled={!actionForm.description?.trim() || createActionMut.isPending}
                  style={{
                    background: "var(--accent)",
                    color: "white",
                    border: "none",
                    borderRadius: "var(--radius-btn)",
                    padding: "6px 12px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    cursor: !actionForm.description?.trim() || createActionMut.isPending ? "not-allowed" : "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    opacity: !actionForm.description?.trim() || createActionMut.isPending ? 0.5 : 1,
                  }}
                >
                  {createActionMut.isPending ? "Saving..." : "Save Action"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Internal Notes ───────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              marginBottom: 8,
              borderBottom: "1px solid var(--divider)",
              paddingBottom: 6,
            }}
          >
            Internal Notes
          </div>
          <textarea
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            onBlur={handleNotesBlur}
            placeholder="Internal tracking notes..."
            style={{
              ...inputStyle,
              minHeight: 70,
              resize: "vertical",
            }}
          />
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────── */}
      <div
        style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--divider)",
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => onEdit(mitigation)}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-btn)",
            padding: "8px 16px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(mitigation)}
          style={{
            background: "var(--danger-muted)",
            border: "1px solid var(--status-error)",
            borderRadius: "var(--radius-btn)",
            padding: "8px 16px",
            color: "var(--status-error)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
