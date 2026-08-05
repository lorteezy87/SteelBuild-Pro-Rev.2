/** Pure helpers for Safety page shell. */
export function filterLiveRecords<T extends { is_deleted?: boolean | null }>(rows: T[]): T[] {
  return (rows || []).filter((r) => !r.is_deleted);
}

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
