/** Presentational style tokens for FeatureFlagsAdmin. */
import type { CSSProperties } from "react";

export const featureFlagsInputStyle: CSSProperties = {
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  color: "var(--text-primary)",
  outline: "none",
  fontFamily: "var(--font-body)",
};

export const featureFlagsCellLabelStyle: CSSProperties = {
  color: "var(--text-primary)",
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: "0.05em",
};
