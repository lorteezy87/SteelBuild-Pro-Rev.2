/** Pure chart style tokens for BhChartRow. */

import type { CSSProperties } from "react";

export const AXIS_TICK = {
  fill: "var(--text-secondary)",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
};

export const AXIS_LINE = { stroke: "var(--border-default)" };

export const LEGEND_STYLE = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--text-secondary)",
};

export const EMPTY_STYLE: CSSProperties = {
  textAlign: "center",
  padding: 32,
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
};

export const PIE_COLORS: Record<string, string> = {
  Shop: "var(--accent)",
  Field: "#3B82F6",
};
