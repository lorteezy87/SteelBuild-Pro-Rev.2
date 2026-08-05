/**
 * Pure preference catalogs for Settings DashboardTab.
 */

export const AVAILABLE_KPIS = [
  { id: 'open_rfis',        label: 'Open RFIs' },
  { id: 'pending_cos',      label: 'Pending Change Orders' },
  { id: 'contract_value',   label: 'Contract Value' },
  { id: 'work_packages',    label: 'Work Packages' },
  { id: 'deliveries',       label: 'Upcoming Deliveries' },
  { id: 'overdue_items',    label: 'Overdue Items' },
  { id: 'open_submittals',  label: 'Open Submittals' },
  { id: 'expenses',         label: 'Expenses' },
  { id: 'rfis_blocking_fab', label: 'RFIs Blocking Fab' },
] as const;

export const KPI_IDS = AVAILABLE_KPIS.map((k) => k.id);

/** Drop stale/unknown ids; fall back to full set. */
export function sanitizeKpis(arr: unknown): string[] {
  const valid = Array.isArray(arr)
    ? arr.filter((id): id is string => typeof id === "string" && (KPI_IDS as readonly string[]).includes(id))
    : [];
  return valid.length ? valid : [...KPI_IDS];
}

export const AVAILABLE_MODULES = [
  { id: 'Projects',      label: 'Projects' },
  { id: 'Vendors',       label: 'Vendors' },
  { id: 'Drawings',      label: 'Drawings' },
  { id: 'RFIs',          label: 'RFIs' },
  { id: 'ChangeOrders',  label: 'Change Orders' },
  { id: 'Submittals',    label: 'Submittals' },
  { id: 'Deliveries',    label: 'Deliveries' },
  { id: 'DailyLogs',     label: 'Daily Logs' },
  { id: 'Inspections',   label: 'Inspections' },
  { id: 'WorkPackages',  label: 'Work Packages' },
] as const;

export const LANDING_PAGES = [
  { id: 'Dashboard',           label: 'Dashboard' },
  { id: 'DrawingSubmittalHub', label: 'Detailing Control Center' },
  { id: 'CommandCenter',       label: 'Command Center' },
  { id: 'Projects',            label: 'Projects' },
  { id: 'RFIs',                label: 'RFIs' },
  { id: 'Drawings',            label: 'Drawings (Full Editor)' },
  { id: 'FieldToday',          label: 'Field Today' },
  { id: 'DailyLogs',           label: 'Daily Logs' },
  { id: 'Deliveries',          label: 'Deliveries' },
  { id: 'ChangeOrders',        label: 'Change Orders' },
  { id: 'JobStatusReport',     label: 'Job Status Report' },
] as const;
