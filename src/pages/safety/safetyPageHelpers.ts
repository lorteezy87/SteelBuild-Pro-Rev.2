/** Pure helpers for Safety page shell. */
/** @deprecated Prefer `@/pages/shared/filterLiveRecords` — re-export kept for local imports. */
export { filterLiveRecords } from "@/pages/shared/filterLiveRecords";

export type SafetyIncidentLike = {
  incident_type?: string | null;
  severity?: string | null;
  status?: string | null;
  [k: string]: unknown;
};

export function filterSafetyIncidents(
  incidents: SafetyIncidentLike[],
  opts: { filterType: string; filterSeverity: string; filterStatus: string },
): SafetyIncidentLike[] {
  return (incidents || []).filter((i) => {
    const typeMatch = opts.filterType === "all" || i.incident_type === opts.filterType;
    const severityMatch = opts.filterSeverity === "all" || i.severity === opts.filterSeverity;
    const statusMatch = opts.filterStatus === "all" || i.status === opts.filterStatus;
    return typeMatch && severityMatch && statusMatch;
  });
}

export function computeSafetyStats(incidents: SafetyIncidentLike[]) {
  return {
    total: incidents.length,
    critical: incidents.filter((i) => i.severity === "Critical").length,
    high: incidents.filter((i) => i.severity === "High").length,
    injuries: incidents.filter((i) => i.incident_type === "Injury").length,
    nearMisses: incidents.filter((i) => i.incident_type === "Near Miss").length,
    hazards: incidents.filter((i) => i.incident_type === "Hazard").length,
    open: incidents.filter((i) => i.status === "Open").length,
  };
}

export const SAFETY_INCIDENT_TYPES = [
  "Injury",
  "Near Miss",
  "Hazard",
  "Property Damage",
  "Environmental",
  "Behavioral",
  "Equipment Failure",
  "Other",
] as const;

export const SAFETY_SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;

/** Status chip values used on the Safety register filter bar. */
export const SAFETY_STATUS_FILTERS = [
  "all",
  "Open",
  "In Progress",
  "Completed",
  "Closed",
] as const;


/** @deprecated Prefer `@/pages/shared/nextFilterToggle`. */
export { nextFilterToggle } from "@/pages/shared/nextFilterToggle";

export function safetyCommandSubtitle(openCount: number, criticalCount: number): string {
  return `${openCount} open · ${criticalCount} critical · injuries / near-misses / hazards`;
}

export function createEmptySafetyFilters(): {
  filterType: string;
  filterSeverity: string;
  filterStatus: string;
} {
  return {
    filterType: "all",
    filterSeverity: "all",
    filterStatus: "all",
  };
}
