import React, { useState } from "react";
import { formatLocalDate } from "@/utils/dates";

const STATUS_COLORS = {
  Scheduled: "var(--status-info)",
  "In Progress": "var(--status-warning)",
  Completed: "var(--status-success)",
  "On Hold": "var(--text-muted)",
  Cancelled: "var(--status-error)",
};

const SIGNOFF_COLORS = {
  Pending: "var(--status-warning)",
  Approved: "var(--status-success)",
  "Conditional Approval": "var(--status-info)",
  Rejected: "var(--status-error)",
};

export default function InspectionList({ inspections, onConvertToPunchlist }) {
  const [expanded, setExpanded] = useState(null);

  if (inspections.length === 0) {
    return (
      <div className="sbd-card" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "40px", textAlign: "center" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>No inspections</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {inspections.map((inspection) => (
        <div
          key={inspection.id}
          className="sbd-card sbd-card-hover"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "10px",
            overflow: "hidden",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-default)";
          }}
        >
          {/* Header */}
          <div
            onClick={() => setExpanded(expanded === inspection.id ? null : inspection.id)}
            style={{
              padding: "14px 16px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr auto",
              gap: "16px",
              alignItems: "center",
              borderBottom: expanded === inspection.id ? "1px solid var(--divider)" : "none",
            }}
          >
            <div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                {inspection.inspection_type}
              </div>
              {inspection.location && (
                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                  📍 {inspection.location}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                {formatLocalDate(inspection.inspection_date)}
              </div>
              {inspection.inspector_name && (
                <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "2px" }}>
                  {inspection.inspector_name}
                </div>
              )}
            </div>

            <div>
              <div style={{ display: "inline-flex", gap: "6px" }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "3px 6px",
                    background: `${STATUS_COLORS[inspection.status]}20`,
                    border: `1px solid ${STATUS_COLORS[inspection.status]}40`,
                    borderRadius: "4px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "7px",
                      fontWeight: 600,
                      color: STATUS_COLORS[inspection.status],
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {inspection.status}
                  </span>
                </div>
                {inspection.sign_off_status !== "Pending" && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "3px 6px",
                      background: `${SIGNOFF_COLORS[inspection.sign_off_status]}20`,
                      border: `1px solid ${SIGNOFF_COLORS[inspection.sign_off_status]}40`,
                      borderRadius: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "7px",
                        fontWeight: 600,
                        color: SIGNOFF_COLORS[inspection.sign_off_status],
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {inspection.sign_off_status}
                    </span>
                  </div>
                )}
              </div>
              {inspection.deficiencies_count > 0 && (
                <div
                  style={{
                    fontSize: "9px",
                    color: "var(--status-error)",
                    fontWeight: 600,
                    marginTop: "4px",
                  }}
                >
                  ⚠ {inspection.deficiencies_count} Deficiencies
                </div>
              )}
            </div>

            <div
              style={{
                fontSize: "14px",
                color: "var(--text-muted)",
                transform: expanded === inspection.id ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.15s",
              }}
            >
              ▼
            </div>
          </div>

          {/* Expanded Content */}
          {expanded === inspection.id && (
            <div style={{ padding: "16px", borderTop: "1px solid var(--divider)" }}>
              {inspection.description && (
                <div style={{ marginBottom: "12px" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: "4px",
                    }}
                  >
                    Scope
                  </div>
                  <p
                    style={{
                      fontSize: "11px",
                      color: "var(--text-secondary)",
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {inspection.description}
                  </p>
                </div>
              )}

              {inspection.findings && (
                <div style={{ marginBottom: "12px" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: "4px",
                    }}
                  >
                    Findings
                  </div>
                  <p
                    style={{
                      fontSize: "11px",
                      color: "var(--text-secondary)",
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {inspection.findings}
                  </p>
                </div>
              )}

              {inspection.corrective_actions && (
                <div style={{ marginBottom: "12px" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: "4px",
                    }}
                  >
                    Corrective Actions
                  </div>
                  <p
                    style={{
                      fontSize: "11px",
                      color: "var(--text-secondary)",
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {inspection.corrective_actions}
                  </p>
                </div>
              )}

              {inspection.notes && (
                <div style={{ marginBottom: "12px" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: "4px",
                    }}
                  >
                    Notes
                  </div>
                  <p
                    style={{
                      fontSize: "11px",
                      color: "var(--text-secondary)",
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {inspection.notes}
                  </p>
                </div>
              )}

              {/* Convert deficiencies to punchlist (C3) */}
              {onConvertToPunchlist && inspection.deficiencies_count > 0 && !inspection.metadata?.punchlist_converted && (
                <div style={{ marginBottom: "12px" }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onConvertToPunchlist(inspection);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "var(--accent)",
                      color: "var(--bg-base)",
                      border: "none",
                      borderRadius: 6,
                      padding: "6px 12px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    Convert {inspection.deficiencies_count} → Punchlist
                  </button>
                </div>
              )}
              {inspection.metadata?.punchlist_converted && (
                <div style={{ marginBottom: "12px",
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                  color: "var(--status-success)", letterSpacing: "0.08em", textTransform: "uppercase",
                }}>
                  ✓ Converted to {inspection.metadata.punchlist_converted.count || ""} punchlist item{inspection.metadata.punchlist_converted.count === 1 ? "" : "s"}
                </div>
              )}

              {inspection.sign_off_date && (
                <div
                  style={{
                    padding: "8px",
                    background: "var(--bg-input)",
                    borderRadius: "6px",
                    marginTop: "12px",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "7px",
                        color: "var(--text-muted)",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      Signed
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                      {formatLocalDate(inspection.sign_off_date)}
                    </div>
                  </div>
                  {inspection.sign_off_by && (
                    <div>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "7px",
                          color: "var(--text-muted)",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                        }}
                      >
                        By
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                        {inspection.sign_off_by}
                      </div>
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