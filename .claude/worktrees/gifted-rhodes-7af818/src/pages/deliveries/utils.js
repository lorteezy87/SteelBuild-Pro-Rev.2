/**
 * Pure helpers for the Deliveries page — CSV export, day-equality,
 * fabrication-completeness check that gates "mark delivered".
 */

import { PHASE_RANK } from "./constants";

export const isSameDay = (d1, d2) =>
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth()    === d2.getMonth() &&
  d1.getDate()     === d2.getDate();

/**
 * Is the linked work package's fabrication complete enough that this
 * delivery can safely be marked "Delivered"?
 *
 *   - No WP linked        → allow (delivery stands on its own).
 *   - WP not found        → allow (deleted WP — don't block).
 *   - WP in Delivery/Erection phase → allow (fab is behind us).
 *   - WP in Fabrication phase AND status === "Complete" → allow.
 *   - Everything else     → block.
 */
export const isFabComplete = (delivery, workPackages) => {
  if (!delivery.work_package_id) return true;
  const wp = workPackages.find((w) => w.id === delivery.work_package_id);
  if (!wp) return true;
  const rank = PHASE_RANK[wp.phase] ?? 0;
  if (rank >= 2) return true;
  if (rank === 1 && wp.status === "Complete") return true;
  return false;
};

/**
 * CSV export for the Deliveries table.
 *
 * `projectMap` / `wpMap` resolve IDs → display names; they're built in
 * the page shell so we don't duplicate that lookup per-row here.
 */
export function exportDeliveriesCSV(
  deliveries,
  projectMap = {},
  wpMap = {},
  filename = "deliveries.csv",
) {
  const headers = [
    "Project", "Delivery Title", "Work Package", "Vendor", "PO Number",
    "Carrier", "Tracking", "Status",
    "Scheduled Date", "Required Date", "Actual Date",
    "Pieces", "Weight (Tons)", "Priority",
    "Receiving Location", "Received By", "Notes",
  ];
  const rows = deliveries.map((d) => [
    projectMap[d.project_id] || "",
    d.description || "",
    wpMap[d.work_package_id] || "",
    d.vendor || "",
    d.po_number || "",
    d.carrier || "",
    d.tracking_number || "",
    d.status || "",
    d.scheduled_date || "",
    d.required_date || "",
    d.actual_date || "",
    d.pieces || "",
    d.weight_tons || "",
    d.priority || "Normal",
    d.receiving_location || "",
    d.received_by || "",
    (d.notes || "").replace(/,/g, ";"),
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
