/** Pure helpers for Inspections page shell. */
export function filterLiveRecords<T extends { is_deleted?: boolean | null }>(rows: T[]): T[] {
  return (rows || []).filter((r) => !r.is_deleted);
}

export type InspectionLike = {
  inspection_type?: string | null;
  status?: string | null;
  sign_off_status?: string | null;
  [k: string]: unknown;
};

export function filterInspections(
  inspections: InspectionLike[],
  opts: { filterType: string; filterStatus: string },
): InspectionLike[] {
  return (inspections || []).filter((i) => {
    const typeMatch = opts.filterType === "all" || i.inspection_type === opts.filterType;
    const statusMatch = opts.filterStatus === "all" || i.status === opts.filterStatus;
    return typeMatch && statusMatch;
  });
}

export function computeInspectionStats(inspections: InspectionLike[]) {
  return {
    total: inspections.length,
    scheduled: inspections.filter((i) => i.status === "Scheduled").length,
    inProgress: inspections.filter((i) => i.status === "In Progress").length,
    completed: inspections.filter((i) => i.status === "Completed").length,
    approved: inspections.filter((i) => i.sign_off_status === "Approved").length,
    rejected: inspections.filter((i) => i.sign_off_status === "Rejected").length,
  };
}

export function nextStatusFilterToggle(current: string, statusValue: string): string {
  return current === statusValue ? "all" : statusValue;
}

/** Canonical inspection type filter options (form + chips). */
export const INSPECTION_TYPES = [
  "Steel Fabrication",
  "Welds",
  "Material",
  "Dimensional",
  "Surface Prep",
  "Coating",
  "Installation",
  "Connections",
  "Field Verification",
  "Other",
] as const;

export const INSPECTION_TYPE_ABBREV: Record<string, string> = {
  "Steel Fabrication": "Steel Fab",
  "Field Verification": "Field Verify",
  "Surface Prep": "Surf Prep",
};

export const INSPECTION_STATUSES = [
  "Scheduled",
  "In Progress",
  "Completed",
  "On Hold",
  "Cancelled",
] as const;

export const INSPECTION_STATUS_COLORS: Record<string, string> = {
  Scheduled: "var(--status-info, #0EA5E9)",
  "In Progress": "var(--status-warning, #F59E0B)",
  Completed: "var(--status-success, #10B981)",
  "On Hold": "var(--text-muted, #8898A8)",
  Cancelled: "var(--status-error, #FF3B3B)",
};
