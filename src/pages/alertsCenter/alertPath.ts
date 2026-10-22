/**
 * Where an alert's "Open" goes.
 *
 * Producers disagree on shape. Server alerts (generate_project_alerts, the
 * operational engine) write lowercase record/entity types ('rfi', 'delivery',
 * 'submittal') and an alert_type like 'RFI_SLA_Escalation'; client producers
 * write 'RFI_Overdue' / 'Delivery_Overdue' with related_record_id. The old
 * lookup keyed on 'RFI' and so gave every server alert no Open button at all.
 *
 * Record parameters follow each page: RFIs and WorkPackages read `id`;
 * Submittals, ChangeOrders and DrawingViewer read `recordId`. Deliveries and
 * ActionItems have no per-record link, so they open the page for the project.
 */
export interface AlertLike {
  alert_type?: string | null;
  record_type?: string | null;
  entity_type?: string | null;
  record_id?: string | null;
  related_record_id?: string | null;
  entity_id?: string | null;
  project_id?: string | null;
}

type Target = { page: string; param: string | null };

const TARGETS: ReadonlyArray<[RegExp, Target]> = [
  [/^rfi/, { page: "RFIs", param: "id" }],
  [/^submittal/, { page: "Submittals", param: "recordId" }],
  [/^delivery/, { page: "Deliveries", param: null }],
  [/^change_?order/, { page: "ChangeOrders", param: "recordId" }],
  [/^work_?package/, { page: "WorkPackages", param: "id" }],
  [/^action_?item/, { page: "ActionItems", param: null }],
  [/^drawing/, { page: "DrawingViewer", param: "recordId" }],
];

function targetFor(kind: string | null | undefined): Target | null {
  const k = String(kind ?? "").trim().toLowerCase();
  if (!k) return null;
  return TARGETS.find(([re]) => re.test(k))?.[1] ?? null;
}

export function resolveAlertPath(alert: AlertLike): string | null {
  const target = targetFor(alert.record_type) ?? targetFor(alert.entity_type) ?? targetFor(alert.alert_type);
  if (!target) return null;
  const qs = new URLSearchParams();
  const recordId = alert.record_id || alert.related_record_id || alert.entity_id;
  if (target.param && recordId) qs.set(target.param, String(recordId));
  if (alert.project_id) qs.set("projectId", String(alert.project_id));
  const q = qs.toString();
  return `/${target.page}${q ? `?${q}` : ""}`;
}
