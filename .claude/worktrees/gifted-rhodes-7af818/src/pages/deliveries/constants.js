/**
 * Shared constants for the Deliveries page — status palette + status
 * list used by KPIs, filter pills, detail-drawer workflow buttons.
 */

export const STATUS_COLORS = {
  Scheduled:    { bg: "rgba(234,179,8,0.18)",  text: "var(--status-warning)", border: "var(--status-warning)" },
  "In Transit": { bg: "rgba(0,229,255,0.06)",  text: "var(--status-info)",    border: "var(--status-info)"    },
  Delivered:    { bg: "rgba(34,197,94,0.18)",  text: "var(--status-success)", border: "var(--status-success)" },
  Partial:      { bg: "rgba(251,146,60,0.20)", text: "var(--status-warning)", border: "var(--status-warning)" },
  Rejected:     { bg: "rgba(239,68,68,0.20)",  text: "var(--status-error)",   border: "var(--status-error)"   },
};

export const statusList = ["Scheduled", "In Transit", "Delivered", "Partial", "Rejected"];

/** Phase rank used by `isFabComplete` to gate "mark delivered" actions. */
export const PHASE_RANK = { Detailing: 0, Fabrication: 1, Delivery: 2, Erection: 3 };
