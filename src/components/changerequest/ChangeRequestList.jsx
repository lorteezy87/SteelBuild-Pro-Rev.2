import React, { useState } from "react";
import { formatLocalDate } from "@/utils/dates";

const STATUS_COLORS = {
  Submitted: "var(--status-warning)",
  "Under Review": "var(--status-info)",
  "Awaiting Approval": "var(--status-warning)",
  Approved: "var(--status-success)",
  Rejected: "var(--status-error)",
  "Approved with Conditions": "var(--accent)",
  "On Hold": "var(--text-muted)",
};

const PRIORITY_COLORS = {
  Critical: "var(--status-error)",
  High: "var(--status-warning)",
  Medium: "var(--status-info)",
  Low: "var(--accent)",
};

export default function ChangeRequestList({ requests = [] }) {
  const [expanded, setExpanded] = useState(null);

  if (requests.length === 0) {
    return (
      <div style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-card)", padding: "40px", textAlign: "center" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>No change requests</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {requests.map((request) => (
        <div key={request.id} style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-card)", overflow: "hidden", cursor: "pointer", transition: "background 0.1s" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-surface-low)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-surface)"; }}>
          {/* Header */}
          <div role="button" tabIndex={0} aria-expanded={expanded === request.id} aria-label={`Change request CR-${request.cr_number || "—"}: ${request.title || "Untitled"}`} onClick={() => setExpanded(expanded === request.id ? null : request.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(expanded === request.id ? null : request.id); } }} style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "16px", alignItems: "center", borderBottom: expanded === request.id ? "1px solid var(--divider)" : "none" }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "2px" }}>CR-{request.cr_number || "—"}</div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{request.title}</div>
              <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "2px" }}>{request.reason}</div>
            </div>

            <div>
              <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginBottom: "4px" }}>📅 {request.request_date ? formatLocalDate(request.request_date) : "—"}</div>
              {request.estimated_cost_impact !== 0 && (
                <div style={{ fontSize: "10px", fontWeight: 600, color: request.estimated_cost_impact > 0 ? "var(--status-warning)" : "var(--status-success)" }}>
                  {request.estimated_cost_impact > 0 ? "+" : ""} ${Math.abs(request.estimated_cost_impact || 0).toLocaleString()}
                </div>
              )}
              {request.estimated_schedule_impact_days !== 0 && (
                <div style={{ fontSize: "9px", color: request.estimated_schedule_impact_days > 0 ? "var(--status-warning)" : "var(--status-success)" }}>
                  {request.estimated_schedule_impact_days > 0 ? "+" : ""} {request.estimated_schedule_impact_days} days
                </div>
              )}
            </div>

            <div>
              <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", background: `${STATUS_COLORS[request.status]}18`, borderRadius: 9999, marginBottom: "6px" }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: STATUS_COLORS[request.status], textTransform: "uppercase", letterSpacing: "0.06em" }}>{request.status}</span>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", background: `${PRIORITY_COLORS[request.priority]}18`, borderRadius: 9999 }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, color: PRIORITY_COLORS[request.priority], textTransform: "uppercase", letterSpacing: "0.05em" }}>{request.priority}</span>
              </div>
            </div>

            <div style={{ fontSize: "14px", color: "var(--text-muted)", transform: expanded === request.id ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▼</div>
          </div>

          {/* Expanded */}
          {expanded === request.id && (
            <div style={{ padding: "16px", borderTop: "1px solid var(--divider)" }}>
              {request.description && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Description</div>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{request.description}</p>
                </div>
              )}

              {request.affected_areas && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Affected Areas</div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{request.affected_areas}</div>
                </div>
              )}

              {request.scope_impact && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Scope Impact</div>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{request.scope_impact}</p>
                </div>
              )}

              {(request.approver_1 || request.approver_2) && (
                <div style={{ padding: "8px", background: "var(--bg-surface-low)", borderRadius: "var(--radius-card)", marginTop: "12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--status-success)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Approvals</div>
                  {request.approver_1 && (
                    <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                      ✓ {request.approver_1} {request.approver_1_date && `(${formatLocalDate(request.approver_1_date)})`}
                    </div>
                  )}
                  {request.approver_2 && (
                    <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                      ✓ {request.approver_2} {request.approver_2_date && `(${formatLocalDate(request.approver_2_date)})`}
                    </div>
                  )}
                </div>
              )}

              {request.linked_co_number && (
                <div style={{ padding: "8px", background: "var(--accent-muted)", borderRadius: "var(--radius-card)", marginTop: "12px", borderLeft: "3px solid var(--accent)" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Linked Change Order</div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>CO-{request.linked_co_number}</div>
                </div>
              )}

              {request.notes && (
                <div style={{ marginTop: "12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Notes</div>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{request.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}