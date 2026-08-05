/**
 * Pure urgency rank / agenda label catalogs for Command Center.
 * Scales differ intentionally across consumers — keep separate maps.
 */

/** RFI agenda: lower rank leads the meeting list. */
export const RFI_AGENDA_URGENCY_RANK: Record<string, number> = {
  overdue: 0,
  blocking: 1,
  "due-soon": 2,
  awaiting: 3,
};

export const RFI_AGENDA_GROUP_LABEL: Record<string, string> = {
  overdue: "Overdue",
  blocking: "Blocking",
  "due-soon": "Due Soon",
  awaiting: "Awaiting Response",
};

export const RFI_AGENDA_URGENCIES = new Set(["overdue", "blocking", "due-soon", "awaiting"]);

/** Feed default sort: lower rank sorts first. */
export const FEED_SORT_URGENCY_RANK: Record<string, number> = {
  overdue: 0,
  blocking: 1,
  "due-soon": 2,
  awaiting: 3,
  normal: 4,
};

/** Feed aggregator max-urgency picker: higher rank wins. */
export const FEED_AGG_URGENCY_RANK: Record<string, number> = {
  overdue: 5,
  blocking: 4,
  "due-soon": 3,
  awaiting: 2,
  normal: 1,
};
