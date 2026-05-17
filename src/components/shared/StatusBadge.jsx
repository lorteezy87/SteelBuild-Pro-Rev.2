import React from "react";

const badgeMap = {
  // ── Pending / In Progress ──
  "Open":           { color: "var(--status-warning)", bg: "var(--warning-muted)",  border: "var(--warning-border)" },
  "In Progress":    { color: "var(--status-warning)", bg: "var(--warning-muted)",  border: "var(--warning-border)" },
  "Active":         { color: "var(--status-warning)", bg: "var(--warning-muted)",  border: "var(--warning-border)" },

  // ── Success / Complete / Approved / Delivered ──
  "Available":      { color: "var(--status-success)", bg: "var(--success-muted)",  border: "var(--success-border)" },
  "Complete":       { color: "var(--status-success)", bg: "var(--success-muted)",  border: "var(--success-border)" },
  "Answered":       { color: "var(--status-success)", bg: "var(--success-muted)",  border: "var(--success-border)" },
  "Approved":       { color: "var(--status-success)", bg: "var(--success-muted)",  border: "var(--success-border)" },
  "Released":       { color: "var(--status-success)", bg: "var(--success-muted)",  border: "var(--success-border)" },
  "On Track":       { color: "var(--status-success)", bg: "var(--success-muted)",  border: "var(--success-border)" },
  "Delivered":      { color: "var(--status-success)", bg: "var(--success-muted)",  border: "var(--success-border)" },
  "Certified":      { color: "var(--status-success)", bg: "var(--success-muted)",  border: "var(--success-border)" },
  "Paid":           { color: "var(--status-success)", bg: "var(--success-muted)",  border: "var(--success-border)" },
  "Closeout":       { color: "var(--status-success)", bg: "var(--success-muted)",  border: "var(--success-border)" },
  "IFC":            { color: "var(--status-success)", bg: "var(--success-muted)",  border: "var(--success-border)" },
  "Kickoff":        { color: "var(--status-success)", bg: "var(--success-muted)",  border: "var(--success-border)" },
  "Supplier":       { color: "var(--status-success)", bg: "var(--success-muted)",  border: "var(--success-border)" },

  // ── Info / Teal ──
  "Under Review":   { color: "var(--status-info)", bg: "var(--info-muted)",  border: "var(--info-border)" },
  "Submitted":      { color: "var(--status-info)", bg: "var(--info-muted)",  border: "var(--info-border)" },
  "In Transit":     { color: "var(--status-info)", bg: "var(--info-muted)",  border: "var(--info-border)" },
  "Scheduled":      { color: "var(--status-info)", bg: "var(--info-muted)",  border: "var(--info-border)" },
  "Allocated":      { color: "var(--status-info)", bg: "var(--info-muted)",  border: "var(--info-border)" },
  "Detailing":      { color: "var(--status-info)", bg: "var(--info-muted)",  border: "var(--info-border)" },
  "OFA":            { color: "var(--status-info)", bg: "var(--info-muted)",  border: "var(--info-border)" },
  "OFS":            { color: "var(--status-info)", bg: "var(--info-muted)",  border: "var(--info-border)" },
  "BFA":            { color: "var(--status-info)", bg: "var(--info-muted)",  border: "var(--info-border)" },
  "IFR":            { color: "var(--status-info)", bg: "var(--info-muted)",  border: "var(--info-border)" },
  "IFA":            { color: "var(--status-info)", bg: "var(--info-muted)",  border: "var(--info-border)" },
  "IFB":            { color: "var(--status-info)", bg: "var(--info-muted)",  border: "var(--info-border)" },
  "GC":             { color: "var(--status-info)", bg: "var(--info-muted)",  border: "var(--info-border)" },
  "Inspector":      { color: "var(--status-info)", bg: "var(--info-muted)",  border: "var(--info-border)" },
  "Progress":       { color: "var(--status-info)", bg: "var(--info-muted)",  border: "var(--info-border)" },

  // ── Danger / Overdue / Rejected ──
  "Critical":            { color: "var(--status-error)", bg: "var(--danger-muted)",  border: "var(--danger-border)", glow: "0 0 12px var(--status-error)33" },
  "At Risk":             { color: "var(--status-error)", bg: "var(--danger-muted)",  border: "var(--danger-border)" },
  "Rejected":            { color: "var(--status-error)", bg: "var(--danger-muted)",  border: "var(--danger-border)" },
  "Delayed":             { color: "var(--status-error)", bg: "var(--danger-muted)",  border: "var(--danger-border)" },
  "Over-Allocated":      { color: "var(--status-error)", bg: "var(--danger-muted)",  border: "var(--danger-border)" },
  // RFI: GC replied but the response was incomplete — needs another round.
  // Treated as still-open by closed-state filters.
  "Incomplete Response": { color: "var(--status-error)", bg: "var(--danger-muted)",  border: "var(--danger-border)" },

  // ── Amber Warning ──
  "Watch":          { color: "var(--status-warning)", bg: "var(--warning-muted)",  border: "var(--warning-border)" },
  "On Hold":        { color: "var(--status-warning)", bg: "var(--warning-muted)",  border: "var(--warning-border)" },
  "Partial":        { color: "var(--status-warning)", bg: "var(--warning-muted)",  border: "var(--warning-border)" },
  "Erection":       { color: "var(--status-warning)", bg: "var(--warning-muted)",  border: "var(--warning-border)" },
  "Fabrication":    { color: "var(--status-warning)", bg: "var(--warning-muted)",  border: "var(--warning-border)" },
  "High":           { color: "var(--status-error)", bg: "var(--danger-muted)", border: "var(--danger-border)" },
  "Safety":         { color: "var(--status-error)", bg: "var(--danger-muted)", border: "var(--danger-border)" },

  // ── Purple / Draft ──
  "Draft":          { color: "var(--accent)", bg: "var(--accent-muted)", border: "var(--accent-border)" },
  "OAC":            { color: "var(--accent)", bg: "var(--accent-muted)", border: "var(--accent-border)" },
  "Owner":          { color: "var(--accent)", bg: "var(--accent-muted)", border: "var(--accent-border)" },
  "Engineer":       { color: "var(--accent)", bg: "var(--accent-muted)", border: "var(--accent-border)" },
  "Subcontractor":  { color: "var(--accent)", bg: "var(--accent-muted)", border: "var(--accent-border)" },

  // ── Neutral / Muted ──
  "Closed":         { color: "var(--text-muted)", bg: "var(--hover-bg)", border: "var(--border-default)" },
  "Void":           { color: "var(--text-muted)", bg: "var(--hover-bg)", border: "var(--border-default)" },
  "Cancelled":      { color: "var(--text-muted)", bg: "var(--hover-bg)", border: "var(--border-default)" },
  "Superseded":     { color: "var(--text-muted)", bg: "var(--hover-bg)", border: "var(--border-default)" },
  "Archived":       { color: "var(--text-muted)", bg: "var(--hover-bg)", border: "var(--border-default)" },
  "Not Started":    { color: "var(--text-muted)", bg: "var(--hover-bg)", border: "var(--border-default)" },
  "Pending":        { color: "var(--text-muted)", bg: "var(--hover-bg)", border: "var(--border-default)" },
  "On Leave":       { color: "var(--text-muted)", bg: "var(--hover-bg)", border: "var(--border-default)" },
  "Internal":       { color: "var(--text-muted)", bg: "var(--hover-bg)", border: "var(--border-default)" },
  "Medium":         { color: "var(--text-muted)", bg: "var(--hover-bg)", border: "var(--border-default)" },
  "Low":            { color: "var(--text-muted)", bg: "var(--hover-bg)", border: "var(--border-default)" },
  "Other":          { color: "var(--text-muted)", bg: "var(--hover-bg)", border: "var(--border-default)" },
};

