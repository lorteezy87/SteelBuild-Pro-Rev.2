/**
 * Pure column-alias + month catalogs for RFI CSV import.
 */

export const RFI_CSV_COLUMN_ALIASES: Record<string, string[]> = {
  rfi_number: ["rfi #", "rfi number", "rfi no", "number", "no", "no.", "#", "rfi id", "id", "rfi"],
  title: ["subject", "title", "description", "question", "summary"],
  assigned_to: [
    "assigned to", "to", "ball in court", "assignee", "recipient",
    "responsible", "reviewer", "from", "issued to",
  ],
  date_submitted: [
    "date submitted", "submitted", "submitted date", "date", "date issued",
    "issued date", "issue date", "submit date", "submitted on", "date sent",
  ],
  date_required: [
    "date required", "required date", "required", "due date", "due",
    "date due", "response due", "due by", "answer by", "req date", "need by",
  ],
  date_answered: [
    "date answered", "answered date", "answered", "date responded",
    "response date", "responded", "ans date", "closed date", "date closed",
    "date resolved", "response", "answer date",
  ],
  status: ["status", "state", "rfi status"],
};

export const RFI_CSV_JOB_NUMBER_ALIASES = [
  "job number", "job #", "job no", "project number", "project #", "project no", "job", "project",
];

export const RFI_CSV_MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
