import { mono } from "./drawingsConfig";

/**
 * Red "OVERDUE" micro-badge for drawings past their due date.
 */
export function OverdueBadge() {
  return (
    <span style={{
      ...mono,
      fontSize: 8,
      fontWeight: 700,
      letterSpacing: "0.1em",
      color: "var(--status-error)",
      background: "var(--danger-muted)",
      border: "1px solid var(--danger-border, rgba(239,68,68,0.3))",
      borderRadius: 2,
      padding: "1px 5px",
    }}>
      OVERDUE
    </span>
  );
}

/**
 * Shows linked RFI count with open/resolved status coloring.
 * @param {{ linkedIds: string, rfiMap: Record<string, object> }} props
 */
export function RFILinkBadge({ linkedIds, rfiMap }) {
  if (!linkedIds) return null;
  const nums = linkedIds.split(",").map(s => s.trim()).filter(Boolean);
  if (nums.length === 0) return null;

  const openCount = nums.filter(n => {
    const rfi = rfiMap[n];
    return rfi && rfi.status !== "Closed" && rfi.status !== "Answered";
  }).length;
  const closedCount = nums.length - openCount;

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
      <span style={{
        ...mono,
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.06em",
        padding: "1px 6px",
        borderRadius: 2,
        background: openCount > 0 ? "rgba(245,158,11,0.12)" : "rgba(16,185,129,0.12)",
        border: `1px solid ${openCount > 0 ? "rgba(245,158,11,0.25)" : "rgba(16,185,129,0.25)"}`,
        color: openCount > 0 ? "var(--status-warning)" : "var(--status-success)",
      }}>
        {openCount > 0
          ? `${openCount} OPEN RFI${openCount !== 1 ? "S" : ""}`
          : `${closedCount} RFI${closedCount !== 1 ? "S" : ""} RESOLVED`}
      </span>
      {nums.map(n => (
        <span key={n} style={{
          ...mono,
          fontSize: 8,
          color: rfiMap[n] && rfiMap[n].status !== "Closed" && rfiMap[n].status !== "Answered"
            ? "var(--status-warning)"
            : "var(--text-muted)",
          opacity: 0.8,
        }}>{n}</span>
      ))}
    </div>
  );
}

/**
 * Red "SUPERSEDED" micro-badge for drawings that have been replaced.
 */
export function SupersededBadge() {
  return (
    <span style={{
      ...mono,
      fontSize: 7,
      fontWeight: 700,
      letterSpacing: "0.1em",
      color: "var(--status-error)",
      background: "rgba(239,68,68,0.10)",
      border: "1px solid rgba(239,68,68,0.25)",
      borderRadius: 2,
      padding: "1px 5px",
      whiteSpace: "nowrap",
    }}>
      SUPERSEDED
    </span>
  );
}
