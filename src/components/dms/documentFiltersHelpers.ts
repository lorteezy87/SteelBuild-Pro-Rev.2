/**
 * Pure filter option catalogs for DMS DocumentFilters.
 */

export const DMS_FILTER_CATEGORIES = [
  "Blueprint",
  "Shop Drawing",
  "IFC Model",
  "Specification",
  "Submittal",
  "Transmittal",
  "RFI Response",
  "Change Order",
  "Contract",
  "Photo",
  "Report",
  "Correspondence",
  "Permit",
  "Inspection Report",
  "Other",
] as const;

export const DMS_FILTER_DISCIPLINES = [
  "Structural",
  "Architectural",
  "MEP",
  "Civil",
  "Misc Metals",
  "Geotechnical",
  "General",
  "Other",
] as const;

export const DMS_FILTER_STATUSES = [
  "Draft",
  "Under Review",
  "Approved",
  "Approved with Comments",
  "Revise & Resubmit",
  "Rejected",
  "Issued",
  "Superseded",
  "Archived",
  "Void",
] as const;
