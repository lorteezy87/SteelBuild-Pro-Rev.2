/**
 * Domain enums — single source of truth.
 *
 * Every status / priority / category string used in business logic should
 * be imported from here, not typed as a magic string at the call site.
 * This file is the canonical enumeration of values the DB CHECK constraints
 * and UI labels share; drift between the two is the bug class this exists
 * to prevent.
 *
 * The values are typed via `as const`, so the exported types are
 * string-literal unions (e.g. `ActionItemStatus = "Open" | "In Progress"
 * | "Complete" | "Cancelled"`) rather than plain `string`.
 */

// ─── Action items ─────────────────────────────────────────────────────────
export const ACTION_ITEM_STATUS = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  COMPLETE: "Complete",
  CANCELLED: "Cancelled",
} as const;
export type ActionItemStatus = typeof ACTION_ITEM_STATUS[keyof typeof ACTION_ITEM_STATUS];

// ─── Priority (shared across action items, RFIs, change requests, etc.) ──
export const PRIORITY = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
} as const;
export type Priority = typeof PRIORITY[keyof typeof PRIORITY];

export const PRIORITY_ORDER: Record<Priority, number> = {
  [PRIORITY.CRITICAL]: 0,
  [PRIORITY.HIGH]: 1,
  [PRIORITY.MEDIUM]: 2,
  [PRIORITY.LOW]: 3,
};

// ─── RFIs ────────────────────────────────────────────────────────────────
export const RFI_STATUS = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  ANSWERED: "Answered",
  CLOSED: "Closed",
} as const;
export type RfiStatus = typeof RFI_STATUS[keyof typeof RFI_STATUS];

// ─── Change requests / change orders ─────────────────────────────────────
export const CHANGE_REQUEST_STATUS = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  AWAITING_APPROVAL: "Awaiting Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  APPROVED_WITH_CONDITIONS: "Approved with Conditions",
  ON_HOLD: "On Hold",
} as const;
export type ChangeRequestStatus = typeof CHANGE_REQUEST_STATUS[keyof typeof CHANGE_REQUEST_STATUS];

// ─── Constraints ─────────────────────────────────────────────────────────
export const CONSTRAINT_STATUS = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
} as const;
export type ConstraintStatus = typeof CONSTRAINT_STATUS[keyof typeof CONSTRAINT_STATUS];

// "Resolved" + "Closed" are treated identically by most filters / KPIs.
// Use this list rather than re-typing the pair inline.
export const RESOLVED_STATUSES: ReadonlyArray<ConstraintStatus> = [
  CONSTRAINT_STATUS.RESOLVED,
  CONSTRAINT_STATUS.CLOSED,
];

// ─── Contacts ────────────────────────────────────────────────────────────
export const CONTACT_TYPE = {
  OWNER: "Owner",
  GC: "GC",
  ENGINEER: "Engineer",
  SUBCONTRACTOR: "Subcontractor",
  SUPPLIER: "Supplier",
  INSPECTOR: "Inspector",
  INTERNAL: "Internal",
} as const;
export type ContactType = typeof CONTACT_TYPE[keyof typeof CONTACT_TYPE];

// ─── Vendors ─────────────────────────────────────────────────────────────
export const VENDOR_STATUS = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  PROBATION: "Probation",
  SUSPENDED: "Suspended",
} as const;
export type VendorStatus = typeof VENDOR_STATUS[keyof typeof VENDOR_STATUS];

// ─── WBS phases (per the S&H 7-phase structure) ──────────────────────────
export const WBS_PHASE = {
  DETAILING: "Detailing",
  PROCUREMENT: "Procurement",
  FABRICATION: "Fabrication",
  DELIVERY: "Delivery",
  EQUIPMENT: "Equipment",
  INSTALLATION: "Installation",
  CLOSEOUT: "Closeout",
} as const;
export type WbsPhase = typeof WBS_PHASE[keyof typeof WBS_PHASE];

// ─── Drawing stages ──────────────────────────────────────────────────────
export const DRAWING_STAGE = {
  OFA: "OFA",
  BFA: "BFA",
  OFS: "OFS",
  BFS: "BFS",
  FFF: "FFF",
  RELEASED: "Released",
} as const;
export type DrawingStage = typeof DRAWING_STAGE[keyof typeof DRAWING_STAGE];
