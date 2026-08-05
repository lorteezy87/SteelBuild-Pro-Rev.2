/** Pure risk tone map for SubmittalForecastCard. */

export const FORECAST_RISK_CFG: Record<
  string,
  { color: string; bg: string; border: string }
> = {
  low: {
    color: "var(--status-success)",
    bg: "var(--success-muted)",
    border: "var(--success-border)",
  },
  medium: {
    color: "var(--status-warning)",
    bg: "var(--warning-muted)",
    border: "var(--warning-border)",
  },
  high: {
    color: "var(--status-error)",
    bg: "var(--danger-muted)",
    border: "var(--danger-border)",
  },
};
