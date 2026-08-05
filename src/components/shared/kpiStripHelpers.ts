/**
 * Pure accent palette for KPIStrip tiles.
 */

export const KPI_ACCENT_MAP: Record<string, { color: string; bg: string }> = {
  blue: { color: "var(--status-info)", bg: "rgba(96,165,250,0.07)" },
  green: { color: "var(--status-success)", bg: "rgba(34,197,94,0.07)" },
  amber: { color: "var(--status-warning)", bg: "rgba(245,158,11,0.07)" },
  rose: { color: "var(--status-error)", bg: "rgba(239,68,68,0.07)" },
  // "purple" is a legacy prop name — callers still pass color="purple".
  // Actual color is industrial amber; true purple read as out-of-place.
  purple: { color: "var(--status-warning)", bg: "rgba(245,158,11,0.07)" },
  slate: { color: "var(--accent)", bg: "rgba(200,155,32,0.06)" },
};

export function resolveKpiAccent(color: string | null | undefined) {
  return KPI_ACCENT_MAP[color || "slate"] || KPI_ACCENT_MAP.slate;
}
