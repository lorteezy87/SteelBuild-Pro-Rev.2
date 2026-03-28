import React, { useState } from "react";

const SEVERITY_COLORS = {
  Critical: "var(--status-error)",
  High: "var(--status-warning)",
  Medium: "var(--status-info)",
  Low: "var(--accent)",
};

const TYPE_ICONS = {
  Injury: "🚑",
  "Near Miss": "⚠",
  Hazard: "🛑",
  "Property Damage": "💥",
  Environmental: "🌍",
  Behavioral: "👤",
  "Equipment Failure": "⚙",
  Other: "📋",
};

const STATUS_COLORS = {
  Open: "var(--status-error)",
  "Under Investigation": "var(--status-warning)",
  "Action Plan": "var(--status-info)",
  "In Progress": "var(--status-warning)",
  Completed: "var(--status-success)",
  Closed: "var(--accent)",
};

export default function SafetyIncidentList({ incidents }) {
  const [expanded, setExpanded] = useState(null);

  if (incidents.length === 0) {
    return (
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "40px", textAlign: "center" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>No incidents reported</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {incidents.map((incident) => (
        <div key={incident.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "10px", overflow: "hidden", cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; }}>
          {/* Header */}
          <div onClick={() => setExpanded(expanded === incident.id ? null : incident.id)} style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "auto 1fr 1fr auto", gap: "16px", alignItems: "center", borderBottom: expanded === incident.id ? "1px solid var(--divider)" : "none" }}>
            <div style={{ fontSize: "20px" }}>{TYPE_ICONS[incident.incident_type] || "📋"}</div>

            <div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{incident.incident_type}</div>
              {incident.location && <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>📍 {incident.location}</div>}
            </div>

            <div>
              <div style={{ display: "flex", gap: "6px" }}>
                <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 6px", background: `${SEVERITY_COLORS[incident.severity]}20`, border: `1px solid ${SEVERITY_COLORS[incident.severity]}40`, borderRadius: "4px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "7px", fontWeight: 600, color: SEVERITY_COLORS[incident.severity], textTransform: "uppercase", letterSpacing: "0.05em" }}>{incident.severity}</span>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 6px", background: `${STATUS_COLORS[incident.status]}20`, border: `1px solid ${STATUS_COLORS[incident.status]}40`, borderRadius: "4px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "7px", fontWeight: 600, color: STATUS_COLORS[incident.status], textTransform: "uppercase", letterSpacing: "0.05em" }}>{incident.status}</span>
                </div>
              </div>
              <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "4px" }}>{new Date(incident.incident_date).toLocaleDateString()}</div>
            </div>

            <div style={{ fontSize: "14px", color: "var(--text-muted)", transform: expanded === incident.id ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▼</div>
          </div>

          {/* Expanded Content */}
          {expanded === incident.id && (
            <div style={{ padding: "16px", borderTop: "1px solid var(--divider)" }}>
              {incident.description && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Description</div>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{incident.description}</p>
                </div>
              )}

              {incident.injuries && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--status-error)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>🚑 Injuries</div>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{incident.injuries}</p>
                </div>
              )}

              {incident.root_cause && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Root Cause</div>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{incident.root_cause}</p>
                </div>
              )}

              {incident.corrective_actions && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Corrective Actions</div>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{incident.corrective_actions}</p>
                </div>
              )}

              <div style={{ padding: "8px", background: "var(--bg-input)", borderRadius: "6px", marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
                {incident.reported_by && (
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "7px", color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Reported By</div>
                    <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>{incident.reported_by}</div>
                  </div>
                )}
                {incident.responsible_party && (
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "7px", color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Responsible</div>
                    <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>{incident.responsible_party}</div>
                  </div>
                )}
                {incident.action_due_date && (
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "7px", color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Due Date</div>
                    <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>{new Date(incident.action_due_date).toLocaleDateString()}</div>
                  </div>
                )}
              </div>

              {(incident.investigation_completed || incident.safety_trained) && (
                <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                  {incident.investigation_completed && (
                    <div style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", background: "var(--status-success)20", border: "1px solid var(--status-success)40", borderRadius: "4px" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 600, color: "var(--status-success)", textTransform: "uppercase" }}>✓ Investigated</span>
                    </div>
                  )}
                  {incident.safety_trained && (
                    <div style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", background: "var(--status-success)20", border: "1px solid var(--status-success)40", borderRadius: "4px" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 600, color: "var(--status-success)", textTransform: "uppercase" }}>✓ Trained</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}