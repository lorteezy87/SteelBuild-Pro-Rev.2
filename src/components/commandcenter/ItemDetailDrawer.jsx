import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";

/**
 * Slide-out detail drawer for a single feed item.
 * Opens from the right side. Fixed header + scrollable body + pinned footer.
 */

const URGENCY_COLORS = {
  overdue:    "var(--status-error)",
  "due-soon": "var(--status-warning)",
  blocking:   "var(--accent)",
  awaiting:   "var(--text-muted)",
  normal:     "var(--border-default)",
};

const Row = ({ label, value }) => {
  if (value == null || value === "") return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid var(--divider)" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", textAlign: "right", maxWidth: "60%", wordBreak: "break-word" }}>
        {value}
      </span>
    </div>
  );
};

function extractDetails(item) {
  const raw = item.raw || {};
  const details = [];

  details.push({ label: "Type", value: item.itemType });
  details.push({ label: "Urgency", value: item.urgency });
  details.push({ label: "Status", value: item.displayStatus });

  if (item.owner) details.push({ label: "Owner / Ball-in-Court", value: item.owner });
  if (item.projectNumber || item.projectName) {
    // Show "#### — Project Name" when both are present so the user can
    // confirm both the job code (used in folder paths / contracts) and
    // the human-readable name in one line.
    const projectLabel = [item.projectNumber, item.projectName].filter(Boolean).join(" — ");
    details.push({ label: "Project", value: projectLabel });
  }
  if (item.priority) details.push({ label: "Priority", value: item.priority });

  // Type-specific fields from raw data
  switch (item.itemType) {
    case "RFI":
      if (raw.date_required) details.push({ label: "Date Required", value: raw.date_required });
      if (raw.submitted_date) details.push({ label: "Submitted", value: raw.submitted_date });
      if (raw.assigned_to) details.push({ label: "Assigned To", value: raw.assigned_to });
      if (raw.drawing_reference) details.push({ label: "Drawing Ref", value: raw.drawing_reference });
      if (raw.spec_section) details.push({ label: "Spec Section", value: raw.spec_section });
      if (raw.question) details.push({ label: "Question", value: raw.question.slice(0, 300) });
      if (raw.cost_impact_amount) details.push({ label: "Cost Impact", value: `$${Number(raw.cost_impact_amount).toLocaleString()}` });
      if (raw.schedule_impact_days) details.push({ label: "Schedule Impact", value: `${raw.schedule_impact_days} days` });
      break;

    case "DWG":
      if (raw.stage) details.push({ label: "Stage", value: raw.stage });
      if (raw.due_date) details.push({ label: "Due Date", value: raw.due_date });
      if (raw.reviewer) details.push({ label: "Reviewer", value: raw.reviewer });
      if (raw.discipline) details.push({ label: "Discipline", value: raw.discipline });
      if (raw.revision_number) details.push({ label: "Revision", value: raw.revision_number });
      break;

    case "SUB":
      if (raw.stage_summary) details.push({ label: "Stage", value: raw.stage_summary });
      if (raw.issued_date) details.push({ label: "Issued", value: raw.issued_date });
      if (raw.set_approved_date) details.push({ label: "Approved", value: raw.set_approved_date });
      if (raw.revision_history) details.push({ label: "History", value: raw.revision_history });
      break;

    case "CO":
      if (raw.co_amount) details.push({ label: "Amount", value: `$${Number(raw.co_amount).toLocaleString()}` });
      if (raw.submitted_date) details.push({ label: "Submitted", value: raw.submitted_date });
      if (raw.reason_code) details.push({ label: "Reason Code", value: raw.reason_code });
      if (raw.description) details.push({ label: "Description", value: raw.description.slice(0, 300) });
      break;

    case "DEL":
      if (raw.scheduled_date) details.push({ label: "Scheduled", value: raw.scheduled_date });
      if (raw.actual_date) details.push({ label: "Actual", value: raw.actual_date });
      if (raw.vendor) details.push({ label: "Vendor", value: raw.vendor });
      if (raw.carrier) details.push({ label: "Carrier", value: raw.carrier });
      if (raw.tracking_number) details.push({ label: "Tracking #", value: raw.tracking_number });
      if (raw.po_number) details.push({ label: "PO #", value: raw.po_number });
      if (raw.pieces) details.push({ label: "Pieces", value: String(raw.pieces) });
      if (raw.weight_tons) details.push({ label: "Weight", value: `${Number(raw.weight_tons).toFixed(1)}T` });
      break;

    case "WP":
      if (raw.phase) details.push({ label: "Phase", value: raw.phase });
      if (raw.status) details.push({ label: "WP Status", value: raw.status });
      if (raw.tonnage) details.push({ label: "Tonnage", value: `${Number(raw.tonnage).toFixed(1)}T` });
      if (raw.crew) details.push({ label: "Crew", value: raw.crew });
      if (raw.released_date) details.push({ label: "Released", value: raw.released_date });
      if (raw.percent_complete != null) details.push({ label: "% Complete", value: `${raw.percent_complete}%` });
      break;

    case "PAY":
      if (raw.period_to) details.push({ label: "Period End", value: raw.period_to });
      if (raw.totalScheduled) details.push({ label: "Scheduled Value", value: `$${raw.totalScheduled.toLocaleString()}` });
      if (raw.totalBilled) details.push({ label: "Billed to Date", value: `$${Math.round(raw.totalBilled).toLocaleString()}` });
      break;

    case "NOTE":
      if (raw.author) details.push({ label: "Author", value: raw.author });
      if (raw.note_date) details.push({ label: "Date", value: raw.note_date });
      if (raw.note) details.push({ label: "Content", value: raw.note.slice(0, 500) });
      break;
  }

  return details;
}

export default function ItemDetailDrawer({ item, onClose }) {
  const navigate = useNavigate();
  const drawerRef = useRef(null);

  useEffect(() => {
    if (item) drawerRef.current?.focus();
  }, [item]);

  if (!item) return null;

  const barColor = URGENCY_COLORS[item.urgency] || "var(--border-default)";
  const details = extractDetails(item);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 1100,
        }}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 420,
          maxWidth: "90vw",
          height: "100vh",
          background: "var(--bg-surface-secondary)",
          borderLeft: "1px solid var(--border-default)",
          zIndex: 1101,
          display: "flex",
          flexDirection: "column",
          outline: "none",
        }}
      >
        {/* Header (fixed) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 20px",
            borderBottom: "1px solid var(--divider)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 4,
              height: 28,
              borderRadius: 2,
              background: barColor,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Space Grotesk', var(--font-display)",
                fontSize: 14,
                fontWeight: 700,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.title}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: barColor,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginTop: 2,
              }}
            >
              {item.urgency} — {item.displayStatus}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close detail drawer"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {details.map((d, i) => (
            <Row key={i} label={d.label} value={d.value} />
          ))}
        </div>

        {/* Footer (pinned) */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--divider)",
            display: "flex",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => {
              if (item.quickAction?.route) navigate(item.quickAction.route);
            }}
            style={{
              flex: 1,
              background: "var(--accent)",
              border: "none",
              borderRadius: 4,
              padding: "8px 16px",
              color: "white",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              cursor: "pointer",
            }}
          >
            {item.quickAction?.label || "Go to Item"}
          </button>
          <button
            onClick={onClose}
            style={{
              background: "var(--bg-surface-low)",
              border: "1px solid var(--border-default)",
              borderRadius: 4,
              padding: "8px 16px",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
