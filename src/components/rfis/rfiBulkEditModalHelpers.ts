/** Pure option catalogs for RfiBulkEditModal. */

export const RFI_BULK_PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;
export const RFI_BULK_STATUSES = [
  "Open",
  "Under Review",
  "Incomplete Response",
  "Answered",
  "Closed",
] as const;
export const RFI_BULK_BIC_CHOICES = [
  "Contractor",
  "EOR",
  "Architect",
  "GC",
  "Owner",
] as const;
