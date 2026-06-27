/**
 * drawingHub/constants.js — Public constants for the drawing hub.
 *
 * Extracted from src/lib/drawingHub.js as part of the modular split.
 * This file MUST NOT change values; consumers re-export them through
 * src/lib/drawingHub.js (the barrel) so existing imports keep working.
 */

// The set of record types the app can currently link to a zone. Mirrors
// the drawing_links.linked_record_type CHECK constraint — keep in sync
// if the migration's allow-list changes.
export const LINKABLE_TYPES = [
  "rfi",
  "work_package",
  "delivery",
  "photo",
  "inspection",
  "daily_log",
  "document",
  "change_order",
  "submittal",
  "drawing",
  "finding",
];

// Friendly labels for UI chips + tabs.
export const LINKABLE_TYPE_LABELS = {
  rfi:           "RFI",
  work_package:  "Work Package",
  delivery:      "Delivery",
  photo:         "Photo",
  inspection:    "Inspection",
  daily_log:     "Daily Log",
  document:      "Document",
  change_order:  "Change Order",
  submittal:     "Submittal",
  drawing:       "Drawing",
  finding:       "Finding",
};

// Status priority order used when multiple zones overlap visually or
// when the rule engine needs a deterministic pick. Matches the spec:
// red > amber > purple > blue > green > neutral.
export const STATUS_PRIORITY = ["red", "amber", "purple", "blue", "green", "neutral"];
export const ALL_STATUSES    = STATUS_PRIORITY;

// Mirrors drawing_zones.zone_type CHECK constraint exactly.
export const ZONE_TYPES = [
  "area",
  "detail",
  "bay",
  "erection_zone",
  "delivery_zone",
  "inspection_zone",
  "member_group",
];

export const DEPENDENCY_RELATIONSHIPS = ["blocks", "depends_on", "relates_to"];
