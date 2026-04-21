/**
 * DetailDrawer — right-side sliding panel with full delivery details:
 * shipment metadata, linked work package, notes (with issue-keyword
 * flagging), and workflow buttons at the bottom to advance status or
 * open the full edit modal.
 */

import React from "react";
import { StatusPill, Section, GridRow } from "./subcomponents";
import { statusList } from "./constants";

export default function DetailDrawer({
  detail,
  projectMap,
  wpMap,
  today,
  onClose,
  onAdvanceToStatus,
  onEdit,
  onDelete,
}) {
  if (!detail) return null;

  const overdue = detail.scheduled_date && new Date(detail.scheduled_date) < today && detail.status !== "Delivered";
  const issueFlag =
    detail.notes &&
    ["damage", "short", "missing", "rejected", "issue", "problem"].some((word) =>
      detail.notes.toLowerCase().includes(word)
    );

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 900 }} />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 400,
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border-default)",
          zIndex: 901,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--divider)",
            background: "var(--bg-sidebar)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <StatusPill status={detail.status} />
          <div style={{ fontFamily: "Space Grotesk", fontSize: 15, fontWeight: 800 }}>
            {detail.delivery_title || wpMap[detail.work_package_id] || detail.description || detail.vendor}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)" }}>
            {projectMap[detail.project_id] || detail.project_name || "—"}
          </div>
          {detail.description && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{detail.vendor}</div>
          )}
          {detail.work_package_id && wpMap[detail.work_package_id] && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>
              WP: {wpMap[detail.work_package_id]}
            </div>
          )}
          {overdue && (
            <div style={{ background: "var(--status-error)", color: "#fff", padding: "4px 8px", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 10 }}>
              Overdue
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          <Section title="Shipment Details">
            <GridRow label="PO Number"   value={detail.po_number || "—"} />
            <GridRow label="Carrier"     value={detail.carrier || "—"} />
            <GridRow
              label="Tracking"
              value={detail.tracking_number || "—"}
              action={detail.tracking_number ? () => window.open(`https://www.google.com/search?q=${detail.tracking_number}`, "_blank") : null}
              actionLabel="Track"
            />
            <GridRow label="Work Package"        value={wpMap[detail.work_package_id] || "—"} />
            <GridRow label="Scheduled Date"      value={detail.scheduled_date || "—"} />
            <GridRow label="Required Date"       value={detail.required_date || "—"} />
            <GridRow label="Actual Date"         value={detail.actual_date || "—"} />
            <GridRow label="Pieces"              value={detail.pieces || "—"} />
            <GridRow label="Weight (Tons)"       value={detail.weight_tons || "—"} />
            <GridRow label="Received By"         value={detail.received_by || "—"} />
            <GridRow label="Delivery Type"       value={detail.delivery_type || "—"} />
            <GridRow label="Receiving Location"  value={detail.receiving_location || "—"} />
            <GridRow label="Priority"            value={detail.priority || "Normal"} />
            <GridRow label="Inspection Required" value={detail.inspection_required ? "Yes" : "No"} />
          </Section>

          <Section title="Work Package">
            <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-primary)" }}>
              {wpMap[detail.work_package_id] || "—"}
            </div>
          </Section>

          <Section title="Notes / Issues">
            {issueFlag && (
              <div style={{ background: "rgba(234,179,8,0.18)", border: "1px solid rgba(234,179,8,0.4)", padding: 8, borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-warning)" }}>
                ISSUE FLAGGED IN NOTES
              </div>
            )}
            <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>{detail.notes || "—"}</div>
            {detail.special_instructions && (
              <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, color: "var(--text-primary)" }}>
                Special Instructions: {detail.special_instructions}
              </div>
            )}
          </Section>
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--divider)", background: "var(--bg-sidebar)", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {statusList.map((s) => (
            <button
              key={s}
              onClick={() => onAdvanceToStatus(s)}
              style={{
                flex: "1 1 45%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--divider)",
                background: detail.status === s ? "var(--accent)"      : "var(--bg-surface)",
                color:      detail.status === s ? "var(--accent-text)" : "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              {s}
            </button>
          ))}
          <button
            onClick={onEdit}
            style={{
              flex: "1 1 100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--divider)",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            Edit Full Details
          </button>
          <button
            onClick={onDelete}
            style={{
              flex: "1 1 100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--danger-border)",
              background: "var(--danger-muted)",
              color: "var(--status-error)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </>
  );
}
