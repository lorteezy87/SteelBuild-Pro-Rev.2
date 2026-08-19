import { partitionFieldTasks } from "@/lib/field/fieldToday";
import type { PortfolioProjectRollup } from "@/lib/portfolio/projectRollups";

export type OperationalHealthLabel =
  | "On Track"
  | "Watch"
  | "At Risk"
  | "On Hold"
  | "Unknown";

export interface OperationalHealthResult {
  label: OperationalHealthLabel;
  severity: 0 | 1 | 2 | 3 | 4;
  partial: boolean;
  reasons: string[];
}

export interface OperationalHealthInput {
  storedStatus?: string | null;
  onHold?: boolean;
  overdueRfis?: number;
  criticalOverdueRfis?: number;
  overdueScheduleTasks?: number;
  targetDateOverdue?: boolean;
  percentComplete?: number | null;
  rfiEvidenceLoaded: boolean;
  scheduleEvidenceLoaded: boolean;
}

type ProjectRow = Record<string, unknown> & { id?: unknown };
type EvidenceRow = Record<string, unknown>;

const OPEN_RFI_STATUSES = new Set(["open", "under review", "incomplete response"]);

const STORED_SEVERITY: Record<string, 1 | 2 | 3> = {
  "on track": 1,
  good: 1,
  healthy: 1,
  watch: 2,
  warning: 2,
  "at risk": 3,
  critical: 3,
};

