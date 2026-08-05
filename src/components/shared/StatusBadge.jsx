import React from "react";
import { STATUS_BADGE_MAP as badgeMap, STATUS_BADGE_DEFAULT as DEFAULT } from "./statusBadgeHelpers";

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
        color: isPill || isIncompleteResponse ? "var(--on-accent)" : s.color,
        border: "none",
        fontFamily: isPill || isIncompleteResponse ? "var(--font-mono)" : "var(--font-body)",
        boxShadow: glowShadow,
        transition: glow ? "box-shadow 0.3s ease" : undefined,
      }}
    >
      {(isPill || isIncompleteResponse) && (
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--on-accent)", display: "inline-block", flexShrink: 0, opacity: 0.7 }} />
      )}
      {isIncompleteResponse ? "INCOMPLETE" : (status || "—")}
    </span>
  );
});

export default StatusBadge;