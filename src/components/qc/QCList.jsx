import React, { useState } from "react";

const RESULT_COLORS = {
  Pass: "var(--status-success)",
  Fail: "var(--status-error)",
  "Conditional Pass": "var(--status-warning)",
  Inconclusive: "var(--text-muted)",
};

const STATUS_COLORS = {
  Pending: "var(--status-warning)",
  Reviewed: "var(--status-info)",
  Approved: "var(--status-success)",
  Rejected: "var(--status-error)",
};

export default function QCList({ records }) {
  const [expanded, setExpanded] = useState(null);

  if (records.length === 0) {
    return (
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "40px", textAlign: "center" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>No test records</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {records.map((record) => {
        const passRate = record.quantity_tested > 0 ? Math.round((record.quantity_passed / record.quantity_tested) * 100) : 0;

        return (
          <div key={record.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "10px", overflow: "hidden", cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; }}>
            {/* Header */}
            <div onClick={() => setExpanded(expanded === record.id ? null : record.id)} style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "16px", alignItems: "center", borderBottom: expanded === record.id ? "1px solid var(--divider)" : "none" }}>
              <div>
                <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "2px" }}>{record.test_type}</div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{record.material_or_component}</div>
                {record.location && <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "2px" }}>📍 {record.location}</div>}
              </div>

              <div>
                <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginBottom: "4px" }}>📅 {new Date(record.test_date).toLocaleDateString()}</div>
                {record.test_lab_or_inspector && <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>{record.test_lab_or_inspector}</div>}
                {record.specification && <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>{record.specification}</div>}
              </div>

              <div>
                <div style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", background: `${RESULT_COLORS[record.result]}20`, border: `1px solid ${RESULT_COLORS[record.result]}40`, borderRadius: "6px", marginBottom: "6px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 600, color: RESULT_COLORS[record.result], textTransform: "uppercase", letterSpacing: "0.06em" }}>{record.result}</span>
                </div>
                {record.quantity_tested > 1 && (
                  <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>
                    {record.quantity_passed}/{record.quantity_tested} passed ({passRate}%)
                  </div>
                )}
                <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 6px", background: `${STATUS_COLORS[record.status]}20`, border: `1px solid ${STATUS_COLORS[record.status]}40`, borderRadius: "4px", marginTop: "4px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "7px", fontWeight: 600, color: STATUS_COLORS[record.status], textTransform: "uppercase", letterSpacing: "0.05em" }}>{record.status}</span>
                </div>
              </div>

              <div style={{ fontSize: "14px", color: "var(--text-muted)", transform: expanded === record.id ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▼</div>
            </div>

            {/* Expanded */}
            {expanded === record.id && (
              <div style={{ padding: "16px", borderTop: "1px solid var(--divider)" }}>
                {record.test_value && (
                  <div style={{ marginBottom: "12px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Test Value</div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{record.test_value}</div>
                  </div>
                )}

                {record.acceptance_criteria && (
                  <div style={{ marginBottom: "12px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Acceptance Criteria</div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{record.acceptance_criteria}</div>
                  </div>
                )}

                {record.notes && (
                  <div style={{ marginBottom: "12px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Notes</div>
                    <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{record.notes}</p>
                  </div>
                )}

                {record.result === "Fail" && record.corrective_action && (
                  <div style={{ padding: "8px", background: "var(--danger-muted)", borderRadius: "6px", marginTop: "12px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--status-error)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>⚠ Corrective Action</div>
                    <p style={{ fontSize: "10px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>{record.corrective_action}</p>
                  </div>
                )}

                {record.approved_by && (
                  <div style={{ padding: "8px", background: "var(--bg-input)", borderRadius: "6px", marginTop: "12px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--status-success)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>✓ Approved By</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "10px", color: "var(--text-secondary)" }}>
                      <div>{record.approved_by}</div>
                      {record.approval_date && <div>{new Date(record.approval_date).toLocaleDateString()}</div>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}