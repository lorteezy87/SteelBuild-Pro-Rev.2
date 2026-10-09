/** Resolve dashboard module aliases and canonical route names in one place. */
const DASHBOARD_TARGETS: Readonly<Record<string, string>> = Object.freeze({
  rfis: "RFIs",
  submittals: "Submittals",
  detailing: "DrawingSubmittalHub",
  "work-packages": "WorkPackages",
  deliveries: "Deliveries",
  "change-orders": "ChangeOrders",
  "field-reports": "DailyLogs",
  schedule: "ScheduleHub",
  "fab-release": "FabRelease",
  "budget-hours": "BudgetHours",
  "cost-hub": "CostHub",
  documents: "Documents",
  reports: "ReportsHub",
  procurement: "Procurement",
  field: "FieldHub",
  "daily-logs": "DailyLogs",
  photos: "Photos",
  punchlist: "Punchlist",
  inspections: "Inspections",
  safety: "Safety",
  "quality-control": "QualityControl",
  "piece-register": "PieceRegister",
  contracts: "ContractManagement",
  "command-center": "CommandCenter",
  "job-status-report": "JobStatusReport",
});
const CANONICAL_TARGETS = new Set(Object.values(DASHBOARD_TARGETS));

export interface DashboardNavigationOptions {
  create?: boolean;
  stage?: string;
  status?: string;
  id?: string | number;
  view?: string;
  focus?: string;
}

/** Unknown destinations fail closed; all destinations remain inside the SPA. */
export function resolveDashboardNavigation(
  target: string,
  options: DashboardNavigationOptions | Readonly<Record<string, unknown>> = {},
): string | null {
  const page = Object.prototype.hasOwnProperty.call(DASHBOARD_TARGETS, target)
    ? DASHBOARD_TARGETS[target]
    : CANONICAL_TARGETS.has(target) ? target : null;
  if (!page) return null;
  const params = new URLSearchParams();
  if (options.create === true) params.set("new", "1");
  for (const key of ["stage", "status", "id", "view", "focus"] as const) {
    const value = options[key];
    if ((typeof value === "string" || typeof value === "number") && String(value) !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return `/${page}${query ? `?${query}` : ""}`;
}