const DEFAULT = { color: "var(--text-muted)", bg: "var(--hover-bg)", border: "var(--border-default)" };

const StatusBadge = React.memo(function StatusBadge({ status, variant, glow }) {
  const s = badgeMap[status] || DEFAULT;
  const isPill = variant === "pill";
  // "Incomplete Response" is a long label that doesn't fit narrow status
  // cells, AND it's a still-open / needs-action state that should read as
  // unambiguously red. Render it as a compact solid-red pill (white on red,
  // smaller font, tighter padding) regardless of variant.
  const isIncompleteResponse = status === "Incomplete Response";
  const glowShadow = glow ? (s.glow || `0 0 10px ${s.color}33`) : undefined;
  return (
    <span
      title={isIncompleteResponse ? "Incomplete Response" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: isPill || isIncompleteResponse ? 4 : undefined,
        padding: isPill || isIncompleteResponse ? "2px 8px" : "3px 10px",
        borderRadius: 9999,
        fontSize: isIncompleteResponse ? 9 : isPill ? 9 : 11,
        fontWeight: isPill || isIncompleteResponse ? 700 : 600,
        letterSpacing: isPill || isIncompleteResponse ? "0.06em" : "0.02em",
        textTransform: isPill || isIncompleteResponse ? "uppercase" : undefined,
        whiteSpace: "nowrap",
        background: isPill || isIncompleteResponse ? s.color : s.bg,
        color: isPill || isIncompleteResponse ? "#fff" : s.color,
        border: "none",
        fontFamily: isPill || isIncompleteResponse ? "var(--font-mono)" : "var(--font-body)",
        boxShadow: glowShadow,
        transition: glow ? "box-shadow 0.3s ease" : undefined,
      }}
    >
      {(isPill || isIncompleteResponse) && (
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", display: "inline-block", flexShrink: 0, opacity: 0.7 }} />
      )}
      {isIncompleteResponse ? "INCOMPLETE" : (status || "—")}
    </span>
  );
});

export default StatusBadge;