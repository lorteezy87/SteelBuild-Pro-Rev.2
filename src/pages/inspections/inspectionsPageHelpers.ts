/** Pure helpers for Inspections page shell. */
import { nextFilterToggle } from "@/pages/shared/nextFilterToggle";

/** @deprecated Prefer `@/pages/shared/filterLiveRecords` — re-export kept for local imports. */
export { filterLiveRecords } from "@/pages/shared/filterLiveRecords";

export type InspectionLike = {
  id?: string | null;
  inspection_type?: string | null;
  status?: string | null;
  sign_off_status?: string | null;
  findings?: string | null;
  corrective_actions?: string | null;
  description?: string | null;
  location?: string | null;
  deficiencies_count?: string | number | null;
  metadata?: Record<string, unknown> | null;
  project_id?: string | null;
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

/** KPI status toggle — alias of shared nextFilterToggle. */
export function nextStatusFilterToggle(current: string, statusValue: string): string {
  return nextFilterToggle(current, statusValue);
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

export function inspectionsCommandSubtitle(
  filterType: string,
  filterStatus: string,
): string {
  const base = "Welds · material · connections · coatings";
  return filterType !== "all" || filterStatus !== "all" ? `${base} · (filtered)` : base;
}

export function resolveDeficiencyCount(
  deficienciesCount: string | number | null | undefined,
): number {
  return Math.max(1, parseInt(String(deficienciesCount ?? ""), 10) || 1);
}

export function inspectionNumberLabel(id: string | null | undefined): string {
  return id ? `INSP-${String(id).slice(0, 8)}` : "Inspection";
}

export function baseDeficiencyDescription(inspection: InspectionLike): string {
  return (
    inspection.findings ||
    inspection.corrective_actions ||
    inspection.description ||
    "Deficiency from inspection"
  );
}

export function formatDeficiencyDescription(
  inspNumber: string,
  baseDescription: string,
  index: number,
  count: number,
): string {
  return count > 1
    ? `[${inspNumber} #${index + 1}/${count}] ${baseDescription}`
    : `[${inspNumber}] ${baseDescription}`;
}

export type PunchlistCreateFromInspection = {
  description: string;
  category: string;
  location: string;
  assigned_to: string;
  priority: string;
  status: string;
  percent_complete: number;
  notes: string;
  inspection_id: string | null | undefined;
  metadata: {
    inspection_id: string | null | undefined;
    inspection_number: string;
    inspection_type: string | null | undefined;
    deficiency_index: number;
    deficiency_count: number;
  };
};

/** Pure payloads for PunchlistItem.create when converting an inspection. */
export function buildPunchlistCreatePayloadsFromInspection(
  inspection: InspectionLike,
): PunchlistCreateFromInspection[] {
  const count = resolveDeficiencyCount(inspection.deficiencies_count);
  const baseDescription = baseDeficiencyDescription(inspection);
  const inspNumber = inspectionNumberLabel(inspection.id);
  const priority =
    inspection.sign_off_status === "Rejected" ? "High" : "Medium";
  const items: PunchlistCreateFromInspection[] = [];
  for (let i = 0; i < count; i++) {
    items.push({
      description: formatDeficiencyDescription(
        inspNumber,
        baseDescription,
        i,
        count,
      ),
      category: "Other",
      location: inspection.location || "",
      assigned_to: "",
      priority,
      status: "Open",
      percent_complete: 0,
      notes: inspection.corrective_actions || "",
      inspection_id: inspection.id,
      metadata: {
        inspection_id: inspection.id,
        inspection_number: inspNumber,
        inspection_type: inspection.inspection_type,
        deficiency_index: i + 1,
        deficiency_count: count,
      },
    });
  }
  return items;
}

export function buildInspectionPunchlistConvertedStamp(
  count: number,
  ids: Array<string | null | undefined>,
  at: string,
): { count: number; at: string; ids: Array<string | null | undefined> } {
  return { count, at, ids };
}

export function mergeInspectionMetadataWithConverted(
  existing: Record<string, unknown> | null | undefined,
  stamp: { count: number; at: string; ids: Array<string | null | undefined> },
): Record<string, unknown> {
  return {
    ...(existing || {}),
    punchlist_converted: stamp,
  };
}

export function createEmptyInspectionFilters(): {
  filterType: string;
  filterStatus: string;
} {
  return { filterType: "all", filterStatus: "all" };
}
