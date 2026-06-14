/**
 * fabStatus.js — the manual fabrication-status vocabulary for the 3D viewer.
 *
 * A hand-set, coarse fab stage per piece (model_elements.fab_status), distinct
 * from the detailing-readiness engine (services/modelElementStatus). Used by the
 * viewer's "Fab" color mode + the click-to-assign control.
 */
export const FAB_STATUS_META = {
  not_started:    { label: "Not Started",    color: "#64748b" },
  in_fabrication: { label: "In Fabrication", color: "#3b82f6" },
  fabricated:     { label: "Fabricated",     color: "#22c55e" },
  shipped:        { label: "Shipped",        color: "#f59e0b" },
  erected:        { label: "Erected",        color: "#16a34a" },
};

/** Stages in shop order — drives the assign buttons + legend. */
export const FAB_STATUS_ORDER = ["not_started", "in_fabrication", "fabricated", "shipped", "erected"];
