/**
 * ZonePanel — extracted constants.
 *
 * Pure data tables and inline-style helpers used across the ZonePanel
 * tree (panel, tabs, modals, sub-components). No React, no hooks, no
 * mutable state — safe to import from anywhere.
 *
 * Each table mirrors the original inline definitions in ZonePanel.jsx
 * verbatim. Behavior must stay byte-identical to before extraction.
 */

export const mono    = { fontFamily: "var(--font-mono)" };
export const display = { fontFamily: "'Space Grotesk', var(--font-display)" };

export const STATUS_COLOR = {
  green:   "#22C55E",
  blue:    "#3B82F6",
  amber:   "#F59E0B",
  red:     "#EF4444",
  purple:  "#0d9488", /* legacy categorical key — renders teal (no-purple palette) */
  neutral: "#94A3B8",
};

// Which tabs to show + which linked record types fill each one.
export const TABS = [
  { id: "overview", label: "Overview",      types: null /* computed */ },
  { id: "deps",     label: "Dependencies",  types: null /* computed */ },
  { id: "rfi",      label: "RFIs",          types: ["rfi"] },
  { id: "wp",       label: "Work Packages", types: ["work_package"] },
  { id: "del",      label: "Deliveries",    types: ["delivery"] },
  { id: "photo",    label: "Photos / Docs", types: ["photo", "document", "submittal"] },
  { id: "activity", label: "Activity",      types: null /* computed */ },
];

// Color mapping for dependency relationship pills, mirroring the
// ZoneLayer arrow palette so the visual language stays consistent.
export const RELATIONSHIP_COLOR = {
  blocks:     "#EF4444",
  depends_on: "#F59E0B",
  relates_to: "#94A3B8",
};
export const RELATIONSHIP_LABEL = {
  blocks:     "Blocks",
  depends_on: "Depends on",
  relates_to: "Related",
};

// Linkable types the MVP picker can seed from. Each maps to an entity
// client + a label + the field used in the picker's search box.
export const PICKER_TYPES = [
  { key: "rfi",          label: "RFI",          entity: "RFI",          numberField: "rfi_number",  titleField: "subject" },
  { key: "work_package", label: "Work Package", entity: "WorkPackage",  numberField: "wp_number",   titleField: "name" },
  { key: "delivery",     label: "Delivery",     entity: "Delivery",     numberField: "delivery_number", titleField: "description" },
  { key: "change_order", label: "Change Order", entity: "ChangeOrder",  numberField: "co_number",   titleField: "title" },
  { key: "document",     label: "Document",     entity: "Document",     numberField: "document_number", titleField: "title" },
];

export const ACTIVITY_COLOR = {
  zone_created:       "#3B82F6",
  zone_renamed:       "#0d9488",
  status_changed:     "#F59E0B",
  zone_deleted:       "#EF4444",
  link_added:         "#22C55E",
  link_removed:       "#94A3B8",
  // V3.1 — zone-to-zone dependency edges. Color matches the canvas
  // arrow palette (blocks=red, depends_on=amber) at the strongest
  // semantic; the timeline dot stays a single color per event_type.
  dependency_added:   "#F59E0B",
  dependency_removed: "#94A3B8",
};

export const STATUS_DOT = {
  red: "#EF4444", amber: "#F59E0B", purple: "#0d9488",
  blue: "#3B82F6", green: "#22C55E", neutral: "#94A3B8",
};
