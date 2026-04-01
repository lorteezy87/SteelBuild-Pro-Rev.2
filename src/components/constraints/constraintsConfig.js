export const CONSTRAINT_TYPES = [
  "Missing Embeds",
  "Anchor Bolt Issue",
  "Approved Submittal Missing",
  "Release Pending",
  "Field Measurement Needed",
  "Access Issue",
  "Crane / Logistics Conflict",
  "Predecessor Not Complete",
  "Material Not Available",
  "Design Change Pending",
  "Other",
];

export const TYPE_COLORS = {
  "Missing Embeds": "var(--status-error)",
  "Anchor Bolt Issue": "var(--status-error)",
  "Approved Submittal Missing": "var(--status-warning)",
  "Release Pending": "var(--status-warning)",
  "Field Measurement Needed": "var(--accent)",
  "Access Issue": "var(--status-error)",
  "Crane / Logistics Conflict": "var(--status-error)",
  "Predecessor Not Complete": "var(--status-warning)",
  "Material Not Available": "var(--status-warning)",
  "Design Change Pending": "var(--accent)",
  Other: "var(--text-muted)",
};

export const TYPE_ICONS = {
  "Missing Embeds": "EMB",
  "Anchor Bolt Issue": "AB",
  "Approved Submittal Missing": "SUB",
  "Release Pending": "REL",
  "Field Measurement Needed": "FLD",
  "Access Issue": "ACC",
  "Crane / Logistics Conflict": "CRN",
  "Predecessor Not Complete": "PRE",
  "Material Not Available": "MAT",
  "Design Change Pending": "DSN",
  Other: "OTH",
};

export const PRIORITY_CONFIG = {
  Critical: { color: "var(--status-error)", bg: "var(--danger-muted)", border: "var(--danger-border)", dot: "#FF4444" },
  High: { color: "var(--status-warning)", bg: "var(--warning-muted)", border: "var(--warning-border)", dot: "#FFB95F" },
  Medium: { color: "var(--accent)", bg: "var(--accent-muted)", border: "var(--accent-border)", dot: "#7BD0FF" },
  Low: { color: "var(--text-muted)", bg: "rgba(144,144,149,0.1)", border: "rgba(144,144,149,0.25)", dot: "#909095" },
};

export const STATUS_CONFIG = {
  Open: { color: "var(--status-warning)", bg: "var(--warning-muted)", label: "OPEN" },
  "In Progress": { color: "var(--accent)", bg: "var(--accent-muted)", label: "IN PROGRESS" },
  Resolved: { color: "var(--status-success)", bg: "var(--success-muted)", label: "RESOLVED" },
  Closed: { color: "var(--text-muted)", bg: "rgba(144,144,149,0.1)", label: "CLOSED" },
};

export const inputStyle = {
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

export const labelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 4,
};

export function formatDate(d) {
  if (!d) return "-";
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(d) {
  if (!d) return "-";
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function abbreviateType(type) {
  const map = {
    "Missing Embeds": "EMBEDS",
    "Anchor Bolt Issue": "ANCHOR BOLT",
    "Approved Submittal Missing": "SUBMITTAL",
    "Release Pending": "RELEASE",
    "Field Measurement Needed": "FIELD MEAS",
    "Access Issue": "ACCESS",
    "Crane / Logistics Conflict": "CRANE/LOG",
    "Predecessor Not Complete": "PREDEC",
    "Material Not Available": "MATERIAL",
    "Design Change Pending": "DESIGN CHG",
    Other: "OTHER",
  };
  return map[type] || (type || "").slice(0, 10).toUpperCase();
}
