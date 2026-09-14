export const TERMINAL_APPROVED_STATUSES = new Set([
  "Approved",
  "Approved as Noted",
  "Released for Fabrication",
]);

export const SENT_STATUSES = new Set<string>(["Submitted", "Under Review"]);

export const SUBMITTAL_STATUSES = [
  "Draft",
  "Submitted",
  "Under Review",
  "Approved",
  "Approved as Noted",
  "Revise and Resubmit",
  "Rejected",
  "Released for Fabrication",
  "Void",
] as const;

export const OPEN_STATUSES = new Set([
  "Draft",
  "Submitted",
  "Under Review",
  "Revise and Resubmit",
]);

export const TERMINAL_STATUSES = new Set([
  "Approved",
  "Approved as Noted",
  "Released for Fabrication",
  "Void",
]);
