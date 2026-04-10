import React from "react";

/**
 * Shows an up/down trend arrow with delta value.
 * @param {number} current   Current value
 * @param {number} previous  Previous value (e.g. yesterday)
 * @param {boolean} invert   If true, "down" is good (green) — e.g. for overdue counts
 * @param {string}  suffix   Text suffix (default "")
 */
export default function TrendIndicator({
  current,
  previous,
  invert = false,
  suffix = "",
}) {
  if (previous == null || current == null) return null;

  const delta = current - previous;
  if (delta === 0) return null;

  const isUp = delta > 0;
  const isGood = invert ? !isUp : isUp;
  const color = isGood ? "var(--status-success)" : "var(--status-error)";
  const arrow = isUp ? "\u25B2" : "\u25BC"; // ▲ ▼

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        color,
        letterSpacing: "0.02em",
      }}
      title={`${isUp ? "+" : ""}${delta}${suffix} vs previous`}
    >
      <span style={{ fontSize: 7 }}>{arrow}</span>
      {isUp ? "+" : ""}
      {delta}
      {suffix}
    </span>
  );
}