function countReason(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function normalizeCount(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

export function deriveOperationalHealth(
  input: OperationalHealthInput,
): OperationalHealthResult {
  const stored = String(input.storedStatus || "").trim().toLowerCase();
  const overdueRfis = normalizeCount(input.overdueRfis);
  const criticalOverdueRfis = normalizeCount(input.criticalOverdueRfis);
  const overdueScheduleTasks = normalizeCount(input.overdueScheduleTasks);
  const recognizedStoredStatus = Object.hasOwn(STORED_SEVERITY, stored);
  const hasPercentComplete =
    typeof input.percentComplete === "number" && Number.isFinite(input.percentComplete);
  const percentComplete = hasPercentComplete
    ? Math.max(0, Math.min(100, Math.round(input.percentComplete as number)))
    : null;
  const partial =
    !input.rfiEvidenceLoaded ||
    !input.scheduleEvidenceLoaded ||
    (!recognizedStoredStatus && stored !== "on hold") ||
    (Boolean(input.targetDateOverdue) && !hasPercentComplete);
  const reasons: string[] = [];

  if (input.targetDateOverdue && percentComplete !== 100) {
    reasons.push(
      percentComplete == null
        ? "Target date overdue; completion unavailable"
        : `Target date overdue at ${percentComplete}% complete`,
    );
  }
  if (overdueRfis > 0) {
    reasons.push(countReason(overdueRfis, "overdue RFI", "overdue RFIs"));
  }
  if (overdueScheduleTasks > 0) {
    reasons.push(
      countReason(
        overdueScheduleTasks,
        "overdue schedule task",
        "overdue schedule tasks",
      ),
    );
  }
  if (!input.rfiEvidenceLoaded) reasons.push("RFI evidence unavailable");
  if (!input.scheduleEvidenceLoaded) reasons.push("Schedule evidence unavailable");

  if (input.onHold || stored === "on hold") {
    return {
      label: "On Hold",
      severity: 4,
      partial,
      reasons: ["Project is on hold", ...reasons],
    };
  }

  let evidenceSeverity: 0 | 2 | 3 = 0;
  if (
    (input.targetDateOverdue && percentComplete != null && percentComplete < 100) ||
    criticalOverdueRfis > 0 ||
    overdueRfis >= 3 ||
    overdueScheduleTasks >= 5
  ) {
    evidenceSeverity = 3;
  } else if (
    (input.targetDateOverdue && percentComplete == null) ||
    overdueRfis > 0 ||
    overdueScheduleTasks > 0
  ) {
    evidenceSeverity = 2;
  }

  const storedSeverity = recognizedStoredStatus ? STORED_SEVERITY[stored] : 0;
  const severity = Math.max(storedSeverity, evidenceSeverity) as 0 | 1 | 2 | 3;
  const label: OperationalHealthLabel =
    severity === 3
      ? "At Risk"
      : severity === 2
        ? "Watch"
        : severity === 1
          ? "On Track"
          : "Unknown";

  return { label, severity, partial, reasons };
}

function isOverdueRfi(row: EvidenceRow, todayIso: string): boolean {
  const due = String(row.date_required || row.due_date || "").slice(0, 10);
  const status = String(row.status || "").trim().toLowerCase();
  return OPEN_RFI_STATUSES.has(status) && Boolean(due) && due < todayIso;
}

export function buildOperationalHealthIndex(
  projects: ProjectRow[],
  rfis: EvidenceRow[],
  scheduleTasks: EvidenceRow[],
  todayIso: string,
  evidence: { rfiEvidenceLoaded: boolean; scheduleEvidenceLoaded: boolean },
): Record<string, OperationalHealthResult> {
  const results: Record<string, OperationalHealthResult> = {};

  for (const project of projects) {
    const projectId = String(project.id || "");
    if (!projectId) continue;

    const projectRfis = rfis.filter(
      (row) => String(row.project_id || "") === projectId,
    );
    const projectTasks = scheduleTasks.filter(
      (row) => String(row.project_id || "") === projectId,
    );
    const overdueRows = projectRfis.filter((row) => isOverdueRfi(row, todayIso));
    const overdueScheduleTasks = partitionFieldTasks(projectTasks, todayIso).recovery.length;
    const targetDate = String(project.target_completion_date || "").slice(0, 10);
    const rawPercent = project.scope_complete_pct_override ?? project.percent_complete;
    const percentComplete =
      typeof rawPercent === "number" && Number.isFinite(rawPercent) ? rawPercent : null;

    results[projectId] = deriveOperationalHealth({
      storedStatus: String(project.health_status || ""),
      onHold: project.on_hold === true || String(project.status || "").toLowerCase() === "on hold",
      overdueRfis: overdueRows.length,
      criticalOverdueRfis: overdueRows.filter(
        (row) => String(row.priority || "").toLowerCase() === "critical",
      ).length,
      overdueScheduleTasks,
      targetDateOverdue: Boolean(targetDate) && targetDate < todayIso,
      percentComplete,
      ...evidence,
    });
  }

  return results;
}

export function buildOperationalHealthIndexFromRollups(
  projects: ProjectRow[],
  rollups: Array<Pick<
    PortfolioProjectRollup,
    "project_id" | "ops_overdue_rfis" | "critical_overdue_rfis" | "overdue_schedule_tasks"
  >>,
  todayIso: string,
): Record<string, OperationalHealthResult> {
  const byId = new Map(rollups.map((row) => [String(row.project_id), row]));
  const results: Record<string, OperationalHealthResult> = {};

  for (const project of projects) {
    const projectId = String(project.id || "");
    if (!projectId) continue;
    const rollup = byId.get(projectId);
    const targetDate = String(project.target_completion_date || "").slice(0, 10);
    const rawPercent = project.scope_complete_pct_override ?? project.percent_complete;
    const percentComplete =
      typeof rawPercent === "number" && Number.isFinite(rawPercent) ? rawPercent : null;

    results[projectId] = deriveOperationalHealth({
      storedStatus: String(project.health_status || ""),
      onHold: project.on_hold === true || String(project.status || "").toLowerCase() === "on hold",
      overdueRfis: rollup?.ops_overdue_rfis ?? 0,
      criticalOverdueRfis: rollup?.critical_overdue_rfis ?? 0,
      overdueScheduleTasks: rollup?.overdue_schedule_tasks ?? 0,
      targetDateOverdue: Boolean(targetDate) && targetDate < todayIso,
      percentComplete,
      rfiEvidenceLoaded: true,
      scheduleEvidenceLoaded: true,
    });
  }

  return results;
}

export function capHealthScore(
  score: number,
  health: OperationalHealthResult,
): number {
  const normalized = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  if (health.label === "At Risk" || health.label === "On Hold") {
    return Math.min(normalized, 69);
  }
  if (health.label === "Watch") return Math.min(normalized, 84);
  return normalized;
}
