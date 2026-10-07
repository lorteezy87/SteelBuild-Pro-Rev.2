interface HealthRecord { health_status?: string | null }
interface PriorityRecord { priority?: string | null }
export interface ExecutiveChartCategory { name: string; value: number; color: string }

const HEALTH_COLORS = [
  { name: "On Track", color: "var(--status-success)" },
  { name: "Watch", color: "var(--status-warning)" },
  { name: "At Risk", color: "var(--status-error)" },
] as const;
const PRIORITY_COLORS = [
  { name: "Critical", color: "var(--status-error)" },
  { name: "High", color: "var(--status-warning)" },
  { name: "Medium", color: "var(--status-info)" },
  { name: "Low", color: "var(--text-muted)" },
] as const;

/** Category colors travel with their values, even when zero-count slices vanish. */
export function buildExecutiveDistributions(
  projects: readonly HealthRecord[],
  rfis: readonly PriorityRecord[],
): { health: ExecutiveChartCategory[]; severity: ExecutiveChartCategory[] } {
  return {
    health: HEALTH_COLORS.map((category) => ({
      ...category,
      value: projects.filter((project) => project.health_status === category.name).length,
    })).filter((category) => category.value > 0),
    severity: PRIORITY_COLORS.map((category) => ({
      ...category,
      value: rfis.filter((rfi) => rfi.priority === category.name).length,
    })).filter((category) => category.value > 0),
  };
}
