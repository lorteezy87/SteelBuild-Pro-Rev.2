/**
 * Pure decision / payload helpers for the RFIs overdue→Alert background pass.
 * Keep entities / React Query / toast / setState out of this module.
 */

export type RfiOverdueAlertCandidate = {
  id: string;
  status?: string | null;
  date_required?: string | null;
  rfi_number?: string | null;
  title?: string | null;
  ball_in_court?: string | null;
  priority?: string | null;
  project_id?: string | null;
};

export type RfiDueUrgency = {
  isOverdue: boolean;
  dueSoon: boolean;
  daysLate: number;
};

export type RfiOverdueAlertPlanItem = {
  rfiId: string;
  projectId: string | null | undefined;
  alertFields: {
    alert_type: "RFI_Overdue";
    severity: "Critical" | "High" | "Medium";
    title: string;
    description: string;
    project_name: string;
    related_record_id: string;
    record_type: "RFI";
  };
};

const CLOSED_STATUSES = new Set(["Answered", "Closed"]);
const MS_PER_DAY = 86400000;

/** Start-of-day Date used by the overdue window (local midnight). */
export function startOfLocalDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Classify an RFI due date relative to `today` (local midnight).
 * Returns null when the date is more than 3 days out (no alert).
 */
export function classifyRfiDueUrgency(
  dateRequired: string,
  today: Date = startOfLocalDay(),
): RfiDueUrgency | null {
  const due = new Date(`${dateRequired}T00:00:00`);
  const in3 = new Date(today.getTime() + 3 * MS_PER_DAY);
  const isOverdue = due < today;
  const dueSoon = !isOverdue && due <= in3;
  if (!isOverdue && !dueSoon) return null;
  const daysLate = isOverdue ? Math.floor((today.getTime() - due.getTime()) / MS_PER_DAY) : 0;
  return { isOverdue, dueSoon, daysLate };
}

/** Severity ladder matching the historical RFIs.jsx overdue pass. */
export function resolveRfiOverdueAlertSeverity(
  priority: string | null | undefined,
  daysLate: number,
): "Critical" | "High" | "Medium" {
  if (priority === "Critical" || daysLate >= 7) return "Critical";
  if (daysLate >= 3 || priority === "High") return "High";
  return "Medium";
}

export function buildRfiOverdueAlertTitle(
  rfiNumber: string | null | undefined,
  isOverdue: boolean,
  daysLate: number,
): string {
  return isOverdue
    ? `${rfiNumber} OVERDUE — ${daysLate}d`
    : `${rfiNumber} due in ≤3 days`;
}

export function buildRfiOverdueAlertDescription(rfi: {
  rfi_number?: string | null;
  title?: string | null;
  ball_in_court?: string | null;
  priority?: string | null;
}): string {
  return `${rfi.rfi_number}: "${(rfi.title || "").slice(0, 60)}" · BIC: ${rfi.ball_in_court || "Contractor"} · Priority: ${rfi.priority}`;
}

/**
 * Decide which open RFIs need a new RFI_Overdue alert and shape their payloads.
 * Dedupes against existing related ids, titles, and in-session created ids.
 */
export function planRfiOverdueAlerts(
  rfis: RfiOverdueAlertCandidate[],
  opts: {
    existingRelatedIds: Set<string>;
    existingTitles: Set<string>;
    alreadyCreatedIds: Set<string>;
    projectMap: Record<string, string>;
    today?: Date;
  },
): RfiOverdueAlertPlanItem[] {
  const today = opts.today ?? startOfLocalDay();
  const planned: RfiOverdueAlertPlanItem[] = [];

  for (const r of rfis) {
    if (CLOSED_STATUSES.has(r.status || "")) continue;
    if (!r.date_required) continue;
    if (opts.alreadyCreatedIds.has(r.id)) continue;

    const urgency = classifyRfiDueUrgency(r.date_required, today);
    if (!urgency) continue;
    if (opts.existingRelatedIds.has(r.id)) continue;

    const title = buildRfiOverdueAlertTitle(r.rfi_number, urgency.isOverdue, urgency.daysLate);
    if (opts.existingTitles.has(title)) continue;

    planned.push({
      rfiId: r.id,
      projectId: r.project_id,
      alertFields: {
        alert_type: "RFI_Overdue",
        severity: resolveRfiOverdueAlertSeverity(r.priority, urgency.daysLate),
        title,
        description: buildRfiOverdueAlertDescription(r),
        project_name: opts.projectMap[r.project_id || ""] || "",
        related_record_id: r.id,
        record_type: "RFI",
      },
    });
  }

  return planned;
}
