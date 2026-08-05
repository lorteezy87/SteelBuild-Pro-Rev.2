/** Pure status catalogs for SetApprovalModal. */

export const SET_APPROVAL_STATUS_OPTS = [
  "approved",
  "rejected",
  "superseded",
] as const;

export const SET_APPROVAL_STATUS_LABELS: Record<string, string> = {
  approved: "Approved",
  rejected: "Rejected",
  superseded: "Superseded",
};
